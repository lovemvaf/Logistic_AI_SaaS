'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { data, isMockDataSource } from '@/lib/data';
import {
  EditorialPageHeader,
  EditorialSection,
  StatusLabel,
  type StatusTone,
} from 'ui-kit';
import { Input, Button } from 'ui-components';

/**
 * Thông tin công ty khách hàng.
 *
 * Trường hợp mặc định là profile duy nhất trong seed. Khi backend thật sẵn sàng,
 * `data.profiles.list()` trả về danh sách và page lấy dòng đầu tiên.
 */

export default function ClientProfile() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await data.profiles.list();
      setProfiles(rows);
      const row = rows.find((r: any) => r.role === 'CLIENT') || rows[0];
      if (row) {
        setCompanyName(row.company || '');
        setContactName(row.contactName || '');
        setPhone(row.phone || '');
        setAddress(row.address || '');
        setProvince(row.province || '');
        setDistrict(row.district || '');
        setTaxCode(row.taxCode || '');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const profile = profiles[0] ?? null;
  const role = profile?.role ?? 'CLIENT';

  const roleTone = (role: string): StatusTone => (role === 'CLIENT' ? 'success' : 'neutral');

  const roleLabel = (role: string) => role.replace(/_/g, ' ');

  const handleSaveProfile = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveMsg(null);
    setFormError('');
    setSaving(true);

    const patch: Record<string, string> = {};
    if (companyName) patch.company = companyName;
    if (contactName) patch.contactName = contactName;
    if (phone) patch.phone = phone;
    if (address) patch.address = address;
    if (province) patch.province = province;
    if (district) patch.district = district;
    if (taxCode) patch.taxCode = taxCode;

    if (Object.keys(patch).length === 0) {
      setFormError('Chưa có thay đổi nào. Hãy cập nhật thông tin rồi lưu lại.');
      setSaving(false);
      return;
    }

    try {
      await data.profiles.saveProfile(patch);
      setSaveMsg('Đã lưu thông tin.');
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }, [companyName, contactName, phone, address, province, district, taxCode]);

  const handleChangePassword = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmNewPassword) {
      setPasswordMsg('Mật khẩu mới không khớp.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    setChangingPassword(true);
    try {
      if (!isMockDataSource) {
        if (!oldPassword) {
          setPasswordMsg('Vui lòng nhập mật khẩu hiện tại.');
          return;
        }
        await api.post('/client/auth/change-password', { oldPassword, newPassword });
      }
      setPasswordMsg('Đã cập nhật mật khẩu.');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setPasswordMsg(
        err?.response?.data?.message ||
          (isMockDataSource
            ? 'Thay đổi mật khẩu không khả dụng trong chế độ thử nghiệm.'
            : 'Không đổi được mật khẩu.'),
      );
    } finally {
      setChangingPassword(false);
    }
  }, [oldPassword, newPassword, confirmNewPassword]);

  return (
    <div className="space-y-4">
      <EditorialPageHeader
        eyebrow={
          <>
            <span>Khách hàng</span>
            <span className="text-line-strong" aria-hidden="true">/</span>
            <span>Hồ sơ</span>
          </>
        }
        title="Hồ sơ khách hàng"
        description="Thông tin công ty, liên hệ và mật khẩu đăng nhập."
      />

      <EditorialSection eyebrow="Công ty" title="Thông tin công ty">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Công ty</p>
            <p className="mt-1 text-[13px] font-medium text-ink">{profile?.company ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Email</p>
            <p className="mt-1 text-[13px] text-ink">{profile?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Vai trò</p>
            <p className="mt-1">
              <StatusLabel tone={roleTone(role)}>{roleLabel(role)}</StatusLabel>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Mã số thuế</p>
            <p className="mt-1 text-[13px] text-ink">{profile?.taxCode ?? '—'}</p>
          </div>
        </div>
      </EditorialSection>

      <EditorialSection eyebrow="Liên hệ" title="Cập nhật thông tin liên hệ">
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Input
            type="text"
            label="Tên công ty"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            disabled={saving}
          />
          <Input
            type="text"
            label="Tên người liên hệ"
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            disabled={saving}
          />
          <Input
            type="tel"
            label="Số điện thoại"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={saving}
          />
          <Input
            type="text"
            label="Địa chỉ"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            disabled={saving}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="text"
              label="Tỉnh / thành phố"
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              disabled={saving}
            />
            <Input
              type="text"
              label="Quận / huyện"
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              disabled={saving}
            />
          </div>
          {saveMsg ? (
            <p className="text-[12px] text-success">{saveMsg}</p>
          ) : null}
          {formError ? (
            <p className="text-[12px] text-danger">{formError}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="submit" variant="primary" disabled={saving} className="h-10 rounded-lg text-[12px] font-medium">
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </EditorialSection>

      <EditorialSection eyebrow="Bảo mật" title="Đổi mật khẩu">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input
            type="password"
            label="Mật khẩu hiện tại"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            disabled={changingPassword}
          />
          <Input
            type="password"
            label="Mật khẩu mới"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={changingPassword}
          />
          <Input
            type="password"
            label="Xác nhận mật khẩu mới"
            value={confirmNewPassword}
            onChange={(event) => setConfirmNewPassword(event.target.value)}
            disabled={changingPassword}
          />
          {passwordMsg ? (
            <p className="text-[12px] text-ink-soft">{passwordMsg}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="submit" variant="primary" disabled={changingPassword} className="h-10 rounded-lg text-[12px] font-medium">
              {changingPassword ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </Button>
          </div>
        </form>
      </EditorialSection>
    </div>
  );
}
