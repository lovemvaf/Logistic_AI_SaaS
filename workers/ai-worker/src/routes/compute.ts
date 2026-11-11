import type { Hono, Context } from 'hono';
import type { Bindings, JwtPayload } from '../env';
import { UNTRUSTED_DATA_GUARD, llmChat, llmChatVision, llmJson, wrapUntrustedData } from '../lib/llm';
import { solveRouting, Location, Vehicle } from '../lib/vrp';
import { latestModelId } from '../lib/db';

type App = Hono<{ Bindings: Bindings; Variables: { user: JwtPayload | null; tenantId: string } }>;

const SYSTEM =
  'You are SmartLogi AI, a logistics forecasting engine. Reply with a single JSON object only — no prose, no markdown.\n' +
  UNTRUSTED_DATA_GUARD;

/* =================== Compute routes (predictions, chat, routing) ===================
 * Registered on a sub-app mounted at BOTH `/ai` and `/api/v1/ai` (so clients
 * using baseURL `.../api/v1` hit `/api/v1/ai/v1/...` correctly).
 * Paths here are relative to the mount point.
 */
export const routingHandler = async (c: Context) => {
  const b = await c.req.json();
  const res = solveRouting(b.locations as Location[], b.vehicles as Vehicle[], b.depot_index);
  return c.json(res);
};

