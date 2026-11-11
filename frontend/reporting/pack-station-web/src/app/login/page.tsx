'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { mockLogin } from '@/lib/mock';
import { EditorialPageHeader, EmptyNote, StatusLabel } from 'ui-kit';
import { Input, Button } from 'ui-components';

/** Giải mã payload base64url của token giả, lấy staffId / stationId cho phiên. */
function decodePayload(token: string) {
  const segment = token.split('.')[1];
  if (!segment) throw new Error('Token không hợp lệ.');
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  // Base64 chuẩn yêu cầu chiều dài bội số 4: trả lại padding đã bị xóa lúc mã hóa.
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
 * Chế độ demo: email `pack@smartlogi.vn` + mật khẩu bất kỳ tạo một token giả
 * giống tenant portal (`mockLogin`), lưu phiên vào `localStorage` và đẩy về
 * `/pack`. Token mang theo `staffId` / `stationId` nên phiên mở đúng trạm.
 * Không gọi Google OAuth khi chưa có `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
 */

export default function PackStationLogin() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const performLogin = useCallback(async (credentialEmail: string, credentialPassword: string) => {
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

    const mockMail = 'pack@smartlogi.vn';
    if (email.trim().toLowerCase() !== mockMail) {
      setError('Email không thuộc tài khoản demo nhân viên trạm.');
      return;
    }

    setLoading(true);
    try {
      await performLogin(mockMail, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [email, password, performLogin]);

  const handleDemoLogin = useCallback(() => {
    void performLogin('pack@smartlogi.vn', 'demo1234');
  }, [performLogin]);

  return (
    <div className="min-h-screen bg-canvas p-6 font-sans text-ink">
      <div className="mx-auto grid max-w-[72rem] gap-8 md:grid-cols-2">
        <div className="self-center space-y-6">
          <EditorialPageHeader
            title="Đăng nhập trạm đóng gói"
            description="Đăng nhập để đóng gói, quét mã thuốc và ghi nhận kiện hàng tại trạm A/B."
          />
          <EmptyNote>
            Tài khoản demo: email `pack@smartlogi.vn`, mật khẩu bất kỳ. Đóng gói chỉ hoạt
            động khi đăng nhập.
          </EmptyNote>
        </div>

        <div className="self-center">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="pack-email"
              type="email"
              label="Email nhân viên"
              placeholder="pack@smartlogi.vn"
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
