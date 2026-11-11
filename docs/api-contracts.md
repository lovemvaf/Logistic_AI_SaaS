# Hợp đồng API & Ma trận Định tuyến (Verified API Contracts)

Tài liệu đối chiếu trực tiếp toàn bộ endpoint từ:
- [`api/api-gateway/src/config/services.config.ts`](../api/api-gateway/src/config/services.config.ts), [`api/api-gateway/src/main.ts`](../api/api-gateway/src/main.ts) & [`bff.controller.ts`](../api/api-gateway/src/bff/bff.controller.ts)
- **77 file controller (`85` `@Controller`, `488` endpoint decorators)** thuộc **`11` module** trong `backend/core-api/src/modules/`
- Go `gps-ingestion-service`, Go `webhook-service`, Cloudflare `workers/ai-worker` và cảnh báo về `backend/rust-api`.

> **Lưu ý kiểm chứng**: Mọi đường dẫn dưới đây đã được đối chiếu trực tiếp với decorator/router thực tế trong mã nguồn và xác minh parity tự động qua [`scripts/static-verify.py`](../scripts/static-verify.py) (`8/8 PASS`). Toàn bộ `12` Jest suites, `ai-worker`, `go-services -race`, `rust-api`, `postgres-rls` và `4` Next.js 15 portal builds đạt **6/6 jobs PASSED** tại GitHub Actions [Run `43069842957`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43069842957) (commit `4840cce`) và vượt qua `12/12` kịch bản Playwright cục bộ (`tests/e2e/verify_s1_s12.py`).

---

## 1. API Gateway (`api/api-gateway`, cổng `3000`) & BFF

### Quy chuẩn bảo mật & Định tuyến Edge
- **HTTP Security & CORS** ([`main.ts`](../api/api-gateway/src/main.ts)): Bật `helmet()`, áp dụng allowlist `CORS_ORIGINS` và cho phép tường minh các header idempotency `X-Sync-Id`, `Idempotency-Key`.
- **Xác thực Edge**: Mọi route không thuộc `PUBLIC_PATHS` phải mang JWT `Authorization: Bearer <token>` (hoặc `x-api-key` ở luồng tích hợp đối tác). **Đã gỡ `/api/v1/inbound/webhooks` khỏi `PUBLIC_PATHS`** để ngăn caller ẩn danh kích hoạt service webhook.
- **Định tuyến `ROUTE_RULES`**: So khớp theo **prefix dài nhất trên ranh giới segment** (`matchRoute`), bao phủ đầy đủ cả 5 module Enterprise mới (`/api/v1/geography`, `/api/v1/freight`, `/api/v1/yard`, `/api/v1/trade`, `/api/v1/pricing`) và ưu tiên `/api/v1/gps/ingest` xuống Go GPS trước `/api/v1/gps`.
- **Circuit Breaker (`ProxyMiddleware`)**: Ngắt mạch sau `5` lỗi kết nối liên tiếp trong `30s`.
- **BFF & Utility Endpoints**: `GET /api/v1/bff/tenant-dashboard`, `GET /api/v1/bff/admin-dashboard`, `GET /health`, `GET /api/health`, `GET /routes`, `GET /api/gateway/health`, `GET /api/gateway/metrics`, `GET /api/docs`.

### `PUBLIC_PATHS` (Không bắt buộc JWT tại Gateway)
`/health`, `/api/health`, `/routes`, `/api/docs`, `/api/gateway/health`, `/api/v1/public`, `/api/v1/gps/ingest` *(xác thực token riêng constant-time tại Go GPS service)*, `/api/v1/track`, `/api/v1/health`, `/api/v1/webhooks/stripe` *(xác thực chữ ký Stripe)*, `/api/v1/tenant/auth`, `/api/v1/admin/auth`, `/api/v1/client/auth`, `/api/v1/mobile/auth`.

---

## 2. Quy chuẩn Request, Error Envelope & DB Idempotency (`backend/core-api`, prefix `/api/v1`)

