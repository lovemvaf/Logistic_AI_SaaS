# Handoff & Checkpoint Log (`handoff.md`)

**Timestamp**: 2026-11-11  
**Baseline Commit**: `775ba1ce181191054397cb62bb7430530ce33f81`  
**Current Gate**: `G5` Complete (Static Verification Passed `0` Errors; CI Runtime Jobs Queued as `needs_ci_run`)

---

## 1. Completed Scope (`G0–G5`)

- **Gate `G1` — Security, Multi-Tenancy, Data Integrity & Core Bug Fixes**:
  - `packages/shared-types` & `backend/core-api`: Enforced `@RequireRoles` / `@ExcludeRoles` in `PermissionsGuard` prior to `SUPER_ADMIN` bypass, added `BillingManage`, isolated all `Admin*` routes to `SUPER_ADMIN`, excluded `CUSTOMER_CLIENT` from internal tenant modules, fixed `AuditLogInterceptor` `tenantId` persistence & `TenantAuditLogsController` cross-tenant filtering, fixed `ClientAuthController` argument ordering, enforced driver resource ownership + COD validation + forward transitions, fixed `MobileWalletController` balance arithmetic, removed all `10` SQL `::uuid` casts, hardened `InventoryService` & `TasksController` & `WavesService` & `ReturnsController`, fixed `packages/wms-engine` cumulative bin capacity & normalized putaway (`kg` + `cbm`), fixed VRP 1-customer route drop & `stops` off-by-one & weight aggregation, and hardened COD bank CSV/XLSX reconciliation (`qrCodeToken`/reference first inside `$transaction`, settlement window, accurate `matched/unmatched/ambiguous` counts, CWE-1236 CSV sanitization).
  - `packages/prisma-schemas`: Added `packages/prisma-schemas/prisma/migrations/20261111000000_harden_tenant_rls_and_audit/migration.sql` bringing total `ENABLE`/`FORCE ROW LEVEL SECURITY` coverage to **58/66** tables + added `packages/prisma-schemas/prisma/tests/tenant-isolation.sql`.
  - Go services: Hardened `backend/gps-ingestion-service` (`ConstantTimeCompare` Bearer, UDP HMAC-SHA256 + timestamp + replay cache, per-point batch `ST_Contains`, SOS 5-minute cooldown, `NULL` empty `tripId`) and `backend/webhook-service` + `TrackingController` (DNS/private/loopback/metadata SSRF blocking, masked `secretToken` on `GET` & preservation on `PUT`).
  - Mobile: Fixed `frontend/mobile/driver-app` crashers (`HomeScreen` top-level await, `TripDetailScreen` hooks ordering & `stopId`, `SafetyScreen` NetInfo & `m/s` copy, `PODScreen`, `ExpenseScreen`, `RemittanceScreen`), bounded retries + `DEAD_LETTER` + exponential backoff in `offline-sync.ts`, and `X-Sync-Id` idempotency in `backend/core-api/src/core/http/idempotency.interceptor.ts`.
- **Gate `G2` — Contract Parity & `mock | api` Mode Separation**:
  - Aligned `api/api-gateway/src/config/services.config.ts`, Core API portal alias controllers (`iam-portal-aliases`, `orders-portal-aliases`, `logistics-portal-aliases`, `wms-portal-aliases`, `client-portal`), and portal adapters (fixed Axios GET `params` vs `data`, `crud().list()` filtering, `customer-portal` `recordPayment(id, amount)`).
  - Enforced strict `NEXT_PUBLIC_DATA_SOURCE=mock|api` separation inside `frontend/feature-test/admin-portal` (removed silent `local-store` error fallback, disabled role-switch in `api` mode, fixed audit-logs double pagination slice & CSV injection, fixed tenant search/pagination Next cap).
