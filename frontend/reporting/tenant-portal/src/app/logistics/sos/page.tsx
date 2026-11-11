'use client';

import { useEffect, useState, useMemo } from 'react';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  MetricBand,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import type { EditorialMetric } from 'ui-kit';
import {
  Button,
  DataState,
  Input,
  Modal,
  Pagination,
  Select,
} from 'ui-components';
import type { SosAlert } from '@/lib/mock';
import {
  sosAlertStatusLabel,
  sosAlertStatusTone,
  sosAlertKindLabel,
  sosAlertSeverityTone,
  formatDateTimeVN,
} from '@/lib/labels';

/** Toast chỉ là kết nối vào `ToastHost` mount ở root layout. */
const toast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') =>
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type } }));

const ALERT_KINDS: SosAlert['kind'][] = ['PANIC', 'GEOFENCE_BREACH', 'OFF_ROUTE', 'IDLE_TOO_LONG'];

/** Thứ tự ưu tiên: mở trước, đã tiếp nhận giữa, đã đóng sau; thời gian mới nhất nhất trên đầu. */
const ALERT_STATUS_ORDER: Record<SosAlert['status'], number> = {
  OPEN: 0,
  ACKNOWLEDGED: 1,
  RESOLVED: 2,
};

const PAGE_SIZE = 10;

/** Trạng thái vừa đóng modal giải quyết, ẩn sau khi hoàn tác. */
type ResolveForm = { id: string; code: string };

