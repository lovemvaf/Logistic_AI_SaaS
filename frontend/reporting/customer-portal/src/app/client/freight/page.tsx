'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { isMockDataSource } from '@/lib/data';
import { formatCurrency, formatDateTimeVN } from '@/lib/labels';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
  type StatusTone,
} from 'ui-kit';
import { Button, Input } from 'ui-components';

const unwrapList = <T,>(res: any): T[] => {
  const payload = res?.data ?? res;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const unwrapObj = <T,>(res: any): T => (res?.data !== undefined ? res.data : res);

const STATUS_TONE: Record<string, StatusTone> = {
  OPEN: 'warning',
  QUOTED: 'info',
  BOOKED: 'success',
  CONFIRMED: 'success',
  ACCEPTED: 'success',
  PLANNED: 'neutral',
  IN_TRANSIT: 'info',
  DELIVERED: 'success',
  EXTRACTED: 'success',
  UPLOADED: 'info',
  REJECTED: 'danger',
  MISMATCH_FOUND: 'danger',
  PAID: 'success',
  OVERDUE: 'danger',
  ISSUED: 'warning',
  RESOLVED: 'success',
};

export default function ClientFreightPage() {
  const [tab, setTab] = useState<'rfqs' | 'shipments' | 'finance' | 'grants'>('rfqs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [units, setUnits] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);

  // Form state: create RFQ
  const [originName, setOriginName] = useState('Phường Biên Hòa - KCN Amata');
  const [destName, setDestName] = useState('Cảng Cát Lái (TP.HCM)');
  const [serviceMode, setServiceMode] = useState('FCL_EXPORT');
  const [incoterm, setIncoterm] = useState('FOB');
  const [containerSize, setContainerSize] = useState('40HC');
  const [cargoDesc, setCargoDesc] = useState('Linh kiện công nghiệp xuất khẩu');
  const [creatingRfq, setCreatingRfq] = useState(false);

  // Form state: upload trade doc
  const [docType, setDocType] = useState('COMMERCIAL_INVOICE');
  const [docNumber, setDocNumber] = useState('');
  const [docFileName, setDocFileName] = useState('invoice_demo.pdf');
  const [docBookingId, setDocBookingId] = useState('');
  const [docShipmentId, setDocShipmentId] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Form state: dispute
  const [disputeInvoiceId, setDisputeInvoiceId] = useState('');
  const [disputeClaimedAmount, setDisputeClaimedAmount] = useState('1500000');
  const [disputeReason, setDisputeReason] = useState('');
  const [creatingDispute, setCreatingDispute] = useState(false);

  // Form state: public tracking grant
  const [grantTrackingCode, setGrantTrackingCode] = useState('');
  const [grantPrecision, setGrantPrecision] = useState<'FULL' | 'CITY_WARD' | 'STATUS_ONLY'>('CITY_WARD');
  const [grantTtlHours, setGrantTtlHours] = useState('72');
  const [creatingGrant, setCreatingGrant] = useState(false);
  const [mintedShare, setMintedShare] = useState<{ trackingCode: string; shareToken: string; precision: string } | null>(null);

  const loadAll = useCallback(async () => {
    if (isMockDataSource) {
      setLoading(false);
      setError('Phân hệ Freight B2B & Public Tracking Grant yêu cầu kết nối PostgreSQL API (NEXT_PUBLIC_DATA_SOURCE=api).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [geoRes, rfqRes, quoteRes, shpRes, docRes, invRes, dspRes, grantRes] = await Promise.all([
        api.get('/client/freight/geography/units'),
        api.get('/client/freight/rfqs'),
        api.get('/client/freight/quotes'),
        api.get('/client/freight/shipments'),
        api.get('/client/freight/documents'),
        api.get('/client/freight/invoices'),
        api.get('/client/freight/disputes'),
        api.get('/client/freight/tracking-grants'),
      ]);

      const geoObj = unwrapObj<any>(geoRes);
      setUnits(Array.isArray(geoObj?.units) ? geoObj.units : []);
      setFacilities(Array.isArray(geoObj?.facilities) ? geoObj.facilities : []);
      setRfqs(unwrapList<any>(rfqRes));
      setQuotes(unwrapList<any>(quoteRes));
      const shpList = unwrapList<any>(shpRes);
      setShipments(shpList);
      setDocuments(unwrapList<any>(docRes));
      const invList = unwrapList<any>(invRes);
      setInvoices(invList);
      setDisputes(unwrapList<any>(dspRes));
      setGrants(unwrapList<any>(grantRes));

      if (shpList.length > 0 && shpList[0].trackingCode) {
        setGrantTrackingCode((prev) => prev || shpList[0].trackingCode);
      }
      if (shpList.length > 0 && shpList[0].bookingId) {
        setDocBookingId((prev) => prev || shpList[0].bookingId);
        setDocShipmentId((prev) => prev || shpList[0].id);
      }
      if (invList.length > 0) {
        setDisputeInvoiceId((prev) => prev || invList[0].id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được dữ liệu Freight B2B.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCreateRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originName.trim() || !destName.trim() || !cargoDesc.trim()) return;
    setCreatingRfq(true);
    setFeedback('');
    try {
      await api.post('/client/freight/rfqs', {
        serviceMode,
        incoterm,
        originName: originName.trim(),
        destName: destName.trim(),
        containerSize,
        containerQty: 1,
        cargoDesc: cargoDesc.trim(),
      });
      setFeedback('Đã gửi yêu cầu báo giá (RFQ) lên hệ thống điều phối.');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tạo được RFQ.');
    } finally {
      setCreatingRfq(false);
    }
  };

  const handleAcceptQuote = async (quoteId: string) => {
    setFeedback('');
    try {
      const res = await api.post(`/client/freight/quotes/${quoteId}/accept`);
      const obj = unwrapObj<any>(res);
      setFeedback(
        `Đã chấp nhận báo giá. Tạo Booking ${obj?.booking?.bookingNo ?? ''} và Shipment ${obj?.shipment?.shipmentNo ?? ''}.`,
      );
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không thể chấp nhận báo giá.');
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docNumber.trim() || !docFileName.trim()) return;
    setUploadingDoc(true);
    setFeedback('');
    try {
      await api.post('/client/freight/documents', {
        docType,
        docNumber: docNumber.trim(),
        fileName: docFileName.trim(),
        bookingId: docBookingId || undefined,
        shipmentId: docShipmentId || undefined,
      });
      setDocNumber('');
      setFeedback('Đã tải chứng từ XNK lên hồ sơ lô hàng.');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được chứng từ.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeReason.trim()) return;
    setCreatingDispute(true);
    setFeedback('');
    try {
      await api.post('/client/freight/disputes', {
        invoiceId: disputeInvoiceId || undefined,
        claimedAmount: Number(disputeClaimedAmount),
        category: 'DEM_DET',
        reason: disputeReason.trim(),
      });
      setDisputeReason('');
      setFeedback('Đã mở khiếu nại hóa đơn / DEM-DET cho bộ phận kế toán.');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tạo được tranh chấp.');
    } finally {
      setCreatingDispute(false);
    }
  };

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantTrackingCode.trim()) return;
    setCreatingGrant(true);
    setFeedback('');
    try {
      const res = await api.post('/client/freight/tracking-grants', {
        trackingCode: grantTrackingCode.trim(),
        allowedPrecision: grantPrecision,
        ttlHours: Number(grantTtlHours || 72),
      });
      const obj = unwrapObj<any>(res);
      if (obj?.shareToken) {
        setMintedShare({
          trackingCode: grantTrackingCode.trim(),
          shareToken: obj.shareToken,
          precision: grantPrecision,
        });
      }
      setFeedback('Đã cấp Public Tracking Grant mới (token chỉ hiển thị một lần).');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tạo được link chia sẻ.');
    } finally {
      setCreatingGrant(false);
    }
  };

  const handleRevokeGrant = async (id: string) => {
    setFeedback('');
    try {
      await api.post(`/client/freight/tracking-grants/${id}/revoke`);
      setFeedback('Đã thu hồi liên kết chia sẻ công khai.');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không thu hồi được link.');
    }
  };

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng B2B</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Container, 3PL &amp; XNK</span>
          </>
        }
        title="Freight B2B"
        description="Gửi RFQ vận tải container/LCL theo danh mục 95 phường/xã Đồng Nai 2026, duyệt báo giá, nộp chứng từ XNK, kiểm tra hóa đơn DEM/DET và cấp link theo dõi công khai có kiểm soát độ chính xác."
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadAll()}>
            Làm mới
          </Button>
        }
      />

      {error ? (
        <div className="border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
          {error}
        </div>
      ) : null}

      {feedback ? (
        <div className="border-l-2 border-success bg-surface px-3 py-2 text-[12px] text-ink">
          {feedback}
        </div>
      ) : null}

      <MetricBand
        metrics={[
          { label: 'RFQ của tôi', value: rfqs.length, meta: 'Yêu cầu báo giá' },
          {
            label: 'Báo giá chờ duyệt',
            value: quotes.filter((q) => q.status !== 'ACCEPTED').length,
            meta: `${quotes.length} tổng báo giá`,
          },
          { label: 'Lô hàng Freight', value: shipments.length, meta: `${documents.length} chứng từ XNK`, tone: 'success' },
          {
            label: 'Hóa đơn & Grant',
            value: invoices.length,
            meta: `${grants.filter((g) => !g.revokedAt).length} link công khai hiệu lực`,
          },
        ]}
      />

      <div className="flex flex-wrap gap-2 border-b border-line pb-2">
        {[
          { id: 'rfqs', label: '1. RFQ & Báo giá' },
          { id: 'shipments', label: '2. Lô hàng & Chứng từ XNK' },
          { id: 'finance', label: '3. Hóa đơn & Tranh chấp' },
          { id: 'grants', label: '4. Public Tracking Grant' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === t.id
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line bg-surface text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <EmptyNote>Đang tải dữ liệu Freight B2B từ máy chủ...</EmptyNote>
      ) : tab === 'rfqs' ? (
        <div className="space-y-5">
          <EditorialSection eyebrow="Tạo mới" title="Gửi yêu cầu báo giá (RFQ)">
            <form onSubmit={handleCreateRfq} className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Chế độ dịch vụ
                </label>
                <select
                  value={serviceMode}
                  onChange={(e) => setServiceMode(e.target.value)}
                  className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
                >
                  <option value="FCL_EXPORT">FCL Xuất khẩu</option>
                  <option value="FCL_IMPORT">FCL Nhập khẩu</option>
                  <option value="LCL">LCL Gom hàng lẻ</option>
                  <option value="DOMESTIC_FTL">Nội địa FTL</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Incoterm &amp; Cỡ cont
                </label>
                <div className="flex gap-2">
                  <select
                    value={incoterm}
                    onChange={(e) => setIncoterm(e.target.value)}
                    className="h-9 flex-1 rounded-md border border-line bg-surface px-2 text-[12px] text-ink"
                  >
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="EXW">EXW</option>
                    <option value="DDP">DDP</option>
                  </select>
                  <select
                    value={containerSize}
                    onChange={(e) => setContainerSize(e.target.value)}
                    className="h-9 flex-1 rounded-md border border-line bg-surface px-2 text-[12px] text-ink"
                  >
                    <option value="40HC">40HC</option>
                    <option value="40RF">40RF</option>
                    <option value="20GP">20GP</option>
                    <option value="LCL">LCL</option>
                  </select>
                </div>
              </div>
              <Input
                label="Mô tả hàng hóa"
                value={cargoDesc}
                onChange={(e) => setCargoDesc(e.target.value)}
                required
              />
              <div>
                <Input
                  label={`Điểm xuất phát (${units.length} ĐVHC Đồng Nai)`}
                  value={originName}
                  onChange={(e) => setOriginName(e.target.value)}
                  list="dongnai-units-list"
                  required
                />
                <datalist id="dongnai-units-list">
                  {units.slice(0, 95).map((u) => (
                    <option key={u.id} value={u.canonicalName} />
                  ))}
                </datalist>
              </div>
              <div>
                <Input
                  label={`Điểm đích (${facilities.length} cảng / ICD / kho)`}
                  value={destName}
                  onChange={(e) => setDestName(e.target.value)}
                  list="dongnai-facilities-list"
                  required
                />
                <datalist id="dongnai-facilities-list">
                  {facilities.map((f) => (
                    <option key={f.id} value={f.name} />
                  ))}
                </datalist>
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="primary" isLoading={creatingRfq}>
                  Gửi RFQ
                </Button>
              </div>
            </form>
          </EditorialSection>

          <EditorialSection eyebrow="Báo giá" title={`Danh sách Quotes (${quotes.length})`}>
            {quotes.length === 0 ? (
              <EmptyNote>Chưa có báo giá nào được phát hành cho RFQ của bạn.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Mã Quote</th>
                      <th className="py-2 px-3">Tuyến / RFQ</th>
                      <th className="py-2 px-3">Tổng tiền</th>
                      <th className="py-2 px-3">Trạng thái</th>
                      <th className="py-2 pl-3 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id} className="border-b border-line/80">
                        <td className="py-2.5 pr-3 font-mono font-medium text-ink">{q.quoteNumber}</td>
                        <td className="py-2.5 px-3 text-ink-soft">
                          {q.rfq ? `${q.rfq.originName} -> ${q.rfq.destName}` : q.rfqId}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums font-medium text-ink">
                          {formatCurrency(Number(q.totalAmount))}
                          {q.currency && q.currency !== 'VND' ? ` ${q.currency}` : ''}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusLabel tone={STATUS_TONE[q.status] ?? 'neutral'}>{q.status}</StatusLabel>
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {q.status === 'ACCEPTED' || q.booking ? (
                            <span className="font-mono text-[11px] text-ink-faint">
                              Đã đặt: {q.booking?.bookingNo ?? 'BOOKED'}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => void handleAcceptQuote(q.id)}
                            >
                              Chấp nhận &amp; Đặt chỗ
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>

          <EditorialSection eyebrow="Lịch sử RFQ" title={`RFQ đã gửi (${rfqs.length})`}>
            {rfqs.length === 0 ? (
              <EmptyNote>Chưa có RFQ nào.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Mã RFQ</th>
                      <th className="py-2 px-3">Dịch vụ / Cont</th>
                      <th className="py-2 px-3">Tuyến</th>
                      <th className="py-2 px-3">Trạng thái</th>
                      <th className="py-2 pl-3">Ngày tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfqs.map((r) => (
                      <tr key={r.id} className="border-b border-line/80">
                        <td className="py-2.5 pr-3 font-mono text-ink">{r.rfqNumber}</td>
                        <td className="py-2.5 px-3 text-ink-soft">
                          {r.serviceMode} ({r.containerSize} x {r.containerQty})
                        </td>
                        <td className="py-2.5 px-3 text-ink">
                          {r.originName} -&gt; {r.destName}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusLabel tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</StatusLabel>
                        </td>
                        <td className="py-2.5 pl-3 text-ink-faint">{formatDateTimeVN(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>
        </div>
      ) : tab === 'shipments' ? (
        <div className="space-y-5">
          <EditorialSection eyebrow="Vận chuyển" title={`Lô hàng Freight (${shipments.length})`}>
            {shipments.length === 0 ? (
              <EmptyNote>Chưa có lô hàng Freight nào.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Shipment / Booking</th>
                      <th className="py-2 px-3">Container</th>
                      <th className="py-2 px-3">Chặng vận chuyển</th>
                      <th className="py-2 px-3">Trạng thái</th>
                      <th className="py-2 pl-3">Tracking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.map((s) => (
                      <tr key={s.id} className="border-b border-line/80">
                        <td className="py-2.5 pr-3">
                          <div className="font-mono font-medium text-ink">{s.shipmentNo}</div>
                          <div className="text-[11px] text-ink-faint">{s.booking?.bookingNo ?? '—'}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-soft">
                          {s.container?.containerNo ?? 'Chưa gán'}
                        </td>
                        <td className="py-2.5 px-3 text-ink-soft">
                          {(s.legs || []).length > 0
                            ? s.legs.map((l: any) => `${l.originName} -> ${l.destName}`).join(' | ')
                            : s.cargoDesc}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusLabel tone={STATUS_TONE[s.status] ?? 'neutral'}>{s.status}</StatusLabel>
                        </td>
                        <td className="py-2.5 pl-3 font-mono">
                          {s.trackingCode ? (
                            <Link href={`/track/${s.trackingCode}`} className="text-accent hover:underline">
                              {s.trackingCode}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>

          <EditorialSection eyebrow="Chứng từ XNK" title="Tải chứng từ thương mại">
            <form onSubmit={handleUploadDoc} className="mb-4 grid gap-3 md:grid-cols-5">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Loại chứng từ
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
                >
                  <option value="COMMERCIAL_INVOICE">Commercial Invoice (CI)</option>
                  <option value="PACKING_LIST">Packing List (PL)</option>
                  <option value="BILL_OF_LADING">Bill of Lading (B/L)</option>
                  <option value="CERTIFICATE_OF_ORIGIN">C/O Form</option>
                </select>
              </div>
              <Input
                label="Số chứng từ"
                placeholder="CI-2026-009"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                required
              />
              <Input
                label="Tên file"
                value={docFileName}
                onChange={(e) => setDocFileName(e.target.value)}
                required
              />
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Gắn vào lô hàng
                </label>
                <select
                  value={docShipmentId}
                  onChange={(e) => {
                    const shp = shipments.find((item) => item.id === e.target.value);
                    setDocShipmentId(e.target.value);
                    setDocBookingId(shp?.bookingId ?? '');
                  }}
                  className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
                >
                  <option value="">Không gắn cụ thể</option>
                  {shipments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shipmentNo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="primary" isLoading={uploadingDoc}>
                  Nộp chứng từ
                </Button>
              </div>
            </form>

            {documents.length === 0 ? (
              <EmptyNote>Chưa có chứng từ XNK nào.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Loại / Số hiệu</th>
                      <th className="py-2 px-3">File</th>
                      <th className="py-2 px-3">Booking</th>
                      <th className="py-2 px-3">Trạng thái</th>
                      <th className="py-2 pl-3">Cập nhật</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id} className="border-b border-line/80">
                        <td className="py-2 pr-3 font-mono text-ink">
                          {d.docType} / {d.docNumber}
                        </td>
                        <td className="py-2 px-3 text-ink-soft">{d.fileName}</td>
                        <td className="py-2 px-3 font-mono text-ink-faint">{d.booking?.bookingNo ?? '—'}</td>
                        <td className="py-2 px-3">
                          <StatusLabel tone={STATUS_TONE[d.status] ?? 'neutral'}>{d.status}</StatusLabel>
                        </td>
                        <td className="py-2 pl-3 text-ink-faint">{formatDateTimeVN(d.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>
        </div>
      ) : tab === 'finance' ? (
        <div className="space-y-5">
          <EditorialSection eyebrow="Công nợ AR" title={`Hóa đơn Freight & DEM/DET (${invoices.length})`}>
            {invoices.length === 0 ? (
              <EmptyNote>Chưa có hóa đơn cước quốc tế / DEM-DET nào.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Số hóa đơn</th>
                      <th className="py-2 px-3">Tổng tiền</th>
                      <th className="py-2 px-3">Đã thanh toán</th>
                      <th className="py-2 px-3">Hạn thanh toán</th>
                      <th className="py-2 pl-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-line/80">
                        <td className="py-2.5 pr-3 font-mono font-medium text-ink">{inv.invoiceNo}</td>
                        <td className="py-2.5 px-3 tabular-nums text-ink">
                          {formatCurrency(Number(inv.totalAmount))}
                          {inv.currency && inv.currency !== 'VND' ? ` ${inv.currency}` : ''}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums text-ink-soft">
                          {formatCurrency(Number(inv.paidAmount ?? 0))}
                        </td>
                        <td className="py-2.5 px-3 text-ink-soft">{formatDateTimeVN(inv.dueDate)}</td>
                        <td className="py-2.5 pl-3">
                          <StatusLabel tone={STATUS_TONE[inv.status] ?? 'neutral'}>{inv.status}</StatusLabel>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>

          <EditorialSection eyebrow="Khiếu nại" title="Mở tranh chấp hóa đơn / phụ phí DEM-DET">
            <form onSubmit={handleCreateDispute} className="mb-4 grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Hóa đơn liên quan
                </label>
                <select
                  value={disputeInvoiceId}
                  onChange={(e) => setDisputeInvoiceId(e.target.value)}
                  className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
                >
                  <option value="">Không chọn hóa đơn</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNo}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Số tiền khiếu nại (VND)"
                type="number"
                min={1000}
                value={disputeClaimedAmount}
                onChange={(e) => setDisputeClaimedAmount(e.target.value)}
                required
              />
              <Input
                label="Lý do tranh chấp"
                placeholder="Đối chiếu lại số ngày Detention thực tế tại Cảng..."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                required
              />
              <div className="flex items-end">
                <Button type="submit" variant="primary" isLoading={creatingDispute}>
                  Gửi khiếu nại
                </Button>
              </div>
            </form>

            {disputes.length === 0 ? (
              <EmptyNote>Chưa có khiếu nại nào.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Mã tranh chấp</th>
                      <th className="py-2 px-3">Số tiền yêu cầu</th>
                      <th className="py-2 px-3">Lý do</th>
                      <th className="py-2 pl-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map((d) => (
                      <tr key={d.id} className="border-b border-line/80">
                        <td className="py-2 pr-3 font-mono text-ink">{d.disputeCode}</td>
                        <td className="py-2 px-3 tabular-nums text-ink">{formatCurrency(Number(d.claimedAmount))}</td>
                        <td className="py-2 px-3 text-ink-soft">{d.reason}</td>
                        <td className="py-2 pl-3">
                          <StatusLabel tone={STATUS_TONE[d.status] ?? 'warning'}>{d.status}</StatusLabel>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>
        </div>
      ) : (
        <div className="space-y-5">
          <EditorialSection eyebrow="Chia sẻ có kiểm soát" title="Tạo Public Tracking Grant">
            <form onSubmit={handleCreateGrant} className="grid gap-3 md:grid-cols-4">
              <Input
                label="Mã vận đơn / Tracking Code"
                placeholder="VD: SLG-TRK-..."
                value={grantTrackingCode}
                onChange={(e) => setGrantTrackingCode(e.target.value)}
                required
              />
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Phạm vi tọa độ (Precision)
                </label>
                <select
                  value={grantPrecision}
                  onChange={(e) => setGrantPrecision(e.target.value as any)}
                  className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[12px] text-ink"
                >
                  <option value="CITY_WARD">CITY_WARD (làm tròn 2 chữ số ~1.1km)</option>
                  <option value="STATUS_ONLY">STATUS_ONLY (ẩn hoàn toàn tọa độ)</option>
                  <option value="FULL">FULL (tọa độ chính xác cho đối tác tin cậy)</option>
                </select>
              </div>
              <Input
                label="Thời hạn (giờ, 1–720)"
                type="number"
                min={1}
                max={720}
                value={grantTtlHours}
                onChange={(e) => setGrantTtlHours(e.target.value)}
                required
              />
              <div className="flex items-end">
                <Button type="submit" variant="primary" isLoading={creatingGrant}>
                  Cấp liên kết chia sẻ
                </Button>
              </div>
            </form>

            {mintedShare ? (
              <div className="mt-4 rounded-md border border-success/40 bg-success/5 p-3 text-[12px]">
                <p className="font-semibold text-ink">
                  Liên kết chia sẻ mới ({mintedShare.precision}) — sao chép ngay trước khi đóng trang:
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <code className="break-all rounded bg-canvas px-2 py-1 font-mono text-[11px] text-ink">
                    {`/track/${encodeURIComponent(mintedShare.trackingCode)}?token=${encodeURIComponent(mintedShare.shareToken)}`}
                  </code>
                  <Link
                    href={`/track/${encodeURIComponent(mintedShare.trackingCode)}?token=${encodeURIComponent(mintedShare.shareToken)}`}
                    className="font-medium text-accent underline"
                  >
                    Mở liên kết kiểm tra
                  </Link>
                </div>
              </div>
            ) : null}
          </EditorialSection>

          <EditorialSection eyebrow="Danh sách Grant" title={`Liên kết đã cấp (${grants.length})`}>
            {grants.length === 0 ? (
              <EmptyNote>Chưa có PublicTrackingGrant nào được tạo.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[660px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      <th className="py-2 pr-3">Tracking Code</th>
                      <th className="py-2 px-3">Precision</th>
                      <th className="py-2 px-3">Hết hạn</th>
                      <th className="py-2 px-3">Lượt truy cập</th>
                      <th className="py-2 px-3">Trạng thái</th>
                      <th className="py-2 pl-3 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((g) => {
                      const isRevoked = !!g.revokedAt;
                      const isExpired = new Date(g.expiresAt).getTime() <= Date.now();
                      return (
                        <tr key={g.id} className="border-b border-line/80">
                          <td className="py-2.5 pr-3 font-mono text-ink">{g.trackingCode}</td>
                          <td className="py-2.5 px-3">
                            <StatusLabel tone="info">{g.allowedPrecision}</StatusLabel>
                          </td>
                          <td className="py-2.5 px-3 text-ink-soft">{formatDateTimeVN(g.expiresAt)}</td>
                          <td className="py-2.5 px-3 tabular-nums text-ink-soft">{g.accessCount ?? 0}</td>
                          <td className="py-2.5 px-3">
                            <StatusLabel tone={isRevoked ? 'danger' : isExpired ? 'warning' : 'success'}>
                              {isRevoked ? 'REVOKED' : isExpired ? 'EXPIRED' : 'ACTIVE'}
                            </StatusLabel>
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            {!isRevoked ? (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void handleRevokeGrant(g.id)}
                              >
                                Thu hồi (Revoke)
                              </Button>
                            ) : (
                              <span className="text-[11px] text-ink-faint">
                                {formatDateTimeVN(g.revokedAt)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </EditorialSection>
        </div>
      )}
    </div>
  );
}
