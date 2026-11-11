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

export default function TradePage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [decls, setDecls] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gateError, setGateError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Upload trade doc form
  const [docBookingId, setDocBookingId] = useState('');
  const [docType, setDocType] = useState('COMMERCIAL_INVOICE');
  const [docNumber, setDocNumber] = useState('CI-2026-8801');
  const [fileName, setFileName] = useState('commercial_invoice.pdf');
  const [grossWeightKg, setGrossWeightKg] = useState('14200');
  const [packageCount, setPackageCount] = useState('120');
  const [simulateFailure, setSimulateFailure] = useState('');

  // HS Suggestion + Declaration
  const [declBookingId, setDeclBookingId] = useState('');
  const [declPortCode, setDeclPortCode] = useState('VNSGN');
  const [declChannel, setDeclChannel] = useState('YELLOW');
  const [hsDeclId, setHsDeclId] = useState('');
  const [hsItemDesc, setHsItemDesc] = useState('Printed circuits & electronic sub-assemblies for industrial controllers');
  const [reconcileResult, setReconcileResult] = useState<any>(null);

  const loadAll = useCallback(async () => {
    if (isMockDataSource) {
      setLoading(false);
      setError('Phân hệ XNK & Hải quan yêu cầu Backend API.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [dR, decR, bR] = await Promise.all([
        api.get('/trade/documents'),
        api.get('/trade/declarations'),
        api.get('/freight/bookings'),
      ]);
      const dList = unwrapList<any>(dR);
      const decList = unwrapList<any>(decR);
      const bList = unwrapList<any>(bR);
      setDocs(dList);
      setDecls(decList);
      setBookings(bList);
      if (!docBookingId && bList.length > 0) setDocBookingId(bList[0].id);
      if (!declBookingId && bList.length > 0) setDeclBookingId(bList[0].id);
      if (!hsDeclId && decList.length > 0) setHsDeclId(decList[0].id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được hồ sơ XNK.');
    } finally {
      setLoading(false);
    }
  }, [docBookingId, declBookingId, hsDeclId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setGateError('');
    try {
      await api.post('/trade/documents', {
        bookingId: docBookingId || undefined,
        docType,
        docNumber,
        fileName,
        mimeType: 'application/pdf',
        extractedJson: simulateFailure
          ? undefined
          : {
              grossWeightKg: Number(grossWeightKg || 0),
              packageCount: Number(packageCount || 0),
              currency: 'USD',
            },
        ...(simulateFailure ? { simulateFailure } : {}),
      });
      setFeedback('Đã lưu chứng từ XNK.');
      await loadAll();
    } catch (err: any) {
      setGateError(err?.response?.data?.message || 'Tải chứng từ thất bại.');
    }
  };

  const handleReconcile = async (bookingId: string) => {
    if (!bookingId) return;
    setGateError('');
    setFeedback('');
    try {
      const res = await api.post(`/trade/bookings/${bookingId}/reconcile`);
      const data = res?.data ?? res;
      setReconcileResult(data);
      setFeedback(`Đối chiếu Booking: ${data.status} (${data.discrepancyCount} sai lệch).`);
      await loadAll();
    } catch (err: any) {
      setGateError(err?.response?.data?.message || 'Không đối chiếu được bộ chứng từ.');
    }
  };

  const handleCreateDecl = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError('');
    try {
      await api.post('/trade/declarations', {
        bookingId: declBookingId || undefined,
        direction: 'EXPORT',
        channel: declChannel,
        portCode: declPortCode,
      });
      setFeedback('Đã khởi tạo tờ khai ở trạng thái NEEDS_CUSTOMS_REVIEW.');
      await loadAll();
    } catch (err: any) {
      setGateError(err?.response?.data?.message || 'Không tạo được tờ khai.');
    }
  };

  const handleSuggestHs = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError('');
    try {
      await api.post('/trade/hs-suggestions', {
        declarationId: hsDeclId || undefined,
        itemDescription: hsItemDesc,
      });
      setFeedback('Đã tạo gợi ý mã HS (advisoryOnly=true, trạng thái NEEDS_CUSTOMS_REVIEW).');
      await loadAll();
    } catch (err: any) {
      setGateError(err?.response?.data?.message || 'Không gợi ý được mã HS.');
    }
  };

  const handleReviewHs = async (suggestionId: string, decision: 'APPROVED' | 'REJECTED') => {
    setGateError('');
    try {
      await api.post(`/trade/hs-suggestions/${suggestionId}/review`, {
        decision,
        reviewNote: decision === 'APPROVED' ? 'Verified against VN Export Tariff 2026' : 'Rejected by Customs Officer',
      });
      setFeedback(`Đã ghi nhận quyết định nhân sự XNK: ${decision}.`);
      await loadAll();
    } catch (err: any) {
      setGateError(err?.response?.data?.message || 'Không có quyền trade:approve hoặc lỗi kiểm duyệt.');
    }
  };

  const handleSubmitDecl = async (declId: string) => {
    setGateError('');
    setFeedback('');
    try {
      await api.post(`/trade/declarations/${declId}/submit`);
      setFeedback('Đã truyền tờ khai Hải quan thành công.');
      await loadAll();
    } catch (err: any) {
      setGateError(err?.response?.data?.message || 'Tờ khai bị chặn tại Cổng kiểm tra XNK.');
    }
  };

  const mismatchCount = docs.filter((d) => d.status === 'MISMATCH_FOUND').length;
  const rejectedCount = docs.filter((d) => d.status === 'REJECTED').length;
  const pendingReviewDecls = decls.filter((d) => d.status === 'NEEDS_CUSTOMS_REVIEW').length;

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Xuất nhập khẩu</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Chứng từ & Hải quan</span>
          </>
        }
        title="Hồ sơ Chứng từ XNK (CI / PL / BL) & Cổng duyệt HS Code"
        description="Tự động phát hiện sai lệch giữa Commercial Invoice, Packing List và Bill of Lading. Mọi gợi ý mã HS chỉ mang tính tham khảo (NEEDS_CUSTOMS_REVIEW) trước khi nhân viên XNK phê duyệt truyền tờ khai."
        meta={<StatusLabel tone={pendingReviewDecls > 0 ? 'warning' : 'success'}>Cổng HS Review Bắt buộc</StatusLabel>}
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadAll()}>
            Làm mới
          </Button>
        }
      />

      {error ? <div className="rounded-md border-l-2 border-danger bg-surface px-4 py-2 text-[12px] text-ink">{error}</div> : null}
      {gateError ? (
        <div className="rounded-md border-l-2 border-warning bg-surface px-4 py-2 text-[12px] text-ink">
          <strong>Cảnh báo Cổng Tuân thủ XNK:</strong> {gateError}
        </div>
      ) : null}
      {feedback ? <div className="rounded-md border-l-2 border-success bg-surface px-4 py-2 text-[12px] text-ink">{feedback}</div> : null}

      <MetricBand
        metrics={[
          { label: 'Chứng từ CI/PL/BL', value: docs.length, meta: `Từ chối/Lỗi: ${rejectedCount}` },
          {
            label: 'Chứng từ lệch số liệu',
            value: mismatchCount,
            meta: 'MISMATCH_FOUND',
            tone: mismatchCount > 0 ? 'danger' : 'success',
          },
          {
            label: 'Tờ khai chờ duyệt HS',
            value: pendingReviewDecls,
            meta: `Tổng tờ khai: ${decls.length}`,
            tone: pendingReviewDecls > 0 ? 'warning' : 'success',
          },
          { label: 'Booking XNK', value: bookings.length, meta: 'Đối chiếu 3 bên CI-PL-BL' },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <EditorialSection eyebrow="Hồ sơ chứng từ" title="Tải chứng từ CI / PL / BL & Kiểm lỗi file">
          <form onSubmit={handleUploadDoc} className="space-y-3 rounded-md border border-line bg-surface p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Booking</label>
                <select value={docBookingId} onChange={(e) => setDocBookingId(e.target.value)} className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]">
                  <option value="">-- Không gắn Booking --</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>{b.bookingNo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Loại chứng từ</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]">
                  <option value="COMMERCIAL_INVOICE">COMMERCIAL_INVOICE</option>
                  <option value="PACKING_LIST">PACKING_LIST</option>
                  <option value="BILL_OF_LADING">BILL_OF_LADING</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Số chứng từ" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} required />
              <Input label="Tên file" value={fileName} onChange={(e) => setFileName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Gross Weight (kg)" type="number" value={grossWeightKg} onChange={(e) => setGrossWeightKg(e.target.value)} />
              <Input label="Số kiện (Packages)" type="number" value={packageCount} onChange={(e) => setPackageCount(e.target.value)} />
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Kiểm thử file lỗi</label>
                <select value={simulateFailure} onChange={(e) => setSimulateFailure(e.target.value)} className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]">
                  <option value="">File hợp lệ (Trích xuất OCR/JSON)</option>
                  <option value="PASSWORD_PROTECTED">PDF đặt mật khẩu (REJECTED)</option>
                  <option value="CORRUPTED">File lỗi hỏng (REJECTED)</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" size="sm">Lưu chứng từ</Button>
              {docBookingId ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleReconcile(docBookingId)}>
                  Đối chiếu CI / PL / BL ngay
                </Button>
              ) : null}
            </div>
          </form>

          {reconcileResult ? (
            <div className="mt-3 rounded border border-line bg-surface-alt p-3 text-[12px]">
              <StatusLabel tone={reconcileResult.status === 'MISMATCH_FOUND' ? 'danger' : 'success'}>
                {reconcileResult.status}
              </StatusLabel>
              {Array.isArray(reconcileResult.discrepancies) && reconcileResult.discrepancies.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[11px] text-ink-soft">
                  {reconcileResult.discrepancies.map((d: any, i: number) => (
                    <li key={i} className="font-mono">
                      [{d.severity}] {d.field}: {d.sourceA}={String(d.valueA)} != {d.sourceB}={String(d.valueB)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[11px] text-ink-soft">Không phát hiện sai lệch giữa CI / PL / BL.</p>
              )}
            </div>
          ) : null}
        </EditorialSection>

        <EditorialSection eyebrow="AI Tham vấn & Phê duyệt" title="Tờ khai Hải quan & Gợi ý Mã HS">
          <div className="space-y-4">
            <form onSubmit={handleCreateDecl} className="grid gap-3 rounded-md border border-line bg-surface p-3 sm:grid-cols-4 sm:items-end">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Booking</label>
                <select value={declBookingId} onChange={(e) => setDeclBookingId(e.target.value)} className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]">
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>{b.bookingNo}</option>
                  ))}
                </select>
              </div>
              <Input label="Mã cảng" value={declPortCode} onChange={(e) => setDeclPortCode(e.target.value)} />
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Luồng</label>
                <select value={declChannel} onChange={(e) => setDeclChannel(e.target.value)} className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]">
                  <option value="GREEN">GREEN (Xanh)</option>
                  <option value="YELLOW">YELLOW (Vàng)</option>
                  <option value="RED">RED (Đỏ)</option>
                </select>
              </div>
              <Button type="submit" variant="secondary" size="sm">Tạo tờ khai</Button>
            </form>

            <form onSubmit={handleSuggestHs} className="space-y-2 rounded-md border border-line bg-surface p-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Gắn với Tờ khai</label>
                <select value={hsDeclId} onChange={(e) => setHsDeclId(e.target.value)} className="h-9 w-full rounded border border-line bg-canvas px-2 text-[12px]">
                  <option value="">-- Tham vấn độc lập --</option>
                  {decls.map((d) => (
                    <option key={d.id} value={d.id}>{d.declarationNo} ({d.status})</option>
                  ))}
                </select>
              </div>
              <Input label="Mô tả hàng hóa XNK" value={hsItemDesc} onChange={(e) => setHsItemDesc(e.target.value)} required />
              <Button type="submit" variant="primary" size="sm">Yêu cầu AI Gợi ý Mã HS (NEEDS_CUSTOMS_REVIEW)</Button>
            </form>
          </div>
        </EditorialSection>
      </div>

      <EditorialSection eyebrow="Kiểm duyệt Human-in-the-Loop" title={`Tờ khai & Cổng truyền Hải quan (${decls.length})`}>
        {loading ? (
          <EmptyNote>Đang tải danh sách tờ khai...</EmptyNote>
        ) : decls.length === 0 ? (
          <EmptyNote>Chưa có tờ khai hải quan nào.</EmptyNote>
        ) : (
          <div className="space-y-3">
            {decls.map((decl) => (
              <div key={decl.id} className="rounded-md border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[13px] font-semibold text-ink">{decl.declarationNo}</span>
                    <StatusLabel tone={decl.status === 'CLEARED' || decl.status === 'SUBMITTED' ? 'success' : 'warning'}>
                      {decl.status}
                    </StatusLabel>
                    <span className="font-mono text-[11px] text-ink-faint">
                      {decl.direction} · Luồng {decl.channel} · Cảng {decl.portCode}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={decl.status === 'CLEARED' || decl.status === 'SUBMITTED'}
                    onClick={() => void handleSubmitDecl(decl.id)}
                  >
                    Truyền tờ khai Hải quan
                  </Button>
                </div>

                {Array.isArray(decl.hsSuggestions) && decl.hsSuggestions.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    {decl.hsSuggestions.map((hs: any) => (
                      <div key={hs.id} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                        <div>
                          <span className="font-mono font-semibold text-ink">{hs.suggestedHsCode}</span>
                          {' · '}
                          <span className="text-ink-soft">{hs.itemDescription}</span>
                          {' · '}
                          <StatusLabel tone={hs.status === 'APPROVED' ? 'success' : hs.status === 'REJECTED' ? 'danger' : 'warning'}>
                            {hs.status}
                          </StatusLabel>
                        </div>
                        {hs.status === 'NEEDS_CUSTOMS_REVIEW' ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => void handleReviewHs(hs.id, 'APPROVED')}>
                              Duyệt HS (Human Gate)
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void handleReviewHs(hs.id, 'REJECTED')}>
                              Từ chối
                            </Button>
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-ink-faint">{hs.reviewNote || hs.status}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </EditorialSection>

      <EditorialSection eyebrow="Kho chứng từ" title={`Tất cả Chứng từ XNK (${docs.length})`}>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="border-b border-line bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              <tr>
                <th className="px-3 py-2">Loại</th>
                <th className="px-3 py-2">Số chứng từ / File</th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Ghi chú sai lệch / Lỗi trích xuất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 font-mono text-[11px]">{d.docType}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono">{d.docNumber}</div>
                    <div className="text-[11px] text-ink-faint">{d.fileName} (v{d.versions?.length || 1})</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{d.booking?.bookingNo || '—'}</td>
                  <td className="px-3 py-2">
                    <StatusLabel tone={d.status === 'VERIFIED' ? 'success' : d.status === 'MISMATCH_FOUND' || d.status === 'REJECTED' ? 'danger' : 'info'}>
                      {d.status}
                    </StatusLabel>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-ink-soft">
                    {d.discrepanciesJson ? JSON.stringify(d.discrepanciesJson).slice(0, 140) : 'Hợp lệ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EditorialSection>
    </div>
  );
}
