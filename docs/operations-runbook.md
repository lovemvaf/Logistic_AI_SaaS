# Sổ tay Vận hành, Triển khai & Khắc phục Sự cố (Operations Runbook)

Tài liệu quy trình dựng môi trường, giới hạn triển khai Free Tier, quản lý bí mật, kiểm tra RLS và xử lý sự cố cho SmartLogi AI SaaS.

---

## 1. Bảng Cổng Dịch vụ & Bản đồ Hạ tầng (Docker Compose vs Cloud Tiers)

| Dịch vụ / Thành phần | Cổng mặc định | Chế độ cục bộ (`docker-compose.yml`) | Khả năng triển khai Free Tier & Ràng buộc thực tế |
|---|---:|---|---|
| **Postgres 15 + PostGIS 3.3** | `5432` | `postgis/postgis:15-3.3` (`smartlogi`) | Cần managed PostgreSQL có PostGIS (VD: Neon/Supabase/RDS hoặc VM). Cần tạo role `smartlogi_app` non-superuser |
| **Redis 7** | `6379` | `redis:7-alpine` | Cần Redis cho BullMQ `routing`, cache & active GPS |
| **Zookeeper + Kafka 7.4** | `2181`, `9092` | `confluentinc/cp-kafka:7.4.0` | Có thể tắt trong `core-api` khi không đặt `KAFKA_BROKERS` (hệ thống bỏ qua consumer không lỗi khởi động) |
| **LocalStack S3** | `4566` | `localstack/localstack:3.8.0` | Thay bằng S3/Cloudflare R2 ở staging/prod để lưu ảnh ePOD |
| **Core API** (`backend/core-api`) | `8081` (`3001` dev) | Container Node 20 | **Không chạy được trên Vercel Serverless** vì giữ kết nối dài hạn (Postgres pool, `@Cron` Outbox, BullMQ worker, Kafka) — cần VM/Container host |
| **API Gateway** (`api/api-gateway`) | `3000` | Container Node 20 | Chạy cùng cluster với `core-api` |
| **Go GPS Ingestion** | `8090` (HTTP), `8091` (UDP) | Container Go 1.22 | **UDP `:8091` bắt buộc chạy trên VPS/VM/Cloud host mở cổng UDP**, không hỗ trợ qua HTTP serverless |
| **Go Webhook Service** | `8092` | Container Go 1.22 | Chạy nội bộ sau `core-api` / `api-gateway` |
| **AI Worker** (`workers/ai-worker`) | `8787` | `wrangler dev` | Phù hợp **Cloudflare Workers Free/Paid + D1 + KV + Workers AI** (bị giới hạn quota Neurons/ngày trên free plan) |
| **4 Web Portals + Proxy** | `4001–4004`, `8080` | Next.js 15 + `portals-proxy` Nginx | Triển khai được độc lập trên **Vercel**. Lưu ý: `admin-portal` triển khai riêng (demo `mock` mode) không đồng nghĩa 3 portal còn lại tự có trên cùng domain `smartlogi.vercel.app` |

---

## 2. Quy trình Khởi tạo & Kiểm tra An toàn CSDL (PostgreSQL + RLS)

### Bước 1: Tạo role ứng dụng không có đặc quyền bỏ qua RLS
PostgreSQL superuser luôn vượt qua mọi chính sách RLS. Role ứng dụng kết nối trong `DATABASE_URL` của `core-api` **bắt buộc** phải là non-superuser và `NOBYPASSRLS`:

```sql
CREATE ROLE smartlogi_app WITH LOGIN PASSWORD '<STRONG_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

### Bước 2: Chạy Migration bằng tài khoản Owner/Migrator
```bash
# Sử dụng user owner để đẩy schema + migration RLS (51 bảng + 7 bảng hardening + GIST indexes + grant cho smartlogi_app)
DATABASE_URL="postgresql://postgres:<MIGRATOR_PASS>@localhost:5432/smartlogi" \
  pnpm --filter prisma-schemas exec prisma migrate deploy
