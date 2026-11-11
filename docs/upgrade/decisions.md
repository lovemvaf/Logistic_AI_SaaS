# Architectural & Engineering Decisions (`decisions.md`)

Updated: 2026-11-11

## D01 — Runtime Backend Architecture (As-Is Modular Monolith + Specialized Services)
- **Decision**: Keep `backend/core-api` (NestJS modular monolith serving `/api/v1/*`), `api/api-gateway` (NestJS BFF/proxy), `backend/gps-ingestion-service` (Go UDP + HTTP), `backend/webhook-service` (Go HTTP + HMAC + retries), and `workers/ai-worker` (Hono/Cloudflare Worker) as the active runtime architecture.
- **Rejected**: Reverting to legacy 6-microservice split (`services/*`), claiming Kong API Gateway is deployed, or replacing `core-api` with `backend/rust-api` (`rust-api` contains unimplemented `501` endpoints and deterministic stub AI).
- **Evidence**: `backend/core-api/src/app.module.ts`, `api/api-gateway/src/config/services.config.ts`, `backend/rust-api/crates/api/src/routes/{meta,ai}.rs`.

## D02 — Database Isolation Strategy (Shared Schema + Prisma ALS Transaction + PostgreSQL Force RLS + Schema Defense)
- **Decision**: Retain PostgreSQL + PostGIS with AsyncLocalStorage (`TenantSchemaInterceptor`) opening a per-request transaction setting both `SET LOCAL search_path` and transaction-local GUC `set_config('app.tenant_id', ..., true)` enforced by `FORCE ROW LEVEL SECURITY`. Add a follow-up migration (`20261111000000_harden_tenant_rls_and_audit`) extending RLS policies to previously uncovered tenant-scoped tables (`invoices`, `payment_transactions`, `tenant_api_keys`, `feature_flags`, `tenant_settings`, `api_usage_daily`, `tenant_ui_config`) and restricting `SystemAuditLog` queries by `tenantId` in tenant endpoints.
- **Rejected**: Reverting to NestJS `Scope.REQUEST` injection or relying purely on middleware without DB-level RLS.

## D03 — RBAC & Cross-Role Boundary Enforcement (`shared-types` -> `core-api`)
- **Decision**: Add explicit `@RequireRoles(...)` and `@ExcludeRoles(...)` decorators evaluated inside `PermissionsGuard` **before** permission matching or `SUPER_ADMIN` bypass, plus `BillingManage` permission.
  - All `admin/*` controllers require `Roles.SUPER_ADMIN`.
  - All internal tenant controllers (`OrdersController`, `ReturnsController`, `WarehouseOpsController`, `CodRemittancesController`, etc.) explicitly exclude `Roles.CUSTOMER_CLIENT`.
  - Driver mobile/POD/check-in/stop endpoints verify resource ownership (`trip.driverId === driver.id` or `delivery.driverId === driver.id`) and enforce explicit forward state transitions.
- **Rejected**: Relying solely on permission strings shared across platform, tenant, and customer roles (`billing:read`, `audit-logs:read`, `orders:read`, `inventory:read`).

## D04 — VRP & Distance Source (`workers/ai-worker/src/lib/vrp.ts`)
- **Decision**: Fix the TypeScript nearest-neighbour + 2-opt CVRP solver cleanly (preserve single-customer `[0, c1]` routes, count stops accurately as `route.length - 1`, recompute `total_distance` and `total_vehicles` after route filtering, guard invalid/NaN/negative/unreachable demands, report partial `unassigned` reasons and bounded heuristic status instead of falsely claiming mathematical infeasibility). Disclose `distance_source: "haversine_circuity_1.41"` in solver metadata.
- **Rejected**: Introducing Python OR-Tools into Node/Worker runtime or falsely labeling Euclidean*1.41 routes as live road/traffic distances.

## D05 — AI Grounding, Pack Vision & Honest Capability Disclosure
- **Decision**:
  - Fix Cloudflare Workers AI typo (`@cf/meta/llama-3.1-8b-instruct-fast`), add untrusted-note XML delimiters against prompt injection, expose deterministic fallback metadata (`method`, `model_version`, `fallback_used`, `data_sufficiency`, `uncertainty`), remove fabricated `0.86` accuracy seed, replace fake `POST /v1/train/:type` success with HTTP `501` (`TRAINING_NOT_IMPLEMENTED`) + `/v1/training-dataset` export for human-reviewed corrections.
  - Connect real `mobilenet.classify(videoRef.current)` frame classification in `pack-station-web/src/app/pack/page.tsx` with `>= 0.60` confidence gate, ImageNet label-to-SKU candidate matching + mandatory human barcode/SKU confirmation. Clarify in UI & docs that MobileNet uses ImageNet pre-trained weights and requires barcode/human confirmation (not a custom fine-tuned warehouse SKU classifier).
  - Fix `pack-station-web/src/lib/mock/store.ts` so displayed confidence matches the selected candidate rather than `candidates[0]`.

## D06 — COD Bank Statement Import & Matching (`logistics.service.ts`, `finance.controller.ts`)
- **Decision**: Frame bank statement upload accurately as offline CSV/XLSX statement import (not live open-banking API). Fix UTF-8 column headers alongside legacy aliases, sanitize CSV cells against formula injection (`=`, `+`, `-`, `@`), normalize currency decimals, match deterministically on `qrCodeToken` / remittance reference code FIRST (or strict unambiguous single-pending match within bank settlement window), run inside `$transaction`, mark `ambiguous` / `unmatched` explicitly, and never count unmatched rows as `reconciled`.

## D07 — Strict `mock | api` Mode Separation Across All 4 Portals + Mobile Offline Queue
- **Decision**: Enforce `NEXT_PUBLIC_DATA_SOURCE=mock|api` in `admin-portal` (matching `tenant-portal`, `customer-portal`, `pack-station-web`), removing silent network-error fallback to `local-store` when `api` mode is active, surfacing real API errors, synchronizing seed totals cleanly when in `mock` mode, disabling demo role-switch UI in `api` mode, fixing HTTP GET `params` vs `data` bug in reporting portals, implementing pagination/server query forwarding, and hardening React Native `driver-app` (`HomeScreen`, `TripDetailScreen`, `SafetyScreen`, `PODScreen`, `offline-sync.ts` bounded retries + dead-letter queue + exponential backoff).

## D08 — Verification Under Local Build Constraint (`AGENTS.md §1`)
- **Decision**: Because local `npm`/`pnpm`/`npx`/`docker`/`go`/`cargo` execution is prohibited by `AGENTS.md §1`, all runtime unit/integration/Postgres-RLS suites are authored cleanly and executed via GitHub Actions CI (`.github/workflows/ci.yml`), while local verification executes a permanent Python AST/regex static verifier (`scripts/static-verify.py`) checking route parity, TSX/TS/Go/Rust structural invariants, banned patterns (`::uuid` on text IDs, mojibake, `alert()`, hook ordering, missing role guards), and `coverage.csv` integrity. Remote CI Run `43023689371` (commit `75cf1ea`) executed and passed all 6/6 jobs (`static-verify`, `node-workspace`, `ai-worker`, `go-services`, `rust-api`, `postgres-rls`).
