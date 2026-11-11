import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { withPlatform } from './db';
import type { DemoPersona, DemoRole, DemoSession, PortalId } from './types';

export const DEMO_TENANT_IDS = {
  DN3PL: '30000000-0000-4000-8000-000000000001',
  FDIBH: '40000000-0000-4000-8000-000000000001',
  LMLK: '50000000-0000-4000-8000-000000000001',
  SUSPENDED: '60000000-0000-4000-8000-000000000001',
} as const;

const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

export function isDemoModeEnabled(): boolean {
  if (process.env.SMARTLOGI_DEMO_MODE === 'false') return false;
  if (
    process.env.SMARTLOGI_DEMO_MODE === 'true' ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  ) {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

function getSigningSecret(): string {
  const s =
    process.env.JWT_SECRET ||
    process.env.DEMO_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (s && s.trim().length >= 16) {
    return s.trim();
  }
  if (process.env.VERCEL_ENV === 'production' && !isDemoModeEnabled()) {
    throw new Error('JWT_SECRET or DEMO_SESSION_SECRET is required in production.');
  }
  return EPHEMERAL_DEV_SECRET;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    key: 'super-admin',
    portal: 'admin',
    allowedPortals: ['admin', 'tenant', 'pack'],
    tenantId: null,
    tenantSlug: 'platform',
    tenantName: 'SmartLogi Platform Governance',
    tenantStatus: 'ACTIVE',
    role: 'SUPER_ADMIN',
    email: 'superadmin@smartlogi.demo',
    fullName: 'SmartLogi Platform Admin',
    title: 'Quản trị Nền tảng SaaS (Super Admin)',
    description: 'Quản lý 4 tenant, Outbox DLQ, địa giới 95 phường/xã Đồng Nai 2026 & AI Models.',
    defaultPath: '/admin/dashboard',
  },
  {
    key: 'dn3pl-admin',
    portal: 'tenant',
    allowedPortals: ['tenant', 'pack', 'admin'],
    tenantId: DEMO_TENANT_IDS.DN3PL,
    tenantSlug: 'demo-3pl-dn',
    tenantName: 'SmartLogi 3PL Đồng Nai (Container & Kho)',
    tenantStatus: 'ACTIVE',
    role: 'TENANT_ADMIN',
    email: 'ops.admin@3pl-dn.demo',
    fullName: 'Trần Minh Quân (Tenant Admin 3PL ĐN)',
    title: 'Giám đốc Vận hành 3PL Đồng Nai',
    description: 'Toàn quyền WMS, TMS, Container/Yard, XNK, Tài chính COD & B2B tại demo-3pl-dn.',
    defaultPath: '/dashboard',
  },
  {
    key: 'dn3pl-dispatcher',
    portal: 'tenant',
    allowedPortals: ['tenant'],
    tenantId: DEMO_TENANT_IDS.DN3PL,
    tenantSlug: 'demo-3pl-dn',
    tenantName: 'SmartLogi 3PL Đồng Nai (Container & Kho)',
    tenantStatus: 'ACTIVE',
    role: 'LOGISTICS_MANAGER',
    email: 'dispatcher@3pl-dn.demo',
    fullName: 'Nguyễn Thị Hương (Logistics Manager)',
    title: 'Điều phối Vận tải & Container (3PL ĐN)',
    description: 'Quản lý RFQ/Quote/Booking, kéo cont Cát Lái/Cái Mép, bãi ICD & đối soát COD.',
    defaultPath: '/freight',
  },
  {
    key: 'dn3pl-whmgr',
    portal: 'tenant',
    allowedPortals: ['tenant', 'pack'],
    tenantId: DEMO_TENANT_IDS.DN3PL,
    tenantSlug: 'demo-3pl-dn',
    tenantName: 'SmartLogi 3PL Đồng Nai (Container & Kho)',
    tenantStatus: 'ACTIVE',
    role: 'WAREHOUSE_MANAGER',
    email: 'wh.manager@3pl-dn.demo',
    fullName: 'Lê Hoàng Nam (Warehouse Manager)',
    title: 'Trưởng kho ICD Long Bình (WMS)',
    description: 'Nhập/xuất/chuyển kho, FEFO, Wave picking, Cycle count & giám sát đóng gói.',
    defaultPath: '/inventory',
  },
  {
    key: 'dn3pl-pack',
    portal: 'pack',
    allowedPortals: ['pack', 'tenant'],
    tenantId: DEMO_TENANT_IDS.DN3PL,
    tenantSlug: 'demo-3pl-dn',
    tenantName: 'SmartLogi 3PL Đồng Nai (Container & Kho)',
    tenantStatus: 'ACTIVE',
    role: 'WAREHOUSE_STAFF',
    email: 'pack.staff@3pl-dn.demo',
    fullName: 'Phạm Văn Tùng (Pack Station Staff)',
    title: 'Nhân viên Bàn Đóng Gói (Pack Station)',
    description: 'Quét mã vạch, Camera CV giả lập, cân trọng lượng, sửa lỗi lệch SKU & niêm phong.',
    defaultPath: '/pack',
  },
  {
    key: 'dn3pl-driver',
    portal: 'tenant',
    allowedPortals: ['tenant'],
    tenantId: DEMO_TENANT_IDS.DN3PL,
    tenantSlug: 'demo-3pl-dn',
    tenantName: 'SmartLogi 3PL Đồng Nai (Container & Kho)',
    tenantStatus: 'ACTIVE',
    role: 'DRIVER',
    email: 'driver.01@3pl-dn.demo',
    fullName: 'Nguyễn Văn An (Container/Last-mile Driver)',
    title: 'Tài xế Đầu kéo & Chuyến giao hàng',
    description: 'App tài xế mô phỏng GPS Đồng Nai, ePOD chữ ký, thu COD & đồng bộ hàng đợi Offline.',
    defaultPath: '/driver-sim',
  },
  {
    key: 'dn3pl-client',
    portal: 'customer',
    allowedPortals: ['customer'],
    tenantId: DEMO_TENANT_IDS.DN3PL,
    tenantSlug: 'demo-3pl-dn',
    tenantName: 'SmartLogi 3PL Đồng Nai (Container & Kho)',
    tenantStatus: 'ACTIVE',
    role: 'CUSTOMER_CLIENT',
    email: 'buyer.amata@3pl-dn.demo',
    fullName: 'Võ Minh Anh (Amata Precision B2B Buyer)',
    title: 'Chủ hàng B2B — Amata Precision',
    description: 'Tạo đơn hàng, gửi RFQ container, duyệt báo giá, up chứng từ XNK & chia sẻ Tracking.',
    defaultPath: '/client/dashboard',
  },
  {
    key: 'dn3pl-analyst',
    portal: 'tenant',
    allowedPortals: ['tenant'],
    tenantId: DEMO_TENANT_IDS.DN3PL,
    tenantSlug: 'demo-3pl-dn',
    tenantName: 'SmartLogi 3PL Đồng Nai (Container & Kho)',
    tenantStatus: 'ACTIVE',
    role: 'TENANT_USER',
    email: 'analyst@3pl-dn.demo',
    fullName: 'Đỗ Thu Hà (Read-Only Analyst)',
    title: 'Phân tích Dữ liệu (Read-Only RBAC Test)',
    description: 'Tài khoản chỉ đọc để kiểm chứng từ chối quyền ghi/cài đặt (RBAC negative test).',
    defaultPath: '/dashboard',
  },
  {
    key: 'fdi-admin',
    portal: 'tenant',
    allowedPortals: ['tenant', 'pack'],
    tenantId: DEMO_TENANT_IDS.FDIBH,
    tenantSlug: 'demo-fdi-bh',
    tenantName: 'FDI Biên Hòa Electronics Logistics',
    tenantStatus: 'ACTIVE',
    role: 'TENANT_ADMIN',
    email: 'admin@fdi-bh.demo',
    fullName: 'Kenji Takahashi (FDI Bien Hoa Director)',
    title: 'Giám đốc Logistics FDI Biên Hòa (Tenant #2)',
    description: 'Kiểm chứng cô lập dữ liệu đa tenant (RLS) & luồng XNK linh kiện điện tử.',
    defaultPath: '/dashboard',
  },
  {
    key: 'fdi-customs',
    portal: 'tenant',
    allowedPortals: ['tenant'],
    tenantId: DEMO_TENANT_IDS.FDIBH,
    tenantSlug: 'demo-fdi-bh',
    tenantName: 'FDI Biên Hòa Electronics Logistics',
    tenantStatus: 'ACTIVE',
    role: 'LOGISTICS_MANAGER',
    email: 'customs.lead@fdi-bh.demo',
    fullName: 'Bùi Lan Phương (XNK & Freight Lead)',
    title: 'Trưởng nhóm XNK & Hải quan FDI Biên Hòa',
    description: 'Xác nhận mã HS, đối chiếu CI/PL/BL & xử lý tờ khai phân luồng ĐỎ.',
    defaultPath: '/trade',
  },
  {
    key: 'fdi-pack',
    portal: 'pack',
    allowedPortals: ['pack'],
    tenantId: DEMO_TENANT_IDS.FDIBH,
    tenantSlug: 'demo-fdi-bh',
    tenantName: 'FDI Biên Hòa Electronics Logistics',
    tenantStatus: 'ACTIVE',
    role: 'WAREHOUSE_STAFF',
    email: 'pack.bh@fdi-bh.demo',
    fullName: 'Lý Quốc Bảo (Bonded Pack Lead)',
    title: 'Đóng gói Kho ngoại quan FDI Biên Hòa',
    description: 'Kiểm chứng hàng đợi Pack cô lập riêng theo tenant demo-fdi-bh.',
    defaultPath: '/pack',
  },
  {
    key: 'fdi-client',
    portal: 'customer',
    allowedPortals: ['customer'],
    tenantId: DEMO_TENANT_IDS.FDIBH,
    tenantSlug: 'demo-fdi-bh',
    tenantName: 'FDI Biên Hòa Electronics Logistics',
    tenantStatus: 'ACTIVE',
    role: 'CUSTOMER_CLIENT',
    email: 'shipping@fdi-electronics.demo',
    fullName: 'Trần Thảo Vy (FDI Vendor Exporter)',
    title: 'Nhà xuất khẩu FDI Electronics (Tenant #2)',
    description: 'Cổng khách hàng B2B Tenant #2 (tuyệt đối không thấy đơn của Amata Precision).',
    defaultPath: '/client/dashboard',
  },
  {
    key: 'lmlk-admin',
    portal: 'tenant',
    allowedPortals: ['tenant'],
    tenantId: DEMO_TENANT_IDS.LMLK,
    tenantSlug: 'demo-lm-lk',
    tenantName: 'Last-Mile Long Khánh & Xuân Lộc',
    tenantStatus: 'ACTIVE',
    role: 'TENANT_ADMIN',
    email: 'admin@lm-lk.demo',
    fullName: 'Nguyễn Thành Đạt (Long Khanh Last-Mile Admin)',
    title: 'Quản lý Last-Mile Long Khánh (Tenant #3)',
    description: 'Vận hành tuyến nông sản Long Khánh — Xuân Lộc (Growth Plan).',
    defaultPath: '/dashboard',
  },
  {
    key: 'lmlk-client',
    portal: 'customer',
    allowedPortals: ['customer'],
    tenantId: DEMO_TENANT_IDS.LMLK,
    tenantSlug: 'demo-lm-lk',
    tenantName: 'Last-Mile Long Khánh & Xuân Lộc',
    tenantStatus: 'ACTIVE',
    role: 'CUSTOMER_CLIENT',
    email: 'merchant@longkhanh-agro.demo',
    fullName: 'Huỳnh Tấn Phát (Nông sản Long Khánh)',
    title: 'HTX Nông sản Long Khánh (Tenant #3)',
    description: 'Khách hàng B2B gửi hàng nông sản & theo dõi COD tại demo-lm-lk.',
    defaultPath: '/client/dashboard',
  },
  {
    key: 'suspended-admin',
    portal: 'tenant',
    allowedPortals: ['tenant'],
    tenantId: DEMO_TENANT_IDS.SUSPENDED,
    tenantSlug: 'demo-suspended',
    tenantName: 'Doanh nghiệp Tạm Khóa (Suspended Tenant)',
    tenantStatus: 'SUSPENDED',
    role: 'TENANT_ADMIN',
    email: 'admin@suspended.demo',
    fullName: 'Tài khoản Doanh nghiệp Tạm khóa',
    title: 'Tenant Tạm khóa (Negative 403 Test)',
    description: 'Kiểm chứng chặn truy cập 403 TENANT_SUSPENDED khi doanh nghiệp bị tạm khóa.',
    isNegativeTest: true,
    defaultPath: '/dashboard',
  },
];

const ROLE_DEFAULT_PERMS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  TENANT_ADMIN: ['*'],
  LOGISTICS_MANAGER: ['orders.read', 'orders.write', 'freight.manage', 'yard.manage', 'trade.manage', 'finance.read', 'gps.manage'],
  WAREHOUSE_MANAGER: ['wms.manage', 'orders.read', 'pack.manage'],
  WAREHOUSE_STAFF: ['wms.read', 'pack.operate', 'orders.read'],
  DRIVER: ['driver.trips', 'gps.push', 'pod.upload'],
  CUSTOMER_CLIENT: ['client.portal'],
  TENANT_USER: ['orders.read', 'reports.read'],
};

