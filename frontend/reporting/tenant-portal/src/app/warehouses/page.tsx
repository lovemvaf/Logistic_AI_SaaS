'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
} from 'ui-kit';
import type { EditorialMetric } from 'ui-kit';
import { Button, DataState, Input, Pagination, Select, TableState } from 'ui-components';
import type { Warehouse } from '@/lib/mock';
import {
  formatNumber,
  warehouseStatusLabel,
  warehouseStatusTone,
} from '@/lib/labels';

const PAGE_SIZE = 12;
const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'MAINTENANCE', label: 'Bảo trì' },
];

export default function WarehousesPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Warehouse['status'] | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setWarehouses(await data.warehouses.list());
    } catch (err: any) {
      const msg = err?.message || 'Không tải được danh sách kho. ';
      setError(msg);
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const rows = warehouses.slice();
    const term = filter.toLowerCase().trim();
    const filtered = statusFilter === 'ALL' ? rows : rows.filter((w) => w.status === statusFilter);
    if (term) {
      return filtered.filter(
        (w) =>
          w.name.toLowerCase().includes(term) ||
          w.code.toLowerCase().includes(term) ||
          w.address.toLowerCase().includes(term),
      );
    }
    return filtered;
  }, [warehouses, filter, statusFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const metrics: EditorialMetric[] = [
    { label: 'Đang hoạt động', value: warehouses.filter((w) => w.status === 'ACTIVE').length, meta: 'kho nhận gửi' },
    { label: 'Bảo trì', value: warehouses.filter((w) => w.status === 'MAINTENANCE').length, meta: 'ngừng giao nhận' },
  ];

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Vận hành"
        title="Kho bãi"
        description="Danh sách kho hàng, mặt bằng ngăn xếp và quy trình nhập xuất."
        meta={`${warehouses.length} kho`}
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      <MetricBand metrics={metrics} />

      <EditorialSection title="Danh sách kho">
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <Input
            type="search"
            placeholder="Tìm tên, mã, địa chỉ kho"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            className="w-64 h-9"
          />
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as Warehouse['status'] | 'ALL');
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            className="h-9 w-48"
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] font-medium"
            onClick={() => {
              setFilter('');
              setStatusFilter('ALL');
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
        <DataState loading={loading} empty={!loading && filtered.length === 0}>
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Mã kho
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Tên kho
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Địa chỉ
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Trạng thái
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Ngăn xếp
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <TableState
                loading={loading}
                empty={!loading && filtered.length === 0}
                onRetry={load}
                colSpan={5}
                emptyContent={
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-ink-faint">
                      Không tìm thấy kho nào.
                    </td>
                  </tr>
                }
                error={error ? new Error(error) : undefined}
              >
                {paged.map((warehouse) => (
                  <tr
                    key={warehouse.id}
                    className="hover:bg-surface-alt cursor-pointer"
                    onClick={() => router.push(`/warehouses/${warehouse.id}`)}
                  >
                    <td className="px-3 py-2">
                      <p className="text-[13px] font-medium text-ink">{warehouse.code}</p>
                      <p className="text-[11px] text-ink-faint">{warehouse.manager}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-[13px] font-medium text-ink">{warehouse.name}</p>
                      <p className="text-[11px] text-ink-faint">
                        {formatNumber(warehouse.binCount)} ngăn · {warehouse.capacityCbm} m³
                      </p>
                    </td>
                    <td className="px-3 py-2 text-ink-faint">{warehouse.address}</td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={warehouseStatusTone(warehouse.status)}>
                        {warehouseStatusLabel(warehouse.status)}
                      </StatusLabel>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-faint">
                      {formatNumber(warehouse.binCount)}
                    </td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex justify-center py-3">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </DataState>
      </EditorialSection>
    </div>
  );
}
