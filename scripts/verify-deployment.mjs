#!/usr/bin/env node
/**
 * SmartLogi AI SaaS — Cross-Portal & Backend Deployment Verification Script
 *
 * Dependency-free (Node 20+/22 built-in fetch). Validates Vercel portals,
 * same-origin /api/v1/* proxy rewrites, unauthenticated fail-closed guards,
 * API Gateway health, and Cloudflare AI Worker health/auth boundaries.
 *
 * Usage:
 *   node scripts/verify-deployment.mjs \
 *     --admin-url=https://smartlogi-admin.vercel.app \
 *     --tenant-url=https://smartlogi-tenant.vercel.app \
 *     --customer-url=https://smartlogi-customer.vercel.app \
 *     --pack-url=https://smartlogi-pack.vercel.app \
 *     --gateway-url=https://api.example.com \
 *     --ai-url=https://smartlogi-ai.workers.dev
 *
 * Optional flags:
 *   --skip-proxy   Skip /api/v1/* checks on portals (only for mock-mode demos)
 *   --timeout=15000  Request timeout in ms (default 15000)
 *
 * Environment variable equivalents:
 *   VERCEL_ADMIN_URL, VERCEL_TENANT_URL, VERCEL_CUSTOMER_URL, VERCEL_PACK_URL,
 *   GATEWAY_URL, AI_WORKER_URL, VERIFY_SKIP_PROXY=true
 */

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/verify-deployment.mjs [options]

