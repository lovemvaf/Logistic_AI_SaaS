'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import { isMockDataSource } from '@/lib/data';
import { mockLogin } from '@/lib/mock';
import { EditorialPageHeader, EmptyNote, StatusLabel } from 'ui-kit';
import { Input, Button } from 'ui-components';

/** Giải mã payload base64url của JWT để lấy `staffId` / `stationId` / `slug` cho phiên. */
function decodePayload(token: string) {
  const segment = token.split('.')[1];
  if (!segment) throw new Error('Token không hợp lệ.');
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  const bytes = atob(base64 + '='.repeat(padding));
  return JSON.parse(utf8toString(bytes)) as Record<string, unknown>;
}

/** Chuyển byte (0-255) hạ giải từ base64 thành ký tự UTF-8. */
function utf8toString(bytes: string) {
  const code = Array.from(bytes).map((b) => b.charCodeAt(0));
  let result = '';
  let i = 0;
  while (i < code.length) {
    const a = code[i];
    const b1 = code[i + 1] ?? 0;
    const b2 = code[i + 2] ?? 0;
    const b3 = code[i + 3] ?? 0;
    if (a < 0x80) {
      result += String.fromCharCode(a);
      i += 1;
      continue;
    }
    if ((a & 0xe0) === 0xc0) {
      result += String.fromCharCode(((a & 0x1f) << 6) | (b1 & 0x3f));
      i += 2;
      continue;
    }
    if ((a & 0xf0) === 0xe0) {
      result += String.fromCharCode(((a & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
      i += 3;
      continue;
    }
    if ((a & 0xf8) === 0xf0) {
      result += String.fromCharCode(((a & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      i += 4;
      continue;
    }
    result += String.fromCharCode(a);
    i += 1;
  }
  return result;
}

/**
 * Đăng nhập trạm đóng gói.
 *
 * - Chế độ API (`NEXT_PUBLIC_DATA_SOURCE=api`): gọi `POST /api/v1/tenant/auth/login`
 *   với header `x-tenant-slug` và `x-portal: pack-station`.
 * - Chế độ mock: giữ nhánh `mockLogin` khi không kết nối backend.
 */

export default function PackStationLogin() {
  const { login } = useAuth();
  const router = useRouter();

  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const paramSlug = params.get('tenant') || localStorage.getItem('smartlogi_tenant_slug') || '';
    if (paramSlug && !tenantSlug) {
      setTenantSlug(paramSlug);
    }
  }, [tenantSlug]);

  const performMockLogin = useCallback(async (credentialEmail: string, credentialPassword: string) => {
    const { accessToken } = mockLogin({ email: credentialEmail, password: credentialPassword });
    const payload = decodePayload(accessToken);
    login(accessToken, {
      fullName: payload.fullName as string,
      email: payload.email as string,
      role: payload.role as string,
      staffId: payload.staffId as string,
      stationId: payload.stationId as string,
    });
    router.push('/pack');
  }, [login, router]);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }
    setError('');

    if (isMockDataSource) {
      const mockMail = 'pack@smartlogi.vn';
      if (email.trim().toLowerCase() !== mockMail) {
        setError('Email không thuộc tài khoản demo nhân viên trạm.');
        return;
      }

      setLoading(true);
      try {
        await performMockLogin(mockMail, password);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    const slug = tenantSlug.trim();
    if (!slug) {
      setError('Vui lòng nhập mã doanh nghiệp (Tenant Slug).');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        '/tenant/auth/login',
        { email: email.trim(), password },
        {
          headers: {
            'x-tenant-slug': slug,
            'x-portal': 'pack-station',
          },
        },
      );
      const accessToken: string = res.data.accessToken;
      const payload = decodePayload(accessToken);
      localStorage.setItem('smartlogi_tenant_slug', slug);
      login(accessToken, {
        fullName: (payload.fullName as string) || (payload.email as string) || email.trim(),
        email: (payload.email as string) || email.trim(),
        role: (res.data.role as string) || (payload.role as string) || 'WAREHOUSE_STAFF',
        staffId: (payload.sub as string) || (payload.staffId as string) || '',
        stationId: (payload.stationId as string) || '',
        slug,
      });
      router.push('/pack');
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Đăng nhập thất bại.';
      setError(String(message));
    } finally {
      setLoading(false);
    }
  }, [email, password, tenantSlug, performMockLogin, login, router]);

  const handleDemoLogin = useCallback(() => {
    if (!isMockDataSource) return;
    void performMockLogin('pack@smartlogi.vn', 'demo1234');
  }, [performMockLogin]);

  return (
    <div className="min-h-screen bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
        <div className="self-center space-y-6">
          <EditorialPageHeader
            title="Đăng nhập trạm đóng gói"
            description="Đăng nhập để đóng gói, quét mã barcode/SKU và ghi nhận kiện hàng theo ca làm việc."
          />
          {isMockDataSource ? (
            <EmptyNote>
              Tài khoản demo offline: email `pack@smartlogi.vn`, mật khẩu bất kỳ.
            </EmptyNote>
          ) : (
            <EmptyNote>
              Kết nối trực tiếp WMS backend (`x-portal: pack-station`). Chỉ vai trò `WAREHOUSE_STAFF`, `WAREHOUSE_MANAGER` hoặc `TENANT_ADMIN` được phép truy cập.
            </EmptyNote>
          )}
        </div>

        <div className="self-center">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isMockDataSource ? (
              <Input
                id="pack-tenant-slug"
                type="text"
                label="Mã doanh nghiệp (Tenant Slug)"
                placeholder="demo-3pl-dn"
                required
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
                disabled={loading}
              />
            ) : null}
            <Input
              id="pack-email"
              type="email"
              label="Email nhân viên"
              placeholder={isMockDataSource ? 'pack@smartlogi.vn' : 'packer@company.vn'}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
            />
            <Input
              id="pack-password"
              type="password"
              label="Mật khẩu"
              placeholder="Nhập mật khẩu…"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
            />

            {error ? (
              <div className="flex items-center gap-2 rounded-md border-l-2 border-danger bg-surface px-3 py-2">
                <StatusLabel tone="danger">{error}</StatusLabel>
              </div>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              className="h-11 w-full text-[13px] font-semibold rounded-lg"
              disabled={loading}
            >
              {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>

            {isMockDataSource ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full text-[13px] font-semibold rounded-lg"
                onClick={handleDemoLogin}
              >
                Vào bằng tài khoản thử nghiệm
              </Button>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
