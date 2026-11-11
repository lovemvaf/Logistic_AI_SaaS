'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState, Modal, Button, Input, Select } from 'ui-components';
import { data } from '@/lib/data';
import type { AiInsight } from '@/lib/mock';
import { insightStatusLabel, insightStatusTone } from '@/lib/labels';

const MODEL_LABELS: Record<AiInsight['model'], string> = {
  DEMAND_FORECAST: 'Dự báo nhu cầu',
  DELIVERY_ETA: 'ETA giao hàng',
  COST_ANOMALY: 'Bất thường chi phí',
  CHURN_RISK: 'Rủi ro rời bỏ',
  ROUTE_OPTIMIZER: 'Tối ưu tuyến',
};

const MODEL_TONES: Record<AiInsight['model'], 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  DEMAND_FORECAST: 'info',
  DELIVERY_ETA: 'info',
  COST_ANOMALY: 'warning',
  CHURN_RISK: 'danger',
  ROUTE_OPTIMIZER: 'neutral',
};

/** Entity reference dẫn về đúng phân hệ, ví dụ đơn hàng hoặc khách hàng. */
function entityTarget(row: AiInsight): { href: string; label: string } | null {
  const ref = row.entityRef;
  if (ref.startsWith('SLG-')) return { href: `/orders/${ref}`, label: `Đơn hàng ${ref}` };
  if (ref.startsWith('TRP-')) return { href: `/logistics/trips/${ref}`, label: `Chuyến ${ref}` };
  if (ref.startsWith('CLI-')) return { href: `/admin/clients/${ref}`, label: `Khách hàng ${ref}` };
  if (ref.startsWith('SKU-')) return { href: `/wms/products`, label: `Sản phẩm ${ref}` };
  return null;
}