function b64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64UrlDecode(input: string): Buffer {
  const pad = 4 - (input.length % 4 || 4);
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(normalized, 'base64');
}

export function signSessionToken(payload: Omit<DemoSession, 'iat' | 'exp'>, ttlSeconds = 8 * 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const full: DemoSession = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = b64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64UrlEncode(JSON.stringify(full));
  const sig = b64UrlEncode(
    crypto.createHmac('sha256', getSigningSecret()).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
}

export function verifySessionToken(token: string): DemoSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = b64UrlEncode(
      crypto.createHmac('sha256', getSigningSecret()).update(`${header}.${body}`).digest(),
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(b64UrlDecode(body).toString('utf8')) as DemoSession;
    if (!decoded || typeof decoded.exp !== 'number' || decoded.exp * 1000 < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function portalCookieName(portal: PortalId): string {
  return `smartlogi_demo_session_${portal}`;
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      map[k] = decodeURIComponent(v);
    } catch {
      map[k] = v;
    }
  }
  return map;
}

export function buildSetCookieHeader(
  name: string,
  value: string,
  maxAgeSeconds: number,
  isHttps: boolean,
): string {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps) {
    attrs.push('Secure');
  }
  return attrs.join('; ');
}

export function getTokenFromHeaders(headers: Headers, portal: PortalId): string | null {
  const auth = headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const raw = auth.slice(7).trim();
    if (raw && raw !== 'null' && raw !== 'undefined') return raw;
  }
  const cookies = parseCookies(headers.get('cookie'));
  return cookies[portalCookieName(portal)] || cookies.smartlogi_demo_session || null;
}

