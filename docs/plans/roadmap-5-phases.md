# Roadmap 5 phase — SmartLogi SaaS

> Cập nhật: 2026-10-20
> Mục tiêu: gộp việc **fix Google login + tách site** và hai track **UI consistency** /
> **API Key** thành một roadmap 5 phase duy nhất, có thứ tự triển khai rõ ràng.

---

## Tổng quan

| Phase | Chủ đề | Trạng thái | Tài liệu chi tiết |
|---|---|---|---|
| **1** | Auth, Google login, mỗi portal một site | ✅ Hoàn tất | `docs/plans/portal-sites-and-google-auth.md` |
| **2** | UI consistency baseline: font, token, AppShell, màu | ✅ Hoàn tất | `docs/plans/ui-consistency.md` |
| **2.5** | Design refresh: bỏ icon, dày hơn, mềm hơn, không template SaaS | 📝 Có plan | `docs/plans/design-refresh-no-icons.md` |
| **3** | API Key — nền tảng (hash, prefix, verify, Redis) | ⏳ Chưa bắt đầu | `docs/plans/api-key-auth-roadmap.md` |
| **4** | API Key — scopes, rate limit, quota, usage | ⏳ Chưa bắt đầu | `docs/plans/api-key-auth-roadmap.md` |
| **5** | API Key — vận hành (UI, rotation, cảnh báo) | ⏳ Chưa bắt đầu | `docs/plans/api-key-auth-roadmap.md` |

Thứ tự triển khai: **1 → 2 → 2.5 → 3 → 4 → 5**. Phase 2.5 là track thiết kế mới,
độc lập với API Key; có thể chạy song song Phase 3 nếu cần.

---

## Phase 1 — Auth, Google login & portal sites ✅

**Đã xong:**

- IAM hỗ trợ PostgreSQL; verify Google ID token; map role theo portal.
- Google login chỉ cấp quyền cho tài khoản đã tồn tại.
  - Tenant auto-provision là opt-in (`GOOGLE_AUTO_PROVISION=true`), role mới `TENANT_USER`.
  - Admin Google chỉ nhận email trong `system_admins` hoặc `SUPER_ADMIN_GOOGLE_EMAILS`.
  - Không bao giờ auto-tạo `SUPER_ADMIN`.
- Mỗi portal có allow-list role riêng; sai role trả `403`.
- Tách site bằng Nginx:
  - `admin.localhost:8080`
  - `tenant.localhost:8080`
  - `customer.localhost:8080`
  - `pack.localhost:8080`
- Portal gọi API same-origin `/api/v1` qua Next rewrite → `api-gateway:3000`.
- Tenant portal có lại form Tenant ID + Email + Password; redirect đúng role.
- Fix admin dashboard/audit log bị `403` do `SUPER_ADMIN` có `permissions: []`:
  `PermissionsGuard` cho `SUPER_ADMIN` bypass permission matrix.
- Fix API gateway chặn nhầm request có `Authorization: Bearer`:
  JWT session không còn bị đòi thêm `X-API-Key`.
- Fix các service `order / inventory / logistics / customer-api` thiếu `JWT_SECRET`
  trong `docker-compose.yml`.
- Fix getter `PrismaService.tenantClient` bị Prisma proxy che khuất (property getter
  trả về extended client rỗng). Đổi thành method `getTenantDb()` và cập nhật toàn bộ
  caller ở 6 service.
- Fix `PermissionsGuard` đăng ký global ở order-service chạy trước `JwtAuthGuard`
  làm `GET /orders` luôn `403`. Bỏ global guard; giữ guard cấp controller.
- Seed `ClientUser` cho `client@customer.vn` để customer-api resolve được `clientId`.

**Còn phụ thuộc cấu hình Google (không phải code):**

- Thêm `http://localhost:4001–4004` vào Authorized JavaScript origins.
- Thêm Gmail tester vào Test users hoặc Publish app.
- Subdomain `http://*.localhost:8080` **không dùng được** cho Google OAuth;
  production phải dùng HTTPS domain thật.

---

## Phase 2 — UI consistency baseline ✅

**2a. Font + design token (✅ xong)**

- Self-host 6 file woff2 (Plus Jakarta Sans + Cormorant Garamond, có tiếng Việt).
- Preset Tailwind chung `packages/ui-tokens/tailwind-preset.cjs`.
- Giữ alias camelCase để 154 class legacy hoạt động ngay.

**2b. AppShell / Sidebar / Topbar dùng chung (✅ xong)**

- `packages/ui-kit/`:
  - `AppShell.tsx` — khung sidebar + topbar + content well.
  - `Sidebar.tsx` — nav section, icon, active state, collapse, mobile drawer.
  - `Topbar.tsx` — search, notification, user, logout, scroll progress.
  - `shell-context.tsx` — state collapse/mobile dùng chung.
  - `icons.tsx` — bộ icon line 24px.
- Cả 4 portal dùng cùng khung; sửa lỗi admin content bị sidebar che.
- Sửa race condition đọc session ở Customer/Admin (thêm `isLoading` vào auth context).

**2c. Đồng bộ màu hardcode (✅ phần lớn)**

- Preset map `slate / gray / zinc / neutral / stone` về **một neutral ramp** duy nhất,
  nên ~1.088 class cũ tự đồng bộ mà không phải sửa từng file.
