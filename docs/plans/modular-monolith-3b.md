# 3B — Modular monolith (`backend/core-api`)

## Mục tiêu

Gộp 6 service NestJS (`iam`, `inventory`, `order`, `logistics`, `customer-api`, `notification`)
vào một ứng dụng `backend/core-api`, **giữ nguyên toàn bộ route `/api/v1/*`** để gateway và
các portal không phải đổi. `gps-ingestion-service` (Go) và `ai-worker` (Cloudflare) giữ
nguyên là độc lập.

## Nguyên tắc

1. **Một lần chuyển, có thể rollback**: mỗi nhóm route được chuyển sang `core-api` bằng cờ
   `CORE_API_ENABLED`; tắt cờ là quay lại service cũ ngay lập tức, không cần sửa code.
2. **Route bất biến**: đường dẫn, HTTP method, payload và response không đổi. Gateway chỉ đổi
   *đích* của request.
3. **Không gộp DB**: tất cả module dùng chung một schema Prisma và cùng cơ chế RLS của 3A.
4. **Mỗi lát cắt phải typecheck sạch** (`tsc --noEmit`) trước khi chuyển sang lát sau.

## Cấu trúc `backend/core-api`

```
src/
  main.ts                     bootstrap (global prefix api/v1, helmet, swagger, sentry)
  app.module.ts               module gốc: cache, throttler, guard, interceptor
  core/                       hạ tầng dùng chung (mỗi thứ chỉ có 1 bản duy nhất)
    prisma/                   PrismaService (tenant context) + PrismaModule
    auth/                     JwtStrategy, GoogleStrategy, JwtAuthGuard, CoreAuthModule
    tenant/                   TenantMiddleware, TenantSchemaInterceptor, AuditLogInterceptor
    http/                     HttpExceptionFilter, RequestLoggingInterceptor
    provisioner/              SchemaProvisioner (DDL + RLS cho tenant schema mới)
    types/                    JwtPayload + re-export permissions
  modules/
    iam/                      ← iam-service        (3B.1) ✅
    wms/                      ← inventory-service  (3B.2)
    orders/                   ← order-service      (3B.3)
    logistics/                ← logistics-service  (3B.4)
    customer/                 ← customer-api       (3B.5)
    notification/             ← notification-service(3B.6)
```

Các script hỗ trợ:
- `scripts/migrate-core.py` — copy file từ service cũ và tự sửa import tương đối.
- `scripts/update-lockfile-core.py` — gộp dependency của 6 service vào importer
  `backend/core-api` của `pnpm-lock.yaml`.

## Lát cắt

| Lát | Nội dung | Route chuyển | Trạng thái |
|-----|----------|---------------|-----------|
| 3B.1 | core-api skeleton + module IAM | `/api/v1/admin`, `/tenant`, `/api-keys`, `/metrics`, `/mobile/auth`, `/client/auth`, `/webhooks/stripe`, `/health` | ✅ xong (static) |
| 3B.2 | module WMS (inventory) | `/inventory`, `/products`, `/warehouses`, `/bins`, `/locations`, `/tasks`, `/waves`, `/wms` | ✅ xong (static) |
| 3B.3 | module Orders | `/orders`, `/clients`, `/tracking`, `/webhooks` | ✅ xong (static) |
| 3B.4 | module Logistics | `/logistics`, `/finance`, `/trips`, `/drivers`, `/vehicles`, `/geofences`, `/gps`, `/driver-app` | ✅ xong (static) |
| 3B.5 | module Customer | `/public`, `/track`, `/client` | ✅ xong (static) |
| 3B.6 | module Notification | `/notifications` | ✅ xong (static) |
| 3B.7 | Gateway → BFF: gom call, chuẩn hoá DTO | `/api/v1/bff/*` | ✅ xong (static) |
| 3B.8 | Outbox pattern cho webhook + billing event | — | ✅ xong (static) |
| — | Decommission: xoá 6 service cũ, core-api nhận port 8081 | toàn bộ | ✅ xong (static) |

### 3B.7 — BFF (gom call + chuẩn hoá DTO)

Module `api/api-gateway/src/bff/`:
- `GET /api/v1/bff/tenant-dashboard` — gom 4 call (`/tenant/dashboard/stats`,
  `/inventory/summary`, `/orders?limit=5`, `/trips?limit=5`) thành 1 response.
- `GET /api/v1/bff/admin-dashboard` — gom call dashboard admin.
- DTO chuẩn hoá trong `bff/dto.ts`: portal chỉ phụ thuộc vào shape này, không
  phụ thuộc shape nội bộ của core-api.
- **Partial failure**: một nguồn lỗi không làm sập cả trang — nguồn lỗi trả
  `null`, được ghi vào `degraded[]` để portal hiển thị cảnh báo.

Các route cũ vẫn được proxy nguyên vẹn (không đổi hợp đồng API cho portal).

### 3B.8 — Outbox pattern

- Bảng `outbox_events` (migration `20240617000000_outbox_events`): sự kiện được
  ghi **cùng transaction** với thay đổi dữ liệu ⇒ không còn trường hợp "đơn
  hàng đã tạo nhưng event chưa phát" (và ngược lại).
- `core/outbox/outbox.service.ts` — ghi event (nhận `tx` để ghi vào đúng
  transaction của request).
