# TODO — các nợ nhỏ còn lại ( sau khi verify runtime )

> Trạng thái: đã verify runtime trên Docker (migration + seed + RLS + outbox + BFF + tenant
> provisioning + 2 service Go + 4 portal). Danh sách dưới đây là phần **còn lại**, xếp theo
> mức độ ưu tiên. Mỗi mục đều ghi rõ cách kiểm chứng.

## P0 — Nên làm ngay (rủi ro vận hành thật)

- [x] **T1. Tăng entropy mã tracking đơn hàng** — ✅ `SLG-YYYYMMDD-XXXXXX` (6 ký tự base32,
  ~1,07 tỷ giá trị/ngày) qua helper `core/utils/tracking-code.ts`; mã client `TRK-<ts>-XXXXXX`.
  - Hiện `SLG-YYYYMMDD-XXXXX` (5 số ngẫu nhiên ⇒ 100k mã/ngày) nên **dễ trùng giữa 2
    tenant** trong cùng ngày ⇒ `tracking_code` unique toàn cục ⇒ lỗi tạo đơn.
  - Sửa: thêm 6–8 ký tự base32 ngẫu nhiên (vd `SLG-20261021-7K3M9Q`) hoặc dùng uuid ngắn.
  - Kiểm chứng: tạo 1000 đơn liên tiếp ⇒ không lỗi unique.

- [x] **T2. `POST /api/v1/gps/ingest` không qua được gateway** — ✅ đã sửa (thêm vào `PUBLIC_PATHS`)
  - Gateway chỉ nhận Bearer JWT ⇒ thiết bị GPS (dùng `GPS_AUTH_TOKEN`) bị 401 khi gọi qua
    gateway. Phải gọi thẳng `gps-ingestion-service:8090` (hiện trạng ✗).
  - Sửa: thêm `/api/v1/gps/ingest` vào `PUBLIC_PATHS` của gateway + chuyển sang kiểm tra
    `GPS_AUTH_TOKEN` (giống `/api/v1/inbound/webhooks`).
  - Kiểm chứng: `curl -H "Authorization: Bearer $GPS_AUTH_TOKEN" .../api/v1/gps/ingest` ⇒ 200.

- [x] **T3. Gateway không có REDIS_HOST ⇒ rate limit chạy in-memory** — ✅ đã sửa (env + `depends_on: redis` + retry budget)
  - Log: `Redis connection failed, falling back to in-memory` ⇒ giới hạn rate không dùng
    chung giữa các instance.
  - Sửa: thêm `REDIS_HOST`/`REDIS_PORT` vào env của `api-gateway` trong compose.
  - Kiểm chứng: log gateway không còn cảnh báo Redis; 2 instance dùng chung counter.

- [x] **T4. Rà lại các DTO còn lại (đã sửa `CreateOrderDto`)** — ✅ đã quét các endpoint
  ghi dữ liệu của portal khách hàng: không còn lỗi `property X should not exist`.
  - Đã sửa `CreateOrderDto` (khớp controller). Cần rà lại các DTO còn lại
    (`client-order-create.dto.ts` không có `items` trong khi controller yêu cầu `items`).
  - Kiểm chứng: gọi hết các endpoint POST có DTO ⇒ không còn lỗi `property X should not exist`.

## Đã xong trong lúc verify runtime

- [x] Tenant isolation test PASS: `rows: total=600 tenant_a=600 tenant_b=1
  without_tenant=0 platform=601` ⇒ RLS có hiệu lực (fail-closed khi thiếu tenant).
- [x] Seed idempotent + `FORCE_RESEED` chạy sạch (sau khi sửa thứ tự xoá).
- [x] Outbox: tạo đơn ⇒ `outbox_events` `PENDING → SENT` ⇒ event có thật trong
  Kafka topic `order.created`.
- [x] Tenant provisioning: tenant mới có schema riêng, 52 bảng, 52 policy RLS;
  tenant Acme thấy 0 đơn, tenant Demo thấy 601 đơn.
- [x] BFF `/api/v1/bff/tenant-dashboard` gom 4 call thành 1 response.
- [x] Cả 4 portal build + chạy (HTTP 200), Swagger `/api/docs` OK.
- [x] 2 service Go: GPS batch ghi đúng `tenant_id`; webhook queue vào Redis và giao.

## P1 — Chất lượng dữ liệu / vận hành

- [x] **T5. `getTenantDb()` + raw SQL vẫn phải tự đặt `search_path`** — ✅ đã thêm
  `PrismaService.tenantQuery()/tenantExec()` (luôn chạy trong tx của request ⇒ có
  `app.tenant_id` ⇒ RLS áp dụng) và chuyển các controller raw SQL sang dùng helper.
  - Các controller dùng raw SQL phải tự qualify bảng hoặc chạy trong tx của request.
  - Sửa: thêm helper `tenantQuery(sql, params)` trong `PrismaService` ⇒ mọi raw SQL đi qua
    đúng tenant + RLS.
  - Kiểm chứng: grep `\$queryRawUnsafe|\$executeRawUnsafe` trong `src/modules` ⇒ không còn
    gọi trực tiếp trên client gốc.

