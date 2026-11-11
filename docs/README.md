# SmartLogi AI SaaS — Tài liệu Kỹ thuật & Hồ sơ Sản phẩm

Tài liệu trung tâm cho mã nguồn SmartLogi AI SaaS (WMS / TMS / 3PL Container & Yard / XNK / Địa giới TP Đồng Nai 2026 / Edge Vision / GPS). Các tài liệu trong thư mục `docs/` đã được đối chiếu trực tiếp với mã nguồn thực tế trên nhánh `feat/smartlogi-enterprise-2026` qua các đợt kiểm toán và nâng cấp `G0–G7`.

> **Trạng thái kiểm chứng môi trường (`[CI]` & `[TESTED_LOCAL]`)**:
> - **Static Invariant Verifier** ([`scripts/static-verify.py`](../scripts/static-verify.py)): **8/8 PASS, 0 errors**.
> - **GitHub Actions CI**: [Run `43023689371`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43023689371) (`75cf1ea`) và [Run `43069842957`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43069842957) (`4840cce`) đạt **6/6 jobs PASSED** (Static Verify, Node 22 build + `next build` 4 portals + `12` Jest suites, Go `-race` `19` tests, PostgreSQL 15/PostGIS `88/106` `FORCE RLS` + demo seed/reset, AI Worker `tsc` + `tsx`, Rust workspace `cargo check`/`test`).
> - **Full-Stack E2E Cục bộ (`[TESTED_LOCAL]`)**: PG 18.1 + PostGIS 3.6 + Redis + Wrangler local Worker + `core-api` + `api-gateway` + 4 portals chế độ `api` vượt qua `23/23` `verify-deployment.mjs` và **12/12** kịch bản Playwright `tests/e2e/verify_s1_s12.py` (0 console errors, 0 HTTP 5xx, 0 layout overflow).
> - **Vercel Team `visionary19`**: 4 dự án (`smartlogi-admin`, `smartlogi-tenant`, `smartlogi-customer`, `smartlogi-pack`) đã liên kết GitHub và dựng Preview SSR **4/4 PASS** (`--skip-proxy`), trong khi `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`) giữ nguyên không chạm tới. Kiểm thử live cloud Gateway/Cloudflare Prod & Pilot 12 tuần được gắn nhãn trung thực `[BLOCKED]` / `[CHƯA ĐO PILOT]`.

---

## 1. Kiến trúc Thực tế Hiện tại (As-Is Architecture)

Hệ thống vận hành theo mô hình **Modular Monolith kết hợp các dịch vụ chuyên biệt (Specialized Services)**, thay thế cho kiến trúc microservices phân tán và Kong từng mô tả trong tài liệu cũ:

