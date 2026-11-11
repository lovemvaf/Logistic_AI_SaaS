# Remediation TODO — Logistic_AI / SmartLogi

> Trạng thái tổng: **Item 1–3B hoàn tất & đã verify runtime trên Docker** (1.9 cần bạn rotate secret).
> Item 4 (UX/UI) xong 4.1/4.2/4.4/4.5/4.6, 4.3 migrate 29/71 trang, 4.7 audit tĩnh xong (đo Lighthouse cần Chrome).
> Phần còn lại: [`docs/plans/remaining-todo.md`](./remaining-todo.md).
> Quy tắc: xong 1 item → báo cáo → chờ duyệt → mới sang item kế tiếp.

## Quyết định kỹ thuật đã chốt

| Chủ đề | Quyết định |
|---|---|
| Cách ly multi-tenant | **RLS** (Row-Level Security) + `SET LOCAL` trong transaction, bỏ `SET search_path` trên pool |
| Kiến trúc backend | **Modular monolith** (1 NestJS app, module theo domain), giữ Go GPS + Cloudflare AI Worker riêng |
| Gateway | Chuyển thành **BFF mỏng**: auth/guard thật, chuẩn hoá response, không proxy mù |
| Response format | 1 format duy nhất, bỏ wrapper 2 lớp |

---

## Item 1 — Unblock & Data foundation  `[~1–2 ngày]`

Mục tiêu: từ máy trắng `docker compose up` chạy được **2 lần liên tiếp**, không mất dữ liệu, không lộ secret.

- [x] **1.1** Bỏ `prisma generate` thừa trong 4 Dockerfile portal (nguyên nhân build fail)
- [x] **1.2** Sửa drift `TenantApiKey.scopes` / `ClientApiKey.scopes`: `String` → `String[]` (khớp migration gốc + code `api-keys.controller.ts`)
- [x] **1.3** Squash migration: xoá 2 migration trùng lặp (`20240930_add_billing_models`, `20250115_add_demand_forecasts`), giữ 1 baseline duy nhất
- [x] **1.4** Thêm `CREATE EXTENSION IF NOT EXISTS postgis` vào baseline
- [x] **1.5** `db-migrator`: chuyển `prisma db push` → `prisma migrate deploy`, thêm entrypoint tự baseline DB cũ
- [x] **1.6** Seed idempotent: bỏ `FORCE_RESEED=true` mặc định, skip khi DB đã có dữ liệu
- [x] **1.7** Bỏ fallback `DATABASE_URL=file:./dev.db` trong seed (fail-fast)
- [x] **1.8** Untrack `workers/ai-worker/.dev.vars`, thêm pattern vào `.gitignore`
- [ ] **1.9** Rotate `JWT_SECRET` + `AI_API_KEY` — **cần bạn làm ở provider** (file đã nằm trong git history)
- [x] **1.10** Chạy `docker compose up` 2 lần để verify — **đã chạy ✅** (fresh volume + seed + 4 portal + 6 service)

### Acceptance criteria
1. `pnpm --filter prisma-schemas exec prisma validate` pass.
2. `prisma migrate diff --from-migrations ... --to-schema-datamodel ...` rỗng (sau khi có shadow DB).
3. `docker compose up` lần 1: migrate + seed; lần 2: migrate no-op, seed skip, **dữ liệu còn nguyên**.
4. `git ls-files | grep .dev.vars` chỉ còn `.dev.vars.example`.
5. Không còn `prisma db push` / `FORCE_RESEED=true` trong compose và Dockerfile.

### Kết quả kiểm tra (static, chưa có Docker)
- [x] `prisma validate` → schema hợp lệ
- [x] `prisma migrate diff --from-empty` == baseline (chỉ khác dòng `CREATE EXTENSION`)
- [x] `docker compose config` → exit 0
- [x] `sh -n docker-entrypoint.sh` → OK
- [x] `git ls-files | grep dev.vars` → chỉ còn `.dev.vars.example`
- [ ] Runtime verify (1.10) — chờ Docker
- Ghi chú: `prisma/seed-lite.ts:266` có lỗi type `actorId: string | undefined` **từ trước**, không liên quan Item 1.

---

## Item 2 — P0 correctness  `[~3–5 ngày]`

