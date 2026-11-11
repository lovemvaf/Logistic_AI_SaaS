# Nhật ký Bằng chứng Triển khai & Kiểm chứng (`DEPLOYMENT_EVIDENCE.md`)

Tài liệu ghi nhận bằng chứng kiểm chứng thực tế cho **Gate G6–G7** trên nhánh `feat/smartlogi-enterprise-2026` (mốc mã nguồn CI đầy đủ gần nhất trước đồng bộ tài liệu G7: commit `4840cce`), phân tách rạch ròi giữa kiểm thử full-stack cục bộ (`[TESTED_LOCAL]`), GitHub Actions CI (`[CI]`), 4 dự án Vercel Preview (`visionary19`), và các hạng mục bị chặn do thiếu hạ tầng/secrets bên ngoài (`[BLOCKED]`) hoặc chưa chạy thực địa (`[CHƯA ĐO PILOT]`).

---

## 1. Kiểm chứng Stack Cục bộ Đầy đủ (`[TESTED_LOCAL]` / E2E S1–S12)

Môi trường kiểm thử thực thi trên máy phát triển gồm PostgreSQL 18.1 + PostGIS 3.6 (`127.0.0.1:5432`, role ứng dụng non-superuser `smartlogi_app` dưới `ENABLE` + `FORCE ROW LEVEL SECURITY`), Redis (`127.0.0.1:6379`), Cloudflare `ai-worker` (`wrangler dev --local` tại `:8787`), `core-api` (`:3001`), `api-gateway` (`:3000`) và 4 cổng Next.js 15 dựng ở chế độ `NEXT_PUBLIC_DATA_SOURCE=api` qua same-origin rewrite:

| Bộ kiểm thử | Lệnh thực thi | Kết quả đo thực tế |
|---|---|---|
| Seed & Integrity Check | `pnpm demo:reset && pnpm db:seed:demo && pnpm demo:verify` | **PASS** — `4` tenants (`1` suspended), `95` ĐVHC TP Đồng Nai 2026 (`33W/62C`, `0` non-pending code, `0` non-no-polygon), `19` aliases, `10` facilities, `4` corridors (`NORTH`/`CENTRAL`/`SOUTH`), `3` road restrictions, `230` orders, `9` containers, `18` yard slots, `6` quotes, `3` customs reviews, `3` DLQ outbox, `12` tracking grants, `3` customer users |
| PostgreSQL `FORCE RLS` Audit | Truy vấn `pg_class` + `tenant-isolation.sql` | **PASS** — **`88/106`** bảng công khai bật `ENABLE` + `FORCE ROW LEVEL SECURITY`; `18` bảng còn lại là `8` bảng platform/outbox + `8` bảng địa giới/hạ tầng dùng chung TP Đồng Nai 2026 + `_prisma_migrations` & `spatial_ref_sys` |
| Static Invariant Verifier | `python -X utf8 scripts/static-verify.py` | **PASS (`8/8`, `0` errors)** — RBAC, zero `::uuid`, RLS migration, Gateway–Portal parity, CWE-1236 CSV, AI/Go/Rust invariants, docs & `coverage.csv` (`173` IDs) |
| Workspace Jest Suites | `jest` (`wms-engine`, `api-gateway`, `core-api --runInBand`) | **PASS (`12/12` suites, `114/114` tests)**: `wms-engine` `21/21`, `api-gateway` `11/11` (`3` suites), `core-api` `82/82` (`8` suites: `rbac-boundary`, `tenant-isolation`, `cod-reconcile`, `wms-concurrency`, `outbox-dispatcher`, `idempotency`, `freight-trade-geo`, `dem-det-equipment`) |
| AI Worker Suites | `npx tsx tests/{llm,journey,vrp,compute,enterprise}.test.ts` | **PASS (`5/5` suites, `48/48` assertions)**: `llm` 13, `journey` 7, `vrp` 10, `compute` 12, `enterprise` 6 (`solveContainerDrayage`, extract `422 FAILED_PASSWORD_PROTECTED`, reconcile, `hs-code NEEDS_CUSTOMS_REVIEW`) |
| Cross-Portal Deployment Verifier (Local) | [`scripts/verify-deployment.mjs`](../../scripts/verify-deployment.mjs) | **PASS (`23/23`)** — `gateway` (`/health`, `/api/v1/health`, `401` fail-closed `/orders` & `/admin/tenants`, `404` public track), `ai-worker` (`/health`, `501` `/ai/v1/train/demand`), và 4 portals (SSR HTTP 200 + proxy `/api/v1/*`) |
| Playwright Enterprise E2E + UI | [`tests/e2e/verify_s1_s12.py`](../../tests/e2e/verify_s1_s12.py) | **PASS (`12/12` scenarios in `57.29s`)** — 0 console/pageerrors, 0 HTTP 5xx, **0 responsive overflow warnings** trên Desktop/Tablet/Mobile |
| 4-Portal Vercel Simulation Build | `VERCEL=1 NEXT_PUBLIC_DATA_SOURCE=api pnpm run vercel-build` | **PASS (`4/4`)** trên [`admin-portal`](../../frontend/feature-test/admin-portal), [`tenant-portal`](../../frontend/reporting/tenant-portal), [`customer-portal`](../../frontend/reporting/customer-portal), [`pack-station-web`](../../frontend/reporting/pack-station-web) |

*(Lưu ý môi trường dev Windows cục bộ: Redis Windows trên máy là phiên bản `3.0.504` nên BullMQ v5 xuất cảnh báo khuyến nghị Redis `>= 5.0.0`; môi trường Docker & CI dùng `redis:7-alpine`.)*

---

## 2. GitHub Actions CI & Go `-race` / Rust / Postgres-RLS (`[CI]`)

