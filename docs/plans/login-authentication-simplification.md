# Phân tích lỗi đăng nhập và giải pháp

## Tổng quan hệ thống

Dự án sử dụng kiến trúc **multi-tenant** với các thành phần:

### Backend (IAM Service)
- **PrismaService**: Hỗ trợ multi-schema bằng cách dùng `AsyncLocalStorage` để set `search_path` cho PostgreSQL
- **AuthService.loginTenantUser()**: Kiểm tra tenant tồn tại qua slug, sau đó dùng `runWithSchema` để truy vấn user trong schema của tenant
- **JWT Strategy**: Xác thực token và trả về payload chứa `role`, `tenant_id`, `schema_name`
- **TenantSchemaInterceptor**: Set schema context từ JWT user sau khi guard chạy

### Frontend Ports
1. **tenant-portal** (port 3001) - Dành cho tenant users (TENANT_ADMIN, WAREHOUSE_MANAGER, v.v.)
2. **customer-portal** (port 3002) - Dành cho B2B client users
3. **admin-portal** (port 3000) - Dành cho super admin
4. **pack-station-web** (port 4001) - Dành cho warehouse staff
5. **driver-app** - Dành cho drivers

---

## Nguyên nhân gây lỗi đăng nhập (phân tích dựa trên code)

### Vấn đề 1: Kiểm tra tenant trong Login Response
File: `tenant-auth.controller.ts:32-38`
```typescript
return {
  ok: true,
  accessToken: result.access_token,
}
```
- Backend trả về `accessToken` (camelCase) nhưng frontend có thể đang đọc `access_token` (snake_case)
- File `tenant-portal/login/page.tsx:71` đọc `response.data?.accessToken` - khớp đúng

### Vấn đề 2: Seed data tạo user trong schema sai
File: `seed-lite.ts:126-148`
- Tạo tenant users trong schema mặc định (public) chứ không phải trong tenant schema (tenant_demo)
- Khi login, code sẽ tìm user trong `tenant_demo` schema nhưng user thực sự ở `public` schema

### Vấn đề 3: Thiếu role extraction sau login (customer-portal)
File: `customer-portal/login/page.tsx:33-34`
```typescript
if (res.data?.accessToken) {
  login(res.data.accessToken);  // Chỉ truyền token, không truyền user/role
}
```
- So với tenant-portal đã gọi `decodeJwt()` và trích xuất role để redirect

### Vấn đề 4: API URL không nhất quán
- `tenant-portal/src/lib/api.ts:13` - dùng `/api/v1` (tương đối)
- `customer-portal/src/lib/api.ts:13` - dùng `http://localhost:3000/api/v1` (tuyệt đối)
- `admin-portal/src/lib/api.ts:13` - dùng `http://localhost:3000/api/v1` (tuyệt đối, port 3000 là admin portal!)

### Vấn đề 5: Customer portal login không redirect theo role
- Không có logic redirect theo role như tenant-portal

---

## Giải pháp đề xuất (theo yêu cầu: "bỏ phần xác thực đăng nhập")

### Yêu cầu: Chỉ kiểm tra Workspace Slug, các trường khác bỏ kiểm tra

#### Backend Changes:
1. **Xóa các logic kiểm tra authentication**:
   - `auth.service.ts`: Bỏ kiểm tra password, account lockout, password strength validation
   - `auth.service.ts loginTenantUser()`: Bỏ validate password, bỏ status check
   - Chỉ giữ lại: kiểm tra tenant slug tồn tại, trả về token với role được xác định từ slug

2. **Tạo mapping role theo workspace slug** (ví dụ):
   - `demo-tenant` → TENANT_ADMIN
   - `warehouse-tenant` → WAREHOUSE_MANAGER
   - `logistics-tenant` → LOGISTICS_MANAGER
   - ...

#### Frontend Changes (tất cả các portal):

1. **tenant-portal/src/app/login/page.tsx**:
   - Bỏ kiểm tra email, password
   - Chỉ kiểm tra workspace slug
   - Mapping slug → role và redirect tương ứng

2. **customer-portal/src/app/client/login/page.tsx**:
   - Tương tự: chỉ kiểm tra workspace slug
   - Mapping slug → role (CUSTOMER_CLIENT)

3. **pack-station-web/src/app/login/page.tsx**:
   - Chỉ kiểm tra workspace slug
   - Mapping slug → role (WAREHOUSE_STAFF)

4. **admin-portal/src/app/tenant/login/page.tsx**:
   - Chỉ kiểm tra workspace slug

5. **driver-app/src/screens/LoginScreen.tsx**:
   - Thêm input workspace slug
   - Mapping slug → role (DRIVER)

#### Các file cần dọn dẹp:
- `auth.service.ts`: Bỏ `validatePasswordStrength()`, `checkAccountLockout()`, `recordFailedLogin()`, `resetLoginAttempts()`
- `tenant-auth.controller.ts`: Bỏ MFA verify endpoint
- `auth.ts` (các portal): Bỏ decodeJwt logic phức tạp, chỉ cần lưu token + role từ slug
- `auth-context.tsx`: Đơn giản hoá

---

## Files cần chỉnh sửa

### Backend (services/iam-service/src/)
| File | Hành động |
|------|-----------|
| `auth/auth.service.ts` | Bỏ logic password validation, chỉ giữ loginTenantUser với slug-based role |
| `controllers/tenant-auth.controller.ts` | Giữ nguyên, service đã đơn giản hoá |
| `controllers/client-auth.controller.ts` | Giữ nguyên |
| `controllers/mobile-auth.controller.ts` | Giữ nguyên |

### Frontend
| File | Portal | Hành động |
|------|--------|----------|
| `login/page.tsx` | tenant-portal | Chỉ check slug, mapping role → redirect |
| `login/page.tsx` | customer-portal | Chỉ check slug, mapping role → redirect |
| `login/page.tsx` | pack-station-web | Chỉ check slug, mapping role → redirect |
| `tenant/login/page.tsx` | admin-portal | Chỉ check slug |
| `LoginScreen.tsx` | driver-app | Thêm slug input, mapping role |
| `lib/auth.ts` | tenant-portal | Đơn giản hoá, chỉ lưu token + role |
| `lib/auth-context.tsx` | tenant-portal | Đơn giản hoá |
| `lib/auth.ts` | customer-portal | Thêm decodeJwt, mapping role |
| `lib/auth-context.tsx` | customer-portal | Đơn giản hoá |
| `lib/auth.ts` | pack-station-web | Thêm decodeJwt |
| `lib/auth-context.tsx` | pack-station-web | Giống customer-portal |

---

## Lưu ý quan trọng

1. Khi bỏ authentication, cần đồng bộ JWT_SECRET ở tất cả các service
2. Cần cập nhật seed script để không cần tạo password hash cho users (hoặc giữ password mặc định)
3. Các endpoint được bảo vệ bằng JWT vẫn cần kiểm tra token, chỉ không kiểm tra password nữa
4. Cần xóa mfa service nếu không dùng đến