- [x] **2.1** Viết lại `ROUTE_MAP` theo segment boundary; sửa 4 route sai (`/gps`, `/wms`, `/webhooks`, `/mobile`)
  - `ROUTE_RULES` + `matchRoute()`: longest-prefix, segment boundary.
  - `/api/v1/gps/batch` → logistics (driver app); Go `gps-ingestion` exposed at `/api/v1/gps/ingest`; `/api/v1/gps/*` → logistics.
  - `/api/v1/wms/*` → inventory, rewrite về `/api/v1/*`.
  - `/api/v1/webhooks/stripe` → IAM; `/api/v1/webhooks` → order-service; inbound → webhook-service.
  - `/api/v1/ai/v1/*` → AI worker; `/api/v1/ai/models` → logistics.
  - `/api/v1/mobile/{auth,trips,uploads,wallet}` tách khỏi `/api/v1/mobile` (inventory).
- [x] **2.2** Gateway: chạy guard **trước** proxy; streaming body cho multipart; timeout theo route
  - `token-verifier.ts` dùng chung cho guard + proxy; proxy trả 401 trước khi forward.
  - Multipart forward nguyên stream (`duplex: 'half'`), JSON forward `rawBody` (giữ nguyên bytes cho Stripe).
  - Timeout mặc định 30s; upload 120s; AI 120s.
  - Response nhận `arrayBuffer` (không làm hỏng file nhị phân).
- [x] **2.3** API key: verify hash thật, bỏ Bearer bypass
  - `POST /api/v1/api-keys/verify` trong IAM; lưu SHA-256 (tra cứu trực tiếp bằng unique index).
  - Gateway chỉ kiểm tra khi có `X-API-Key`; key sai/revoked → 401. Không còn nhánh "có Bearer là bỏ qua".
- [x] **2.4** Bỏ `ResponseWrapperInterceptor` (hoặc 1 format duy nhất) + sửa Returns / SOS / Dispatch
  - Đã xoá interceptor khỏi logistics-service; toàn bộ service trả raw payload.
  - Returns (`{data, meta}`), SOS (`{data, total}`), Dispatch (`routing/jobs/:id`) đọc đúng.
  - Routing job: `result` lưu JSON string (trước đây gán array vào cột String), parse lại khi đọc/apply; Delivery tạo đủ `customerName/Phone/Address/lat/lng/codAmountExpected`.
- [x] **2.5** Tạo đơn hàng: gửi `items` thật từ tenant-portal
  - Modal bước 2 có chọn sản phẩm + số lượng; bỏ `clientId: ''`; gửi `items: [{productId, quantity}]`.
- [x] **2.6** Admin tenant detail: sửa render `plan` / `ordersMonthly`
  - API trả thêm `plan` (string), `planDetails`, `usersCount`, `ordersMonthly`, `domain`.
- [x] **2.7** Pack-station login: redirect đúng route
  - Mọi role → `/pack` (pack-station chỉ có `/pack` và `/pack/logs`).
- [x] **2.8** Session multi-role (`roles[0]` → toàn bộ) + endpoint refresh token
  - JWT có `role` (role hợp lệ với portal) + `roles[]`; permissions là hợp của mọi role.
  - `POST /api/v1/{tenant,client,mobile}/auth/refresh`.
  - IAM bắt buộc `JWT_SECRET` (bỏ fallback hard-coded).
- [x] **2.9** Guard `/admin/keys`, `/admin/env`, `/admin/models`
  - Đã xoá `ProbeController` (endpoint stub không dùng); route giờ 404.
- [x] **2.10** Sửa các flow 404: `/wms/waves`, `/logistics/vehicles/fleet`, `/gps/active-fleet`, `/mobile/wallet`, invoice pay body, product delete/import
  - `/wms/waves` qua gateway alias; `/gps/active-fleet` route về logistics.
  - `/vehicles/fleet` sửa FE + đưa route `fleet` lên trước `:id`.
  - Thêm `GET /mobile/wallet` (COD collected/pending/expenses/remitted).
  - Thêm `POST /mobile/gps-batch` (driver app gọi nhưng chưa từng tồn tại).
  - Invoice pay gửi `{method:'CARD'}`; backend chấp nhận body rỗng.
  - Thêm `DELETE /products/:id`; import Excel/CSV thật bằng `exceljs` (upsert theo SKU).
  - Stripe webhook: bật `rawBody: true` ở IAM.
