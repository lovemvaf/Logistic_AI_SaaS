# Sổ bằng chứng kiểm chứng (`evidence-ledger.md`)

Quy ước nhãn bắt buộc (tuyệt đối không gộp trạng thái chưa chạy vào đã nghiệm thu):
- `[CODE]`: Đã có mã nguồn/cấu hình trong repo.
- `[TESTED_LOCAL]`: Đã chạy và ghi exit code + sản phẩm đầu ra tại môi trường local (PG 18.1 + PostGIS 3.6 + Redis + Node 24/pnpm 9 + `wrangler dev --local` + Playwright).
- `[CI]`: Đã chạy tự động trên GitHub Actions runner sạch (gồm cả Go `-race` detector, Rust `cargo test`, `postgis:15-3.3` RLS + `demo:verify`, và 4 Next.js 15 builds).
- `[STAGING_E2E]`: Đã chạy end-to-end đầy đủ giữa trình duyệt + portal + gateway + core-api + Postgres/Redis/AI Worker thật trên môi trường cục bộ tích hợp.
- `[PROD_VERIFIED]`: Đã kiểm tra endpoint health/TLS/UI trên môi trường production (hiện còn `[BLOCKED]` cho backend công khai & merge `main`).
- `[PILOT_MEASURED]`: Đo từ pilot doanh nghiệp thực tế 12 tuần (hiện không có -> `[CHƯA ĐO PILOT]`).
- `[PROPOSED]`: Đề xuất kiến trúc/vận hành chưa có hạ tầng cấp phép.
- `[BLOCKED]`: Bị chặn do thiếu quyền/thiết bị/credentials/cloud hosting ngoài repo.

---

## Mốc Baseline trước chỉnh sửa (`affba05` / `75cf1ea`)

| Hạng mục | Nhãn | Lệnh / Đường dẫn / Run | Kết quả đo thực tế |
|---|---|---|---|
| Baseline repo kiểm chứng tĩnh | `[TESTED_LOCAL]` | `python -X utf8 scripts/static-verify.py` | **PASS** — `8` check groups, `0` errors |
| Baseline GitHub Actions CI (`75cf1ea`) | `[CI]` | Run [`43023689371`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43023689371) | **PASS (`6/6`)** — baseline G0–G5 (`5` migrations, `15` test suites) |
| Vercel CLI Team Access | `[TESTED_LOCAL]` | `npx vercel whoami && npx vercel teams ls` | Xác thực `lovemvaf`; team `visionary19` (`team_T6s3oJUmrj5hwTjwgDszZMP2`, `hobby`) truy cập được; `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`) giữ nguyên (`updatedAt=1792953414661`) |
| Go race detector local | `[BLOCKED]` | `go version` | Máy Windows local không cài Go SDK; chuyển chạy tự động trên GitHub Actions `go-services` (`go test -v -race ./...`) |
| 12-week Pilot KPIs | `[CHƯA ĐO PILOT]` | [`docs/ho-so-cap-nhat-B3-B4.md`](../ho-so-cap-nhat-B3-B4.md) | Chưa có đối tác pilot thực địa; mọi chỉ số hiệu quả định lượng pilot chưa đo |

---

## Bảng cập nhật bằng chứng sau khi thực thi (G3 -> G7, mốc `4840cce` + đồng bộ G7)

