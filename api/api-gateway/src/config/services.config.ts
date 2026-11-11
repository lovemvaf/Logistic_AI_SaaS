export interface ServiceConfig {
  name: string;
  url: string;
  prefix: string;
  healthPath: string;
}

/**
 * 3B - modular monolith: toàn bộ API NestJS đã gộp vào `core-api`.
 *
 * Gateway chỉ còn làm BFF: xác thực ở edge, gom/chuẩn hoá response, rồi
 * chuyển tiếp xuống core-api (hoặc service Go / AI worker độc lập).
 */
export const CORE_API_URL = process.env.CORE_API_URL || 'http://core-api:8081';

export const SERVICES: ServiceConfig[] = [
  {
    name: 'core-api',
    url: CORE_API_URL,
    prefix: '/api/v1',
    healthPath: '/health',
  },
  {
    name: 'ai-worker',
    url: process.env.AI_WORKER_URL || 'http://localhost:8787',
    prefix: '/api/v1',
    healthPath: '/health',
  },
  {
    name: 'gps-ingestion',
    url: process.env.GPS_INGESTION_URL || 'http://gps-ingestion-service:8090',
    prefix: '/api/v1',
    healthPath: '/health',
  },
  {
    name: 'webhook-service',
    url: process.env.WEBHOOK_SERVICE_URL || 'http://webhook-service:8092',
    prefix: '/api/v1',
    healthPath: '/health',
  },
];

export const RATE_LIMIT = {
  global: parseInt(process.env.GATEWAY_RATE_LIMIT || '1000', 10),
  windowMs: 60 * 1000,
};

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required. Set JWT_SECRET in your environment or .env file.');
  }
  return secret;
}

export const JWT_SECRET = process.env.JWT_SECRET || '';

export const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

export interface RouteRule {
  /** Full path prefix, matched on a segment boundary (not a raw startsWith). */
  prefix: string;
  service: string;
  /** Optional rewrite applied to the path before forwarding. */
  mapPath?: (path: string) => string;
  /** Upstream timeout in milliseconds. */
  timeoutMs?: number;
}

/** Go services and the AI worker do not use the Nest `/api/v1` global prefix. */
const stripApiPrefix = (path: string): string => path.replace(/^\/api\/v1/, '') || '/';

/**
 * Routing table.
 *
 * Rules are matched longest-prefix-first on a segment boundary, so
 * `/api/v1/gps/batch` can never be swallowed by `/api/v1/gps`.
 */