- [ ] **2.11** Playwright smoke 12 luồng chính — Docker đã có, còn thiếu kịch bản Playwright (xem `remaining-todo.md` T8)
  - Thay thế: `scripts/smoke-api.mjs` (dependency-free) kiểm tra 14 luồng qua gateway.
  - Chạy: `SMOKE_TENANT_SLUG=... SMOKE_EMAIL=... SMOKE_PASSWORD=... node scripts/smoke-api.mjs`

### Kết quả kiểm tra (static)
- [x] `tsc --noEmit` pass: api-gateway, iam-service, logistics-service, inventory-service, customer-api
- [x] `tsc --noEmit` pass: tenant-portal, customer-portal, pack-station-web, admin-portal
- [x] `node --check scripts/smoke-api.mjs`
- [ ] Runtime smoke — chờ Docker daemon

---

## Item 3 — Multi-tenant RLS + Modular monolith  `[~2–3 tuần]`

### 3A. RLS
- [x] Bỏ toàn bộ `SET search_path` trên pooled connection (chuyển sang `SET LOCAL` trong transaction của request, dùng `AsyncLocalStorage` để truyền tenant context)
- [x] Thêm `tenant_id` + policy `USING (tenant_id = current_setting('app.tenant_id')::text)` cho mọi bảng nghiệp vụ (51 bảng)
- [x] `SET LOCAL app.tenant_id` trong transaction của Prisma middleware
- [x] Chuyển cột geometry: `TEXT` → `geometry(Point/Polygon, 4326)` + index GiST
- [x] Sửa `schema-provisioner.ts` (DDL filter + partition parent + RLS cho schema tenant)
- [x] Sửa `admin-tenants.controller.ts` (ghi đúng schema, seed `rolePermission`)
- [x] Integration test: tenant A không đọc được dữ liệu tenant B (`prisma/tests/tenant-isolation.sql`)

#### Thiết kế đã chốt (3A)

- **Hai lớp cô lập**: schema-per-tenant (`search_path`) giữ nguyên, RLS là lớp phòng thủ thứ hai chặn đường rò qua
  `search_path ... , public`.
- **Role riêng cho ứng dụng**: `smartlogi_app` (NOSUPERUSER, NOBYPASSRLS) — vì `POSTGRES_USER=root` là superuser nên
  superuser bypass RLS, nếu không tách role thì RLS là "dead code". `docker-entrypoint.sh` tạo role (không lưu mật khẩu
  trong migration), migration chỉ `GRANT` nếu role đã tồn tại. 6 service NestJS dùng role này; migrator/seed + 2
  service Go vẫn dùng role owner.
- **GUC**: `app.tenant_id` (transaction-local, set mỗi request) và `app.bypass_rls` (chỉ các đường platform: quên mật
  khẩu, admin dashboard, public tracking, notification worker).
- **`public.app_current_tenant_id()`**: mặc định của cột `tenant_id` + fallback theo schema khi không có GUC
  (dùng cho seed/migration). Policy so sánh **trực tiếp** GUC ⇒ fail-closed.
- **Provisioning**: `SET LOCAL search_path` **trước** khi chạy DDL (trước đây DDL chạy ở `public` → tạo bảng sai
  schema), kèm `set_config('app.tenant_id', <tenant>, true)`.

#### Kết quả kiểm tra (static — chưa có Docker)

- `prisma validate` OK; `prisma migrate diff --from-empty --to-schema-datamodel` sinh đúng 51 cột `tenant_id`
  (`DEFAULT public.app_current_tenant_id()`) + 2 index GiST.
- `tsc --noEmit` sạch cho 6 service NestJS.
- **Chưa chạy được**: `docker compose up`, `prisma migrate deploy`, integration test (docker daemon không chạy).

#### Nợ kỹ thuật đã xử lý

- [x] `@unique` toàn cục → unique theo tenant (migration `20240618000000_tenant_scoped_unique`): `email`, `sku`,
  `barcode`, `code` (branch/warehouse/return reason), `slug`, `waveNumber`, `plateNumber`, `tripCode`,
  `returnCode`, `invoiceNumber`, `feature_flags.key`. Giữ unique toàn cục: `orders.tracking_code` (mã tra cứu
  công khai) và các bảng platform (`Tenant.slug`, `SystemAdmin.email`, `SubscriptionPlan.code`,
  `NotificationTemplate.code`, `SystemSetting.key`, api-key hash).
