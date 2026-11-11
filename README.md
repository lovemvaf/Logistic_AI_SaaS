# SmartLogi AI SaaS

Nền tảng quản trị kho bãi (WMS), vận tải (TMS), trạm đóng gói hỗ trợ Web Serial / MobileNet và thu nhận GPS thời gian thực dành cho doanh nghiệp logistics SME đa khách thuê.

> **Lưu ý kiểm chứng**: Bộ kiểm tra tĩnh ([`scripts/static-verify.py`](scripts/static-verify.py)) đã chạy đạt **8/8 nhóm kiểm tra (0 lỗi)**. Các lệnh biên dịch và bộ test runtime (Node/Jest, AI Worker, Go `-race`, Rust `cargo test`, PostgreSQL `FORCE RLS`) được cấu hình trong [`.github/workflows/ci.yml`](.github/workflows/ci.yml) với trạng thái `needs_ci_run` chờ thực thi trên GitHub Actions hoặc môi trường Docker/Node.

---

## Kiến trúc hệ thống

Hệ thống tổ chức theo mô hình **Modular Monolith kết hợp dịch vụ chuyên biệt**:

| Thành phần | Vị trí | Công nghệ | Vai trò chính |
|---|---|---|---|
| **API Gateway / BFF** | [`api/api-gateway`](api/api-gateway) | NestJS 10 | Xác thực JWT, rate-limit, circuit breaker, định tuyến `ROUTE_RULES` (`/api/v1/*`) và BFF |
| **Core API** | [`backend/core-api`](backend/core-api) | NestJS 10 / Prisma / BullMQ | 6 module nghiệp vụ (`iam`, `wms`, `orders`, `logistics`, `customer`, `notification`), Outbox `SKIP LOCKED`, `X-Sync-Id` |
| **GPS Ingestion Service** | [`backend/gps-ingestion-service`](backend/gps-ingestion-service) | Go 1.22 | HTTP `:8090` (Bearer constant-time) & UDP `:8091` (HMAC-SHA256 + replay cache), PostGIS `ST_Contains` & SOS cooldown |
| **Webhook Service** | [`backend/webhook-service`](backend/webhook-service) | Go 1.22 | Gửi outbound webhook ký HMAC (`X-SLG-Signature`), chặn SSRF DNS/IP nội bộ, che `secretToken` |
| **AI Worker** | [`workers/ai-worker`](workers/ai-worker) | Cloudflare Workers / Hono | TS VRP (Nearest-Neighbor + 2-opt, `haversine_circuity_1.41`), LLM + fallback công thức, z-score, xuất dataset (`/v1/training-dataset`) |
| **Rust API *(Thử nghiệm)*** | [`backend/rust-api`](backend/rust-api) | Rust / Axum | Workspace thử nghiệm song song (nhiều route `501` + AI giả lập xác định) |
| **4 Cổng Web (84 trang)** | [`frontend/feature-test/admin-portal`](frontend/feature-test/admin-portal), [`frontend/reporting`](frontend/reporting) | Next.js 15 / React 19 | `admin-portal` (`:4001`), `tenant-portal` (`:4002`), `customer-portal` (`:4003`), `pack-station-web` (`:4004`, Web Serial + MobileNet `0.60`) |
| **App Tài xế** | [`frontend/mobile/driver-app`](frontend/mobile/driver-app) | Expo / React Native 0.85 | 10 màn hình tài xế, `OfflineSyncEngine` (backoff mũ + `DEAD_LETTER`), ePOD & nộp COD |
| **Schema & Packages** | [`packages/`](packages) | PostgreSQL 15 + PostGIS 3.3 | 66 Prisma models (**58** bảng bật `FORCE ROW LEVEL SECURITY`), `wms-engine`, `shared-types` |

---

## Khởi chạy nhanh & Biến môi trường

1. Tạo cấu hình môi trường từ mẫu gốc và mẫu AI Worker:
   ```bash
   cp .env.example .env
   cp workers/ai-worker/.dev.vars.example workers/ai-worker/.dev.vars
   ```
2. Khởi chạy toàn bộ cụm PostgreSQL/PostGIS, Redis, Kafka, LocalStack S3, Backend và Portals bằng Docker Compose:
   ```bash
   docker compose up -d --build
   ```
3. Kiểm tra tĩnh toàn repo (chỉ cần Python 3):
   ```bash
   python3 -X utf8 scripts/static-verify.py
   ```
4. Cả 4 web portal hỗ trợ biến `NEXT_PUBLIC_DATA_SOURCE=mock|api` (`mock` cho demo UI không cần backend; `api` kết nối trực tiếp API Gateway và hiển thị lỗi thật nếu mất kết nối).

---

## Tài liệu kỹ thuật & Truy vết

- Danh mục tài liệu trung tâm: [`docs/README.md`](docs/README.md)
- Kiến trúc & ERD (66 models, 58 bảng `FORCE RLS`): [`docs/architecture-and-erd.md`](docs/architecture-and-erd.md)
- Hợp đồng API (`/api/v1/*`, Go, AI Worker): [`docs/api-contracts.md`](docs/api-contracts.md)
- Phân quyền RBAC & Hướng dẫn vai trò: [`docs/role-guides.md`](docs/role-guides.md)
- AI Model Cards & CV Pack Station: [`docs/ai-model-cards.md`](docs/ai-model-cards.md)
- Sổ tay vận hành & Triển khai: [`docs/operations-runbook.md`](docs/operations-runbook.md)
- Hồ sơ đính chính & đồng bộ B3–B4: [`docs/ho-so-cap-nhat-B3-B4.md`](docs/ho-so-cap-nhat-B3-B4.md)
- Ma trận truy vết (`173` ID) & Nhật ký kiểm chứng: [`docs/upgrade/coverage.csv`](docs/upgrade/coverage.csv), [`docs/upgrade/verification.md`](docs/upgrade/verification.md)
