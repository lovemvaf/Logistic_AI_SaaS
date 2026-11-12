# Ma trận Biến Môi trường Đa Môi trường (`ENV_MATRIX.md`)

Tài liệu chỉ liệt kê **tên biến môi trường, phạm vi sử dụng, mức độ nhạy cảm và quy ước theo môi trường** (`local` / `preview` / `production`). **Tuyệt đối không lưu giá trị secret thật trong tài liệu hoặc Git.**

---

## 1. Frontend Web Portals & Demo Cloud (`4` Dự án Vercel + Local Dev)

| Tên biến | Cổng áp dụng | Công khai ra trình duyệt? | Local Dev (`docker`/host) | Vercel Preview & Demo Cloud Prod (`visionary19`) | Production Riêng (Non-Demo) | Ghi chú |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_DATA_SOURCE` | Cả 4 portals | Có (`NEXT_PUBLIC_`) | `api` | `api` | `api` | Fail-closed; không tự rơi ngầm về `mock` khi API lỗi |
| `NEXT_PUBLIC_API_URL` | Cả 4 portals | Có | `/api/v1` | `/api/v1` | `/api/v1` | Client gọi cùng origin `/api/v1/*` |
| `NEXT_PUBLIC_DEMO_MODE` | Cả 4 portals | Có | `true` khi chạy demo | `true` | `false` | Bật Demo Control Center & nút Persona 1 chạm trên trang Login |
| `SMARTLOGI_DEMO_MODE` | Cả 4 portals (`demo-cloud-api`) | **Không** | `true` khi chạy demo | `true` | `false` | Khóa endpoint `/demo/login`, `/demo/personas`, `/demo/handoff` trên server |
| `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_TENANT_URL`, `NEXT_PUBLIC_CUSTOMER_URL`, `NEXT_PUBLIC_PACK_URL` | Cả 4 portals | Có | `http://localhost:4001..4004` | `https://smartlogi-*.vercel.app` | Domain khách hàng | Đích chuyển cổng bảo mật `/demo-handoff` |
| `DEMO_APP_DATABASE_URL`, `DATABASE_URL` | Cả 4 portals (`demo-cloud-api`) | **Không** (**Secret**) | Local PG18 / Neon | Neon PostgreSQL 18.6 (`smartlogi_app`) | Prod Postgres (`smartlogi_app`) | Dùng dưới `$transaction` thiết lập `app.tenant_id` GUC cho `FORCE RLS` |
| `DATABASE_URL_UNPOOLED` / `DIRECT_URL` | [`packages/prisma-schemas`](../../packages/prisma-schemas) | **Không** (**Secret**) | Local PG18 / Neon Direct | Neon Direct (migration/seed) | Migrator URL | Chỉ dùng khi `prisma migrate deploy` hoặc `demo:bootstrap` |
| `JWT_SECRET` / `DEMO_SESSION_SECRET` | Cả 4 portals + Backend | **Không** (**Secret**) | Secret dev >= 32 ký tự | Khóa chung 4 dự án | Prod KMS Secret | Bắt buộc giống nhau nếu chia sẻ xác thực đa cổng |
| `API_INTERNAL_URL` | Cả 4 portals | **Không** (server Next rewrite) | Để trống khi dùng `demo-cloud-api` hoặc `http://127.0.0.1:3000` | Trống (dùng `demo-cloud-api` in-process) | Gateway HTTPS URL | Nếu khai báo, `next.config.*` rewrite `/api/v1/*` sang `api-gateway` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Cả 4 portals | Có | Trống hoặc Client ID dev | Optional | Optional | UI tự ẩn nút Google nếu rỗng |
| `VERCEL` | Cả 4 portals | Biến hệ thống build | Không đặt | `1` (Vercel tự cấp) | `1` (Vercel tự cấp) | Tắt `output: 'standalone'` trên Vercel |

---

## 2. Backend & Edge Services Độc lập (`api-gateway`, `core-api`, Go, Cloudflare Worker)

| Tên biến | Thành phần sử dụng | Loại | Yêu cầu Production & An toàn |
|---|---|---|---|
| `NODE_ENV` | `core-api`, `api-gateway` | Config | `production` trên Staging/Prod; `development` ở Local/CI/Demo Seed |
| `PORT` | `api-gateway` (`3000`), `core-api` (`3001`/`8081`) | Config | Gateway Edge `3000`; Core API `8081` (Docker) hoặc `3001` (local) |
| `CORE_API_URL` | `api/api-gateway` | Internal URL | Địa chỉ nội bộ tới `core-api` |
| `AI_WORKER_URL` / `AI_SERVICE_URL` | `api/api-gateway`, `backend/core-api` | URL | Endpoint Cloudflare Worker (`/ai/v1/*` và `/routing/solve`) |
| `CORS_ORIGINS` | `api/api-gateway`, `backend/core-api` | Allowlist | Liệt kê chính xác origin 4 domain Vercel Production + Preview cần thiết |
| `GATEWAY_RATE_LIMIT` | `api/api-gateway` | Config | Mặc định `1000` req/window (tắt wildcard vượt ngưỡng) |
| `THROTTLE_DEFAULT_LIMIT` | `backend/core-api` | Config | Giới hạn tốc độ mặc định trên từng IP/route |
| `DATABASE_URL` | `backend/core-api`, `gps-ingestion-service` | **Secret** | Chuỗi kết nối PG 15+/PostGIS dưới role **`smartlogi_app`** (`NOSUPERUSER NOBYPASSRLS`) để bắt buộc `FORCE RLS` |
| `DIRECT_URL` / Migrator URL | [`packages/prisma-schemas`](../../packages/prisma-schemas) | **Secret** | Quyền owner/migrator chỉ chạy khi `prisma migrate deploy`, không cấp cho runtime web API |
| `JWT_SECRET` | `core-api`, `api-gateway`, `workers/ai-worker` | **Secret** | Tối thiểu 32 ký tự ngẫu nhiên mạnh, phải **giống nhau** giữa 3 dịch vụ |
| `AI_API_KEY` | `core-api`, `workers/ai-worker` | **Secret** | Bảo vệ giao tiếp nội bộ `x-ai-api-key` giữa Core API và Worker |
| `GPS_AUTH_TOKEN` | `backend/gps-ingestion-service` | **Secret** | Bearer token cho thiết bị IoT gọi HTTP `/gps/batch` (so sánh constant-time) |
| `GPS_UDP_HMAC_SECRET` | `backend/gps-ingestion-service` | **Secret** | Khóa HMAC-SHA256 tách riêng khỏi Bearer cho gói UDP `:8091` |
| `GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED` | `backend/gps-ingestion-service` | Security Flag | Bắt buộc **`false`** trên Staging/Production |
| `WEBHOOK_AUTH_TOKEN` | `core-api`, `backend/webhook-service` | **Secret** | Bảo vệ endpoint nội bộ `/deliver` và `/redrive` của Go Webhook |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_URL` | `api-gateway`, `core-api`, `webhook-service` | Config / Secret | Yêu cầu **Redis >= 5.0** (`redis:7-alpine`) để chạy BullMQ 5 và Redis Streams `XREADGROUP` |
| `KAFKA_BROKERS` | `backend/core-api` | Config | Bỏ trống nếu chưa chạy Kafka broker (`core-api` giữ Outbox `PENDING`/`DEAD_LETTER` an toàn) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | `backend/core-api` | Config + **Secret** | LocalStack ở dev; S3 hoặc Cloudflare R2 ở Staging/Prod cho ảnh ePOD |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `SUPER_ADMIN_GOOGLE_EMAILS` | `core-api` | **Secret** | Đăng nhập Google OAuth (tùy chọn); giữ `GOOGLE_AUTO_PROVISION=false` |
| `GOOGLE_GEOCODING_API_KEY` | `workers/ai-worker` | **Secret** | Dự phòng geocoding khi bản ghi chưa có tọa độ sẵn |
| `OPENAI_API_KEY` / `CLOUDFLARE_MODEL` | `workers/ai-worker` | **Secret** / Config | Worker AI binding `AI` ưu tiên; OpenAI là fallback tùy chọn |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `backend/core-api` | **Secret** | Thanh toán SaaS (tùy chọn ngoài môi trường demo) |
| `SENDGRID_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `SENTRY_DSN` | `backend/core-api` | **Secret** | Gửi thông báo thực & giám sát lỗi (chế độ dev dùng `console`) |

---

## 3. Biến Bảo vệ Seed Demo & Mobile (`driver-app`)

| Tên biến | Nơi áp dụng | Quy tắc an toàn |
|---|---|---|
| `ALLOW_DEMO_SEED` | [`packages/prisma-schemas/prisma/seeds/demo-enterprise.ts`](../../packages/prisma-schemas/prisma/seeds/demo-enterprise.ts) | Phải đặt tường minh `true` khi chạy `demo:bootstrap` / `demo:reset` / `db:seed:demo`; từ chối ngay nếu `NODE_ENV=production` hoặc tên DB giống `prod` |
| `DEMO_ALLOWED_DB_HOSTS` | `demo-enterprise.ts` | Mặc định chỉ cho phép `localhost`, `127.0.0.1`, `::1`, `postgres`, `db`, `smartlogi-postgres`; chỉ bổ sung host Neon sandbox khi bootstrap có chủ đích |
| `EXPO_PUBLIC_API_URL` | [`frontend/mobile/driver-app`](../../frontend/mobile/driver-app) | URL HTTPS công khai của `api-gateway` (hoặc Portal Demo API) khi đóng gói EAS Android/iOS |