export async function authenticateWithPassword(params: {
  email: string;
  password: string;
  tenantSlug?: string;
  portal: PortalId;
  sandboxKey: string;
}): Promise<{ ok: true; token: string; session: DemoSession; tenant: any } | { ok: false; status: number; code: string; message: string }> {
  const email = params.email.trim().toLowerCase();
  const password = params.password;
  if (!email || !password) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Email và mật khẩu là bắt buộc.' };
  }

  return withPlatform(async (tx) => {
    if (params.portal === 'admin' && !params.tenantSlug) {
      const admin = await tx.systemAdmin.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (admin) {
        const match = await bcrypt.compare(password, admin.passwordHash);
        if (!match) {
          return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Thông tin đăng nhập không hợp lệ.' };
        }
        if (admin.status !== 'ACTIVE') {
          return { ok: false, status: 403, code: 'ACCOUNT_DISABLED', message: 'Tài khoản quản trị đã bị khóa.' };
        }
        const sessionPayload: Omit<DemoSession, 'iat' | 'exp'> = {
          sub: admin.id,
          email: admin.email,
          fullName: admin.fullName,
          role: 'SUPER_ADMIN',
          roles: ['SUPER_ADMIN'],
          permissions: ['*'],
          tenantId: null,
          tenantSlug: 'platform',
          tenantName: 'SmartLogi Platform Governance',
          clientId: null,
          driverId: null,
          portal: params.portal,
          sandboxKey: params.sandboxKey,
          readOnlyGuest: false,
          isDemo: true,
        };
        const token = signSessionToken(sessionPayload);
        return {
          ok: true,
          token,
          session: { ...sessionPayload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 8 * 3600 },
          tenant: { id: null, slug: 'platform', name: 'SmartLogi Platform Governance', status: 'ACTIVE' },
        };
      }
    }

    const tenantSlug = params.tenantSlug?.trim().toLowerCase();
    const targetTenant = tenantSlug
      ? await tx.tenant.findUnique({ where: { slug: tenantSlug }, include: { plan: true } })
      : null;

    if (tenantSlug && !targetTenant) {
      return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Email hoặc tenant slug không đúng.' };
    }

    const user = await tx.tenantUser.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        ...(targetTenant ? { tenantId: targetTenant.id } : {}),
      },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!user) {
      return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Email hoặc tenant slug không đúng.' };
    }

    const tenant =
      targetTenant ||
      (await tx.tenant.findUnique({ where: { id: user.tenantId }, include: { plan: true } }));

    if (!tenant) {
      return { ok: false, status: 404, code: 'TENANT_NOT_FOUND', message: 'Không tìm thấy doanh nghiệp.' };
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Mật khẩu không chính xác.' };
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'INACTIVE') {
      return {
        ok: false,
        status: 403,
        code: 'TENANT_SUSPENDED',
        message: `Doanh nghiệp "${tenant.name}" (${tenant.slug}) đang ở trạng thái ${tenant.status} — không thể đăng nhập.`,
      };
    }

    if (user.status !== 'ACTIVE') {
      return { ok: false, status: 403, code: 'USER_INACTIVE', message: 'Tài khoản người dùng chưa được kích hoạt.' };
    }

    const roleName = (user.roles[0]?.role?.name || 'TENANT_USER') as DemoRole;
    if (params.portal === 'customer' && roleName !== 'CUSTOMER_CLIENT') {
      return {
        ok: false,
        status: 403,
        code: 'PORTAL_ROLE_MISMATCH',
        message: 'Cổng Khách hàng B2B chỉ dành cho tài khoản CUSTOMER_CLIENT.',
      };
    }

    const clientUser = await tx.clientUser.findFirst({
      where: { tenantId: user.tenantId, email: { equals: user.email, mode: 'insensitive' } },
      select: { clientId: true },
    });
    const driver = await tx.driver.findFirst({
      where: { tenantId: user.tenantId, userId: user.id },
      select: { id: true },
    });

    const roleNames = user.roles.map((r: { role: { name: string } }) => r.role.name);
    const sessionPayload: Omit<DemoSession, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: roleName,
      roles: roleNames,
      permissions: ROLE_DEFAULT_PERMS[roleName] || [],
      tenantId: user.tenantId,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      clientId: clientUser?.clientId || null,
      driverId: driver?.id || null,
      portal: params.portal,
      sandboxKey: params.sandboxKey,
      readOnlyGuest: false,
      isDemo: true,
    };

    const token = signSessionToken(sessionPayload);
    return {
      ok: true,
      token,
      session: { ...sessionPayload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 8 * 3600 },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        plan: tenant.plan?.name || 'Enterprise',
      },
    };
  });
}

