# Sổ tay Vận hành, Triển khai & Khắc phục Sự cố (Operations Runbook)

Tài liệu quy trình dựng môi trường, giới hạn triển khai Free Tier, quản lý bí mật, kiểm tra RLS, vận hành Demo Seed an toàn và xử lý sự cố (Outbox/Webhook DLQ, Rollback) cho SmartLogi AI SaaS.

---

## 1. Bảng Cổng Dịch vụ & Bản đồ Hạ tầng (Docker Compose vs Cloud Tiers)

| Dịch vụ / Thành phần | Cổng mặc định | Chế độ cục bộ (`docker-compose.yml` / Host) | Khả năng triển khai Cloud & Ràng buộc thực tế |
|---|---:|---|---|
| **Postgres 15+/18 + PostGIS** | `5432` | `postgis/postgis:15-3.3` (CI) / PostgreSQL 18 + PostGIS 3.6 (local dev) | Cần managed PostgreSQL có PostGIS (VD: Neon/Supabase/RDS hoặc VM). Bắt buộc tạo role `smartlogi_app` non-superuser cho runtime |
| **Redis 7** | `6379` | `redis:7-alpine` | Bắt buộc **Redis >= 5.0** cho BullMQ v5 (`routing`) & **Redis Streams (`XREADGROUP`/`XACK`/`XAUTOCLAIM`)** của `webhook-service` |
| **Zookeeper + Kafka 7.4** | `2181`, `9092` | `confluentinc/cp-kafka:7.4.0` | Có thể bỏ trống `KAFKA_BROKERS` trong môi trường không có Kafka; `OutboxDispatcher` v2 kiểm tra ACK và chuyển `DEAD_LETTER` thay vì xác nhận giả |
| **LocalStack S3** | `4566` | `localstack/localstack:3.8.0` | Thay bằng S3 hoặc Cloudflare R2 ở staging/prod để lưu ảnh ePOD và chứng từ XNK |
| **Core API** (`backend/core-api`) | `8081` (`3001` dev) | Container **Node 22 LTS** | **Không chạy được trên Vercel Serverless** vì giữ kết nối dài hạn (Postgres ALS TX pool, `@Cron` Outbox, BullMQ worker, Kafka) — cần VM/Container host |
| **API Gateway** (`api/api-gateway`) | `3000` | Container **Node 22 LTS** | Chạy cùng cụm với `core-api`; cần cấp domain HTTPS công khai gán vào `API_INTERNAL_URL` của 4 portal Vercel |
| **Go GPS Ingestion** | `8090` (HTTP), `8091` (UDP) | Container Go 1.22 | **UDP `:8091` bắt buộc chạy trên VPS/VM/Cloud host mở cổng UDP**, không hỗ trợ qua HTTP serverless |
| **Go Webhook Service** | `8092` | Container Go 1.22 | Chạy nội bộ sau `core-api` / `api-gateway`; đọc Redis Streams + DB `webhook_deliveries` |
| **AI Worker** (`workers/ai-worker`) | `8787` | `wrangler dev --local` | Phù hợp **Cloudflare Workers Free/Paid + D1 + KV + Workers AI** (cần `CLOUDFLARE_API_TOKEN` để deploy Production) |
| **4 Web Portals** | `4001–4004` (`8080` Nginx) | Next.js 15 + `portals-proxy` | Đã triển khai 4 project độc lập trên **Vercel (`visionary19`)** (`smartlogi-admin`, `smartlogi-tenant`, `smartlogi-customer`, `smartlogi-pack`) với `NEXT_PUBLIC_DATA_SOURCE=api` |

---

## 2. Quy trình Khởi tạo & Kiểm tra An toàn CSDL (PostgreSQL + RLS)

### Bước 1: Tạo role ứng dụng không có đặc quyền bỏ qua RLS
PostgreSQL superuser luôn vượt qua mọi chính sách RLS. Role ứng dụng kết nối trong `DATABASE_URL` của `core-api` **bắt buộc** phải là non-superuser và `NOBYPASSRLS`:

```sql
CREATE ROLE smartlogi_app WITH LOGIN PASSWORD '<STRONG_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

### Bước 2: Chạy 7 Migrations bằng tài khoản Owner/Migrator
```bash
# Sử dụng user owner/migrator để đẩy toàn bộ 7 migrations (tổng 88 bảng bật ENABLE + FORCE RLS + GIST indexes + grant cho smartlogi_app)
DATABASE_URL="postgresql://postgres:<MIGRATOR_PASS>@localhost:5432/smartlogi" \
  pnpm --filter prisma-schemas exec prisma migrate deploy