| Thành phần | Vị trí mã nguồn | Ngôn ngữ / Runtime | Cổng mặc định | Trách nhiệm chính |
|---|---|---|---:|---|
| **API Gateway / BFF** | [`api/api-gateway`](../api/api-gateway) | NestJS 10 / Node 22 LTS | `3000` | `helmet()`, CORS với `X-Sync-Id`/`Idempotency-Key`, JWT edge guard (đã gỡ `/api/v1/inbound/webhooks` khỏi `PUBLIC_PATHS`), rate-limit, circuit breaker, định tuyến `ROUTE_RULES` theo prefix dài nhất, BFF |
| **Core API (Modular Monolith)** | [`backend/core-api`](../backend/core-api) | NestJS 10 / Prisma / BullMQ / Node 22 LTS | `8081` (`PORT=3001` dev) | **`11` module nghiệp vụ** (`iam`, `wms`, `orders`, `logistics`, `customer`, `notification`, `geography`, `freight`, `yard`, `pricing`, `trade`), **`77` file controller (`85` `@Controller`, `488` endpoint decorators)**, Outbox v2 (lease + `emitAsync` + DLQ/redrive), DB Idempotency (`SHA-256` + `409`), Public Tracking Token Grant |
| **GPS Ingestion Service** | [`backend/gps-ingestion-service`](../backend/gps-ingestion-service) | Go 1.22 | `8090` (HTTP), `8091` (UDP) | Nạp tọa độ HTTP Bearer (constant-time) & UDP canonical v2 HMAC-SHA256 dùng `GPS_UDP_HMAC_SECRET` tách riêng, bounded FIFO replay cache, kiểm định heading/velocity, PostGIS `ST_Contains` toàn batch & SOS cooldown |
| **Webhook Service** | [`backend/webhook-service`](../backend/webhook-service) | Go 1.22 | `8092` | Consumer Redis Streams (`XREADGROUP`/`XACK`/`XAUTOCLAIM` + DLQ/redrive + replay `WEBHOOK_AUTH_TOKEN`), `safeDialContext` ghim IP chống DNS rebinding TOCTOU SSRF, chữ ký `X-SLG-Signature` |
| **AI Worker** | [`workers/ai-worker`](../workers/ai-worker) | Cloudflare Workers / Hono / D1 / KV | `8787` | TS VRP (`haversine_circuity_1.41`), Container Drayage time-window + backhaul (`/v1/routing/containers`), Trade Document Extract (`422 FAILED_PASSWORD_PROTECTED` với file mã hóa) & Reconcile, HS Code advisory (`NEEDS_CUSTOMS_REVIEW`), LLM + fallback công thức, Z-score, export `/v1/training-dataset` (`train` trả `501`) |
| **Rust API (Thử nghiệm)** | [`backend/rust-api`](../backend/rust-api) | Rust / Axum Workspace | - | Workspace parity thử nghiệm (`cargo check` + `8` test PASS): kết hợp route `501` và AI stub (không tính là backend sản xuất) |
| **Admin Portal** | [`frontend/feature-test/admin-portal`](../frontend/feature-test/admin-portal) | Next.js 15 / React 19 | `4001` | **18 trang** quản trị nền tảng (`SUPER_ADMIN`), gồm Geo Master & Outbox DLQ `/admin/geography`, bắt buộc `NEXT_PUBLIC_DATA_SOURCE=mock\|api` không fallback ngầm |
| **Tenant Portal** | [`frontend/reporting/tenant-portal`](../frontend/reporting/tenant-portal) | Next.js 15 / React 19 | `4002` | **53 trang** vận hành WMS/TMS/COD + Freight Control Tower (`/freight`), Yard/EIR (`/yard`), Trade/XNK (`/trade`), DEM/DET AR-AP (`/finance/freight`), Địa giới Đồng Nai 2026 (`/geography`) |
| **Customer Portal** | [`frontend/reporting/customer-portal`](../frontend/reporting/customer-portal) | Next.js 15 / React 19 | `4003` | **14 trang** tự phục vụ B2B, RFQ/Quote/Dispute & Tracking Grants (`/client/freight`) + Public Tracking (`/track/[code]`) |
| **Pack Station Web** | [`frontend/reporting/pack-station-web`](../frontend/reporting/pack-station-web) | Next.js 15 / Web Serial / TF.js | `4004` | **6 trang** đóng gói, Web Serial barcode/cân, MobileNet v2 ImageNet (`CV_CONFIDENCE_THRESHOLD = 0.6`) + xác nhận người dùng |
| **Driver Mobile App** | [`frontend/mobile/driver-app`](../frontend/mobile/driver-app) | Expo ~56 / React Native 0.85 | Mobile | **10 màn hình** tài xế, `OfflineSyncEngine` (`CSPRNG UUID`, lưu trạng thái `SYNCING` trước HTTP, monotonic sequence, `DEAD_LETTER`, header `X-Sync-Id`) |
| **CSDL & Shared Packages** | [`packages/prisma-schemas`](../packages/prisma-schemas), [`packages/wms-engine`](../packages/wms-engine), [`packages/shared-types`](../packages/shared-types) | PostgreSQL 15+/18 + PostGIS 3.3+/3.6 | `5432` | **`104` Prisma model** (`7` migrations, **`88/106` bảng công khai bật `FORCE ROW LEVEL SECURITY`**), thuật toán kho FIFO/FEFO/LIFO, `RolePermissionMap` (gồm quyền `geography`, `freight`, `yard`, `trade`, `pricing`, `tracking-grants`) |

---

## 2. Danh mục Tài liệu Chuyên sâu

