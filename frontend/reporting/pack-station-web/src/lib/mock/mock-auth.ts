export type DemoAccount = {
  email: string;
  password: string;
  role: string;
  label: string;
  fullName: string;
  staffId?: string;
  note: string;
};

/**
 * Demo credentials cho mock data source của pack station.
 * Mật khẩu bất kỳ đều đăng nhập được; tài khoản này chỉ chọn vai trò.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'pack@smartlogi.vn',
    password: 'demo1234',
    role: 'WAREHOUSE_STAFF',
    label: 'Nhân viên trạm đóng gói',
    fullName: 'Đỗ Văn Minh',
    staffId: 'hw-001',
    note: 'Trạm A, role WAREHOUSE_STAFF',
  },
];

const encode = (value: unknown) => {
  const json = JSON.stringify(value);
  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(json, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
      sub: `pack-${account.role.toLowerCase()}`,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      staffId: account.staffId,
      stationId: account.staffId?.replace(/^hw-/, 'wh-0'),
      iat: issuedAt,
      exp: issuedAt + 12 * 3600,
    }),
    'demo',
  ].join('.');

  return { accessToken: token, role: account.role };
}
