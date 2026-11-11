# Verification Log (`verification.md`)

**Environment**: Windows local workstation (`AGENTS.md §1` strictly prohibits local `npm`, `pnpm`, `npx`, `docker`, `next`, `prisma`, `go`, `cargo`).  
**Available Local Validator**: `Python 3.14.2`  
**Audit Baseline Snapshot**: Commit `775ba1ce181191054397cb62bb7430530ce33f81` (updated through Gate `G5` on `2026-11-11`).

---

## 1. Local Static Verification (Executed Directly)

### G4 Code-Only Pass (`scripts/static-verify.py --code-only`)
Command executed after code & regression test edits (`G1–G4`):
```powershell
python -X utf8 Logistic_AI_SaaS-main\scripts\static-verify.py --code-only
```
Verbatim output (`exit code 0`):
```text
[PASS] Core files & regression test presence
[PASS] No executable ::uuid casts
[PASS] Prisma TENANT isolation & RLS migration/SQL
[PASS] NestJS RBAC boundaries & route ordering
[PASS] API Gateway vs frontend/mobile route parity
[PASS] Frontend data-source gate, CSV CWE-1236, clean UI
[PASS] AI Worker, MobileNet CV, Go & Rust invariants

Summary: 7 check group(s), 0 error(s).
```

### G5 Full Static & Documentation Pass (`scripts/static-verify.py`)
Command executed after final documentation, traceability matrix (`173` individual IDs in `docs/upgrade/coverage.csv`), and CI checks:
```powershell
python -X utf8 Logistic_AI_SaaS-main\scripts\static-verify.py
```
Verbatim output (`exit code 0`, re-run after final doc updates):
```text
[PASS] Core files & regression test presence
[PASS] No executable ::uuid casts
[PASS] Prisma TENANT isolation & RLS migration/SQL
[PASS] NestJS RBAC boundaries & route ordering
[PASS] API Gateway vs frontend/mobile route parity
[PASS] Frontend data-source gate, CSV CWE-1236, clean UI
[PASS] AI Worker, MobileNet CV, Go & Rust invariants
[PASS] CI workflow, docs links & traceability matrix

Summary: 8 check group(s), 0 error(s).
```

### Earlier G0 Baseline Checks (`2026-11-11`)
| Check | Command | Status | Output Summary |
|---|---|---|---|
| Python runtime check | `python --version` | Passed | `Python 3.14.2` |
| Tool inventory scan | Local `_repos` Python scan | Passed | Inventoried 32 local reference repos in `docs/upgrade/tool-inventory.md` |
| Legacy checker inspection | `tmp_check.py` review | Inspected | Kept `tmp_check.py` frozen; built cross-platform `scripts/static-verify.py` |

---

## 2. Regression Test Inventory (`15` Suites Ready for CI)

| Suite File | Covered Gate / Invariant | CI Job (`needs_ci_run`) |
|---|---|---|
| `api/api-gateway/src/config/services.config.spec.ts` | Segment-boundary `ROUTE_RULES` longest-prefix matching | `node-workspace` |
| `api/api-gateway/src/controllers/health.controller.spec.ts` | Gateway health endpoint shape | `node-workspace` |
| `api/api-gateway/src/guards/jwt.gateway.guard.spec.ts` | Edge JWT guard signature & claim enforcement | `node-workspace` |
| `backend/core-api/src/modules/iam/__tests__/rbac-boundary.spec.ts` | `@RequireRoles(SUPER_ADMIN)`, `@ExcludeRoles(CUSTOMER_CLIENT)`, least privilege | `node-workspace` |
| `backend/core-api/src/modules/iam/__tests__/tenant-isolation.spec.ts` | ALS `search_path`, `app.tenant_id`, tenant audit log scoping | `node-workspace` |
| `backend/core-api/src/modules/logistics/__tests__/cod-reconcile.spec.ts` | `qrCodeToken`/reference matching inside `$transaction`, settlement window, `matched/unmatched/ambiguous` | `node-workspace` |
| `backend/core-api/src/modules/wms/__tests__/wms-concurrency.spec.ts` | Non-negative `quantityAvailable`, `allocateWithCapacity` remaining capacity, zero `::uuid` | `node-workspace` |
| `packages/wms-engine/src/index.spec.ts` | FIFO/FEFO/LIFO, cumulative bin weight/volume, normalized putaway score, wave bin resolution | `node-workspace` |
| `workers/ai-worker/tests/vrp.test.ts` | Single-customer `[0, c1]` preservation, accurate `stops`, heuristic unassigned reasons, `haversine_circuity_1.41` | `ai-worker` |
| `workers/ai-worker/tests/compute.test.ts` | Deterministic fallbacks, `evaluation_status: "unmeasured"`, z-score `min_recommended_samples: 5`, `501` train stub | `ai-worker` |
| `workers/ai-worker/tests/llm.test.ts` | Prompt injection delimiter `wrapUntrustedData` & fallback metadata | `ai-worker` |
| `workers/ai-worker/tests/journey.test.ts` | End-to-end Worker request/feedback/export flow | `ai-worker` |
| `backend/gps-ingestion-service/main_test.go` | HTTP constant-time Bearer, UDP HMAC-SHA256 + timestamp + replay cache, GPS bounds, batch geofence | `go-services` |
| `backend/webhook-service/main_test.go` | SSRF private/loopback/metadata IP blocking & `maskSecret` | `go-services` |
| `packages/prisma-schemas/prisma/tests/tenant-isolation.sql` | Fail-closed `smartlogi_app` cross-tenant read/write SQL `42501` error verification + `app.bypass_rls` | `postgres-rls` |