- **Gate `G3` — Grounded AI, Pack Vision & Honest Capabilities**:
  - Connected real `mobilenet.classify(videoRef.current, 5)` inside `frontend/reporting/pack-station-web/src/app/pack/page.tsx` with `CV_CONFIDENCE_THRESHOLD = 0.6` (`cv-mapper.ts`) + human barcode confirmation, fixed `store.ts` confidence index bug, and disclosed ImageNet vs custom SKU scope.
  - Fixed `workers/ai-worker` LLM model typo (`@cf/meta/llama-3.1-8b-instruct-fast`), added prompt-injection `wrapUntrustedData` delimiters, replaced `POST /v1/train/:type` `200 queued` stub with HTTP `501 TRAINING_NOT_IMPLEMENTED` + `/v1/training-dataset` export (`human_corrected IS NOT NULL`), removed `0.86` accuracy seed & UI `+0.02` bump, exposed `data_sufficiency` / `evaluation_status: "unmeasured"`, and disclosed `backend/rust-api` as experimental parity scaffold.
- **Gate `G4` — Tests, CI & Traceability Documentation**:
  - Created/expanded `15` automated test suites across Jest, `tsx`, Go `testing`, and PostgreSQL SQL (`needs_ci_run`).
  - Authored `.github/workflows/ci.yml` (`6` CI jobs) and `scripts/static-verify.py` (`8` check groups).
  - Updated root docs (`docs/README.md`, `docs/Chi_Tiet_Kien_Truc_Va_Chuc_Nang.md`, `docs/Tien_Do_Va_Do_Hoan_Thien_Chi_Tiet.md` preserving 06/09/2026 history cleanly) and created `docs/architecture-and-erd.md`, `docs/api-contracts.md`, `docs/operations-runbook.md`, `docs/ai-model-cards.md`, `docs/role-guides.md`, and `docs/ho-so-cap-nhat-B3-B4.md` (covering all `B3-01..07`, `B4-COVER`, `B4-CH01..21`, `FIG-01..23`, `TBL-01..11`, `REF-01..09` while preserving original `22/06/2026` B3 signature).
- **Gate `G5` — Traceability & Final Static Audit**:
  - Expanded `docs/upgrade/coverage.csv` to **173 individual tracked IDs** with verified file paths and honest status/blocker attribution.
  - Ran full `python -X utf8 scripts/static-verify.py` (`8/8` checks PASS, `0` errors).

---

## 2. Residual Limitations & Pre-Pilot Blockers

1. **CI Execution Required (`needs_ci_run`)**: Push branch to GitHub Actions (or run self-hosted Docker/Node/Go/Rust/PostgreSQL runner) to execute all 6 jobs in `.github/workflows/ci.yml` (`node-workspace`, `ai-worker`, `go-services`, `rust-api`, `postgres-rls`, `static-verify`).
2. **Database Role & Secrets Provisioning**: In staging/production PostgreSQL, create runtime non-superuser role `smartlogi_app` (`NOSUPERUSER NOBYPASSRLS`) and rotate all secrets (`JWT_SECRET`, `GPS_UDP_HMAC_SECRET`, `GPS_AUTH_TOKEN`, `AI_API_KEY`, Stripe/SendGrid/Twilio/FCM). Keep `GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED=false`.
3. **Unmeasured AI/CV & Pilot Field Metrics (`[CHƯA ĐO PILOT]`)**: Forecast MAE/RMSE, VRP gap vs OR-Tools on real routes, MobileNet warehouse confusion matrix, and 12-week Pilot KPIs (picking/packing time, `< 0.5%` pack error, `120 km/day`, COD reconciliation time) remain hypothetical targets until the 12-week Pilot captures baseline & post-intervention telemetry.
4. **Academic Reference Print Fixes**: Resolve `REF-04` (Crossref HTTP 404) and `REF-06` (Crossref HTTP 429) primary sources plus exact page numbers for `REF-01`/`REF-03` before binding the final printed B4 dossier.
5. **External / Hardware Scope**: Direct Open Banking feeds, live OSRM road-traffic routing, container yard (`CY`) modeling, and `backend/rust-api` full business logic (`501` stubs) remain out of current production scope.
