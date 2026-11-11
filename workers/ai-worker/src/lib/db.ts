import type { Bindings } from '../env';

export interface AiModelRow {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  type: string;
  accuracy: number | null;
  model_path: string | null;
  metadata: string | null;
  is_current: number;
  trained_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiBFeedbackRow {
  id: string;
  tenant_id: string;
  model_id: string;
  resource_type: string;
  resource_id: string;
  ai_prediction: string | null;
  human_corrected: string | null;
  confidence: number;
  is_used_for_train: number;
  created_at: string;
  updated_at: string;
}

const now = () => new Date().toISOString();

/** snake_case row -> camelCase object (for /logistics/ai consumers). */
export function toCamelModel(r: AiModelRow): Record<string, unknown> {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    version: r.version,
    type: r.type,
    accuracy: r.accuracy,
    modelPath: r.model_path,
    isCurrent: Boolean(r.is_current),
    metadata: r.metadata,
    trainedAt: r.trained_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export function toCamelFeedback(r: AiBFeedbackRow): Record<string, unknown> {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    modelId: r.model_id,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    aiPrediction: r.ai_prediction ? JSON.parse(r.ai_prediction) : null,
    humanCorrected: r.human_corrected ? JSON.parse(r.human_corrected) : null,
    confidence: r.confidence,
    isUsedForTrain: Boolean(r.is_used_for_train),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listModelsPaginated(
  env: Bindings,
  tenantId: string,
  type?: string,
  page = 1,
  limit = 20
) {
  const p = Math.max(1, page);
  const l = Math.min(Math.max(1, limit), 100);
  const offset = (p - 1) * l;
  const typeClause = type ? ' AND type = ?' : '';
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM ai_models WHERE tenant_id = ?${typeClause}`
  )
    .bind(tenantId, ...(type ? [type] : []))
    .first<{ c: number }>();
  const total = count?.c ?? 0;
  const rows = await env.DB.prepare(
    `SELECT * FROM ai_models WHERE tenant_id = ?${typeClause} ORDER BY trained_at DESC, created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(tenantId, ...(type ? [type] : []), l, offset)
    .all<AiModelRow>();
  return {
    data: rows.results || [],
    meta: { total, page: p, limit: l, total_pages: Math.max(1, Math.ceil(total / l)) },
  };
}

export async function listModelsCamel(env: Bindings, tenantId: string, type?: string) {
  const where = type ? ' AND type = ?' : '';
  const res = await env.DB.prepare(
    `SELECT * FROM ai_models WHERE tenant_id = ?${where} ORDER BY trained_at DESC, created_at DESC`
  )
    .bind(tenantId, ...(type ? [type] : []))
    .all<AiModelRow>();
  return (res.results || []).map(toCamelModel);
}

export async function createModel(
  env: Bindings,
  tenantId: string,
  data: { name: string; version: string; type: string; accuracy?: number | null; modelPath?: string | null; metadata?: string | null }
) {
  const id = crypto.randomUUID();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO ai_models (id, tenant_id, name, version, type, accuracy, model_path, metadata, is_current, trained_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  )
    .bind(id, tenantId, data.name, data.version, data.type, data.accuracy ?? null, data.modelPath ?? null, data.metadata ?? null, ts, ts, ts)
    .run();
  return env.DB.prepare(`SELECT * FROM ai_models WHERE id = ?`).bind(id).first<AiModelRow>();
}

export async function updateModel(env: Bindings, id: string, tenantId: string, data: Record<string, unknown>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (sets.length === 0) return env.DB.prepare(`SELECT * FROM ai_models WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<AiModelRow>();
  vals.push(id, tenantId);
  await env.DB.prepare(
    `UPDATE ai_models SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND tenant_id = ?`
  ).bind(...vals, now(), id, tenantId).run();
  return env.DB.prepare(`SELECT * FROM ai_models WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<AiModelRow>();
}

export async function activateModel(env: Bindings, modelId: string, tenantId: string) {
  const model = await env.DB.prepare(`SELECT * FROM ai_models WHERE id = ? AND tenant_id = ?`).bind(modelId, tenantId).first<AiModelRow>();
  if (!model) return null;
  await env.DB.prepare(
    `UPDATE ai_models SET is_current = 0 WHERE tenant_id = ? AND type = ?`
  ).bind(tenantId, model.type).run();
  await env.DB.prepare(`UPDATE ai_models SET is_current = 1, updated_at = ? WHERE id = ?`).bind(now(), modelId).run();
  return { ok: true, message: `Model ${modelId} activated` };
}

export async function deleteModel(env: Bindings, id: string, tenantId: string) {
  const r = await env.DB.prepare(`DELETE FROM ai_models WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).run();
  return { ok: r.success, message: r.success ? `Model ${id} deleted` : `Model ${id} not found` };
}

export async function listFeedbacksPaginated(env: Bindings, tenantId: string, modelId?: string, isUsed?: boolean, page = 1, limit = 20) {
  const p = Math.max(1, page);
  const l = Math.min(Math.max(1, limit), 100);
  const offset = (p - 1) * l;
  const conds: string[] = ['tenant_id = ?'];
  const vals: unknown[] = [tenantId];
  if (modelId) { conds.push('model_id = ?'); vals.push(modelId); }
  if (isUsed !== undefined) { conds.push('is_used_for_train = ?'); vals.push(isUsed ? 1 : 0); }
  const where = conds.join(' AND ');
  const count = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_feedbacks WHERE ${where}`).bind(...vals).first<{ c: number }>();
  const rows = await env.DB.prepare(`SELECT * FROM ai_feedbacks WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...vals, l, offset).all<AiBFeedbackRow>();
  const total = count?.c ?? 0;
  return { data: rows.results || [], meta: { total, page: p, limit: l, total_pages: Math.max(1, Math.ceil(total / l)) } };
}

export async function listFeedbacksCamel(env: Bindings, tenantId: string, modelId?: string, isUsedForTrain?: boolean) {
  const conds: string[] = ['tenant_id = ?'];
  const vals: unknown[] = [tenantId];
  if (modelId) { conds.push('model_id = ?'); vals.push(modelId); }
  if (isUsedForTrain !== undefined) { conds.push('is_used_for_train = ?'); vals.push(isUsedForTrain ? 1 : 0); }
  const where = conds.join(' AND ');
  const res = await env.DB.prepare(`SELECT * FROM ai_feedbacks WHERE ${where} ORDER BY created_at DESC`).bind(...vals).all<AiBFeedbackRow>();
  return (res.results || []).map(toCamelFeedback);
}

export async function createFeedback(
  env: Bindings,
  tenantId: string,
  data: { modelId?: string; resourceType?: string; resourceId?: string; aiPrediction?: unknown; humanCorrected?: unknown; confidence?: number }
) {
  const id = crypto.randomUUID();
  const ts = now();
  const modelId = data.modelId || 'demand-v1';
  await env.DB.prepare(
    `INSERT INTO ai_feedbacks (id, tenant_id, model_id, resource_type, resource_id, ai_prediction, human_corrected, confidence, is_used_for_train, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  )
    .bind(
      id, tenantId, modelId, data.resourceType, data.resourceId,
      data.aiPrediction != null ? JSON.stringify(data.aiPrediction) : null,
      data.humanCorrected != null ? JSON.stringify(data.humanCorrected) : null,
      data.confidence ?? 1.0, ts, ts
    )
    .run();
  return { ok: true, message: 'Feedback recorded. AI Core is evolving.', localId: id };
}

export async function markFeedbackUsed(env: Bindings, id: string, tenantId: string) {
  await env.DB.prepare(`UPDATE ai_feedbacks SET is_used_for_train = 1, updated_at = ? WHERE id = ? AND tenant_id = ?`).bind(now(), id, tenantId).run();
  return env.DB.prepare(`SELECT * FROM ai_feedbacks WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<AiBFeedbackRow>();
}

export async function deleteFeedback(env: Bindings, id: string, tenantId: string) {
  const r = await env.DB.prepare(`DELETE FROM ai_feedbacks WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).run();
  return { ok: r.success, message: r.success ? `Feedback ${id} deleted` : `Feedback ${id} not found` };
}

/** Export human-corrected feedback records for offline ML/vision training pipelines. */
export async function exportTrainingDataset(env: Bindings, tenantId: string, modelId?: string, limit = 500) {
  const safeLimit = Math.min(Math.max(1, limit), 2000);
  const conds: string[] = ['tenant_id = ?', 'human_corrected IS NOT NULL'];
  const vals: unknown[] = [tenantId];
  if (modelId) {
    conds.push('model_id = ?');
    vals.push(modelId);
  }
  const where = conds.join(' AND ');
  const rows = await env.DB.prepare(
    `SELECT id, model_id, resource_type, resource_id, ai_prediction, human_corrected, confidence, is_used_for_train, created_at
     FROM ai_feedbacks WHERE ${where} ORDER BY created_at DESC LIMIT ?`
  )
    .bind(...vals, safeLimit)
    .all<AiBFeedbackRow>();
  return (rows.results || []).map((r) => ({
    id: r.id,
    model_id: r.model_id,
    resource_type: r.resource_type,
    resource_id: r.resource_id,
    ai_prediction: r.ai_prediction ? safeJsonParse(r.ai_prediction) : null,
    human_corrected: r.human_corrected ? safeJsonParse(r.human_corrected) : null,
    confidence: r.confidence,
    is_used_for_train: Boolean(r.is_used_for_train),
    created_at: r.created_at,
  }));
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Latest active/current model of a given type (or most recent). */
export async function latestModelId(env: Bindings, tenantId: string, type: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM ai_models WHERE tenant_id = ? AND type = ? ORDER BY is_current DESC, trained_at DESC, created_at DESC LIMIT 1`
  ).bind(tenantId, type).first<{ id: string }>();
  return row?.id ?? null;
}
