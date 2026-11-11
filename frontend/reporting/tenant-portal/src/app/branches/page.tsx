'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState, Input } from 'ui-components';
import { data } from '@/lib/data';
import type { Warehouse } from '@/lib/mock';
import { warehouseStatusLabel, warehouseStatusTone, formatNumber } from '@/lib/labels';

export default function BranchesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const all = await data.warehouses.list();
      setWarehouses(all.sort((a, b) => b.code.localeCompare(a.code)));
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được danh sách chi nhánh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = warehouses.filter((row) => {
    if (filterStatus && row.status !== filterStatus) return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        row.name.toLowerCase().includes(term) ||
        row.code.toLowerCase().includes(term) ||
        row.address.toLowerCase().includes(term) ||
        row.province.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const active = warehouses.filter((row) => row.status === 'ACTIVE').length;
  const maintenance = warehouses.filter((row) => row.status === 'MAINTENANCE').length;
  const totalBins = warehouses.reduce((sum, row) => sum + (row.binCount || 0), 0);
  const usedCapacity = warehouses.reduce((sum, row) => sum + row.usedCbm, 0);
  const totalCapacity = warehouses.reduce((sum, row) => sum + row.capacityCbm, 0);
  const capacityPct = totalCapacity === 0 ? 0 : Math.round((usedCapacity / totalCapacity) * 100);

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Quản trị"
        title="Chi nhánh"
        description="Danh sách chi nhánh, kho trung tâm và điểm giao nhận. Dữ liệu kho được dùng làm cơ sở cho tất cả các nghiệp vụ lấy hàng."
      />

      {error ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
          <StatusLabel tone="danger">Lỗi dữ liệu</StatusLabel>
          <span className="text-[12px] text-ink-soft">{error}</span>
          <button type="button" onClick={load} className="ml-auto text-[11px] font-medium text-accent hover:underline">
            Thử lại
          </button>
        </div>
      ) : null}

      <MetricBand
        metrics={[
          { label: 'Chi nhánh', value: formatNumber(warehouses.length) },
          {
            label: 'Đang hoạt động',
            value: formatNumber(active),
            meta: `${maintenance} đang bảo trì`,
          },
          { label: 'Vị trí hàng', value: formatNumber(totalBins) },
          {
            label: 'Sử dụng kho',
            value: `${capacityPct}%`,
            meta: `${formatNumber(usedCapacity)}/${formatNumber(totalCapacity)} m³`,
          },
        ]}
      />

      <EditorialSection title="Danh sách chi nhánh" eyebrow="Điểm giao nhận">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              type="search"
              placeholder="Tìm theo mã, tên, thành phố, địa chỉ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <select
            aria-label="Lọc trạng thái"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-8 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="MAINTENANCE">Bảo trì</option>
          </select>
        </div>

        <div className="rounded-xl border border-line bg-canvas">
          <div className="overflow-x-auto">
            <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Mã
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Tên chi nhánh
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Thành phố
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Địa chỉ
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Trạng thái
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Vị trí
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Người quản lý
                  </th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  loading={loading}
                  empty={!loading && visible.length === 0}
                  error={error ? new Error(error) : undefined}
                  onRetry={load}
                  colSpan={7}
                  emptyTitle="Chưa có chi nhánh nào"
                  emptyDescription="Dữ liệu chi nhánh sẽ hiển thị khi có kho được tạo."
                >
                  {visible.map((row) => (
                    <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                      <td className="px-4 py-2">
                        <span className="text-[12px] font-medium text-ink">{row.code}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[12px] font-medium text-ink">{row.name}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-ink-faint">{row.province}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-ink-soft">{row.address}</span>
                      </td>
                      <td className="px-4 py-2">
                        <StatusLabel tone={warehouseStatusTone(row.status)}>
                          {warehouseStatusLabel(row.status)}
                        </StatusLabel>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] text-ink">{formatNumber(row.binCount)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-ink-faint">{row.manager}</span>
                      </td>
                    </tr>
                  ))}
                </TableState>
              </tbody>
            </table>
          </div>
        </div>
      </EditorialSection>
    </div>
  );
}