- `core/outbox/outbox-dispatcher.service.ts` — worker cron 5s: claim bằng
  `FOR UPDATE SKIP LOCKED` (nhiều instance không gửi trùng), gửi theo kênh
  `KAFKA` / `WEBHOOK`, lỗi thì backoff luỹ thừa (10s→80s), tối đa 5 lần rồi
  đánh dấu `FAILED`.
- Đã thay toàn bộ `kafkaEvent.emit(...)` trực tiếp bằng outbox:
  `order.created`, `order.updated`, `order.cancelled`, `order.bulk_uploaded`,
  `return.requested/approved/rejected/pickup_scheduled`, `payment.recorded`
  (billing của tenant + của client).
- `core/kafka/kafka.module.ts` — producer Kafka dùng chung (`@Global`), thay cho
  2 bản trùng lặp ở order/notification.

### Decommission (sau 3B.6)

- Xoá 6 thư mục service, 6 importer trong `pnpm-lock.yaml`, 6 service block
  trong `docker-compose.yml`.
- `core-api` nhận port **8081** (thay iam-service), gộp env của cả 6 service
  (Kafka, Redis, S3, Stripe, provider email/SMS/push, Google OAuth).
- Gateway: bỏ `CORE_API_MODULES`; mọi route của API NestJS trỏ thẳng
  `core-api`; `depends_on` chỉ còn `core-api`.
- `iam-service` gọi notification qua HTTP ⇒ đổi sang gọi trực tiếp
  `NotificationService` trong cùng tiến trình (không còn network hop).

### Bật/tắt nhóm route

```
CORE_API_MODULES=iam,wms,orders,logistics,customer,notification
```

Bỏ trống ⇒ mọi route về service cũ. Bật từng nhóm để so sánh hành vi, rollback
được bằng cách sửa env + restart gateway (không cần build lại).

### Đối chiếu route (đã kiểm tra tĩnh)

| Service cũ | Số route | Route không có trong core-api |
|------------|----------|-------------------------------|
| iam-service | 86 | 0 |
| inventory-service | 52 | 0 |
| order-service | 25 | 0 |
| logistics-service | 79 | 0 |
| customer-api | 18 | 0 |
| notification-service | 6 | 0 |

core-api hiện có **257 route**, không trùng nhau (đã kiểm tra bằng script quét
`@Controller` + `@Get/@Post/...`).

### Ghi nhận khi gộp

- **Health controller**: 6 service cũ đều có `/health` ⇒ chỉ giữ bản của module IAM
  (bản đầy đủ nhất, có `/health/ready`).
- **`/branches`**: inventory-service và logistics-service đều có controller
  `@Controller("branches")` (trùng route). Gateway vốn không route
  `/api/v1/branches` (portal dùng `/api/v1/tenant/branches` của module IAM) ⇒ giữ
  bản của module WMS, bỏ bản của module Logistics. Khác biệt duy nhất: bản WMS
  không trả kèm quan hệ `manager` trong `GET /branches`.
- **AuthService trùng lặp**: order/logistics/customer có bản `AuthService` riêng
  (login super admin / tenant user) nhưng không controller nào dùng ⇒ bỏ, dùng
  bản của module IAM. `POST /auth/refresh-token` (order-service) được giữ nguyên.
- **Audit log**: module Customer/Notification nay cũng ghi `system_audit_logs`
  cho request không phải GET (trước đó chỉ 4 service có interceptor này).
- **Consumer Kafka**: core-api dùng cùng group id `notification-group` với
  notification-service cũ ⇒ trong lúc chuyển đổi partition được chia giữa hai
  tiến trình (không mất message). Bật nhóm `notification` sau khi dừng
  notification-service để tránh chia partition.
- **BullMQ `routing`**: giữ nguyên tên queue + `RoutingProcessor` (job đã mang
  `tenantId`/`schemaName` từ 3A).
- **Lỗi phát hiện khi gộp**: `POST /api/v1/mobile/gps-batch` (module Logistics)
  trước đây bị rule `/api/v1/mobile` của inventory-service nuốt ⇒ đã thêm rule
  riêng trong gateway.

## Kiểm chứng 3B.1 (static)

- `tsc --noEmit` sạch cho `backend/core-api` và `api/api-gateway`.
- `docker-compose.yml` hợp lệ, đã thêm service `core-api` (port 8087) + cờ `CORE_API_ENABLED`.
- `pnpm-lock.yaml` đã có importer `backend/core-api` (44 dependency + 4 dev dependency).
- **Chưa kiểm chứng runtime** (docker daemon không chạy): cần `docker compose up --build`,
  kiểm tra `/api/v1/health`, đăng nhập admin/tenant, rồi bật `CORE_API_ENABLED=true` và so
  sánh hành vi với `iam-service`.

## Rủi ro đã biết

- **Hai app cùng đọc/ghi DB**: trong lúc bật `CORE_API_ENABLED`, `iam-service` và `core-api`
  cùng chạy. Cả hai dùng chung RLS của 3A nên không rò dữ liệu, nhưng job nền (BullMQ/Kafka
  consumer) phải chỉ chạy ở một bên — module Notification/Logistics chưa chuyển nên chưa có
  rủi ro này.
- **`@nestjs/bullmq` / Kafka consumer**: khi chuyển Logistics + Notification, các consumer
  cùng topic phải dùng group id khác nhau để không xử lý trùng message.
- **Sentry/port**: `core-api` dùng port 8087 tạm thời; khi bỏ service cũ sẽ chuyển về 8081.
