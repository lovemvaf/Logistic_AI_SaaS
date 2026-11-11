'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, StatusLabel } from 'ui-kit';
import { TableState, Button } from 'ui-components';
import { data } from '@/lib/data';
import type { RoleDefinition } from '@/lib/mock';
import { formatNumber, roleLabel } from '@/lib/labels';

const PERMISSION_GROUPS: Record<string, { label: string; keys: string[] }> = {
  WAREHOUSE: {
    label: 'Kho',
    keys: ['inventory', 'wave', 'cycle_count', 'product', 'pack', 'bin', 'equipment'],
  },
  TRANSPORT: {
    label: 'Vận tải',
    keys: ['trip', 'driver', 'gps', 'sos', 'vehicle', 'geofence'],
  },
  FINANCE: {
    label: 'Tài chính',
    keys: ['cod', 'invoice', 'expense', 'remittance', 'report', 'bank'],
  },
  ADMIN: {
    label: 'Quản trị',
    keys: ['user', 'role', 'settings', 'api_key', 'webhook', 'notification'],
  },
};

function groupForPermission(permission: string) {
  const key = permission.split(':')[0];
  for (const [group, value] of Object.entries(PERMISSION_GROUPS)) {
    if (value.keys.includes(key)) return group;
  }
  return 'UNKNOWN';
}

function rolePermissions(role: RoleDefinition) {
  const groups: Record<string, string[]> = {
    WAREHOUSE: [],
    TRANSPORT: [],
    FINANCE: [],
    ADMIN: [],
  };
  let hasAll = false;
  for (const permission of role.permissions) {
    if (permission === '*') {
      hasAll = true;
      continue;
    }
    groups[groupForPermission(permission)].push(permission);
  }
  return { groups, hasAll };
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<RoleDefinition | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const all = await data.roles.list();
      setRoles(all);
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được danh sách vai trò.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectedPermissions = selected ? rolePermissions(selected) : null;

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Quản trị"
        title="Vai trò và phân quyền"
        description="Ma trận quyền truy cập theo vai trò. Vai trò hệ thống chỉ đọc, không bịa thay đổi."
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

      <EditorialSection title="Danh sách vai trò" eyebrow="Quyền truy cập hệ thống">
        <div className="rounded-xl border border-line bg-canvas">
          <div className="overflow-x-auto">
            <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Vai trò
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Mô tả
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Thành viên
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Quyền
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Nội bộ
                  </th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  loading={loading}
                  empty={!loading && roles.length === 0}
                  error={error ? new Error(error) : undefined}
                  onRetry={load}
                  colSpan={5}
                  emptyTitle="Chưa có vai trò nào"
                  emptyDescription="Vai trò hệ thống sẽ hiển thị nơi đây."
                >
                  {roles.map((row) => (
                    <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                      <td className="px-4 py-2">
                        <div>
                          <p className="text-[12px] font-medium text-ink">{row.name}</p>
                          <p className="text-[10px] text-ink-faint">{roleLabel(row.key)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-ink-soft">{row.description}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] text-ink">{formatNumber(row.memberCount)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] text-ink">{row.permissions.length}</span>
                      </td>
                      <td className="px-4 py-2">
                        <StatusLabel tone={row.builtin ? 'success' : 'neutral'}>
                          {row.builtin ? 'Hệ thống' : 'Tùy chỉnh'}
                        </StatusLabel>
                      </td>
                    </tr>
                  ))}
                </TableState>
              </tbody>
            </table>
          </div>
        </div>
      </EditorialSection>

      {selected ? (
        <EditorialSection
          title={`Chi tiết quyền - ${selected.name}`}
          eyebrow={`Vai trò ${roleLabel(selected.key)}`}
          action={
            <Button variant="outline" onClick={() => setSelected(null)}>
              Đóng chi tiết
            </Button>
          }
        >
          <p className="mb-4 text-[12px] text-ink-soft">
            {selected.description}. Quyền nội dung hiển thị theo nhóm nghiệp vụ.
          </p>
          {selectedPermissions?.hasAll ? (
            <p className="mb-4 text-[12px] font-medium text-warning">
              Vai trò này sở hữu toàn quyền (tất cả quyền nội dung là `*`).
            </p>
          ) : null}
          <div className="grid gap-6 sm:grid-cols-2">
            {Object.entries(selectedPermissions?.groups ?? {}).map(([key, perms]) => {
              const group = PERMISSION_GROUPS[key];
              return (
                <div key={key} className="rounded-xl border border-line bg-canvas p-4">
                  <h3 className="mb-2 text-[12px] font-medium text-ink">{group.label}</h3>
                  {selectedPermissions.hasAll ? (
                    <p className="text-[11px] text-ink-faint">Toàn quyền.</p>
                  ) : perms.length === 0 ? (
                    <p className="text-[11px] text-ink-faint">Không có quyền.</p>
                  ) : (
                    <div className="space-y-1">
                      {perms.map((permission) => (
                        <p key={permission} className="text-[11px] text-ink-soft">{permission}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </EditorialSection>
      ) : null}
    </div>
  );
}
