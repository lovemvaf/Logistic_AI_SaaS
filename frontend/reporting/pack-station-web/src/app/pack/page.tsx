'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { data } from '@/lib/data';
import { useSerialPort } from '@/hooks/useSerialPort';
import { CV_CONFIDENCE_THRESHOLD, mapImageNetPredictionsToSku } from '@/lib/cv-mapper';
import type {
  AiPredictionResult,
  MatchResult,
  PackOrder,
  PackSession,
  PackStation,
  PackProduct,
  ScanInput,
} from '@/lib/mock';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import { Button, Input, Modal } from 'ui-components';
import {
  boxTypeLabel,
  formatDateTimeVN,
  formatDuration,
  matchStatusLabel,
  orderStatusLabel,
  orderStatusTone,
  priorityLabel,
  sessionStatusLabel,
  sessionStatusTone,
  stationStatusLabel,
  stationStatusTone,
} from '@/lib/labels';

import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs-backend-wasm';

/** Kích thước video mục tiêu cho camera sau (nếu có). */
const VIDEO_SIZE = { width: 640, height: 480 };

/** Sắp xếp hàng chờ: khẩn trước, hẹn sớm trước. */
const PRIORITY_RANK: Record<NonNullable<PackOrder['priority']>, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
};

export default function PackPage() {
  const { user } = useAuth();

  // --- Hàng chờ (đơn đang chờ đóng) ---
  const [orders, setOrders] = useState<PackOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PackOrder | null>(null);

  // --- Phiên đóng gói ---
  const [session, setSession] = useState<PackSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [stations, setStations] = useState<PackStation[]>([]);

  // --- Quét / khớp ---
  const [scanning, setScanning] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    result: MatchResult;
    order: PackOrder;
    product?: PackProduct;
  } | null>(null);
  const [scannedSku, setScannedSku] = useState<string | null>(null);

  // --- Đính chính (thay thế) ---
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');

  // --- Camera / AI ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const [model, setModel] = useState<mobilenet.MobileNet | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<AiPredictionResult | null>(null);
  const [cvNotice, setCvNotice] = useState<string>(
    'Đang dùng trọng số ImageNet mặc định (chưa fine-tune cho 12 SKU kho). Luôn xác nhận bằng barcode hoặc kiểm tra trực tiếp trước khi đóng kiện.',
  );
  const [classifying, setClassifying] = useState(false);
  const [autoCvEnabled, setAutoCvEnabled] = useState(true);

  // --- Web Serial barcode scanner ---
  const {
    isConnected: serialConnected,
    data: serialData,
    error: serialError,
    connect: connectSerial,
  } = useSerialPort();
  const [serialMessage, setSerialMessage] = useState<string | null>(null);

  const scannedSkuInput = useRef<HTMLInputElement>(null);

  const packCode = (selectedOrder?.packCode ?? '').trim();

  /** Báo toast toàn cục qua ToastHost (mount ở root layout). */
  const showToast = useCallback(async (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const event = new CustomEvent('show-toast', { detail: { message, type } });
    window.dispatchEvent(event);
  }, []);

  /** Dừng camera an toàn. */
  const stopVideo = useCallback(() => {
    setVideoReady(false);
    const stream = videoRef.current?.srcObject;
    if (!stream) return;
    (stream as MediaStream).getTracks().forEach((track) => track.stop());
    videoRef.current!.srcObject = null;
  }, []);

  /** Bắt camera; nếu camera bị chặn -> chế độ nhập mã thủ công. */
  const startVideo = useCallback(async () => {
    if (!navigator.mediaDevices) {
      setModelError('Trình duyệt không hỗ trợ camera. Chỉ sử dụng được chế độ nhập mã thủ công.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...VIDEO_SIZE, facingMode: 'environment', frameRate: 30 },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) {
      setModelError(`Không mở được camera: ${err?.message || 'thiết bị bị chặn hoặc không có.'}`);
    }
  }, []);

  /** Chạy suy luận MobileNet thực trên khung hình video hiện tại. */
  const classifyCurrentFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!model || !video || video.readyState < 2 || video.videoWidth === 0 || classifying) {
      return;
    }
    setClassifying(true);
    try {
      const raw = await model.classify(video, 5);
      const outcome = mapImageNetPredictionsToSku(raw, CV_CONFIDENCE_THRESHOLD);
      setPrediction(outcome.prediction);
      setCvNotice(outcome.notice);
    } catch (err: any) {
      setCvNotice(`Lỗi suy luận MobileNet: ${err?.message || 'Không đọc được khung hình'}. Vui lòng quét barcode.`);
    } finally {
      setClassifying(false);
    }
  }, [model, classifying]);

  /** Load MobileNet + camera; nếu backend không sẵn sàng -> scan-only mode. */
  useEffect(() => {
    let cancelled = false;

    const loadModel = async () => {
      try {
        await tf.ready();
        const loadedModel = await mobilenet.load();
        if (cancelled) return;
        setModel(loadedModel);
        await startVideo();
      } catch (err: any) {
        if (cancelled) return;
        setModelError(
          `Không tải được model AI: ${err?.message || 'Mạng chặn hoặc WebGL/backend không khả dụng'}. Chế độ quét mã vẫn hoạt động bình thường.`,
        );
      }
    };

    loadModel();

    return () => {
      cancelled = true;
      stopVideo();
    };
  }, [startVideo, stopVideo]);

  /** Vòng lặp nhận diện định kỳ mỗi 1.5s khi camera + model sẵn sàng. */
  useEffect(() => {
    if (!autoCvEnabled || !model || !videoReady || modelError) return;
    const timer = window.setInterval(() => {
      void classifyCurrentFrame();
    }, 1500);
    return () => {
      window.clearInterval(timer);
    };
  }, [autoCvEnabled, model, videoReady, modelError, classifyCurrentFrame]);

  /** Dữ liệu Serial -> điền mã quét (barcode laser). */
  useEffect(() => {
    if (!serialConnected && !serialData) return;
    if (serialError) {
      setSerialMessage(`Serial không hoạt động: ${serialError}`);
      return;
    }
    const cleaned = serialData?.replace(/[\r\n]/g, '').trim();
    if (cleaned && cleaned.length > 3) {
      setPrediction((prev) => prev ?? { sku: cleaned, confidence: 100, candidates: [] });
      if (scannedSkuInput.current) scannedSkuInput.current.value = cleaned;
      setSerialMessage(null);
    }
  }, [serialConnected, serialData, serialError]);

  /** Lấy hàng chờ đóng + phiên đang mở + danh sách trạm. */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setOrdersLoading(true);
      setOrdersError(null);
      setSessionError(null);
      try {
        const queue = await data.orders.list(
          (row: PackOrder) => row.status === 'PENDING' || row.status === 'IN_QUEUE',
        );
        const activeSession = await data.sessions.active();
        const stationList = await data.stations.list();

        if (cancelled) return;

        const sorted = queue.sort((a: PackOrder, b: PackOrder) => {
          const rankA = PRIORITY_RANK[a.priority];
          const rankB = PRIORITY_RANK[b.priority];
          if (rankA !== rankB) return rankA - rankB;
          return a.scheduledAt.localeCompare(b.scheduledAt);
        });
        setOrders(sorted);
        setStations(stationList);
        setSession(activeSession);

        if (!activeSession) {
          let staffId = user?.staffId ?? 'hw-001';
          let stationId = user?.stationId ?? 'wh-01';
          try {
            const staff = await data.staff.get(staffId);
            if (staff) stationId = staff.stationId ?? stationId;
          } catch {}
          try {
            setSession(await data.sessions.start({ staffId, stationId }));
          } catch (err: any) {
            setSessionError(err?.message ?? 'Không mở được phiên đóng gói. Vui lòng thử lại.');
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        setOrdersError(err?.message ?? 'Không tải được đơn hàng. Vui lòng thử lại.');
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user, data]);

  /** Chọn đơn chờ đóng (và xóa kết quả cũ). */
  const selectOrder = useCallback((order: PackOrder) => {
    setSelectedOrder(order);
    setScanResult(null);
    setScanError(null);
    setScannedSku(null);
    setPrediction(null);
    if (scannedSkuInput.current) scannedSkuInput.current.value = '';
  }, []);

  /** Đơn kế tiếp khi đơn trước đã được đóng. */
  const nextOrder = useCallback(async () => {
    const order = await data.orders.nextOrder(user?.staffId);
    if (order) {
      setSelectedOrder(order);
      setScanResult(null);
      setScanError(null);
      setScannedSku(null);
      setPrediction(null);
      if (scannedSkuInput.current) scannedSkuInput.current.value = '';
      setOrders((prev) => [order, ...prev.filter((row) => row.id !== order.id)]);
    }
  }, [user, data]);

  /** Xác nhận dự đoán AI: đưa SKU vào ô quét. */
  const confirmPrediction = useCallback(() => {
    if (!prediction?.sku) return;
    if (scannedSkuInput.current) scannedSkuInput.current.value = prediction.sku;
    setScannedSku(prediction.sku);
  }, [prediction]);

  /** Lấy lại hàng chờ đóng gần nhất. */
  const refreshQueue = useCallback(async () => {
    try {
      const queue = await data.orders.list(
        (row: PackOrder) => row.status === 'PENDING' || row.status === 'IN_QUEUE',
      );
      setOrders(queue);
    } catch (err: any) {
      setOrdersError(err?.message ?? 'Không tải lại được đơn hàng.');
    }
  }, [data]);

  /** Quét: MATCH cho phép đóng, MISMATCH chặn -> đính chính. */
  const handleScan = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sku = scannedSkuInput.current?.value.trim() ?? '';
    if (!selectedOrder || !packCode || !sku || scanning) return;

    setScanning(true);
    setScanResult(null);
    setScanError(null);
    setScannedSku(sku);

    try {
      const input: ScanInput = { packCode, scannedSku: sku, confidence: prediction?.confidence };
      const result = await data.orders.scan(input);
      setScanResult(result);
      if (result.result === 'MATCH') {
        showToast(`Kiện ${packCode} khớp mã đơn hàng.`, 'success');
      } else {
        showToast(`Mã quét ${sku} khác mã dự kiến ${result.order.expectedSku}.`, 'warning');
      }
    } catch (err: any) {
      setScanError(err?.message ?? 'Không ghi nhận được dữ liệu quét.');
      showToast(err?.message ?? 'Không ghi nhận được dữ liệu quét.', 'error');
    } finally {
      setScanning(false);
    }
  }, [selectedOrder, packCode, data, prediction, showToast]);

  /** Đóng kiện: order.status phải là IN_PROGRESS và scanResult MATCH. */
  const handleSeal = useCallback(async () => {
    if (!selectedOrder || !scanResult || scanResult.result !== 'MATCH' || scanning || sealing) return;
    setSealing(true);
    try {
      await data.orders.seal({
        packCode: selectedOrder.packCode,
        scannedSku: scannedSku ?? scanResult.order.expectedSku,
        scannedAt: new Date().toISOString(),
        stationId: selectedOrder.stationId ?? session?.stationId,
      });
      showToast(`Đã đóng gói kiện ${selectedOrder.packCode}.`, 'success');
      // Sau khi đóng: trở về trạng thái chờ, chọn đơn kế tiếp.
      setSelectedOrder(null);
      setScanResult(null);
      setScanError(null);
      setScannedSku(null);
      setPrediction(null);
      if (scannedSkuInput.current) scannedSkuInput.current.value = '';
      await refreshQueue();
    } catch (err: any) {
      setScanError(err?.message ?? 'Không thể đóng gói đơn hàng.');
      showToast(err?.message ?? 'Không thể đóng gói đơn hàng.', 'error');
    } finally {
      setSealing(false);
    }
  }, [selectedOrder, scanResult, scanning, sealing, scannedSku, refreshQueue, data, session, showToast]);

  /** Sửa đổi SKU bằng tay (OVERRIDE): tạo log đính chính và đặt lại trạng thái chờ đóng. */
  const handleOverride = useCallback(async () => {
    if (!selectedOrder || !correctionReason.trim()) return;

    try {
      await data.corrections.create({
        id: `cor-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
        packCode: selectedOrder.packCode,
        trackingCode: selectedOrder.trackingCode,
        orderSku: selectedOrder.expectedSku,
        scannedSku: scannedSku ?? selectedOrder.expectedSku,
        reason: correctionReason.trim(),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      showToast(`Đã ghi nhận thay thế SKU cho kiện ${selectedOrder.packCode}.`, 'info');
      setCorrectionOpen(false);
      setScanResult(null);
      setScanError(null);
      setScannedSku(null);
      setCorrectionReason('');
      setSelectedOrder(null);
      await refreshQueue();
    } catch (err: any) {
      setScanError(err?.message ?? 'Không ghi nhận được hiện trạng thay thế.');
      showToast(err?.message ?? 'Không ghi nhận được hiện trạng thay thế.', 'error');
    }
  }, [selectedOrder, correctionReason, scannedSku, refreshQueue, data, showToast]);

  // --- Computed ---
  const sessionMetrics = useMemo(() => {
    if (!session) return null;
    const { totalPacked, totalMatched, totalMismatched, elapsedSeconds } = session;
    const averageSecondsPerPack = totalPacked > 0 ? Math.round(elapsedSeconds / totalPacked) : 0;
    return {
      packaged: totalPacked,
      matched: totalMatched,
      mismatched: totalMismatched,
      averageSeconds: averageSecondsPerPack,
    };
  }, [session]);

  const station: PackStation = stations.find((row) => row.id === session?.stationId) ?? { id: '-', code: '-', name: '-', status: 'OFFLINE' };

  const isMatch = scanResult?.result === 'MATCH';
  const statusTone = scanError ? 'danger' : isMatch ? 'success' : sessionError ? 'danger' : selectedOrder ? 'info' : 'neutral';
  const statusText = scanError
    ? 'Lỗi kết nối'
    : isMatch
      ? 'Kiện đã đúng, sẵn sàng đóng gói'
      : selectedOrder
        ? 'Chờ quét mã'
        : 'Chờ đơn hàng';

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>{new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())}</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Đóng gói</span>
          </>
        }
        title="Trạm đóng gói"
        description="Chọn đơn, xác nhận mã sản phẩm (AI/quét mã) rồi đóng kiện. Mỗi lượt quét ghi vào phiên làm việc."
        meta={
          <>
            <p>{user?.fullName ? `Nhân viên: ${user.fullName}` : 'Thiết bị: pack-station-web'}</p>
            <p className="mt-0.5">
              <StatusLabel tone={statusTone}>{statusText}</StatusLabel>
            </p>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {serialError ? (
              <StatusLabel tone="danger">{serialError}</StatusLabel>
            ) : null}
            <Button
              variant={serialConnected ? 'secondary' : 'primary'}
              onClick={connectSerial}
              size="sm"
              disabled={scanning}
            >
              {serialConnected ? 'Đã kết nối máy quét' : 'Kết nối máy quét'}
            </Button>
          </div>
        }
      />

      {sessionError ? (
        <div className="flex items-center justify-between rounded-md border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
          <span>{sessionError}</span>
          <Button variant="ghost" size="sm" onClick={refreshQueue}>
            Thử lại
          </Button>
        </div>
      ) : null}

      {sessionMetrics ? (
        <MetricBand
          metrics={[
            { label: 'Đã đóng', value: sessionMetrics.packaged, meta: 'Trong phiên này', tone: 'success' },
            { label: 'Khớp', value: sessionMetrics.matched, meta: 'Quét đúng mã', tone: 'success' },
            { label: 'Khác biệt', value: sessionMetrics.mismatched, meta: 'Trạng thái chờ', tone: 'danger' },
            { label: 'Trung bình', value: formatDuration(sessionMetrics.averageSeconds), meta: 'Giây/kiện', tone: 'default' },
          ]}
        />
      ) : null}

      {ordersError && (
        <div className="flex items-center justify-between rounded-md border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
          <span>{ordersError}</span>
          <Button variant="ghost" size="sm" onClick={refreshQueue}>
            Thử lại
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Cột trái: camera / AI + đơn hàng chờ */}
        <section className="space-y-4">
          <EditorialSection eyebrow="Camera / AI" title="Nhận diện sản phẩm">
            {modelError ? (
              <EmptyNote>{modelError}</EmptyNote>
            ) : (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-lg border border-line">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedData={() => setVideoReady(true)}
                    className="h-56 w-full object-cover bg-canvas"
                  />
                  {!model && (
                    <div className="absolute inset-0 flex items-center justify-center bg-canvas/80">
                      <EmptyNote>Đang tải camera và mô hình AI...</EmptyNote>
                    </div>
                  )}
                </div>
                <p className="rounded-md border border-line bg-canvas px-3 py-2 text-[11px] text-ink-faint">
                  MobileNet ImageNet (chưa fine-tune cho 12 SKU kho) — ngưỡng gợi ý {Math.round(CV_CONFIDENCE_THRESHOLD * 100)}%, luôn cần xác nhận thủ công hoặc barcode. {cvNotice}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-3">
                  <div className="flex items-center gap-3">
                    <StatusLabel tone={model && videoReady ? 'success' : 'warning'}>
                      {model && videoReady ? 'Camera sẵn sàng' : 'Camera đang mở'}
                    </StatusLabel>
                    {prediction ? (
                      <span className="text-[12px] text-ink-soft">
                        Dự đoán: <span className="font-mono">{prediction.sku}</span> ({prediction.confidence}%)
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-soft">Dự đoán: Chưa đủ ngưỡng hoặc chờ nhận diện</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!model || !videoReady || classifying}
                      onClick={() => void classifyCurrentFrame()}
                    >
                      {classifying ? 'Đang nhận diện...' : 'Nhận diện khung hình'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAutoCvEnabled((v) => !v)}
                    >
                      {autoCvEnabled ? 'Tạm dừng tự động' : 'Bật tự động'}
                    </Button>
                    {prediction ? (
                      <Button variant="primary" size="sm" onClick={confirmPrediction}>
                        Xác nhận dự đoán
                      </Button>
                    ) : null}
                    {!serialConnected && (
                      <Button variant="outline" size="sm" onClick={connectSerial}>
                        Kết nối máy quét
                      </Button>
                    )}
                  </div>
                </div>
                {prediction ? (
                  <div className="rounded-md border border-line bg-surface p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Dự đoán AI</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[22px] font-semibold text-ink">{prediction.sku}</p>
                      <StatusLabel tone={prediction.confidence > 60 ? 'success' : 'warning'}>
                        {prediction.confidence}%
                      </StatusLabel>
                    </div>
                    {prediction.candidates.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2 text-[12px] text-ink-soft">
                        {prediction.candidates
                          .filter((c) => c.confidence > 0.01)
                          .map((candidate, index) => (
                            <li key={`${candidate.sku}-${index}`} className="rounded-md border border-line px-2 py-1">
                              {candidate.sku} ({Math.round(candidate.confidence * 100)}%)
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </EditorialSection>

          <form onSubmit={handleScan} className="space-y-4">
            <EditorialSection eyebrow="Quét" title="Kiểm tra mã đơn">
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Mã đơn (pack code)
                  </p>
                  <p className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-3 text-[12px] font-mono text-ink">
                    {selectedOrder ? selectedOrder.packCode : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Mã SKU đã quét
                  </p>
                  <Input
                    ref={scannedSkuInput}
                    type="text"
                    placeholder="Quét hoặc nhập mã sản phẩm…"
                    required
                    disabled={scanning || !selectedOrder}
                  />
                </div>
                {scanError ? (
                  <div className="flex items-start gap-2 rounded-md border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
                    <StatusLabel tone="danger">Không chính xác</StatusLabel>
                    <span>{scanError}</span>
                  </div>
                ) : null}
                {scanResult ? (
                  <div className="rounded-md border-l-2 border-success bg-surface px-3 py-2 text-[12px] leading-5 text-ink-soft">
                    <StatusLabel tone={isMatch ? 'success' : 'danger'}>
                      {matchStatusLabel[scanResult.result]}
                    </StatusLabel>
                    <div className="mt-1">
                      Dự kiến: <span className="font-mono">{scanResult.order.expectedSku}</span> —
                      quét: <span className="font-mono">{scanResult.order.scannedSku ?? scannedSku}</span>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!packCode || !selectedOrder || scanning || (scanResult && !isMatch)}
                    isLoading={scanning}
                  >
                    {scanning ? 'Đang ghi nhận…' : scanResult ? 'Quét lại' : 'Quét'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSeal}
                    disabled={!isMatch || sealing || !selectedOrder}
                    isLoading={sealing}
                  >
                    {sealing ? 'Đang đóng…' : 'Đóng kiện'}
                  </Button>
                  {!isMatch && scanResult && (
                    <Button type="button" variant="outline" onClick={() => setCorrectionOpen(true)}>
                      Sửa
                    </Button>
                  )}
                </div>
              </div>
            </EditorialSection>
          </form>
        </section>

        {/* Cột phải: đơn hàng chờ + phiên */}
        <aside className="space-y-4">
          <EditorialSection
            eyebrow="Làm việc"
            title="Chọn đơn chờ đóng"
            action={
              <button
                type="button"
                onClick={nextOrder}
                className="text-[12px] font-medium text-ink-faint underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent"
              >
                Lấy đơn kế tiếp
              </button>
            }
          >
            {ordersLoading && orders.length === 0 ? (
              <div className="text-[13px] text-ink-faint">Đang tải đơn chờ đóng...</div>
            ) : ordersError ? (
              <div className="text-[13px] text-ink-faint">Chưa tải được đơn chờ đóng. Vui lòng thử lại.</div>
            ) : orders.length === 0 ? (
              <EmptyNote>Hiện không còn đơn chờ đóng nào. Nhấn lấy đơn kế tiếp khi có công việc.</EmptyNote>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() => selectOrder(order)}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-[12px] transition-colors ${
                      selectedOrder?.id === order.id
                        ? 'border-accent bg-accent/5 text-ink'
                        : 'border-line bg-surface text-ink-soft hover:bg-surface/90'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono">{order.packCode}</span>
                        <StatusLabel tone={orderStatusTone[order.status]}>
                          {orderStatusLabel[order.status]}
                        </StatusLabel>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {order.expectedSku} / {boxTypeLabel(order.boxType)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {priorityLabel(order.priority)} <span className="font-mono">{order.priority}</span>, hẹn{' '}
                        {formatDateTimeVN(order.scheduledAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </EditorialSection>

          <EditorialSection eyebrow="Phiên làm việc" title="Thông tin ca">
            <dl className="space-y-3 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">Nhân viên</dt>
                <dd className="text-ink">{user?.fullName ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">Trạm</dt>
                <dd>
                  <StatusLabel tone={stationStatusTone[station.status]}>
                    {stationStatusLabel[station.status]}/{station.name}
                  </StatusLabel>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">Mã cửa</dt>
                <dd className="font-mono text-[12px] font-medium text-ink">
                  {session?.sessionCode ?? '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">Trạng thái phiên</dt>
                <dd>
                  <StatusLabel tone={session ? sessionStatusTone[session.status] : 'warning'}>
                    {session ? sessionStatusLabel[session.status] : 'Chưa mở ca'}
                  </StatusLabel>
                </dd>
              </div>
            </dl>
          </EditorialSection>

          <EditorialSection eyebrow="Hướng dẫn" title="Ba bước đóng kiện">
            <div className="space-y-3 text-[12px] text-ink-soft">
              <div className="space-y-1">
                <p className="font-medium text-ink">01 — Đối chiếu</p>
                <p>So mã trên kiện với mã hiển thị trên màn hình trước khi quét.</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-ink">02 — Quét gói</p>
                <p>Quét hoặc nhập mã, kiểm tra lại một lần rồi nhấn Enter.</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-ink">03 — Bàn giao</p>
                <p>Đưa kiện đã ghi nhận sang khu vực chờ và báo quản lý ca nếu có bất thường.</p>
              </div>
            </div>
          </EditorialSection>
        </aside>
      </div>

      {/* Correction modal */}
      <Modal
        isOpen={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        title="Xác nhận thay thế sản phẩm"
        size="sm"
      >
        <div className="space-y-4">
          <div className="space-y-2 text-[12px] text-ink-soft">
            <p>Quét không khớp. Bạn đang xác nhận sản phẩm {scanResult?.order.expectedSku} được quét bằng</p>
            <p className="font-mono">{scannedSku ?? '—'}</p>
          </div>
          <Input
            label="Lý do"
            placeholder="Vì sao mã quét không khớp..."
            value={correctionReason}
            onChange={(event) => setCorrectionReason(event.target.value)}
            required
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCorrectionOpen(false)}>
              Hủy
            </Button>
            <Button type="button" variant="primary" disabled={!correctionReason.trim()} onClick={handleOverride}>
              Xác nhận thay thế
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