export function registerComputeRoutes(app: App) {
  /* ---- POST /ai/v1/chat  (headline: AI chat phân tích, hỗ trợ vision) ---- */
  app.post('/v1/chat', async (c: Context) => {
    const env = c.env as Bindings;
    const body = await c.req.json().catch(() => ({}));
    const messages: Array<{ role: string; content: string }> = Array.isArray(body.messages) ? body.messages : [];
    const context: string | undefined = typeof body.context === 'string' ? body.context : undefined;
    const images: string[] | undefined = Array.isArray(body.images) ? body.images : undefined;
    const hasAiBackend = Boolean((env as any).AI || env.OPENAI_API_KEY);
    const system = [
      'Bạn là trợ lý AI phân tích logistics của SmartLogi. Trả lời ngắn gọn, chỉ bám vào số liệu có thật trong dữ liệu cung cấp, không bịa con số.',
      UNTRUSTED_DATA_GUARD,
      context ? `Bối cảnh hệ thống:\n${wrapUntrustedData('chat_context', context, 4000)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const userText =
      messages.length > 0
        ? wrapUntrustedData(
            'chat_messages',
            messages.map((m) => `[${String(m.role || 'user').slice(0, 20)}] ${String(m.content ?? '')}`).join('\n')
          )
        : '';

    let text: string;
    if (images && images.length > 0) {
      text = await llmChatVision(env, system, userText, images, env.DEFAULT_MODEL);
    } else {
      text = await llmChat(env, system, userText, env.DEFAULT_MODEL);
    }
    return c.json({
      ok: true,
      conversation_id: body.conversation_id || crypto.randomUUID(),
      role: 'assistant',
      content: text,
      method: hasAiBackend ? 'llm_cf_or_openai' : 'rule_based_fallback',
      fallback_used: !hasAiBackend,
    });
  });

  /* ---- POST /ai/v1/predict/demand ---- */
  app.post('/v1/predict/demand', async (c: Context) => {
    const env = c.env as Bindings;
    const b = await c.req.json().catch(() => ({}));
    const tenantId = c.var.tenantId;
    const features = {
      day_of_week: clampFiniteNumber(b.day_of_week, 0, 6, 1),
      hour: clampFiniteNumber(b.hour, 0, 23, 12),
      item_count: clampFiniteNumber(b.item_count, 0, 100_000, 1),
    };
    const modelId = await latestModelId(env, tenantId, 'demand');
    let predicted_weight_kg: number;
    let fallback_used = false;
    try {
      const r = await llmJson<{ predicted_weight_kg: number }>(
        env,
        SYSTEM,
        `Forecast demand weight in kg from untrusted inputs below. Return JSON {"predicted_weight_kg": number}.\n${wrapUntrustedData('demand_features', features)}`,
        env.DEFAULT_MODEL
      );
      const parsed = Number(r?.predicted_weight_kg);
      if (Number.isFinite(parsed) && parsed > 0) {
        predicted_weight_kg = Math.round(parsed * 100) / 100;
      } else {
        predicted_weight_kg = fallbackDemand(features);
        fallback_used = true;
      }
    } catch {
      predicted_weight_kg = fallbackDemand(features);
      fallback_used = true;
    }
    return c.json({
      ok: true,
      predicted_weight_kg,
      model_path: modelId || 'llm-demand-v1',
      method: fallback_used ? 'deterministic_heuristic_fallback' : 'llm_cf_or_openai',
      fallback_used,
      evaluation_status: 'unmeasured',
      features,
    });
  });

  /* ---- POST /ai/v1/predict/delivery-time ---- */
  app.post('/v1/predict/delivery-time', async (c: Context) => {
    const env = c.env as Bindings;
    const b = await c.req.json().catch(() => ({}));
    const tenantId = c.var.tenantId;
    const features = {
      day_of_week: clampFiniteNumber(b.day_of_week, 0, 6, 1),
      hour: clampFiniteNumber(b.hour, 0, 23, 12),
      is_weekend: Boolean(b.is_weekend),
    };
    const modelId = await latestModelId(env, tenantId, 'delivery_time');
    let predicted_duration_minutes: number;
    let fallback_used = false;
    try {
      const r = await llmJson<{ predicted_duration_minutes: number }>(
        env,
        SYSTEM,
        `Estimate delivery duration in minutes from untrusted inputs below. Return JSON {"predicted_duration_minutes": number}.\n${wrapUntrustedData('delivery_features', features)}`,
        env.DEFAULT_MODEL
      );
      const parsed = Number(r?.predicted_duration_minutes);
      if (Number.isFinite(parsed) && parsed > 0) {
        predicted_duration_minutes = Math.round(parsed);
      } else {
        predicted_duration_minutes = fallbackDelivery(features);
        fallback_used = true;
      }
    } catch {
      predicted_duration_minutes = fallbackDelivery(features);
      fallback_used = true;
    }
    return c.json({
      ok: true,
      predicted_duration_minutes,
      model_path: modelId || 'llm-delivery-v1',
      method: fallback_used ? 'deterministic_heuristic_fallback' : 'llm_cf_or_openai',
      fallback_used,
      evaluation_status: 'unmeasured',
      features,
    });
  });

  /* ---- POST /ai/v1/predict/churn ---- */
  app.post('/v1/predict/churn', async (c: Context) => {
    const env = c.env as Bindings;
    const b = await c.req.json().catch(() => ({}));
    const features = {
      total_orders: clampFiniteNumber(b.total_orders, 0, 1_000_000, 1),
      avg_order_value: clampFiniteNumber(b.avg_order_value, 0, 1_000_000_000, 0),
      total_cod: clampFiniteNumber(b.total_cod, 0, 10_000_000_000, 0),
      days_since_last_order: clampFiniteNumber(b.days_since_last_order, 0, 3650, 30),
      customer_lifetime_days: clampFiniteNumber(b.customer_lifetime_days, 0, 36500, 90),
      orders_per_month: clampFiniteNumber(b.orders_per_month, 0, 100_000, 1),
    };
    let result: Record<string, unknown>;
    try {
      const r = await llmJson<{
        churn_probability: number;
        will_churn: boolean;
        risk_level: string;
      }>(
        env,
        SYSTEM,
        `Predict customer churn from untrusted inputs below. Return JSON {"churn_probability":0-1, "will_churn":boolean, "risk_level":"low"|"medium"|"high"}.\n${wrapUntrustedData('churn_features', features)}`,
        env.DEFAULT_MODEL
      );
      const rawProb = Number(r?.churn_probability);
      if (!Number.isFinite(rawProb)) throw new Error('invalid churn_probability');
      const prob = Math.min(1, Math.max(0, Math.round(rawProb * 1000) / 1000));
      result = {
        churn_probability: prob,
        will_churn: typeof r?.will_churn === 'boolean' ? r.will_churn : prob > 0.5,
        risk_level: ['low', 'medium', 'high'].includes(String(r?.risk_level)) ? r.risk_level : prob > 0.7 ? 'high' : prob > 0.4 ? 'medium' : 'low',
        model_path: 'llm-churn-v1',
        method: 'llm_cf_or_openai',
        fallback_used: false,
        evaluation_status: 'unmeasured',
      };
    } catch {
      const prob = fallbackChurnProbability(features);
      result = {
        churn_probability: prob,
        will_churn: prob > 0.5,
        risk_level: prob > 0.7 ? 'high' : prob > 0.4 ? 'medium' : 'low',
        model_path: 'llm-churn-v1',
        method: 'deterministic_heuristic_fallback',
        fallback_used: true,
        evaluation_status: 'unmeasured',
      };
    }
    return c.json({ ok: true, ...result });
  });

  /* ---- POST /ai/v1/detect/anomalies (z-score, fast, no LLM per row) ---- */
  app.post('/v1/detect/anomalies', async (c: Context) => {
    const b = await c.req.json().catch(() => ({}));
    const data: Record<string, unknown>[] = Array.isArray(b.data) ? b.data : b?.data?.items || [];
    const results = detectAnomalies(data);
    return c.json({
      ok: true,
      method: 'z_score_sample_stddev',
      min_recommended_samples: 5,
      data_sufficiency: data.length >= 5 ? 'sufficient' : 'insufficient_sample',
      total_analyzed: results.length,
      anomalies_detected: results.filter((r) => (r as any).is_anomaly).length,
      results,
    });
  });

  /* ---- POST /ai/v1/routing/solve & /routing/solve ----
   * Registered on BOTH the `/v1`-prefixed form (consistent with /v1/chat,
   * /v1/predict/*, /v1/analyze) AND the bare `/routing/solve` form.
   * The bare form is also re-exposed at the Worker root in index.ts so
   * logistics-service can call AI_WORKER_URL/routing/solve directly.
   */
  app.post('/routing/solve', routingHandler);
  app.post('/v1/routing/solve', routingHandler);

  /* ---- POST /ai/v1/analyze (one-shot payload analysis with safe fallback) ---- */
  app.post('/v1/analyze', async (c: Context) => {
    const env = c.env as Bindings;
    const b = await c.req.json().catch(() => ({}));
    const payload = b?.payload ?? b ?? {};
    try {
      const parsed = await llmJson<Record<string, unknown>>(
        env,
        SYSTEM,
        `Analyze the untrusted logistics payload below and return JSON with fields: summary (string), risks (string[]), recommendations (string[]).\n${wrapUntrustedData('analyze_payload', payload)}`,
        env.DEFAULT_MODEL
      );
      return c.json({
        ok: true,
        method: 'llm_cf_or_openai',
        fallback_used: false,
        evaluation_status: 'unmeasured',
        ...parsed,
      });
    } catch {
      return c.json({
        ok: true,
        method: 'deterministic_heuristic_fallback',
        fallback_used: true,
        evaluation_status: 'unmeasured',
        ...fallbackAnalyze(payload),
      });
    }
  });
}

function clampFiniteNumber(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function fallbackAnalyze(payload: unknown): {
  summary: string;
  risks: string[];
  recommendations: string[];
} {
  const obj = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const keys = Object.keys(obj);
  const risks: string[] = [];
  const recommendations: string[] = [];

  const overdue = Number(obj.overdue ?? obj.late_orders ?? obj.lateOrders ?? 0);
  const failed = Number(obj.failed ?? obj.failed_orders ?? 0);
  const pendingCod = Number(obj.cod_pending ?? obj.pendingCod ?? 0);

  if (Number.isFinite(overdue) && overdue > 0) {
    risks.push(`Có ${overdue} đơn trễ hạn trong dữ liệu hiện tại.`);
    recommendations.push('Ưu tiên điều phối lại các chuyến đang giữ đơn quá hạn và rà soát cảnh báo SLA.');
  }
  if (Number.isFinite(failed) && failed > 0) {
    risks.push(`Có ${failed} đơn giao thất bại cần xử lý trả hàng hoặc hẹn lại.`);
    recommendations.push('Rà soát lý do giao thất bại trước khi tạo chuyến lặp lại.');
  }
  if (Number.isFinite(pendingCod) && pendingCod > 0) {
    risks.push(`Còn tiền thu hộ chưa đối soát (${pendingCod}).`);
    recommendations.push('Đối chiếu bảng kê ngân hàng với phiên bàn giao COD trước khi chốt ngày.');
  }
  if (risks.length === 0) {
    recommendations.push('Hệ thống AI LLM chưa phản hồi JSON hợp lệ; đã dùng bộ phân tích cơ bản dựa trên khóa dữ liệu đầu vào.');
  }

  return {
    summary:
      keys.length > 0
        ? `Phân tích cơ bản (fallback) trên ${keys.length} trường dữ liệu: ${keys.slice(0, 6).join(', ')}.`
        : 'Chưa có đủ dữ liệu chi tiết trong payload để tổng hợp sâu.',
    risks,
    recommendations,
  };
}

/* ---- deterministic fallbacks (endpoint must never 500) ---- */
function fallbackDemand(b: any): number {
  const base = typeof b.item_count === 'number' ? b.item_count : 1;
  const dow = typeof b.day_of_week === 'number' ? b.day_of_week : 1;
  const hour = typeof b.hour === 'number' ? b.hour : 12;
  const factor = (dow >= 5 ? 0.8 : 1.1) * (hour >= 9 && hour <= 18 ? 1.2 : 0.7);
  return Math.round(base * 12.5 * factor * 100) / 100;
}
function fallbackDelivery(b: any): number {
  const hour = typeof b.hour === 'number' ? b.hour : 12;
  const weekend = b.is_weekend ? 1.4 : 1.0;
  return Math.round(40 * weekend * (hour >= 9 && hour <= 18 ? 1.1 : 0.9));
}
function fallbackChurnProbability(b: any): number {
  const days = typeof b.days_since_last_order === 'number' ? b.days_since_last_order : 30;
  const orders = typeof b.total_orders === 'number' ? b.total_orders : 1;
  const prob = 1 / (1 + Math.exp(-(days / 15 - 4 + Math.log(orders + 1) / 2)));
  return Math.round(prob * 1000) / 1000;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stdev(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function detectAnomalies(rows: Record<string, unknown>[]): Array<Record<string, unknown>> {
  if (!rows.length) return [];
  const numericCols = Object.keys(rows[0]).filter((k) => rows.every((r) => typeof r[k] === 'number'));
  const colStats: Record<string, { mean: number; std: number }> = {};
  for (const col of numericCols) {
    const vals = rows.map((r) => Number(r[col]));
    const m = mean(vals);
    colStats[col] = { mean: m, std: stdev(vals, m) };
  }
  return rows.map((row) => {
    let score = 0;
    const zByCol: Record<string, number> = {};
    for (const col of numericCols) {
      const s = colStats[col];
      const z = s.std ? Math.abs((Number(row[col]) - s.mean) / s.std) : 0;
      zByCol[col] = z;
      if (z > score) score = z;
    }
    return { ...row, is_anomaly: score > 3, anomaly_score: Math.round(score * 1000) / 1000, z_scores: zByCol };
  });
}
