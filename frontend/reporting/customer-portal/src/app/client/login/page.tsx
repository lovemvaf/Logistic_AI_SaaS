'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import { isMockDataSource } from '@/lib/data';
import { mockLogin } from '@/lib/mock';
import {
  EditorialPageHeader,
  EmptyNote,
  StatusLabel,
} from 'ui-kit';
import {
  Input,
  Button,
} from 'ui-components';

/**
 * Đăng nhập khách B2B.
 *
 * - Chế độ API (`NEXT_PUBLIC_DATA_SOURCE=api`): gọi `POST /api/v1/client/auth/login`
 *   với header `x-tenant-slug` thật, không giả lập phiên.
 * - Chế độ mock: dùng `mockLogin` nội bộ cho demo không backend.
 */

export default function ClientLogin() {
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

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }
    setError('');

    if (isMockDataSource) {
      const mockMail = 'buyer@anphat.vn';
      if (email.trim().toLowerCase() !== mockMail) {
        setError('Email không thuộc tài khoản demo khách hàng.');
        return;
      }
      setLoading(true);
      try {
        const { accessToken } = mockLogin({ email: mockMail, password });
        login(accessToken);
        router.push('/client/dashboard');
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
        '/client/auth/login',
        { email: email.trim(), password },
        { headers: { 'x-tenant-slug': slug } },
      );
      localStorage.setItem('smartlogi_tenant_slug', slug);
      login(res.data.accessToken);
      router.push('/client/dashboard');
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Đăng nhập thất bại.';
      setError(String(message));
    } finally {
      setLoading(false);
    }
  }, [email, password, tenantSlug, login, router]);

  const handleDemoLogin = useCallback(() => {
    if (!isMockDataSource) return;
    const { accessToken } = mockLogin({
      email: 'buyer@anphat.vn',
      password: 'demo1234',
    });
    login(accessToken);
    router.push('/client/dashboard');
  }, [login, router]);

  return (
    <div className="min-h-screen bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
        <div className="self-center space-y-6">
          <EditorialPageHeader
            title="Đăng nhập khách B2B"
            description="Đăng nhập để xem dữ liệu của công ty: đơn, hoá đơn, tồn kho, lô hàng container. Giá trị COD chỉ hiển thị khi đã xác thực."
          />
          {isMockDataSource ? (
            <EmptyNote>
              Tài khoản demo offline: email `buyer@anphat.vn`, mật khẩu bất kỳ.
            </EmptyNote>
          ) : (
            <EmptyNote>
              Kết nối backend trực tiếp. Nhập mã doanh nghiệp (Tenant Slug), email và mật khẩu được cấp để đăng nhập cổng khách hàng.
            </EmptyNote>
          )}
        </div>

        <div className="self-center">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isMockDataSource ? (
              <Input
                id="client-tenant-slug"
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
              id="client-email"
              type="email"
              label="Email công ty"
              placeholder={isMockDataSource ? 'buyer@anphat.vn' : 'client.owner@company.vn'}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
            />
            <Input
              id="client-password"
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
