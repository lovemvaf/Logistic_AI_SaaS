export type DemoAccount = {
  email: string;
  password: string;
  role: string;
  label: string;
  fullName: string;
  note: string;
};

/**
 * Demo credentials for the mock data source.
 * Any non-empty password works; these accounts only choose a role.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'admin@smartlogi.vn',
    password: 'demo1234',
    role: 'TENANT_ADMIN',
    label: 'Quản trị tenant',
    fullName: 'Trần Quốc Hùng',
    note: 'Toàn quyền, thấy mọi phân hệ',
  },
  {
    email: 'hanh.nguyen@smartlogi.vn',
    password: 'demo1234',
    role: 'WAREHOUSE_MANAGER',
    label: 'Quản lý kho',
    fullName: 'Nguyễn Thu Hạnh',
    note: 'WMS, kiểm kê, đóng gói',
  },
  {
    email: 'trang.pham@smartlogi.vn',
    password: 'demo1234',
    role: 'LOGISTICS_MANAGER',
    label: 'Điều phối vận tải',
    fullName: 'Phạm Minh Trang',
    note: 'Chuyến, GPS, SOS, COD',
  },
  {
    email: 'tai.nguyen@smartlogi.vn',
    password: 'demo1234',
    role: 'DRIVER',
    label: 'Tài xế',
    fullName: 'Nguyễn Văn Tài',
    note: 'Chuyến được gán, nộp COD',
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
  tenantSlug: string;
}): MockLoginResult {
  if (!input.tenantSlug.trim()) {
    throw new Error('Vui lòng nhập mã tenant.');
  }
  if (!input.email.trim() || !input.password) {
    throw new Error('Vui lòng nhập email và mật khẩu.');
  }

  const account =
    DEMO_ACCOUNTS.find((row) => row.email.toLowerCase() === input.email.trim().toLowerCase()) ??
    DEMO_ACCOUNTS[0];

  const issuedAt = Math.floor(Date.now() / 1000);
  const token = [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({
      sub: `demo-${account.role.toLowerCase()}`,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      tenant_id: 'demo-tenant',
      tenant_slug: input.tenantSlug.trim(),
      iat: issuedAt,
      exp: issuedAt + 12 * 3600,
    }),
    'demo',
  ].join('.');

  return { accessToken: token, role: account.role };
}
