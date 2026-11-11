'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { data } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  EmptyNote,
  StatusLabel,
  type StatusTone,
} from 'ui-kit';
import { TableState, Modal, Input as UiInput, Button, Select } from 'ui-components';
import { formatCurrency, formatDateTimeVN, orderStatusLabel, orderStatusTone, serviceLabel } from '@/lib/labels';

/**
 * Danh sách đơn hàng khách hàng.
 *
 * Tạo đơn, huỷ đơn (chỉ khi đơn chưa gán), theo dõi bằng mã vận đơn và gợi ý
 * giao hàng do AI tính từ dữ liệu mock.
 */

export default function ClientOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, any[]>>({});
  const [fetchingSuggestion, setFetchingSuggestion] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await data.orders.list();
      setOrders(
        rows.filter((row) => {
          if (statusFilter && row.status !== statusFilter) return false;
          if (searchCode) {
            const code = row.trackingCode.toLowerCase();
            if (!code.includes(searchCode.toLowerCase())) return false;
          }
          return true;
        }),
      );
    } catch (err) {
      setError(err?.message ?? 'Không tải được danh sách đơn hàng.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchCode]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError('');
    const form = event.target as HTMLFormElement;
    const input = {
      recipientName: (form['recipientName'] as HTMLInputElement).value,
      recipientPhone: (form['recipientPhone'] as HTMLInputElement).value,
      recipientAddress: (form['recipientAddress'] as HTMLInputElement).value,
      clientOrderRef: (form['clientOrderRef'] as HTMLInputElement).value,
      itemCount: Number((form['itemCount'] as HTMLInputElement).value) || 1,
      weightKg: Number((form['weightKg'] as HTMLInputElement).value) || 0,
      codAmount: Number((form['codAmount'] as HTMLInputElement).value) || 0,
      shippingFee: Number((form['shippingFee'] as HTMLInputElement).value) || 15000,
      service: (form['service'] as HTMLInputElement).value,
      scheduledDeliverAt: (form['scheduledDeliverAt'] as HTMLInputElement).value,
    };
    try {
      await data.orders.createOrder(input);
      void fetchOrders();
      setShowCreate(false);
    } catch (err) {
      setCreateError(err?.message ?? 'Không thể tạo đơn hàng.');
    }
  };

  const handleCancelOrder = async (id: string) => {
    try {
      await data.orders.cancelOrder(id);
      void fetchOrders();
    } catch (err) {
      setError(err?.message ?? 'Không thể huỷ đơn hàng.');
    }
  };

  const handleSuggestion = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (suggestions[id]) return;
    setFetchingSuggestion(id);
    try {
      const list = await data.aiFeature.deliverySuggestions(id);
      setSuggestions((prev) => ({ ...prev, [id]: list }));
    } catch (err) {
      setSuggestions((prev) => ({ ...prev, [id]: [] }));
      setError(err?.message ?? 'Không tải được gợi ý.');
    } finally {
      setFetchingSuggestion(null);
    }
  };

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Đơn hàng</span>
          </>
        }
        title="Đơn hàng"
        description="Theo dõi, tạo đơn và hủy đơn hàng của bạn."
        meta={
          <p className="mt-1">{orders.length} đơn hàng đang hiển thị</p>
        }
        actions={
          <Link
            href="/client/orders/upload"
            className="mr-2 h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            Nhập CSV
          </Link>
        }
      />

      <EditorialSection eyebrow="Lọc" title="Chọn đơn hàng">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            id="status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={[
              { label: 'Tất cả', value: '' },
              { label: 'Nháp', value: 'NEW' },
              { label: 'Chờ gán', value: 'UNASSIGNED' },
              { label: 'Chờ lấy hàng', value: 'PENDING_PICKUP' },
              { label: 'Đang soạn', value: 'PICKING' },
              { label: 'Đã đóng gói', value: 'PACKED' },
              { label: 'Đang vận chuyển', value: 'IN_TRANSIT' },
              { label: 'Đang phát', value: 'OUT_FOR_DELIVERY' },
              { label: 'Đã giao', value: 'DELIVERED' },
              { label: 'Giao thất bại', value: 'FAILED' },
              { label: 'Yêu cầu trả', value: 'RETURN_REQUESTED' },
              { label: 'Đã trả', value: 'RETURNED' },
              { label: 'Đã huỷ', value: 'CANCELLED' },
            ]}
          />
          <input
            type="text"
            placeholder="Tìm mã vận đơn"
            value={searchCode}
            onChange={(event) => setSearchCode(event.target.value)}
            className="h-9 w-64 rounded-md border border-line px-3 text-[12px] font-medium text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          />
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            Tạo đơn
          </Button>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Bảng" title="Danh sách">
        <TableState
          loading={loading}
          empty={!orders.length && !error}
          error={error || undefined}
          colSpan={6}
          emptyTitle="Chưa có đơn hàng"
          emptyDescription="Dữ liệu sẽ hiển thị sau khi tải."
          retryLabel="Thử lại"
          onRetry={fetchOrders}
        >
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Mã vận đơn
                </th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Ngày tạo
                </th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Người nhận
                </th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Dịch vụ
                </th>
                <th className="h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Trạng thái
                </th>
                <th className="h-9 pl-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((row) => (
                <tr key={row.id} className="h-[42px] border-b border-line/80 hover:bg-surface-alt/60">
                  <td className="pr-3 font-mono text-[12px] font-medium text-ink">
                    <Link href={`/track/${row.trackingCode}`}>{row.trackingCode}</Link>
                  </td>
                  <td className="px-3 text-[12px] text-ink-soft">{formatDateTimeVN(row.createdAt)}</td>
                  <td className="px-3 text-[12px] text-ink-soft">{row.recipientName}</td>
                  <td className="px-3 text-[12px] text-ink-soft">{serviceLabel(row.service)}</td>
                  <td className="px-3">
                    <StatusLabel tone={orderStatusTone(row.status as StatusTone)}>
                      {orderStatusLabel(row.status)}
                    </StatusLabel>
                  </td>
                  <td className="pl-3">
                    <div className="flex items-center gap-2">
                      {(row.status === 'NEW' || row.status === 'UNASSIGNED') ? (
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(row.id)}
                          className="text-[12px] font-medium text-ink-soft underline decoration-ink-faint underline-offset-4 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                        >
                          Huỷ
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleSuggestion(row.id)}
                        className="text-[12px] font-medium text-accent hover:underline"
                      >
                        {expandedId === row.id ? 'Ẩn gợi ý' : 'Gợi ý'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableState>
      </EditorialSection>

      {expandedId ? (
        <EditorialSection eyebrow="Gợi ý AI" title="Dự báo giao hàng">
          {fetchingSuggestion === expandedId ? (
            <EmptyNote>Đang tính toán gợi ý.</EmptyNote>
          ) : (
            <div className="space-y-3">
              {(suggestions[expandedId] ?? []).map((suggestion) => (
                <div key={suggestion.kind} className="border-l-2 border-line-strong pl-3 text-[12px] text-ink-soft">
                  <p className="font-medium text-ink">{suggestion.label}</p>
                  <p className="mt-1">{suggestion.description}</p>
                  {suggestion.at ? (
                    <p className="mt-2 text-ink-faint">Vào {formatDateTimeVN(suggestion.at)}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </EditorialSection>
      ) : null}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Tạo đơn hàng">
        <form onSubmit={handleCreateOrder} className="space-y-4">
          {createError ? (
            <div className="flex flex-col items-start gap-1 border-l-2 border-danger bg-surface px-3 py-2 text-[12px] text-ink-soft">
              <span>{createError}</span>
            </div>
          ) : null}
          <UiInput
            name="recipientName"
            label="Họ tên người nhận"
            required
            placeholder="Nguyễn Văn An"
          />
          <UiInput
            name="recipientPhone"
            label="Số điện thoại người nhận"
            required
            placeholder="0912345678"
          />
          <UiInput
            name="recipientAddress"
            label="Địa chỉ giao hàng"
            required
            placeholder="12 Nguyễn Huệ, Quận 1"
          />
          <UiInput
            name="clientOrderRef"
            label="Mã đơn tham chiếu"
            required
            placeholder="AP-001"
          />
          <UiInput
            name="itemCount"
            label="Số lượng mặt hàng"
            required
            type="number"
            min={1}
            defaultValue={1}
          />
          <UiInput
            name="weightKg"
            label="Khối lượng (kg)"
            required
            type="number"
            min={0}
            defaultValue={1}
          />
          <UiInput
            name="codAmount"
            label="COD (VNĐ)"
            type="number"
            min={0}
            defaultValue={0}
          />
          <UiInput
            name="shippingFee"
            label="Phí vận chuyển (VNĐ)"
            type="number"
            min={0}
            defaultValue={15000}
          />
          <Select
            name="service"
            label="Dịch vụ"
            options={[
              { label: 'Tiêu chuẩn', value: 'STANDARD' },
              { label: 'Nhanh', value: 'EXPRESS' },
              { label: 'Hàng ngày', value: 'SAME_DAY' },
            ]}
          />
          <UiInput
            name="scheduledDeliverAt"
            label="Hẹn giao"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
              Hủy
            </Button>
            <Button type="submit">Tạo đơn</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
