'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import { Button, Modal } from 'ui-components';

type DeliveryItem = {
  id: string;
  trackingCode?: string;
  deliveryAddress: string;
  status: string;
  codAmountExpected: number;
  codAmountCollected: number;
  syncVersion?: number;
};

type TripItem = {
  id: string;
  code: string;
  tripCode: string;
  status: string;
  driverName?: string;
  vehiclePlate?: string;
  estimatedDistanceKm?: number;
  deliveries: DeliveryItem[];
};

const DONG_NAI_WAYPOINTS = [
  { id: 'wp-1', label: 'ICD Long Bình', lat: 10.9415, lng: 106.8908, x: 45, y: 26 },
  { id: 'wp-2', label: 'KCN Amata', lat: 10.9478, lng: 106.8722, x: 34, y: 30 },
  { id: 'wp-3', label: 'Ngã tư Vũng Tàu', lat: 10.9038, lng: 106.8475, x: 24, y: 46 },
  { id: 'wp-4', label: 'Nút giao Long Thành', lat: 10.7795, lng: 106.9531, x: 64, y: 60 },
  { id: 'wp-5', label: 'KCN Nhơn Trạch III', lat: 10.7421, lng: 106.9068, x: 48, y: 74 },
  { id: 'wp-6', label: 'Cảng Phước An', lat: 10.6789, lng: 106.9245, x: 56, y: 90 },
  { id: 'wp-7', label: 'Cảng Cát Lái', lat: 10.7611, lng: 106.7972, x: 14, y: 72 },
];

type OfflinePoint = {
  lat: number;
  lng: number;
  speedKmh: number;
  label: string;
  timestamp: string;
  isOfflineCached: boolean;
};