export default function AiInsightsPage() {
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState<string>('');
  const [decideId, setDecideId] = useState<string | null>(null);
  const [decideStatus, setDecideStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const all = await data.aiInsights.list();
      setInsights(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được khuyến nghị AI.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = insights.filter((row) => {
    if (modelFilter && row.model !== modelFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      return row.title.toLowerCase().includes(term) || row.detail.toLowerCase().includes(term);
    }
    return true;
  });

  const newCount = insights.filter((row) => row.status === 'NEW').length;
  const avgConfidence = insights.length === 0 ? 0 : insights.reduce((sum, row) => sum + row.confidence, 0) / insights.length;
  const accounts = insights.filter((row) => row.status === 'ACTIONED').length;

  const modelCount = (model: AiInsight['model']) => insights.filter((row) => row.model === model).length;

  const handleDecide = async () => {
    if (!decideId) return;
    setSaving(true);
    setActionError('');
    try {
      await data.aiInsights.decide(decideId, decideStatus as AiInsight['status']);
      setDecideId(null);
      setDecideStatus('');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Không xử lý được khuyến nghị.');
    } finally {
      setSaving(false);
    }
  };

  const openDecide = (row: AiInsight) => {
    setDecideId(row.id);
    setDecideStatus(row.status);
    setActionError('');
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Quản trị"
        title="Khuyến nghị AI"
        description="Các gợi ý tự động từ mô hình vận hành: dự báo, ETA, chi phí, rủi ro rời bỏ và tối ưu tuyến."
      />

      {error ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
          <StatusLabel tone="danger">Lỗi dữ liệu</StatusLabel>
          <span className="text-[12px] text-ink-soft">{error}</span>
          <button type="button" onClick={load} className="ml-auto text-[11px] font-medium text-accent hover:underline">
            Thử lại
          </button>
        </div>
      ) : null}

      <MetricBand
        metrics={[
          {
            label: 'Khuyến nghị mới',
            value: String(newCount),
            meta: `${insights.length} khuyến nghị đã gửi`,
          },
          {
            label: 'Độ tin cậy trung bình',
            value: `${Math.round(avgConfidence * 100)}%`,
            meta: 'Tỷ lệ mô hình đánh giá',
          },
          {
            label: 'Đã xử lý',
            value: String(accounts),
            meta: 'Đã hành động',
          },
          {
            label: 'Bỏ qua',
            value: String(insights.filter((row) => row.status === 'DISMISSED').length),
            meta: 'Không cần hành động',
          },
        ]}
      />

      <EditorialSection title="Khuyến nghị" eyebrow="Danh mục" action={
        <div className="flex items-center gap-2">
          <select
            aria-label="Lọc mô hình"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="h-8 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
          >
            <option value="">Tất cả</option>
            {Object.entries(MODEL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Tìm nội dung..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong focus:border-accent"
          />
        </div>
      }>
        <div className="rounded-xl border border-line bg-canvas">
          <div className="overflow-x-auto">
            <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Mô hình
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Tiêu đề
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Chỉ số
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Tin cậy
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Thực thể
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Trạng thái
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  loading={loading}
                  empty={!loading && visible.length === 0}
                  error={error ? new Error(error) : undefined}
                  onRetry={load}
                  colSpan={7}
                  emptyTitle="Chưa có khuyến nghị AI nào"
                  emptyDescription="Khuyến nghị sẽ hiển thị nơi đây khi có dữ liệu."
                >
                  {visible.map((row) => (
                    <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                      <td className="px-4 py-2">
                        <StatusLabel tone={MODEL_TONES[row.model]}>
                          {MODEL_LABELS[row.model]}
                        </StatusLabel>
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-[12px] font-medium text-ink">{row.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-soft">{row.detail}</p>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="text-right">
                          <span className="tabular-nums text-[11px] text-ink-faint">{row.metricLabel}</span>
                          <p className="text-[12px] font-medium text-ink">{row.metricValue}</p>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="h-1.5 w-16 rounded-full bg-line">
                            <div
                              className="h-1.5 rounded-full bg-accent"
                              style={{ width: `${Math.round(row.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-[10px] text-ink-faint">{Math.round(row.confidence * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {(() => {
                          const target = entityTarget(row);
                          return target ? (
                            <Link href={target.href} className="text-[11px] font-medium text-accent hover:underline">
                              {target.label}
                            </Link>
                          ) : (
                            <span className="text-[11px] text-ink-faint">{row.entityRef}</span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        <StatusLabel tone={insightStatusTone(row.status)}>
                          {insightStatusLabel(row.status)}
                        </StatusLabel>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          {row.status === 'NEW' || row.status === 'ACKNOWLEDGED' ? (
                            <button
                              type="button"
                              onClick={() => openDecide(row)}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              Xử lý
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableState>
              </tbody>
            </table>
          </div>
        </div>
      </EditorialSection>

      <Modal
        isOpen={decideId !== null}
        onClose={() => setDecideId(null)}
        title="Xử lý khuyến nghị"
        size="sm"
      >
        {decideId ? (
          <form onSubmit={(e) => { e.preventDefault(); handleDecide(); }}>
            <div className="mb-4">
              <p className="text-[12px] text-ink-soft">
                {insights.find((row) => row.id === decideId)?.title}
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">
                Đánh dấu trạng thái cho khuyến nghị này. Những khuyến nghị đã xử lý không thể đổi lại.
              </p>
            </div>
            <div className="mb-4">
              <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="decide-status">
                Trạng thái
              </label>
              <Select
                id="decide-status"
                required
                value={decideStatus}
                onChange={(e) => setDecideStatus(e.target.value)}
                options={[
                  { value: 'ACKNOWLEDGED', label: 'Ghi nhận' },
                  { value: 'ACTIONED', label: 'Đã xử lý' },
                  { value: 'DISMISSED', label: 'Bỏ qua' },
                ]}
              />
            </div>
            {actionError ? (
              <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDecideId(null)}>
                Bỏ qua
              </Button>
              <Button type="submit" isLoading={saving} disabled={saving}>
                Xác nhận
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