- **Run baseline Gate G0–G5**: [Run `43023689371`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43023689371) trên commit `75cf1ea` (**6/6 jobs PASSED**).
- **Run Enterprise & Deployment (`4840cce`)**: [Run `43069842957`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43069842957) trên nhánh `feat/smartlogi-enterprise-2026` — **6/6 jobs PASSED**:
  1. `Static Invariant Verification`: `completed -> success`
  2. `Node Workspace Build, Typecheck & Jest`: `completed -> success` (gồm build `7` internal packages + `prisma generate` + `12` Jest suites + `tsc --noEmit` + `next typegen` + **build toàn bộ 4 Next.js 15 portals ở API mode**)
  3. `Go Services Vet & Race Tests`: `completed -> success` (`19` test functions `-race`: `6` trong `backend/gps-ingestion-service/main_test.go`, `13` trong `backend/webhook-service/main_test.go`)
  4. `PostgreSQL Migrations & RLS Isolation Suite`: `completed -> success` (`postgis/postgis:15-3.3`, `7` migrations, `tenant-isolation.sql`, `demo:reset -> db:seed:demo -> demo:verify -> demo:reset`)
  5. `Cloudflare AI Worker Typecheck & Tests`: `completed -> success` (`4840cce` chạy `llm`, `journey`, `vrp`, `compute`; đợt đẩy G7 bổ sung thêm `npx tsx tests/enterprise.test.ts` vào [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) để CI chạy đủ cả 5 suite)
  6. `Rust API Parity Workspace Check & Tests`: `completed -> success` (`cargo check --workspace --all-targets` + `8` `#[test]` unit tests)

---

## 3. Triển khai 4 Dự án Vercel Team `visionary19`

- **Team mục tiêu**: `visionary19` (`team_T6s3oJUmrj5hwTjwgDszZMP2`, gói `hobby`)
- **Dự án hiện hữu cần bảo vệ**: `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`) — **đã xác minh qua Vercel API `updatedAt=1792953414661` giữ nguyên hoàn toàn không chạm tới**.
- **Trạng thái 4 dự án SmartLogi (đã liên kết GitHub `lovemvaf/Logistic_AI_SaaS`, Production Branch `main`, `ssoProtection: null`, `NEXT_PUBLIC_DATA_SOURCE=api`)**:

| Project Name | Vercel Project ID | Root Directory | Preview URL xác minh ở `4840cce` (`READY`) | Branch Alias trên `visionary19` |
|---|---|---|---|---|
| `smartlogi-admin` | `prj_wbGhEWOdUz0khF8S0cqWIeFKZfhi` | `frontend/feature-test/admin-portal` | `https://smartlogi-admin-aobeqza1n-visionary19.vercel.app` (`/admin/login`) | `smartlogi-admin-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app` |
| `smartlogi-tenant` | `prj_fvHuOLZqucpjnVzRVhsCDw78uzyS` | `frontend/reporting/tenant-portal` | `https://smartlogi-tenant-59yomyjdu-visionary19.vercel.app` (`/login`) | `smartlogi-tenant-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app` |
| `smartlogi-customer` | `prj_eSQvpGluaOMQZhioj6dLFVY5jSMq` | `frontend/reporting/customer-portal` | `https://smartlogi-customer-dmugv2uma-visionary19.vercel.app` (`/client/login`, `/track/TRK-DN-2026-0001`) | `smartlogi-customer-git-feat-smartlogi-enterp-b5189a-visionary19.vercel.app` |
| `smartlogi-pack` | `prj_DkRnjpLl146dbdt3Gmf7rZvtrxl9` | `frontend/reporting/pack-station-web` | `https://smartlogi-pack-411f7uxwc-visionary19.vercel.app` (`/login`) | `smartlogi-pack-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app` |

- **Kết quả kiểm tra Vercel Preview**: Chạy `node scripts/verify-deployment.mjs --skip-proxy` xác minh SSR HTTP `200` trên cả 4 cổng Vercel Preview (`4/4 PASS`).

---

## 4. Hạng mục Đang Chờ Hạ tầng Bên ngoài (`[BLOCKED]`) & Thực địa (`[CHƯA ĐO PILOT]`)

1. **Public HTTPS `api-gateway` + Stateful Compute + Managed PostGIS + Redis >= 7 (`[BLOCKED]`)**: Máy phát triển cục bộ không chứa tài khoản/token triển khai cloud cho Fly.io, Railway, Render hoặc VPS. Do đó, biến `API_INTERNAL_URL` trên 4 dự án Vercel chưa thể trỏ tới backend HTTPS công khai; kiểm tra Vercel Preview chỉ xác minh SSR (`--skip-proxy`), còn luồng đăng nhập & `/api/v1/*` live qua domain Vercel chờ chủ sở hữu cấp hạ tầng/URL gateway công khai.
2. **Cloudflare Worker Live Production (`workers/ai-worker`, `[BLOCKED]`)**: Đã kiểm chứng thực tế qua `wrangler dev --local` (`127.0.0.1:8787`) và test unit; deploy lên account Cloudflare production cần `CLOUDFLARE_API_TOKEN`.
3. **Production Deployment trên Vercel (`main`)**: Chỉ kích hoạt tự động khi Pull Request từ `feat/smartlogi-enterprise-2026` vượt qua CI và được merge vào nhánh `main`.
4. **Hiệu quả Pilot 12 tuần (`[CHƯA ĐO PILOT]`)**: Chỉ số định lượng thực địa, tốc độ giải thực tế vs OR-Tools trên lịch hàng thật, accuracy MobileNet trên hộp/bao bì thật và TCO sau pilot cần triển khai thử nghiệm tại kho khách hàng.
