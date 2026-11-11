import worker from '../src/index';

/*
 * USER-OPERATION JOURNEY test (no framework). Simulates the real sequence a
 * user/developer performs against the AI API:
 *   1. chat                       -> 200 + assistant content
 *   2. route optimize             -> 200 + ok + routes[]
 *   3. submit feedback            -> 200 + localId
 *   4. LIST feedbacks             -> 200 + the row from step 3 RETURNS (round-trip proof)
 *   5. predict demand             -> 200 + numeric prediction (JSON parse path)
 *   6. wrong key                  -> 401
 *   7. no key                     -> 401
 *
 * Backend AI is mocked (env.AI.run) to avoid real Cloudflare usage — but
 * every HTTP layer a user touches (auth, routing, DB round-trip, JSON parse) is
 * exercised for real. This is "chạy đúng", not "vờ 200".
 */

// ---- Stateful mock DB (records INSERTs, serves SELECTs) ----
class Stmt {
  sql: string; _vals: any[] = [];
  constructor(sql: string) { this.sql = sql; }
  bind(...a: any[]) { this._vals = a; return this; }
  run() { mockDB._run(this.sql, this._vals); return { success: true, results: [], meta: {} }; }
  first() { return mockDB._first(this.sql, this._vals); }
  all() { return mockDB._all(this.sql, this._vals); }
}
const mockDB: any = {
  feedback: [] as any[],
  prepare(sql: string) { return new Stmt(sql); },
  _run(sql: string, vals: any[]) {
    const low = sql.toLowerCase().replace(/\s+/g, ' ');
    if (low.startsWith('insert into ai_feedbacks')) {
      const [id, tenantId, modelId, rt, rid, aip, hc, conf, used, ca, ua] = vals;
      mockDB.feedback.push({ id, tenant_id: tenantId, model_id: modelId, resource_type: rt, resource_id: rid,
        ai_prediction: aip, human_corrected: hc, confidence: conf, is_used_for_train: used, created_at: ca, updated_at: ua });
    }
    // CREATE TABLE / INSERT OR IGNORE seeds / other DML -> no-op success (real D1 idempotent)
  },
  _first(sql: string, vals: any[]) {
    const low = sql.toLowerCase().replace(/\s+/g, ' ');
    if (low.includes('count(*) as c from ai_feedbacks')) return { c: mockDB.feedback.filter((r) => r.tenant_id === vals[0]).length };
    if (low.includes('count(*) as c from ai_models')) return { c: 0 };
    if (low.startsWith('select id from ai_models')) return null; // no seeded models
    return null;
  },
  _all(sql: string, vals: any[]) {
    const low = sql.toLowerCase().replace(/\s+/g, ' ');
    if (low.startsWith('select * from ai_feedbacks')) {
      return { results: mockDB.feedback.filter((r) => r.tenant_id === vals[0]), meta: {} };
    }
    if (low.startsWith('select * from ai_models')) return { results: [], meta: {} };
    return { results: [], meta: {} };
  },
};

// ---- Smart mock AI.run ----
const aiRunCalls: string[] = [];
const AI: any = { run: async (model: string, opts: any) => { aiRunCalls.push(model); const msgs = (opts?.messages || []).map((m: any) => m.content).join(' '); if (/predicted_weight_kg/.test(msgs)) return { response: '```json\n{"predicted_weight_kg":12.5}\n```' }; if (/predicted_duration/.test(msgs)) return { response: '```json\n{"predicted_duration_minutes":42}\n```' }; if (/churn_probability/.test(msgs)) return { response: '```json\n{"churn_probability":0.2,"will_churn":false,"risk_level":"low"}\n```' }; return { response: 'Xin chào, tôi là SmartLogi AI — trợ lý phân tích logistics của bạn.' }; } };

