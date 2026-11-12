'use client';

import { useCallback, useEffect, useState } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import { TableState, Select, Input } from 'ui-components';
import {
  formatCurrency,
  formatDateVN,
  listSummary,
} from '@/lib/labels';

/** Tồn ký gửi theo SKU, kho, hạn sử dụng. Cảnh báo dưới điểm đặt lại. */

type WarehouseOption = { value: string; label: string };

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN').format(value);
}

/** Số lượng khả dụng subsequents một nhãn trạng thái thay cho con số thuần. */
function stockStatus(available: number | null | undefined, reorderPoint: number | null | undefined, quantity: number | null | undefined) {
  const availability = typeof available === 'number' ? available : 0;
  const point = typeof reorderPoint === 'number' ? reorderPoint : 0;
  if (quantity === 0 || availability === 0) return { tone: 'danger' as const, label: 'Hết hàng' };
  if (availability <= point) return { tone: 'danger' as const, label: 'Sắp hết' };
  return { tone: 'success' as const, label: 'Còn hàng' };
}

export default function ClientInventory() {
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchStock = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await data.stock.list();
      setStock(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStock();
  }, [fetchStock]);

  const filtered = stock
    .filter((row) => !warehouseFilter || row.warehouseCode === warehouseFilter)
    .filter((row) => !searchQuery || `${row.sku} ${row.name}`.toLowerCase().includes(searchQuery.toLowerCase()));

  /** Danh sách kho duy nhất lấy từ dữ liệu tồn, tránh hardcoded. */
  const warehouses: WarehouseOption[] = [
    { value: '', label: 'Tất cả kho' },
    ...Array.from(new Set(stock.map((row: any) => row.warehouseCode))).map((code) => ({
      value: code,
      label: stock.find((row: any) => row.warehouseCode === code)?.warehouseName ?? code,
    })),
  ];

  const availableTotal = stock.reduce((sum: number, row: any) => sum + (row.available ?? 0), 0);
  const lowStock = stock.filter((row) => row.available <= row.reorderPoint && row.available > 0);
  const outOfStock = stock.filter((row) => row.quantity === 0);
  const totalWarehouse = warehouses.length - 1;

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Tồn kho</span>
          </>
        }
        title="Tồn ký gửi"
        description="Tồn kho theo SKU, kho, hạn sử dụng và khả dụng. Cảnh báo dưới điểm đặt lại hiện cảnh báo."
      />

      <MetricBand
        metrics={[
          {
            label: 'SKU',
            value: loading ? '—' : formatNumber(stock.length),
            meta: 'Tổng dòng tồn',
          },
          {
            label: 'Khả dụng',
            value: loading ? '—' : formatNumber(availableTotal),
            meta: 'Đang đặt hàng',
          },
          {
            label: 'Cảnh báo',
            value: loading ? '—' : formatNumber(lowStock.length + outOfStock.length),
            meta: 'Sắp hết / hết hàng',
            tone: outOfStock.length > 0 ? 'danger' : 'warning',
          },
          {
            label: 'Kho',
            value: loading ? '—' : formatNumber(totalWarehouse),
            meta: 'Tổng số kho',
          },
        ]}
      />

      <EditorialSection eyebrow="Lọc" title="Bộ lọc">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Kho"
            options={warehouses}
            value={warehouseFilter}
            onChange={(event) => setWarehouseFilter(event.target.value)}
            className="min-w-[160px]"
          />
          <Input
            type="text"
            label="Tìm SKU hoặc tên"
            placeholder="SKU-0001"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-w-[240px]"
          />
          <button
            type="button"
            onClick={fetchStock}
            className="h-10 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            Làm mới
          </button>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Kho hàng" title={listSummary(filtered.length, 'dòng tồn')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <caption className="sr-only">Bảng tồn kho theo SKU/kho của công</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  SKU
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Tên hàng
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Kho
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Số lượng
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Đã đặt trước
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Khả dụng
                </th>
                <th scope="col" className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Ngày hết hạn
                </th>
                <th scope="col" className="h-9 pl-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Giá
                </th>
              </tr>
            </thead>
            <tbody>
              <TableState
                loading={loading}
                empty={!filtered.length}
                error={error || undefined}
                colSpan={8}
                emptyTitle="Chưa có tồn kho"
                emptyDescription="Dữ liệu tồn của công ty sẽ hiển thị ở đây."
                onRetry={fetchStock}
              >
                {filtered.map((row: any) => {
                  const status = stockStatus(row.available, row.reorderPoint, row.quantity);
                  return (
                    <tr key={row.id} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                      <td className="pr-3 font-mono text-[12px] font-medium text-ink">{row.sku}</td>
                      <td className="px-3 text-[12px] text-ink-soft">{row.name}</td>
                      <td className="px-3 text-[12px] text-ink-soft">{row.warehouseName}</td>
                      <td className="px-3 text-right text-[12px] font-medium tabular-nums text-ink">{row.quantity}</td>
                      <td className="px-3 text-right text-[12px] font-medium tabular-nums text-ink-soft">{row.reserved}</td>
                      <td className="px-3">
                        <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
                      </td>
                      <td className="px-3 text-[12px] tabular-nums text-ink-soft">
                        {formatDateVN(row.expiryDate)}
                      </td>
                      <td className="px-3 text-right text-[12px] font-medium tabular-nums text-ink">
                        {formatCurrency(row.priceVnd)}
                      </td>
                    </tr>
                  );
                })}
              </TableState>
            </tbody>
          </table>
        </div>
      </EditorialSection>

      {lowStock.length > 0 || outOfStock.length > 0 ? (
        <EditorialSection eyebrow="Cảnh báo" title="Tồn sắp hết">
          <div className="space-y-2">
            {lowStock.map((row: any) => (
              <div key={row.id} className="flex items-center justify-between border-b border-line py-2">
                <div>
                  <p className="text-[12px] font-medium text-ink">{row.name}</p>
                  <p className="text-[11px] text-ink-faint">{row.sku} — {row.warehouseName}</p>
                </div>
                <StatusLabel tone="warning">
                  {row.available} trong số {row.reorderPoint}
                </StatusLabel>
              </div>
            ))}
            {outOfStock.map((row: any) => (
              <div key={row.id} className="flex items-center justify-between border-b border-line py-2">
                <div>
                  <p className="text-[12px] font-medium text-ink">{row.name}</p>
                  <p className="text-[11px] text-ink-faint">{row.sku} — {row.warehouseName}</p>
                </div>
                <StatusLabel tone="danger">Hết hàng</StatusLabel>
              </div>
            ))}
            {lowStock.length === 0 && outOfStock.length === 0 ? (
              <EmptyNote>Không có cảnh báo nào.</EmptyNote>
            ) : null}
          </div>
        </EditorialSection>
      ) : null}
    </div>
  );
}
