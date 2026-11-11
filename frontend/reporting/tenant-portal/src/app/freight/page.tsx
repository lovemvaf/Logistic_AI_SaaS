'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { isMockDataSource } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import { Button, Input } from 'ui-components';

const unwrapList = <T,>(res: any): T[] => {
  const payload = res?.data ?? res;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const unwrapObj = <T,>(res: any): T => (res?.data !== undefined ? res.data : res);

export default function FreightControlTowerPage() {
  const [summary, setSummary] = useState<any>(null);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [tractors, setTractors] = useState<any[]>([]);
  const [chassis, setChassis] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [conflictMsg, setConflictMsg] = useState('');

  // RFQ creation
  const [rfqClientId, setRfqClientId] = useState('');
  const [rfqOrigin, setRfqOrigin] = useState('KCN Amata - Long Binh');
  const [rfqDest, setRfqDest] = useState('Cang Cat Lai (External Gateway)');
  const [rfqCargo, setRfqCargo] = useState('Electronic Sub-Assemblies FCL 40HC');
  const [rfqMode, setRfqMode] = useState('FCL_EXPORT');

  // Quote creation
  const [quoteRfqId, setQuoteRfqId] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('8400000');

  // Assignment form
  const [assignTractorId, setAssignTractorId] = useState('');
  const [assignChassisId, setAssignChassisId] = useState('');
  const [assignContainerId, setAssignContainerId] = useState('');
  const [assignBookingId, setAssignBookingId] = useState('');
  const [assignStart, setAssignStart] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [assignEnd, setAssignEnd] = useState(() => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 16));

  const loadAll = useCallback(async () => {
    if (isMockDataSource) {
      setLoading(false);
      setError('Control Tower Vận tải Container cần kết nối Backend API.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [sumR, rfqR, qtR, bkR, shR, trR, chR, ctR, asR, clR] = await Promise.all([
        api.get('/freight/summary'),
        api.get('/freight/rfqs'),
        api.get('/freight/quotes'),
        api.get('/freight/bookings'),
        api.get('/freight/shipments'),
        api.get('/freight/tractors'),
        api.get('/freight/chassis'),
        api.get('/freight/containers'),
        api.get('/freight/assignments'),
        api.get('/clients').catch(() => ({ data: [] })),
      ]);
      const rfqList = unwrapList<any>(rfqR);
      const bkList = unwrapList<any>(bkR);
      const trList = unwrapList<any>(trR);
      const chList = unwrapList<any>(chR);
      const ctList = unwrapList<any>(ctR);
      const clList = unwrapList<any>(clR);

      setSummary(unwrapObj<any>(sumR));
      setRfqs(rfqList);
      setQuotes(unwrapList<any>(qtR));
      setBookings(bkList);
      setShipments(unwrapList<any>(shR));
      setTractors(trList);
      setChassis(chList);
      setContainers(ctList);
      setAssignments(unwrapList<any>(asR));
      setClients(clList);

      if (clList.length > 0) setRfqClientId((prev) => prev || clList[0].id);
      if (rfqList.length > 0) setQuoteRfqId((prev) => prev || rfqList[0].id);
      if (trList.length > 0) setAssignTractorId((prev) => prev || trList[0].id);
      if (chList.length > 0) setAssignChassisId((prev) => prev || chList[0].id);
      if (ctList.length > 0) setAssignContainerId((prev) => prev || ctList[0].id);
      if (bkList.length > 0) setAssignBookingId((prev) => prev || bkList[0].id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được Control Tower Freight.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCreateRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMsg('');
    try {
      await api.post('/freight/rfqs', {
        clientId: rfqClientId || undefined,
        serviceMode: rfqMode,
        originName: rfqOrigin,
        destName: rfqDest,
        cargoDesc: rfqCargo,
        containerSize: '40HC',
        containerQty: 1,
      });
      setActionMsg('Đã tạo yêu cầu báo giá (RFQ).');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không tạo được RFQ.');
    }
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteRfqId) return;
    setActionMsg('');
    try {
      const amount = Number(quoteAmount || 0);
      await api.post('/freight/quotes', {
        rfqId: quoteRfqId,
        totalAmount: amount,
        currency: 'VND',
        lines: [{ lineType: 'FREIGHT', description: 'Inland Drayage & THC', qty: 1, unitPrice: amount }],
      });
      setActionMsg('Đã phát hành báo giá mới.');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không tạo được báo giá.');
    }
  };

  const handleAcceptQuote = async (quoteId: string) => {
    setActionMsg('');
    setConflictMsg('');
    try {
      const res = await api.post(`/freight/quotes/${quoteId}/accept`);
      const data = unwrapObj<any>(res);
      setActionMsg(`Đã chấp nhận báo giá -> Booking ${data?.booking?.bookingNo} & Shipment ${data?.shipment?.shipmentNo}`);
      await loadAll();
    } catch (err: any) {
      setConflictMsg(err?.response?.data?.message || 'Không thể chấp nhận báo giá.');
    }
  };

  const handleAssignEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMsg('');
    setConflictMsg('');
    try {
      await api.post('/freight/assignments', {
        tractorId: assignTractorId || undefined,
        chassisId: assignChassisId || undefined,
        containerId: assignContainerId || undefined,
        bookingId: assignBookingId || undefined,
        startAt: new Date(assignStart).toISOString(),
        endAt: new Date(assignEnd).toISOString(),
        notes: 'Assigned via Freight Control Tower UI',
      });
      setActionMsg('Đã phân bổ đầu kéo / sơ-mi rơ-moóc / container không trùng lịch.');
      await loadAll();
    } catch (err: any) {
      setConflictMsg(err?.response?.data?.message || 'Xung đột phân bổ thiết bị (409 Conflict).');
    }
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Container & B2B Freight</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Control Tower</span>
          </>
        }
        title="Điều hành Container, RFQ, Booking & Đội xe kéo"
        description="Quy trình RFQ -> Báo giá -> Booking -> Shipment -> Lệnh điều kéo chống trùng lịch (Advisory Lock + PostgreSQL RLS)."
        meta={
          <StatusLabel tone={summary?.dataSource === 'LIVE_POSTGRES_AGGREGATION' ? 'success' : 'neutral'}>
            {summary?.dataSource || 'LIVE_POSTGRES'}
          </StatusLabel>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadAll()}>
            Tải lại bảng điều hành
          </Button>
        }
      />

      {error ? (
        <div className="rounded-md border-l-2 border-danger bg-surface px-4 py-2 text-[12px] text-ink">{error}</div>
      ) : null}
      {conflictMsg ? (
        <div className="rounded-md border-l-2 border-warning bg-surface px-4 py-2 text-[12px] text-ink">
          <strong>Cảnh báo xung đột / Cổng kiểm tra:</strong> {conflictMsg}
        </div>
      ) : null}
      {actionMsg ? (
        <div className="rounded-md border-l-2 border-success bg-surface px-4 py-2 text-[12px] text-ink">
          {actionMsg}
        </div>
      ) : null}

      <MetricBand
        metrics={[
          {
            label: 'Booking hoạt động',
            value: summary ? `${summary.bookingsActive} / ${summary.bookingsTotal}` : '—',
            meta: `Lô hàng: ${summary?.shipmentsTotal ?? 0}`,
          },
          {
            label: 'Đầu kéo / Moóc / Cont',
            value: summary ? `${summary.tractorsCount} · ${summary.chassisCount} · ${summary.totalContainers}` : '—',
            meta: 'Thiết bị theo dõi thời gian thực',
          },
          {
            label: 'RFQ Mở / Báo giá',
            value: summary ? `${summary.rfqsOpen} · ${summary.quotesSent}` : '—',
            meta: `XNK chờ duyệt: ${summary?.customsDeclarationsPendingReview ?? 0}`,
          },
          {
            label: 'Công nợ AR & Khiếu nại',
            value: summary ? `${Number(summary.arOutstandingAmount || 0).toLocaleString('vi-VN')} đ` : '—',
            meta: `Khiếu nại đang mở: ${summary?.disputesOpen ?? 0}`,
            tone: (summary?.disputesOpen ?? 0) > 0 ? 'warning' : 'success',
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <EditorialSection eyebrow="Bước 1" title="Tạo Yêu cầu Báo giá (RFQ)">
          <form onSubmit={handleCreateRfq} className="space-y-3 rounded-md border border-line bg-surface p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Khách hàng B2B
                </label>
                <select
                  value={rfqClientId}
                  onChange={(e) => setRfqClientId(e.target.value)}
                  className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px] text-ink"
                >
                  <option value="">-- Khách vãng lai / Nội bộ --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Loại dịch vụ
                </label>
                <select
                  value={rfqMode}
                  onChange={(e) => setRfqMode(e.target.value)}
                  className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px] text-ink"
                >
                  <option value="FCL_EXPORT">FCL_EXPORT</option>
                  <option value="FCL_IMPORT">FCL_IMPORT</option>
                  <option value="LCL_CONSOL">LCL_CONSOL</option>
                  <option value="FTL_DOMESTIC">FTL_DOMESTIC</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Điểm lấy hàng (KCN/ICD)" value={rfqOrigin} onChange={(e) => setRfqOrigin(e.target.value)} required />
              <Input label="Điểm hạ bãi / Cảng đích" value={rfqDest} onChange={(e) => setRfqDest(e.target.value)} required />
            </div>
            <Input label="Mô tả hàng hóa & container" value={rfqCargo} onChange={(e) => setRfqCargo(e.target.value)} required />
            <Button type="submit" variant="primary" size="sm">
              Tạo RFQ mới
            </Button>
          </form>
        </EditorialSection>

        <EditorialSection eyebrow="Bước 2" title="Phát hành Báo giá từ RFQ">
          <form onSubmit={handleCreateQuote} className="space-y-3 rounded-md border border-line bg-surface p-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Chọn RFQ
              </label>
              <select
                value={quoteRfqId}
                onChange={(e) => setQuoteRfqId(e.target.value)}
                className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px] text-ink"
              >
                {rfqs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.rfqNumber} ({r.status}) — {r.originName} -&gt; {r.destName}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Tổng cước chào giá (VND)"
              type="number"
              value={quoteAmount}
              onChange={(e) => setQuoteAmount(e.target.value)}
              required
            />
            <Button type="submit" variant="secondary" size="sm" disabled={!quoteRfqId}>
              Phát hành Báo giá (SENT)
            </Button>
          </form>
        </EditorialSection>
      </div>

      <EditorialSection eyebrow="Thương mại B2B" title={`Danh sách Báo giá & Chấp nhận tạo Booking (${quotes.length})`}>
        {loading ? (
          <EmptyNote>Đang tải báo giá...</EmptyNote>
        ) : quotes.length === 0 ? (
          <EmptyNote>Chưa có báo giá nào.</EmptyNote>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Số Báo Giá</th>
                  <th className="px-3 py-2">RFQ / Tuyến</th>
                  <th className="px-3 py-2">Số tiền</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Booking liên kết</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="px-3 py-2 font-mono">{q.quoteNumber}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {q.rfq?.rfqNumber || '—'} · {q.rfq?.originName} -&gt; {q.rfq?.destName}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {Number(q.totalAmount).toLocaleString('vi-VN')} {q.currency}
                    </td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={q.status === 'ACCEPTED' ? 'success' : 'info'}>{q.status}</StatusLabel>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{q.booking?.bookingNo || '—'}</td>
                    <td className="px-3 py-2">
                      {q.status !== 'ACCEPTED' && !q.booking ? (
                        <Button size="sm" variant="primary" onClick={() => void handleAcceptQuote(q.id)}>
                          Chấp nhận -&gt; Booking
                        </Button>
                      ) : (
                        <span className="text-[11px] text-ink-faint">Đã chốt</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EditorialSection>

      <EditorialSection
        eyebrow="Điều phối Container (Chống trùng lịch)"
        title="Phân bổ Đầu kéo · Moóc · Container theo khung giờ"
      >
        <form onSubmit={handleAssignEquipment} className="space-y-3 rounded-md border border-line bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Đầu kéo (Tractor)
              </label>
              <select
                value={assignTractorId}
                onChange={(e) => setAssignTractorId(e.target.value)}
                className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
              >
                <option value="">-- Bỏ trống --</option>
                {tractors.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.unitCode} ({t.plateNumber})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Sơ-mi rơ-moóc (Chassis)
              </label>
              <select
                value={assignChassisId}
                onChange={(e) => setAssignChassisId(e.target.value)}
                className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
              >
                <option value="">-- Bỏ trống --</option>
                {chassis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.chassisCode} ({c.plateNumber})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Container
              </label>
              <select
                value={assignContainerId}
                onChange={(e) => setAssignContainerId(e.target.value)}
                className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
              >
                <option value="">-- Bỏ trống --</option>
                {containers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.containerNo} ({c.sizeType} · {c.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Booking
              </label>
              <select
                value={assignBookingId}
                onChange={(e) => setAssignBookingId(e.target.value)}
                className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
              >
                <option value="">-- Bỏ trống --</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bookingNo} ({b.serviceMode})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Bắt đầu (Start)
              </label>
              <input
                type="datetime-local"
                value={assignStart}
                onChange={(e) => setAssignStart(e.target.value)}
                className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Kết thúc (End)
              </label>
              <input
                type="datetime-local"
                value={assignEnd}
                onChange={(e) => setAssignEnd(e.target.value)}
                className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
                required
              />
            </div>
          </div>
          <Button type="submit" variant="primary" size="sm">
            Kiểm tra & Phân bổ thiết bị
          </Button>
        </form>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Đầu kéo / Moóc / Cont</th>
                  <th className="px-3 py-2">Booking</th>
                  <th className="px-3 py-2">Khung giờ</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {assignments.slice(0, 12).map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {[a.tractor?.unitCode, a.chassis?.chassisCode, a.container?.containerNo].filter(Boolean).join(' + ') || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{a.booking?.bookingNo || '—'}</td>
                    <td className="px-3 py-2 text-[11px] text-ink-soft">
                      {new Date(a.startAt).toLocaleString('vi-VN')} - {new Date(a.endAt).toLocaleTimeString('vi-VN')}
                    </td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={a.status === 'ACTIVE' || a.status === 'RESERVED' ? 'info' : 'neutral'}>
                        {a.status}
                      </StatusLabel>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Shipment / Tracking</th>
                  <th className="px-3 py-2">Booking</th>
                  <th className="px-3 py-2">Container</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {shipments.slice(0, 12).map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[11px] font-medium">{s.shipmentNo}</div>
                      <div className="font-mono text-[10px] text-ink-faint">{s.trackingCode}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{s.booking?.bookingNo || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{s.container?.containerNo || 'LCL/Unassigned'}</td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={s.status === 'DELIVERED' ? 'success' : 'info'}>{s.status}</StatusLabel>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </EditorialSection>
    </div>
  );
}
