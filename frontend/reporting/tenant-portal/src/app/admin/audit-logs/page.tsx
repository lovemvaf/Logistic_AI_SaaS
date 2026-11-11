'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState } from 'ui-components';
import { data } from '@/lib/data';
import type { AuditLog } from '@/lib/mock';
import { formatDateTimeVN, formatNumber } from '@/lib/labels';
import { RoleGuard } from '@/components/auth/RoleGuard';
import type { StatusTone } from 'ui-kit';

const RESULT_LABELS: Record<AuditLog['result'], string> = {
  SUCCESS: 'Thành công',
  DENIED: 'Bị từ chối',
  ERROR: 'Lỗi',
};

const RESULT_TONES: Record<AuditLog['result'], StatusTone> = {
  SUCCESS: 'success',
  DENIED: 'warning',
  ERROR: 'danger',
};

const MAX_ANOMALY_ROWS = 10;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const all = await data.auditLogs.list();
      setLogs(all.sort((a, b) => b.at.localeCompare(a.at)));
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được nhật ký audit.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = logs.filter((row) => {
    if (filter && row.result !== filter) return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        row.actor.toLowerCase().includes(term) ||
        row.action.toLowerCase().includes(term) ||
        row.ip.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const success = logs.filter((row) => row.result === 'SUCCESS').length;
  const denied = logs.filter((row) => row.result === 'DENIED').length;
  const errorLogs = logs.filter((row) => row.result === 'ERROR').length;

  /** Nhóm hóa các sự kiện thất bại theo actor để tìm mẫu bất thường lặp lại. */
  const failureGroups = (() => {
    const groups: Record<
      string,
      {
        actor: string;
        denied: number;
        error: number;
        ips: string[];
        actions: string[];
        lastAt: string;
      }
    > = {};
    for (const log of logs) {
      if (log.result !== 'DENIED' && log.result !== 'ERROR') continue;
      const key = log.actor;
      const group = groups[key] ?? { actor: key, denied: 0, error: 0, ips: [], actions: [], lastAt: '' };
      group[log.result === 'DENIED' ? 'denied' : 'error'] += 1;
      if (!group.ips.includes(log.ip)) group.ips.push(log.ip);
      if (!group.actions.includes(log.action)) group.actions.push(log.action);
      if (log.at > group.lastAt) group.lastAt = log.at;
      groups[key] = group;
    }
    return Object.values(groups);
  })();

  return (
    <RoleGuard allowedRoles={['TENANT_ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6">
        <EditorialPageHeader
          eyebrow="Quản trị"
          title="Audit log"
          description="Theo dõi hành động của người dùng và hệ thống: tạo sửa xóa, đăng nhập, truy cập bị từ chối theo thời gian thực."
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
            { label: 'Tổng sự kiện', value: String(logs.length) },
            { label: 'Thành công', value: String(success) },
            { label: 'Bị từ chối', value: String(denied) },
            { label: 'Lỗi', value: String(errorLogs) },
          ]}
        />

        {failureGroups.length > 0 ? (
          <EditorialSection title="Sự kiện bảo mật cần chú ý" eyebrow="Phân tích mẫu" action={
            <p className="text-[11px] text-ink-faint">
              {failureGroups.length} actor / ip lặp lại sự kiện
            </p>
          }>
            <div className="rounded-xl border border-line bg-canvas">
              <div className="overflow-x-auto">
                <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                        Actor
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                        Bị từ chối
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                        Lỗi
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                        ip
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                        Sự kiện cuối
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                        Mức độ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {failureGroups.slice(0, MAX_ANOMALY_ROWS).map((group) => {
                      const total = group.denied + group.error;
                      const tone = total >= 2 ? 'danger' : 'warning';
                      const label = total >= 2 ? 'Cao' : 'Thấp';
                      return (
                        <tr key={group.actor} className="border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                          <td className="px-4 py-2">
                            <p className="text-[12px] font-medium text-ink">{group.actor}</p>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="tabular-nums text-[12px] text-ink">{formatNumber(group.denied)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="tabular-nums text-[12px] text-ink">{formatNumber(group.error)}</span>
                          </td>
                          <td className="px-4 py-2">
                            <p className="text-[11px] text-ink-soft truncate">{group.ips.join(', ')}</p>
                          </td>
                          <td className="px-4 py-2">
                            <p className="text-[11px] text-ink-soft">{formatDateTimeVN(group.lastAt)}</p>
                          </td>
                          <td className="px-4 py-2">
                            <StatusLabel tone={tone}>{label}</StatusLabel>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </EditorialSection>
        ) : null}

        <EditorialSection title="Danh sách nhật ký" eyebrow="Hồ sơ hành động">
          <div className="rounded-xl border border-line bg-canvas">
            <div className="overflow-x-auto">
              <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      Thời gian
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Actor
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Hành động
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Thực thể
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Kết quả
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      ip
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    loading={loading}
                    empty={!loading && visible.length === 0}
                    error={error ? new Error(error) : undefined}
                    onRetry={load}
                    colSpan={6}
                    emptyTitle="Chưa có nhật ký audit"
                    emptyDescription="Nhật ký sẽ hiển thị đây khi có dữ liệu."
                  >
                    {visible.map((row) => (
                      <tr key={row.id} className="border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                        <td className="px-4 py-2">
                          <p className="text-[12px] text-ink">{formatDateTimeVN(row.at)}</p>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-[12px] font-medium text-ink">{row.actor}</p>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-[12px] text-ink">{row.action}</p>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-[11px] font-medium text-ink">{row.entity}</p>
                          <p className="mt-0.5 text-[11px] text-ink-faint">#{row.entityRef}</p>
                        </td>
                        <td className="px-4 py-2">
                          <StatusLabel tone={RESULT_TONES[row.result]}>
                            {RESULT_LABELS[row.result]}
                          </StatusLabel>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[11px] font-mono text-ink-soft">{row.ip}</span>
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
    </RoleGuard>
  );
}
