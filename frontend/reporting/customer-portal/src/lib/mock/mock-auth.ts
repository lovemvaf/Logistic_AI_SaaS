export type DemoAccount = {
  email: string;
  password: string;
  role: string;
  label: string;
  fullName: string;
  note: string;
};

/**
 * Demo credentials cho mock data source của customer portal.
 * Mật khẩu bất kỳ đều đăng nhập được; các tài khoản này chỉ chọn vai trò.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'buyer@anphat.vn',
    password: 'demo1234',
    role: 'CLIENT',
    label: 'Khách hàng B2B',
    fullName: 'Nguyễn Văn An',
    note: 'Công ty TNHH Bán lẻ An Phát, truy cập toàn bộ client/*',
  },
];

const encode = (value: unknown) => {
  const json = JSON.stringify(value);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export type MockLoginResult = {
  accessToken: string;
  role: string;
};

export function mockLogin(input: {
  email: string;
  password: string;
}): MockLoginResult {
  if (!input.email.trim()) {
    throw new Error('Vui lòng nhập email.');
  }
  if (!input.password) {
    throw new Error('Vui lòng nhập mật khẩu.');
  }

  const account =
    DEMO_ACCOUNTS.find((row) => row.email.toLowerCase() === input.email.trim().toLowerCase()) ??
    DEMO_ACCOUNTS[0];

  const issuedAt = Math.floor(Date.now() / 1000);
  const token = [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({
      sub: `client-${account.role.toLowerCase()}`,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      tenant_slug: 'anphat',
      iat: issuedAt,
      exp: issuedAt + 12 * 3600,
    }),
    'demo',
  ].join('.');

  return { accessToken: token, role: account.role };
}