const env: any = {
  JWT_SECRET: 'journey-secret',
  AI_API_KEY: 'journey-key',
  CACHE: { get: async () => null, put: async () => undefined },
  DB: mockDB,
  AI,
};
const ctx: any = { waitUntil: async (p: any) => p, nextRate: () => undefined, runtime: { getProps: () => ({}) } };
const base = 'http://internal';
async function req(path: string, init: any = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  const r = await (worker as any).fetch(new Request(base + path, { ...init, headers }), env, ctx);
  let body: any = null; try { body = await r.clone().json(); } catch { try { body = await r.clone().text(); } catch {} }
  return { status: r.status, body };
}
let pass = 0, fail = 0, capturedId: string | null = null;
function assert(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log('  \u2713', name, extra !== undefined ? JSON.stringify(extra) : ''); }
  else { fail++; console.log('  \u2717 FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

(async () => {
  // 1. chat
  const c1 = await req('/ai/v1/chat', { method: 'POST', headers: { 'x-ai-api-key': 'journey-key' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Tôi có đơn hàng ORD-1 giao sớm không?' }], context: 'HCM->HN', conversation_id: 'conv-1' }) });
  assert('1. chat -> 200 ok+role+content', c1.status === 200 && c1.body?.ok === true && c1.body?.role === 'assistant' && typeof c1.body?.content === 'string', { status: c1.status, role: c1.body?.role, contentSnippet: c1.body?.content?.slice(0, 20) });

  // 2. routing optimize (top-level, as logistics-service calls)
  const b2 = { locations: [{ id: 'D', lat: 10.82, lng: 106.66 }, { id: 'A', lat: 10.80, lng: 106.70 }], vehicles: [{ id: 'V1', capacity: 100 }], depot_index: 0 };
  const c2 = await req('/routing/solve', { method: 'POST', headers: { 'x-ai-api-key': 'journey-key' }, body: JSON.stringify(b2) });
  assert('2. routing/solve -> 200 ok+routes[]', c2.status === 200 && c2.body?.ok === true && Array.isArray(c2.body?.routes), { status: c2.status, ok: c2.body?.ok, totalDistance: c2.body?.total_distance_meters });

  // 3. submit feedback (user corrects an AI prediction)
  const fbBody = { model_id: 'demand-v1', resource_type: 'order', resource_id: 'ORD-1',
    ai_prediction: { predicted_weight_kg: 99.9 }, human_corrected: { predicted_weight_kg: 12.5 }, confidence: 0.42 };
  const c3 = await req('/ai/v1/feedback', { method: 'POST', headers: { 'x-ai-api-key': 'journey-key' }, body: JSON.stringify(fbBody) });
  capturedId = c3.body?.localId ?? null;
  assert('3. feedback POST -> 200 + localId', c3.status === 200 && c3.body?.ok === true && typeof capturedId === 'string' && capturedId.length > 0, { status: c3.status, localId: capturedId, msg: c3.body?.message });

  // 4. LIST feedbacks -> the row from step 3 MUST appear (round-trip persistence).
  // NOTE: /v1/feedbacks returns snake_case RAW rows (human_corrected = JSON string),
  // matching the legacy Python ai-service contract (see admin.ts "snake_case payloads").
  const c4 = await req('/ai/v1/feedbacks', { method: 'GET', headers: { 'x-ai-api-key': 'journey-key' } });
  const row = Array.isArray(c4.body?.data) ? c4.body.data.find((x: any) => x.resource_id === 'ORD-1') : null;
  const hcParsed = row?.human_corrected && typeof row.human_corrected === 'string' ? JSON.parse(row.human_corrected) : row?.human_corrected;
  const apParsed = row?.ai_prediction && typeof row.ai_prediction === 'string' ? JSON.parse(row.ai_prediction) : row?.ai_prediction;
  assert('4. feedbacks GET -> 200 + ORD-1 returned (round-trip)', c4.status === 200 && c4.body?.meta?.total >= 1 && row && row.resource_id === 'ORD-1' && apParsed?.predicted_weight_kg === 99.9 && hcParsed?.predicted_weight_kg === 12.5, { status: c4.status, total: c4.body?.meta?.total, found: !!row, resourceId: row?.resource_id, aiPred: apParsed, humanCorrected: hcParsed });

  // 5. predict demand -> uses llmJson (AI returns fenced JSON; worker parses)
  const c5 = await req('/ai/v1/predict/demand', { method: 'POST', headers: { 'x-ai-api-key': 'journey-key' },
    body: JSON.stringify({ day_of_week: 3, hour: 14, item_count: 5 }) });
  assert('5. predict/demand -> 200 + numeric predicted_weight_kg', c5.status === 200 && c5.body?.ok === true && typeof c5.body?.predicted_weight_kg === 'number' && c5.body?.predicted_weight_kg === 12.5, { status: c5.status, predicted: c5.body?.predicted_weight_kg, model: c5.body?.model_path });

  // 6. wrong API key -> 401 (auth reject, NOT a 200 lie)
  const c6 = await req('/ai/v1/feedback', { method: 'POST', headers: { 'x-ai-api-key': 'WRONG' }, body: JSON.stringify(fbBody) });
  assert('6. wrong key -> 401 (not 200)', c6.status === 401, { status: c6.status });

  // 7. no key -> 401
  const c7 = await req('/ai/v1/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) });
  assert('7. no key -> 401', c7.status === 401, { status: c7.status });

  console.log(`\nRESULT: ${pass} passed, ${fail} failed | ai-run calls=${aiRunCalls.length}, feedback rows=${mockDB.feedback.length}`);
  if (fail) process.exit(1);
})();
