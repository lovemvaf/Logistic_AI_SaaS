'use client';

import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
  type EditorialMetric,
} from 'ui-kit';
import { TableState } from 'ui-components';
import { formatNumber, formatDateVN } from '@/lib/labels';
import type { InventoryItem, Product, Warehouse } from '@/lib/mock';
import { useEffect, useState, useCallback } from 'react';

type AlertRow = {
  sku: string;
  productName: string;
  category: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  location: string;
  quantity: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  unitPrice: number;
  gap: number;
};

type Analysis = {
  rows: AlertRow[];
  counts: { outOfStock: number; lowStock: number };
  value: number;
  lowStockThreshold: number;
};

/** Tải kho hàng để tìm giá trị và thông tin kho chuẩn, tính hàng tồn rủi ro. */
function analyze(
  inventory: InventoryItem[],
  products: Product[],
  warehouses: Warehouse[],
  lowStockThreshold: number,
): Analysis {
  const productsBySku = new Map(products.map((p) => [p.sku, p]));
  const warehousesById = new Map(warehouses.map((w) => [w.id, w]));

  // Những hàng có tồn khả dụng chưa đạt ngưỡng được coi là rủi ro, sắp xếp
  // từ thấp lên để nhìn ngay mặt hàng cần nhập nhất.
  const rows: AlertRow[] = inventory
    .filter((item) => item.available <= lowStockThreshold)
    .map((item) => {
      const product = productsBySku.get(item.sku);
      const gap = (product?.reorderPoint ?? 0) - item.available;
      return {
        sku: item.sku,
        productName: item.productName,
        category: product?.category ?? '',
        warehouseId: item.warehouseId,
        warehouseCode: item.warehouseCode,
        warehouseName: warehousesById.get(item.warehouseId)?.name ?? item.warehouseCode,
        location: item.binCode,
        quantity: item.quantity,
        reserved: item.reserved,
        available: item.available,
        reorderPoint: product?.reorderPoint ?? 0,
        unitPrice: product?.unitPrice ?? 0,
        gap,
      };
    })
    .sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku));

  const counts = {
    outOfStock: rows.filter((r) => r.available === 0).length,
    lowStock: rows.filter((r) => r.available > 0 && r.available <= lowStockThreshold).length,
  };

  return {
    rows,
    counts,
    value: rows.reduce((total, r) => total + r.available * r.unitPrice, 0),
    lowStockThreshold,
  };
}

export default function StockAlertsPage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'all' | 'low' | 'out'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [inventory, products, warehouses, settings] = await Promise.all([
        data.inventory.list(),
        data.products.list(),
        data.warehouses.list(),
        data.settings.get(),
      ]);
      setAnalysis(analyze(inventory, products, warehouses, settings.lowStockThreshold));
    } catch (err: any) {
      setError(err?.message || 'Không tải được dữ liệu mẫu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const empty = !loading && (analysis === null || analysis.rows.length === 0);

  const statusLabel = status === 'all' ? 'Tất cả' : status === 'low' ? 'Sắp hết' : 'E hàng';
  const filtered = analysis?.rows.filter((r) =>
    status === 'out' ? r.available === 0 : status === 'low' ? r.available > 0 && r.available <= analysis.lowStockThreshold : true,
  );

  const metrics: EditorialMetric[] = [
    {
      label: 'Sắp hết hàng',
      value: formatNumber(analysis?.counts.lowStock ?? 0),
      meta: `Dưới ${formatNumber(analysis?.lowStockThreshold ?? 0)} đơn vị`,
      tone: 'warning',
    },
    {
      label: 'E hàng',
      value: formatNumber(analysis?.counts.outOfStock ?? 0),
      meta: 'Không có sẵn để giao',
      tone: 'danger',
    },
    {
      label: 'Giá trị tồn rủi ro',
      value: formatNumber(analysis?.value ?? 0),
      meta: `Đếm theo tồn khả dụng × giá vốn`,
    },
  ];

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Cảnh báo tồn kho"
        title="Cảnh báo tồn kho"
        description="Tóm tắt các mặt hàng có số lượng khả dụng dưới ngưỡng tồn thấp đã định trong cài đặt tenant, bao gồm số đơn vị còn lại và giá trị tồn rủi ro tương ứng. Dữ liệu đếm từ kho thực tế, không gửi yêu cầu bên ngoài."
        meta={
          <span className="text-[11px] leading-5 text-ink-faint">Cập nhật {formatDateVN(new Date().toISOString())}</span>
        }
        actions={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Đang tải…' : 'Làm mới số liệu'}
          </button>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-faint">
          <span>{error}</span>
          <button type="button" onClick={load} className="font-medium text-accent underline decoration-accent/30 hover:decoration-accent">
            Thử lại
          </button>
        </div>
      ) : null}

      <MetricBand metrics={metrics} />

      <EditorialSection
        eyebrow="Phân tích"
        title="Tồn kho nguy cấp"
        action={<StatusLabel tone="warning">{statusLabel}</StatusLabel>}
      >
        <div className="mb-3 flex items-center gap-1 text-[12px]">
          {(['all', 'low', 'out'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              aria-pressed={status === key}
              className={`rounded-md px-2 py-1 transition-colors ${
                status === key ? 'bg-accent text-white' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'
              }`}
            >
              {key === 'all' ? 'Tất cả' : key === 'low' ? 'Sắp hết' : 'E hàng'}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <TableState
            loading={loading}
            empty={empty}
            error={error ? new Error(error) : undefined}
            onRetry={load}
            colSpan={7}
            emptyContent={<EmptyNote>Không có mặt hàng nào dưới ngưỡng tồn thấp.</EmptyNote>}
          >
            <table className="w-full border-collapse">
              <thead className="border-b border-line bg-surface-alt">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Mã hàng</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Kho</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tồn thực</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Đã đặt</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Khả dụng</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Ngưỡng</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Thiếu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {filtered?.map((row) => (
                  <tr key={`${row.sku}-${row.warehouseCode}`} className="hover:bg-surface-alt">
                    <td className="px-4 py-2 text-[13px] font-medium text-ink">
                      <div className="text-[11px] text-ink-faint">{row.productName}</div>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-ink-soft">
                      <div className="text-[13px] text-ink">{row.warehouseCode}</div>
                      <div className="text-[11px] text-ink-faint">{row.warehouseName}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{row.quantity}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{row.reserved}</td>
                    <td className="px-4 py-2 text-right">
                      <StatusLabel tone={row.available > 0 ? 'warning' : 'danger'}>{row.available}</StatusLabel>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{row.reorderPoint}</td>
                    <td className="px-4 py-2 text-right">
                      <StatusLabel tone={row.gap > 0 ? 'warning' : 'danger'}>
                        {row.gap > 0 ? `+${row.gap}` : '—'}
                      </StatusLabel>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableState>
        </div>
        <EmptyNote>
          Ngưỡng tồn thấp {formatNumber(analysis?.lowStockThreshold ?? 0)} đơn vị theo cài đặt tenant. Hàng hết hàng được tính khi tồn khả dụng bằng 0.
        </EmptyNote>
      </EditorialSection>
    </div>
  );
}
