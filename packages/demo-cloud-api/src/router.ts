import {
  assertSessionTenantActive,
  getTokenFromHeaders,
  verifySessionToken,
} from './auth';
import { getOrCreateSandbox } from './scenarios';
import { handleAdminAndIamRoutes } from './handlers/admin-iam';
import { handleClientAndPublicRoutes } from './handlers/client-public';
import { handleDemoRoutes } from './handlers/demo';
import { handleLogisticsFreightTradeGeoRoutes } from './handlers/logistics-freight-trade-geo';
import { handleOrdersWmsPackRoutes } from './handlers/orders-wms-pack';
import type { ApiContext, ApiResult, PortalId } from './types';

function resolvePortal(req: Request, portalHint?: PortalId): PortalId {
  const header = (req.headers.get('x-smartlogi-portal') || '').toLowerCase();
  if (header === 'admin' || header === 'tenant' || header === 'customer' || header === 'pack') {
    return header;
  }
  if (portalHint) return portalHint;
  const host = (req.headers.get('host') || '').toLowerCase();
  if (host.includes('admin')) return 'admin';
  if (host.includes('customer')) return 'customer';
  if (host.includes('pack')) return 'pack';
  return 'tenant';
}

function normalizeApiPath(pathname: string): string {
  let clean = pathname;
  if (clean.startsWith('/api/v1')) {
    clean = clean.slice('/api/v1'.length);
  }
  if (!clean.startsWith('/')) clean = '/' + clean;
  if (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1);
  return clean || '/';
}

async function parseRequestBody(req: Request): Promise<any> {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE' || req.method === 'OPTIONS') {
    return {};
  }
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  try {
    if (ct.includes('application/json')) {
      const txt = await req.text();
      return txt ? JSON.parse(txt) : {};
    }
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      const obj: Record<string, any> = {};
      fd.forEach((v, k) => {
        if (typeof v === 'string') {
          obj[k] = v;
        } else {
          obj.fileName = v.name;
          obj.fileSize = v.size;
        }
      });
      return obj;
    }
    const raw = await req.text();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  } catch {
    return {};
  }
}

export async function dispatchDemoApi(
  req: Request,
  portalHint?: PortalId,
): Promise<ApiResult> {
  if (req.method === 'OPTIONS') {
    return {
      status: 204,
      body: null,
      headers: {
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization,x-smartlogi-portal,x-smartlogi-sandbox',
      },
    };
  }

  const url = new URL(req.url);
  const path = normalizeApiPath(url.pathname);
  const portal = resolvePortal(req, portalHint);
  const token = getTokenFromHeaders(req.headers, portal);
  const session = token ? verifySessionToken(token) : null;
  const sandboxKey =
    (req.headers.get('x-smartlogi-sandbox') || url.searchParams.get('sandbox') || session?.sandboxKey || 'shared-demo').trim() ||
    'shared-demo';

  const body = await parseRequestBody(req);
  const proto = (req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).toLowerCase();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

  const ctx: ApiContext = {
    method: req.method.toUpperCase(),
    path,
    query: url.searchParams,
    body,
    headers: req.headers,
    portal,
    sandboxKey,
    session,
    ip,
    isHttps: proto === 'https',
  };

  try {
    // 1. Demo Control Plane & Health ALWAYS run first & bypass fault injection
    const demoRes = await handleDemoRoutes(ctx);
    if (demoRes) return demoRes;

    // 2. Active-tenant guard on existing sessions
    if (ctx.session && !path.includes('/auth/')) {
      const tenantCheck = await assertSessionTenantActive(ctx.session);
      if (!tenantCheck.ok) {
        return { status: tenantCheck.status, body: { code: tenantCheck.code, message: tenantCheck.message } };
      }
    }

    // 3. Simulated Network Chaos Injection (from DemoSandbox) — excluded for /public/* read checks if wished, applies to domain APIs
    if (!path.startsWith('/public/') && !path.includes('/auth/')) {
      const sbx = await getOrCreateSandbox(sandboxKey).catch(() => null);
      if (sbx?.networkSimMode === 'SLOW_800MS') {
        await new Promise((r) => setTimeout(r, 800));
      } else if (sbx?.networkSimMode === 'RATE_LIMIT_429') {
        return {
          status: 429,
          body: {
            code: 'SIMULATED_RATE_LIMIT',
            message: 'Mô phỏng giới hạn tốc độ (HTTP 429). Tắt trong Demo Control Center -> Network Mode = NORMAL.',
          },
        };
      } else if (sbx?.networkSimMode === 'SERVER_500') {
        return {
          status: 500,
          body: {
            code: 'SIMULATED_SERVER_FAULT',
            message: 'Mô phỏng sự cố máy chủ (HTTP 500). Tắt trong Demo Control Center -> Network Mode = NORMAL.',
          },
        };
      }
    }

    // 4. Domain Routers
    const h1 = await handleAdminAndIamRoutes(ctx);
    if (h1) return h1;

    const h2 = await handleOrdersWmsPackRoutes(ctx);
    if (h2) return h2;

    const h3 = await handleLogisticsFreightTradeGeoRoutes(ctx);
    if (h3) return h3;

    const h4 = await handleClientAndPublicRoutes(ctx);
    if (h4) return h4;

    return {
      status: 404,
      body: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint không tồn tại trên Demo Cloud API: ${ctx.method} ${path}`,
      },
    };
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : 'Unexpected server error';
    // Never leak database credentials or stack traces
    const safeMsg = msg.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DB_URL]');
    return {
      status: 500,
      body: {
        code: 'INTERNAL_DEMO_API_ERROR',
        message: safeMsg.slice(0, 260),
      },
    };
  }
}

export async function handleNextApiRequest(
  req: Request,
  portalHint?: PortalId,
): Promise<Response> {
  const result = await dispatchDemoApi(req, portalHint);
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    ...(result.headers || {}),
  });
  if (result.setCookies) {
    for (const c of result.setCookies) {
      headers.append('set-cookie', c);
    }
  }
  if (result.status === 204 || result.body === null) {
    return new Response(null, { status: result.status, headers });
  }
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
}