```

### Bước 3: Chạy Regression SQL Cô lập Đa khách thuê
Tập lệnh [`tenant-isolation.sql`](../packages/prisma-schemas/prisma/tests/tenant-isolation.sql) thử nghiệm ép buộc dưới role `smartlogi_app`:
1. Kiểm tra metadata `ENABLE` + `FORCE ROW LEVEL SECURITY` trên tập bảng cốt lõi + hardening (`client_api_keys`, `api_idempotency_records`, `public_tracking_grants`, `webhook_deliveries`) + các bảng Enterprise mới (`tractor_units`, `chassis_units`, `container_equipments`, `equipment_assignments`, `yards`, `yard_slots`, `container_gate_events`, `equipment_interchange_receipts`, `contract_rates`, `surcharge_rules`, `dem_det_rules`, `freight_rfqs`, `freight_quotes`, `quote_lines`, `freight_bookings`, `freight_shipments`, `freight_legs`, `freight_invoices`, `freight_ledger_entries`, `payment_allocations`, `dispute_cases`, `trade_documents`, `trade_document_versions`, `customs_declarations`, `customs_status_events`, `hs_code_suggestions`).
2. Truy vấn khi `app.tenant_id` rỗng phải trả về **0 dòng** (fail-closed).
3. Tenant A không đọc được dòng của Tenant B; cập nhật/xóa/chèn chéo tenant văng lỗi PostgreSQL SQLSTATE `42501`.
4. Kiểm chứng `app.bypass_rls = 'on'` chỉ mở quyền đọc toàn cục khi gọi tường minh qua `runAsPlatform()`.

```bash
psql "$MIGRATOR_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f packages/prisma-schemas/prisma/tests/tenant-isolation.sql
```

### Bước 4: Quản lý Demo Seed An toàn (Dev/Demo-Only)
Bộ script tại [`packages/prisma-schemas/prisma/seeds/demo-enterprise.ts`](../packages/prisma-schemas/prisma/seeds/demo-enterprise.ts) **tự động từ chối thực thi** nếu:
- `NODE_ENV=production`, hoặc
- thiếu `ALLOW_DEMO_SEED=true`, hoặc
- hostname `DATABASE_URL` không nằm trong `DEMO_ALLOWED_DB_HOSTS` (mặc định `localhost,127.0.0.1,::1,postgres,db,smartlogi-postgres`), hoặc tên DB chứa `prod`.

```bash
ALLOW_DEMO_SEED=true SMARTLOGI_DEMO_MODE=true NODE_ENV=development pnpm demo:reset
ALLOW_DEMO_SEED=true SMARTLOGI_DEMO_MODE=true NODE_ENV=development pnpm db:seed:demo
ALLOW_DEMO_SEED=true SMARTLOGI_DEMO_MODE=true NODE_ENV=development pnpm demo:verify
```

---

## 3. Quản trị Bí mật & Biến Môi trường Bắt buộc

Xem đầy đủ ma trận theo từng môi trường tại [deployment/ENV_MATRIX.md](deployment/ENV_MATRIX.md). Các biến nhạy cảm trọng yếu:

| Biến môi trường | Dịch vụ sử dụng | Yêu cầu bảo mật & Mặc định |
|---|---|---|
| `JWT_SECRET` | `core-api`, `api-gateway`, `ai-worker` | **Bắt buộc** (Gateway từ chối khởi động nếu thiếu). Phải khớp giữa cả 3 tiến trình, tối thiểu 32 ký tự ngẫu nhiên |
| `AI_API_KEY` | `core-api` -> `ai-worker` | Token gọi nội bộ qua header `x-ai-api-key` cho tác vụ BullMQ `RoutingProcessor` |
| `GPS_AUTH_TOKEN` | `gps-ingestion-service` | Bearer token cho thiết bị gửi qua HTTP `POST /gps/batch` (so sánh `ConstantTimeCompare`) |
| `GPS_UDP_HMAC_SECRET` | `gps-ingestion-service` | Khóa bí mật **tách riêng khỏi `GPS_AUTH_TOKEN`** dùng ký gói tin UDP `:8091` (canonical v2 HMAC-SHA256 + ±300s + bounded FIFO replay cache) |
| `GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED` | `gps-ingestion-service` | **Mặc định `false`**. Tuyệt đối giữ `false` ở staging/production |
| `WEBHOOK_AUTH_TOKEN` | `core-api` -> `webhook-service` | Bảo vệ **cả** endpoint nội bộ `/deliver`, `/redrive` và `GET /deliveries` |
| `NEXT_PUBLIC_DATA_SOURCE` | Cả 4 Next.js portals | `api` trên Staging / Vercel `visionary19` / Production (không fallback về mock khi lỗi); `mock` chỉ cho demo tĩnh cô lập |
| `API_INTERNAL_URL` | Server Next.js Vercel (`next.config.*`) | URL HTTPS của `api-gateway` công khai (chỉ bật rewrite `/api/v1/:path*` khi biến này khác rỗng) |

### Quy trình xoay khóa (Secret Rotation)
- **Xoay `GPS_UDP_HMAC_SECRET` / `JWT_SECRET`**: Thực hiện trong cửa sổ bảo trì ngắn hoặc hỗ trợ ký kép ở thiết bị IoT; sau khi đổi `JWT_SECRET`, toàn bộ phiên đăng nhập cũ sẽ hết hạn `401 Unauthorized` và người dùng/app phải đăng nhập lại.
- **Khóa Client Webhook (`ClientWebhook.secretToken`)**: API `GET` chỉ trả về giá trị đã che (`whsec_****`). Khi đối tác cần khóa mới, xóa và tạo đăng ký webhook mới hoặc cập nhật tường minh trường `secretToken`; mọi cập nhật trạng thái/URL không mang khóa mới sẽ **giữ nguyên** `secretToken` hiện có trong DB.

---

## 4. Vận hành Hàng ngày & Giám sát Lỗi

### 4.1. Giám sát Health & Readiness
- Gateway: `GET /health`, `GET /api/gateway/health` và thống kê circuit breaker tại `GET /api/gateway/metrics`.
- Core API: `GET /api/v1/health` (liveness) và `GET /api/v1/health/ready` (kiểm tra kết nối PostgreSQL).
- Go GPS & Go Webhook: `GET /health` trên các cổng `:8090` và `:8092`.
- AI Worker: `GET /health` trên `:8787`.

### 4.2. Xử lý Sự cố Transactional Outbox v2 (`outbox_events`) & Webhook DLQ
Vì `OutboxDispatcher` v2 vận hành theo ngữ nghĩa **at-least-once** với lease lock (`leaseUntil`, `lockedBy`), kiểm tra ACK `emitAsync()`, tối đa `5` lần thử và `DEAD_LETTER`:
1. Kiểm tra danh sách sự kiện Outbox lỗi/DLQ qua UI hoặc API:
   - `admin-portal` `/admin/geography` hoặc `GET /api/v1/admin/dashboard/outbox` (`SUPER_ADMIN`).
   - Hoặc nội bộ tenant qua `GET /api/v1/webhooks/outbox`.
   - Truy vấn SQL kiểm tra trực tiếp nếu cần:
     ```sql
     SELECT id, event_id, tenant_id, channel, topic, attempts, dead_letter_reason, last_error, created_at
     FROM public.outbox_events
     WHERE status IN ('FAILED', 'DEAD_LETTER')
     ORDER BY created_at DESC LIMIT 50;
     ```
2. Sau khi khắc phục nguyên nhân gốc (Kafka broker, `WEBHOOK_AUTH_TOKEN`, hoặc URL đối tác hết lỗi), bấm **Redrive** trên giao diện hoặc gọi `POST /api/v1/admin/dashboard/outbox/:id/redrive` / `POST /api/v1/webhooks/outbox/:id/redrive` (với Go Webhook Streams DLQ dùng `POST /redrive` kèm `WEBHOOK_AUTH_TOKEN`). Không xóa mù bản ghi audit.

### 4.3. Xử lý Hàng đợi Ngoại tuyến Tài xế (`DEAD_LETTER`)
Ứng dụng di động (`driver-app`) tạo `id` bằng CSPRNG UUID, **lưu trạng thái `SYNCING` xuống `AsyncStorage` trước khi gọi HTTP** để chống trùng lặp khi app crash giữa chừng, giữ thứ tự monotonic và thử lại tối đa 5 lần với exponential backoff + jitter (`2s -> 4s -> 8s -> 16s -> 32s`, tối đa `300s`). Gói tin lỗi `4xx` không hồi phục (hoặc `409 Conflict` đổi payload) hoặc quá 5 lần chuyển sang `DEAD_LETTER` kèm `lastError`, có hỗ trợ `retryDeadLetter()` cho tài xế/điều phối viên xử lý.

### 4.4. Sao lưu, Khôi phục & Rollback Bản phát hành
Quy trình chi tiết cho cả 4 lớp (Vercel `visionary19`, cụm Backend container, PostgreSQL `pg_dump`/migrations + `tenant-isolation.sql`, Cloudflare Worker & `git revert`) được quy định chuẩn hóa tại [deployment/ROLLBACK.md](deployment/ROLLBACK.md).