- Customer portal: thay `text-white`/`text-zinc-*`/`text-gray-*` trên nền sáng
  bằng token `ink` / `ink-soft`; sửa card KPI bị chữ trắng trên nền trắng.
- Admin `StatCard`: cho value + trend wrap, hết tràn card "System Health".
- Pack Station: forgot/reset password và nút filter ở Pack Logs bị chữ trắng trên nền
  sáng → chuyển sang token `ink` / `ink-soft` / `surface`.

**2d. Verify cuối Phase 2 (✅ xong)**

- Rebuild + restart 4 portal và các service liên quan.
- Playwright quét 24 route với storage state thật của từng role:
  admin 7/7, tenant 9/9, customer 6/6, pack 2/2 — **0 failing route**.
- Các lỗi runtime còn lại đã fix: audit log `.split`, customer `shippingFee.toFixed`,
  webhook `Link2`, tenant COD `e.map`, pack icon `CheckCircle`.

**2e. Chuyển sang Phase 2.5**

Các hạng mục sau không còn làm theo hướng cũ (card SaaS + icon) mà gộp vào
**Phase 2.5 — Design refresh**:

- Bỏ icon khỏi sidebar / KPI / header / button.
- Giảm khoảng trống, tăng mật độ bảng và số dòng thấy được.
- Làm mềm bằng palette giấy ấm + accent sage, không dùng cobalt SaaS.
- Chuẩn hoá primitives table/form/button theo ngôn ngữ mới.
- Responsive mobile và dark mode sẽ thiết kế lại theo ngôn ngữ mới, không patch
  tiếp trên template cũ.

---

## Phase 2.5 — Design refresh 📝

**Mục tiêu:** thoát khỏi giao diện dashboard SaaS mặc định, chuyển sang ngôn ngữ
"operational editorial" — chữ dẫn dắt, bảng dày, đường kẻ mảnh, palette giấy ấm,
không icon trang trí.

**Phạm vi:**

- Bỏ icon khỏi nav, KPI, page header, button; chỉ giữ icon chức năng tối thiểu
  (đóng, chevron, search) ở 16px.
- Giảm padding/margin, bỏ `max-w-7xl mx-auto` lồng trong content well.
- Thay card grid bằng section + hairline rule + bảng.
- Token mới: canvas `#F6F3EE`, ink `#20241F`, accent sage `#2F4A3C`.
- Typography: Cormorant chỉ cho page title/wordmark; body 13–14px; số dùng
  Plus Jakarta tabular.
- Skill stack: `redesign-existing-projects` (quy trình), `minimalist-ui` (ngôn
  ngữ), `frontend-ui-engineering` (a11y/implementation); tham khảo có chọn lọc
  `design-taste-frontend`, `high-end-visual-design`, `industrial-brutalist-ui`.
- Verify lại 24 route + screenshot 5 breakpoint (320 → 1440).

Chi tiết đầy đủ: `docs/plans/design-refresh-no-icons.md`.

---

## Phase 3 — API Key nền tảng ⏳

1. Migration Prisma: thêm `prefix`, `env`, `lastUsedAt`, `expiresAt`, `lastUsedIp`
   cho `TenantApiKey` / `ClientApiKey`.
2. Sinh key dạng `slk_<env>_<prefix8>_<secret32>`; chỉ lưu hash + prefix.
3. Endpoint nội bộ `POST /internal/api-keys/verify`:
   - tra theo `prefix` (indexed, unique)
   - so sánh secret timing-safe
   - kiểm tra `revokedAt` / `expiresAt`
4. Gateway validate thật, set `req.auth = { type:'api_key', tenantId|clientId, scopes, keyId }`.
5. Redis cache `apikey:<prefix>` để tránh bcrypt/DB mỗi request.

**Điều kiện hoàn thành:** key sai → `401`; key đúng → request đi tiếp; key revoked/hết hạn → `401`.

---

## Phase 4 — API Key phân quyền & hạn mức ⏳

1. Map route → scope:
   - `/api/v1/client/orders*` → `orders:read|write`
   - `/api/v1/client/invoices*` → `invoices:read`
   - `/api/v1/client/webhooks*` → `webhooks:manage`
   - `/api/v1/webhooks/*` → `webhooks:receive`
   - `/api/v1/public/*` → `public:read`
2. Thiếu scope → `403` kèm tên scope.
3. Rate limit theo `keyId` bằng Redis; trả `429` + `X-RateLimit-*`.
4. Ghi `ApiUsageDaily` (upsert theo tenant/date/endpoint/method).
5. Audit log không ghi raw key.

**Điều kiện hoàn thành:** key tenant A không đọc được dữ liệu tenant B; vượt quota bị chặn.

---

## Phase 5 — API Key vận hành ⏳

1. UI `/admin/api-keys`: hiển thị `prefix`, scopes, `lastUsedAt`, `expiresAt`.
2. Nút revoke / rotate; raw key chỉ hiện một lần.
3. Cảnh báo key sắp hết hạn qua notification-service.
4. Dashboard usage theo key cho tenant.
5. Tài liệu tích hợp cho đối tác (curl + Postman + error code).

---

## Quy ước trạng thái

- ✅ Hoàn tất: đã code, rebuild, verify bằng request/screenshot.
- 🟡 Đang làm: đã có phần chạy được, còn hạng mục con.
- ⏳ Chưa bắt đầu: mới có thiết kế, chưa đổi schema/API.
