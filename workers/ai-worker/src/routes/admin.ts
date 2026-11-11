import type { Hono, Context, Next } from 'hono';
import type { Bindings, JwtPayload } from '../env';
import * as db from '../lib/db';
import { SYSTEM_TENANT } from '../env';

type App = Hono<{ Bindings: Bindings; Variables: { user: JwtPayload | null; tenantId: string } }>;

// ---------------------------------------------------------------------------
// Auth middleware
// Supports: JWT Bearer (user) OR `AI_API_KEY` via `Authorization` /
// `x-ai-api-key` header for internal service-to-service calls (logistics-service).
// ---------------------------------------------------------------------------
export async function auth(c: Context, next: Next) {
  const env = c.env as Bindings;
  const hdr = c.req.header('authorization') || '';
  const apiKey = c.req.header('x-ai-api-key') || '';
  let user: JwtPayload | null = null;

  const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7) : (hdr || apiKey);
  if (bearer) {
    // Try JWT first.
    user = await import('../lib/jwt').then((m) => m.verifyJwt(bearer, env.JWT_SECRET));
    if (!user && env.AI_API_KEY && (apiKey === env.AI_API_KEY || bearer === env.AI_API_KEY)) {
      user = { sub: 'internal', role: 'service', tenant_id: SYSTEM_TENANT };
    }
  }
  c.set('user', user);
  c.set('tenantId', user ? (user.tenant_id || user.schema_name || SYSTEM_TENANT) : SYSTEM_TENANT);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  await next();
}

/* ========================= /v1/* (admin / pack-station) =========================
 * Routes are registered on a sub-app mounted at BOTH `/ai` and `/api/v1/ai`
 * (the two gateway prefixes) so clients using either prefix work.
 * snake_case payloads returned as plain arrays / snake_case — identical to the
 * legacy Python ai-service contract.
 */
export function registerAdminRoutes(app: App) {
  app.get('/v1/models', async (c) => {
    const env = c.env as Bindings;
    const t = c.var.tenantId;
    const type = c.req.query('type') || undefined;
    const result = await db.listModelsPaginated(env, t, type);
    // admin-portal iterates Array.isArray(data) and reads is_current/trained_at/etc.
    return c.json(result.data);
  });

  app.delete('/v1/models/:id', async (c) => {
    const env = c.env as Bindings;
    const r = await db.deleteModel(env, c.req.param('id')!, c.var.tenantId);
    return c.json(r);
  });

  app.patch('/v1/models/:id/activate', async (c) => {
    const env = c.env as Bindings;
    const res = await db.activateModel(env, c.req.param('id')!, c.var.tenantId);
    return res ? c.json(res) : c.json({ ok: false, message: 'Model not found' }, 404);
  });

  // POST /ai/v1/feedback  (pack-station-web + logistics-service bridge)
  app.post('/v1/feedback', async (c) => {
    const env = c.env as Bindings;
    const body = await c.req.json();
    const res = await db.createFeedback(env, c.var.tenantId, {
      modelId: body.model_id || body.modelId,
      resourceType: body.resource_type || body.resourceType,
      resourceId: body.resource_id || body.resourceId,
      aiPrediction: body.ai_prediction || body.aiPrediction,
      humanCorrected: body.human_corrected || body.humanCorrected,
      confidence: body.confidence,
    });
    return c.json(res);
  });

  app.get('/v1/feedbacks', async (c) => {
    const env = c.env as Bindings;
    const res = await db.listFeedbacksPaginated(
      env,
      c.var.tenantId,
      c.req.query('model_id') || c.req.query('modelId') || undefined,
      c.req.query('is_used') ? c.req.query('is_used') === 'true' : undefined
    );
    return c.json(res);
  });

  app.delete('/v1/feedbacks/:id', async (c) => {
    const env = c.env as Bindings;
    const r = await db.deleteFeedback(env, c.req.param('id')!, c.var.tenantId);
    return c.json(r);
  });

  app.post('/v1/models', async (c) => {
    const env = c.env as Bindings;
    const body = await c.req.json().catch(() => ({}));
    if (!body?.name || !body?.version || !body?.type) {
      return c.json({ ok: false, message: 'Missing required fields: name, version, type' }, 400);
    }
    let accuracy: number | null = null;
    if (body.accuracy !== undefined && body.accuracy !== null) {
      const n = Number(body.accuracy);
      if (!Number.isFinite(n) || n <= 0 || n > 1) {
        return c.json({ ok: false, message: 'accuracy must be null (unmeasured) or in (0, 1]' }, 400);
      }
      accuracy = n;
    }
    const created = await db.createModel(env, c.var.tenantId, {
      name: String(body.name),
      version: String(body.version),
      type: String(body.type),
      accuracy,
      modelPath: body.model_path ?? body.modelPath ?? null,
      metadata: typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata ?? { evaluation_status: accuracy == null ? 'unmeasured' : 'offline_evaluated' }),
    });
    return c.json(created, 201);
  });

  // GET /ai/v1/training-dataset  (exports verified human corrections for offline training)
  app.get('/v1/training-dataset', async (c) => {
    const env = c.env as Bindings;
    const modelId = c.req.query('model_id') || c.req.query('modelId') || undefined;
    const limit = Number(c.req.query('limit') || 500);
    const records = await db.exportTrainingDataset(env, c.var.tenantId, modelId, Number.isFinite(limit) ? limit : 500);
    return c.json({
      ok: true,
      count: records.length,
      records,
    });
  });

  // POST /ai/v1/train/{type}  (explicit 501 — online training runs offline, not inside Workers)
  app.post('/v1/train/:type', async (c) => {
    const type = c.req.param('type');
    return c.json(
      {
        ok: false,
        error: 'TRAINING_NOT_IMPLEMENTED',
        message: `Huấn luyện trực tuyến cho loại '${type}' chưa được triển khai trên Worker. Vui lòng xuất dữ liệu qua GET /ai/v1/training-dataset, huấn luyện offline và đăng ký trọng số đã kiểm chứng qua POST /ai/v1/models.`,
        dataset_endpoint: '/ai/v1/training-dataset',
      },
      501
    );
  });
}