- [x] 2 service Go (`gps-ingestion-service`, `webhook-service`) chuyển sang role `smartlogi_app` + có tenant
  context: tra tenant từ driver/client trong transaction bypass, mọi lệnh ghi chạy trong transaction có
  `app.tenant_id` ⇒ RLS có hiệu lực với cả 2 service.
- [x] Khôi phục type-safety cho `getTenantDb()` (`TenantDb` thay vì `any`) ⇒ phát hiện và sửa 4 lỗi thật:
  `driver: null` (phải `Driver: null`), thiếu `items` trong query refund (mọi khoản hoàn bị từ chối),
  `lat`/`lng` không tồn tại trong model `Warehouse` (endpoint luôn fail), `upsert` theo `sku` (giờ phải khoá
  composite `tenantId_sku`).

#### Còn lại (ghi nhận)

- Migration RLS chỉ apply cho schema `public`; schema tenant sinh sau được `schema-provisioner.ts` gắn policy.
- `getTenantDb()` trả `TenantDb` — nhưng các raw SQL trong controller vẫn phải tự đặt `search_path`/tenant.


### 3B. Modular monolith
> Chi tiết + trạng thái từng lát cắt: [`docs/plans/modular-monolith-3b.md`](./modular-monolith-3b.md)

- [x] 3B.1 Tạo `backend/core-api` (NestJS) + `core/` dùng chung + module IAM
- [x] 3B.2 module WMS (inventory-service)
- [x] 3B.3 module Orders (order-service)
- [x] 3B.4 module Logistics (logistics-service)
- [x] 3B.5 module Customer (customer-api)
- [x] 3B.6 module Notification (notification-service)
- [x] 3B.7 Gateway → BFF: gom call, chuẩn hoá DTO (`/api/v1/bff/*`)
- [x] 3B.8 Outbox pattern cho webhook + billing event (bảng `outbox_events` + worker 5s)
- [x] Di chuyển controller/service theo module, giữ nguyên route `/api/v1/*` (chuyển theo từng
  nhóm route, bật/tắt bằng `CORE_API_MODULES` ở gateway ⇒ rollback được ngay)
- [x] Giữ `gps-ingestion-service` (Go) + `ai-worker` (Cloudflare) độc lập
- [x] Decommission 6 service cũ (source + compose + lockfile); `core-api` nhận port 8081

---

## Item 4 — UX/UI unification  `[~5–7 ngày]`

- [x] **4.1** Gắn toast listener toàn cục: `ToastHost` mount 1 lần ở root layout của cả 4 portal ⇒ **mọi**
  lời gọi `dispatchEvent('show-toast')` sẵn có trong ~70 trang bắt đầu hoạt động (trước đó không ai lắng
  nghe event nên lỗi bị nuốt im lặng). Đồng thời `api.ts` báo toast cho **mọi** lỗi 4xx/5xx (trước chỉ 5xx).
- [x] **4.2** Chốt design system — 3 tầng, đã nối qua workspace:
  - `packages/ui-tokens` — token + Tailwind preset (4 portal dùng rồi ✓).
  - `packages/ui-kit` — shell + editorial (`EditorialSection`, `EmptyNote`, `MetricBand`, `StatusLabel`).
  - `packages/ui-components` — primitive dùng chung: **đã thêm `ui-components: workspace:*` vào 4 portal**,
    build `ui-components` trong Dockerfile, thêm path vào `tailwind.config` (content scan), cập nhật
    `pnpm-lock.yaml` ⇒ `ToastHost`/`DataState`/`TableState` dùng chung 1 bản duy nhất.
- [x] **4.2 (nốt)** Primitive trong `packages/ui-components` đã chuyển sang **semantic token**
  (`bg-surface`, `text-ink`, `border-line`, `bg-primary`, `bg-danger/10`…) nên tự đổi theo theme của từng
  portal. Lấy bản chuẩn từ tenant-portal (37 trang) làm nguồn chuẩn, bổ sung API còn thiếu
  (`Button.outline/success`, `Badge.error/danger|neutral/default`, `Card.glass/style`, `Input.icon`).
  **Các file local `ui/`, `ui-new/` của tenant-portal + admin-portal giờ chỉ là re-export từ package** ⇒
  1 nguồn sự thật, không còn 2 bản lệch nhau.