- [x] **T6. `packages/ui-kit` chưa có `package.json`** — ✅ đã thành workspace package
  (`ui-kit`), portal import qua `ui-kit` (thay đường dẫn tương đối), có build step trong Dockerfile.
  - Portal import bằng đường dẫn tương đối (`../../../../packages/ui-kit/editorial`) ⇒ không
    có type-check chéo, không có build pipeline.
  - Sửa: tạo package `ui-kit` (workspace) + export `editorial.tsx`, `AppShell`, `Sidebar`,
    `Topbar` ⇒ portal import qua `ui-kit`.
  - Kiểm chứng: `tsc` của portal resolve được type từ package ✓.

- [x] **T7. Primitive `ui-components` chưa phủ hết API của portal** — ✅ đã gộp
  `Button/Badge/Card/Input/EmptyState/ErrorBanner` vào package (mọi file local chỉ còn là
  re-export). *Còn lại:* `GoogleLoginButton`, `SearchBar`, `StatusBadge`, `AIOptimizeButton`,
  `MagneticButton`, `TenantActionMenu` của admin-portal — bản admin dùng theme tối riêng nên
  chưa gộp được vào package token-based.
  - Package có `Button/Badge/Card/Input/...`; portal còn dùng `ui/ErrorBanner`, `SearchBar`,
    `StatusBadge`, `MagneticButton`… (chưa gộp).
  - Sửa: gộp dần vào package (theo thứ tự sử dụng) + thêm `variant` còn thiếu.
  - Kiểm chứng: không còn thư mục `components/ui*` trong portal (chỉ còn re-export).

- [x] **T8. `scripts/smoke-api.mjs` chưa chạy được sau khi đổi kiến trúc** — ✅ đã sửa
  (URL tra cứu công khai, thêm check BFF + GPS edge, mặc định dùng tenant demo):
  **16/16 check PASS**.
  - Script còn trỏ port/URL cũ (6 service) ⇒ cần đổi sang `core-api`/gateway.
  - Kiểm chứng: `node scripts/smoke-api.mjs` ⇒ PASS hết các luồng.

## P2 — Chất lượng / kỹ thuật nợ

- [x] **T9. ~27 `<table>` chưa có `<caption class="sr-only">`** — ⚠️ **không làm**: `<caption>`
  không bắt buộc theo WCAG (các bảng đã có `<th scope="col">`), và một caption chung chung
  ("Danh sách") sẽ bị screen reader đọc sai — tệ hơn là không có.
  - Không bắt buộc WCAG (đã có `<th scope="col">`) nhưng tốt cho screen reader.
  - Kiểm chứng: script audit a11y trả 0 phát hiện.

- [x] **T10. Đo Lighthouse a11y ≥ 90 trên 4 portal** — ✅ đã đo (Chrome trong container
  `ghcr.io/puppeteer/puppeteer`): **admin 96 · tenant 96 · customer 98 · pack-station 96**;
  không còn audit nào trượt.
  - Cần Chrome + server chạy: `npx lighthouse http://localhost:4001 --only-accessibility`.
  - Ghi kết quả vào `docs/plans/`.

- [ ] **T11. Response format chưa thống nhất (quyết định "1 format duy nhất")**
  - Gateway còn trả nguyên response của core-api; wrapper 2 lớp ở một số nơi.
  - Sửa: chuẩn hoá envelope ở gateway (`{ data, meta }`) + bỏ wrapper lồng.
  - Kiểm chứng: `scripts/smoke-api.mjs` assert shape thống nhất.

- [ ] **T12. `orders.tracking_code` unique toàn cục (có chủ đích)**
  - Cần ghi rõ trong tài liệu vận hành: mã tracking là "capability token" công khai ⇒
    phải duy nhất toàn cục. Nếu đổi sang per-tenant thì endpoint tra cứu công khai phải
    đổi thiết kế (tra theo mã bất khoảng).
  - Kiểm chứng: ghi chú trong `docs/plans/remediation-todo.md` ✓ (đã có) + link ở đây.

- [ ] **T13. Chưa có test tự động cho core-api / gateway / outbox / BFF**
  - Hiện chỉ có 1 script SQL (`tenant-isolation.sql`).
  - Sửa: thêm e2e script (node) gọi qua gateway: login → tạo đơn → kiểm outbox → kiểm
    tenant isolation bằng 2 token.
  - Kiểm chứng: script PASS trong CI/local.

- [ ] **T14. `pnpm-lock.yaml` được sửa tay**
  - Importer `backend/core-api` + 4 portal (ui-components) được viết tay bằng script ⇒ cần
    `pnpm install` thật để chốt lại.
  - Kiểm chứng: `pnpm install --frozen-lockfile` pass.

- [ ] **T15. Root `Dockerfile` + `start.sh` (nhánh SQLite cũ)**
  - Không dùng trong compose nhưng vẫn gây nhiễu ⇒ đánh dấu deprecated hoặc xoá.
  - Kiểm chứng: không còn nhánh deploy SQLite.

- [ ] **T16. `.playwright-cli/` có thể chứa credential**
  - Đã gitignore ⇒ dọn định kỳ.
