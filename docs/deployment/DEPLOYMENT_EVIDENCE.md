# Nhật ký Bằng chứng Triển khai & Kiểm chứng (`DEPLOYMENT_EVIDENCE.md`)

Tài liệu ghi nhận kết quả kiểm chứng thực tế cho **Gate G6** trên nhánh `feat/smartlogi-enterprise-2026`, phân tách rạch ròi giữa kiểm thử full-stack cục bộ (`[TESTED_LOCAL]` / `[STAGING_EVIDENCE_LOCAL]`), Vercel Preview (`visionary19`), GitHub Actions CI (`[CI]`) và các hạng mục bị chặn do thiếu hạ tầng/secrets bên ngoài (`[BLOCKED]`).

---

## 1. Kiểm chứng Stack Cục bộ Đầy đủ (`[TESTED_LOCAL]` / E2E S1–S12)

Môi trường kiểm thử thực thi trên máy cục bộ gồm PostgreSQL 18 + PostGIS 3.6 (`127.0.0.1:5432`, role ứng dụng non-superuser `smartlogi_app` dưới `FORCE ROW LEVEL SECURITY`), Redis (`127.0.0.1:6379`), Cloudflare `ai-worker` (`wrangler dev --local` tại `:8787`), `core-api` (`:3001`), `api-gateway` (`:3000`) và 4 cổng Next.js 15 dựng ở chế độ `NEXT_PUBLIC_DATA_SOURCE=api` qua same-origin rewrite:

| Bộ kiểm thử | Lệnh thực thi | Kết quả đo thực tế |
|---|---|---|
| Seed & Integrity Check | `pnpm demo:reset && pnpm db:seed:demo && pnpm demo:verify` | **PASS** — `4` tenants (`1` suspended), `95` ĐVHC Đồng Nai 2026 (`33W/62C`, `0` non-pending code, `0` non-no-polygon), `19` aliases, `10` facilities, `4` corridors, `3` road restrictions, `230` orders, `9` containers, `18` yard slots, `6` quotes, `3` customs reviews, `3` DLQ outbox, `12` tracking grants, `3` customer users |
| PostgreSQL `FORCE RLS` Audit | Truy vấn `pg_class` + `tenant-isolation.sql` | **PASS** — `88/106` bảng công khai bật `ENABLE` + `FORCE ROW LEVEL SECURITY` (`18` bảng còn lại là bảng hệ thống/nền tảng/địa giới chung/PostGIS `spatial_ref_sys`) |
| Cross-Portal Deployment Verifier | [`scripts/verify-deployment.mjs`](../../scripts/verify-deployment.mjs) | **PASS (`23/23`)** — `gateway` (`/health`, `/api/v1/health`, `401` fail-closed `/orders` & `/admin/tenants`, `404` public track), `ai-worker` (`/health`, `501` `/ai/v1/train/demand`), và 4 portals (SSR HTTP 200 + proxy `/api/v1/*`) |
| Core API Jest Suite | `pnpm exec jest --config backend/core-api/jest.config.js --runInBand` | **PASS (`8/8` suites, `82/82` tests)** |
| Playwright Enterprise E2E + UI | [`tests/e2e/verify_s1_s12.py`](../../tests/e2e/verify_s1_s12.py) | **PASS (`12/12` scenarios in `57.29s`)** — 0 console/pageerrors, 0 HTTP 5xx, **0 responsive overflow warnings** trên Desktop/Tablet/Mobile |
| 4-Portal Vercel Simulation Build | `VERCEL=1 NEXT_PUBLIC_DATA_SOURCE=api pnpm run vercel-build` | **PASS** trên [`admin-portal`](../../frontend/feature-test/admin-portal), [`tenant-portal`](../../frontend/reporting/tenant-portal), [`customer-portal`](../../frontend/reporting/customer-portal), [`pack-station-web`](../../frontend/reporting/pack-station-web) |

*(Lưu ý môi trường dev Windows cục bộ: Redis Windows trên máy là phiên bản `3.0.504` nên BullMQ v5 xuất cảnh báo khuyến nghị Redis `>= 5.0.0`; môi trường Docker & CI dùng `redis:7-alpine`.)*

---

## 2. Triển khai 4 Dự án Vercel Team `visionary19`

- **Team mục tiêu**: `visionary19` (`team_T6s3oJUmrj5hwTjwgDszZMP2`, gói `hobby`)
- **Dự án hiện hữu cần bảo vệ**: `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`) — **giữ nguyên hoàn toàn không chạm tới**
- **Trạng thái kết nối & Preview Deployment**: Đang khởi tạo 4 dự án và triển khai nhánh `feat/smartlogi-enterprise-2026` trong đợt đẩy Gate G6 *(sẽ cập nhật URL và Project ID thực ngay khi nhận phản hồi Vercel API)*.

---

## 3. Hạng mục Đang Chờ Hạ tầng Bên ngoài (`[BLOCKED]`)

1. **Public HTTPS `api-gateway` + Stateful Compute + Managed PostGIS + Redis >= 7**: Máy phát triển cục bộ không chứa tài khoản/token triển khai cloud cho Fly.io, Railway, Render hoặc VPS. Do đó, biến `API_INTERNAL_URL` trên 4 dự án Vercel chưa thể trỏ tới backend HTTPS công khai; mọi kiểm tra Vercel Preview chỉ xác minh SSR (`--skip-proxy`), còn luồng đăng nhập & `/api/v1/*` live qua Vercel domain mang nhãn **`[BLOCKED]`** chờ chủ sở hữu cấp hạ tầng/URL gateway công khai.
2. **Cloudflare Worker Live Production (`workers/ai-worker`)**: Đã kiểm chứng thực tế qua `wrangler dev --local` (`127.0.0.1:8787`); deploy lên account Cloudflare production thực chưa có Cloudflare API Token trên máy local (**`[BLOCKED]`**).
3. **Production Deployment trên Vercel (`main`)**: Chỉ kích hoạt tự động khi Pull Request từ `feat/smartlogi-enterprise-2026` vượt qua CI và được merge vào nhánh `main`.
4. **Hiệu quả Pilot 12 tuần (`[CHƯA ĐO PILOT]`)**: Chỉ số định lượng thực địa chưa có đợt vận hành pilot thực tế.