export async function authenticateWithPersona(params: {
  personaKey: string;
  portal: PortalId;
  sandboxKey: string;
  readOnlyGuest?: boolean;
}): Promise<{ ok: true; token: string; session: DemoSession; tenant: any; persona: DemoPersona } | { ok: false; status: number; code: string; message: string }> {
  if (!isDemoModeEnabled()) {
    return { ok: false, status: 403, code: 'DEMO_MODE_DISABLED', message: 'Demo quick-login đang tắt trong môi trường này.' };
  }

  const persona = DEMO_PERSONAS.find((p) => p.key === params.personaKey || p.email === params.personaKey);
  if (!persona) {
    return { ok: false, status: 404, code: 'PERSONA_NOT_FOUND', message: `Không tìm thấy persona demo "${params.personaKey}".` };
  }

  return withPlatform(async (tx) => {
    if (persona.role === 'SUPER_ADMIN') {
      const admin = await tx.systemAdmin.findFirst({
        where: { email: { equals: persona.email, mode: 'insensitive' } },
      });
      if (!admin) {
        return { ok: false, status: 503, code: 'DEMO_SEED_MISSING', message: 'Chưa khởi tạo Super Admin demo trong cơ sở dữ liệu.' };
      }
      const sessionPayload: Omit<DemoSession, 'iat' | 'exp'> = {
        sub: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        permissions: params.readOnlyGuest ? ['orders.read', 'reports.read'] : ['*'],
        tenantId: null,
        tenantSlug: 'platform',
        tenantName: 'SmartLogi Platform Governance',
        clientId: null,
        driverId: null,
        portal: params.portal,
        sandboxKey: params.sandboxKey,
        readOnlyGuest: Boolean(params.readOnlyGuest),
        isDemo: true,
      };
      const token = signSessionToken(sessionPayload);
      return {
        ok: true,
        token,
        session: { ...sessionPayload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 8 * 3600 },
        tenant: { id: null, slug: 'platform', name: 'SmartLogi Platform Governance', status: 'ACTIVE' },
        persona,
      };
    }

    const user = await tx.tenantUser.findFirst({
      where: {
        email: { equals: persona.email, mode: 'insensitive' },
        ...(persona.tenantId ? { tenantId: persona.tenantId } : {}),
      },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!user) {
      return {
        ok: false,
        status: 503,
        code: 'DEMO_SEED_MISSING',
        message: `Chưa khởi tạo dữ liệu người dùng "${persona.email}" trên Neon DB.`,
      };
    }

    const tenant = await tx.tenant.findUnique({
      where: { id: user.tenantId },
      include: { plan: true },
    });

    if (!tenant) {
      return {
        ok: false,
        status: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Không tìm thấy doanh nghiệp cho "${persona.email}".`,
      };
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'INACTIVE') {
      return {
        ok: false,
        status: 403,
        code: 'TENANT_SUSPENDED',
        message: `Doanh nghiệp "${tenant.name}" (${tenant.slug}) đang ở trạng thái SUSPENDED — từ chối truy cập (403).`,
      };
    }

    const clientUser = await tx.clientUser.findFirst({
      where: { tenantId: user.tenantId, email: { equals: user.email, mode: 'insensitive' } },
      select: { clientId: true },
    });
    const driver = await tx.driver.findFirst({
      where: { tenantId: user.tenantId, userId: user.id },
      select: { id: true },
    });

    const roleName = (user.roles[0]?.role?.name || persona.role) as DemoRole;
    const roleNames = user.roles.map((r: { role: { name: string } }) => r.role.name);
    const sessionPayload: Omit<DemoSession, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: roleName,
      roles: roleNames,
      permissions: params.readOnlyGuest ? ['orders.read', 'reports.read'] : (ROLE_DEFAULT_PERMS[roleName] || []),
      tenantId: user.tenantId,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      clientId: clientUser?.clientId || null,
      driverId: driver?.id || null,
      portal: params.portal,
      sandboxKey: params.sandboxKey,
      readOnlyGuest: Boolean(params.readOnlyGuest),
      isDemo: true,
    };

    const token = signSessionToken(sessionPayload);
    return {
      ok: true,
      token,
      session: { ...sessionPayload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 8 * 3600 },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        plan: tenant.plan?.name || 'Enterprise',
      },
      persona,
    };
  });
}

export async function assertSessionTenantActive(session: DemoSession): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  if (!session.tenantId) return { ok: true };
  return withPlatform(async (tx) => {
    const t = await tx.tenant.findUnique({
      where: { id: session.tenantId! },
      select: { status: true, name: true, slug: true },
    });
    if (!t) {
      return { ok: false, status: 403, code: 'TENANT_NOT_FOUND', message: 'Doanh nghiệp không còn tồn tại.' };
    }
    if (t.status === 'SUSPENDED' || t.status === 'INACTIVE') {
      return {
        ok: false,
        status: 403,
        code: 'TENANT_SUSPENDED',
        message: `Doanh nghiệp "${t.name}" (${t.slug}) đang bị ${t.status}. Mọi thao tác bị từ chối.`,
      };
    }
    return { ok: true };
  });
}
