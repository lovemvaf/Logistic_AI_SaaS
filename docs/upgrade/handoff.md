# Handoff & Checkpoint Log (`handoff.md`)

**Timestamp**: 2026-11-12  
**Baseline Commit (11/11 Audit)**: `775ba1ce181191054397cb62bb7430530ce33f81` (G5 baseline `75cf1ea`, Run `43023689371`)  
**Verified Code & Deployment Commit (`CI 6/6 PASSED`)**: `4840cce` (GitHub Actions Run [`43069842957`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43069842957))  
**Repository**: [`https://github.com/lovemvaf/Logistic_AI_SaaS`](https://github.com/lovemvaf/Logistic_AI_SaaS) (nhánh thực thi `feat/smartlogi-enterprise-2026`; nhánh `main` giữ nguyên cổng bảo vệ chờ hạ tầng backend công khai)  
**Current Gate**: `G7` Complete — Enterprise Implementation, Local Full-Stack E2E (`12/12`), CI (`6/6`), 4-Project Vercel `visionary19` Previews (`READY`), Static Verification (`8/8`, `0` Errors) & Full Doc Sync

---

## 1. Completed Scope (`G0–G7`)

- **Gate `G1`–`G2` — Baseline RBAC, Multi-Tenancy, Core Bugs & `mock | api` Separation (`75cf1ea`)**:
  - Enforced `@RequireRoles` / `@ExcludeRoles` in `PermissionsGuard`, isolated `Admin*` routes to `SUPER_ADMIN`, excluded `CUSTOMER_CLIENT` from internal tenant endpoints, removed all `10` SQL `::uuid` casts, hardened WMS FIFO/FEFO/cumulative bin allocations & COD CSV/XLSX `qrCodeToken` `$transaction` reconciliation, hardened GPS/Webhook Go & `driver-app` React Native crashers, aligned `/api/v1/*` contract parity & strict `NEXT_PUBLIC_DATA_SOURCE=mock|api` across all 4 portals.
- **Gate `G3` — Enterprise P0/P1 Security & Reliability Hardening (`dd4bdaf`)**:
  - Upgraded Outbox dispatcher (`leaseUntil`, `lockedBy`, `payloadHash`, `DEAD_LETTER` reclaim + redrive, `emitAsync`, `EventConsumptionLedger`), DB-backed `ApiIdempotencyRecord` (`body_sha256` HTTP `409`), Go GPS canonical v2 UDP HMAC (`GPS_UDP_HMAC_SECRET`, FIFO replay guard) & Webhook Redis Streams (`XREADGROUP`/`XAUTOCLAIM`/DLQ + IP-pinned `DialContext` SSRF defense + removed `/api/v1/inbound/webhooks` from `PUBLIC_PATHS`), `helmet()` + CORS idempotency headers, CSPRNG + pre-flight `SYNCING` offline sync, `PublicTrackingGrant` + coarse anonymous GPS, and Node 22 LTS upgrade.
- **Gate `G4` — TP Đồng Nai 2026 Geography, 3PL Freight/Container/Yard, DEM/DET, XNK Trade & AI Worker (`52a8c15`)**:
  - Deployed `7` Prisma migrations totaling **`104` models** and **`88/106`** PostgreSQL public tables under `ENABLE + FORCE ROW LEVEL SECURITY` (`18` shared/platform tables).
  - Implemented `geography` (`95` units = `33W+62C`, `PENDING_OFFICIAL_CODE`, `NO_OFFICIAL_POLYGON`, `outsideCity` Cát Lái & Cái Mép, `19` aliases, `4` corridors across `NORTH`/`CENTRAL`/`SOUTH`, `10` facilities), `freight` (`TractorUnit`, `ChassisUnit`, `ContainerEquipment` ISO 6346, overlap conflict `409`, `FreightBooking`, `FreightShipment`, `FreightLeg`), `yard` (`Yard`, `YardSlot`, `ContainerGateEvent`, `EquipmentInterchangeReceipt`), `pricing` (`FreightRFQ`, `FreightQuote`, `QuoteLine`, `ContractRate`, separate `DemDetRule` DEM vs DET slabs, `FreightInvoice`, `FreightLedgerEntry`, `PaymentAllocation`, `DisputeCase`), `trade` (`TradeDocument`, `TradeDocumentVersion`, `CustomsDeclaration`, `CustomsStatusEvent`, `HSCodeSuggestion`), and `PublicTrackingGrant` (`/public/t/:token`), bringing `core-api` to **`11` modules / `77` controller files / `85` `@Controller` / `488` endpoint decorators** and **`50` permissions**.
  - Added `/v1/routing/containers`, prompt-injection-hardened `/v1/trade-documents/{extract,reconcile}` (`422 FAILED_PASSWORD_PROTECTED`), `/v1/hs-code/suggest` (`NEEDS_CUSTOMS_REVIEW`), `tests/enterprise.test.ts` (`48/48` total AI Worker assertions across `5` suites), and `workers/ai-worker/tests/benchmark-dongnai.ts`.
- **Gate `G5`–`G6` — 4-Portal Enterprise UI (`91` Pages), Demo DB Seed, Local E2E, CI & Vercel `visionary19` (`af259cc`, `018adb9`, `4840cce`)**:
  - Built enterprise UI screens across `91` Next.js 15 pages (`admin-portal` 18, `tenant-portal` 53, `customer-portal` 14, `pack-station-web` 6) + `10` Expo/RN `driver-app` screens, with strict `VERCEL=1` `next.config.*` and `vercel-build` scripts.
  - Authored deterministic `db:seed:demo`, `demo:reset`, `demo:verify` refusing `NODE_ENV=production` and unallowlisted DB hosts; verified S1–S12 invariants end-to-end via Playwright (`12/12` scenarios in `57.29s`, `0` errors, `0` overflow) and `verify-deployment.mjs` (`23/23` local + `4/4` Vercel Preview SSR).
  - Linked & deployed 4 independent Vercel projects on team `visionary19` (`team_T6s3oJUmrj5hwTjwgDszZMP2`) with `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`) verified untouched (`updatedAt=1792953414661`):
    - `smartlogi-admin` (`prj_wbGhEWOdUz0khF8S0cqWIeFKZfhi`): `https://smartlogi-admin-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app`
    - `smartlogi-tenant` (`prj_fvHuOLZqucpjnVzRVhsCDw78uzyS`): `https://smartlogi-tenant-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app`
    - `smartlogi-customer` (`prj_eSQvpGluaOMQZhioj6dLFVY5jSMq`): `https://smartlogi-customer-git-feat-smartlogi-enterp-b5189a-visionary19.vercel.app`
    - `smartlogi-pack` (`prj_DkRnjpLl146dbdt3Gmf7rZvtrxl9`): `https://smartlogi-pack-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app`
  - Verified GitHub Actions CI Run [`43069842957`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43069842957) (`6/6` jobs PASSED on `4840cce`).
