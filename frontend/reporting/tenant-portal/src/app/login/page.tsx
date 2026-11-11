"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLoginButton } from '@/components/ui/GoogleLoginButton';
import api from '@/lib/api';
import { setSession } from '@/lib/auth';
import { isMockDataSource } from '@/lib/data';
import { DEMO_ACCOUNTS, mockLogin } from '@/lib/mock-auth';

const ROLE_REDIRECT: Record<string, string> = {
  TENANT_ADMIN: '/dashboard',
  TENANT_USER: '/dashboard',
  WAREHOUSE_MANAGER: '/dashboard',
  WAREHOUSE_STAFF: '/dashboard',
  LOGISTICS_MANAGER: '/logistics/dispatch',
  DRIVER: '/drivers/my-trips',
};

const DEMO_TENANT = 'demo-logistics-vn';

export default function TenantLoginPage() {
  const [tenantSlug, setTenantSlug] = useState(isMockDataSource ? DEMO_TENANT : '');
  const [email, setEmail] = useState(isMockDataSource ? DEMO_ACCOUNTS[0].email : '');
  const [password, setPassword] = useState(isMockDataSource ? DEMO_ACCOUNTS[0].password : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tenantSlug.trim()) {
      setError('Vui lòng nhập mã tenant.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }

    setLoading(true);
    try {
      if (isMockDataSource) {
        await new Promise((resolve) => setTimeout(resolve, 420));
        const result = mockLogin({ email, password, tenantSlug });
        localStorage.setItem('smartlogi_tenant_slug', tenantSlug.trim());
        setSession(result.accessToken);
        router.replace(ROLE_REDIRECT[result.role] || '/dashboard');
        return;
      }

      localStorage.setItem('smartlogi_tenant_slug', tenantSlug.trim());
      const res = await api.post(
        '/tenant/auth/login',
        { email: email.trim(), password },
        {
          headers: {
            'x-tenant-slug': tenantSlug.trim(),
            'x-portal': 'tenant',
          },
        },
      );

      if (!res.data?.accessToken) {
        setError(res.data?.message || 'Đăng nhập thất bại.');
        return;
      }

      setSession(res.data.accessToken);
      const role = res.data.role || 'TENANT_USER';
      router.replace(ROLE_REDIRECT[role] || '/dashboard');
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Không kết nối được dịch vụ đăng nhập. Thử lại sau.',
      );
    } finally {
      setLoading(false);
    }
  };

  const useAccount = (accountEmail: string) => {
    const account = DEMO_ACCOUNTS.find((row) => row.email === accountEmail);
    if (!account) return;
    setEmail(account.email);
    setPassword(account.password);
    setTenantSlug(DEMO_TENANT);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto grid min-h-screen max-w-5xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:px-10">
        <section className="border-b border-line pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            SmartLogi · Tenant portal
          </p>
          <h1 className="mt-4 font-editorial text-[54px] font-semibold leading-[0.92] tracking-[-0.03em] text-ink sm:text-[64px]">
            Bàn giao ca
          </h1>
          <p className="mt-5 max-w-[46ch] text-[13px] leading-6 text-ink-soft">
            Điều hành kho, chuyến xe, tài chính COD và khuyến nghị AI trong một mặt
            phẳng làm việc. Dữ liệu mẫu được giữ ngay trên trình duyệt của bạn.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-px border-y border-line bg-line">
            {[
              ['42', 'đơn đang mở'],
              ['04', 'wave hôm nay'],
              ['03', 'chuyến đang chạy'],
            ].map(([value, label]) => (
              <div key={label} className="bg-canvas px-3 py-3">
                <dt className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</dt>
                <dd className="mt-1 text-[24px] font-semibold leading-none tabular-nums text-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {isMockDataSource ? (
            <div className="mt-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Tài khoản dùng thử
              </p>
              <div className="mt-2 divide-y divide-line border-y border-line">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => useAccount(account.email)}
                    className="flex w-full items-baseline justify-between gap-4 py-2 text-left transition-colors hover:text-accent"
                  >
                    <span className="text-[12px] font-medium text-ink">{account.label}</span>
                    <span className="text-[11px] text-ink-faint">{account.note}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-ink-faint">
                Mật khẩu chung: demo1234 · mã tenant: {DEMO_TENANT}
              </p>
            </div>
          ) : null}
        </section>

        <section className="w-full max-w-sm lg:justify-self-end">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Đăng nhập</h2>
          <p className="mt-1 text-[12px] leading-5 text-ink-soft">
            Dùng tài khoản nội bộ của tenant để vào bảng điều hành.
          </p>

          {error ? (
            <p className="mt-4 border-l-2 border-danger py-1 pl-3 text-[12px] leading-5 text-danger">
              {error}
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="tenantSlug"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint"
              >
                Mã tenant
              </label>
              <input
                id="tenantSlug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="demo-logistics-vn"
                autoComplete="organization"
                className="w-full border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@congty.vn"
                autoComplete="email"
                className="w-full border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint"
              >
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-surface transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Đang kiểm tra…' : 'Vào bảng điều hành'}
            </button>
          </form>

          {!isMockDataSource ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                  hoặc
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className={tenantSlug.trim() ? '' : 'pointer-events-none opacity-50'}>
                <GoogleLoginButton tenantSlug={tenantSlug.trim()} />
              </div>
              {!tenantSlug.trim() ? (
                <p className="text-[11px] leading-5 text-ink-faint">
                  Nhập mã tenant trước khi đăng nhập bằng Google.
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-6 text-[11px] leading-5 text-ink-faint">
            Bản demo không gửi dữ liệu ra ngoài. Đăng nhập bằng tài khoản bất kỳ trong danh
            sách để xem đúng phạm vi quyền của vai trò đó.
          </p>
        </section>
      </div>
    </div>
  );
}
