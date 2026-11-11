'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection, MetricBand, StatusLabel } from 'ui-kit';
import { TableState, Modal, Button, Input } from 'ui-components';
import { data } from '@/lib/data';
import type { Client, Order } from '@/lib/mock';
import {
  formatCurrency,
  formatDateVN,
  formatNumber,
  clientStatusLabel,
  clientStatusTone,
} from '@/lib/labels';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const [credits, setCredits] = useState<{ amount: string; reason: string }>({
    amount: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const all = await data.clients.list();
      setClients(all);
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được danh sách khách hàng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = clients.filter((row) => {
    if (filter && row.status !== filter) return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        row.name.toLowerCase().includes(term) ||
        row.code.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const paused = clients.filter((row) => row.status === 'PAUSED').length;
  const totalLimit = clients.reduce((sum, row) => sum + row.creditLimit, 0);
  const totalOutstanding = clients.reduce((sum, row) => sum + row.codOutstanding, 0);

  const handleToggleStatus = async (row: Client) => {
    const next = row.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setSaving(true);
    setActionError('');
    try {
      const updated = await data.clients.update(row.id, { status: next });
      setClients((list) => list.map((item) => (item.id === row.id ? updated : item)));
    } catch (err: any) {
      setActionError(err?.message ?? 'Không cập nhật được trạng thái khách hàng.');
    } finally {
      setSaving(false);
    }
  };

  const [clientInfo, setClientInfo] = useState<Client | null>(null);
  const [clientOrders, setClientOrders] = useState<Order[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const orderRows = clientOrders.slice(0, 10);

  useEffect(() => {
    setClientInfo(clients.find((row) => row.id === detail) ?? null);
  }, [detail, clients]);

  const loadClientOrders = async (clientId: string) => {
    setClientLoading(true);
    try {
      const all = await data.orders.list((o) => o.clientId === clientId);
      setClientOrders(all.slice(0, 10));
    } catch {
      setClientOrders([]);
    } finally {
      setClientLoading(false);
    }
  };

  useEffect(() => {
    if (detail) loadClientOrders(detail);
  }, [detail]);

  const handleCredit = async () => {
    if (!detail) return;
    const amount = Number(credits.amount);
    if (isNaN(amount) || amount <= 0) {
      setActionError('Số tiền tăng hạn mức phải lớn hơn 0.');
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      const updated = await data.clients.credit(detail, amount);
      setClients((list) => list.map((item) => (item.id === detail ? updated : item)));
      setActionError('');
      setCredits({ amount: '', reason: '' });
    } catch (err: any) {
      setActionError(err?.message ?? 'Không tăng được hạn mức.');
    } finally {
      setSaving(false);
    }
  };

  const creditLimit = clientInfo?.creditLimit ?? 0;
  const creditExceed = (clientInfo?.codOutstanding ?? 0) + Number(credits.amount) > creditLimit;

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Quản trị"
        title="Khách hàng B2B"
        description="Theo dõi hạn mức tín dụng, doanh số và COD còn nợ của khách hàng đối tác."
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
            label: 'Án hàng',
            value: String(clients.length),
            meta: `${paused} tạm ngừng`,
          },
          {
            label: 'Tổng hạn mức',
            value: formatCurrency(totalLimit),
            meta: 'Khách hàng B2B',
          },
          {
            label: 'COD còn nợ',
            value: formatCurrency(totalOutstanding),
            meta: totalOutstanding > 0 ? 'Theo dõi thu nợ' : undefined,
            tone: totalOutstanding > 0 ? 'warning' : 'success',
          },
          {
            label: 'Khoản vay ổn định',
            value: formatCurrency(totalOutstanding / Math.max(1, totalLimit) * 100),
            meta: 'COD / hạn mức',
            tone: totalOutstanding / Math.max(1, totalLimit) * 100 > 50 ? 'warning' : 'success',
          },
        ]}
      />

      <EditorialSection title="Danh sách khách hàng" eyebrow="Danh bạ khách đối tác" action={
        <div className="flex items-center gap-2">
          <select
            aria-label="Lọc trạng thái"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong"
          >
            <option value="">Tất cả</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="PAUSED">Tạm ngừng</option>
            <option value="CHURNED">Ngừng hoạt động</option>
          </select>
          <input
            type="search"
            placeholder="Tìm tên/mã/email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 border border-line bg-white px-2 text-[11px] text-ink-soft outline-none hover:border-line-strong focus:border-accent"
          />
        </div>
      }>
        <div className="rounded-xl border border-line bg-canvas">
          <div className="overflow-x-auto">
            <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Mã
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Khách hàng
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Người liên hệ
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Trạng thái
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Đơn tháng
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    Sản lượng
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint text-right">
                    COD còn nợ
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
                  emptyTitle="Chưa có khách hàng B2B nào"
                  emptyDescription="Khách hàng sẽ hiển thị nơi đây sau khi tạo."
                >
                  {visible.map((row) => (
                    <tr key={row.id} className="group border-b border-line last:border-b-0 transition-colors hover:bg-surface-alt">
                      <td className="px-4 py-2">
                        <span className="font-mono text-[11px] text-ink-faint">{row.code}</span>
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => setDetail(row.id)}
                          className="text-[12px] font-medium text-accent hover:underline"
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[12px] text-ink-soft">{row.contactName}</span>
                      </td>
                      <td className="px-4 py-2">
                        <StatusLabel tone={clientStatusTone(row.status)}>
                          {clientStatusLabel(row.status)}
                        </StatusLabel>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] text-ink">{formatNumber(row.ordersThisMonth)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] text-ink">{formatNumber(row.monthlyVolume)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="tabular-nums text-[12px] font-medium text-ink">{formatCurrency(row.codOutstanding)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(row)}
                          className="text-[11px] font-medium text-ink-soft hover:underline"
                        >
                          {row.status === 'ACTIVE' ? 'Tạm dừng' : 'Kích hoạt'}
                        </button>
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
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title={`Khách ${clientInfo?.name ?? ''}`}
        size="lg"
      >
        {clientInfo ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Mã khách</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{clientInfo.code}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Người liên hệ</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{clientInfo.contactName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Email</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{clientInfo.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Điện thoại</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{clientInfo.phone}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Địa chỉ</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{clientInfo.address}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Ngày tham gia</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{formatDateVN(clientInfo.joinedAt)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Hạn mức tín dụng</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{formatCurrency(clientInfo.creditLimit)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">COD còn nợ</p>
                <p className="mt-0.5 text-[13px] font-medium text-danger">{formatCurrency(clientInfo.codOutstanding)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Đơn tháng</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{formatNumber(clientInfo.ordersThisMonth)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">API key</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{clientInfo.apiKeyCount}</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-medium text-ink">Đơn hàng gần nhất</h3>
              {clientLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-9 w-full animate-pulse rounded-lg bg-surface-alt" />
                  ))}
                </div>
              ) : orderRows.length === 0 ? (
                <p className="text-[12px] text-ink-faint">Chưa có đơn hàng.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left" cellPadding={0} cellSpacing={0}>
                    <thead>
                      <tr className="border-b border-line">
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Mã đơn</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Trạng thái</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint text-right">COD</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Ngày tạo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderRows.map((row) => (
                        <tr key={row.id} className="border-b border-line last:border-b-0">
                          <td className="px-3 py-2 text-[11px] text-ink-faint">{row.trackingCode}</td>
                          <td className="px-3 py-2 text-[11px] text-ink">{row.status}</td>
                          <td className="px-3 py-2 text-right text-[11px] tabular-nums text-ink">{formatCurrency(row.codAmount)}</td>
                          <td className="px-3 py-2 text-[11px] text-ink-faint">{formatDateVN(row.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-line bg-canvas p-4">
              <h3 className="mb-3 text-[12px] font-medium text-ink">Tăng hạn mức tín dụng</h3>
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Khoản tăng</p>
                  <p className="text-[10px] text-ink-faint">COD còn nợ: {formatCurrency(clientInfo.codOutstanding)}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  value={credits.amount}
                  onChange={(e) => setCredits({ ...credits, amount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="mb-3">
                <label className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint" htmlFor="credit-reason">
                  Lý do
                </label>
                <Input
                  id="credit-reason"
                  value={credits.reason}
                  onChange={(e) => setCredits({ ...credits, reason: e.target.value })}
                  placeholder="Lý do tăng hạn mức"
                />
              </div>
              {creditExceed ? (
                <p className="mb-3 text-[11px] font-medium text-warning">
                  Sau khi tăng, COD còn nợ yêu cầu ({formatCurrency(clientInfo.codOutstanding + Number(credits.amount))}) vượt hạn mức.
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCredits({ amount: '', reason: '' })}>
                  Làm khác
                </Button>
                <Button
                  type="button"
                  onClick={handleCredit}
                  isLoading={saving}
                  disabled={saving || !credits.amount}
                >
                  Tăng hạn mức
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
