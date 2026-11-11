'use client';

import { useEffect, useState } from 'react';
import { EditorialPageHeader, EditorialSection } from 'ui-kit';
import { StatusLabel } from 'ui-kit';
import { TableState, Modal, Button, Input, Select, Checkbox } from 'ui-components';
import { data } from '@/lib/data';
import type { AllocationStrategy, TenantSettings } from '@/lib/mock';
import { formatDateTimeVN } from '@/lib/labels';

const TIMEZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'America/Los_Angeles',
  'America/New_York',
];

const NOTIFY_CHANNELS: Array<'email' | 'sms' | 'webhook'> = ['email', 'sms', 'webhook'];

const CHANNEL_LABELS: Record<'email' | 'sms' | 'webhook', string> = {
  email: 'Email',
  sms: 'Tin nhắn SMS',
  webhook: 'Webhook',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [form, setForm] = useState<Partial<TenantSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [actionError, setActionError] = useState('');
  const [restoreId, setRestoreId] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const current = await data.settings.get();
      setSettings(current);
      setForm(current);
      setSavedAt('');
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được cấu hình.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (patch: Partial<TenantSettings>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const channels = form.notifyChannels ?? [];

  const toggleChannel = (channel: 'email' | 'sms' | 'webhook') => {
    const next = channels.includes(channel)
      ? channels.filter((item) => item !== channel)
      : [...channels, channel];
    handleChange({ notifyChannels: next });
  };

  const handleSubmit = async () => {
    setSaving(true);
    setActionError('');
    try {
      const updated = await data.settings.update(form as TenantSettings);
      setSavedAt(updated.updatedAt);
    } catch (err: any) {
      setActionError(err?.message ?? 'Không lưu được cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    try {
      const restored = await data.settings.get();
      setForm(restored);
      setRestoreId(false);
    } catch (err: any) {
      setActionError(err?.message ?? 'Không khôi phục được cấu hình.');
    }
  };

  return (
    <div className="space-y-6">
      <EditorialPageHeader
        eyebrow="Quản trị"
        title="Cấu hình tenant"
        description="Thông tin liên hệ, phân bổ tồn kho mặc định và chốt COD theo chi nhánh."
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

      {actionError ? (
        <p className="text-[12px] font-medium text-danger">{actionError}</p>
      ) : null}

      {savedAt ? (
        <p className="text-[12px] text-ink-soft">Đã lưu lúc {formatDateTimeVN(savedAt)}.</p>
      ) : null}

      <EditorialSection title="Thông tin chung" eyebrow="Cơ sở">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-name">
                Tên tenant
              </label>
              <Input
                id="settings-name"
                value={form.name ?? ''}
                onChange={(e) => handleChange({ name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-slug">
                Mã
              </label>
              <Input id="settings-slug" readOnly value={form.slug ?? ''} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-timezone">
                Múi giờ
              </label>
              <Select
                id="settings-timezone"
                value={form.timezone ?? ''}
                onChange={(e) => handleChange({ timezone: e.target.value })}
                options={TIMEZONES.map((value) => ({ value, label: value }))}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-currency">
                Tiền tệ
              </label>
              <Input id="settings-currency" readOnly value="VND" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-locale">
                Ngôn ngữ
              </label>
              <Input id="settings-locale" readOnly value="vi-VN" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-address">
                Địa chỉ
              </label>
              <Input id="settings-address" value={form.address ?? ''} onChange={(e) => handleChange({ address: e.target.value })} />
            </div>
          </div>
        </form>
      </EditorialSection>

      <EditorialSection title="Liên hệ và thông báo" eyebrow="Giao tiếp">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-contact-name">
              Người liên hệ
            </label>
            <Input
              id="settings-contact-name"
              value={form.contactName ?? ''}
              onChange={(e) => handleChange({ contactName: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-contact-email">
              Email liên hệ
            </label>
            <Input
              id="settings-contact-email"
              type="email"
              value={form.contactEmail ?? ''}
              onChange={(e) => handleChange({ contactEmail: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-notify">
              Kênh thông báo
            </label>
            <div className="mt-2 flex flex-wrap gap-4">
              {NOTIFY_CHANNELS.map((channel) => (
                <Checkbox
                  key={channel}
                  id={`settings-notify-${channel}`}
                  checked={channels.includes(channel)}
                  onChange={() => toggleChannel(channel)}
                  label={CHANNEL_LABELS[channel]}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-ink-soft">
              Chọn ít nhất một kênh; dữ liệu sẽ được ghi vào hệ thống thông báo.
            </p>
          </div>
        </div>
      </EditorialSection>

      <EditorialSection title="Vận hành" eyebrow="Tự động hóa">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-strategy">
              Chiến lược phân bổ mặc định
            </label>
            <Select
              id="settings-strategy"
              value={form.autoAllocateStrategy ?? 'FIFO'}
              onChange={(e) => handleChange({ autoAllocateStrategy: e.target.value as AllocationStrategy })}
              options={[
                { value: 'FIFO', label: 'FIFO — Vào trước ra trước' },
                { value: 'LIFO', label: 'LIFO — Vào sau ra trước' },
                { value: 'FEFO', label: 'FEFO — Hết hạn trước ra trước' },
              ]}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-cutoff">
              Giờ chốt COD
            </label>
            <Select
              id="settings-cutoff"
              value={String(form.codCutoffHour ?? 0)}
              onChange={(e) => handleChange({ codCutoffHour: Number(e.target.value) })}
              options={Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${i}:00` }))}
            />
            <p className="mt-1 text-[10px] text-ink-faint">
              Giờ chốt COD hàng ngày, 0–23.
            </p>
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="settings-low">
              Ngưỡng tồn thấp
            </label>
            <Input
              id="settings-low"
              type="number"
              min={1}
              value={String(form.lowStockThreshold ?? 1)}
              onChange={(e) => handleChange({ lowStockThreshold: Number(e.target.value) })}
            />
            <p className="mt-1 text-[10px] text-ink-faint">
              Cảnh báo khi tồn kho xuống dưới mức này.
            </p>
          </div>
        </div>
      </EditorialSection>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setRestoreId(true)}>
          Khôi phục giá trị cũ
        </Button>
        <Button type="button" onClick={() => handleSubmit()} isLoading={saving}>
          Lưu cấu hình
        </Button>
      </div>

      <Modal
        isOpen={restoreId}
        onClose={() => setRestoreId(false)}
        title="Khôi phục giá trị cũ"
        size="sm"
      >
        <div className="mb-4">
          <p className="text-[12px] text-ink-soft">
            Khôi phục lại cấu hình hiện tại về giá trị đã lưu lần cuối. Thay đổi chưa lưu sẽ mất.
          </p>
        </div>
        {actionError ? (
          <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setRestoreId(false)}>
            Hủy bỏ
          </Button>
          <Button type="button" onClick={handleRestore}>
            Khôi phục
          </Button>
        </div>
      </Modal>
    </div>
  );
}
