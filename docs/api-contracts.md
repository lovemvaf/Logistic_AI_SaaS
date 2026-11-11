# Hợp đồng API & Ma trận Định tuyến (Verified API Contracts)

Tài liệu đối chiếu trực tiếp toàn bộ endpoint từ:
- [`api/api-gateway/src/config/services.config.ts`](../api/api-gateway/src/config/services.config.ts) & [`bff.controller.ts`](../api/api-gateway/src/bff/bff.controller.ts)
- **70 controller files (407 endpoint decorators)** trong `backend/core-api/src/modules/`
- Go `gps-ingestion-service`, Go `webhook-service`, Cloudflare `workers/ai-worker` và cảnh báo về `backend/rust-api`.

> **Lưu ý kiểm chứng**: Mọi đường dẫn dưới đây đã được quét trực tiếp từ mã nguồn decorator/router và đối soát tĩnh bởi [`scripts/static-verify.py`](../scripts/static-verify.py). Toàn bộ suite build, typecheck (`tsc --noEmit`), parity `api-gateway`, AI Worker, Go `-race`, Rust workspace và PostgreSQL RLS đã **PASSED** trên GitHub Actions ([Run 43023689371](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43023689371), commit `75cf1ea`); kiểm thử E2E HTTP xuyên container live hiện vẫn chờ môi trường staging.

---

## 1. API Gateway (`api/api-gateway`, cổng `3000`) & BFF

### Quy chuẩn chung
- **Xác thực Edge**: Mọi route không thuộc `PUBLIC_PATHS` phải mang JWT `Authorization: Bearer <token>` (hoặc `x-api-key` theo luồng xác thực key).
- **Định tuyến `ROUTE_RULES`**: So khớp theo **prefix dài nhất trên ranh giới segment** (`matchRoute`), bảo đảm `/api/v1/gps/ingest` đi xuống Go GPS thay vì bị `/api/v1/gps` nuốt.
- **Circuit Breaker (`ProxyMiddleware`)**: Ngắt mạch sau `5` lỗi kết nối liên tiếp trong `30s`.
- **BFF Endpoints nội bộ Gateway**:
  - `GET /api/v1/bff/tenant-dashboard`: Tổng hợp số liệu tổng quan tenant cho cổng quản trị.
  - `GET /api/v1/bff/admin-dashboard`: Tổng hợp số liệu tổng quan toàn nền tảng (`SUPER_ADMIN`).
- **Gateway Utility Endpoints (bỏ qua proxy downstream)**: `GET /health`, `GET /api/health`, `GET /routes`, `GET /api/gateway/health`, `GET /api/gateway/metrics`, `GET /api/docs`.

### `PUBLIC_PATHS` (Không bắt buộc JWT tại Gateway)
`/health`, `/api/health`, `/routes`, `/api/docs`, `/api/gateway/health`, `/api/v1/public`, `/api/v1/track`, `/api/v1/health`, `/api/v1/gps/ingest` *(xác thực token riêng tại Go GPS service)*, `/api/v1/webhooks/stripe` *(xác thực chữ ký Stripe)*, `/api/v1/inbound/webhooks`, `/api/v1/tenant/auth`, `/api/v1/admin/auth`, `/api/v1/client/auth`, `/api/v1/mobile/auth`.

---

## 2. Quy chuẩn Request, Error Envelope & Idempotency (`backend/core-api`, prefix `/api/v1`)

