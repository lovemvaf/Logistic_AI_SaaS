'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { EditorialPageHeader, EditorialSection, StatusLabel } from 'ui-kit';
import { Modal, Button, Input } from 'ui-components';
import { data } from '@/lib/data';
import type { UserAccount, TenantSettings } from '@/lib/mock';
import {
  accountStatusLabel,
  accountStatusTone,
  formatDateTimeVN,
  roleLabel,
} from '@/lib/labels';

export default function ProfilePage() {
  const { user } = useAuth();

  const [row, setRow] = useState<UserAccount | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [matched, setMatched] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [savedAt, setSavedAt] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [confirmId, setConfirmId] = useState<null | 'profile' | 'contact'>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [users, currentSettings] = await Promise.all([
        data.users.list(),
        data.settings.get(),
      ]);
      setSettings(currentSettings);
      const target = user?.email?.toLowerCase() ?? '';
      const found = target
        ? users.find((row) => row.email.toLowerCase() === target.toLowerCase()) ??
          users.find((row) => row.name === user?.fullName) ??
          users.find((row) => row.role === user?.role)
        : undefined;
      setRow(found ?? users[0] ?? null);
      setMatched(Boolean(found));
    } catch (err: any) {
      setError(err?.message ?? 'Không tải được hồ sơ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (row) {
      setName(row.name);
      setPhone(row.phone ?? '');
    } else {
      setName('');
      setPhone('');
    }
    const fallback = user?.fullName ?? row?.name ?? '';
    const fallbackEmail = user?.email ?? (settings?.contactEmail ?? '');
    setContactName(fallback);
    setContactEmail(fallbackEmail);
  }, [row, user, settings]);

  const handleProfile = async () => {
    if (!row || !matched) return;
    setSaving(true);
    setActionError('');
    try {
      await data.users.update(row.id, { name, phone });
      setSavedAt(formatDateTimeVN(new Date().toISOString()));
      setConfirmId(null);
    } catch (err: any) {
      setActionError(err?.message ?? 'Không lưu được hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  const handleContact = async () => {
    if (!settings) return;
    setSaving(true);
    setActionError('');
    try {
      const updated = await data.settings.update({
        contactName,
        contactEmail,
      });
      setSettings(updated);
      setSavedAt(updated.updatedAt);
      setConfirmId(null);
    } catch (err: any) {
      setActionError(err?.message ?? 'Không lưu được thông tin liên hệ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-line bg-canvas py-8">
          <StatusLabel tone="neutral">Đang tải hồ sơ...</StatusLabel>
        </div>
      ) : (
        <div className="space-y-6">
          <EditorialPageHeader
            eyebrow="Cá nhân"
            title="Hồ sơ của bạn"
            description="Cập nhật thông tin liên hệ và quyền truy cập tài khoản tenant của bạn."
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

          <EditorialSection title="Thông tin tài khoản" eyebrow="Đăng nhập">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="profile-email">
                  Email
                </label>
                <Input id="profile-email" readOnly value={row?.email ?? user?.email ?? ''} />
                {matched ? null : (
                  <p className="mt-1 text-[10px] text-warning">
                    Tài khoản demo chưa có trong danh sách người dùng tenant — liên hệ hệ thống.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="profile-name">
                  Họ và tên
                </label>
                <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="profile-phone">
                  Điện thoại
                </label>
                <Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]">
                  Vai trò
                </label>
                <p className="text-[12px] font-medium text-ink mt-1">{roleLabel(user?.role ?? '')}</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]">
                  Trạng thái
                </label>
                <p className="mt-1">
                  <StatusLabel tone={accountStatusTone(row?.status ?? 'ACTIVE')}>
                    {accountStatusLabel(row?.status ?? 'ACTIVE')}
                  </StatusLabel>
                </p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]">
                  Ngày tạo tài khoản
                </label>
                <p className="text-[12px] text-ink-faint mt-1">{row ? formatDateTimeVN(row.createdAt) : '—'}</p>
              </div>
            </div>
            {matched ? (
              <div className="mt-6">
                <Button type="button" variant="outline" onClick={() => setConfirmId('profile')}>
                  Lưu thông tin
                </Button>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-[12px] text-ink-soft">
                  Tài khoản demo chưa có thay đổi trực tiếp; thông tin sẽ ghi vào liên hệ của tenant.
                </p>
                <div className="mt-4">
                  <Button type="button" onClick={() => setConfirmId('contact')}>
                    Lưu liên hệ
                  </Button>
                </div>
              </div>
            )}
          </EditorialSection>

          <EditorialSection title="Thông tin liên hệ doanh nghiệp" eyebrow="Hồ sơ tenant">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="profile-contact-name">
                  Người liên hệ
                </label>
                <Input id="profile-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-[0.13em]" htmlFor="profile-contact-email">
                  Email doanh nghiệp
                </label>
                <Input id="profile-contact-email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
            </div>
            <p className="mt-4 text-[12px] text-ink-faint">
              Email liên hệ được dùng cho thông báo vận đơn, đối soát COD và các kênh đã chọn.
            </p>
          </EditorialSection>

          <Modal
            isOpen={confirmId !== null}
            onClose={() => setConfirmId(null)}
            title={confirmId === 'contact' ? 'Lưu liên hệ doanh nghiệp' : 'Lưu hồ sơ'}
            size="sm"
          >
            <div className="mb-4">
              <p className="text-[12px] text-ink-soft">
                Xác nhận lưu thay đổi cho{' '}
                <span className="font-medium text-ink">
                  {confirmId === 'contact' ? contactName : row?.name ?? `${name}`}
                </span>{' '}
                (email {confirmId === 'contact' ? contactEmail : row?.email ?? user?.email ?? ''}).
              </p>
            </div>
            {actionError ? (
              <p className="mb-4 text-[11px] font-medium text-danger">{actionError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmId(null)}>
                Bỏ qua
              </Button>
              <Button
                type="button"
                onClick={() =>
                  confirmId === 'profile' ? handleProfile() : handleContact()
                }
                isLoading={saving}
                disabled={saving}
              >
                Xác nhận
              </Button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
