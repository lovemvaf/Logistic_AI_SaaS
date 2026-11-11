# SmartLogi Upgrade Execution Plan (`plan.md`)

**Baseline Commit Reference (Audit 11/11/2026)**: `775ba1ce181191054397cb62bb7430530ce33f81`  
**Execution Date**: 2026-11-11  
**Constraint Scope**: `AGENTS.md` (no local JS/Go/Rust/Docker commands, no dependency/lockfile edits, preserve UI packages & editorial warm-paper design).

## Phases & Dependencies

### Gate G0 — Baseline & Discovery (COMPLETE)
- Verify working tree, `AGENTS.md`, `tmp_check.py`, Prisma schema & RLS migrations, all 4 web portals, `driver-app`, `core-api`, `api-gateway`, `gps-ingestion-service`, `webhook-service`, `ai-worker`, `wms-engine`, `rust-api`.
- Establish `docs/upgrade/{tool-inventory.md,decisions.md,plan.md,coverage.csv,verification.md,handoff.md}`.

### Gate G1 — Security, Multi-Tenancy, Data Integrity & Core Bug Fixes (`SEV0` / `SEV1`)
1. **Shared RBAC (`packages/shared-types`, `backend/core-api/src/core/types/shared-types.ts`)**: Add `@RequireRoles`, `@ExcludeRoles`, `BillingManage`, enforce role decorators before `SUPER_ADMIN` bypass in `PermissionsGuard`.
2. **Core-API Platform/Tenant/Client Isolation & Audit**:
   - Guard all `Admin*` controllers with `@RequireRoles(Roles.SUPER_ADMIN)`; fix `AdminBillingController` ($transaction + overpayment + idempotency + mojibake); fix `AdminDashboardController` (`@CacheKey` bug, `runAsPlatform`, mojibake).
   - Guard internal tenant controllers with `@ExcludeRoles(Roles.CUSTOMER_CLIENT)`; fix `WarehouseOpsController` write permissions & remove `tenantUser.findFirst()`; fix `CodRemittancesController` permissions.
   - Fix `AuditLogInterceptor` missing `tenantId`; enforce strict `tenantId` filter in `TenantAuditLogsController`.
   - Fix `ClientAuthController` swapped arguments (`changePasswordTenantUser`, `getProfileTenantUser`).
   - Add Postgres migration `20261111000000_harden_tenant_rls_and_audit` covering remaining tenant tables (`invoices`, `payment_transactions`, `tenant_api_keys`, `feature_flags`, `tenant_settings`, `api_usage_daily`, `tenant_ui_config`).
3. **Driver IDOR, Validation, Idempotency & Wallet**:
   - Enforce driver ownership checks (`trip.driverId === driver.id` / `delivery.driverId === driver.id`) and state transitions across `UploadController`, `DriverAppController`, `MobileTripsController`.
   - Enforce finite non-negative COD, create `IdempotencyInterceptor` (`X-Sync-Id` cache/dedup), fix `MobileWalletController` balance subtraction (`- remitted`, include `RECONCILED`).
4. **Raw SQL `::uuid` Removal & WMS Invariants (`core-api` + `packages/wms-engine`)**:
   - Remove all 10 `::uuid` casts on string CUID/TEXT IDs.
   - Fix `InventoryService` (`adjustStock` reserved check, `transferStock` allocated invariant, `ReturnsController` single restock).
   - Fix `TasksController.completeTask` allocation clamp & `WavesService` order statuses + real actorId.
   - Fix `packages/wms-engine/src/index.ts` (`allocateWithCapacity` mutable remaining bin weight/volume per item, non-expired FEFO validation, normalized putaway fill ratio, resolved wave bin IDs, safe `requiredQty <= 0` handling compatible with unit specs).
5. **VRP Solver & COD Reconciliation**:
   - Fix `workers/ai-worker/src/lib/vrp.ts` single-customer route drop (`R01`), `stops` off-by-one (`R02`), post-filter route totals, invalid input validation, unassigned reasons (`R03`), distance disclosure (`R04`).
   - Fix `LogisticsService.optimizeRouting` real item weight aggregate & multi-status query (`NEW | PENDING | UNASSIGNED`) + `RoutingProcessor` full result persistence.
   - Fix `LogisticsService.reconcileBankStatement` & `FinanceController` (`R05–R08`): UTF-8 column headers, CSV formula escaping, QR token/reference matching inside `$transaction`, accurate `matched/unmatched/ambiguous` counts.
