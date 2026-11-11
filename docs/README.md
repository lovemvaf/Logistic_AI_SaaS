# SmartLogi AI SaaS — Tài liệu Kỹ thuật & Hồ sơ Sản phẩm

Tài liệu trung tâm cho mã nguồn SmartLogi AI SaaS (WMS/TMS/Edge Vision/GPS). Các tài liệu trong thư mục `docs/` đã được đối chiếu trực tiếp với mã nguồn thực tế trên snapshot sau rà soát (baseline commit `775ba1ce181191054397cb62bb7430530ce33f81`, các đợt gia cố `G0–G4`).

> **Trạng thái kiểm chứng môi trường (`AGENTS.md §1`)**: Máy phát triển Windows cục bộ chỉ chạy bộ kiểm tra tĩnh bằng Python ([scripts/static-verify.py](../scripts/static-verify.py), **8/8 PASS**). Toàn bộ 6/6 jobs build, unit test, typecheck, Go `-race`, Rust workspace và PostgreSQL `FORCE RLS` trong [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) đã thực thi và **PASSED** trên GitHub Actions tại [Run 43023689371](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43023689371) (commit `75cf1ea`). Kiểm thử tích hợp đa container live (`staging`), `next build`, thiết bị phần cứng thật và Pilot 12 tuần vẫn chờ bước triển khai thực địa.

---

## 1. Kiến trúc Thực tế Hiện tại (As-Is Architecture)

Hệ thống vận hành theo mô hình **Modular Monolith kết hợp các dịch vụ chuyên biệt (Specialized Services)**, thay thế cho kiến trúc microservices phân tán và Kong từng mô tả trong tài liệu cũ:

| Thành phần | Vị trí mã nguồn | Ngôn ngữ / Runtime | Cổng mặc định | Trách nhiệm chính |
|---|---|---|---:|---|
| **API Gateway / BFF** | [`api/api-gateway`](../api/api-gateway) | NestJS 10 / Node 20 | `3000` | Xác thực JWT ở edge, rate-limit, circuit breaker, định tuyến `ROUTE_RULES` theo prefix dài nhất, gom `/api/v1/bff/*` |
| **Core API (Modular Monolith)** | [`backend/core-api`](../backend/core-api) | NestJS 10 / Prisma / BullMQ | `8081` (`PORT=3001` dev) | 6 module nghiệp vụ (`iam`, `wms`, `orders`, `logistics`, `customer`, `notification`), 70 controller / 407 endpoint decorator dưới prefix `/api/v1` |
| **GPS Ingestion Service** | [`backend/gps-ingestion-service`](../backend/gps-ingestion-service) | Go 1.22 | `8090` (HTTP), `8091` (UDP) | Nạp tọa độ HTTP Bearer (so sánh constant-time) & UDP HMAC-SHA256 chống replay, worker pool, PostGIS `ST_Contains` geofence & SOS cooldown |
| **Webhook Service** | [`backend/webhook-service`](../backend/webhook-service) | Go 1.22 | `8092` | Gửi outbound webhook ký HMAC (`X-SLG-Signature`), chặn SSRF DNS/IP nội bộ, che/giữ nguyên `secretToken` |
| **AI Worker** | [`workers/ai-worker`](../workers/ai-worker) | Cloudflare Workers / Hono / D1 / KV | `8787` | TS VRP (Nearest-Neighbor + 2-opt, `haversine_circuity_1.41`), chat/dự báo LLM + fallback công thức, z-score anomaly, export `/v1/training-dataset` (`POST /v1/train/:type` trả `501`) |
| **Rust API (Thử nghiệm)** | [`backend/rust-api`](../backend/rust-api) | Rust / Axum Workspace | - | Thử nghiệm port API: kết hợp nhiều endpoint `501` và sinh dữ liệu AI giả lập xác định (không tính là backend hoàn chỉnh) |
| **Admin Portal** | [`frontend/feature-test/admin-portal`](../frontend/feature-test/admin-portal) | Next.js 15 / React 19 | `4001` | 17 trang quản trị nền tảng (`SUPER_ADMIN`), hỗ trợ công tắc `NEXT_PUBLIC_DATA_SOURCE=mock\|api` |
| **Tenant Portal** | [`frontend/reporting/tenant-portal`](../frontend/reporting/tenant-portal) | Next.js 15 / React 19 | `4002` | 48 trang vận hành kho, đơn hàng, điều phối, COD, trả hàng, báo cáo |
| **Customer Portal** | [`frontend/reporting/customer-portal`](../frontend/reporting/customer-portal) | Next.js 15 / React 19 | `4003` | 13 trang tự phục vụ B2B & tra cứu vận đơn công khai |
| **Pack Station Web** | [`frontend/reporting/pack-station-web`](../frontend/reporting/pack-station-web) | Next.js 15 / Web Serial / TF.js | `4004` | 6 trang đóng gói, Web Serial barcode/cân, MobileNet v2 ImageNet v2 (`CV_CONFIDENCE_THRESHOLD = 0.6`) + xác nhận người dùng |
| **Driver Mobile App** | [`frontend/mobile/driver-app`](../frontend/mobile/driver-app) | Expo ~56 / React Native 0.85 | Mobile | 10 màn hình tài xế, `OfflineSyncEngine` (`AsyncStorage`, backoff mũ, `DEAD_LETTER`, header `X-Sync-Id`) |
| **CSDL & Shared Packages** | [`packages/prisma-schemas`](../packages/prisma-schemas), [`packages/wms-engine`](../packages/wms-engine), [`packages/shared-types`](../packages/shared-types) | PostgreSQL 15 + PostGIS 3.3 | `5432` | 66 Prisma model (`58` bảng bật `FORCE ROW LEVEL SECURITY`), thuật toán kho FIFO/FEFO/LIFO, `RolePermissionMap` + `PermissionsGuard` |