- **ValidationPipe toàn cục** ([`main.ts`](../backend/core-api/src/main.ts)): `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Trường thừa ngoài DTO bị từ chối với HTTP `400`.
- **Chuẩn phản hồi lỗi** ([`http-exception.filter.ts`](../backend/core-api/src/core/http/http-exception.filter.ts)): Trả cấu trúc thống nhất `{ ok: false, statusCode, message, timestamp, path }`.
- **DB Idempotency (`X-Sync-Id` / `Idempotency-Key`)** ([`idempotency.interceptor.ts`](../backend/core-api/src/core/http/idempotency.interceptor.ts)): Lưu bền vững vào bảng PostgreSQL `api_idempotency_records` (kích hoạt `FORCE RLS`, TTL cấu hình, khóa duy nhất `(tenant_id, principal_id, operation, idempotency_key)`) kèm hash payload **`body_sha256`**:
  - Request trùng key đang chạy hoặc đổi payload khác `body_sha256` -> trả **`409 Conflict`**.
  - Request trùng key cùng payload đã hoàn tất -> phát lại HTTP response đã lưu.

---

## 3. Hợp đồng `backend/core-api` (`11` Modules / `77` Files / `85` `@Controller` / `488` Endpoints)

### 3.1. Module IAM & Platform Governance (`23` Files / `23` `@Controller` / `108` Endpoints)

| Controller | Prefix (`/api/v1/...`) | Số endpoint | Bảo vệ RBAC chính | Đường dẫn & Nâng cấp mới |
|---|---|---:|---|---|
| `admin-auth` | `/admin/auth` | 7 | Public login / JWT profile | `POST /login`, `POST /google`, `POST /forgot-password`, `POST /reset-password`, `POST /change-password`, `GET /profile`, `PATCH /profile` |
| `admin-tenants` | `/admin/tenants` | 5 | `@RequireRoles(SUPER_ADMIN)` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| `admin-billing` | `/admin/billing` | 8 | `@RequireRoles(SUPER_ADMIN)` + `BillingManage` khi ghi | `GET /`, `GET /plans`, `POST /plans`, `PUT /plans/:id`, `DELETE /plans/:id`, `GET /invoices`, `POST /invoices`, `POST /payments` |
| `admin-dashboard` | `/admin/dashboard` | **4** | `@RequireRoles(SUPER_ADMIN)` | `GET /stats`, `GET /logistics`, **`GET /outbox`**, **`POST /outbox/:id/redrive`** |
| `admin-audit-logs` | `/admin/audit-logs` | 2 | `@RequireRoles(SUPER_ADMIN)` | `GET /`, `GET /actions` |
| `tenant-auth`, `client-auth`, `mobile-auth`, `auth` | `/tenant/auth`, `/client/auth`, `/mobile/auth`, `/auth` | 23 | Public auth + JWT (`schemaName` từ JWT) | Login, Google OAuth, refresh, forgot/reset/change-password, profile |
| `tenant-users`, `tenant-roles`, `branches`, `feature-flags`, `tenant-settings`, `tenant-billing`, `tenant-audit-logs`, `tenant-dashboard`, `api-keys` | `/tenant/*`, `/api-keys` | 36 | `@ExcludeRoles(CUSTOMER_CLIENT)` | Quản trị nội bộ tenant, khóa `client_api_keys` / `tenant_api_keys` có `FORCE RLS`, lọc `tenantId` trên audit log |
| `iam-portal-aliases`, `stripe-webhook`, `health`, `metrics` | `/`, `/webhooks/stripe`, `/health`, `/metrics` | 23 | Alias / Signature / Ops | `/users*`, `/roles*`, `/settings`, `/dashboard/summary`, `/reports/*`, `GET /health/ready`, `GET /metrics` |

### 3.2. Module WMS — Quản lý Kho & Đóng gói (`13` Files / `17` `@Controller` / `95` Endpoints)

Toàn bộ controller nội bộ thuộc nhóm WMS gắn `@ExcludeRoles(Roles.CUSTOMER_CLIENT)`:
- `warehouses` & `branches` (`/warehouses`, `/branches`, `10` eps), `locations` & `bins` (`/locations`, `/bins`, `10` eps), `products` (`/products`, `7` eps), `inventory` & `adjustments` (`/inventory`, `9` eps), `cycle-counts` (`/inventory/cycle-counts`, `6` eps), `waves` & `tasks` (`/waves`, `/tasks`, `10` eps), `mobile` (`/mobile`, `2` eps), `warehouse-ops` (`/inventory/ops`, `20` eps), `wms-portal-aliases` (`/warehouses/bins`, `/equipment`, `/packing-sessions`, `/stations`, `/staff`, `21` eps).

### 3.3. Module Orders & Returns (`8` Files / `10` `@Controller` / `50` Endpoints)

| Controller | Prefix (`/api/v1/...`) | Số endpoint | Đường dẫn & Quyền đáng chú ý |
|---|---|---:|---|
| `orders` | `/orders` | 13 | `@ExcludeRoles(CUSTOMER_CLIENT)`: lifecycle đơn hàng, bulk/partial/reschedule/live/sla |
| `bulk-upload` | `/orders/bulk` | 1 | `POST /upload` (`@ExcludeRoles(CUSTOMER_CLIENT)`) |
| `orders-portal-aliases` | `/tenant/clients`, `/customers`, `/order-partials` | 13 | Hạn mức tín dụng, thống kê khách B2B, giao một phần |
| `returns` (Orders RMA) | `/` | 9 | RMA nội bộ (`@ExcludeRoles(CUSTOMER_CLIENT)` trừ danh mục `/return-reasons`) |
| `webhooks` | `/webhooks` | **6** | `@ExcludeRoles(CUSTOMER_CLIENT)`: CRUD webhook (tenant-scoped) + **`GET /outbox`**, **`POST /outbox/:id/redrive`** |
| `clients`, `tracking`, `auth` | `/clients`, `/tracking`, `/auth` | 8 | Quản lý client nội bộ, push tracking event (Outbox HMAC), refresh token |

### 3.4. Module Logistics, Fleet, GPS, COD & Driver App (`17` Files / `18` `@Controller` / `124` Endpoints)

- `logistics` (`/logistics`, `43` eps), `trips`, `drivers`, `vehicles`, `geofences`, `gps` (`25` eps), `logistics-portal-aliases` (`/finance`, `/tenant/ai-insights`, `15` eps), `finance` & `cod-remittances` (`13` eps — đối soát `qrCodeToken` trong `$transaction`), `logistics/returns` (`7` eps), `driver-app` & `mobile/*` (`11` eps — khóa `driver.id === trip.driverId` + DB Idempotency `X-Sync-Id`), `ai-management` & `ai-models` (`10` eps).

### 3.5. Module Customer & Public Tracking (`8` Files / `9` `@Controller` / `45` Endpoints) & Notification (`2` Files / `8` Endpoints)

| Controller | Prefix (`/api/v1/...`) | Số endpoint | Đường dẫn chính & Nâng cấp mới |
|---|---|---:|---|
| `client-portal` | `/client` | 4 | `GET /dashboard`, `GET /stock`, `GET /profile`, `PATCH /profile` (`client_id` từ JWT) |
| `client-orders`, `client-inventory`, `client-invoices`, `client-returns`, `client-webhooks` | `/client/*` | 17 | Tự phục vụ đơn B2B, tồn kho, thanh toán hóa đơn, trả hàng, webhook (SSRF + che secret) |
| **`client-freight`** *(Mới G4–G5)* | **`/client/freight`** | **16** | `GET /geography/units`, `GET/POST /rfqs`, `GET/POST /quotes`, `POST /quotes/:id/accept`, `GET /bookings`, `GET /shipments`, `GET /shipments/:id`, `GET/POST /documents`, `GET /invoices`, `GET/POST /disputes`, **`GET/POST /tracking-grants`**, **`POST /tracking-grants/:id/revoke`** |
| **`public-tracking`** *(Hardened G3–G5)* | `/public`, `/track` | **8** | **`GET /public/t/:token`** (xác thực `PublicTrackingGrant` qua SHA-256 + TTL + chưa thu hồi) + `/public/{track,verify}/:code{,/live,/sla}` & `/track/:code{,/live,/sla}` (**đã gỡ `shippingFee` và làm tròn thô tọa độ GPS với truy cập ẩn danh**) |
| `notifications` & `event` | `/notifications` | 8 | Hộp thư thông báo, mark read & Kafka consumer |

### 3.6. Các Module Enterprise Mới (`5` Modules / `6` Controllers / `58` Endpoints)

Mọi endpoint dưới `/geography/*`, `/freight/*`, `/yard/*`, `/pricing/*`, `/trade/*` đều gắn `@ExcludeRoles(Roles.CUSTOMER_CLIENT)` + `@RequirePermissions(...)`; `/geography/admin/*` khóa cứng `@RequireRoles(Roles.SUPER_ADMIN)`:

| Module & Controller | Prefix (`/api/v1/...`) | Số endpoint | Đường dẫn thực tế |
|---|---|---:|---|
| **`geography`** (`GeographyController` & `GeographyAdminController`) | `/geography`, `/geography/admin` | **11** | `GET /overview`, `GET /units`, `GET /units/resolve` (hỗ trợ 19 alias cũ -> 95 ĐVHC 2026), `GET /units/:id`, `GET /facilities`, `GET /facilities/:id`, `POST /facilities/:id/queue-observations`, `GET /corridors`, `GET /restrictions`; Admin: `POST /units/bootstrap-2026`, `PATCH /units/:id/official` |
| **`freight`** (`FreightController`) | `/freight` | **19** | `GET /summary`, `GET/POST /{tractors,chassis,containers}`, `GET/POST /assignments` *(kiểm tra trùng lịch đầu kéo/chassis/container/tài xế trả **`409 Conflict`**)*, `GET/POST /rfqs`, `GET/POST /quotes`, `POST /quotes/:id/accept`, `GET/POST /bookings`, `GET/POST /shipments`, `POST /shipments/:id/legs` |
| **`yard`** (`YardController`) | `/yard` | **7** | `GET/POST /yards`, `GET/POST /gate-events` *(cập nhật vị trí container & slot)*, `GET /eirs` *(biên bản giao nhận Equipment Interchange Receipt)*, `GET/POST /yards/:id/slots` |
| **`pricing`** (`PricingController`) | `/pricing` | **13** | `GET/POST /{contracts,surcharges,dem-det-rules}`, **`GET /shipments/:id/dem-det`** *(tách biệt `DEM` cổng/bãi vs `DET` lưu vỏ ngoài, tính weekend/holiday & tier 1/tier 2)*, `GET/POST /invoices`, `POST /invoices/:id/payments` *(ghi `FreightLedgerEntry` & `PaymentAllocation`)*, `GET/POST /disputes`, `PATCH /disputes/:id/resolve` |
| **`trade`** (`TradeController`) | `/trade` | **8** | `GET/POST /documents` *(tạo phiên bản `TradeDocumentVersion` + hash SHA-256)*, `POST /bookings/:bookingId/reconcile` *(đối chiếu CI vs PL vs BL)*, `GET/POST /declarations`, `POST /declarations/:id/submit` *(luồng xanh/vàng/đỏ hải quan)*, `POST /hs-suggestions`, `POST /hs-suggestions/:id/review` *(bắt buộc quyền `TradeApprove` duyệt tay từ `NEEDS_CUSTOMS_REVIEW`)* |

---

## 4. Dịch vụ Go, AI Worker Enterprise & Rust API Thử nghiệm

### 4.1. Go GPS Ingestion Service ([`backend/gps-ingestion-service/main.go`](../backend/gps-ingestion-service/main.go))
- **HTTP (`:8090`, Gateway `/api/v1/gps/ingest`)**: `POST /gps/batch`, `GET /health`. Xác thực `Authorization: Bearer <GPS_AUTH_TOKEN>` dùng `constantTimeBearerMatch`.
- **UDP Socket (`:8091`)**: Mặc định bật xác thực chặt (`GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED=false`), dùng khóa **`GPS_UDP_HMAC_SECRET` tách riêng khỏi HTTP Bearer**, ký **canonical v2** bao phủ đủ `driver_id`, `trip_id`, `lat`, `lng`, `speed`, `heading`, `timestamp`, `is_offline_cached`, kèm kiểm tra dải `heading` (`0..360`) và **FIFO bounded replay cache**.
- **Kiểm định & Geofence**: Kiểm tra **mọi điểm trong batch** theo thứ tự thời gian qua PostGIS `ST_Contains`, chuyển `tripId` rỗng thành SQL `NULL`, chống spam SOS trong cửa sổ cooldown `5` phút.

### 4.2. Go Webhook Service ([`backend/webhook-service/main.go`](../backend/webhook-service/main.go))
- **Cổng `:8092`**: `POST /deliver`, `GET /deliveries`, `POST /redrive`, `GET /health` — **cả 3 route nghiệp vụ đều yêu cầu `WEBHOOK_AUTH_TOKEN`** (`constant-time` compare), và đã gỡ khỏi `PUBLIC_PATHS` của Gateway.
- **Độ tin cậy hàng đợi**: Sử dụng **Redis Streams (`XREADGROUP` + `XACK` + `XAUTOCLAIM`) + PostgreSQL `webhook_deliveries` + DLQ / `/redrive`** thay cho `LPUSH/BRPOP` dễ mất job; chống trùng idempotency nguyên tử bằng `SetNX`.
- **Bảo vệ SSRF DNS Rebinding TOCTOU**: Kiểm định URL qua `validateWebhookURL`, chặn redirect và dùng `safeDialContext` **ghim thẳng địa chỉ IP đã kiểm tra khi mở kết nối TCP**, ngăn kỹ thuật rebinding trỏ vào loopback/RFC1918/metadata/cổng hạn chế. Chữ ký outbound dùng `X-SLG-Signature`.

### 4.3. Cloudflare AI Worker ([`workers/ai-worker`](../workers/ai-worker))
- Mount song song tại `/ai` và `/api/v1/ai` cùng route gốc `/routing/solve` (JWT Bearer hoặc `x-ai-api-key`):
  - `POST /api/v1/ai/v1/chat`, `/v1/predict/{demand,delivery-time,churn}`, `/v1/analyze`, `/v1/detect/anomalies` (Z-score `min_recommended_samples: 5`), `/v1/routing/solve` (TS NN + 2-opt, `distance_source: "haversine_circuity_1.41"`).
  - **`POST /api/v1/ai/v1/routing/containers`**: Heuristic time-window + backhaul drayage container (`20GP/40GP/40HC/40RF/45HC`, lọc reefer genset & tải trọng max, trả `evaluation_status: "unmeasured_heuristic"`).
  - **`POST /api/v1/ai/v1/trade-documents/extract`** & **`/v1/trade-documents/reconcile`**: Trích xuất trường hóa đơn/packing list/B/L có bọc `wrapUntrustedData`; **file PDF mã hóa mật khẩu trả thẳng HTTP `422 FAILED_PASSWORD_PROTECTED` kèm `requires_manual_upload: true`** (tuyệt đối không tự bịa nội dung).
  - **`POST /api/v1/ai/v1/hs-code/suggest`**: Trả top-K mã HS tham khảo kèm cờ bắt buộc **`advisoryOnly: true`, `requiresHumanReview: true`, `status: "NEEDS_CUSTOMS_REVIEW"`** và khuyến cáo pháp lý.
  - `GET /api/v1/ai/v1/training-dataset` & `POST /api/v1/ai/v1/train/:type` (**HTTP `501 TRAINING_NOT_IMPLEMENTED`**).

### 4.4. Rust API (`backend/rust-api`) — Cảnh báo Bề mặt Thử nghiệm
Workspace Axum này đã biên dịch sạch và pass **`8/8` unit test trong CI** (`cargo check --workspace --all-targets && cargo test`), nhưng phần lớn route nghiệp vụ vẫn giữ `501` trong [`meta.rs`](../backend/rust-api/crates/api/src/routes/meta.rs) và [`ai.rs`](../backend/rust-api/crates/api/src/routes/ai.rs) trả kết quả sinh xác định thử nghiệm — **không sử dụng làm backend sản xuất thay cho `core-api`**.
