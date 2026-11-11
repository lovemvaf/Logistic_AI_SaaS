'use client';

import { useState, useEffect } from 'react';
import { Button, TableState } from 'ui-components';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import { formatDateTime, formatNumber } from '@/lib/format';
import api from '@/lib/api';
import {
  AIModel,
  fetchFromStoreOrAPI,
  initStore,
  isMockDataSource,
  update,
  remove,
} from '@/lib/local-store';

function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type } }));
}

export default function AIModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datasetNotice, setDatasetNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      initStore();
      const data = await fetchFromStoreOrAPI<AIModel[]>('aiModels', '/ai/v1/models');
      setModels(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load AI models');
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const activateModel = async (modelId: string) => {
    try {
      if (isMockDataSource) {
        models.forEach((m) => {
          update('aiModels', m.id, { is_current: m.id === modelId });
        });
      } else {
        await api.patch(`/ai/v1/models/${modelId}/activate`);
      }
      setModels((prev) => prev.map((m) => ({ ...m, is_current: m.id === modelId })));
      showToast('Model activated successfully.', 'success');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to activate model');
      void fetchModels();
    }
  };

  const retrainModel = async (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (!model) return;
    if (isMockDataSource) {
      const msg = `Online retraining is disabled for ${model.name}. Export curated human feedbacks via GET /ai/v1/training-dataset, train offline, and register verified weights.`;
      setDatasetNotice(msg);
      showToast(msg, 'info');
      return;
    }

    try {
      await api.post(`/ai/v1/train/${encodeURIComponent(model.type)}`, {
        tenant_id: '__system__',
        schema_name: 'tenant',
      });
      showToast(`Training job requested for ${model.name}.`, 'success');
      void fetchModels();
    } catch (err: any) {
      const serverMsg =
        err?.response?.data?.message ||
        'Online training runs offline via GET /ai/v1/training-dataset and POST /ai/v1/models.';
      setDatasetNotice(serverMsg);
      showToast(serverMsg, err?.response?.status === 501 ? 'warning' : 'error');
    }
  };

  const handleExportDataset = async () => {
    if (isMockDataSource) {
      setDatasetNotice('Training dataset export requires live API mode (GET /ai/v1/training-dataset).');
      return;
    }
    setExporting(true);
    setDatasetNotice(null);
    try {
      const res = await api.get('/ai/v1/training-dataset?limit=500');
      const payload = res.data;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartlogi-training-dataset-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${payload?.count ?? 0} curated feedback records.`, 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to export training dataset.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const deleteModel = async (modelId: string) => {
    try {
      if (isMockDataSource) {
        if (remove('aiModels', modelId)) {
          setModels((prev) => prev.filter((m) => m.id !== modelId));
          showToast('Model removed.', 'success');
        }
      } else {
        await api.delete(`/ai/v1/models/${modelId}`);
        setModels((prev) => prev.filter((m) => m.id !== modelId));
        showToast('Model removed.', 'success');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to remove model.', 'error');
    }
  };

  useEffect(() => {
    void fetchModels();
  }, []);

  const measuredAccuracies = models
    .map((m) => m.accuracy)
    .filter((acc): acc is number => typeof acc === 'number' && Number.isFinite(acc));
  const highestAccuracy = measuredAccuracies.length > 0 ? Math.max(...measuredAccuracies) : null;

  return (
    <div>
      <EditorialPageHeader
        eyebrow="AI & analytics"
        title="Model management"
        description="View, activate, export training datasets, and manage registered AI models."
        meta={
          <div className="text-[11px] leading-5">
            {models.length > 0 ? `${models.length} models registered` : 'No models registered'}
          </div>
        }
        actions={
          <div className="flex gap-2">
            {!isMockDataSource && (
              <Button variant="outline" size="sm" onClick={() => void handleExportDataset()} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export dataset'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void fetchModels()}>
              Refresh
            </Button>
          </div>
        }
      />

      {datasetNotice && (
        <div className="mb-4 rounded-md border border-line bg-surface-alt px-4 py-2.5 text-[12px] text-ink-soft">
          {datasetNotice}
        </div>
      )}

      <MetricBand
        metrics={[
          { label: 'Active models', value: formatNumber(models.filter((m) => m.is_current).length), meta: 'Currently deployed' },
          { label: 'Inactive models', value: formatNumber(models.filter((m) => !m.is_current).length), meta: 'Available to deploy' },
          {
            label: 'Highest accuracy',
            value: highestAccuracy !== null ? `${(highestAccuracy * 100).toFixed(1)}%` : 'Unmeasured',
            meta: highestAccuracy !== null ? 'Offline verified metric' : 'No evaluated weights yet',
          },
          { label: 'Trained recently', value: formatNumber(models.filter((m) => new Date(m.trained_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000).length), meta: 'Trained in the last 7 days' },
        ]}
      />

      <EditorialSection eyebrow="Models" title="All models">
        {/* Data table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">All registered AI models</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-8 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Name</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Version</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Type</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Accuracy</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Status</th>
                <th scope="col" className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Trained at</th>
                <th scope="col" className="h-8 pl-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Actions</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={loading}
                empty={!loading && models.length === 0}
                error={error ? new Error(error) : undefined}
                onRetry={() => void fetchModels()}
                colSpan={7}
                emptyTitle="No AI models found"
                emptyDescription="Models registered on the AI service will appear here."
              >
                {models.map((model) => (
                  <tr key={model.id} className="h-[42px] border-b border-line/80 transition-colors hover:bg-surface-alt/60">
                    <td className="pr-3 text-[12px] font-medium text-ink">{model.name}</td>
                    <td className="px-3 text-[12px] tabular-nums text-ink-soft">{model.version}</td>
                    <td className="px-3 text-[12px]">
                      <StatusLabel tone={model.type === 'demand' || model.type === 'anomaly' ? 'info' : model.type === 'churn' ? 'warning' : 'neutral'}>
                        {model.type ?? '—'}
                      </StatusLabel>
                    </td>
                    <td className="px-3 text-[12px] tabular-nums text-ink-soft">
                      {model.accuracy != null && Number.isFinite(model.accuracy) ? `${(model.accuracy * 100).toFixed(1)}%` : 'Unmeasured'}
                    </td>
                    <td className="px-3">
                      <StatusLabel tone={model.is_current ? 'success' : 'neutral'}>
                        {model.is_current ? 'Active' : 'Inactive'}
                      </StatusLabel>
                    </td>
                    <td className="px-3 text-[12px] tabular-nums text-ink-soft">
                      {model.trained_at ? formatDateTime(model.trained_at) : '—'}
                    </td>
                    <td className="pl-3 text-right">
                      <div className="flex justify-end gap-2">
                        {!model.is_current && (
                          <button
                            type="button"
                            onClick={() => activateModel(model.id)}
                            className="text-[11px] font-medium text-ink-soft underline decoration-ink-faint/30 underline-offset-2 hover:text-accent hover:decoration-accent"
                          >
                            Activate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => retrainModel(model.id)}
                          className="text-[11px] font-medium text-ink-soft underline decoration-ink-faint/30 underline-offset-2 hover:text-accent hover:decoration-accent"
                        >
                          Retrain
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteModel(model.id)}
                          className="text-[11px] font-medium text-ink-soft underline decoration-ink-faint/30 underline-offset-2 hover:text-danger hover:decoration-danger"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
        </div>
      </EditorialSection>
    </div>
  );
}
