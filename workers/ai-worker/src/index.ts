import { Hono } from 'hono';
import type { Bindings, Variables } from './env';
import { auth, registerAdminRoutes } from './routes/admin';
import { registerComputeRoutes, routingHandler } from './routes/compute';
import { registerTradeDocumentRoutes } from './routes/trade-documents';
import { registerHsCodeRoutes } from './routes/hs-code';
import { SCHEMA_SQL } from './lib/schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS preflight + headers (global)
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  await next();
  c.res.headers.set('Access-Control-Allow-Origin', '*');
});

app.get('/health', () =>
  new Response(JSON.stringify({ ok: true, service: 'smartlogi-ai-worker', ts: Date.now() }), {
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  })
);

// Direct routing endpoint (logistics-service calls AI_WORKER_URL/routing/solve).
app.use('/routing/solve', auth);
app.post('/routing/solve', routingHandler);

// Sub-app with all /ai/v1/* endpoints (registered at relative /v1/* and
// /routing/solve). Mounted at BOTH `/ai` and `/api/v1/ai` because the
// api-gateway exposes both prefixes AND frontend clients use baseURL
// `.../api/v1` (so they hit `/api/v1/ai/v1/...`).
const aiApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
aiApp.use('/v1/*', auth);
aiApp.use('/routing/solve', auth);

registerAdminRoutes(aiApp);
registerComputeRoutes(aiApp);
registerTradeDocumentRoutes(aiApp);
registerHsCodeRoutes(aiApp);

app.route('/ai', aiApp);
app.route('/api/v1/ai', aiApp);

// Fallback / mount note: `/routing/solve` is also reachable directly (logistics-service
// calls AI_WORKER_URL/routing/solve) via the top-level route above, independent of /ai.

app.notFound((c) => c.json({ ok: false, message: `Not found: ${c.req.path}` }, 404));
app.onError((err, c) => {
  console.error('ai-worker error', err);
  return c.json({ ok: false, message: err instanceof Error ? err.message : 'internal error' }, 500);
});

// Best-effort schema bootstrap for `wrangler dev` / first boot.
// Production uses `wrangler d1 migrations` (declared in wrangler.toml).
async function bootstrapSchema(env: Bindings) {
  const stmts = SCHEMA_SQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.toLowerCase().startsWith('--'));
  for (const stmt of stmts) {
    try {
      await env.DB.prepare(stmt).run();
    } catch (e: any) {
      // table/index already exists — safe to ignore
      if (!/already exists/i.test(e?.message || '')) throw e;
    }
  }
}

// Seed a few system-scoped (__system__) models so admin-portal shows something
// immediately and predict endpoints resolve a "latest" model id. Idempotent.
async function seedDefaults(env: Bindings) {
  const ts = new Date().toISOString();
  const defaults: Array<{ id: string; name: string; type: string }> = [
    { id: 'demand-v1', name: 'demand-regressor', type: 'demand' },
    { id: 'delivery-time-v1', name: 'delivery-time-regressor', type: 'delivery_time' },
    { id: 'churn-v1', name: 'churn-classifier', type: 'churn' },
    { id: 'anomaly-v1', name: 'anomaly-detector', type: 'anomaly' },
  ];
  const metadata = JSON.stringify({
    evaluation_status: 'unmeasured',
    source: 'rule_or_llm_baseline',
    trained_weights: false,
  });
  for (const m of defaults) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO ai_models (id, tenant_id, name, version, type, accuracy, model_path, metadata, is_current, trained_at, created_at, updated_at)
       VALUES (?, '__system__', ?, '1.0.0', ?, NULL, ?, ?, 1, ?, ?, ?)`
    )
      .bind(m.id, m.name, m.type, `models/${m.id}`, metadata, ts, ts, ts)
      .run();
  }
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ai-api-key, x-tenant-id',
  };
}

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    if (env.DB) {
      try {
        await bootstrapSchema(env);
        await seedDefaults(env);
      } catch (e) {
        console.error('schema bootstrap failed', e);
      }
    }
    return app.fetch(request, env, ctx);
  },
};