```

### Bước 3: Chạy Regression SQL Cô lập Đa khách thuê
Tập lệnh [`tenant-isolation.sql`](../packages/prisma-schemas/prisma/tests/tenant-isolation.sql) thử nghiệm ép buộc dưới role `smartlogi_app`:
1. Bật `FORCE ROW LEVEL SECURITY` trên bảng tenant.
2. Truy vấn khi `app.tenant_id` rỗng phải trả về **0 dòng** (fail-closed).
3. Tenant A không đọc được dòng của Tenant B; cập nhật/xóa/chèn chéo tenant văng lỗi PostgreSQL SQLSTATE `42501`.
4. Kiểm chứng `app.bypass_rls = 'on'` chỉ mở quyền đọc toàn cục khi gọi tường minh qua `runAsPlatform()`.

```bash
psql "$MIGRATOR_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f packages/prisma-schemas/prisma/tests/tenant-isolation.sql
```

---

## 3. Quản trị Bí mật & Biến Môi trường Bắt buộc

| Biến môi trường | Dịch vụ sử dụng | Yêu cầu bảo mật & Mặc định |
|---|---|---|
| `JWT_SECRET` | `core-api`, `api-gateway`, `ai-worker` | **Bắt buộc** (Gateway từ chối khởi động nếu thiếu). Phải khớp giữa cả 3 tiến trình, tối thiểu 32 ký tự ngẫu nhiên |
| `AI_API_KEY` | `core-api` -> `ai-worker` | Token gọi nội bộ qua header `x-ai-api-key` cho tác vụ BullMQ `RoutingProcessor` |
| `GPS_AUTH_TOKEN` | `gps-ingestion-service` | Bearer token cố định cho thiết bị gửi qua HTTP `POST /gps/batch` (so sánh `ConstantTimeCompare`) |
| `GPS_UDP_HMAC_SECRET` | `gps-ingestion-service` | Khóa bí mật ký gói tin UDP `:8091` (HMAC-SHA256 + timestamp <= 300s + replay cache) |
| `GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED` | `gps-ingestion-service` | **Mặc định `false`**. Tuyệt đối giữ `false` ở staging/production |
| `WEBHOOK_AUTH_TOKEN` | `core-api` -> `webhook-service` | Bảo vệ endpoint nội bộ `/deliver` của Go webhook service |
| `NEXT_PUBLIC_DATA_SOURCE` | Cả 4 Next.js portals | `mock` (demo tĩnh) hoặc `api` (gọi backend thật, không fallback về mock khi lỗi) |

### Quy trình xoay khóa (Secret Rotation)
- **Xoay `GPS_UDP_HMAC_SECRET` / `JWT_SECRET`**: Thực hiện trong cửa sổ bảo trì ngắn hoặc hỗ trợ ký kép ở thiết bị IoT; sau khi đổi `JWT_SECRET`, toàn bộ phiên đăng nhập cũ sẽ hết hạn `401 Unauthorized` và người dùng/app phải đăng nhập lại.
- **Khóa Client Webhook (`ClientWebhook.secretToken`)**: API `GET` chỉ trả về giá trị đã che (`whsec_****`). Khi đối tác cần khóa mới, xóa và tạo đăng ký webhook mới hoặc cập nhật tường minh trường `secretToken`; mọi cập nhật trạng thái/URL không mang khóa mới sẽ **giữ nguyên** `secretToken` hiện có trong DB.

---

## 4. Vận hành Hàng ngày & Giám sát Lỗi

### 4.1. Giám sát Health & Readiness
- Gateway: `GET /health` và `GET /api/gateway/health`, thống kê circuit breaker tại `GET /api/gateway/metrics`.
- Core API: `GET /api/v1/health` (liveness) và `GET /api/v1/health/ready` (kiểm tra kết nối PostgreSQL).
- Go GPS & Go Webhook: `GET /health` trên các cổng `:8090` và `:8092`.
- AI Worker: `GET /health` trên `:8787`.

### 4.2. Xử lý Sự cố Transactional Outbox (`outbox_events`)
Vì `OutboxDispatcher` vận hành theo ngữ nghĩa **at-least-once** với tối đa `5` lần thử:
1. Kiểm tra sự kiện bị kẹt hoặc lỗi vĩnh viễn:
   ```sql
   SELECT id, tenant_id, channel, topic, attempts, last_error, created_at
   FROM public.outbox_events
   WHERE status = 'FAILED'
   ORDER BY created_at DESC LIMIT 50;
   ```
2. Sau khi khắc phục nguyên nhân (Kafka broker hoặc URL đối tác hết lỗi), có thể xếp lịch phát lại bằng cách đặt lại `status = 'PENDING', attempts = 0, available_at = now()`. Không xóa mù bản ghi audit.

### 4.3. Xử lý Hàng đợi Ngoại tuyến Tài xế (`DEAD_LETTER`)
Ứng dụng di động (`driver-app`) thử lại tối đa 5 lần với exponential backoff (`2s -> 4s -> 8s -> 16s -> 32s`, tối đa `300s`). Gói tin lỗi `4xx` vĩnh viễn hoặc quá 5 lần chuyển sang trạng thái `DEAD_LETTER` kèm `lastError` trong `AsyncStorage`, hiển thị cho tài xế/điều phối viên kiểm tra đối chiếu mà không kẹt vòng lặp vô hạn.

### 4.4. Sao lưu, Khôi phục & Rollback Bản phát hành
1. **Sao lưu định kỳ (Backup)**: Dùng `pg_dump --format=custom --no-owner` từ user có quyền đọc toàn bảng (tránh bị RLS lọc thiếu dòng của từng tenant!). Khôi phục thử trên DB staging trước khi chấp nhận.
2. **Rollback Code & DB**:
   - Trước khi triển khai bản mới chứa migration Prisma, luôn snapshot PostgreSQL.
   - Nếu `core-api` bản mới phát sinh lỗi nghiêm trọng không chạm schema: hạ container về image tag trước và kiểm tra lại `health/ready`.
   - Nếu cần hoàn tác chính sách RLS hay bảng mới: tạo migration hoàn tác tường minh thay vì xóa tay trên production.
3. **Chuyển nhanh chế độ Frontend khi bảo trì Backend**: Đặt `NEXT_PUBLIC_DATA_SOURCE=mock` chỉ trên môi trường preview/demo độc lập; môi trường sản xuất/UAT phải giữ `api` để phát hiện lỗi thật thay vì hiển thị dữ liệu seed gây nhầm lẫn.
