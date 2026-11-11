# SmartLogi Upgrade & Enterprise Completion Plan (`plan.md`)

**Baseline Commit Reference (Audit 11/11/2026)**: `775ba1ce181191054397cb62bb7430530ce33f81` (G5 CI `75cf1ea`)  
**Verified Enterprise Release Branch**: `feat/smartlogi-enterprise-2026` (CI `6/6` PASSED at `4840cce` + Gate G7 doc sync)  
**Constraint Scope**: Zero force-push, zero leaked secrets, zero production demo seed, preserve UI warm-paper editorial design & untouched `visionary-platform` on Vercel `visionary19`.

## Phases & Dependencies (All Internal Code/Docs/Local/CI/Preview Gates `G0–G7` COMPLETE)

### Gate G0 — Baseline & Discovery (COMPLETE)
- Verify working tree, `AGENTS.md`, Prisma schema & RLS migrations, all 4 web portals, `driver-app`, `core-api`, `api-gateway`, `gps-ingestion-service`, `webhook-service`, `ai-worker`, `wms-engine`, `rust-api`, and Vercel CLI team access (`visionary19`).

### Gate G1 — Security, Multi-Tenancy, Data Integrity & Core Bug Fixes (`COMPLETE`)
- Shared RBAC (`@RequireRoles`, `@ExcludeRoles`, `BillingManage`), `Admin*` `SUPER_ADMIN` isolation, `CUSTOMER_CLIENT` exclusion across internal tenant controllers, `AuditLogInterceptor` `tenantId`, `ClientAuthController` fixes, driver IDOR & ownership checks, zero SQL `::uuid` casts, WMS concurrency + cumulative capacity + normalized putaway, VRP 1-customer route/stops/weights, COD CSV/XLSX `qrCodeToken` `$transaction` reconciliation, GPS/Webhook Go hardening, mobile crashers & `offline-sync` `DEAD_LETTER`.

### Gate G2 — Cross-Portal API Contract Parity & `mock | api` Mode Separation (`COMPLETE`)
- Reconcile `/api/v1/*` routes across portals, `api-gateway`, `core-api` alias controllers, Axios GET `params`, `crud().list()` filtering, `recordPayment(id, amount)`, and strict `NEXT_PUBLIC_DATA_SOURCE=mock|api` separation across all 4 portals.

### Gate G3 — Grounded AI, Pack Vision & P0/P1 Reliability Hardening (`COMPLETE`, `dd4bdaf`)
- Live `mobilenet.classify(videoRef.current)` (`>= 0.60`) + human barcode confirmation, `workers/ai-worker` LLM ID fix + `wrapUntrustedData` + HTTP `501` train stub + `/v1/training-dataset` export.
- Deep hardening migration `20261111120000_hardening_outbox_idempotency_rls`, Outbox lease reclaim & Kafka `emitAsync` + `EventConsumptionLedger`, PostgreSQL `ApiIdempotencyRecord` `409`, Go GPS canonical v2 UDP HMAC + `GPS_UDP_HMAC_SECRET`, Go Webhook Redis Streams (`XGROUP`/`XACK`/`XCLAIM`/DLQ) + IP-pinned `DialContext` SSRF + remove `/api/v1/inbound/webhooks` from `PUBLIC_PATHS`, `helmet()`, CSPRNG offline-sync + pre-flight `SYNCING`, `PublicTrackingGrant`, Node 22 LTS upgrade.

### Gate G4 — Enterprise Logistics Expansion & TP Đồng Nai 2026 (`COMPLETE`, `52a8c15`)
- Migration `20261112000000_enterprise_dongnai_freight_yard_xnk` (`104` Prisma models, `88/106` PG `FORCE RLS`), `geography` (`95` TP Đồng Nai 2026 units `33W+62C`, `PENDING_OFFICIAL_CODE`, `NO_OFFICIAL_POLYGON`, `outsideCity` Cát Lái & Cái Mép), `freight` (Tractor/Chassis/Container ISO 6346, overlap `409`), `yard` (YardSlot/Gate/EIR), `pricing` (RFQ/Quote/Booking/DEM vs DET/FreightInvoice/Disputes), `trade` (TradeDocument/Customs/HS `NEEDS_CUSTOMS_REVIEW`), AI Worker container drayage & doc/HS routes + `benchmark-dongnai.ts`.

### Gate G5 — 4-Portal Enterprise UI (`91` Pages) & Integrated Demo Seed (`COMPLETE`, `af259cc`)
- Deliver cohesive enterprise screens across `admin-portal` (18), `tenant-portal` (53), `customer-portal` (14), `pack-station-web` (6), plus deterministic `db:seed:demo`, `demo:reset`, `demo:verify` refusing `NODE_ENV=production`.

### Gate G6 — Full-Stack E2E, CI Builds & 4-Project Vercel `visionary19` Deployment (`COMPLETE`, `018adb9` -> `4840cce`)
- Local Playwright S1–S12 (`12/12` in `57.29s`), `verify-deployment.mjs` (`23/23` local, `4/4` Vercel Preview SSR), CI Run `43069842957` (`6/6` jobs PASS incl. `4x next build` & Go `-race`), 4 Vercel projects (`smartlogi-admin`, `smartlogi-tenant`, `smartlogi-customer`, `smartlogi-pack`) `READY` on `visionary19`, `visionary-platform` untouched. Live public `API_INTERNAL_URL` & `CLOUDFLARE_API_TOKEN` recorded `[BLOCKED]`.

### Gate G7 — Documentation, B3–B4 Addendum & Final Static/CI Verification (`COMPLETE`)
- Synchronize root docs, 6 technical manuals, `docs/ho-so-cap-nhat-B3-B4.md` (preserving `22/06/2026` B3 signature), `docs/deployment/*`, and `docs/upgrade/*` (`173` IDs in `coverage.csv`); wire `enterprise.test.ts` into `.github/workflows/ci.yml`; run `python -X utf8 scripts/static-verify.py` (`8/8`, `0` errors), push, verify final CI & Vercel Preview state, and deliver Vietnamese handover report.
