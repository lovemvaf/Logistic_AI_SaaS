# SmartLogi AI Worker (Cloudflare)

Cloudflare Worker that replaces the legacy `backend/ai-service` Python/FastAPI service.
It exposes the **same HTTP contract** (`/ai/v1/*`, `/routing/solve`) so every existing
consumer (api-gateway, admin-portal, pack-station, logistics-service) works unchanged, and
adds a new **`/ai/v1/chat`** endpoint for AI-driven logistics analysis.

## What moved + what was removed

| Concern | Old (`backend/ai-service`, Python) | New (this Worker) |
|---|---|---|
| Inference: predictions / churn / anomalies | `sklearn` joblib models | Workers AI LLM (`ai` binding) + deterministic fallbacks |
| `/routing/solve` (OR-Tools VRP) | `ortools` native | Pure-JS nearest-neighbour + 2-opt (same output shape) |
| `/ai/v1/chat` (analysis) | ❌ didn't exist | ✅ new LLM chat endpoint |
| Model / feedback metadata | Postgres `tenant.ai_models` / `tenant.ai_feedbacks` | **D1** `ai_models` / `ai_feedbacks` (tenant-scoped by `tenant_id`) |
| `/logistics/ai/*` (tenant-portal) | logistics-service (Postgres) | Still served by logistics-service (unchanged — per-tenant data stays in Postgres) |

> The Worker uses **D1** (tenant_id partitioning in the `__system__` scope for admin/system
> models). A one-time migration script for existing Postgres `tenant.ai_*` rows is provided
> in `scripts/migrate-postgres-ai-to-d1.mjs` if you need historical model/feedback data.

## Tech stack

- **Hono** HTTP framework (runs on the Cloudflare Workers runtime).
- **Workers AI** `AI` binding for LLM inference (`@cf.meta/llama-3.1-8b-instruct-fast` by default).
  No external LLM API key is needed — the Worker uses the built-in `ai` (Workers AI) binding.
- **D1** SQLite for model/feedback metadata (auto-bootstrapped via `bootstrapSchema`).
- **KV** (`CACHE`) for short TTL caching of LLM responses (prediction cache).
- **R2** (`ASSETS`) reserved for future model artefact storage.

## Auth

Every protected route verifies the caller:

1. **JWT Bearer** (`Authorization: Bearer <jwt>`, HS256 using `JWT_SECRET`), or
2. **`AI_API_KEY`** shared secret via `Authorization: Bearer <key>` or `x-ai-api-key: <key>`
   (used by logistics-service for direct `/routing/solve` and `/ai/v1/feedback` calls).

The `tenant_id` is taken from the JWT. Super-admin / internal calls fall back to `__system__`.

## Setup

```bash
cd workers/ai-worker

# 1. Auth to Cloudflare (once)
npx wrangler login

# 2. Create the D1 database + KV namespace (one time)
npx wrangler d1 create smartlogi-ai-meta
npx wrangler kv namespace create CACHE

# 3. Paste the returned ids into wrangler.toml (d1_databases.database_id, kv_namespaces.id)

# 4. Set Worker secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put AI_API_KEY

# 5. Local dev
cp .dev.vars.example .dev.vars   # fill in JWT_SECRET, AI_API_KEY, ...
npx wrangler dev

# 6. Deploy
npx wrangler deploy
```

## Endpoints (contract-compatible with the legacy service)

### Models
- `GET    /ai/v1/models?type=demand` → `Array<{id,name,version,type,accuracy,is_current,trained_at,model_path}>`
- `POST   /ai/v1/train/:type` → `{ok,message}` (enqueue stub)
- `DELETE /ai/v1/models/:id` → `{ok,message}`
- `PATCH  /ai/v1/models/:id/activate` → activates the model (de-activates others of the same type)

### Feedback
- `POST   /ai/v1/feedback` → `{ok,message,localId}`  *(pack-station + logistics-service bridge)*
- `GET    /ai/v1/feedbacks?model_id=&is_used=&page=&limit`
- `DELETE /ai/v1/feedbacks/:id`

### Predictions (Workers AI LLM, deterministic fallback on parse failure)
- `POST /ai/v1/predict/demand` → `{ok,predicted_weight_kg,model_path,features}`
- `POST /ai/v1/predict/delivery-time` → `{ok,predicted_duration_minutes,model_path,features}`
- `POST /ai/v1/predict/churn` → `{ok,churn_probability,will_churn,risk_level,model_path}`
- `POST /ai/v1/detect/anomalies` → `{ok,total_analyzed,anomalies_detected,results}` (z-score, fast)

### Routing (JS heuristic)
- `POST /routing/solve` → `{ok,routes:[{vehicle_id,route,stop...}],total_distance_meters,total_vehicles}`

### Chat / analysis (NEW)
- `POST /ai/v1/chat` `{messages:[{role,content}], context?, conversation_id?}`
  → `{ok,conversation_id,role:"assistant",content}` (LLM logistics analyst)
- `POST /ai/v1/analyze` `{payload}` → `{ok,summary,risks,recommendations}`

### Health
- `GET /health` → `{ok:true,service:"smartlogi-ai-worker"}`

## Wiring (already applied in this repo)

1. **`api/api-gateway`** (`config/services.config.ts`): the `ai-service` service entry is now
   `ai-worker` pointing at `AI_WORKER_URL`; `ROUTE_MAP` routes `/ai`, `/api/v1/ai`, `/routing`
   to the Worker.
2. **`docker-compose.yml`**: the Python `ai-service` container was removed; `api-gateway`
   and `logistics-service` now receive `AI_WORKER_URL` (+ `AI_API_KEY` on logistics-service).
3. **`backend/logistics-service`**: `routing.processor` and `logistics.service.submitAiFeedback`
   now call `AI_WORKER_URL` with the shared `AI_API_KEY`.

## Local dev with the rest of the stack

```bash
# Terminal 1 — run the Worker locally
cd workers/ai-worker && npx wrangler dev   # -> http://localhost:8787

# Terminal 2 — run the gateway + other containers, pointing at the local Worker
AI_WORKER_URL=http://host.docker.internal:8787 AI_API_KEY=<your-key> docker compose up
```

> `host.docker.internal` maps the Docker host (where `wrangler dev` listens) from inside the
> compose network (Docker Desktop). On Linux without Docker Desktop, use `--network=host`
> for the gateway or set `AI_WORKER_URL=http://172.17.0.1:8787`.
