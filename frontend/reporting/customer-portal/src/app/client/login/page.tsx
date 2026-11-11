'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
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
 * Chế độ mock: email `buyer@anphat.vn` + mật khẩu bất kỳ tạo một token giả
 * và `useAuth().login(token)` như tenant portal. Không có Google OAuth khi
 * `NEXT_PUBLIC_GOOGLE_CLIENT_ID` chưa được cấu hình.
 */

export default function ClientLogin() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }
    setError('');
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
  }, [email, password, login, router]);

  const handleDemoLogin = useCallback(() => {
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
            description="Đăng nhập để xem dữ liệu của công ty: đơn, hoá đơn, tồn kho. Giá trị COD chỉ hiển thị khi đã xác thực."
          />
          <EmptyNote>
            Tài khoản demo: email `buyer@anphat.vn`, mật khẩu bất kỳ. Thanh toán và tạo
            đơn chỉ hoạt động khi đăng nhập.
          </EmptyNote>
        </div>

        <div className="self-center">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="client-email"
              type="email"
              label="Email công ty"
              placeholder="buyer@anphat.vn"
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

            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full text-[13px] font-semibold rounded-lg"
              onClick={handleDemoLogin}
            >
              Vào bằng tài khoản thử nghiệm
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