---

## 3. Pending CI Runtime Checks (`needs_ci_run` per `AGENTS.md §1`)

Defined cleanly in `.github/workflows/ci.yml` (`6` jobs):

1. **`static-verify`**: `python3 -X utf8 scripts/static-verify.py` (passed locally; also runs in CI on push/PR).
2. **`node-workspace`**:
   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter shared-types build
   pnpm --filter wms-engine build
   pnpm --filter ui-components build
   pnpm --filter ui-kit build
   pnpm --filter hardware-bridge build
   pnpm --filter offline-sync-engine build
   pnpm --filter prisma-schemas exec prisma generate
   pnpm exec jest --config packages/wms-engine/jest.config.js
   pnpm exec jest --config api/api-gateway/jest.config.js
   pnpm exec jest --config backend/core-api/jest.config.js --runInBand
   pnpm --filter shared-types exec tsc --noEmit
   pnpm --filter wms-engine exec tsc --noEmit
   pnpm --filter core-api exec tsc --noEmit
   pnpm --filter api-gateway exec tsc --noEmit
   pnpm --filter admin-portal exec next typegen && pnpm --filter admin-portal exec tsc --noEmit
   pnpm --filter tenant-portal exec next typegen && pnpm --filter tenant-portal exec tsc --noEmit
   pnpm --filter customer-portal exec next typegen && pnpm --filter customer-portal exec tsc --noEmit
   pnpm --filter pack-station-web exec next typegen && pnpm --filter pack-station-web exec tsc --noEmit
   pnpm --filter driver-app exec tsc --noEmit
   ```
3. **`ai-worker`**:
   ```bash
   cd workers/ai-worker && npm ci && npx tsc --noEmit
   npx tsx tests/llm.test.ts
   npx tsx tests/journey.test.ts
   npx tsx tests/vrp.test.ts
   npx tsx tests/compute.test.ts
   ```
4. **`go-services`**:
   ```bash
   cd backend/gps-ingestion-service && go vet ./... && go test -v -race ./...
   cd backend/webhook-service && go vet ./... && go test -v -race ./...
   ```
5. **`rust-api`**:
   ```bash
   cd backend/rust-api && cargo check --workspace && cargo test --workspace
   ```
6. **`postgres-rls`** (`postgis/postgis:15-3.3` service container):
   ```bash
   pnpm --filter prisma-schemas exec prisma migrate deploy
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/prisma-schemas/prisma/tests/tenant-isolation.sql
   ```

---

## 4. Explicit Unverified Boundaries (Zero Extrapolation)

- **No local compiler/runtime execution**: TypeScript compilation, Jest suites, Next.js `next build`, Go race detector, Rust `cargo test`, Docker containers, and PostgreSQL migrations/RLS SQL have **not** executed locally (`AGENTS.md §1`) and retain status **`needs_ci_run`**.
- **No live cloud / field deployment**: Vercel demo data mode (`NEXT_PUBLIC_DATA_SOURCE=mock`), live Cloudflare Workers AI quota, live Stripe/SendGrid/Twilio/FCM keys, Open Banking feeds, OSRM road-network matrices, physical RS-232 scales/barcode scanners, and 12-week Pilot warehouse KPIs remain unmeasured (`[CHƯA ĐO PILOT]`).
- **External academic citations**: `REF-04` (Crossref HTTP 404) and `REF-06` (Crossref HTTP 429) remain tagged `[CHƯA XÁC MINH NGUỒN GỐC]` in `docs/ho-so-cap-nhat-B3-B4.md`.