- **ValidationPipe toàn cục** ([`main.ts`](../backend/core-api/src/main.ts)): `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Trường thừa ngoài DTO sẽ bị từ chối với HTTP `400`.
- **Chuẩn phản hồi lỗi** ([`http-exception.filter.ts`](../backend/core-api/src/core/http/http-exception.filter.ts)):
  ```json
  {
    "ok": false,
    "statusCode": 400,
    "message": "Mô tả lỗi cụ thể hoặc mảng lỗi validation",
    "timestamp": "2026-11-11T10:00:00.000Z",
    "path": "/api/v1/..."
  }
  ```
- **Phân trang chuẩn**: Các endpoint danh sách kẹp `page >= 1`, `1 <= limit <= 100` và trả cấu trúc `{ data: [...], meta: { total, page, limit, totalPages } }` (một số portal alias trả mảng trực tiếp khi `frontend` đọc thẳng).
- **Idempotency di động (`X-Sync-Id` / `Idempotency-Key`)** ([`idempotency.interceptor.ts`](../backend/core-api/src/core/http/idempotency.interceptor.ts)): Gắn cho các request ghi offline (`POST`/`PATCH`/`DELETE`), khóa cache theo `${tenantScope}:${userScope}:${routeScope}:${syncId}`, TTL `24h`, tối đa `5.000` khóa in-memory; request trùng đang xử lý trả `409 ConflictException`.

---

## 3. Hợp đồng `backend/core-api` (70 Controllers / 407 Endpoint Decorators)

### 3.1. Module IAM & Platform Governance (23 Controllers / 106 Endpoints)

| Controller | Prefix (`/api/v1/...`) | Số endpoint | Bảo vệ RBAC chính | Đường dẫn tiêu biểu |
|---|---|---:|---|---|
| `admin-auth` | `/admin/auth` | 7 | Public login / JWT profile | `POST /login`, `POST /google`, `POST /forgot-password`, `POST /reset-password`, `POST /change-password`, `GET /profile`, `PATCH /profile` |
| `admin-tenants` | `/admin/tenants` | 5 | `@RequireRoles(SUPER_ADMIN)` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `admin-billing` | `/admin/billing` | 8 | `@RequireRoles(SUPER_ADMIN)` + `BillingManage` khi ghi | `GET /`, `GET /plans`, `POST /plans`, `PUT /plans/:id`, `DELETE /plans/:id`, `GET /invoices`, `POST /invoices`, `POST /payments` |
| `admin-dashboard` | `/admin/dashboard` | 2 | `@RequireRoles(SUPER_ADMIN)` | `GET /stats`, `GET /logistics` (bọc `runAsPlatform`) |
| `admin-audit-logs` | `/admin/audit-logs` | 2 | `@RequireRoles(SUPER_ADMIN)` | `GET /`, `GET /actions` |
| `tenant-auth` | `/tenant/auth` | 9 | Public auth + JWT tenant | `POST /login`, `POST /google`, `POST /refresh`, `POST /forgot-password`, `POST /reset-password`, `POST /change-password`, `GET /profile`, `PATCH /profile`, `GET /tenants` |
| `client-auth` | `/client/auth` | 8 | Public auth + JWT client (`schemaName` từ JWT) | `POST /login`, `POST /google`, `POST /refresh`, `POST /forgot-password`, `POST /reset-password`, `POST /change-password`, `GET /profile`, `PATCH /profile` |
| `mobile-auth` | `/mobile/auth` | 5 | Public auth | `POST /login`, `POST /google`, `POST /refresh`, `POST /forgot-password`, `POST /reset-password` |
| `auth` | `/auth` | 1 | Legacy alias | `POST /login` |
| `tenant-users` | `/tenant/users` | 6 | `@ExcludeRoles(CUSTOMER_CLIENT)` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/roles` |
| `tenant-roles` | `/tenant/roles` | 5 | `@ExcludeRoles(CUSTOMER_CLIENT)` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `branches` (IAM) | `/tenant/branches` | 5 | `@ExcludeRoles(CUSTOMER_CLIENT)` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `feature-flags` | `/tenant/feature-flags` | 6 | `@ExcludeRoles(CUSTOMER_CLIENT)` | `GET /`, `GET /check/:key`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /bulk` |
| `tenant-settings` | `/tenant/settings` | 2 | `@ExcludeRoles(CUSTOMER_CLIENT)` | `GET /`, `PATCH /` |
| `tenant-billing` | `/tenant/billing` | 4 | `@ExcludeRoles(CUSTOMER_CLIENT)` | `GET /plan`, `GET /invoices`, `POST /payments`, `POST /payment-intent` |
| `tenant-audit-logs` | `/tenant/audit-logs` | 2 | `@ExcludeRoles(CUSTOMER_CLIENT)` + lọc bắt buộc `tenantId` | `GET /`, `GET /actions` |
| `tenant-dashboard` | `/tenant/dashboard` | 1 | `@ExcludeRoles(CUSTOMER_CLIENT)` | `GET /stats` |
| `api-keys` & `api-key-verify` | `/api-keys` | 5 | `@ExcludeRoles(CUSTOMER_CLIENT)` (`verify` nội bộ) | `GET /`, `POST /`, `DELETE /:id`, `POST /:id/revoke`, `POST /verify` |
| `iam-portal-aliases` | `/` (root `/api/v1`) | 19 | `@ExcludeRoles(CUSTOMER_CLIENT)` | `/users*` (7), `/roles*` (6), `/settings` (`GET/PATCH`), `/dashboard/summary`, `/reports/{summary,on-time,costs,fleet}` |
| `stripe-webhook`, `health`, `metrics` | `/webhooks/stripe`, `/health`, `/metrics` | 4 | Signature / Public ops | `POST /webhooks/stripe`, `GET /health`, `GET /health/ready`, `GET /metrics` |

### 3.2. Module WMS — Quản lý Kho & Đóng gói (13 Controllers / 93 Endpoints)

Mọi controller nội bộ thuộc nhóm WMS đều gắn `@ExcludeRoles(Roles.CUSTOMER_CLIENT)`:

| Controller | Prefix (`/api/v1/...`) | Số endpoint | Đường dẫn chính |
|---|---|---:|---|
| `warehouses` & `branches` | `/warehouses`, `/branches` | 10 | CRUD đầy đủ + `PATCH /warehouses/:id/soft-delete` |
| `locations` & `bins` | `/locations`, `/bins` | 10 | `/locations/{zones,racks,bins}` (`GET`/`POST`), `/bins` (`GET`, `GET /:id`, `POST`, `PATCH /:id`) |
| `products` | `/products` | 7 | `GET /`, `GET /:id`, `POST /`, `POST /import`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/soft-delete` |
| `inventory` & `adjustments` | `/inventory`, `/inventory/adjustments` | 9 | `GET /`, `GET /summary`, `GET /ledger`, `POST /adjust`, `POST /receive`, `POST /transfer`, `POST /putaway-suggestion`, `GET /:id`, `GET /adjustments` |
| `cycle-counts` | `/inventory/cycle-counts` | 6 | `POST /`, `GET /`, `GET /:id`, `POST /:id/submit`, `POST /:id/approve`, `PATCH /:id/status` |
| `waves` & `tasks` | `/waves`, `/tasks` | 10 | `/waves` (`POST /generate`, `POST /allocate`, `GET /`, `GET /:id`), `/tasks` (`GET /`, `POST /`, `POST /:id/assign`, `GET /:id`, `POST /:id/confirm`, `POST /:id/complete`) |
| `mobile` (PDA scan) | `/mobile` | 2 | `GET /sync`, `POST /scan-logs` |
| `warehouse-ops` | `/inventory/ops` | 20 | Ca & thiết bị (`POST /shift/start`, `PATCH /shift/:id/end`, `POST /equipment/checkout`, `PATCH /equipment/:id/return`, `GET /equipment/logs`), Pack log (`POST /pack-log`, `GET /pack-log`, `POST /pack-log/next`, `POST /pack-log/scan`, `GET /pack-log/summary`, `GET /pack-log/anomalies`, `POST /pack-log/predict`, `POST /pack-log/:packCode/seal`, `GET /pack-log/:packCode`), SKU lookup (`GET /skus`, `GET /skus/barcode/:barcode`, `GET /skus/:sku`), Đính chính (`GET/POST /corrections`, `PATCH /corrections/:id`) |
| `wms-portal-aliases` | `/warehouses/bins`, `/equipment`, `/packing-sessions`, `/stations`, `/staff` | 19 | Alias phục vụ Pack Station & Tenant Portal (gồm `GET /packing-sessions/active`, `POST /packing-sessions/:id/seal`, ...) |

