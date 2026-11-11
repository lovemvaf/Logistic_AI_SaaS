'use client';

import { useState, useEffect } from 'react';
import { Button, Input } from 'ui-components';
import { EditorialPageHeader, EditorialSection, StatusLabel } from 'ui-kit';
import { useAuth } from '@/lib/auth-context';
import { switchRole } from '@/lib/role-switch';
import { ROLES } from '@/lib/roles';
import api from '@/lib/api';
import { initStore, getOne, update, isMockDataSource, UserProfile } from '@/lib/local-store';

export default function AdminProfile() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveMsgType, setSaveMsgType] = useState<'success' | 'danger'>('success');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [roleSwitching, setRoleSwitching] = useState(false);
  const [roleMsg, setRoleMsg] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      if (isMockDataSource) {
        initStore();
        const cached = getOne('adminProfile', 'current');
        const data: UserProfile = cached || { id: 'current', email: user?.email, role: user?.role, fullName: user?.name };
        setProfile(data);
        setFullName(data.fullName || user?.email?.split('@')[0] || '');
      } else {
        const res = await api.get('/admin/auth/profile');
        const data: UserProfile = res.data || { email: user?.email, role: user?.role, fullName: user?.fullName };
        setProfile(data);
        setFullName(data.fullName || user?.email?.split('@')[0] || '');
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      if (isMockDataSource) {
        const record = update('adminProfile', 'current', { fullName }) as UserProfile | null;
        if (record) {
          setProfile(record);
          setSaveMsg('Profile updated successfully (demo mode).');
          setSaveMsgType('success');
        }
      } else {
        const res = await api.patch('/admin/auth/profile', { fullName });
        setProfile(res.data || { ...profile, fullName });
        setSaveMsg('Profile updated successfully.');
        setSaveMsgType('success');
      }
    } catch (err: any) {
      setSaveMsg(err?.response?.data?.message || 'Failed to update profile.');
      setSaveMsgType('danger');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmNewPassword) {
      setPasswordMsg('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg('Password must be at least 8 characters.');
      return;
    }
    if (isMockDataSource) {
      setPasswordMsg('Password changes are disabled in demo mock mode.');
      return;
    }

    setChangingPassword(true);
    try {
      await api.post('/admin/auth/change-password', { oldPassword, newPassword });
      setPasswordMsg('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setPasswordMsg(err?.response?.data?.message || 'Failed to change password. Verify your current password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSwitchRole = async (newRole: string) => {
    if (!isMockDataSource) return;
    setRoleSwitching(true);
    setRoleMsg(null);
    try {
      const ok = await switchRole(newRole);
      if (ok) {
        const currentRole = ROLES[newRole] || newRole.replace(/_/g, ' ');
        setRoleMsg(`Role switched to ${currentRole}. Page will refresh to apply new permissions.`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setRoleMsg('Role switch failed.');
      }
    } catch {
      setRoleMsg('Role switch failed.');
    } finally {
      setRoleSwitching(false);
    }
  };

  const displayRole = user?.role || profile?.role || 'SUPER_ADMIN';

  return (
    <div>
      <EditorialPageHeader
        eyebrow="Administration"
        title="Profile"
        description="Manage your account information, password, and role permissions."
        meta={
          <div className="text-[11px] leading-5">
            <StatusLabel tone={user?.role === 'SUPER_ADMIN' ? 'success' : 'info'}>
              {roleOf(displayRole)} · {displayRole}
            </StatusLabel>
          </div>
        }
      />

      {/* Role-switch quick bar — strictly mock mode only */}
      {isMockDataSource ? (
        <EditorialSection eyebrow="Access" title="Role switch">
          <div className="flex flex-wrap gap-2">
            {Object.entries(ROLES).map(([value, label]) => (
              <Button
                key={value}
                variant={value === displayRole ? 'primary' : 'outline'}
                size="sm"
                onClick={() => handleSwitchRole(value)}
                disabled={roleSwitching || value === displayRole}
              >
                {value === displayRole ? `Current: ${label}` : label}
              </Button>
            ))}
          </div>
          {roleMsg && (
            <p className="mt-3 text-[12px] text-ink-soft">
              <span className="mr-2">{roleMsg}</span>
            </p>
          )}
        </EditorialSection>
      ) : (
        <EditorialSection eyebrow="Access" title="Permissions">
          <p className="text-[12px] text-ink-soft">
            Role switching is disabled in live API mode. Permissions are enforced by your server-issued JWT ({displayRole}).
          </p>
        </EditorialSection>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile card */}
        <EditorialSection eyebrow="Account" title="Personal info" className="lg:col-span-2">
          {loading ? (
            <p className="text-[12px] text-ink-faint">Loading profile…</p>
          ) : profile ? (
            <form onSubmit={handleSaveProfile} className="max-w-lg space-y-5">
              <div className="space-y-3 border-b border-line pb-5">
                <div>
                  <label htmlFor="profile-email" className="text-[11px] font-medium text-ink-soft">Email</label>
                  <p className="mt-1 h-9 rounded-md border border-line bg-surface-alt px-3 text-[13px] text-ink">
                    {profile.email || '—'}
                  </p>
                </div>
                <div>
                  <label htmlFor="profile-role" className="text-[11px] font-medium text-ink-soft">Role</label>
                  <p className="mt-1 h-9 rounded-md border border-line bg-surface-alt px-3 text-[13px] text-ink">
                    {String(profile.role || 'SUPER_ADMIN').replace(/_/g, ' ')}
                  </p>
                </div>
              </div>

              <div>
                <Input
                  id="profile-full-name"
                  label="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>

              {saveMsg && (
                <p className={`text-[12px] ${saveMsgType === 'success' ? 'text-success' : 'text-danger'}`}>
                  {saveMsg}
                </p>
              )}

              <Button type="submit" variant="primary" disabled={saving} isLoading={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface-alt p-10 text-center">
              <p className="text-[12px] text-danger">Failed to load profile.</p>
              <Button variant="outline" size="sm" onClick={loadProfile}>
                Try again
              </Button>
            </div>
          )}
        </EditorialSection>

        {/* Security card */}
        <EditorialSection eyebrow="Access & security" title="Password">
          <form onSubmit={handleChangePassword} className="max-w-sm space-y-4">
            <div>
              <Input label="Current password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Enter current password" required />
            </div>
            <div>
              <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} />
            </div>
            <div>
              <Input label="Confirm new password" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="Re-enter new password" required minLength={8} />
            </div>
            {passwordMsg && (
              <p className={`text-[12px] ${passwordMsg.includes('successfully') ? 'text-success' : 'text-danger'}`}>
                {passwordMsg}
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={changingPassword} isLoading={changingPassword}>
              {changingPassword ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </EditorialSection>
      </div>

      <EditorialSection eyebrow="Session" title="Sign out">
        <p className="mb-4 text-[12px] text-ink-soft">Sign out of your current session on this device.</p>
        <div className="flex gap-2">
          <Button variant="danger" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </EditorialSection>
    </div>
  );
}

function roleOf(role?: string) {
  if (!role) return 'Admin';
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
