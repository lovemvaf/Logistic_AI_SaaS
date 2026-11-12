'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Button, DataState, Input } from 'ui-components';
import { DongNaiRouteMap, type DongNaiMapStop } from 'map-components';
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

function defaultProgressForStatus(status?: string): number {
  const st = String(status || '').toUpperCase();
  if (st === 'DELIVERED') return 100;
  if (st === 'OUT_FOR_DELIVERY') return 84;
  if (st === 'IN_TRANSIT') return 62;
  if (st === 'PACKED') return 42;
  if (st === 'IN_QUEUE' || st === 'PICKING') return 26;
  return 14;
}

function TrackContent({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cleanCode = useMemo(() => decodeURIComponent(code || '').trim(), [code]);
  const grantToken = searchParams.get('token')?.trim() || '';

  const [quickCode, setQuickCode] = useState(cleanCode);
  const [grantData, setGrantData] = useState<any>(null);
  const [grantGone, setGrantGone] = useState(false);

  const [order, setOrder] = useState<any>(null);
  const [live, setLive] = useState<any>(null);
  const [sla, setSla] = useState<any>(null);
  const [predict, setPredict] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setQuickCode(cleanCode);
  }, [cleanCode]);

  const fetchTrack = useCallback(async () => {
    if (!cleanCode && !grantToken) {
      setLoading(false);
      setNotFound(true);
      return;
    }

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

      const orderRow = await data.orders.byTrackingCode(cleanCode);
      if (!orderRow) {
        setNotFound(true);
      } else {
        setOrder(orderRow);
        try {
          setLive(await data.orders.live(cleanCode));
        } catch {
          // fallback handled cleanly below
        }
        try {
          setSla(await data.orders.sla(cleanCode));
        } catch {
          // optional SLA fallback
        }
        try {
          setPredict(await data.aiFeature.predictETA(cleanCode));
        } catch {
          // optional prediction
        }
      }
    } catch (err: any) {
      const httpStatus = err?.response?.status;
      if (httpStatus === 410) {
        setGrantGone(true);
        setError(
          err?.response?.data?.message ||
            'Liên kết chia sẻ đã bị thu hồi hoặc hết hạn (410 Gone).',
        );
      } else if (httpStatus === 404) {
        setNotFound(true);
      } else {
        setError(err?.response?.data?.message || err?.message || 'Không tra cứu được vận đơn.');
      }
    } finally {
      setLoading(false);
    }
  }, [cleanCode, grantToken]);

  useEffect(() => {
    void fetchTrack();
  }, [fetchTrack]);

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

  const timelineItems: any[] = useMemo(() => {
    if (!order) return [];
    if (Array.isArray(order.timeline) && order.timeline.length > 0) return order.timeline;
    if (Array.isArray(order.events) && order.events.length > 0) {
      return order.events.map((ev: any) => ({
        at: ev.timestamp || ev.createdAt,
        status: ev.status,
        label: ev.description || ev.status || 'Cập nhật trạng thái',
        actor: ev.location || 'Hệ thống',
      }));
    }
    return [];
  }, [order]);

  const publicWaypoints = useMemo(() => {
    if (Array.isArray(live?.waypoints) && live.waypoints.length >= 2) {
      return live.waypoints.map((w: any) => ({
        lat: Number(w.lat),
        lng: Number(w.lng),
        label: w.label || w.name || 'Điểm trung chuyển',
        eta: w.eta || undefined,
      }));
    }
    const pts: Array<{ lat: number; lng: number; label: string }> = [];
    const fromLat = Number(live?.from?.lat ?? 10.9415);
    const fromLng = Number(live?.from?.lng ?? 106.8908);
    pts.push({
      lat: Number.isFinite(fromLat) ? fromLat : 10.9415,
      lng: Number.isFinite(fromLng) ? fromLng : 106.8908,
      label: live?.from?.name || order?.originName || 'Kho ICD Tân Cảng Long Bình',
    });
    const curLat = Number(live?.currentPosition?.lat ?? live?.lat);
    const curLng = Number(live?.currentPosition?.lng ?? live?.lng);
    if (Number.isFinite(curLat) && Number.isFinite(curLng)) {
      pts.push({
        lat: curLat,
        lng: curLng,
        label: live?.currentPosition?.label || 'Trạm trung chuyển Đồng Nai',
      });
    }
    const toLat = Number(live?.to?.lat ?? 10.9478);
    const toLng = Number(live?.to?.lng ?? 106.8722);
    pts.push({
      lat: Number.isFinite(toLat) ? toLat : 10.9478,
      lng: Number.isFinite(toLng) ? toLng : 106.8722,
      label: live?.to?.name || order?.destName || order?.recipientAddress || 'Điểm giao Đồng Nai',
    });
    return pts;
  }, [live, order]);

  const publicStops: DongNaiMapStop[] = useMemo(() => {
    return publicWaypoints.map((w: any, idx: number) => ({
      id: `stop-${idx}`,
      name: w.label,
      locality: 'TP Đồng Nai',
      lat: w.lat,
      lng: w.lng,
      status:
        order?.status === 'DELIVERED'
          ? 'COMPLETED'
          : idx === 0
            ? 'COMPLETED'
            : idx === publicWaypoints.length - 1
              ? 'PENDING'
              : 'CURRENT',
      eta: w.eta || null,
      sequence: idx + 1,
    }));
  }, [publicWaypoints, order]);

  const grantWaypoints = useMemo(() => {
    if (!grantData || grantData.precision === 'STATUS_ONLY') return [];
    if (Array.isArray(grantData.waypoints) && grantData.waypoints.length >= 2) {
      return grantData.waypoints.map((w: any) => ({
        lat: Number(w.lat),
        lng: Number(w.lng),
        label: w.label || w.name || 'Điểm dừng',
      }));
    }
    if (Array.isArray(grantData.legs) && grantData.legs.length > 0) {
      const pts: Array<{ lat: number; lng: number; label: string }> = [];
      grantData.legs.forEach((leg: any) => {
        if (leg.originLat != null && leg.originLng != null) {
          pts.push({
            lat: Number(leg.originLat),
            lng: Number(leg.originLng),
            label: leg.originName || `Chặng ${leg.sequence}`,
          });
        }
        if (leg.destLat != null && leg.destLng != null) {
          pts.push({
            lat: Number(leg.destLat),
            lng: Number(leg.destLng),
            label: leg.destName || `Đích chặng ${leg.sequence}`,
          });
        }
      });
      return pts;
    }
    return [];
  }, [grantData]);

  const grantStops: DongNaiMapStop[] = useMemo(
    () =>
      grantWaypoints.map((w: any, idx: number) => ({
        id: `grant-stop-${idx}`,
        name: w.label,
        lat: w.lat,
        lng: w.lng,
        status: idx === 0 ? 'COMPLETED' : idx === grantWaypoints.length - 1 ? 'PENDING' : 'CURRENT',
        sequence: idx + 1,
      })),
    [grantWaypoints],
  );

  const effectiveProgress = Number.isFinite(Number(live?.progressPercent))
    ? Number(live.progressPercent)
    : defaultProgressForStatus(order?.status);

  const etaDisplay = live?.etaSimulatedAt || live?.eta || order?.estimatedAt || sla?.promisedAt;

  const handleQuickLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const target = quickCode.trim().toUpperCase();
    if (!target) return;
    router.push(`/track/${encodeURIComponent(target)}`);
  };

  return (
    <div className="min-h-[100dvh] bg-canvas px-4 py-6 font-sans text-ink sm:px-6">
      <div className="mx-auto max-w-[74rem]">
        <EditorialPageHeader
          eyebrow={
            <>
              <Link href="/" className="hover:text-accent">
                Tra cứu công khai
              </Link>
              <span className="text-line-strong" aria-hidden="true">/</span>
              <span>{grantToken ? 'Liên kết chia sẻ có kiểm soát (Grant)' : 'Hành trình Đồng Nai'}</span>
            </>
          }
          title={
            <span className="font-mono tracking-tight">{grantData?.trackingCode || cleanCode || '—'}</span>
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
                <>
                  <StatusLabel tone={statusTone}>{orderStatusLabel(order.status)}</StatusLabel>
                  <span className="text-[11px] text-ink-soft">
                    Tiến độ mô phỏng: <strong className="text-ink">{effectiveProgress}%</strong>
                  </span>
                </>
              ) : null}
              <p>Truy cập: {grantToken ? 'Scoped Grant' : 'Công khai'}</p>
            </div>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {!grantToken ? (
                <form onSubmit={handleQuickLookup} className="flex items-center gap-2">
                  <Input
                    aria-label="Tra cứu mã vận đơn khác"
                    placeholder="SLG-DEMO-DN3PL-0001"
                    value={quickCode}
                    onChange={(e) => setQuickCode(e.target.value)}
                    className="h-9 w-52 font-mono text-[12px]"
                  />
                  <Button type="submit" size="sm" variant="primary">
                    Tra cứu
                  </Button>
                </form>
              ) : null}
              <Link
                href="/"
                className="flex h-9 items-center rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
              >
                Trang tra cứu
              </Link>
            </div>
          }
        />

        {!grantToken ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-ink-faint">Chuyển nhanh mã mẫu:</span>
            {[
              { c: 'SLG-DEMO-DN3PL-0001', note: 'PENDING (Chờ đóng gói)' },
              { c: 'SLG-DEMO-DN3PL-0003', note: 'IN_TRANSIT (Đang giao)' },
              { c: 'SLG-DEMO-DN3PL-0004', note: 'DELIVERED (Đã giao)' },
            ].map((sample) => (
              <Link
                key={sample.c}
                href={`/track/${sample.c}`}
                className={`rounded border px-2 py-1 font-mono transition-colors ${
                  cleanCode.toUpperCase() === sample.c
                    ? 'border-accent bg-accent/10 font-semibold text-accent'
                    : 'border-line bg-surface text-ink-soft hover:border-accent hover:text-accent'
                }`}
              >
                {sample.c} · {sample.note}
              </Link>
            ))}
          </div>
        ) : null}

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
                {
                  label: 'Loại hồ sơ',
                  value: grantData.kind,
                  meta: grantData.shipmentNo || grantData.trackingCode,
                },
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
                  meta: grantData.containerNo
                    ? `Container ${grantData.containerNo}`
                    : 'Liên kết tạm thời',
                },
              ]}
            />

            {grantData.precision === 'STATUS_ONLY' ? (
              <DongNaiRouteMap
                title={`Bản đồ hành trình (${grantData.trackingCode})`}
                masked
                precisionLabel="STATUS_ONLY"
                height={220}
              />
            ) : (
              <DongNaiRouteMap
                title={`Tuyến vận tải mô phỏng Đồng Nai — ${grantData.trackingCode}`}
                subtitle={
                  grantData.originName && grantData.destName
                    ? `${grantData.originName} -> ${grantData.destName}`
                    : 'Theo dõi lộ trình Container / 3PL được chia sẻ theo Grant'
                }
                stops={grantStops}
                waypoints={grantWaypoints}
                currentPosition={
                  grantData.lat != null && grantData.lng != null
                    ? {
                        id: 'grant-current',
                        lat: Number(grantData.lat),
                        lng: Number(grantData.lng),
                        label: grantData.containerNo || grantData.trackingCode,
                        status: grantData.status,
                      }
                    : null
                }
                progressPercent={grantData.status === 'DELIVERED' ? 100 : 58}
                interactivePlayback
                isSimulatedRoute
                precisionLabel={grantData.precision}
                height={360}
              />
            )}

            {Array.isArray(grantData.legs) && grantData.legs.length > 0 ? (
              <EditorialSection eyebrow="Freight Legs" title="Các chặng vận chuyển container / 3PL">
                <div className="space-y-2">
                  {grantData.legs.map((leg: any) => (
                    <div
                      key={leg.sequence}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 py-2 text-[12px]"
                    >
                      <div>
                        <span className="font-mono font-medium text-ink">
                          Chặng #{leg.sequence} ({leg.legType})
                        </span>
                        <span className="ml-2 text-ink-soft">
                          {leg.originName} -&gt; {leg.destName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {grantData.precision !== 'STATUS_ONLY' &&
                        leg.originLat != null &&
                        leg.originLng != null ? (
                          <span className="font-mono text-[11px] text-ink-faint">
                            {leg.originLat}, {leg.originLng}
                          </span>
                        ) : null}
                        <StatusLabel tone={leg.status === 'COMPLETED' ? 'success' : 'info'}>
                          {leg.status}
                        </StatusLabel>
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
                      <p className="text-[12px] font-medium text-ink">
                        {ev.description || ev.status}
                      </p>
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
            emptyDescription={`Không có kiện hàng nào mang mã ${cleanCode}.`}
            retryLabel="Thử lại"
            onRetry={fetchTrack}
          >
            {order ? (
              <div className="mt-4 space-y-4">
                <MetricBand
                  metrics={[
                    {
                      label: 'Trạng thái',
                      value: (
                        <StatusLabel tone={statusTone}>
                          {orderStatusLabel(order.status)}
                        </StatusLabel>
                      ),
                      meta: live?.vehicleMasked ? `Xe: ${live.vehicleMasked}` : 'Cập nhật mới nhất',
                    },
                    {
                      label: 'Dự kiến giao (ETA)',
                      value: formatDateTimeVN(etaDisplay),
                      meta:
                        order.status === 'DELIVERED'
                          ? 'Đã giao hoàn tất'
                          : live?.isSimulatedRoute
                            ? 'ETA dự kiến tuyến Đồng Nai'
                            : 'Hẹn ban đầu',
                      tone: sla?.overtime ? 'danger' : undefined,
                    },
                    {
                      label: 'Người nhận',
                      value: order.recipientName || '—',
                      meta: `SĐT: ${order.recipientPhone ? maskPhone(order.recipientPhone) : 'Ẩn công khai'}`,
                    },
                    {
                      label: 'Tọa độ công khai',
                      value: live?.precision || 'CITY_WARD (~1.1km)',
                      meta:
                        live?.lat != null && live?.lng != null
                          ? `${live.lat}, ${live.lng} (làm tròn ~1.1km)`
                          : 'Làm tròn theo địa bàn Đồng Nai',
                    },
                  ]}
                />

                {/* Interactive Dong Nai Map with Vehicle Simulation */}
                <DongNaiRouteMap
                  title={`Bản đồ Hành trình Đồng Nai — ${order.trackingCode || cleanCode}`}
                  subtitle={
                    live?.from && live?.to
                      ? `${live.from.name} -> ${live.to.name}`
                      : `Khu vực đích: ${order.recipientAddress || 'TP Đồng Nai'}`
                  }
                  stops={publicStops}
                  waypoints={publicWaypoints}
                  currentPosition={
                    live?.currentPosition || {
                      id: order.id || cleanCode,
                      lat: live?.lat ?? publicWaypoints[0]?.lat ?? 10.9415,
                      lng: live?.lng ?? publicWaypoints[0]?.lng ?? 106.8908,
                      label: live?.vehicleMasked || 'Xe 60C-***01',
                      status: order.status,
                    }
                  }
                  progressPercent={effectiveProgress}
                  interactivePlayback
                  isSimulatedRoute={live?.isSimulatedRoute ?? true}
                  precisionLabel={live?.precision || 'CITY_WARD'}
                  height={380}
                />

                {/* Route Progress Bar + Origin/Destination */}
                <EditorialSection
                  eyebrow="Vận hành"
                  title="Tuyến vận tải & Tiến độ chặng"
                  action={
                    <StatusLabel tone={order.status === 'DELIVERED' ? 'success' : 'info'}>
                      {effectiveProgress}% chặng đường
                    </StatusLabel>
                  }
                >
                  <div className="mb-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-300"
                        style={{ width: `${Math.max(4, Math.min(100, effectiveProgress))}%` }}
                      />
                    </div>
                  </div>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                        Điểm đi
                      </dt>
                      <dd className="mt-0.5 text-[13px] font-medium text-ink">
                        {live?.from?.name || 'Kho ICD Tân Cảng Long Bình'}
                        <div className="text-[12px] font-normal text-ink-soft">
                          {live?.from?.address || 'Phường Long Bình, Thành phố Đồng Nai'}
                        </div>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                        Điểm đến
                      </dt>
                      <dd className="mt-0.5 text-[13px] font-medium text-ink">
                        {live?.to?.name || order.recipientName || 'Điểm giao nhận'}
                        <div className="text-[12px] font-normal text-ink-soft">
                          {live?.to?.address || order.recipientAddress || 'Thành phố Đồng Nai'}
                        </div>
                      </dd>
                    </div>
                  </dl>
                </EditorialSection>

                {sla ? (
                  <EditorialSection eyebrow="Cam kết" title="SLA giao hàng">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                          Hẹn ban đầu
                        </p>
                        <p className="mt-1 text-[13px] font-medium text-ink">
                          {formatDateTimeVN(sla.promisedAt || etaDisplay)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                          Giao thực tế / ETA mô phỏng
                        </p>
                        <p className="mt-1 text-[13px] font-medium text-ink">
                          {sla.actualAt || sla.deliveredAt
                            ? formatDateTimeVN(sla.actualAt || sla.deliveredAt)
                            : formatDateTimeVN(sla.etaSimulatedAt || etaDisplay)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                          Kết quả SLA
                        </p>
                        <p className="mt-1">
                          <StatusLabel
                            tone={sla.overtime || sla.onTrack === false ? 'danger' : 'success'}
                          >
                            {sla.overtime || sla.onTrack === false ? 'Quá hạn' : 'Đúng tiến độ'}
                          </StatusLabel>
                        </p>
                      </div>
                    </div>
                  </EditorialSection>
                ) : null}

                {order.status !== 'DELIVERED' && !['FAILED', 'CANCELLED'].includes(order.status) ? (
                  <EditorialSection eyebrow="Dự báo ETA" title="Dự kiến thời điểm giao hàng">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                          Khung giờ dự kiến
                        </p>
                        <p className="mt-1 text-[13px] text-ink">
                          {predict
                            ? `${formatDateTimeVN(predict.earliestAt)} — ${formatDateTimeVN(predict.latestAt)}`
                            : `Dự kiến trước ${formatDateTimeVN(etaDisplay)}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusLabel tone={predict ? (RISK_TONES[predict.delayRisk] ?? 'neutral') : 'info'}>
                          {predict ? `Rủi ro: ${predict.delayRisk}` : 'Tuyến ổn định'}
                        </StatusLabel>
                        <StatusLabel tone={predict ? (SLA_LABELTONE[predict.sla] ?? 'neutral') : 'success'}>
                          {predict ? orderForecastLabel(predict.sla) : 'Theo kế hoạch'}
                        </StatusLabel>
                      </div>
                    </div>
                  </EditorialSection>
                ) : null}

                <EditorialSection eyebrow="Lịch sử" title={`Nhật ký hành trình (${timelineItems.length})`}>
                  <DataState
                    loading={false}
                    empty={!timelineItems.length}
                    emptyTitle="Chưa có sự kiện"
                    emptyDescription="Mã vận đơn này chưa có ghi nhận nào."
                  >
                    <div className="space-y-3">
                      {timelineItems.map((event: any, index: number) => (
                        <div key={`${event.at}-${index}`} className="border-l-2 border-line-strong pl-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[12px] font-medium text-ink">{event.label}</p>
                            {event.status ? (
                              <StatusLabel tone={orderStatusTone(event.status)}>
                                {orderStatusLabel(event.status)}
                              </StatusLabel>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-ink-faint">
                            {formatDateTimeVN(event.at)} — {event.actor}
                          </p>
                        </div>
                      ))}
                    </div>
                  </DataState>
                </EditorialSection>
              </div>
            ) : null}
          </DataState>
        ) : null}
      </div>
    </div>
  );
}

export default function TrackPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-canvas p-6 text-[13px] text-ink-soft">
          Đang tải thông tin tra cứu...
        </div>
      }
    >
      <TrackContent code={code} />
      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? (
        <DemoControlCenter variant="floating" portalOverride="customer" />
      ) : null}
    </Suspense>
  );
}