### 3.3. Module Orders & Returns (8 Controllers / 48 Endpoints)

| Controller | Prefix (`/api/v1/...`) | Số endpoint | Đường dẫn & Quyền đáng chú ý |
|---|---|---:|---|
| `orders` | `/orders` | 13 | `@ExcludeRoles(CUSTOMER_CLIENT)`: `POST /`, `GET /`, `GET /track/:code`, `POST /assign-trip`, `GET /:id/{live,sla,tracking}`, `GET /:id`, `PATCH /:id`, `POST /:id/cancel`, `POST /:id/status`, `POST /:id/partial`, `PATCH /:id/reschedule` |
| `bulk-upload` | `/orders/bulk` | 1 | `POST /upload` (`@ExcludeRoles(CUSTOMER_CLIENT)`) |
| `orders-portal-aliases` | `/tenant/clients`, `/customers`, `/order-partials` | 13 | Quản lý hạn mức tín dụng (`PATCH /tenant/clients/:id/credit`), thống kê khách B2B (`/customers/:id/{stat,reviews}`), xử lý giao một phần |
| `returns` (Orders RMA) | `/` | 9 | `POST/GET /orders/:orderId/return-requests`, `GET /return-requests/:id`, `PATCH /return-requests/:id/{approve,reject}`, `POST /return-requests/:id/{pickup,inspect,refund}` *(tất cả trừ `/return-reasons` chặn `CUSTOMER_CLIENT`)* |
| `clients`, `tracking`, `webhooks`, `auth` | `/clients`, `/tracking`, `/webhooks`, `/auth` | 12 | Khách B2B nội bộ (`@ExcludeRoles(CUSTOMER_CLIENT)`), `POST /tracking/events`, `GET/POST/PATCH :id/status/DELETE /webhooks`, `POST /auth/refresh-token` |

