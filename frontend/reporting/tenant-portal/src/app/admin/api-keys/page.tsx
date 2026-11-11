'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState, Modal, Button, Input } from 'ui-components';
import { data } from '@/lib/data';
import type { ApiKey } from '@/lib/mock';
import {
  apiKeyStatusLabel,
  apiKeyStatusTone,
  formatDateTimeVN,
  formatDateVN,
} from '@/lib/labels';
import { RoleGuard } from '@/components/auth/RoleGuard';
import type { StatusTone } from 'ui-kit';

const DAY_MS = 86_400_000;
const STALE_DAYS = 30;

const SCOPE_LABELS: Record<string, string> = {
  'orders:read': 'Đọc đơn hàng',
  'orders:write': 'Viết đơn hàng',
  'inventory:read': 'Đọc tồn kho',
  'inventory:write': 'Viết tồn kho',
  'shipments:read': 'Đọc vận chuyển',
  'tracking:read': 'Theo dõi',
  'trips:read': 'Đọc chuyến',
};

function formatScopes(scopes: string[]) {
  return scopes.length === 0 ? '—' : scopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join(' ');
}

/**
 * Phân tích sức dùng (anomaly) của một API key: so sánh thời điểm sử dụng cuối
 * với thời điểm hiện tại để xác định key tiềm ẩn rủi ro không được bảo vệ.
 */
