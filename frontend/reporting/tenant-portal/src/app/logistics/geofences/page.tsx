'use client';

import { useEffect, useMemo, useState } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import { Button, DataState, Input, Modal, Pagination, Select, TableState } from 'ui-components';
import type { Geofence } from '@/lib/mock';
import { formatNumber } from '@/lib/labels';

const PAGE_SIZE = 12;

/** Mã vùng an toàn / hạn chế không có trên labels.ts: định nghĩa tại trang. */
const KIND_LABELS: Record<Geofence['kind'], string> = {
  SAFE: 'Vùng an toàn',
  RESTRICTED: 'Vùng hạn chế',
};

/** Ngày tạo vùng an toàn mặc định. */
const KIND_TONES: Record<Geofence['kind'], 'success' | 'warning'> = {
  SAFE: 'success',
  RESTRICTED: 'warning',
};

export default function GeofencesPage() {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<Geofence['kind'] | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    kind: 'SAFE' as Geofence['kind'],
    province: '',
    centerLat: '',
    centerLng: '',
    radiusM: '',
    note: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await data.geofences.list();
      setGeofences(rows);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được dữ liệu địa danh.';
      setError(msg);
      setGeofences([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sortedGeofences = useMemo(() => {
    const rows = geofences.slice();
    const term = filter.toLowerCase().trim();
    const filtered = kindFilter === 'ALL' ? rows : rows.filter((g) => g.kind === kindFilter);
    if (term) {
      return filtered.filter((g) => g.name.toLowerCase().includes(term) || g.province.toLowerCase().includes(term));
    }
    return filtered;
  }, [geofences, filter, kindFilter]);

  const paged = useMemo(
    () => sortedGeofences.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedGeofences, page],
  );
  const totalPages = Math.max(1, Math.ceil(sortedGeofences.length / PAGE_SIZE));

  const metrics = [
    { label: 'Đang hoạt động', value: geofences.filter((g) => g.active).length, meta: 'vùng kích hoạt' },
    { label: 'Tắt', value: geofences.filter((g) => !g.active).length, meta: 'tạm ngưng' },
    { label: 'Lỗi địa danh trong 24h', value: geofences.reduce((a, g) => a + g.alerts24h, 0), meta: 'cần xử lý' },
    { label: 'Vùng hạn chế', value: geofences.filter((g) => g.kind === 'RESTRICTED').length, meta: 'chặn dừng' },
  ];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.province || !form.centerLat || !form.centerLng || !form.radiusM) {
      setError('Vui lòng nhập đủ tên vùng, tỉnh, tọa độ và bán kính.');
      return;
    }
    setSubmitting(true);
    try {
      await data.geofences.create({
        name: form.name,
        kind: form.kind,
        province: form.province,
        centerLat: Number(form.centerLat),
        centerLng: Number(form.centerLng),
        radiusM: Number(form.radiusM),
        note: form.note,
        active: true,
        alerts24h: 0,
      });
      setForm({ name: '', kind: 'SAFE', province: '', centerLat: '', centerLng: '', radiusM: '', note: '' });
      setModalOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Không tạo được địa danh.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (patch: Partial<Geofence>) => {
    if (!geofences.some((g) => g.id === patch.id)) {
      setError('Địa danh không tồn tại.');
      return;
    }
    try {
      const updated = await data.geofences.update(patch.id as string, patch);
      setGeofences((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setModalOpen(false);
      setEditingId(null);
    } catch (err: any) {
      setError(err?.message || 'Cập nhật địa danh thất bại.');
    }
  };

  const handleToggleActive = async (geofence: Geofence) => {
    try {
      const updated = await data.geofences.update(geofence.id, { active: !geofence.active });
      setGeofences((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    } catch (err: any) {
      setError(err?.message || 'Cập nhật trạng thái thất bại.');
    }
  };

  const openEdit = (geofence: Geofence) => {
    setForm({
      name: geofence.name,
      kind: geofence.kind,
      province: geofence.province,
      centerLat: String(geofence.centerLat),
      centerLng: String(geofence.centerLng),
      radiusM: String(geofence.radiusM),
      note: geofence.note ?? '',
    });
    setEditingId(geofence.id);
    setModalOpen(true);
  };

  const openCreate = () => {
    setForm({ name: '', kind: 'SAFE', province: '', centerLat: '', centerLng: '', radiusM: '', note: '' });
    setEditingId(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Vận tải"
        title="Địa danh"
        description="Quản lý vùng an toàn và vùng hạn chế, theo dõi cảnh báo trái địa danh và kích hoạt / tắt vùng."
        meta={`${geofences.length} vùng`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
              Làm mới
            </Button>
            <Button variant="primary" size="sm" className="text-[11px] font-medium" onClick={openCreate}>
              Tạo vùng
            </Button>
          </div>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      <MetricBand metrics={metrics} />

      <EditorialSection title="Danh sách địa danh">
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <Input
            type="search"
            placeholder="Tìm tên vùng, tỉnh"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            className="w-64 h-9"
          />
          <Select
            className="h-9 min-w-[14rem]"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as Geofence['kind'] | 'ALL')}
            options={[
              { value: 'ALL', label: 'Tất cả loại' },
              { value: 'SAFE', label: KIND_LABELS.SAFE },
              { value: 'RESTRICTED', label: KIND_LABELS.RESTRICTED },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] font-medium"
            onClick={() => {
              setFilter('');
              setKindFilter('ALL');
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
        <DataState loading={loading} empty={!loading && sortedGeofences.length === 0}>
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Tên vùng
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Loại
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Tỉnh
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                  Bán kính
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Cảnh báo 24h
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Trạng thái
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <TableState
                loading={loading}
                empty={!loading && paged.length === 0}
                onRetry={load}
                colSpan={6}
                emptyContent={
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-ink-faint">
                      Không tìm thấy địa danh.
                    </td>
                  </tr>
                }
                error={error ? new Error(error) : undefined}
              >
                {paged.map((g) => (
                  <tr key={g.id} className="hover:bg-surface-alt">
                    <td className="px-3 py-2 font-medium text-ink">{g.name}</td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={KIND_TONES[g.kind]}>{KIND_LABELS[g.kind]}</StatusLabel>
                    </td>
                    <td className="px-3 py-2 text-ink-faint">{g.province}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(g.radiusM)} m</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {g.alerts24h > 0 ? (
                        <StatusLabel tone="warning">{g.alerts24h}</StatusLabel>
                      ) : (
                        <StatusLabel tone="neutral">{0}</StatusLabel>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusLabel tone={g.active ? 'success' : 'neutral'}>{g.active ? 'Đang kích hoạt' : 'Tạm ngưng'}</StatusLabel>
                    </td>
                  </tr>
                ))}
              </TableState>
            </tbody>
          </table>
          <div className="flex justify-center py-3">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </DataState>
      </EditorialSection>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Sửa địa danh' : 'Tạo địa danh'}
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-soft mb-1">Tên vùng</label>
            <Input
              required
              className="h-9"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VD: KCN Sóng Thần"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Loại</label>
              <Select
                className="h-9"
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Geofence['kind'] }))}
                options={[
                  { value: 'SAFE', label: KIND_LABELS.SAFE },
                  { value: 'RESTRICTED', label: KIND_LABELS.RESTRICTED },
                ]}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Tỉnh</label>
              <Input
                required
                className="h-9"
                value={form.province}
                onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                placeholder="VD: Bình Dương"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Vĩ độ</label>
              <Input
                required
                type="number"
                step="0.000001"
                className="h-9"
                value={form.centerLat}
                onChange={(e) => setForm((f) => ({ ...f, centerLat: e.target.value }))}
                placeholder="10.9239"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Kinh độ</label>
              <Input
                required
                type="number"
                step="0.000001"
                className="h-9"
                value={form.centerLng}
                onChange={(e) => setForm((f) => ({ ...f, centerLng: e.target.value }))}
                placeholder="106.7147"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Bán kính (m)</label>
              <Input
                required
                type="number"
                className="h-9"
                value={form.radiusM}
                onChange={(e) => setForm((f) => ({ ...f, radiusM: e.target.value }))}
                placeholder="2400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Ghi chú</label>
              <Input
                className="h-9"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Không bắt buộc"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>
              {submitting ? 'Đang tạo' : 'Tạo'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
