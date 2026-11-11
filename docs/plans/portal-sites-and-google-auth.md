# Portal Sites & Google Login — Cấu hình & phân quyền

> Trạng thái: **ĐÃ TRIỂN KHAI**
> Ngày: 2026-10-20
> Liên quan: `docker-compose.yml`, `infra/nginx/`, `backend/iam-service/src/auth/auth.service.ts`,
> `frontend/*/*/src/app/login`, `frontend/*/*/src/components/ui/GoogleLoginButton.tsx`

---

## 1. Mỗi app là một site riêng

Trước đây 4 portal chỉ truy cập được qua port (`:4001` … `:4004`) nên khó nhớ và
không giống môi trường thật. Nay có thêm reverse proxy Nginx, mỗi portal là một
host riêng:

| Site | URL | Portal |
|---|---|---|
| Admin | http://admin.localhost:8080 | `frontend/feature-test/admin-portal` |
| Tenant (back-office) | http://tenant.localhost:8080 | `frontend/reporting/tenant-portal` |
| Customer (B2B) | http://customer.localhost:8080 | `frontend/reporting/customer-portal` |
| Pack Station | http://pack.localhost:8080 | `frontend/reporting/pack-station-web` |

Ghi chú:

- `*.localhost` tự động resolve về `127.0.0.1` trên Chrome/Firefox/Safari —
  **không cần sửa `/etc/hosts`**.
- Port cũ (`4001`–`4004`) vẫn giữ để debug trực tiếp.
- Đổi port proxy: đặt `PORTALS_PROXY_PORT` trong `.env` (mặc định `8080`).
- Nginx chỉ là lớp định tuyến; từng portal vẫn là một Next.js app độc lập
  (image riêng, build riêng), nên có thể tách sang domain thật chỉ bằng cách
  đổi `server_name` và trỏ DNS.

### API URL

Các portal gọi API **same-origin**: `NEXT_PUBLIC_API_URL=/api/v1`.
Next.js rewrite `/api/v1/*` → `http://api-gateway:3000/api/v1/*`
(xem `next.config.*`, biến `API_INTERNAL_URL`).

Ưu điểm:

- Không còn lỗi CORS.
- Không còn rewrite sai tới `127.0.0.1:3001..3006` bên trong container.
- Đổi domain/site không cần build lại vì không phụ thuộc host tuyệt đối.

> `NEXT_PUBLIC_*` được inline **lúc build**. Dockerfile đã nhận chúng qua
> `ARG`/`ENV`; đặt trong `environment:` của compose chỉ có tác dụng runtime và
> **không** thay đổi bundle trình duyệt.

---

## 2. Google Login — cấu hình

### 2.1 Biến môi trường

```env
GOOGLE_CLIENT_ID=861188782661-ecu9981mrno8kmcn84t4lil8j09cl4jd.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=861188782661-ecu9981mrno8kmcn84t4lil8j09cl4jd.apps.googleusercontent.com

# Tự tạo TenantUser (role TENANT_USER) khi Google login ở tenant portal.
# Production nên để false.
GOOGLE_AUTO_PROVISION=false

# Email Google được phép vào Admin Portal (SUPER_ADMIN), cách nhau dấu phẩy.
# Tài khoản được tạo trong system_admins ở lần đăng nhập đầu tiên.
SUPER_ADMIN_GOOGLE_EMAILS=
```

`GOOGLE_CLIENT_ID` (backend) và `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend)
**phải giống nhau**, nếu lệch sẽ báo `Invalid Google token`.

### 2.2 Google Cloud Console

Thêm vào **Authorized JavaScript origins**:

```
http://localhost:4001
http://localhost:4002
http://localhost:4003
http://localhost:4004
```

> **Quan trọng — đã kiểm chứng với Google:**
> Google chỉ cho phép scheme `http://` với **đúng** `localhost` hoặc
> `127.0.0.1`. Các host kiểu `http://tenant.localhost:8080` bị Google coi là
> domain thường và **bắt buộc HTTPS**, nên sẽ trả lỗi:
>
> `You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy for keeping apps secure.`
>
> Vì vậy:
> - **Local dev:** dùng `http://localhost:4001`–`4004` khi test Google login.
> - **Production:** dùng domain thật có HTTPS, ví dụ
>   `https://admin.smartlogi.vn`, `https://tenant.smartlogi.vn`… và thêm các
>   origin đó vào Google Console.
> - Các subdomain `*.localhost:8080` vẫn dùng bình thường cho toàn bộ chức năng
>   khác; chỉ riêng Google OAuth là không thể dùng HTTP trên subdomain.