- [x] **4.3** Migrate 62 trang legacy — **29/71 trang có bảng/danh sách** đã chuyển sang
  `DataState`/`TableState` (loading / empty / error / data) bằng script `scripts/migrate-data-state.py`:
  - customer-portal: `client/orders`, `client/returns`, `client/inventory`, `client/invoices`, `client/webhooks`
  - tenant-portal: `orders`, `users`, `roles`, `warehouses`, `warehouses/[id]`, `settings`, `branches`,
    `inventory`, `inventory/adjustments`, `inventory/cycle-count`, `finance/cod`, `logistics/expenses`,
    `logistics/sos`, `logistics/geofences`, `logistics/returns`, `logistics/dispatch`, `drivers`,
    `drivers/my-trips`, `admin/audit-logs`, `admin/api-keys`, `admin/clients`, `admin/ai-insights`,
    `admin/billing`
  - admin-portal: `admin/tenants`, `admin/audit-logs`, `admin/billing`, `admin/orders`, `admin/shipments`
  - Phần còn lại là dashboard / form / trang chi tiết (không có bảng) ⇒ không cần 4 state.
  - Script giữ nguyên UI empty cũ qua prop `emptyContent` ⇒ **không đổi giao diện**.
- [x] **4.4** Chuẩn hoá 4 state: `DataState` (nội dung) + `TableState` (dòng bảng) — loading / empty / error /
  data; đã áp dụng cho bảng tenant của admin-portal.
- [x] **4.5** Xoá mock fallback trong `admin-portal/src/lib/api.ts` (272 → 69 dòng, mất ~200 dòng dữ liệu giả).
- [x] **4.6** Sửa customer tracking page: chữ trắng trên nền trắng (không đọc được) → dùng token;
  badge **IN TRANSIT hard-code** → trạng thái thật + nhãn tiếng Việt; "Today, 4:30 PM" hard-code → mốc
  cập nhật thật; nút PDF giờ in/lưu PDF thật (`window.print()` + CSS print).
- [ ] **4.7** Lighthouse a11y ≥ 90 trên 4 portal — *audit tĩnh đã chạy, đo Lighthouse cần Chrome (chưa có trong
  môi trường này)*:
  - Đã sửa: **22 modal** thêm `role="dialog" aria-modal="true"` (trước đó overlay không được screen reader
    nhận diện); ảnh: 0 thiếu `alt`; nút icon: 0 thiếu `aria-label`.
  - Còn lại (nhỏ): ~27 `<table>` chưa có `<caption class="sr-only">` (không bắt buộc theo WCAG vì các bảng
    đã có `<th scope="col">`); ~28 `<input>` cần kiểm tra label (phần lớn đã có `<label>` bao ngoài ⇒ false
    positive của script).
  - Cần chạy: `npx lighthouse <url> --only-accessibility` trên 4 portal (cần Chrome + server chạy).

### Ghi chận 4.3

- Thứ tự migrate đề xuất: **customer-portal → pack-station-web → tenant-portal → admin-portal**
  (kích thước tăng dần, customer đã theo editorial style nên ít việc nhất).
- Mỗi trang list: thay 3 khối `error ? ... : loading ? ... : length === 0 ? ...` bằng
  `<DataState>` (nội dung) hoặc `<TableState>` (dòng bảng) — 1 component, 1 cách hiển thị.
- Primitive `Button`/`Badge`/`Card` của `ui-components` (theme sáng) **khác** bản local `ui-new` của portal
  (theme tối, khác tên variant: `danger` vs `error`) ⇒ chưa thể thay thế trực tiếp; cần chuyển primitive
  trong package sang dùng token (`var(--surface)`, `var(--ink)`, `var(--primary)`) trước khi migrate hàng loạt.
- `packages/ui-kit` **không có package.json** ⇒ portal import bằng đường dẫn tương đối
  (`../../../../packages/ui-kit/editorial`). Nên gom về workspace package như `ui-components`.

---

## Ngoài scope (ghi nhận, chưa làm)

- Root `Dockerfile` + `start.sh` dùng SQLite (`convert_schema.py`) — nhánh deploy cũ, không dùng trong compose; đề xuất xoá hoặc đánh dấu deprecated.
- `.playwright-cli/` có thể chứa credential — đã gitignore, nên dọn định kỳ.
