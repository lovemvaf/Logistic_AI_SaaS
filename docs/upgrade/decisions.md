# Architectural & Engineering Decisions (`decisions.md`)

Updated: 2026-11-12 (Gate G7)

## D01 — Runtime Backend Architecture (As-Is Modular Monolith + Specialized Services)
- **Decision**: Keep `backend/core-api` (NestJS modular monolith serving `/api/v1/*`, expanded in G4 to `11` modules / `77` controller files / `85` `@Controller` / `488` endpoint decorators), `api/api-gateway` (NestJS BFF/proxy with `helmet()`), `backend/gps-ingestion-service` (Go UDP + HTTP), `backend/webhook-service` (Go HTTP + Redis Streams + IP-pinned dialer), and `workers/ai-worker` (Hono/Cloudflare Worker) as the active runtime architecture.
- **Rejected**: Reverting to legacy split microservices (`services/*`), claiming Kong API Gateway is deployed, or replacing `core-api` with `backend/rust-api` (`rust-api` contains unimplemented `501` endpoints and deterministic stub AI).
- **Evidence**: `backend/core-api/src/app.module.ts`, `api/api-gateway/src/config/services.config.ts`, `backend/rust-api/crates/api/src/routes/{meta,ai}.rs`.

## D02 — Database Isolation Strategy (Shared Schema + Prisma ALS Transaction + PostgreSQL Force RLS + Schema Defense)
- **Decision**: Retain PostgreSQL + PostGIS with AsyncLocalStorage (`TenantSchemaInterceptor`) opening a per-request transaction setting both `SET LOCAL search_path` and transaction-local GUC `set_config('app.tenant_id', ..., true)` enforced by `FORCE ROW LEVEL SECURITY`. Applied two enterprise hardening/expansion migrations (`20261111120000_hardening_outbox_idempotency_rls` and `20261112000000_enterprise_dongnai_freight_yard_xnk`) bringing schema to `7` migrations, **`104` Prisma models**, and **`88/106`** PostgreSQL public tables under `ENABLE + FORCE ROW LEVEL SECURITY` (`18` shared/platform tables).
- **Rejected**: Reverting to NestJS `Scope.REQUEST` injection or relying purely on middleware without DB-level RLS.

## D03 — RBAC & Cross-Role Boundary Enforcement (`shared-types` -> `core-api`)
- **Decision**: Add explicit `@RequireRoles(...)` and `@ExcludeRoles(...)` decorators evaluated inside `PermissionsGuard` **before** permission matching or `SUPER_ADMIN` bypass, plus `BillingManage` and Enterprise `3PL`/`Yard`/`XNK`/`Geo`/`Pricing` permissions (`50` permission strings total).
  - All `admin/*` controllers require `Roles.SUPER_ADMIN`.
  - All internal tenant controllers (`OrdersController`, `ReturnsController`, `WarehouseOpsController`, `CodRemittancesController`, `Geography*`, `FreightController`, `YardController`, `PricingController`, `TradeController`, etc.) explicitly exclude `Roles.CUSTOMER_CLIENT`.
  - Driver mobile/POD/check-in/stop endpoints verify resource ownership (`trip.driverId === driver.id` or `delivery.driverId === driver.id`) and enforce explicit forward state transitions.
- **Rejected**: Relying solely on permission strings shared across platform, tenant, and customer roles.

## D04 — VRP, Container Drayage & Distance Source (`workers/ai-worker`)
- **Decision**: Fix TypeScript nearest-neighbour + 2-opt CVRP solver cleanly and extend it with `/v1/routing/containers` (`solveContainerDrayage`) enforcing ISO 6346 validation, container/chassis size & weight coupling, empty/loaded turnaround constraints, and Đồng Nai / Cát Lái / Cái Mép corridor inputs. Disclose `distance_source: "haversine_circuity_1.41"` in solver metadata.
- **Rejected**: Introducing Python OR-Tools into Node/Worker runtime or falsely labeling Euclidean*1.41 routes as live road/traffic distances.

## D05 — AI Grounding, Trade Document/HS Advisory, Pack Vision & Honest Capability Disclosure
- **Decision**:
  - Fix Cloudflare Workers AI typo (`@cf/meta/llama-3.1-8b-instruct-fast`), add untrusted-note XML delimiters (`wrapUntrustedData`) across LLM & Trade Doc routes against prompt injection, expose deterministic fallback metadata (`method`, `model_version`, `fallback_used`, `data_sufficiency`, `uncertainty`), remove fabricated `0.86` accuracy seed, replace fake `POST /v1/train/:type` success with HTTP `501` (`TRAINING_NOT_IMPLEMENTED`) + `/v1/training-dataset` export for human-reviewed corrections.
  - Enforce HTTP `422 FAILED_PASSWORD_PROTECTED` on encrypted trade PDFs and `NEEDS_CUSTOMS_REVIEW` (`advisoryOnly: true`, `requiresHumanReview: true`) on HS Code suggestions.
  - Connect real `mobilenet.classify(videoRef.current)` frame classification in `pack-station-web/src/app/pack/page.tsx` with `>= 0.60` confidence gate, ImageNet label-to-SKU candidate matching + mandatory human barcode/SKU confirmation, and fix `candidates[0]` confidence index bug in `store.ts`.

## D06 — COD Bank Statement Import & Matching (`logistics.service.ts`, `finance.controller.ts`)
- **Decision**: Frame bank statement upload accurately as offline CSV/XLSX statement import (not live open-banking API). Fix UTF-8 column headers alongside legacy aliases, sanitize CSV cells against formula injection (`=`, `+`, `-`, `@`), normalize currency decimals, match deterministically on `qrCodeToken` / remittance reference code FIRST inside `$transaction`, mark `ambiguous` / `unmatched` explicitly, and never count unmatched rows as `reconciled`.

## D07 — Strict `mock | api` Mode Separation Across All 4 Portals + Mobile Offline Queue + Vercel Deployment
- **Decision**: Enforce `NEXT_PUBLIC_DATA_SOURCE=mock|api` across all 4 portals (never fall back silently to mock on API error), gate `next.config.*` `output: 'standalone'` and `/api/v1/:path*` rewrites cleanly for `VERCEL=1`, ship `vercel-build` scripts across all `91` pages, build idempotent `db:seed:demo` / `demo:reset` / `demo:verify` refusing `NODE_ENV=production`, and harden React Native `driver-app` (`CSPRNG` + pre-flight `SYNCING` checkpoint + bounded `DEAD_LETTER` retries).

## D08 — Verification Under Hybrid Local + CI + Vercel Preview Model
- **Decision**: Execute PostgreSQL 18.1 + PostGIS 3.6 + Redis + NestJS + `wrangler dev --local` + 4 Next.js 15 portals locally for full-stack integration, Jest (`12` suites / `114` tests), AI Worker `tsx` (`5` suites / `48` assertions), Playwright E2E S1–S12 (`12/12`), and `scripts/static-verify.py` (`8/8`, `0` errors), while executing Go `-race` (`19` tests), Rust `cargo test` (`8` tests), `postgis:15-3.3` RLS + `demo:verify`, and clean Linux `4x next build` automatically on GitHub Actions (`Run 43069842957` `6/6` PASSED) and SSR verification on Vercel `visionary19` Preview deployments (`4/4` PASS; `visionary-platform` untouched).