### 3.4. Module Logistics, Fleet, GPS, COD & Driver App (17 Controllers / 124 Endpoints)

| Controller | Prefix (`/api/v1/...`) | Số endpoint | Đường dẫn & Bảo vệ chính |
|---|---|---:|---|
| `logistics` | `/logistics` | 43 | Chuyến/shipments/tối ưu bất đồng bộ (`POST /routing/optimize-async`, `GET/POST apply`), báo cáo (`reports/{trips,fleet}`), tài xế (`drivers/ranking`, `drivers/:id/trip-log`), xe (`fuel`, `maintenance`), `geofences`, `sos` (`acknowledge`, `resolve`) |
| `trips`, `drivers`, `vehicles`, `geofences`, `gps` | `/trips`, `/drivers`, `/vehicles`, `/geofences`, `/gps` | 25 | CRUD chuẩn cho đội xe, tuyến, vùng địa lý và `POST /gps/batch` |
| `logistics-portal-aliases` | `/finance`, `/tenant/ai-insights` | 15 | `@ExcludeRoles(CUSTOMER_CLIENT, DRIVER)`: `/finance/{cod-remittances,bank-transactions,expenses,invoices}` + `/tenant/ai-insights` (`GET /`, `GET /:id`, `POST /:id/decision`) |
| `finance` & `cod-remittances` | `/logistics/finance`, `/finance/cod` | 13 | `POST /logistics/finance/reconcile` (đối chiếu sao kê ưu tiên `qrCodeToken` / mã phiếu trong `$transaction`), duyệt/từ chối chi phí & SOS, duyệt/từ chối COD |
| `logistics/returns` | `/logistics/returns` | 7 | `GET /`, `GET /:id`, `POST /:id/{create-pickup-trip,confirm-pickup,complete-return,inspect,refund}` (`completeReturn` dùng `updateMany` nguyên tử chống cộng tồn lặp) |
| `driver-app`, `mobile-trips`, `mobile-gps`, `mobile-wallet`, `upload` | `/driver-app`, `/mobile/*` | 11 | Khóa ownership `driver.id === trip.driverId`, `IdempotencyInterceptor` (`X-Sync-Id`), `POST /mobile/uploads/pod/:deliveryId` giới hạn JPEG/PNG/WebP <= 10MB |
| `ai-management` & `ai-models` | `/logistics/ai`, `/ai/models` | 10 | CRUD metadata model & feedback (`ai_models`, `ai_feedbacks`) |

### 3.5. Module Customer & Public Tracking + Notification (9 Controllers / 36 Endpoints)

| Controller | Prefix (`/api/v1/...`) | Số endpoint | Đường dẫn chính |
|---|---|---:|---|
| `client-portal` | `/client` | 4 | `GET /dashboard`, `GET /stock`, `GET /profile`, `PATCH /profile` (`client_id` từ JWT) |
| `client-orders`, `client-inventory`, `client-invoices`, `client-returns`, `client-webhooks` | `/client/*` | 17 | Đơn B2B + `POST /cancel`, tồn kho ký gửi, hóa đơn + `POST /:id/{pay,payments}` hỗ trợ thanh toán một phần, hoàn trả, webhook cá nhân (SSRF + mask secret) |
| `public-tracking` | `/public` và `/track` | 7 | Public PII-safe whitelist: `/public/{track,verify}/:code`, `/public/track/:code/{live,sla}`, `/track/:code{,/live,/sla}` |
| `notifications` & `event` | `/notifications` | 8 | `GET /`, `GET /unread-count`, `POST /send`, `PUT /read`, `PUT|POST /read-all`, `GET /events`, `DELETE /:id` + Kafka Event Consumer |