export const ROUTE_RULES: RouteRule[] = [
  // --- Edge / infrastructure services (no Nest global prefix) ---
  // Driver GPS batches are handled by core-api (`POST /gps/batch`);
  // the Go ingestion service is exposed at a distinct path for devices.
  { prefix: '/api/v1/gps/ingest', service: 'gps-ingestion', mapPath: (path) => path.replace(/^\/api\/v1\/gps\/ingest/, '/gps/batch'), timeoutMs: 60000 },
  { prefix: '/api/v1/inbound/webhooks', service: 'webhook-service', mapPath: (path) => path.replace(/^\/api\/v1\/inbound/, ''), timeoutMs: 15000 },
  { prefix: '/api/v1/routing', service: 'ai-worker', mapPath: stripApiPrefix, timeoutMs: 120000 },

  // --- AI worker (mounted at /api/v1/ai) vs logistics-owned AI metadata ---
  { prefix: '/api/v1/ai/v1', service: 'ai-worker', timeoutMs: 60000 },
  { prefix: '/api/v1/ai/models', service: 'core-api' },
  { prefix: '/api/v1/ai', service: 'ai-worker', timeoutMs: 60000 },

  // --- Auth endpoints (most specific first) ---
  { prefix: '/api/v1/webhooks/stripe', service: 'core-api' },
  { prefix: '/api/v1/mobile/auth', service: 'core-api' },
  { prefix: '/api/v1/client/auth', service: 'core-api' },
  { prefix: '/api/v1/tenant/auth', service: 'core-api' },
  { prefix: '/api/v1/auth', service: 'core-api' },

  // --- Mobile: each sub-resource lives in a different service ---
  { prefix: '/api/v1/mobile/trips', service: 'core-api' },
  { prefix: '/api/v1/mobile/uploads', service: 'core-api', timeoutMs: 120000 },
  { prefix: '/api/v1/mobile/wallet', service: 'core-api' },
  // Batch GPS của app tài xế nằm ở module Logistics (core-api); rule
  // `/api/v1/mobile` sẽ nuốt mất nếu không khai báo riêng.
  { prefix: '/api/v1/mobile/gps-batch', service: 'core-api' },
  { prefix: '/api/v1/mobile', service: 'core-api' },

  // --- IAM & Portal aliases ---
  { prefix: '/api/v1/admin', service: 'core-api' },
  { prefix: '/api/v1/tenant', service: 'core-api' },
  { prefix: '/api/v1/users', service: 'core-api' },
  { prefix: '/api/v1/roles', service: 'core-api' },
  { prefix: '/api/v1/settings', service: 'core-api' },
  { prefix: '/api/v1/branches', service: 'core-api' },
  { prefix: '/api/v1/dashboard', service: 'core-api' },
  { prefix: '/api/v1/reports', service: 'core-api' },
  { prefix: '/api/v1/api-keys', service: 'core-api' },
  { prefix: '/api/v1/metrics', service: 'core-api' },

  // --- Order service ---
  { prefix: '/api/v1/orders', service: 'core-api', timeoutMs: 120000 },
  { prefix: '/api/v1/order-partials', service: 'core-api' },
  { prefix: '/api/v1/clients', service: 'core-api' },
  { prefix: '/api/v1/customers', service: 'core-api' },
  { prefix: '/api/v1/tracking', service: 'core-api' },
  { prefix: '/api/v1/webhooks', service: 'core-api' },

  // --- Inventory / WMS ---
  { prefix: '/api/v1/inventory', service: 'core-api' },
  { prefix: '/api/v1/products', service: 'core-api', timeoutMs: 120000 },
  { prefix: '/api/v1/warehouses', service: 'core-api' },
  { prefix: '/api/v1/bins', service: 'core-api' },
  { prefix: '/api/v1/locations', service: 'core-api' },
  { prefix: '/api/v1/tasks', service: 'core-api' },
  { prefix: '/api/v1/waves', service: 'core-api' },
  // Legacy alias used by the tenant portal sidebar (`/wms/*`).
  {
    prefix: '/api/v1/wms',
    service: 'core-api',
    mapPath: (path) => path.replace(/^\/api\/v1\/wms/, '/api/v1'),
  },

  // --- Logistics ---
  { prefix: '/api/v1/logistics', service: 'core-api' },
  { prefix: '/api/v1/finance', service: 'core-api' },
  { prefix: '/api/v1/trips', service: 'core-api' },
  { prefix: '/api/v1/drivers', service: 'core-api' },
  { prefix: '/api/v1/vehicles', service: 'core-api' },
  { prefix: '/api/v1/geofences', service: 'core-api' },
  { prefix: '/api/v1/gps', service: 'core-api' },
  { prefix: '/api/v1/driver-app', service: 'core-api' },

  // --- Customer / public ---
  { prefix: '/api/v1/public', service: 'core-api' },
  { prefix: '/api/v1/track', service: 'core-api' },
  { prefix: '/api/v1/client', service: 'core-api' },

  // --- Notifications ---
  { prefix: '/api/v1/notifications', service: 'core-api' },

  // --- Health ---
  { prefix: '/api/v1/health', service: 'core-api' },
];

const SORTED_ROUTE_RULES = [...ROUTE_RULES].sort((a, b) => b.prefix.length - a.prefix.length);

/** Longest-prefix match on a path-segment boundary. */
export function matchRoute(path: string): RouteRule | null {
  for (const rule of SORTED_ROUTE_RULES) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule;
    }
  }
  return null;
}

/**
 * Paths that skip authentication (matched on a segment boundary).
 * Everything else must present a valid Bearer token at the edge.
 */
export const PUBLIC_PATHS = [
  '/health',
  '/api/health',
  '/routes',
  '/api/docs',
  '/api/gateway/health',
  // Public tracking + partner callbacks.
  '/api/v1/public',
  // Thiết bị GPS dùng GPS_AUTH_TOKEN (xác thực tại chính gps-ingestion-service)
  // nên không được chặn bằng JWT ở edge.
  '/api/v1/gps/ingest',
  '/api/v1/track',
  '/api/v1/health',
  '/api/v1/webhooks/stripe',
  '/api/v1/inbound/webhooks',
  // Login / password recovery must be reachable before a token exists.
  '/api/v1/tenant/auth',
  '/api/v1/admin/auth',
  '/api/v1/client/auth',
  '/api/v1/mobile/auth',
];

/**
 * Paths handled by the gateway itself that must NOT be forwarded
 * to downstream services (exact-match check in ProxyMiddleware).
 */
export const PROXY_SKIP_PATHS = [
  '/health',
  '/api/health',
  '/routes',
  '/api/gateway/health',
  '/api/gateway/metrics',
  '/api/docs',
];