Ngoài origin, còn 2 điều kiện phía Google:
- OAuth consent screen đang **Testing** → phải thêm Gmail của bạn vào
  **Test users**, hoặc bấm **Publish app**.
- Client ID phải là loại **Web application** (không phải Android/iOS/Chrome
  extension).

---

## 3. Ma trận role — đăng nhập đúng cổng

Role lấy từ `user_roles` → `custom_roles` của chính tài khoản, **không** suy đoán
theo portal. Nếu role không thuộc cổng → `403`.

| Cổng | Role được phép | Endpoint |
|---|---|---|
| Admin | `SUPER_ADMIN` | `/admin/auth/*` |
| Tenant | `TENANT_ADMIN`, `TENANT_USER`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF`, `LOGISTICS_MANAGER`, `DRIVER` | `/tenant/auth/*` (`x-portal: tenant`) |
| Pack Station | `TENANT_ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` | `/tenant/auth/*` (`x-portal: pack-station`) |
| Customer | `CUSTOMER_CLIENT` | `/client/auth/*` |
| Driver App | `DRIVER` | `/mobile/auth/*` |

Header `x-portal` do frontend gửi lên; API Gateway **phải forward** header này
(đã thêm trong `proxy.middleware.ts` và `allowedHeaders` của CORS).

### 3.1 Google login

- Token Google được verify bằng `google-auth-library` với `audience = GOOGLE_CLIENT_ID`.
- Bắt buộc `email_verified !== false`.
- Tài khoản phải **đã tồn tại** và có role thuộc cổng.
- Ngoại lệ duy nhất: tenant portal + `GOOGLE_AUTO_PROVISION=true` → tạo mới với
  role thấp nhất `TENANT_USER`.
- **Không bao giờ** tự tạo `SUPER_ADMIN`. Admin Google chỉ chấp nhận tài khoản
  đã có trong `system_admins` hoặc email nằm trong `SUPER_ADMIN_GOOGLE_EMAILS`.
- Tài khoản tạo bằng Google có `passwordHash = ''` → không thể đăng nhập bằng mật khẩu.

### 3.2 Cấp quyền cho một tài khoản Google mới

**Tenant / Pack / Customer** — thêm user vào tenant với role phù hợp
(ví dụ qua trang Users/Roles của tenant portal, hoặc seed). Sau đó tài khoản đó
mới đăng nhập Google được.

**Admin** — thêm email vào `SUPER_ADMIN_GOOGLE_EMAILS` rồi khởi động lại
`iam-service`, hoặc tạo sẵn bản ghi trong `system_admins`.

---

## 4. Kiểm thử nhanh

```bash
# Đúng role
curl -s -X POST http://localhost:3000/api/v1/tenant/auth/login \
  -H 'content-type: application/json' \
  -H 'x-tenant-slug: demo-logistics-vn' \
  -H 'x-portal: pack-station' \
  -d '{"email":"staff@warehouse.vn","password":"Tenant@123"}'

# Sai role -> 403
curl -s -X POST http://localhost:3000/api/v1/tenant/auth/login \
  -H 'content-type: application/json' \
  -H 'x-tenant-slug: demo-logistics-vn' \
  -H 'x-portal: pack-station' \
  -d '{"email":"driver@smartlogi.vn","password":"Tenant@123"}'

# Site riêng
curl -I http://tenant.localhost:8080/login
curl -s http://tenant.localhost:8080/api/v1/health
```

---

## 5. Tài khoản seed

Sau khi reseed (`FORCE_RESEED=true`):

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Super Admin | `admin@smartlogi.vn` | `Admin@123` |
| Tenant Admin | `tenant.admin@smartlogi.vn` | `Tenant@123` |
| Warehouse Staff | `staff@warehouse.vn` | `Tenant@123` |
| Customer | `client@customer.vn` | `Tenant@123` |

Tenant slug: `demo-logistics-vn`.

> Seed super admin nằm trong
> `packages/prisma-schemas/prisma/seeds/12-system-tenant.ts`.
> Có thể override bằng `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`.

---

## 6. Fix vận hành đi kèm (2026-10-20)

Ba lỗi chặn portal sau khi tách site đã được sửa:

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| Customer/Admin reload bị đá về login | Auth effect chạy trước khi đọc `localStorage` | Thêm `isLoading` vào auth context; chỉ redirect khi đã đọc xong |
| Request có `Authorization: Bearer` vẫn bị `401 Missing X-API-Key` | Gateway kiểm tra `X-API-Key` trước khi xét Bearer | Cho Bearer JWT đi thẳng; chỉ đòi API key với request không có JWT |
| `SUPER_ADMIN` nhận `403 Forbidden resource` ở dashboard/audit log | Token có `permissions: []`, guard yêu cầu permission | `PermissionsGuard` cho `SUPER_ADMIN` bypass permission matrix |
| Order/Inventory/Logistics/Customer API trả `401 Invalid token` | Container thiếu `JWT_SECRET`, dùng default secret khác IAM | Thêm `JWT_SECRET=${JWT_SECRET}` vào `docker-compose.yml` |
| Tất cả query DB ở Order/Inventory/Logistics/Customer/Notification/IAM trả `500` (`Cannot read properties of undefined`) | Getter `PrismaService.tenantClient` bị Prisma Client proxy nuốt mất; property access trả về extended client không có model delegate | Đổi getter thành **method** `getTenantDb()`; thay 337 chỗ `.tenantClient` → `.getTenantDb()` |
| `GET /api/v1/orders` trả `403` dù token có `orders:read` | `PermissionsGuard` vừa là global `APP_GUARD` vừa nằm trong `@UseGuards`; global guard chạy trước `JwtAuthGuard` nên `request.user` còn `undefined` | Bỏ đăng ký global `PermissionsGuard` ở `order-service`; controller đã có `@UseGuards(JwtAuthGuard, PermissionsGuard)` |
| Customer dashboard luôn rỗng dù API trả đơn | API trả mảng trực tiếp nhưng page đọc `data.data` | Đọc `Array.isArray(data) ? data : data?.data ?? []` |
| Login `client@customer.vn` không có `ClientUser` | Seed chỉ tạo `TenantUser`, customer API cần mapping sang `Client` | Seed thêm `ClientUser` demo, gắn với client đầu tiên |
| Customer inventory trả `500 Unknown field zone for include on Bin` | `Bin` không có quan hệ trực tiếp với `Zone` | Include `bin.rack.zone` và đọc `inv.bin.rack.zone.code` |
| Pack Station `GET /inventory/ops/pack-log` trả `404`, POST thiếu `warehouseId` | Chỉ có POST và body yêu cầu `warehouseId`, trong khi UI chỉ gửi `barcode` | Thêm GET list; POST resolve `barcode` → `order`, fallback warehouse ACTIVE |
| Admin shipments/dashboard gọi `/logistics/shipments` trả `404` | Logistics chỉ có `/trips`, không có view shipment | Thêm `GET /logistics/shipments` map trip → shipment shape |
| Admin dashboard gọi `/admin/dashboard/logistics` trả `404` | IAM chưa có endpoint aggregate | Thêm endpoint đếm order/trip/vehicle/driver/inventory alert |
| Audit Logs crash `Cannot read properties of undefined (reading 'split')` | UI đọc `log.timestamp`, API trả `createdAt` | Map `createdAt/actorEmail/resourceType/resourceId` |
| Customer orders crash `shippingFee.toFixed is not a function` | Prisma Decimal serialize thành string | Ép `Number(...)` trước khi format |
| Tenant COD crash `e.map is not a function` | Response logistics bị wrap 2 lớp `{success,data:{data,meta}}` | Normalize `res.data?.data?.data ?? res.data?.data` |
| Pack icons mất vị trí/kích thước | `NavIcons.*` không nhận `className` | Đổi mọi icon sang `(props: SVGProps<SVGSVGElement>)` và spread vào `<svg>` |
| Customer webhooks crash `Link2 is not defined` | Icon không tồn tại trong bộ icon nội bộ | Dùng `Globe` |
| Customer invoices/orders hiển thị `$` cho tiền VND | Format thủ công thiếu locale | Thêm `formatVnd()` dùng `Intl.NumberFormat('vi-VN')` |

Lưu ý: `JWT_SECRET` phải giống nhau ở **tất cả** service xác thực JWT. Khi thêm
service mới, kiểm tra lại block `environment` trong `docker-compose.yml`.