---

## 4. Dịch vụ Go, AI Worker & Rust API Thử nghiệm

### 4.1. Go GPS Ingestion Service ([`backend/gps-ingestion-service/main.go`](../backend/gps-ingestion-service/main.go))
- **HTTP (`:8090`, Gateway `/api/v1/gps/ingest`)**: `POST /gps/batch`, `GET /health`. Xác thực `Authorization: Bearer <GPS_AUTH_TOKEN>` dùng `constantTimeBearerMatch` (`subtle.ConstantTimeCompare`).
- **UDP Socket (`:8091`)**: Mặc định bật chế độ xác thực chặt (`GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED=false`). Packet JSON phải kèm chữ ký HMAC-SHA256 hợp lệ (`verifyUDPPacket`), `timestamp` trong cửa sổ ±300s và chống gửi lặp qua `replayCache`.
- **Kiểm định & Geofence**: Ràng buộc tọa độ (`-90..90`, `-180..180`, tốc độ `0..150 m/s`), kiểm tra **mọi điểm trong batch** theo thứ tự thời gian qua PostGIS `ST_Contains`, chuyển `tripId` rỗng thành SQL `NULL`, chống spam SOS trong cửa sổ cooldown `5` phút.

### 4.2. Go Webhook Service ([`backend/webhook-service/main.go`](../backend/webhook-service/main.go))
- **Cổng `:8092` (Gateway `/api/v1/inbound/webhooks`)**: `POST /deliver`, `GET /health`.
- Chặn SSRF qua `validateWebhookURL` + `isRestrictedIP`: chỉ cho phép `https://` (trừ khi dev tắt tường minh), phân giải DNS và chặn loopback (`127.0.0.0/8`, `::1`), IP private RFC1918, link-local (`169.254.0.0/16`), CGNAT (`100.64.0.0/10`) trước khi gửi và chặn redirect. Tự động che `secretToken` dạng `whsec_****`.

### 4.3. Cloudflare AI Worker ([`workers/ai-worker`](../workers/ai-worker))
- Mount song song tại `/ai` và `/api/v1/ai` cùng route gốc `POST /routing/solve` (xác thực JWT Bearer hoặc header nội bộ `x-ai-api-key`):
  - `POST /api/v1/ai/v1/chat`: Chat & Vision (`images`), bọc dữ liệu không tin cậy bằng `wrapUntrustedData`.
  - `POST /api/v1/ai/v1/predict/{demand,delivery-time,churn}` & `/v1/analyze`: Trả kèm `method` (`llm_cf_or_openai` hoặc `deterministic_heuristic_fallback`), `fallback_used`, `evaluation_status: "unmeasured"`.
  - `POST /api/v1/ai/v1/detect/anomalies`: Z-score sample stddev, trả `min_recommended_samples: 5` và `data_sufficiency`.
  - `POST /routing/solve` (và `/api/v1/ai/v1/routing/solve`): TS Nearest-Neighbor + 2-opt, trả `distance_source: "haversine_circuity_1.41"`, báo rõ `unassigned` kèm lý do tải trọng.
  - `GET /api/v1/ai/v1/training-dataset`: Xuất các bản ghi phản hồi có `human_corrected IS NOT NULL`.
  - `POST /api/v1/ai/v1/train/:type`: **Luôn trả HTTP `501` (`TRAINING_NOT_IMPLEMENTED`)**, dẫn hướng về `/v1/training-dataset` và quy trình huấn luyện offline.

### 4.4. Rust API (`backend/rust-api`) — Cảnh báo Bề mặt Thử nghiệm
Workspace Axum này hiện chỉ mang tính thử nghiệm chuyển đổi. Phần lớn route nghiệp vụ trả HTTP `501` trong [`meta.rs`](../backend/rust-api/crates/api/src/routes/meta.rs), còn [`ai.rs`](../backend/rust-api/crates/api/src/routes/ai.rs) trả kết quả sinh xác định giả lập (synthetic stub) — **không sử dụng làm backend sản xuất và không tính vào mức độ hoàn thiện backend đang chạy**.