- **Gate `G7` — Documentation, B3–B4 Dossier & CI Suite Expansion**:
  - Synchronized all operational docs, deployment runbooks, B3–B4 addendum (`docs/ho-so-cap-nhat-B3-B4.md` preserving `22/06/2026` B3 signature), `enterprise-execution-matrix.csv`, and `coverage.csv` (`173` IDs); added `enterprise.test.ts` to `.github/workflows/ci.yml` and 5 new tests to `scripts/static-verify.py` (`8/8` PASS, `0` errors).

---

## 2. Residual Blockers & Pre-Pilot Scope (`[BLOCKED]` / `[CHƯA ĐO PILOT]`)

1. **Public Backend Hosting (`API_INTERNAL_URL`) & Cloudflare Prod Deploy (`[BLOCKED]`)**: No cloud hosting credentials/tokens exist on the dev workstation for Fly.io/Railway/Render/VPS (Postgres/PostGIS + Redis `>= 5.0` + `core-api` + `api-gateway` + Go GPS/Webhook) or `CLOUDFLARE_API_TOKEN`. Until the public HTTPS `api-gateway` URL is configured into `API_INTERNAL_URL` on Vercel (`production`/`preview`), Vercel Previews verify SSR (`--skip-proxy`) cleanly while live `/api/v1/*` proxying remains `[BLOCKED]` (and PR merge into `main` stays gated).
2. **Database Role & Secrets Provisioning**: In staging/production PostgreSQL, create runtime non-superuser role `smartlogi_app` (`NOSUPERUSER NOBYPASSRLS`) and rotate all secrets (`JWT_SECRET`, `GPS_UDP_HMAC_SECRET`, `GPS_AUTH_TOKEN`, `WEBHOOK_AUTH_TOKEN`, `AI_API_KEY`, Stripe/SendGrid/Twilio/FCM). Keep `GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED=false` and `ALLOW_DEMO_SEED` unset/false on production.
3. **Unmeasured AI/CV & Pilot Field Metrics (`[CHƯA ĐO PILOT]`)**: Forecast MAE/RMSE, VRP gap vs OR-Tools on real routes, MobileNet warehouse confusion matrix, physical Expo EAS Android/iOS / RS-232 Web Serial hardware runs, and 12-week Pilot KPIs remain unmeasured until field trial telemetry is captured.
4. **Academic Reference Print Fixes**: Resolve `REF-04` (Crossref HTTP 404) and `REF-06` (Crossref HTTP 429) primary sources plus exact page numbers for `REF-01`/`REF-03` before binding the final printed B4 dossier.
5. **External / Out-of-Scope Components**: Direct Open Banking feeds, live OSRM road-traffic routing, offline bulk ML training (`POST /v1/train/:type` `501`), and full `backend/rust-api` business logic (`501` stubs) remain outside current production scope.
