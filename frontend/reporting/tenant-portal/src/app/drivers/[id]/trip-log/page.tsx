'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  StatusLabel,
  EmptyNote,
} from 'ui-kit';
import { Button, DataState, TableState } from 'ui-components';
import type { Driver, DriverActivity, DriverActivityKind } from '@/lib/mock';
import {
  activityKindLabel,
  activityKindTone,
  driverStatusLabel,
  driverStatusTone,
  formatDateTimeVN,
  formatNumber,
} from '@/lib/labels';

const ACTIVITY_KIND_LABEL: Record<string, string> = {
  CHECK_IN: 'Điểm danh vào',
  CHECK_OUT: 'Điểm danh ra',
  STOP_ARRIVE: 'Đến điểm',
  STOP_DELIVER: 'Giao thành công',
  STOP_FAIL: 'Giao thất bại',
  IDLE_START: 'Bắt đầu chờ',
  IDLE_END: 'Kết thúc chờ',
  REFUEL: 'Đổ nhiên liệu',
  MAINTENANCE: 'Bảo trì',
  BONUS: 'Thưởng',
  FINE: 'Phạt',
};

function kindLabel(kind: DriverActivityKind) {
  return ACTIVITY_KIND_LABEL[kind] ?? activityKindLabel(kind);
}

/** Những sự kiện tạo điểm chạm an toàn, dùng để đưa vào báo cáo. */
function isStop(kind: DriverActivityKind) {
  return kind === 'STOP_ARRIVE' || kind === 'STOP_DELIVER' || kind === 'STOP_FAIL';
}

export default function DriverTripLogPage() {
  const { id } = useParams();
  const driverId = Array.isArray(id) ? id[0] : id;

  const [driver, setDriver] = useState<Driver | null>(null);
  const [activities, setActivities] = useState<DriverActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!driverId) return;
    setLoading(true);
    setError('');
    try {
      const [driverRes, logRes] = await Promise.all([
        data.drivers.get(driverId),
        data.drivers.tripLog({ driverId }),
      ]);
      if (!driverRes) throw new Error('Không tìm thấy tài xế.');
      setDriver(driverRes);
      setActivities(logRes);
    } catch (err: any) {
      const msg = err?.message || 'Không tải được lịch hoạt động tài xế.';
      setError(msg);
      setDriver(null);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [driverId]);

  if (!driverId) {
    return (
      <EditorialSection title="Không chọn tài xế">
        <EmptyNote>Không có tài xế nào được chọn. Mở `/drivers/[id]/trip-log`.</EmptyNote>
      </EditorialSection>
    );
  }

  const stopDeliverCount = activities.filter((a) => a.kind === 'STOP_DELIVER').length;
  const stopFailCount = activities.filter((a) => a.kind === 'STOP_FAIL').length;
  const idleCount = activities.filter((a) => a.kind === 'IDLE_START').length;
  const fineCount = activities.filter((a) => a.kind === 'FINE').length;

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Tài xế"
        title={driver ? `${driver.name} (${driver.code})` : 'Lịch hoạt động'}
        description="Nhật ký điểm danh, điểm giao hàng, chờ đợi, phạt và thưởng theo ngày ca."
        meta={
          driver && (
            <StatusLabel tone={driverStatusTone(driver.status)}>
              {driverStatusLabel(driver.status)}
            </StatusLabel>
          )
        }
        actions={
          <Button variant="outline" size="sm" className="text-[11px] font-medium" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
      />

      {error ? <p className="border-l-2 border-danger py-1 pl-3 text-[12px] text-danger">{error}</p> : null}

      <DataState loading={loading} empty={!loading && activities.length === 0}>
        <table className="min-w-full divide-y divide-line text-[13px]">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                Thời gian
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                Sự kiện
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                Chuyến
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                Vị trí
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <TableState
              loading={loading}
              empty={!loading && activities.length === 0}
              onRetry={load}
              colSpan={4}
              emptyContent={
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-ink-faint">
                    Tài xế {driver?.name ?? ''} chưa có hoạt động nào.
                  </td>
                </tr>
              }
              error={error ? new Error(error) : undefined}
            >
              {activities.map((a) => (
                <tr key={a.id} className="hover:bg-surface-alt">
                  <td className="px-3 py-2 tabular-nums text-ink-faint">
                    {formatDateTimeVN(a.at)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusLabel tone={activityKindTone(a.kind)}>
                      {kindLabel(a.kind)}
                    </StatusLabel>
                    {a.note ? (
                      <p className="mt-0.5 text-[11px] text-ink-faint">{a.note}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {a.tripCode ? (
                      <span className="font-mono text-[11px]">{a.tripCode}</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-faint">
                    {a.location ? `${a.location.lat.toFixed(4)}, ${a.location.lng.toFixed(4)}` : '—'}
                  </td>
                </tr>
              ))}
            </TableState>
          </tbody>
        </table>
      </DataState>

      {activities.length > 0 && (
        <EditorialSection title="Phân tích AI" eyebrow="Bảng thống kê">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Tổng sự kiện</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">
                {activities.length}
              </p>
            </div>
            <div className="border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">
                Điểm giao thành công
              </p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-success">
                {formatNumber(stopDeliverCount)}
              </p>
            </div>
            <div className="border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">Giao thất bại</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-danger">
                {formatNumber(stopFailCount)}
              </p>
            </div>
            <div className="border border-line bg-surface p-3">
              <p className="text-[11px] font-medium text-ink-faint uppercase">
                Chờ / giữ xe
              </p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-info">
                {formatNumber(idleCount)}
              </p>
            </div>
          </div>
        </EditorialSection>
      )}
    </div>
  );
}
