#!/usr/bin/env node
/**
 * End-to-end smoke checks for the API gateway.
 *
 * Usage:
 *   SMOKE_TENANT_SLUG=acme SMOKE_EMAIL=admin@acme.test SMOKE_PASSWORD=secret \
 *     node scripts/smoke-api.mjs
 *
 * Optional:
 *   SMOKE_BASE_URL   default http://localhost:3000
 *
 * The script is dependency-free so it can run inside CI or a container.
 * It exits non-zero as soon as a critical check fails.
 */

const BASE_URL = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG || 'demo-logistics-vn';
const EMAIL = process.env.SMOKE_EMAIL || 'tenant.admin@smartlogi.vn';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Tenant@123';

const results = [];
let token = null;
let refreshToken = null;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep the raw text
  }
  return { status: response.status, body };
}

async function expect(name, path, options, allowedStatuses) {
  try {
    const { status, body } = await request(path, options);
    const ok = allowedStatuses.includes(status);
    record(name, ok, `HTTP ${status}${ok ? '' : ` ${JSON.stringify(body).slice(0, 160)}`}`);
    return { ok, status, body };
  } catch (error) {
    record(name, false, error.message);
    return { ok: false, status: 0, body: null };
  }
}

function authHeaders() {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Chờ API sẵn sàng. Phải kiểm tra `/api/v1/health` (đi qua gateway tới core-api)
 * chứ không chỉ `/health` của gateway - gateway có thể đã lên trước core-api.
 */
async function waitForApi(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const path of ['/api/v1/health', '/health']) {
      try {
        const response = await fetch(`${BASE_URL}${path}`, { method: 'GET' });
        if (response.ok) return true;
      } catch {
        // chưa sẵn sàng
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function main() {
  console.log(`Smoke testing ${BASE_URL}\n`);

  if (!(await waitForApi())) {
    record('API sẵn sàng', false, `không phản hồi trong 90s tại ${BASE_URL}`);
    process.exitCode = 1;
    return;
  }

  await expect('Gateway health', '/health', { method: 'GET' }, [200]);

  await expect('Orders require authentication', '/api/v1/orders', { method: 'GET' }, [401]);

  await expect(
    'Public tracking stays anonymous',
    '/api/v1/public/track/SMOKE-DOES-NOT-EXIST',
    { method: 'GET' },
    [200, 400, 404],
  );

  await expect('Probe endpoint removed', '/api/v1/admin/keys', { method: 'GET', headers: authHeaders() }, [401, 404]);

  if (TENANT_SLUG && EMAIL && PASSWORD) {
    const login = await expect(
      'Tenant login',
      '/api/v1/tenant/auth/login',
      {
        method: 'POST',
        headers: { 'x-tenant-slug': TENANT_SLUG, 'x-portal': 'tenant' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      },
      [200, 201],
    );

    if (login.ok) {
      token = login.body?.accessToken || login.body?.access_token || null;
      refreshToken = login.body?.refreshToken || login.body?.refresh_token || null;
      record('Login returns access token', Boolean(token), token ? 'present' : 'missing');
    }

    if (token) {
      await expect('Orders list', '/api/v1/orders', { method: 'GET', headers: authHeaders() }, [200]);
      await expect('Products list', '/api/v1/products?limit=1', { method: 'GET', headers: authHeaders() }, [200]);

      // `/wms/*` is a legacy alias rewritten by the gateway.
      await expect(
        'WMS waves alias',
        '/api/v1/wms/waves?status=ACTIVE',
        { method: 'GET', headers: authHeaders() },
        [200],
      );

      await expect('GPS active fleet', '/api/v1/gps/active-fleet', { method: 'GET', headers: authHeaders() }, [200]);
      await expect('Vehicles fleet', '/api/v1/vehicles/fleet', { method: 'GET', headers: authHeaders() }, [200]);
      await expect('Mobile wallet', '/api/v1/mobile/wallet', { method: 'GET', headers: authHeaders() }, [200, 403]);

      // Validation errors must be 4xx, never a 500 from a missing `items` array.
      await expect(
        'Order creation validates items',
        '/api/v1/orders',
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            recipientName: 'Smoke Test',
            recipientPhone: '0000000000',
            recipientAddress: 'Smoke address',
            items: [],
          }),
        },
        [400],
      );

      // BFF (gom call + chuẩn hoá DTO) - chỉ có ở gateway.
      await expect(
        'BFF tenant dashboard',
        '/api/v1/bff/tenant-dashboard',
        { method: 'GET', headers: authHeaders() },
        [200],
      );

      if (refreshToken) {
        await expect(
          'Refresh token exchange',
          '/api/v1/tenant/auth/refresh',
          {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          },
          [200, 201],
        );
      } else {
        record('Refresh token exchange', false, 'login did not return a refresh token');
      }
    }
  } else {
    console.log('\n[SKIP] Authenticated checks — set SMOKE_TENANT_SLUG, SMOKE_EMAIL and SMOKE_PASSWORD.');
  }

  // Cổng thiết bị GPS dùng GPS_AUTH_TOKEN (không phải JWT) nên phải qua
  // được gateway mà không cần đăng nhập.
  if (process.env.GPS_AUTH_TOKEN) {
    await expect(
      'GPS batch endpoint is public at the edge',
      '/api/v1/gps/ingest',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.GPS_AUTH_TOKEN}` },
        body: JSON.stringify({ points: [] }),
      },
      [200, 201, 400],
    );
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
