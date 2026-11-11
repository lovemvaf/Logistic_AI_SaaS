'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState, Modal, Button, Input, Select } from 'ui-components';
import { data } from '@/lib/data';
import type { UserAccount, RoleDefinition } from '@/lib/mock';
import {
  accountStatusLabel,
  accountStatusTone,
  formatDateTimeVN,
  formatNumber,
  roleLabel,
} from '@/lib/labels';

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toggleId, setToggleId] = useState<string | null>(null);
  const [toggleLabel, setToggleLabel] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [all, allRoles] = await Promise.all([data.users.list(), data.roles.list()]);
      setUsers(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setRoles(allRoles);
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được danh sách người dùng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = users.filter((row) => {
    if (filterRole && row.role !== filterRole) return false;
    if (filterStatus && row.status !== filterStatus) return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        row.name.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        row.phone?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const invited = users.filter((row) => row.status === 'INVITED').length;

  const handleInvite = async () => {
    if (!name.trim() || !email.trim() || !role) {
      setActionError('Vui lòng điền đầy đủ tên, email và vai trò.');
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      await data.users.invite({ name, email, role });
      setCreate(false);
      setName('');
      setEmail('');
      setRole('');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Không mời được người dùng.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (row: UserAccount) => {
    setSaving(true);
    setActionError('');
    try {
      const next = row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      await data.users.setStatus(row.id, next);
      setToggleId(null);
      setToggleLabel('');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Không cập nhật được trạng thái.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = users.find((row) => row.id === toggleId);
  const isSelf = toggleStatus?.email === user?.email;

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Quản trị"
        title="Người dùng"
        description="Xem và quản lý các tài khoản người dùng trong tenant của bạn."
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
          {
            label: 'Người dùng hiện tại',
            value: String(users.length),
            meta: `${users.filter((row) => row.status === 'ACTIVE').length} đang hoạt động`,
          },
          { label: 'Mời chờ', value: String(invited) },
          { label: 'Tạm đình chỉ', value: String(users.filter((row) => row.status === 'SUSPENDED').length) },
          { label: 'Cho phép sử dụng', value: String(users.filter((row) => row.status === 'ACTIVE').length) },
        ]}
      />

      <EditorialSection title="Danh sách người dùng" eyebrow="Tài khoản tenant" action={
        <div className="flex items-center gap-2">
          <select
            aria-label="Lọc theo vai trò"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="h-8 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
          >
            <option value="">Tất cả vai trò</option>
            {roles.map((row) => (
              <option key={row.id} value={row.key}>
                {roleLabel(row.key)}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc trạng thái"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-8 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
          >
            <option value="">Tất cả</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="INVITED">Đã mời</option>
            <option value="SUSPENDED">Tạm đình chỉ</option>
          </select>
          <button
            type="button"
            onClick={() => setCreate(true)}
            className="h-8 bg-accent px-3 text-[11px] font-semibold text-surface transition-colors hover:bg-accent-hover"
          >
            Mời người dùng
          </button>
        </div>
      }>
        <div className="mb-4">
          <Input
            type="search"
            placeholder="Tìm theo tên, email, điện thoại..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
        </div>
        <div className="rounded-xl border border-line bg-canvas">
          <div className="overflow-x-auto">
            <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Tên
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Vai trò
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Trạng thái
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Hoạt động cuối
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Ngày tạo
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Hành động
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
                  emptyTitle="Chưa có người dùng nào"
                  emptyDescription="Người dùng được mời vào sẽ hiển thị nơi đây."
                >
                  {visible.map((row) => (
                    <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                      <td className="px-4 py-2">
                        <span className="text-[12px] font-medium text-ink">{row.name}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-ink-faint">{row.email}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-ink-soft">{roleLabel(row.role)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <StatusLabel tone={accountStatusTone(row.status)}>
                          {accountStatusLabel(row.status)}
                        </StatusLabel>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] tabular-nums text-ink-faint">
                          {row.lastActiveAt ? formatDateTimeVN(row.lastActiveAt) : 'Chưa đăng nhập'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] text-ink-faint">{formatDateTimeVN(row.createdAt)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {row.email !== user?.email ? (
                          <button
                            type="button"
                            onClick={() => {
                              setToggleId(row.id);
                              setToggleLabel(row.status === 'ACTIVE' ? 'Tạm đình chỉ' : 'Kích hoạt lại');
                            }}
                            className="text-[11px] font-medium text-accent hover:underline"
                          >
                            {row.status === 'ACTIVE' ? 'Tạm đình chỉ' : 'Kích hoạt lại'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-ink-faint">Bạn đang đăng nhập</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </TableState>
              </tbody>
            </table>
          </div>
        </div>
      </EditorialSection>

      <Modal
        isOpen={create}
        onClose={() => setCreate(false)}
        title="Mời người dùng mới"
        size="sm"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleInvite(); }}>
          <div className="mb-3">
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="user-name">
              Họ tên
            </label>
            <Input id="user-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="user-email">
              Email
            </label>
            <Input id="user-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="user-role">
              Vai trò
            </label>
            <Select
              id="user-role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              options={roles.map((row) => ({ value: row.key, label: roleLabel(row.key) }))}
              placeholder="Chọn vai trò"
            />
          </div>
          {actionError ? (
            <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreate(false)}>
              Bỏ qua
            </Button>
            <Button type="submit" isLoading={saving} disabled={saving}>
              Mời
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={toggleId !== null}
        onClose={() => setToggleId(null)}
        title={toggleLabel}
        size="sm"
      >
        <div className="mb-4">
          <p className="text-[12px] text-ink-soft">
            Bạn đang {toggleStatus?.status === 'ACTIVE' ? 'tạm đình chỉ' : 'kích hoạt lại'} tài khoản của{' '}
            <span className="font-medium text-ink">{toggleStatus?.name}</span>.
          </p>
          {isSelf ? (
            <p className="mt-2 text-[11px] font-medium text-warning">
              Không thể tự động khóa tài khoản của mình.
            </p>
          ) : null}
        </div>
        {actionError ? (
          <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setToggleId(null)}>
            Bỏ qua
          </Button>
          <Button
            type="button"
            onClick={() => handleToggleStatus(toggleStatus!)}
            disabled={isSelf || saving}
            isLoading={saving}
          >
            Xác nhận
          </Button>
        </div>
      </Modal>
    </div>
  );
}
