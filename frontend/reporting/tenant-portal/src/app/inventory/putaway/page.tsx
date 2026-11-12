'use client';

import { data } from '@/lib/data';
import { EditorialPageHeader, EditorialSection, EmptyNote } from 'ui-kit';
import { TableState } from 'ui-components';
import { formatDateTimeVN } from '@/lib/labels';
import type { StockMovement } from '@/lib/mock';
import { useEffect, useState, useCallback } from 'react';

type Suggestion = {
  binCode: string;
  warehouseCode: string;
  zone: string;
  remainingVolume: number;
};

type FormState = {
  sku: string;
  quantity: string;
};

export default function PutawayPage() {
  const [form, setForm] = useState<FormState>({ sku: '', quantity: '' });
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movLoading, setMovLoading] = useState(true);
  const [movError, setMovError] = useState('');

  const loadMovements = useCallback(async () => {
    setMovLoading(true);
    setMovError('');
    try {
      const rows = await data.movements.list((row) => row.type === 'RECEIVE');
      setMovements(rows);
    } catch (err: any) {
      setMovError(err?.message || 'Không tải được nhật ký nhập kho.');
    } finally {
      setMovLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const sku = form.sku.trim();
  const quantity = Number(form.quantity);
  const quantityOk = Number.isInteger(quantity) && quantity > 0;

  const loadSuggestion = useCallback(async () => {
    setSuggestion(null);
    setSuggestError('');
    setConfirmError('');
    setConfirmed(false);
    if (!sku || !quantityOk) {
      setSuggestError(sku ? 'Nhập số lượng hợp lệ.' : 'Nhập mã SKU.');
      return;
    }
    setSuggesting(true);
    try {
      const result = await data.inventory.putawaySuggestion(sku, quantity);
      setSuggestion(result);
    } catch (err: any) {
      setSuggestError(err?.message || 'Không gợi ý được vị trí cất hàng.');
    } finally {
      setSuggesting(false);
    }
  }, [sku, quantityOk]);

  const handleConfirm = useCallback(async () => {
    if (!suggestion) return;
    setConfirming(true);
    setConfirmError('');
    try {
      await data.inventory.receive({
        sku,
        warehouseCode: suggestion.warehouseCode,
        binCode: suggestion.binCode,
        quantity,
      });
      setConfirming(false);
      setSuggestion(null);
      setForm({ sku: '', quantity: '' });
      setConfirmed(true);
      void loadMovements();
    } catch (err: any) {
      setConfirming(false);
      setConfirmError(err?.message || 'Xác nhận nhập kho thất bại.');
    }
  }, [suggestion, sku, quantity, loadMovements]);

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      void loadSuggestion();
    },
    [loadSuggestion],
  );

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Trợ lý dừng kho"
        title="Cất hàng thông minh"
        description="Nhập mã SKU và số lượng nhập để AI đề xuất vị trí cất (bin/zone/kho) phù hợp sức chứa. Khi xác nhận, hệ thống sẽ ghi nhận phiếu nhập kho vào dữ liệu mẫu."
        meta={
          <span className="text-[11px] leading-5 text-ink-faint">
            Cập nhật {formatDateTimeVN(new Date().toISOString())}
          </span>
        }
        actions={
          <button
            type="button"
            onClick={loadMovements}
            disabled={movLoading}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {movLoading ? 'Đang tải…' : 'Làm mới dữ liệu'}
          </button>
        }
      />

      {suggestError ? (
        <div className="flex items-center gap-2 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-faint">
          <span>{suggestError}</span>
          <button type="button" onClick={loadSuggestion} className="font-medium text-accent underline decoration-accent/30 hover:decoration-accent">
            Thử lại
          </button>
        </div>
      ) : null}

      {confirmError ? (
        <div className="flex items-center gap-2 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-faint">
          <span>{confirmError}</span>
          <button type="button" onClick={loadSuggestion} className="font-medium text-accent underline decoration-accent/30 hover:decoration-accent">
            Thử lại
          </button>
        </div>
      ) : null}

      {confirmed ? (
        <div className="flex items-center gap-2 border-l-2 border-success bg-surface px-3 py-2 text-[12px] text-ink-faint">
          <span>Nhập kho thành công — hàng về bin đã đề xuất, không phát sinh lỗi.</span>
          <button type="button" onClick={() => setConfirmed(false)} className="font-medium text-accent underline decoration-accent/30 hover:decoration-accent">
            Vận hành tiếp
          </button>
        </div>
      ) : null}

      <EditorialSection eyebrow="Gợi ý" title="Số lượng cần cất">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Mã SKU</span>
            <input
              type="text"
              value={form.sku}
              onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
              placeholder="VD: SLG-MILK-001"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              pattern="^[A-Za-z0-9-]+$"
              title="Chỉ cho phép chữ, số và dấu gạch ngang."
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-soft">Số lượng</span>
            <input
              type="number"
              inputMode="numeric"
              value={form.quantity}
              onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
              min={1}
              step={1}
              placeholder="VD: 12"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              required
            />
          </label>
          <button
            type="submit"
            disabled={suggesting}
            className="ml-auto h-9 rounded-md border border-line bg-accent px-4 text-[12px] font-medium text-surface transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {suggesting ? 'Đang tải…' : 'Tìm vị trí cất'}
          </button>
        </form>
        <div className="mt-3">
          <EmptyNote>
            Các bin của kho đang hoạt động được đánh giá từ sức chứa (số kg và CBM); kho bảo trì không được đề xuất.
          </EmptyNote>
        </div>
      </EditorialSection>

      {suggestion ? (
        <EditorialSection eyebrow="Kết quả" title={`Đề xuất cho ${sku}`}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Kho đề xuất</p>
              <p className="mt-1 text-[13px] font-medium text-ink">{suggestion.warehouseCode}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Vị trí bin</p>
              <p className="mt-1 text-[13px] font-medium text-ink">{suggestion.binCode}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Khu vực</p>
              <p className="mt-1 text-[13px] font-medium text-ink">{suggestion.zone}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              className="h-9 rounded-md border border-line bg-accent px-4 text-[12px] font-medium text-surface transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirming ? 'Đang xác nhận…' : 'Xác nhận nhập kho'}
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              Bỏ qua
            </button>
          </div>
        </EditorialSection>
      ) : null}

      <EditorialSection eyebrow="Nhật ký" title="Phiếu nhập gần đây">
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-surface-alt">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">SKU</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tên hàng</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Số lượng</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Kho</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Bin</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Thời gian</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tồn sau</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-[13px]">
              <TableState
                loading={movLoading}
                empty={!movLoading && movements.length === 0}
                error={movError ? new Error(movError) : undefined}
                onRetry={loadMovements}
                colSpan={7}
                emptyContent={
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[13px] text-ink-faint">
                      Chưa có phiếu nhập kho nào được ghi nhận.
                    </td>
                  </tr>
                }
              >
                {movements.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-alt">
                    <td className="px-4 py-2 text-[13px] font-medium text-ink">{row.sku}</td>
                    <td className="px-4 py-2 text-[13px] text-ink-soft">{row.productName}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{row.quantity}</td>
                    <td className="px-4 py-2 text-[13px] text-ink">{row.warehouseCode}</td>
                    <td className="px-4 py-2 text-[13px] text-ink">{row.binCode}</td>
                    <td className="px-4 py-2 text-[13px] text-ink-faint">{formatDateTimeVN(row.at)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{row.balanceAfter}</td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
        </div>
      </EditorialSection>

      <EditorialSection title="Hướng dẫn">
        <EmptyNote>
          Số liệu được sinh từ dữ liệu mẫu: SKU tồn tại trong bảng mã hàng (`products`), sức chứa bin theo kho đang hoạt động.
        </EmptyNote>
      </EditorialSection>
    </div>
  );
}
