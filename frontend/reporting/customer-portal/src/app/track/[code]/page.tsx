'use client';

import { Suspense, useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { data, isMockDataSource } from '@/lib/data';
import {
  DemoControlCenter,
  EditorialPageHeader,
  EditorialSection,
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
  const digits = String(phone || '').replace(/\s+/g, '');
  if (digits.length < 4) return '—';
  return `${digits.slice(0, -3)}***`;
}

function TrackContent({ code }: { code: string }) {
  const searchParams = useSearchParams();
  const grantToken = searchParams.get('token')?.trim() || '';

  const [grantData, setGrantData] = useState<any>(null);
  const [grantGone, setGrantGone] = useState(false);

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
    setGrantData(null);
    setGrantGone(false);
    setOrder(null);
    setLive(null);
    setSla(null);
    setPredict(null);
    setNotFound(false);

    try {
      if (grantToken && !isMockDataSource) {
        const res = await api.get(`/public/t/${encodeURIComponent(grantToken)}`);
        const payload = res?.data ?? res;
        if (!payload) {
          setNotFound(true);
        } else {
          setGrantData(payload);
        }
        return;
      }

      const orderRow = await data.orders.byTrackingCode(code);
      if (!orderRow) {
        setNotFound(true);
      } else {
        setOrder(orderRow);
        try {
          setLive(await data.orders.live(code));
        } catch {}
        try {
          setSla(await data.orders.sla(code));
        } catch {}
        try {
          setPredict(await data.aiFeature.predictETA(code));
        } catch {}
      }
    } catch (err: any) {
      const httpStatus = err?.response?.status;
      if (httpStatus === 410) {
        setGrantGone(true);
        setError(err?.response?.data?.message || 'Liên kết chia sẻ đã bị thu hồi hoặc hết hạn (410 Gone).');
      } else if (httpStatus === 404) {
        setNotFound(true);
      } else {
        setError(err?.response?.data?.message || err?.message || 'Không tra cứu được vận đơn.');
      }
    } finally {
      setLoading(false);
    }
  }, [code, grantToken]);

  useEffect(() => {
    if (code) void fetchTrack();
  }, [code, fetchTrack]);

  const statusTone = order ? orderStatusTone(order.status) : undefined;

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

  const orderForecastLabel = (slaStatus: string) => SLA_LABELS[slaStatus] ?? slaStatus;

  const timelineItems: any[] = order
    ? Array.isArray(order.timeline)
      ? order.timeline
      : Array.isArray(order.events)
        ? order.events.map((ev: any) => ({
            at: ev.timestamp || ev.createdAt,
            label: ev.description || ev.status || 'Cập nhật trạng thái',
            actor: ev.location || 'Hệ thống',
          }))
        : []
    : [];

  return (
    <div className="min-h-[100dvh] bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto max-w-[72rem]">
        <EditorialPageHeader
          eyebrow={
            <>
              <span>Khách hàng</span>
              <span className="text-line-strong" aria-hidden="true">/</span>
              <span>{grantToken ? 'Liên kết chia sẻ có kiểm soát (Grant)' : 'Tra cứu công khai'}</span>
            </>
          }
          title={
            <span className="font-mono tracking-tight">{grantData?.trackingCode || code || '—'}</span>
          }
          description="Tra cứu công khai, không cần đăng nhập. Giá trị COD, tên người gửi và thông tin nội bộ được ẩn hoặc làm tròn theo phân quyền Grant."
          meta={
            <div className="flex flex-wrap items-center gap-3">
              {grantData ? (
                <>
                  <StatusLabel tone="info">Precision: {grantData.precision}</StatusLabel>
                  <StatusLabel tone="success">{grantData.status}</StatusLabel>
                </>
              ) : order ? (
                <StatusLabel tone={statusTone}>{orderStatusLabel(order.status)}</StatusLabel>
              ) : null}
              <p>Truy cập: {grantToken ? 'Scoped Grant' : 'Công khai'}</p>
            </div>
          }
          actions={
            <Link
              href="/"
              className="flex h-9 items-center rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
            >
              Tra cứu khác
            </Link>
          }
        />

        {grantGone ? (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/5 p-4 text-[13px] text-ink">
            <p className="font-semibold text-danger">Liên kết chia sẻ không còn hiệu lực (410 Gone)</p>
            <p className="mt-1 text-ink-soft">{error}</p>
          </div>
        ) : null}

        {error && !grantGone ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
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

        {grantData ? (
          <div className="mt-4 space-y-4">
            <MetricBand
              metrics={[
                { label: 'Loại hồ sơ', value: grantData.kind, meta: grantData.shipmentNo || grantData.trackingCode },
                { label: 'Trạng thái', value: grantData.status, tone: 'success' },
                {
                  label: 'Phạm vi tọa độ',
                  value: grantData.precision,
                  meta:
                    grantData.lat != null && grantData.lng != null
                      ? `${grantData.lat}, ${grantData.lng}`
                      : 'Không hiển thị tọa độ chi tiết',
                },
                {
                  label: 'Hết hạn Grant',
                  value: formatDateTimeVN(grantData.expiresAt),
                  meta: grantData.containerNo ? `Container ${grantData.containerNo}` : 'Liên kết tạm thời',
                },
              ]}
            />

            {Array.isArray(grantData.legs) && grantData.legs.length > 0 ? (
              <EditorialSection eyebrow="Freight Legs" title="Các chặng vận chuyển container / 3PL">
                <div className="space-y-2">
                  {grantData.legs.map((leg: any) => (
                    <div key={leg.sequence} className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 py-2 text-[12px]">
                      <div>
                        <span className="font-mono font-medium text-ink">Chặng #{leg.sequence} ({leg.legType})</span>
                        <span className="ml-2 text-ink-soft">{leg.originName} -&gt; {leg.destName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {leg.originLat != null && leg.originLng != null ? (
                          <span className="font-mono text-[11px] text-ink-faint">
                            {leg.originLat}, {leg.originLng}
                          </span>
                        ) : null}
                        <StatusLabel tone={leg.status === 'COMPLETED' ? 'success' : 'info'}>{leg.status}</StatusLabel>
                      </div>
                    </div>
                  ))}
                </div>
              </EditorialSection>
            ) : null}

            {Array.isArray(grantData.events) && grantData.events.length > 0 ? (
              <EditorialSection eyebrow="Sự kiện" title="Nhật ký theo dõi được chia sẻ">
                <div className="space-y-3">
                  {grantData.events.map((ev: any, idx: number) => (
                    <div key={ev.id || idx} className="border-l-2 border-line-strong pl-3">
                      <p className="text-[12px] font-medium text-ink">{ev.description || ev.status}</p>
                      <p className="text-[11px] text-ink-faint">
                        {formatDateTimeVN(ev.timestamp || ev.createdAt)} — {ev.location || 'Hệ thống'}
                      </p>
                    </div>
                  ))}
                </div>
              </EditorialSection>
            ) : null}
          </div>
        ) : !grantGone ? (
          <DataState
            loading={loading}
            empty={notFound}
            error={error || undefined}
            emptyTitle="Không tìm thấy mã vận đơn"
            emptyDescription={`Không có kiện hàng nào mang mã ${code}.`}
            retryLabel="Thử lại"
            onRetry={fetchTrack}
          >
            <div className="mt-4 space-y-4">
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
                    value: order ? formatDateTimeVN(order.estimatedAt || live?.eta) : '—',
                    meta: order?.status === 'DELIVERED' ? 'Đã giao hoàn tất' : 'Hẹn ban đầu',
                    tone: sla?.overtime ? 'danger' : undefined,
                  },
                  {
                    label: 'Người nhận',
                    value: order ? order.recipientName : '—',
                    meta: `SĐT: ${order?.recipientPhone ? maskPhone(order.recipientPhone) : 'Ẩn công khai'}`,
                  },
                  {
                    label: 'Tọa độ công khai',
                    value: live?.precision || 'COARSE_PUBLIC',
                    meta:
                      live?.lat != null && live?.lng != null
                        ? `${live.lat}, ${live.lng} (làm tròn ~1.1km)`
                        : 'Ẩn trong chế độ công khai',
                  },
                ]}
              />

              {live && live.from && live.to ? (
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
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Điểm đi</dt>
                      <dd className="mt-0.5 text-[13px] text-ink">
                        {live.from.name}
                        <div className="text-[12px] text-ink-soft">{live.from.address}</div>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Điểm đến</dt>
                      <dd className="mt-0.5 text-[13px] text-ink">
                        {live.to.name}
                        <div className="text-[12px] text-ink-soft">{live.to.address}</div>
                      </dd>
                    </div>
                  </dl>
                </EditorialSection>
              ) : null}

              {sla ? (
                <EditorialSection eyebrow="Cam kết" title="SLA giao hàng">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Hẹn ban đầu</p>
                      <p className="mt-1 text-[13px] font-medium text-ink">{formatDateTimeVN(sla.promisedAt)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Giao thực tế</p>
                      <p className="mt-1 text-[13px] font-medium text-ink">
                        {sla.actualAt || sla.deliveredAt ? formatDateTimeVN(sla.actualAt || sla.deliveredAt) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Kết quả</p>
                      <p className="mt-1">
                        <StatusLabel tone={sla.overtime || sla.onTrack === false ? 'danger' : 'success'}>
                          {sla.overtime || sla.onTrack === false ? 'Quá hạn' : 'Đạt'}
                        </StatusLabel>
                      </p>
                    </div>
                  </div>
                </EditorialSection>
              ) : null}

              {predict && order?.status !== 'DELIVERED' && !['FAILED', 'CANCELLED'].includes(order.status) ? (
                <EditorialSection eyebrow="Dự báo" title="Dự kiến giao hàng">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Khoảng dự kiến</p>
                      <p className="mt-1 text-[13px] text-ink">
                        {formatDateTimeVN(predict.earliestAt)} — {formatDateTimeVN(predict.latestAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusLabel tone={RISK_TONES[predict.delayRisk] ?? 'neutral'}>
                        {predict.delayRisk ?? '—'}
                      </StatusLabel>
                      <StatusLabel tone={SLA_LABELTONE[predict.sla] ?? 'neutral'}>
                        {orderForecastLabel(predict.sla)}
                      </StatusLabel>
                    </div>
                  </div>
                </EditorialSection>
              ) : null}

              {order ? (
                <EditorialSection eyebrow="Lịch sử" title="Nhật ký trạng thái">
                  <DataState
                    loading={false}
                    empty={!timelineItems.length}
                    emptyTitle="Chưa có sự kiện"
                    emptyDescription="Mã vận đơn này chưa có ghi nhận nào."
                  >
                    <div className="space-y-3">
                      {timelineItems.map((event: any, index: number) => (
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
        ) : null}
      </div>
    </div>
  );
}

export default function TrackPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas p-6 text-[13px] text-ink-soft">Đang tải thông tin tra cứu...</div>}>
      <TrackContent code={code} />
      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? (
        <DemoControlCenter variant="floating" portalOverride="customer" />
      ) : null}
    </Suspense>
  );
}
