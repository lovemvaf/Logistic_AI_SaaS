'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
  type StatusTone,
} from 'ui-kit';
import { DataState } from 'ui-components';
import {
  orderStatusTone,
  orderStatusLabel,
  formatDateTimeVN,
} from '@/lib/labels';

/** Mã vận đơn công khai: che tên người gửi, che 3 số cuối SĐT, không hiển thị COD. */
function maskPhone(phone: string) {
  const digits = phone.replace(/\s+/g, '');
  if (digits.length < 4) return '—';
  return `${digits.slice(0, -3)}***`;
}

export default function TrackPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);

  const [order, setOrder] = useState<any>(null);
  const [live, setLive] = useState<any>(null);
  const [sla, setSla] = useState<any>(null);
  const [predict, setPredict] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const fetchTrack = useCallback(async () => {
    setLoading(true);
    setError('');
    setOrder(null);
    setLive(null);
    setSla(null);
    setPredict(null);
    setNotFound(false);

    try {
      const orderRow = await data.orders.byTrackingCode(code);
      if (!orderRow) {
        setNotFound(true);
      } else {
        setOrder(orderRow);
        setLive(await data.orders.live(code));
        setSla(await data.orders.sla(code));
        setPredict(await data.aiFeature.predictETA(code));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (code) void fetchTrack();
  }, [code, fetchTrack]);

  const statusTone = order ? orderStatusTone(order.status) : undefined;

  /** Nhãn thật của các trạng thái trung gian, màu sắc và đoạn status đồng bộ. */
  const RISK_TONES: Record<string, StatusTone> = {
    none: 'neutral',
    low: 'info',
    medium: 'warning',
    high: 'danger',
  };

  const SLA_LABELS: Record<string, string> = {
    delivered: 'Đã giao',
    late: 'Chậm',
    'at-risk': 'Có nguy cơ chậm',
    planned: 'Theo kế hoạch',
  };

  const SLA_LABELTONE: Record<string, StatusTone> = {
    delivered: 'success',
    late: 'danger',
    'at-risk': 'warning',
    planned: 'info',
  };

  const orderForecastLabel = (sla: string) => SLA_LABELS[sla] ?? sla;

  return (
    <div className="min-h-[100dvh] bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto max-w-[72rem]">
        <EditorialPageHeader
          eyebrow={
            <>
              <span>Khách hàng</span>
              <span className="text-line-strong" aria-hidden="true">/</span>
              <span>Tra cứu công khai</span>
            </>
          }
          title={
            <span className="font-mono tracking-tight">{code || '—'}</span>
          }
          description="Tra cứu công khai, không cần đăng nhập. Giá trị COD, tên người gửi và thông tin nội bộ không hiển thị."
          meta={
            <div className="flex flex-wrap items-center gap-4">
              {order ? (
                <StatusLabel tone={statusTone}>{orderStatusLabel(order.status)}</StatusLabel>
              ) : null}
              <p>Truy cập: công khai</p>
            </div>
          }
          actions={
            <Link
              href="/"
              className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
            >
              Tra cứu khác
            </Link>
          }
        />

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchTrack}
              className="font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
            >
              Thử lại
            </button>
          </div>
        ) : null}

        <DataState
          loading={loading}
          empty={notFound}
          error={error || undefined}
          emptyTitle="Không tìm thấy mã vận đơn"
          emptyDescription={`Không có kiện hàng nào mang mã ${code}.`}
          retryLabel="Thử lại"
          onRetry={fetchTrack}
        >
          <div className="space-y-4">
            <MetricBand
              metrics={[
                {
                  label: 'Trạng thái',
                  value: order ? (
                    <StatusLabel tone={statusTone}>
                      {orderStatusLabel(order.status)}
                    </StatusLabel>
                  ) : (
                    '—'
                  ),
                  meta: 'Cập nhật lần cuối',
                },
                {
                  label: 'Dự kiến giao',
                  value: order ? formatDateTimeVN(order.estimatedAt) : '—',
                  meta: order?.status === 'DELIVERED' ? 'Đã giao trước giờ hẹn' : 'Hẹn ban đầu',
                  tone: sla?.overtime ? 'danger' : undefined,
                },
                {
                  label: 'Người nhận',
                  value: order ? order.recipientName : '—',
                  meta: `SĐT: ${order ? maskPhone(order.recipientPhone) : '—'}`,
                },
                {
                  label: 'Người gửi',
                  value: order ? (order.senderName ? 'Kho trung chuyển' : '—') : '—',
                  meta: 'Ẩn trong chế độ công khai',
                },
              ]}
            />

            {live ? (
              <EditorialSection
                eyebrow="Vận hành"
                title="Theo dõi xe"
                action={
                  <StatusLabel tone={order?.status === 'DELIVERED' ? 'success' : 'info'}>
                    {order?.status === 'DELIVERED' ? 'Đã hoàn tất' : 'Đang vận chuyển'}
                  </StatusLabel>
                }
              >
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Điểm đi
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-ink">
                      {live.from.name}
                      <div className="text-[12px] text-ink-soft">{live.from.address}</div>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Điểm đến
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-ink">
                      {live.to.name}
                      <div className="text-[12px] text-ink-soft">{live.to.address}</div>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Vị trí xe gần nhất
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-ink">
                      {live.current.name}
                      <div className="text-[12px] text-ink-soft">{live.current.address}</div>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Tài xế
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-ink">
                      {live.driverName || 'Chưa phân bổ'}
                    </dd>
                  </div>
                  {live.nextStop ? (
                    <>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                          Điểm dừng kế tiếp
                        </dt>
                        <dd className="mt-0.5 text-[13px] text-ink">
                          {live.nextStop.name}
                          <div className="text-[12px] text-ink-soft">{live.nextStop.address}</div>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                          ETA
                        </dt>
                        <dd className="mt-0.5 text-[13px] tabular-nums text-ink">
                          {formatDateTimeVN(live.nextStop.eta)}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              </EditorialSection>
            ) : null}

            {sla ? (
              <EditorialSection eyebrow="Cam kết" title="SLA giao hàng">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Hẹn ban đầu
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-ink">
                      {formatDateTimeVN(sla.promisedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Giao thực tế
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-ink">
                      {sla.actualAt ? formatDateTimeVN(sla.actualAt) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Kết quả
                    </p>
                    <p className="mt-1">
                      <StatusLabel tone={sla.overtime ? 'danger' : 'success'}>
                        {sla.overtime ? 'Quá hạn' : 'Đạt'}
                      </StatusLabel>
                    </p>
                  </div>
                </div>
                {sla.reason ? (
                  <p className="mt-3 text-[12px] text-ink-soft">Lý do: {sla.reason}</p>
                ) : null}
              </EditorialSection>
            ) : null}

            {predict && order?.status !== 'DELIVERED' && !['FAILED', 'CANCELLED'].includes(order.status) ? (
              <EditorialSection eyebrow="Dự báo" title="Dự kiến giao hàng">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Khoảng dự kiến
                    </p>
                    <p className="mt-1 text-[13px] text-ink">
                      {formatDateTimeVN(predict.earliestAt)} — {formatDateTimeVN(predict.latestAt)}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-soft">
                      Trung bình: {formatDateTimeVN(predict.normalAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusLabel tone={RISK_TONES[predict.delayRisk] ?? 'neutral'}>
                      {predict.delayRisk ?? '—'}
                    </StatusLabel>
                    <StatusLabel tone={SLA_LABELTONE[predict.sla] ?? 'neutral'}>
                      {SLA_LABELS[predict.sla] ?? predict.sla}
                    </StatusLabel>
                    <p className="text-[12px] text-ink-soft">{predict.confidence}% tin cậy</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Dự báo lúc
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-ink">{formatDateTimeVN(predict.predictedAt)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Kỷ lục dịch vụ
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-ink">{orderForecastLabel(predict.sla)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Trạng thái
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-ink">{orderStatusLabel(order.status)}</p>
                  </div>
                </div>
                {predict.steps ? (
                  <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                    {predict.steps.map((step: any) => (
                      <div
                        key={step.at}
                        className="flex items-center justify-between border-t border-line/80 py-2"
                      >
                        <dt className="text-[11px] text-ink-soft">{step.label}</dt>
                        <dd className="text-[12px] text-ink tabular-nums">{formatDateTimeVN(step.at)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </EditorialSection>
            ) : null}

            {order ? (
              <EditorialSection eyebrow="Lịch sử" title="Nhật ký trạng thái">
                <DataState
                  loading={false}
                  empty={!order.timeline.length}
                  emptyTitle="Chưa có sự kiện"
                  emptyDescription="Mã vận đơn này chưa có ghi nhận nào."
                >
                  <div className="space-y-3">
                    {order.timeline.map((event: any, index: number) => (
                      <div key={`${event.at}-${index}`} className="border-l-2 border-line-strong pl-3">
                        <p className="text-[12px] font-medium text-ink">{event.label}</p>
                        <p className="text-[11px] text-ink-faint">
                          {formatDateTimeVN(event.at)} — {event.actor}
                        </p>
                      </div>
                    ))}
                  </div>
                </DataState>
              </EditorialSection>
            ) : null}
          </div>
        </DataState>
      </div>
    </div>
  );
}