export default function SosControlCenterPage() {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mutating, setMutating] = useState<string>('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SosAlert['status'] | 'ALL'>('ALL');
  const [kindFilter, setKindFilter] = useState<SosAlert['kind'] | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [resolveForm, setResolveForm] = useState<ResolveForm | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [noteError, setNoteError] = useState('');


  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await data.sosAlerts.list();
      setAlerts(list);
    } catch (err: any) {
      setError(err?.message || 'Không tải được dữ liệu cảnh báo.');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo<EditorialMetric[]>(() => {
    const open = alerts.filter((a) => a.status === 'OPEN');
    const acknowledged = alerts.filter((a) => a.status === 'ACKNOWLEDGED');
    const resolved = alerts.filter((a) => a.status === 'RESOLVED');
    const criticalOpen = open.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH');
    return [
      {
        label: 'Mở',
        value: open.length,
        tone: open.length > 0 ? 'danger' : 'success',
        meta: open.length > 0 ? 'cần xử lý ngay' : 'không có yêu cầu mở',
      },
      { label: 'Đã tiếp nhận', value: acknowledged.length, meta: 'chờ đóng cảnh báo' },
      { label: 'Đã đóng', value: resolved.length, meta: `${resolved.length} cảnh báo đã xử lý xong` },
      {
        label: 'Năng trọng',
        value: criticalOpen.length,
        tone: criticalOpen.length > 0 ? 'danger' : 'success',
        meta: 'CRITICAL hoặc HIGH còn mở',
      },
    ];
  }, [alerts]);

  // Lọc và sắp xếp: trạng thái cụm hành vi dùng trước, thời gian giảm dần.
  const filtered = useMemo(() => {
    const rows = alerts.slice();
    rows.sort((a, b) => {
      const ka = ALERT_STATUS_ORDER[a.status];
      const kb = ALERT_STATUS_ORDER[b.status];
      if (ka !== kb) return ka - kb;
      return b.createdAt > a.createdAt ? -1 : 1;
    });
    const term = search.toLowerCase().trim();
    return rows.filter((a) => {
      const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
      const matchKind = kindFilter === 'ALL' || a.kind === kindFilter;
      const matchSearch = term
        ? a.driverName.toLowerCase().includes(term) ||
          a.code.toLowerCase().includes(term) ||
          a.tripCode.toLowerCase().includes(term) ||
          (a.note ? a.note.toLowerCase().includes(term) : false)
        : true;
      return matchStatus && matchKind && matchSearch;
    });
  }, [alerts, search, statusFilter, kindFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const openResolveModal = (alert: SosAlert) => {
    setResolveForm({ id: alert.id, code: alert.code });
    setResolveNote(alert.note ?? '');
    setNoteError('');
  };
  const closeResolveModal = () => {
    setResolveForm(null);
    setResolveNote('');
    setNoteError('');
  };

  const handleAcknowledge = async (alert: SosAlert) => {
    setMutating(alert.id);
    try {
      await data.sosAlerts.acknowledge(alert.id);
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: 'ACKNOWLEDGED', acknowledgedBy: 'Bạn (demo)' } : a)));
      toast(`Tiếp nhận ${alert.code} thành công.`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Không thể tiếp nhận cảnh báo.', 'error');
    } finally {
      setMutating('');
    }
  };

  const handleResolve = async () => {
    if (!resolveForm) return;
    if (!resolveNote.trim()) {
      setNoteError('Vui lòng nhập ghi chú xử lý để đóng cảnh báo.');
      return;
    }
    setMutating(resolveForm.id);
    try {
      const alert = await data.sosAlerts.resolve(resolveForm.id, resolveNote);
      setAlerts((prev) => prev.map((a) => (a.id === resolveForm.id ? alert : a)));
      toast(`Đóng ${resolveForm.code} thành công.`, 'success');
      closeResolveModal();
    } catch (err: any) {
      setNoteError(err?.message || 'Không thể đóng cảnh báo.');
    } finally {
      setMutating('');
    }
  };

  const handleReset = async () => {
    try {
      await data.controls({ reset: true });
      load();
      toast('Đã khôi phục dữ liệu demo.', 'success');
    } catch (err: any) {
      toast(err?.message || 'Không tải lại dữ liệu demo.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <EditorialPageHeader
        eyebrow="Vận tải · An toàn"
        title="Trung tâm cảnh báo SOS"
        description="Theo dõi yêu cầu SOS từ tài xế: tiếp nhận, xử lý và đóng cảnh báo theo đúng trình tự. Chỉ những cảnh báo đã tiếp nhận mới được đóng."
        meta={`${alerts.length} cảnh báo · ${filtered.length} khớp bộ lọc`}
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={handleReset}>
            Khôi phục dữ liệu
          </Button>
        }
      />

      {error ? (
        <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p>
      ) : null}

      <MetricBand metrics={metrics} />

      <EditorialSection title="Danh sách cảnh báo" eyebrow="Lọc + tìm">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="search"
            placeholder="Tìm mã cảnh báo, tài xế, chuyến"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-64 h-9"
          />
          <Select
            className="h-9 min-w-[9rem]"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as SosAlert['status'] | 'ALL');
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'Tất cả trạng thái' },
              { value: 'OPEN', label: sosAlertStatusLabel('OPEN') },
              { value: 'ACKNOWLEDGED', label: sosAlertStatusLabel('ACKNOWLEDGED') },
              { value: 'RESOLVED', label: sosAlertStatusLabel('RESOLVED') },
            ]}
          />
          <Select
            className="h-9 min-w-[10rem]"
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value as SosAlert['kind'] | 'ALL');
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'Tất cả loại' },
              ...ALERT_KINDS.map((k) => ({ value: k, label: sosAlertKindLabel(k) })),
            ]}
          />
        </div>
      </EditorialSection>

      <EditorialSection title="Bảng cảnh báo">
        <DataState
          loading={loading}
          empty={!loading && filtered.length === 0}
          error={error || undefined}
          onRetry={load}
          emptyTitle="Không có cảnh báo nào khớp bộ lọc."
          emptyDescription="Thử bớt bộ lọc hoặc tắt thanh điều chỉnh thời gian."
          loadingRows={5}
        >
          <table className="min-w-full divide-y divide-line text-[13px]">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Cảnh báo</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Tài xế</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Loại</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Trạng thái</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Chuyến</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Ghi chú</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {paged.map((a) => (
                <tr
                  key={a.id}
                  className={`transition-colors hover:bg-surface-alt ${a.status === 'OPEN' ? 'border-l-2 border-danger bg-surface-alt' : 'border-l-2 border-transparent'}`}
                >
                  <td className="pr-3 py-2">
                    <p className="font-medium text-ink">{a.code}</p>
                    <p className="font-mono text-[11px] text-ink-faint">{a.tripCode}</p>
                    <p className="text-[11px] text-ink-faint">{formatDateTimeVN(a.createdAt)}</p>
                  </td>
                  <td className="pr-3 py-2">{a.driverName}</td>
                  <td className="pr-3 py-2">
                    <StatusLabel tone={sosAlertSeverityTone(a.severity)}>{sosAlertKindLabel(a.kind)}</StatusLabel>
                  </td>
                  <td className="pr-3 py-2">
                    <StatusLabel tone={sosAlertStatusTone(a.status)}>{sosAlertStatusLabel(a.status)}</StatusLabel>
                  </td>
                  <td className="pr-3 py-2">
                    <p className="text-[12px] text-ink-soft truncate" title={a.lat == null ? '' : `${a.lat}, ${a.lng}`}>
                      {a.lat == null ? '—' : `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`}
                    </p>
                  </td>
                  <td className="pr-3 py-2">
                    <p className="text-[12px] text-ink-soft truncate" title={a.note ?? ''}>
                      {a.status === 'RESOLVED' ? a.note : (a.note ? a.note.slice(0, 40) + '…' : '—')}
                    </p>
                  </td>
                  <td className="py-2">
                    {a.status === 'OPEN' ? (
                      <Button
                        size="sm"
                        variant="primary"
                        className="text-[11px] font-medium bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none"
                        disabled={mutating === a.id}
                        onClick={() => handleAcknowledge(a)}
                      >
                        Tiếp nhận
                      </Button>
                    ) : a.status === 'ACKNOWLEDGED' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[11px] font-medium border-line-strong text-ink hover:bg-surface-alt disabled:opacity-50 disabled:pointer-events-none"
                        disabled={mutating === a.id}
                        onClick={() => openResolveModal(a)}
                      >
                        Đóng
                      </Button>
                    ) : (
                      <span className="text-[11px] text-ink-faint">{a.acknowledgedBy ?? '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataState>
        <div className="flex justify-center py-3">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </EditorialSection>

      <Modal
        isOpen={!!resolveForm}
        onClose={closeResolveModal}
        title="Đóng cảnh báo"
        size="sm"
        footer={
          <>
            <Button size="sm" variant="outline" className="text-[11px] font-medium" onClick={closeResolveModal}>
              Huỷ
            </Button>
            <Button size="sm" variant="primary" className="text-[11px] font-medium bg-accent hover:bg-accent-hover" onClick={handleResolve} disabled={mutating === resolveForm?.id}>
              Đóng cảnh báo
            </Button>
          </>
        }
      >
        {resolveForm ? (
          <div className="space-y-3">
            <div className="p-3 border border-line bg-surface">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Mã cảnh báo</p>
              <p className="text-[15px] font-semibold text-ink">{resolveForm.code}</p>
            </div>
            {noteError ? <p className="text-[12px] text-danger">{noteError}</p> : null}
            <label htmlFor="sos-note" className="text-[12px] font-medium text-ink-soft">
              Ghi chú xử lý
            </label>
            <textarea
              id="sos-note"
              rows={3}
              className="w-full resize-none rounded-lg border border-line bg-surface text-[13px] p-3 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              value={resolveNote}
              onChange={(e) => {
                setResolveNote(e.target.value);
                setNoteError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) handleResolve();
              }}
            />
            <EmptyNote>
              Ghi chú bắt buộc khi đóng cảnh báo. Tài xế sẽ được thông báo kết quả xử lý.
            </EmptyNote>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
