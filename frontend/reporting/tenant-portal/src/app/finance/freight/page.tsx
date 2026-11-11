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

export default function FreightFinancePage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [demDetRules, setDemDetRules] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [demDetResult, setDemDetResult] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [outboxEvents, setOutboxEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Payment allocation quick form
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payAmount, setPayAmount] = useState('5000000');
  const [payRef, setPayRef] = useState(() => `TXN-BNK-${Date.now().toString(36).toUpperCase()}`);

  const loadAll = useCallback(async () => {
    if (isMockDataSource) {
      setLoading(false);
      setError('Phân hệ Giá cước, DEM/DET & DLQ yêu cầu Backend API.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [cR, dR, sR, iR, dispR, obR] = await Promise.all([
        api.get('/pricing/contracts'),
        api.get('/pricing/dem-det-rules'),
        api.get('/freight/shipments'),
        api.get('/pricing/invoices'),
        api.get('/pricing/disputes'),
        api.get('/webhooks/outbox').catch(() => ({ data: [] })),
      ]);
      const shList = unwrapList<any>(sR);
      const invList = unwrapList<any>(iR);
      setContracts(unwrapList<any>(cR));
      setDemDetRules(unwrapList<any>(dR));
      setShipments(shList);
      setInvoices(invList);
      setDisputes(unwrapList<any>(dispR));
      setOutboxEvents(unwrapList<any>(obR));

      if (!selectedShipmentId && shList.length > 0) setSelectedShipmentId(shList[0].id);
      if (!payInvoiceId && invList.length > 0) setPayInvoiceId(invList[0].id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được dữ liệu Tài chính Freight.');
    } finally {
      setLoading(false);
    }
  }, [selectedShipmentId, payInvoiceId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleComputeDemDet = async () => {
    if (!selectedShipmentId || isMockDataSource) return;
    setError('');
    try {
      const res = await api.get(`/pricing/shipments/${selectedShipmentId}/dem-det`);
      setDemDetResult(unwrapObj<any>(res));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không tính được phí DEM/DET.');
    }
  };

  const handleAllocatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payInvoiceId) return;
    setFeedback('');
    setError('');
    try {
      await api.post(`/pricing/invoices/${payInvoiceId}/payments`, {
        amount: Number(payAmount),
        reference: payRef,
        method: 'BANK_TRANSFER',
      });
      setFeedback(`Đã hạch toán thanh toán ${Number(payAmount).toLocaleString('vi-VN')} vào công nợ.`);
      setPayRef(`TXN-BNK-${Date.now().toString(36).toUpperCase()}`);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Thanh toán không hợp lệ hoặc vượt số dư.');
    }
  };

  const handleResolveDispute = async (id: string, status: 'RESOLVED_CREDIT' | 'REJECTED') => {
    setFeedback('');
    setError('');
    try {
      await api.patch(`/pricing/disputes/${id}/resolve`, {
        status,
        resolutionNotes: status === 'RESOLVED_CREDIT' ? 'Credit Note approved by Finance' : 'Verified charge matches tariff',
      });
      setFeedback(`Đã xử lý khiếu nại: ${status}`);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không xử lý được khiếu nại.');
    }
  };

  const handleRedriveOutbox = async (id: string) => {
    setFeedback('');
    setError('');
    try {
      await api.post(`/webhooks/outbox/${id}/redrive`);
      setFeedback(`Đã đưa sự kiện Outbox ${id.slice(0, 8)} về trạng thái PENDING để phát lại.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không redrive được sự kiện DLQ.');
    }
  };

  const deadLetters = outboxEvents.filter((o) => o.status === 'DEAD_LETTER');

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Tài chính Freight</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>DEM/DET, Công nợ & DLQ</span>
          </>
        }
        title="Hợp đồng cước, Tách đồng hồ DEM/DET, Công nợ & Outbox DLQ"
        description="Tính tách bạch Demurrage (lưu bãi/cảng) và Detention (giữ vỏ cont), phân bổ thanh toán AR/AP, xử lý khiếu nại Credit Note và khôi phục Dead-Letter Outbox."
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadAll()}>
            Làm mới
          </Button>
        }
      />

      {error ? <div className="rounded-md border-l-2 border-danger bg-surface px-4 py-2 text-[12px] text-ink">{error}</div> : null}
      {feedback ? <div className="rounded-md border-l-2 border-success bg-surface px-4 py-2 text-[12px] text-ink">{feedback}</div> : null}

      <MetricBand
        metrics={[
          { label: 'Biểu giá hợp đồng', value: contracts.length, meta: `Hết hạn: ${contracts.filter((c) => c.status === 'EXPIRED').length}` },
          { label: 'Chính sách DEM / DET', value: demDetRules.length, meta: 'Tách đồng hồ DEM & DET' },
          { label: 'Hóa đơn Freight (AR/AP)', value: invoices.length, meta: `Khiếu nại mở: ${disputes.filter((d) => d.status === 'OPEN').length}` },
          {
            label: 'Outbox Dead-Letter (DLQ)',
            value: deadLetters.length,
            meta: `Tổng Outbox: ${outboxEvents.length}`,
            tone: deadLetters.length > 0 ? 'danger' : 'success',
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <EditorialSection eyebrow="Cảnh báo hết hạn" title={`Hợp đồng cước (${contracts.length})`}>
          {loading ? (
            <EmptyNote>Đang tải hợp đồng...</EmptyNote>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead className="border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  <tr>
                    <th className="px-3 py-2">Mã HĐ</th>
                    <th className="px-3 py-2">Tuyến & Loại Cont</th>
                    <th className="px-3 py-2">Đơn giá cơ sở</th>
                    <th className="px-3 py-2">Hiệu lực</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {contracts.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-mono">{c.contractCode}</td>
                      <td className="px-3 py-2 text-ink-soft">
                        {c.originName} -&gt; {c.destName} ({c.containerSize})
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {Number(c.baseRate).toLocaleString('vi-VN')} {c.currency}
                      </td>
                      <td className="px-3 py-2">
                        <StatusLabel tone={c.status === 'ACTIVE' ? 'success' : 'danger'}>{c.status}</StatusLabel>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </EditorialSection>

        <EditorialSection eyebrow="2 Đồng hồ độc lập" title="Tính phí Demurrage (DEM) & Detention (DET)">
          <div className="space-y-3 rounded-md border border-line bg-surface p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Chọn Lô hàng Container
                </label>
                <select
                  value={selectedShipmentId}
                  onChange={(e) => setSelectedShipmentId(e.target.value)}
                  className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]"
                >
                  {shipments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shipmentNo} ({s.container?.containerNo || s.status})
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="primary" size="sm" onClick={() => void handleComputeDemDet()} disabled={!selectedShipmentId}>
                Tính DEM & DET
              </Button>
            </div>

            {demDetResult ? (
              <div className="space-y-2 border-t border-line pt-3 text-[12px]">
                <div className="flex items-center justify-between">
                  <StatusLabel tone="success">Tách bạch đồng hồ (clocksSeparated: {String(demDetResult.clocksSeparated)})</StatusLabel>
                  <span className="font-mono font-semibold text-ink">
                    Tổng: {Number(demDetResult.totalDemDet || 0).toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="rounded border border-line bg-canvas p-2.5">
                    <p className="font-semibold text-ink">DEMURRAGE (Lưu cảng/bãi)</p>
                    <p className="mt-1 text-ink-soft">
                      Ngày tính phí: {demDetResult.demurrage?.chargeableDays ?? 0} ngày (Miễn: {demDetResult.demurrage?.freeDays ?? 0})
                    </p>
                    <p className="font-mono font-medium text-ink">
                      {Number(demDetResult.demurrage?.totalAmount || 0).toLocaleString('vi-VN')} VND
                    </p>
                  </div>
                  <div className="rounded border border-line bg-canvas p-2.5">
                    <p className="font-semibold text-ink">DETENTION (Giữ vỏ cont)</p>
                    <p className="mt-1 text-ink-soft">
                      Ngày tính phí: {demDetResult.detention?.chargeableDays ?? 0} ngày (Miễn: {demDetResult.detention?.freeDays ?? 0})
                    </p>
                    <p className="font-mono font-medium text-ink">
                      {Number(demDetResult.detention?.totalAmount || 0).toLocaleString('vi-VN')} VND
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </EditorialSection>
      </div>

      <EditorialSection eyebrow="Sổ cái AR/AP" title={`Hóa đơn Freight (${invoices.length}) & Phân bổ thanh toán`}>
        <form onSubmit={handleAllocatePayment} className="mb-4 grid gap-3 rounded-md border border-line bg-surface p-3 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Chọn Hóa đơn</label>
            <select value={payInvoiceId} onChange={(e) => setPayInvoiceId(e.target.value)} className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]">
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNo} ({inv.direction} · Dư {Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount)).toLocaleString('vi-VN')})
                </option>
              ))}
            </select>
          </div>
          <Input label="Số tiền thanh toán" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
          <Input label="Mã tham chiếu giao dịch" value={payRef} onChange={(e) => setPayRef(e.target.value)} required />
          <Button type="submit" variant="primary" size="sm" disabled={!payInvoiceId}>Hạch toán thanh toán</Button>
        </form>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Số Hóa Đơn</th>
                  <th className="px-3 py-2">Loại</th>
                  <th className="px-3 py-2">Tổng / Đã trả</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-3 py-2 font-mono">{inv.invoiceNo}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{inv.direction}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {Number(inv.totalAmount).toLocaleString('vi-VN')} / {Number(inv.paidAmount).toLocaleString('vi-VN')} {inv.currency}
                    </td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={inv.status === 'PAID' ? 'success' : inv.status === 'DISPUTED' ? 'warning' : 'info'}>
                        {inv.status}
                      </StatusLabel>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-md border border-line bg-surface p-3">
            <h3 className="text-[13px] font-semibold text-ink">Khiếu nại hóa đơn / DEM-DET ({disputes.length})</h3>
            {disputes.length === 0 ? (
              <EmptyNote>Không có khiếu nại nào.</EmptyNote>
            ) : (
              disputes.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[12px]">
                  <div>
                    <span className="font-mono font-medium">{d.disputeCode}</span> ({d.category}) ·{' '}
                    {Number(d.claimedAmount).toLocaleString('vi-VN')} ·{' '}
                    <StatusLabel tone={d.status === 'OPEN' ? 'warning' : 'success'}>{d.status}</StatusLabel>
                    <p className="text-[11px] text-ink-soft">{d.reason}</p>
                  </div>
                  {d.status === 'OPEN' ? (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => void handleResolveDispute(d.id, 'RESOLVED_CREDIT')}>
                        Duyệt Credit Note
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void handleResolveDispute(d.id, 'REJECTED')}>
                        Bác bỏ
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Độ tin cậy hệ thống" title={`Outbox & Webhook Dead-Letter Queue (DLQ: ${deadLetters.length})`}>
        {outboxEvents.length === 0 ? (
          <EmptyNote>Chưa có bản ghi Outbox hoặc tài khoản không có quyền xem SettingsManage.</EmptyNote>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Topic / Kênh</th>
                  <th className="px-3 py-2">Số lần thử</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Lý do lỗi / DLQ</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {outboxEvents.slice(0, 20).map((evt) => (
                  <tr key={evt.id}>
                    <td className="px-3 py-2 font-mono text-[11px]">{evt.channel} · {evt.topic}</td>
                    <td className="px-3 py-2 tabular-nums">{evt.attempts} / {evt.maxAttempts}</td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={evt.status === 'SENT' ? 'success' : evt.status === 'DEAD_LETTER' ? 'danger' : 'warning'}>
                        {evt.status}
                      </StatusLabel>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ink-soft">{evt.deadLetterReason || evt.lastError || '—'}</td>
                    <td className="px-3 py-2">
                      {evt.status === 'DEAD_LETTER' ? (
                        <Button size="sm" variant="primary" onClick={() => void handleRedriveOutbox(evt.id)}>
                          Redrive DLQ
                        </Button>
                      ) : (
                        <span className="text-[11px] text-ink-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EditorialSection>
    </div>
  );
}
