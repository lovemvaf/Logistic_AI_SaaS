'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
  EditorialSection,
  EmptyNote,
  StatusLabel,
} from 'ui-kit';
import {
  AIModel,
  AIAnalysis,
  initStore,
  fetchFromStoreOrAPI,
  getAll,
  isMockDataSource,
} from '@/lib/local-store';

export function AIInsightsPanel({ token }: { token: string | null }) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trainNotice, setTrainNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    const fetchData = async () => {
      setLoading(true);
      setLoadError(null);
      initStore();

      if (isMockDataSource) {
        if (!active) return;
        setAnalysis(getAll<AIAnalysis>('aiAnalysis') || null);
        const list = getAll<AIModel[]>('aiModels');
        setModels(Array.isArray(list) ? list : []);
        setLoading(false);
        return;
      }

      const [analysisResult, modelsResult] = await Promise.allSettled([
        api.post<AIAnalysis>('/ai/v1/analyze', {
          payload: { source: 'admin_dashboard', scope: 'platform_overview' },
        }),
        fetchFromStoreOrAPI<AIModel[]>('aiModels', '/ai/v1/models'),
      ]);

      if (!active) return;

      if (analysisResult.status === 'fulfilled') {
        setAnalysis(analysisResult.value?.data || null);
      } else {
        setAnalysis(null);
        setLoadError('AI analysis service did not return a response.');
      }

      if (modelsResult.status === 'fulfilled') {
        const data = modelsResult.value;
        setModels(Array.isArray(data) ? data : []);
      } else {
        setModels([]);
      }

      setLoading(false);
    };

    void fetchData();
    return () => {
      active = false;
    };
  }, [token]);

  const handleTrain = async (type: string) => {
    if (isMockDataSource) {
      setTrainNotice('Online training requires live API offline dataset export (GET /ai/v1/training-dataset).');
      return;
    }
    try {
      await api.post(`/ai/v1/train/${encodeURIComponent(type)}`, {
        tenant_id: '__system__',
        schema_name: 'tenant',
      });
      setTrainNotice(`Training request accepted for ${type}.`);
    } catch (error: any) {
      setTrainNotice(
        error?.response?.data?.message ||
          'Online training is not run inline; export curated feedbacks via GET /ai/v1/training-dataset.',
      );
    }
  };

  return (
    <div className="space-y-5">
      <EditorialSection
        eyebrow="AI core"
        title="Model hub"
        action={
          <StatusLabel tone={models.length > 0 ? 'success' : 'neutral'}>
            {models.length > 0 ? `${models.length} models` : 'Unavailable'}
          </StatusLabel>
        }
      >
        {trainNotice && (
          <div className="mb-3 rounded-md border border-line bg-surface-alt px-3 py-2 text-[11px] text-ink-soft">
            {trainNotice}
          </div>
        )}
        {loading ? (
          <p className="text-[12px] text-ink-faint">Loading models…</p>
        ) : models.length === 0 ? (
          <EmptyNote>No AI models found. The AI worker is not connected in this environment.</EmptyNote>
        ) : (
          <div>
            {models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between gap-3 border-b border-line/80 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">{model.name}</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    v{model.version} · <span className="capitalize">{model.type}</span>
                    {model.is_current ? ' · active' : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[12px] font-semibold tabular-nums text-ink">
                    {model.accuracy != null && Number.isFinite(model.accuracy)
                      ? `${(model.accuracy * 100).toFixed(1)}%`
                      : 'Unmeasured'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleTrain(model.type)}
                    className="h-8 rounded-md border border-line px-3 text-[11px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                  >
                    Retrain
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </EditorialSection>

      <EditorialSection
        eyebrow="Analysis"
        title="Executive summary"
        action={
          analysis?.method ? (
            <StatusLabel tone={analysis.fallback_used ? 'warning' : 'info'}>
              {analysis.fallback_used ? 'Heuristic fallback' : analysis.method}
            </StatusLabel>
          ) : undefined
        }
      >
        {loading ? (
          <p className="text-[12px] text-ink-faint">Loading analysis…</p>
        ) : !analysis ? (
          <EmptyNote>{loadError || 'No AI analysis available yet.'}</EmptyNote>
        ) : (
          <div className="space-y-4">
            <p className="text-[12px] leading-5 text-ink-soft">{analysis.summary}</p>

            {analysis.risks?.length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-danger">
                  Risks
                </p>
                <ul className="mt-2 space-y-1.5 border-l-2 border-danger/40 pl-3">
                  {analysis.risks.map((risk, index) => (
                    <li key={index} className="text-[12px] leading-5 text-ink-soft">
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.recommendations?.length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                  Recommendations
                </p>
                <ul className="mt-2 space-y-1.5 border-l-2 border-accent/40 pl-3">
                  {analysis.recommendations.map((recommendation, index) => (
                    <li key={index} className="text-[12px] leading-5 text-ink-soft">
                      {recommendation}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </EditorialSection>
    </div>
  );
}