Options:
  --admin-url=<url>      Admin Portal base URL (env: VERCEL_ADMIN_URL)
  --tenant-url=<url>     Tenant Portal base URL (env: VERCEL_TENANT_URL)
  --customer-url=<url>   Customer Portal base URL (env: VERCEL_CUSTOMER_URL)
  --pack-url=<url>       Pack Station Web base URL (env: VERCEL_PACK_URL)
  --gateway-url=<url>    API Gateway base URL (env: GATEWAY_URL)
  --ai-url=<url>         Cloudflare AI Worker base URL (env: AI_WORKER_URL)
  --skip-proxy           Skip same-origin /api/v1/* checks (for mock-only previews)
  --timeout=<ms>         Per-request timeout in ms (default: 15000)
`);
  process.exit(0);
}

function getArg(flag, envKey) {
  const prefix = `${flag}=`;
  const eqMatch = args.find((a) => a.startsWith(prefix));
  let raw = eqMatch ? eqMatch.slice(prefix.length) : '';
  if (!raw) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
      raw = args[idx + 1];
    }
  }
  if (!raw) raw = process.env[envKey] || '';
  return raw.trim().replace(/\/+$/, '');
}

const TIMEOUT_MS = Number(getArg('--timeout', 'VERIFY_TIMEOUT_MS')) || 15000;
const SKIP_PROXY = args.includes('--skip-proxy') || process.env.VERIFY_SKIP_PROXY === 'true';

const targets = {
  adminUrl: getArg('--admin-url', 'VERCEL_ADMIN_URL'),
  tenantUrl: getArg('--tenant-url', 'VERCEL_TENANT_URL'),
  customerUrl: getArg('--customer-url', 'VERCEL_CUSTOMER_URL'),
  packUrl: getArg('--pack-url', 'VERCEL_PACK_URL'),
  gatewayUrl: getArg('--gateway-url', 'GATEWAY_URL'),
  aiUrl: getArg('--ai-url', 'AI_WORKER_URL'),
};

const results = [];
function record(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: true, status: res.status, text, json, headers: res.headers };
  } catch (err) {
    return { ok: false, status: 0, text: '', json: null, error: err?.message || String(err) };
  }
}

async function checkPortal(name, baseUrl, entryPath) {
  const ssrUrl = `${baseUrl}${entryPath}`;
  const page = await safeFetch(ssrUrl, { method: 'GET' });
  if (!page.ok) {
    record(`${name}: SSR ${entryPath}`, false, page.error);
    return;
  }

  const hasAppError =
    page.text.includes('Application error: a server-side exception has occurred') ||
    page.text.includes('__next_error__');
  const ssrPass = page.status === 200 && page.text.length > 200 && !hasAppError;
  record(
    `${name}: SSR ${entryPath}`,
    ssrPass,
    `HTTP ${page.status}, ${page.text.length} bytes${hasAppError ? ', Next error marker found' : ''}`,
  );

  if (SKIP_PROXY) {
    console.log(`[SKIP] ${name}: proxy checks skipped (--skip-proxy)`);
    return;
  }

  const health = await safeFetch(`${baseUrl}/api/v1/health`, { method: 'GET' });
  const healthOk = health.ok && health.status === 200 && (health.json?.ok === true || health.json?.status === 'ok');
  record(
    `${name}: proxy /api/v1/health`,
    healthOk,
    health.ok ? `HTTP ${health.status}` : health.error,
  );

  const orders = await safeFetch(`${baseUrl}/api/v1/orders`, { method: 'GET' });
  record(
    `${name}: proxy fail-closed /api/v1/orders`,
    orders.ok && orders.status === 401,
    orders.ok ? `HTTP ${orders.status}` : orders.error,
  );

  const track = await safeFetch(`${baseUrl}/api/v1/public/track/VERIFY-DOES-NOT-EXIST`, { method: 'GET' });
  record(
    `${name}: proxy public tracking`,
    track.ok && [200, 404].includes(track.status),
    track.ok ? `HTTP ${track.status}` : track.error,
  );
}

async function checkGateway(baseUrl) {
  const gwHealth = await safeFetch(`${baseUrl}/health`, { method: 'GET' });
  record(
    'gateway: /health',
    gwHealth.ok && gwHealth.status === 200,
    gwHealth.ok ? `HTTP ${gwHealth.status}` : gwHealth.error,
  );

  const apiHealth = await safeFetch(`${baseUrl}/api/v1/health`, { method: 'GET' });
  record(
    'gateway: /api/v1/health',
    apiHealth.ok && apiHealth.status === 200,
    apiHealth.ok ? `HTTP ${apiHealth.status}` : apiHealth.error,
  );

  const unauthOrders = await safeFetch(`${baseUrl}/api/v1/orders`, { method: 'GET' });
  record(
    'gateway: unauth /api/v1/orders returns 401',
    unauthOrders.ok && unauthOrders.status === 401,
    unauthOrders.ok ? `HTTP ${unauthOrders.status}` : unauthOrders.error,
  );

  const unauthAdmin = await safeFetch(`${baseUrl}/api/v1/admin/tenants`, { method: 'GET' });
  record(
    'gateway: unauth /api/v1/admin/tenants returns 401',
    unauthAdmin.ok && unauthAdmin.status === 401,
    unauthAdmin.ok ? `HTTP ${unauthAdmin.status}` : unauthAdmin.error,
  );

  const pubTrack = await safeFetch(`${baseUrl}/api/v1/public/track/VERIFY-DOES-NOT-EXIST`, { method: 'GET' });
  record(
    'gateway: public tracking reachable anonymously',
    pubTrack.ok && [200, 404].includes(pubTrack.status),
    pubTrack.ok ? `HTTP ${pubTrack.status}` : pubTrack.error,
  );
}

async function checkAiWorker(baseUrl) {
  const health = await safeFetch(`${baseUrl}/health`, { method: 'GET' });
  record(
    'ai-worker: /health',
    health.ok && health.status === 200,
    health.ok ? `HTTP ${health.status}` : health.error,
  );

  const trainHeaders = process.env.AI_API_KEY ? { 'x-ai-api-key': process.env.AI_API_KEY } : {};
  const expectedTrainStatuses = process.env.AI_API_KEY ? [501] : [401];
  const train = await safeFetch(`${baseUrl}/ai/v1/train/demand`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...trainHeaders },
    body: JSON.stringify({}),
  });
  record(
    'ai-worker: /ai/v1/train/demand fail-closed / honest 501',
    train.ok && expectedTrainStatuses.includes(train.status),
    train.ok ? `HTTP ${train.status}` : train.error,
  );
}

async function main() {
  const configuredCount = Object.values(targets).filter(Boolean).length;
  if (configuredCount === 0) {
    console.error(
      'ERROR: No deployment target URLs supplied. Pass --admin-url/--tenant-url/--customer-url/--pack-url/--gateway-url/--ai-url or matching env vars.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`SmartLogi Deployment Verifier (timeout=${TIMEOUT_MS}ms, skipProxy=${SKIP_PROXY})\n`);

  if (targets.gatewayUrl) await checkGateway(targets.gatewayUrl);
  if (targets.aiUrl) await checkAiWorker(targets.aiUrl);
  if (targets.adminUrl) await checkPortal('admin-portal', targets.adminUrl, '/admin/login');
  if (targets.tenantUrl) await checkPortal('tenant-portal', targets.tenantUrl, '/login');
  if (targets.customerUrl) await checkPortal('customer-portal', targets.customerUrl, '/client/login');
  if (targets.packUrl) await checkPortal('pack-station-web', targets.packUrl, '/login');

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} check(s) passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