---

## 2. Danh mục Tài liệu Chuyên sâu

| Tài liệu | Nội dung chính |
|---|---|
| [architecture-and-erd.md](architecture-and-erd.md) | Sơ đồ kiến trúc 5 runtime, 66 thực thể PostgreSQL/PostGIS, cơ chế cô lập đa khách thuê (ALS + `search_path` + `app.tenant_id` GUC + `FORCE RLS` trên 58 bảng), Outbox `SKIP LOCKED`, máy trạng thái |
| [api-contracts.md](api-contracts.md) | Bảng định tuyến `api-gateway`, 70 controller / 407 endpoint `core-api`, cổng Go GPS/Webhook, `ai-worker`, `rust-api`, schema lỗi thống nhất và parity với 4 web portal + mobile |
| [operations-runbook.md](operations-runbook.md) | Chạy Docker Compose, giới hạn hạ tầng Free Tier (Vercel/Cloudflare vs Stateful Postgres/Redis/Kafka/Go UDP), role DB `smartlogi_app`, SQL test cô lập tenant, Outbox, secret rotation và rollback |
| [ai-model-cards.md](ai-model-cards.md) | Model card trung thực cho TS VRP, LLM + fallback công thức, z-score, MobileNet ImageNet + HITL, chính sách `501` cho `/v1/train/:type`, xuất dataset `/v1/training-dataset` và thiết kế pilot |
| [role-guides.md](role-guides.md) | Hướng dẫn vận hành và ma trận quyền least-privilege cho `SUPER_ADMIN`, 7 role tenant/client và luồng Public Tracking |
| [ho-so-cap-nhat-B3-B4.md](ho-so-cap-nhat-B3-B4.md) | Hồ sơ đính chính & đồng bộ B3 (`B3-01..07`) và B4 (`Ch.1–21`, `FIG-01..23`, `TBL-01..11`, `REF-01..09`), giữ nguyên bản gốc 22/06/2026 |
| [upgrade/coverage.csv](upgrade/coverage.csv) | Ma trận truy vết từng ID (`P01–P15`, `N01–N52`, `R01–R24`, `NEW-01–10`, B3/B4/Hình/Bảng/Tham khảo) |
| [upgrade/verification.md](upgrade/verification.md) | Nhật ký chạy `scripts/static-verify.py` (8/8 PASS) và kết quả CI GitHub Actions Run `43023689371` đạt 6/6 jobs (commit `75cf1ea`) |
| [upgrade/handoff.md](upgrade/handoff.md) | Tổng kết bàn giao các cổng `G0–G5`, giới hạn còn tồn tại và điều kiện chạy pilot |

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

### Khởi chạy cụm hạ tầng & ứng dụng (trong môi trường Docker/Node được phép)
```bash
# 1. Hạ tầng và tất cả service qua Docker Compose
docker compose up -d --build

# 2. Cài đặt workspace phụ thuộc và sinh Prisma Client (Node 20 + pnpm)
pnpm install --frozen-lockfile
pnpm --filter prisma-schemas exec prisma generate

# 3. Đẩy migration PostgreSQL/PostGIS & chạy test cô lập đa khách thuê
pnpm --filter prisma-schemas exec prisma migrate deploy
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/prisma-schemas/prisma/tests/tenant-isolation.sql
```

### Chế độ Dữ liệu Frontend (`NEXT_PUBLIC_DATA_SOURCE`)
Cả 4 ứng dụng web (`admin-portal`, `tenant-portal`, `customer-portal`, `pack-station-web`) sử dụng biến môi trường `NEXT_PUBLIC_DATA_SOURCE`:
- `mock`: Dùng dữ liệu seed cục bộ phục vụ demo giao diện (không tự động suy ra hiệu quả vận hành hay trạng thái backend).
- `api`: Gọi trực tiếp qua `api-gateway` (`NEXT_PUBLIC_API_URL`); **không rơi ngầm về dữ liệu mock khi API lỗi**, trả lỗi rõ ràng để phục vụ kiểm thử tích hợp.