export default function DriverSimulatorPage() {
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [wallet, setWallet] = useState<any>(null);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [sosList, setSosList] = useState<any[]>([]);
  const [wpIndex, setWpIndex] = useState(0);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflinePoint[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>('');
  const [codInput, setCodInput] = useState('0');
  const [podStatus, setPodStatus] = useState('DELIVERED');
  const [sosMsg, setSosMsg] = useState('Cảnh báo sự cố kỹ thuật / kẹt xe nút giao QL51');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [conflictModal, setConflictModal] = useState<{
    open: boolean;
    deliveryId: string;
    serverVersion: number;
    serverStatus: string;
    message: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasSigned, setHasSigned] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [tRes, wRes, gRes, sRes] = await Promise.all([
        api.get('/mobile/trips'),
        api.get('/mobile/wallet'),
        api.get('/logistics/geofences'),
        api.get('/logistics/sos'),
      ]);
      const tripList: TripItem[] = Array.isArray(tRes.data?.data) ? tRes.data.data : [];
      setTrips(tripList);
      setWallet(wRes.data || null);
      setGeofences(Array.isArray(gRes.data?.data) ? gRes.data.data : []);
      setSosList(Array.isArray(sRes.data?.data) ? sRes.data.data : []);

      if (tripList.length > 0 && !selectedTripId) {
        setSelectedTripId(tripList[0].id);
        const firstDel = tripList[0].deliveries?.[0];
        if (firstDel) {
          setSelectedDeliveryId(firstDel.id);
          setCodInput(String(firstDel.codAmountExpected || 0));
        }
      }
    } catch (err: any) {
      setNotice({
        tone: 'err',
        text: err?.response?.data?.message || 'Không tải được dữ liệu Driver Simulator.',
      });
    }
  }, [selectedTripId]);

  useEffect(() => {
    void loadAll();
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('smartlogi_driver_offline_queue');
        if (saved) setOfflineQueue(JSON.parse(saved));
      } catch {}
    }
  }, [loadAll]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('smartlogi_driver_offline_queue', JSON.stringify(offlineQueue));
    }
  }, [offlineQueue]);

  const currentTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) || trips[0] || null,
    [trips, selectedTripId],
  );

  const currentDelivery = useMemo(
    () =>
      currentTrip?.deliveries?.find((d) => d.id === selectedDeliveryId) ||
      currentTrip?.deliveries?.[0] ||
      null,
    [currentTrip, selectedDeliveryId],
  );

  const currentWp = DONG_NAI_WAYPOINTS[wpIndex % DONG_NAI_WAYPOINTS.length];

  const handleTripAction = async (action: 'start' | 'complete') => {
    if (!currentTrip) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.post(`/logistics/trips/${currentTrip.id}/${action}`, {});
      setNotice({
        tone: 'ok',
        text:
          action === 'start'
            ? `Đã bắt đầu chuyến ${currentTrip.tripCode}.`
            : `Đã hoàn tất chuyến ${currentTrip.tripCode} và cập nhật giờ về bãi.`,
      });
      await loadAll();
    } catch (err: any) {
      setNotice({
        tone: 'err',
        text: err?.response?.data?.message || 'Không cập nhật được trạng thái chuyến.',
      });
    } finally {
      setBusy(false);
    }
  };

  const pushOrQueueGps = async (targetIdx?: number) => {
    const idx = targetIdx !== undefined ? targetIdx : (wpIndex + 1) % DONG_NAI_WAYPOINTS.length;
    setWpIndex(idx);
    const wp = DONG_NAI_WAYPOINTS[idx];
    const point: OfflinePoint = {
      lat: wp.lat,
      lng: wp.lng,
      speedKmh: 44 + (idx * 3),
      label: wp.label,
      timestamp: new Date().toISOString(),
      isOfflineCached: offlineMode,
    };

    if (offlineMode) {
      setOfflineQueue((prev) => [...prev, point]);
      setNotice({
        tone: 'ok',
        text: `[OFFLINE QUEUE] Đã lưu cục bộ GPS tại ${wp.label} (chờ đồng bộ).`,
      });
      return;
    }

    setBusy(true);
    try {
      await api.post('/mobile/gps-batch', {
        tripId: currentTrip?.id,
        points: [point],
      });
      setNotice({
        tone: 'ok',
        text: `[GPS LIVE] Đã ghi tọa độ ${wp.label} (${wp.lat}, ${wp.lng}) vào Neon PostgreSQL.`,
      });
    } catch (err: any) {
      setNotice({
        tone: 'err',
        text: err?.response?.data?.message || 'Không gửi được gói GPS.',
      });
    } finally {
      setBusy(false);
    }
  };

  const flushOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    setBusy(true);
    try {
      const res = await api.post('/mobile/gps-batch', {
        tripId: currentTrip?.id,
        offline: true,
        points: offlineQueue,
      });
      setOfflineQueue([]);
      setOfflineMode(false);
      setNotice({
        tone: 'ok',
        text: `Đã đồng bộ thành công ${res.data?.ingested || offlineQueue.length} bản ghi GPS từ hàng đợi Offline.`,
      });
    } catch (err: any) {
      setNotice({
        tone: 'err',
        text: err?.response?.data?.message || 'Lỗi đồng bộ hàng đợi Offline.',
      });
    } finally {
      setBusy(false);
    }
  };

  const triggerSos = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await api.post('/logistics/sos', {
        message: `[SIMULATED SOS @ ${currentWp.label}] ${sosMsg}`,
        lat: currentWp.lat,
        lng: currentWp.lng,
      });
      setNotice({
        tone: 'ok',
        text: `Đã phát tín hiệu SOS ACTIVE tại ${currentWp.label}.`,
      });
      await loadAll();
    } catch (err: any) {
      setNotice({
        tone: 'err',
        text: err?.response?.data?.message || 'Không gửi được tín hiệu SOS.',
      });
    } finally {
      setBusy(false);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const startDraw = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    drawingRef.current = true;
    setHasSigned(true);
  };

  const moveDraw = (clientX: number, clientY: number) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const submitPod = async (opts: { simulateConflict?: boolean; forceVersion?: number } = {}) => {
    if (!currentDelivery) return;
    setBusy(true);
    setNotice(null);
    try {
      const signatureDataUrl = canvasRef.current?.toDataURL('image/png') || 'data:image/png;base64,demo';
      await api.post(`/mobile/uploads/pod/${currentDelivery.id}`, {
        status: podStatus,
        codAmountCollected: Number(codInput || 0),
        signatureDataUrl,
        simulateConflict: Boolean(opts.simulateConflict),
        syncVersion: opts.forceVersion,
      });
      setConflictModal(null);
      setNotice({
        tone: 'ok',
        text: `Đã xác nhận ePOD (${podStatus}) cho đơn ${currentDelivery.trackingCode || currentDelivery.id} và thu COD ${Number(codInput || 0).toLocaleString('vi-VN')} VND.`,
      });
      await loadAll();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setConflictModal({
          open: true,
          deliveryId: currentDelivery.id,
          serverVersion: Number(err.response?.data?.serverVersion || 1),
          serverStatus: String(err.response?.data?.serverStatus || currentDelivery.status),
          message: err.response?.data?.message || 'HTTP 409 SYNC_VERSION_CONFLICT',
        });
      } else {
        setNotice({
          tone: 'err',
          text: err?.response?.data?.message || 'Không gửi được ePOD.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Driver App Simulator · Dong Nai 2026"
        title="Mô phỏng Tài xế & GPS Hành lang Đồng Nai"
        description="Môi trường giả lập app tài xế đầu kéo & last-mile: điều hướng lộ trình SVG, tích lũy hàng đợi Offline, ký ePOD Canvas, thu COD, gửi SOS và kiểm chứng xung đột đồng bộ 409."
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadAll()}>
            Làm mới dữ liệu
          </Button>
        }
      />

      {notice ? (
        <div
          className={`rounded-md border px-4 py-2.5 text-[12px] ${
            notice.tone === 'err'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <MetricBand
        metrics={[
          { label: 'Số chuyến hiện có', value: trips.length, meta: currentTrip?.tripCode || '—' },
          { label: 'Điểm GPS hiện tại', value: currentWp.label, meta: `${currentWp.lat}, ${currentWp.lng}` },
          {
            label: 'Hàng đợi Offline',
            value: offlineQueue.length,
            meta: offlineMode ? 'Chế độ Offline BẬT' : 'Đang trực tuyến',
            tone: offlineQueue.length > 0 ? 'warning' : 'default',
          },
          {
            label: 'COD đang giữ (Ví)',
            value: `${Number(wallet?.pendingCodTotal || 0).toLocaleString('vi-VN')} d`,
            meta: `${sosList.filter((s) => s.status === 'ACTIVE').length} SOS đang mở`,
            tone: sosList.some((s) => s.status === 'ACTIVE') ? 'danger' : 'success',
          },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left: SVG Corridor Map + GPS + Offline + SOS */}
        <div className="space-y-4">
          <EditorialSection
            eyebrow="GPS & Geofences (SIMULATED FEED)"
            title="Bản đồ tuyến ICD Long Bình - Long Thành - Phước An / Cát Lái"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={offlineMode ? 'primary' : 'outline'}
                  onClick={() => setOfflineMode((v) => !v)}
                >
                  {offlineMode ? 'Offline: ĐANG BẬT' : 'Giả lập Mất mạng'}
                </Button>
                {offlineQueue.length > 0 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void flushOfflineQueue()}
                  >
                    Đồng bộ {offlineQueue.length} gói
                  </Button>
                ) : null}
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-[260px_1fr]">
              <svg
                viewBox="0 0 100 105"
                className="h-64 w-full rounded-lg border border-line bg-surface-alt p-2"
                role="img"
                aria-label="Sơ đồ lộ trình vận tải Đồng Nai"
              >
                <polyline
                  points={DONG_NAI_WAYPOINTS.map((w) => `${w.x},${w.y}`).join(' ')}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.4"
                  strokeDasharray="2.5 2"
                />
                {DONG_NAI_WAYPOINTS.map((w, idx) => {
                  const isActive = idx === wpIndex % DONG_NAI_WAYPOINTS.length;
                  return (
                    <g
                      key={w.id}
                      onClick={() => void pushOrQueueGps(idx)}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={w.x}
                        cy={w.y}
                        r={isActive ? 3.8 : 2.3}
                        fill={isActive ? '#0284c7' : '#ffffff'}
                        stroke={isActive ? '#0369a1' : '#475569'}
                        strokeWidth="1.2"
                      />
                      <text
                        x={w.x + 4.5}
                        y={w.y + 1.2}
                        fontSize="3.6"
                        fill={isActive ? '#0f172a' : '#475569'}
                        fontWeight={isActive ? '700' : '400'}
                      >
                        {w.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="space-y-3 text-[12px]">
                <div className="rounded-md border border-line bg-surface-alt p-3">
                  <p className="font-semibold text-ink">
                    Chuyến hiện tại: {currentTrip?.tripCode || 'Chưa có'} ({currentTrip?.vehiclePlate || '60C'})
                  </p>
                  <p className="mt-1 text-ink-soft">
                    Trạng thái:{' '}
                    <StatusLabel tone={currentTrip?.status === 'COMPLETED' ? 'success' : 'info'}>
                      {currentTrip?.status || '—'}
                    </StatusLabel>{' '}
                    · Tài xế: {currentTrip?.driverName || 'Nguyễn Văn An'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy || !currentTrip}
                      onClick={() => void handleTripAction('start')}
                    >
                      Bắt đầu chuyến
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !currentTrip}
                      onClick={() => void pushOrQueueGps()}
                    >
                      {offlineMode ? 'Lưu điểm GPS Offline' : 'Đẩy GPS bước kế tiếp'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !currentTrip}
                      onClick={() => void handleTripAction('complete')}
                    >
                      Hoàn tất chuyến
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border border-line p-3">
                  <p className="font-semibold text-ink">Cảnh báo SOS khẩn cấp</p>
                  <input
                    type="text"
                    value={sosMsg}
                    onChange={(e) => setSosMsg(e.target.value)}
                    className="mt-1.5 h-8 w-full rounded border border-line bg-surface px-2.5 text-[12px] text-ink"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ink-faint">
                      Geofence gần nhất: {geofences[0]?.facilityName || 'ICD Long Bình'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void triggerSos()}
                    >
                      Gửi SOS ngay
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </EditorialSection>
        </div>

        {/* Right: ePOD Signature Pad + COD + 409 Conflict Test */}
        <div className="space-y-4">
          <EditorialSection eyebrow="ePOD & COD" title="Xác nhận giao hàng & Xử lý xung đột">
            <div className="space-y-3 text-[12px]">
              <label className="block">
                <span className="text-[11px] font-medium text-ink-soft">Chọn điểm giao (Delivery)</span>
                <select
                  value={currentDelivery?.id || ''}
                  onChange={(e) => {
                    setSelectedDeliveryId(e.target.value);
                    const found = currentTrip?.deliveries?.find((d) => d.id === e.target.value);
                    if (found) setCodInput(String(found.codAmountExpected || 0));
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
                >
                  {(currentTrip?.deliveries || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.trackingCode || d.id.slice(0, 8)} — {d.deliveryAddress} ({d.status})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-ink-soft">Kết quả giao</span>
                  <select
                    value={podStatus}
                    onChange={(e) => setPodStatus(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
                  >
                    <option value="DELIVERED">DELIVERED (Thành công)</option>
                    <option value="PARTIAL_DELIVERED">PARTIAL_DELIVERED (Một phần)</option>
                    <option value="FAILED">FAILED (Thất bại / Khách hẹn lại)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-ink-soft">Tiền thu hộ COD (VND)</span>
                  <input
                    type="number"
                    value={codInput}
                    onChange={(e) => setCodInput(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
                  />
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-soft">
                    Chữ ký người nhận (ePOD Canvas)
                  </span>
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-[11px] text-accent hover:underline"
                  >
                    Xóa chữ ký
                  </button>
                </div>
                <canvas
                  ref={canvasRef}
                  width={360}
                  height={110}
                  onMouseDown={(e) => startDraw(e.clientX, e.clientY)}
                  onMouseMove={(e) => moveDraw(e.clientX, e.clientY)}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    if (t) startDraw(t.clientX, t.clientY);
                  }}
                  onTouchMove={(e) => {
                    const t = e.touches[0];
                    if (t) moveDraw(t.clientX, t.clientY);
                  }}
                  onTouchEnd={endDraw}
                  className="mt-1 w-full cursor-crosshair rounded-md border border-dashed border-line-strong bg-white"
                />
                <p className="mt-0.5 text-[10px] text-ink-faint">
                  {hasSigned ? 'Đã ghi nhận chữ ký trên Canvas.' : 'Kéo chuột hoặc chạm để ký xác nhận nhận hàng.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={busy || !currentDelivery}
                  onClick={() => void submitPod({})}
                >
                  Hoàn tất ePOD &amp; Thu COD
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || !currentDelivery}
                  onClick={() => void submitPod({ simulateConflict: true })}
                >
                  Giả lập Xung đột (409)
                </Button>
              </div>
            </div>
          </EditorialSection>
        </div>
      </div>

      <Modal
        isOpen={Boolean(conflictModal?.open)}
        onClose={() => setConflictModal(null)}
        title="Xung đột đồng bộ dữ liệu Offline (HTTP 409)"
        size="sm"
      >
        <div className="space-y-3 text-[12px] text-ink-soft">
          <p className="font-medium text-danger">{conflictModal?.message}</p>
          <p>
            Trạng thái hiện tại trên máy chủ: <strong className="font-mono">{conflictModal?.serverStatus}</strong>{' '}
            (phiên bản v{conflictModal?.serverVersion}).
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConflictModal(null);
                void loadAll();
                setNotice({ tone: 'ok', text: 'Đã giữ nguyên bản mới nhất từ máy chủ.' });
              }}
            >
              Giữ bản mới nhất
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                void submitPod({
                  simulateConflict: false,
                  forceVersion: (conflictModal?.serverVersion || 0) + 1,
                })
              }
            >
              Ghi đè (Force Sync)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