| Gate | Hạng mục | Nhãn | Lệnh kiểm chứng | Kết quả thực tế |
|---|---|---|---|---|
| G3–G4 | Prisma 7 migrations (`104` models) + PostgreSQL 18.1 `FORCE RLS` audit | `[TESTED_LOCAL]` | `prisma migrate deploy` + `psql -v ON_ERROR_STOP=1 -f packages/prisma-schemas/prisma/tests/tenant-isolation.sql` + truy vấn `pg_class` | **PASS (exit 0)** — **`88/106`** bảng công khai bật `ENABLE` + `FORCE ROW LEVEL SECURITY` (`18` bảng dùng chung/platform); fail-closed `42501` dưới role `smartlogi_app` |
| G3–G4 | Hardening P0/P1 + Freight/Yard/DEM-DET/XNK/Đồng Nai 95 ĐVHC (`core-api`, `api-gateway`, `wms-engine`) | `[TESTED_LOCAL]` | `jest` (`wms-engine`, `api-gateway`, `core-api --runInBand`) + `tsc --noEmit` + `offline-sync-engine build` | **PASS (`12/12` suites, `114/114` tests)**: `wms-engine` `21/21`, `api-gateway` `11/11` (`3` suites), `core-api` `82/82` (`8` suites), `0` lỗi TypeScript |
| G4–G7 | Cloudflare AI Worker (Container Drayage, Trade Doc Extraction `422` PDF mật khẩu, Reconcile, HS Code `NEEDS_CUSTOMS_REVIEW`) | `[TESTED_LOCAL]` | `npx tsx tests/{llm,journey,vrp,compute,enterprise}.test.ts` + benchmark `benchmark-dongnai.ts` | **PASS (`5/5` suites, `48/48` assertions)**: `llm` 13, `journey` 7, `vrp` 10, `compute` 12, `enterprise` 6 (đã thêm `enterprise.test.ts` vào `.github/workflows/ci.yml` ở G7) |
| G5 | Seed tích hợp đa tenant S1–S12 & guard chặn Production | `[TESTED_LOCAL]` | `pnpm demo:reset && pnpm db:seed:demo && pnpm demo:verify` | **PASS (exit 0)** — `4` tenants, `95` ĐVHC Đồng Nai 2026 (`33W/62C`, `PENDING_OFFICIAL_CODE`, `NO_OFFICIAL_POLYGON`), `19` aliases, `10` facilities, `4` corridors (`NORTH`/`CENTRAL`/`SOUTH`), `230` orders, `9` containers, `18` yard slots, `6` quotes, `3` customs reviews, `3` DLQ outbox, `12` tracking grants |
| G5–G6 | Build toàn bộ 4 Next.js 15 portals (`91` trang) ở API mode | `[TESTED_LOCAL]` | `VERCEL=1 NEXT_PUBLIC_DATA_SOURCE=api pnpm run vercel-build` (4 portals) | **PASS (`4/4`)** — `admin-portal` (18 trang), `tenant-portal` (53 trang), `customer-portal` (14 trang), `pack-station-web` (6 trang); `ignoreBuildErrors: false` |
| G6 | Kiểm thử Full-Stack Cục bộ (`core-api` + `api-gateway` + `ai-worker` + 4 Next portals + PG18 + Redis) | `[STAGING_E2E]` / `[TESTED_LOCAL]` | `python tests/e2e/verify_s1_s12.py` & `node scripts/verify-deployment.mjs` | **PASS (`12/12` kịch bản Playwright trong `57.29s`)** — 0 console/pageerrors, 0 HTTP 5xx, 0 lỗi responsive overflow trên Desktop/Tablet/Mobile; **`23/23`** HTTP smoke checks PASS |
| G3–G6 | GitHub Actions CI (`4840cce`, nhánh `feat/smartlogi-enterprise-2026`) | `[CI]` | [Run `43069842957`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43069842957) | **PASS (`6/6` jobs)** — `static-verify`, `node-workspace` (incl. 4x `next build`), `ai-worker` (4 suites tại `4840cce`), `go-services` (`19` Go tests `-race`), `rust-api` (`cargo check` + `8` `#[test]`), `postgres-rls` (`7` migrations + RLS + `demo:verify`) |
| G6 | 4 dự án Vercel Preview (`visionary19` @ `4840cce`) | `[TESTED_LOCAL]` / `[PROD_VERIFIED]` (SSR Preview) | `node scripts/verify-deployment.mjs --skip-proxy` trên 4 URL Vercel `READY` | **PASS (`4/4` Preview SSR HTTP `200`)** — `ssoProtection: null`, `NEXT_PUBLIC_DATA_SOURCE=api`, `visionary-platform` nguyên vẹn (`updatedAt=1792953414661`) |
| G6–G7 | Backend Cloud HTTPS (`API_INTERNAL_URL`) & Cloudflare Prod Deploy | `[BLOCKED]` | Kiểm tra biến env Vercel & tokens cloud | **BLOCKED** — Chưa có tài khoản/URL public HTTPS cho `api-gateway`/Postgres/Redis và chưa có `CLOUDFLARE_API_TOKEN`; PR merge vào `main` giữ chặn bảo vệ Production fail-closed |
| G7 | Kiểm chứng tĩnh toàn diện & đồng bộ B3–B4 / `coverage.csv` | `[TESTED_LOCAL]` | `python -X utf8 scripts/static-verify.py` | **PASS (`8/8` check groups, `0` errors)** trên `173` ID (`P01..15`, `N01..52`, `R01..24`, `NEW-01..10`, `B3-01..07`, `B4-COVER`, `B4-CH01..21`, `FIG-01..23`, `TBL-01..11`, `REF-01..09`) |