function inspectKey(key: ApiKey): { tone: StatusTone; label: string } {
  if (key.status === 'ACTIVE') {
    if (!key.lastUsedAt) return { tone: 'warning', label: 'Chưa từng dùng' };
    const days = Math.floor((Date.now() - new Date(key.lastUsedAt).getTime()) / DAY_MS);
    if (days >= STALE_DAYS) return { tone: 'warning', label: `Ngừng dùng ${days} ngày` };
    return { tone: 'success', label: 'Sử dụng gần đây' };
  }
  return { tone: apiKeyStatusTone(key.status), label: apiKeyStatusLabel(key.status) };
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [keyView, setKeyView] = useState<'issue' | 'created' | null>(null);
  const [createdKey, setCreatedKey] = useState<{ record: ApiKey; secret: string } | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const all = await data.apiKeys.list();
      setKeys(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được danh sách API key.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = keys.filter((row) => {
    if (filter && row.status !== filter) return false;
    if (search) {
      const term = search.toLowerCase();
      return row.name.toLowerCase().includes(term) || row.prefix.toLowerCase().includes(term);
    }
    return true;
  });

  const active = keys.filter((row) => row.status === 'ACTIVE').length;
  const revoked = keys.filter((row) => row.status === 'REVOKED').length;
  const expired = keys.filter((row) => row.status === 'EXPIRED').length;

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setSaving(true);
    setActionError('');
    try {
      const { record, secret } = await data.apiKeys.issue({ name: newKeyName, scopes: [] });
      setCreatedKey({ record, secret });
      setKeyView('created');
      setNewKeyName('');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Không tạo được API key.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeId) return;
    setSaving(true);
    setActionError('');
    try {
      await data.apiKeys.revoke(revokeId);
      setRevokeId(null);
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Không thu hồi được API key.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const backdrop = () => {
    setCreatedKey(null);
    setKeyView(null);
    setNewKeyName('');
  };

  return (
    <RoleGuard allowedRoles={['TENANT_ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6">
        <EditorialPageHeader
          eyebrow="Quản trị"
          title="API key"
          description="Quản lý truy cập chương trình: tạo, thu hồi và theo dõi lịch sử dùng của từng API key, phát hiện key nhàn rỗi tiềm ẩn rủi ro."
          actions={
            <Button variant="primary" onClick={() => setKeyView('issue')}>
              Tạo API key
            </Button>
          }
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
            { label: 'Tổng API key', value: String(keys.length) },
            { label: 'Đang hoạt động', value: String(active), meta: 'Còn hiệu lực' },
            { label: 'Đã thu hồi', value: String(revoked) },
            { label: 'Hết hạn', value: String(expired) },
          ]}
        />

        <EditorialSection title="Danh sách API key" eyebrow="Theo dõi khóa" action={
          <div className="flex items-center gap-2">
            <select
              aria-label="Lọc trạng thái"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
            >
              <option value="">Tất cả</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="REVOKED">Đã thu hồi</option>
              <option value="EXPIRED">Hết hạn</option>
            </select>
            <input
              type="search"
              placeholder="Tìm tên/mã khóa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong focus:border-accent"
            />
          </div>
        }>
          <div className="rounded-xl border border-line bg-canvas">
            <div className="overflow-x-auto">
              <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Tên API key
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Tiền tố khóa
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Phạm vi truy cập
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Trạng thái
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      Ngày tạo
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                      Lần cuối dùng
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                      Phân tích
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
                    colSpan={8}
                    emptyContent={
                      <div className="flex flex-col items-center gap-3 p-10 text-center">
                        <p className="text-sm font-medium text-ink">Chưa có API key nào</p>
                        <p className="text-[12px] text-ink-faint">
                          Tạo một API key để cho phép các hệ thống bên ngoài kết nối.
                        </p>
                        <Button variant="primary" onClick={() => setKeyView('issue')}>
                          Tạo API key mới
                        </Button>
                      </div>
                    }
                    emptyTitle="Chưa có API key nào"
                    emptyDescription="API key sẽ hiển thị sau khi được tạo."
                  >
                    {visible.map((row) => (
                      <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                        <td className="px-4 py-2">
                          <p className="text-[12px] font-medium text-ink">{row.name}</p>
                        </td>
                        <td className="px-4 py-2">
                          <code className="text-[11px] font-mono text-ink-faint">{row.prefix}</code>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[12px] text-ink-soft">{formatScopes(row.scopes)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <StatusLabel tone={apiKeyStatusTone(row.status)}>
                            {apiKeyStatusLabel(row.status)}
                          </StatusLabel>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] text-ink">{formatDateVN(row.createdAt)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-[12px] text-ink-soft">
                            {formatDateTimeVN(row.lastUsedAt)}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <StatusLabel tone={inspectKey(row).tone}>
                            {inspectKey(row).label}
                          </StatusLabel>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {row.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() => setRevokeId(row.id)}
                              className="text-[11px] font-medium text-danger hover:underline"
                            >
                              Thu hồi
                            </button>
                          ) : (
                            <span className="text-[11px] text-ink-faint">—</span>
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
          isOpen={keyView !== null}
          onClose={backdrop}
          title={keyView === 'created' ? 'Đã tạo API key' : 'Tạo API key'}
          size="sm"
        >
          {keyView === 'created' && createdKey ? (
            <div className="space-y-4">
              <div>
                <p className="text-[12px] text-ink-soft mb-3">
                  Sao chép khóa ngay lúc này — bạn sẽ không thể hiển thị lại sau.
                </p>
                <div className="rounded-xl border border-line bg-canvas p-3">
                  <code className="text-[12px] font-mono text-ink select-all break-all">
                    {createdKey.secret}
                  </code>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setCreatedKey(null); setKeyView(null); }}>
                  Đóng
                </Button>
                <Button onClick={() => { handleCopy(createdKey.secret); setCreatedKey(null); setKeyView(null); }}>
                  Sao chép & Đóng
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
              <div className="mb-4">
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em] mb-1.5 block" htmlFor="key-name">
                  Tên API key
                </label>
                <Input
                  id="key-name"
                  required
                  placeholder="VD: Tích hợp ERP An Phát"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              {actionError ? <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={backdrop}>
                  Hủy
                </Button>
                <Button type="submit" isLoading={saving} disabled={saving || !newKeyName.trim()}>
                  Tạo
                </Button>
              </div>
            </form>
          )}
        </Modal>

        <Modal
          isOpen={revokeId !== null}
          onClose={() => setRevokeId(null)}
          title="Thu hồi API key"
          size="sm"
        >
          {revokeId ? (
            <div className="space-y-4">
              <p className="text-[12px] text-ink-soft">
                Khóa này sẽ mất quyền truy cập vĩnh viễn. Hành động không thể hoàn tác.
              </p>
              {actionError ? <p className="text-[11px] font-medium text-danger">{actionError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setRevokeId(null)}>
                  Hủy
                </Button>
                <Button type="button" variant="danger" onClick={handleRevoke} isLoading={saving} disabled={saving}>
                  Thu hồi
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    </RoleGuard>
  );
}
