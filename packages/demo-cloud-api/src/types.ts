export type PortalId = 'admin' | 'tenant' | 'customer' | 'pack';

export type DemoRole =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'LOGISTICS_MANAGER'
  | 'WAREHOUSE_MANAGER'
  | 'WAREHOUSE_STAFF'
  | 'DRIVER'
  | 'CUSTOMER_CLIENT'
  | 'TENANT_USER';

export type NetworkSimMode =
  | 'NORMAL'
  | 'SLOW_800MS'
  | 'RATE_LIMIT_429'
  | 'SERVER_500';

export interface DemoPersona {
  key: string;
  portal: PortalId;
  allowedPortals: PortalId[];
  tenantId: string | null;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: 'ACTIVE' | 'SUSPENDED';
  role: DemoRole;
  email: string;
  fullName: string;
  title: string;
  description: string;
  isNegativeTest?: boolean;
  defaultPath: string;
}

export interface DemoSession {
  sub: string;
  email: string;
  fullName: string;
  role: DemoRole;
  roles: string[];
  permissions: string[];
  tenantId: string | null;
  tenantSlug: string;
  tenantName: string;
  clientId?: string | null;
  driverId?: string | null;
  portal: PortalId;
  sandboxKey: string;
  readOnlyGuest: boolean;
  isDemo: boolean;
  iat: number;
  exp: number;
}

export interface ScenarioDefinition {
  code: string;
  title: string;
  category:
    | 'OPERATIONS'
    | 'DELIVERY_FINANCE'
    | 'CONTAINER_YARD_TRADE'
    | 'WMS_PACK'
    | 'GEO_SECURITY';
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'NEGATIVE_TEST';
  targetPortal: PortalId;
  targetPath: string;
  expectedOutcome: string;
  simulatedSystems: string[];
  summary: string;
}

export interface ApiResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  setCookies?: string[];
}

export interface ApiContext {
  method: string;
  path: string; // normalized path after /api/v1, always starts with '/'
  query: URLSearchParams;
  body: any;
  headers: Headers;
  portal: PortalId;
  sandboxKey: string;
  session: DemoSession | null;
  ip: string;
  isHttps: boolean;
}