6. **GPS & Webhook Go/Nest Services**:
   - Harden `backend/gps-ingestion-service/main.go` (`R17–R19`): schema regex, constant-time bearer comparison, UDP HMAC-SHA256 + timestamp + replay cache + explicit legacy flag, per-point batch geofence checks, duplicate SOS cooldown, monotonic `location_updated_at <= $4`, coordinate/speed NaN/bounds validation.
   - Harden `backend/webhook-service/main.go`, `WebhooksController`, `ClientWebhooksController`, `TrackingController`: DNS/IP/redirect SSRF blocking, secret masking on GET & preservation on PUT, constant-time auth compare, HMAC-signed Outbox emission instead of sending raw secret.
7. **Driver Mobile App (`frontend/mobile/driver-app`)**:
   - Fix `HomeScreen.tsx` top-level `await`, `TripDetailScreen.tsx` hook-before-return / `stopId` param / emoji / `alert()`, `SafetyScreen.tsx` NetInfo import / endpoint / fake harsh-brake logger / m/s unit / copy, `PODScreen.tsx` emoji/`console.log`, and `offline-sync.ts` bounded retries, backoff & FormData replay (`R20`).

### Gate G2 — Cross-Portal API Contract Parity & `mock | api` Mode Separation
1. Reconcile all mismatched `/api/v1/*` routes across `core-api`, `api/api-gateway/src/config/services.config.ts`, `tenant-portal`, `customer-portal`, `pack-station-web`, `admin-portal`, and `rust-api` route registry (`R09–R11`, `N51`).
2. Fix Axios GET `data` vs `params`, pagination forwarding in `crud().list()`, `customer-portal` `recordPayment(id, amount)`.
3. Enforce `NEXT_PUBLIC_DATA_SOURCE=mock|api` across `admin-portal` (`local-store.ts`, `role-switch.ts`, pages), fix `audit-logs` double slice & CSV injection, `tenants` pagination Next button & live search, `billing` CSV injection & aligned mock KPI totals (`P14`, `R21`, `N52`).

### Gate G3 — Grounded AI, Pack Vision & UX Polish
1. Wire real `mobilenet.classify(videoRef.current)` in `pack-station-web/src/app/pack/page.tsx` with `>= 0.60` confidence threshold and human SKU confirmation (`P06`, `R12`); fix `pack-station-web/src/lib/mock/store.ts:322` `candidates` index bug (`R13`).
2. Fix `workers/ai-worker/src/lib/llm.ts` model ID typo + prompt-injection delimiters, `routes/compute.ts` honest metadata envelope, remove fake `0.86` accuracy & `POST /v1/train/:type` `200 queued` stub (`501` + `/v1/training-dataset` export) (`P04–P05`, `R22`), align `rust-api/src/routes/ai.rs` mock disclosure (`R23`).

### Gate G4 — Test Suites, CI Pipeline & Documentation Synchronization
1. Author comprehensive Vitest/Jest/Go/SQL test suites covering every `SEV0/SEV1` fix and `PROMPT §I` invariant (`wms-engine`, `ai-worker`, `core-api`, `api-gateway`, `gps-ingestion-service`, `webhook-service`, PostgreSQL RLS isolation test SQL).
2. Create `.github/workflows/ci.yml` and permanent `scripts/static-verify.py`.
3. Author & humanize documentation (`architecture-and-erd.md`, `api-contracts.md`, `operations-runbook.md`, `ai-model-cards.md`, `role-guides.md`, `ho-so-cap-nhat-B3-B4.md`) reconciling all B3 (1–7), B4 (Ch.1–21), Fig.1–23, Table 1–11, and Ref 1–9 without altering the 22/06/2026 signed PDFs.

### Gate G5 — Final Verification, Coverage Update & Vietnamese Summary
1. Run `python -X utf8 scripts/static-verify.py` (recording verbatim output in `verification.md`).
2. Update `docs/upgrade/{coverage.csv,verification.md,handoff.md}` to exact final post-edit state (`no` hardcoded 100% pass where Docker/Node/Go CI execution is blocked locally).
3. Deliver concise Vietnamese summary report (`L.8`) with clickable `file:///` links.