| Tài liệu | Nội dung chính |
|---|---|
| [architecture-and-erd.md](architecture-and-erd.md) | Kiến trúc runtime, **104 mô hình Prisma** (gồm TP Đồng Nai 2026, Container/Yard/EIR, Freight/DEM-DET/AR-AP, XNK/Customs), **88/106 bảng `FORCE RLS`**, Outbox v2 lease/ACK/DLQ, DB Idempotency SHA-256 & máy trạng thái |
| [api-contracts.md](api-contracts.md) | Bảng định tuyến `api-gateway`, **77 controller files (`85` `@Controller`, `488` endpoint decorators)** trong `core-api` trải dài 11 module, cổng Go GPS/Webhook Redis Streams, `ai-worker` enterprise routes, `rust-api` |
| [deployment/VERCEL_VISIONARY19.md](deployment/VERCEL_VISIONARY19.md) | Cấu hình 4 project Vercel team `visionary19`, nguyên tắc bảo vệ `visionary-platform`, `ssoProtection`, `vercel-build` và Env fail-closed |
| [deployment/DEPLOYMENT_EVIDENCE.md](deployment/DEPLOYMENT_EVIDENCE.md) | Bằng chứng deploy & kiểm thử `[TESTED_LOCAL]`, `[CI]`, Vercel Preview `READY` (`4/4` SSR) và các mục `[BLOCKED]` / `[CHƯA ĐO PILOT]` |
| [deployment/DEPLOYMENT_TOPOLOGY.md](deployment/DEPLOYMENT_TOPOLOGY.md), [deployment/ENV_MATRIX.md](deployment/ENV_MATRIX.md), [deployment/ROLLBACK.md](deployment/ROLLBACK.md) | Sơ đồ phân tầng biên Vercel vs cụm Stateful Backend, ma trận tên biến môi trường đa tầng (zero secrets) và quy trình rollback DB/Vercel/Worker |
| [operations-runbook.md](operations-runbook.md) | Chạy Docker Compose / local PG18, role `smartlogi_app`, SQL test `tenant-isolation.sql`, Outbox `DEAD_LETTER` redrive, Webhook Redis Streams redrive, Demo Seed an toàn & rollback |
| [ai-model-cards.md](ai-model-cards.md) | Model card trung thực cho TS VRP, Container Drayage heuristic, Trade Document Extract/Reconcile, HS Code advisory (`NEEDS_CUSTOMS_REVIEW`), LLM + fallback, Z-score, MobileNet HITL và `501` train stub |
| [role-guides.md](role-guides.md) | Ma trận quyền least-privilege đầy đủ (`SUPER_ADMIN` + 7 role tenant/client + Public Tracking Token Grant) |
| [ho-so-cap-nhat-B3-B4.md](ho-so-cap-nhat-B3-B4.md) | Hồ sơ đính chính & đồng bộ B3 (`B3-01..07`) và B4 (`Ch.1–21`, `FIG-01..23`, `TBL-01..11`, `REF-01..09`), giữ nguyên bản gốc đã ký `22/06/2026` |
| [upgrade/coverage.csv](upgrade/coverage.csv) & [upgrade/enterprise-execution-matrix.csv](upgrade/enterprise-execution-matrix.csv) | Ma trận truy vết `173` ID kiểm toán/B3-B4 và `18` hạng mục thực thi Enterprise (`SEC-01..07`, `ENT-01..04`, `AI-01`, `FE-01..02`, `DEMO-01`, `OPS-01..02`) |
| [upgrade/verification.md](upgrade/verification.md) & [upgrade/handoff.md](upgrade/handoff.md) | Nhật ký xác minh `G0–G7` chi tiết: `static-verify.py`, Jest (`114/114`), AI Worker (`48/48`), Go `-race` (`19`), Rust (`8`), Playwright (`12/12`), `verify-deployment.mjs` & GitHub CI |

### Tài liệu Lịch sử (Đã được thay thế bởi các tài liệu trên)
- [Chi_Tiet_Kien_Truc_Va_Chuc_Nang.md](Chi_Tiet_Kien_Truc_Va_Chuc_Nang.md) — bản mô tả ngày 06/09/2026 (kiến trúc cũ tách service và Kong).
- [Tien_Do_Va_Do_Hoan_Thien_Chi_Tiet.md](Tien_Do_Va_Do_Hoan_Thien_Chi_Tiet.md) — báo cáo tiến độ ngày 06/09/2026 (chứa các ước lượng % cũ đã được thay thế).
- Các bản lưu trữ bất biến trước khi hợp nhất Modular Monolith ([PRISMA_ANALYSIS.md](PRISMA_ANALYSIS.md), `docs/plans/`, `docs/agent-prompts/`) chỉ phục vụ đối chiếu lịch sử thiết kế.

---

## 3. Lệnh Kiểm tra & Khởi chạy Hợp lệ

### Kiểm tra tĩnh toàn cục (chạy trực tiếp bằng Python 3, không cần Node/Docker)
```bash
python3 -X utf8 scripts/static-verify.py
```

### Khởi chạy & Kiểm thử Workspace / Demo DB Cục bộ (Node 22 LTS + pnpm 9)
```bash
# 1. Hạ tầng và tất cả service qua Docker Compose (hoặc PG18+PostGIS + Redis)
docker compose up -d --build

# 2. Cài đặt workspace phụ thuộc và sinh Prisma Client
pnpm install --frozen-lockfile
pnpm --filter prisma-schemas exec prisma generate

# 3. Đẩy 7 migrations PostgreSQL/PostGIS & chạy test cô lập đa khách thuê
pnpm --filter prisma-schemas exec prisma migrate deploy
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/prisma-schemas/prisma/tests/tenant-isolation.sql

# 4. Seed & kiểm chứng dữ liệu demo tích hợp (chỉ dùng cho dev/demo, bị khóa ở NODE_ENV=production)
ALLOW_DEMO_SEED=true SMARTLOGI_DEMO_MODE=true pnpm demo:reset && pnpm db:seed:demo && pnpm demo:verify
```

### Chế độ Dữ liệu Frontend (`NEXT_PUBLIC_DATA_SOURCE`)
Cả 4 ứng dụng web (`admin-portal`, `tenant-portal`, `customer-portal`, `pack-station-web`) sử dụng biến môi trường `NEXT_PUBLIC_DATA_SOURCE`:
- `mock`: Dùng dữ liệu seed cục bộ phục vụ demo giao diện tĩnh (không tự động suy ra hiệu quả vận hành hay trạng thái backend).
- `api`: Chế độ mặc định cho Staging, CI, Vercel Preview/Production (`visionary19`) — gọi trực tiếp qua same-origin `/api/v1/*` tới `api-gateway` (`API_INTERNAL_URL`), **không rơi ngầm về dữ liệu mock khi API lỗi**, hiển thị lỗi kết nối thật rõ ràng.
