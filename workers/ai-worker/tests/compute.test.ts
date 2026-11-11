import worker from '../src/index';

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('  \u2713', name, extra !== undefined ? JSON.stringify(extra) : '');
  } else {
    fail++;
    console.log('  \u2717 FAIL', name, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

class MockStmt {
  constructor(
    private readonly db: typeof mockDB,
    private readonly sql: string,
    private vals: any[] = []
  ) {}

  bind(...args: any[]) {
    this.vals = args;
    return this;
  }

  run() {
    this.db._run(this.sql, this.vals);
    return { success: true, results: [], meta: {} };
  }

  first() {
    return this.db._first(this.sql, this.vals);
  }

  all() {
    return this.db._all(this.sql, this.vals);
  }
}

const mockDB = {
  models: [] as any[],
  feedbacks: [
    {
      id: 'fb-verified-1',
      tenant_id: '__system__',
      model_id: 'demand-v1',
      resource_type: 'order',
      resource_id: 'ORD-101',
      ai_prediction: JSON.stringify({ predicted_weight_kg: 10 }),
      human_corrected: JSON.stringify({ predicted_weight_kg: 12 }),
      confidence: 0.9,
      is_used_for_train: 0,
      created_at: '2026-11-10T00:00:00.000Z',
      updated_at: '2026-11-10T00:00:00.000Z',
    },
    {
      id: 'fb-unverified-2',
      tenant_id: '__system__',
      model_id: 'demand-v1',
      resource_type: 'order',
      resource_id: 'ORD-102',
      ai_prediction: JSON.stringify({ predicted_weight_kg: 5 }),
      human_corrected: null,
      confidence: 0.5,
      is_used_for_train: 0,
      created_at: '2026-11-10T00:01:00.000Z',
      updated_at: '2026-11-10T00:01:00.000Z',
    },
  ] as any[],
  prepare(sql: string) {
    return new MockStmt(this, sql);
  },
  _run(sql: string, vals: any[]) {
    const low = sql.toLowerCase().replace(/\s+/g, ' ');
    if (low.startsWith('insert into ai_models')) {
      const [id, tenantId, name, version, type, accuracy, modelPath, metadata, trainedAt, createdAt, updatedAt] = vals;
      mockDB.models.push({
        id,
        tenant_id: tenantId,
        name,
        version,
        type,
        accuracy,
        model_path: modelPath,
        metadata,
        is_current: 0,
        trained_at: trainedAt,
        created_at: createdAt,
        updated_at: updatedAt,
      });
    }
  },
  _first(sql: string, vals: any[]) {
    const low = sql.toLowerCase().replace(/\s+/g, ' ');
    if (low.startsWith('select * from ai_models where id = ?')) {
      return mockDB.models.find((m) => m.id === vals[0]) ?? null;
    }
    if (low.startsWith('select id from ai_models')) {
      return mockDB.models.find((m) => m.tenant_id === vals[0] && m.type === vals[1]) ?? null;
    }
    return null;
  },
  _all(sql: string, vals: any[]) {
    const low = sql.toLowerCase().replace(/\s+/g, ' ');
    if (low.includes('from ai_feedbacks') && low.includes('human_corrected is not null')) {
      const tenantId = vals[0];
      return {
        results: mockDB.feedbacks.filter((f) => f.tenant_id === tenantId && f.human_corrected !== null),
        meta: {},
      };
    }
    return { results: [], meta: {} };
  },
};

const baseEnv: any = {
  JWT_SECRET: 'compute-test-secret',
  AI_API_KEY: 'compute-test-key',
  CACHE: { get: async () => null, put: async () => undefined },
  DB: mockDB,
};

const ctx: any = {
  waitUntil: async (p: any) => p,
  nextRate: () => undefined,
  runtime: { getProps: () => ({}) },
};

async function call(path: string, body?: unknown, method = 'POST', env = baseEnv, headers: Record<string, string> = { 'x-ai-api-key': 'compute-test-key' }) {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
  };
  if (body !== undefined && method !== 'GET') {
    init.body = JSON.stringify(body);
  }
  const res = await (worker as any).fetch(new Request(`http://internal${path}`, init), env, ctx);
  const parsed = await res.json().catch(() => null);
  return { status: res.status, body: parsed };
}

async function run() {
  // 1. Auth required
  const unauth = await call('/api/v1/ai/v1/detect/anomalies', { data: [] }, 'POST', baseEnv, {});
  ok('Auth: missing credentials returns 401', unauth.status === 401, { status: unauth.status });

  // 2. Anomaly detection sample size sufficiency & z-score outlier check
  const smallSample = await call('/api/v1/ai/v1/detect/anomalies', {
    data: [{ weight: 10 }, { weight: 11 }, { weight: 12 }],
  });
  ok(
    'Anomalies: < 5 samples marked insufficient_sample',
    smallSample.status === 200 &&
      smallSample.body?.method === 'z_score_sample_stddev' &&
      smallSample.body?.min_recommended_samples === 5 &&
      smallSample.body?.data_sufficiency === 'insufficient_sample',
    smallSample.body
  );

  const sufficientSample = await call('/api/v1/ai/v1/detect/anomalies', {
    data: [
      { id: 1, cod: 100 },
      { id: 2, cod: 102 },
      { id: 3, cod: 98 },
      { id: 4, cod: 101 },
      { id: 5, cod: 99 },
      { id: 6, cod: 100 },
      { id: 7, cod: 101 },
      { id: 8, cod: 99 },
      { id: 9, cod: 102 },
      { id: 10, cod: 98 },
      { id: 11, cod: 50000 },
    ],
  });
  ok(
    'Anomalies: >= 5 samples marked sufficient and detects sample-stddev outlier z > 3',
    sufficientSample.status === 200 &&
      sufficientSample.body?.data_sufficiency === 'sufficient' &&
      sufficientSample.body?.anomalies_detected === 1 &&
      sufficientSample.body?.results?.[10]?.is_anomaly === true,
    { detected: sufficientSample.body?.anomalies_detected, z: sufficientSample.body?.results?.[10]?.anomaly_score }
  );

  // 3. /v1/analyze fallback disclosure (no AI binding)
  const analyzeFallback = await call('/api/v1/ai/v1/analyze', {
    payload: { overdue: 3, pendingCod: 1500000 },
  });
  ok(
    'Analyze: fallback mode explicitly sets fallback_used=true, deterministic_heuristic_fallback, unmeasured',
    analyzeFallback.status === 200 &&
      analyzeFallback.body?.fallback_used === true &&
      analyzeFallback.body?.method === 'deterministic_heuristic_fallback' &&
      analyzeFallback.body?.evaluation_status === 'unmeasured' &&
      Array.isArray(analyzeFallback.body?.risks) &&
      analyzeFallback.body.risks.length >= 2,
    analyzeFallback.body
  );

  // 4. Predict endpoints with no AI binding vs mocked AI binding
  const demandFallback = await call('/api/v1/ai/v1/predict/demand', { day_of_week: 2, hour: 10, item_count: 4 });
  ok(
    'Predict demand fallback: returns positive weight & unmeasured status',
    demandFallback.status === 200 &&
      demandFallback.body?.predicted_weight_kg > 0 &&
      demandFallback.body?.fallback_used === true &&
      demandFallback.body?.evaluation_status === 'unmeasured',
    demandFallback.body
  );

  const churnFallback = await call('/api/v1/ai/v1/predict/churn', { days_since_last_order: 60, total_orders: 5 });
  ok(
    'Predict churn fallback: bounded [0,1] probability & unmeasured status',
    churnFallback.status === 200 &&
      churnFallback.body?.churn_probability >= 0 &&
      churnFallback.body?.churn_probability <= 1 &&
      churnFallback.body?.fallback_used === true &&
      churnFallback.body?.evaluation_status === 'unmeasured',
    churnFallback.body
  );

  const aiEnv = {
    ...baseEnv,
    AI: {
      run: async () => ({ response: '```json\n{"predicted_weight_kg": 44.5}\n```' }),
    },
  };
  const demandAi = await call('/api/v1/ai/v1/predict/demand', { day_of_week: 3, hour: 15, item_count: 6 }, 'POST', aiEnv);
  ok(
    'Predict demand with AI binding: parses LLM response & marks fallback_used=false',
    demandAi.status === 200 &&
      demandAi.body?.predicted_weight_kg === 44.5 &&
      demandAi.body?.fallback_used === false &&
      demandAi.body?.method === 'llm_cf_or_openai',
    demandAi.body
  );

  // 5. Training honesty: 501 NOT_IMPLEMENTED & dataset export excludes unverified rows
  const trainRes = await call('/api/v1/ai/v1/train/demand', {});
  ok(
    'Train endpoint: returns HTTP 501 TRAINING_NOT_IMPLEMENTED (no fake queued success)',
    trainRes.status === 501 &&
      trainRes.body?.ok === false &&
      trainRes.body?.error === 'TRAINING_NOT_IMPLEMENTED' &&
      trainRes.body?.dataset_endpoint === '/ai/v1/training-dataset',
    trainRes
  );

  const datasetRes = await call('/api/v1/ai/v1/training-dataset', undefined, 'GET');
  ok(
    'Training dataset export: returns only human_corrected IS NOT NULL rows',
    datasetRes.status === 200 &&
      datasetRes.body?.ok === true &&
      datasetRes.body?.count === 1 &&
      datasetRes.body?.records?.[0]?.resource_id === 'ORD-101',
    datasetRes.body
  );

  // 6. Model registration validation: rejects invalid accuracy & never fabricates 0.86
  const badAccuracy = await call('/api/v1/ai/v1/models', { name: 'demand-v2', version: '2.0.0', type: 'demand', accuracy: 1.5 });
  ok('Model POST: rejects accuracy > 1 with HTTP 400', badAccuracy.status === 400, badAccuracy);

  const zeroAccuracy = await call('/api/v1/ai/v1/models', { name: 'demand-v2', version: '2.0.0', type: 'demand', accuracy: 0 });
  ok('Model POST: rejects accuracy <= 0 with HTTP 400', zeroAccuracy.status === 400, zeroAccuracy);

  const unmeasuredModel = await call('/api/v1/ai/v1/models', { name: 'demand-v2', version: '2.0.0', type: 'demand' });
  ok(
    'Model POST: stores accuracy=null when unmeasured instead of fabricated constant',
    unmeasuredModel.status === 201 && unmeasuredModel.body?.accuracy === null,
    unmeasuredModel.body
  );
}

run().then(() => {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
});
