# Thiết lập & Triển khai 4 Cổng Next.js trên Vercel (`visionary19`)

Tài liệu đặc tả cấu hình **4 dự án Vercel độc lập** cho SmartLogi AI SaaS trong team **`visionary19`** (`team_T6s3oJUmrj5hwTjwgDszZMP2`, gói `hobby`), liên kết trực tiếp với repository GitHub `lovemvaf/Logistic_AI_SaaS` (Production Branch: `main`).

> **Ràng buộc bảo vệ tài nguyên hiện hữu:**
> - **Tuyệt đối không chỉnh sửa hoặc xóa** dự án `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`, đã kiểm chứng giữ nguyên `updatedAt=1792953414661`) đang tồn tại trong team `visionary19`.
> - Không nâng cấp gói cước (`hobby`) hay tạo hạ tầng trả phí tự động.
> - Không đặt tệp `vercel.json` dùng chung ở thư mục gốc repository; mỗi dự án dùng `rootDirectory` riêng biệt để build chính xác từng portal.

---

## 1. Danh mục 4 Dự án Vercel (`visionary19`)

| Project Name | Vercel Project ID | Vai trò | `rootDirectory` | Dev local | Production URL (`main`) & Entry Routes |
|---|---|---|---|---:|---|
| `smartlogi-admin` | `prj_wbGhEWOdUz0khF8S0cqWIeFKZfhi` | Platform Governance (`SUPER_ADMIN`) | `frontend/feature-test/admin-portal` | `4001` | `https://smartlogi-admin.vercel.app` (`/admin/login`, `/build-info`, `/demo-handoff`) |
| `smartlogi-tenant` | `prj_fvHuOLZqucpjnVzRVhsCDw78uzyS` | Vận hành Kho, Fleet, Freight 3PL, Yard & XNK | `frontend/reporting/tenant-portal` | `4002` | `https://smartlogi-tenant.vercel.app` (`/login`, `/dashboard`, `/driver-sim`, `/build-info`) |
| `smartlogi-customer` | `prj_eSQvpGluaOMQZhioj6dLFVY5jSMq` | Cổng Khách hàng B2B & Public Tracking | `frontend/reporting/customer-portal` | `4003` | `https://smartlogi-customer.vercel.app` (`/client/login`, `/track/[code]`, `/build-info`) |
| `smartlogi-pack` | `prj_DkRnjpLl146dbdt3Gmf7rZvtrxl9` | Trạm Đóng gói Web Serial & MobileNet HITL | `frontend/reporting/pack-station-web` | `4004` | `https://smartlogi-pack.vercel.app` (`/login`, `/pack`, `/build-info`) |

---

## 2. Cấu hình Build & Monorepo trên Từng Project

Vì repository dùng `pnpm` workspaces (`pnpm@9.0.0`) và **Node 22 LTS**, cả 4 dự án đều nằm sâu 3 cấp (`frontend/<group>/<portal>`). Cấu hình thống nhất cho từng project:

- **Git Repository**: `lovemvaf/Logistic_AI_SaaS`
- **Production Branch**: `main` (push lên các nhánh `feat/**` tạo **Preview Deployment**; merge vào `main` kích hoạt **Production Deployment**)
- **Deployment Protection (`ssoProtection`)**: `null` (tắt SSO Protection ở Preview/Production để `verify-deployment.mjs` và người dùng cuối truy cập trang login/public track không bị Vercel SSO chặn HTTP `401`)
- **Install Command**: `cd ../../.. && pnpm install --frozen-lockfile`
- **Build Command**: `pnpm run vercel-build` (biên dịch `shared-types`, `demo-cloud-api`, `ui-components`, `ui-kit`, `hardware-bridge`, `map-components`, sau đó build 4 portal)
- **Include source files outside Root Directory**: `Enabled` (bắt buộc để truy cập [`packages/demo-cloud-api`](../../packages/demo-cloud-api), [`packages/ui-components`](../../packages/ui-components), [`packages/ui-kit`](../../packages/ui-kit), [`packages/shared-types`](../../packages/shared-types), [`packages/hardware-bridge`](../../packages/hardware-bridge), [`packages/map-components`](../../packages/map-components))

### Hai Chế độ Kết nối `/api/v1/*` Trên Vercel
1. **Demo Cloud In-Process Mode (Hiện hành trên `visionary19`)**:
   - Không đặt `API_INTERNAL_URL`; mỗi portal có App Router catch-all `src/app/api/v1/[[...path]]/route.ts` (`runtime = 'nodejs'`) gọi `handleNextApiRequest()` trong [`packages/demo-cloud-api/src/router.ts`](../../packages/demo-cloud-api/src/router.ts).
   - Cả 4 cổng dùng chung **Neon PostgreSQL 18.6 + PostGIS 3.6 (`ap-southeast-1` / `sin1`)** qua Prisma + RLS `app.tenant_id`, đồng bộ dữ liệu thật và chuyển cổng single-use `/demo-handoff`.
2. **Standalone Stateful Gateway Mode**:
   - Cả 4 cấu hình [`frontend/feature-test/admin-portal/next.config.js`](../../frontend/feature-test/admin-portal/next.config.js), [`frontend/reporting/tenant-portal/next.config.mjs`](../../frontend/reporting/tenant-portal/next.config.mjs), [`frontend/reporting/customer-portal/next.config.js`](../../frontend/reporting/customer-portal/next.config.js) và [`frontend/reporting/pack-station-web/next.config.js`](../../frontend/reporting/pack-station-web/next.config.js) kiểm tra `process.env.VERCEL === '1'` (tắt `output: 'standalone'`) và chỉ kích hoạt `rewrites()` `/api/v1/:path*` khi biến `API_INTERNAL_URL` được khai báo tới host `api/api-gateway` độc lập.

---

## 3. Chiến lược Biến Môi trường (Fail-Closed + Demo Cloud)

| Biến môi trường | Target (đã nạp trên Vercel) | Giá trị / Vai trò | Ghi chú bảo mật |
|---|---|---|---|
| `NEXT_PUBLIC_DATA_SOURCE` | `production`, `preview` | `api` | Tuyệt đối không đặt `mock`; khi API lỗi UI báo lỗi kết nối thật thay vì fallback tĩnh |
| `NEXT_PUBLIC_API_URL` | `production`, `preview` | `/api/v1` | Client gọi cùng origin để giữ `HttpOnly` cookie và tránh CORS |
| `NEXT_PUBLIC_DEMO_MODE` & `SMARTLOGI_DEMO_MODE` | `production`, `preview` | `true` (Demo Cloud) / `false` (Customer Prod tách riêng) | Bật thanh **Demo Control Center**, Persona Quick-Login & Cross-Portal Handoff |
| `NEXT_PUBLIC_{ADMIN,TENANT,CUSTOMER,PACK}_URL` | `production`, `preview` | URL `https://smartlogi-*.vercel.app` | Dùng làm đích chuyển cổng `/demo-handoff` giữa 4 website |
| `DEMO_APP_DATABASE_URL`, `DATABASE_URL`, `POSTGRES_PRISMA_URL` | `production`, `preview` *(Encrypted)* | Chuỗi kết nối Neon PostgreSQL + PostGIS (role `smartlogi_app`) | Tuyệt đối không lưu trong Git |
| `JWT_SECRET` & `DEMO_SESSION_SECRET` | `production`, `preview` *(Encrypted)* | Khóa HMAC-SHA256 đồng nhất giữa 4 portal | Hỗ trợ ký session token & xác thực qua `/demo/me` |
| `API_INTERNAL_URL` | Optional *(Server-only)* | Để trống ở Demo Cloud | Đặt HTTPS URL của `api-gateway` nếu chuyển sang cụm container riêng |

Xem đầy đủ ma trận biến môi trường cho toàn bộ backend/worker/seed trong [ENV_MATRIX.md](./ENV_MATRIX.md).

---

## 4. Quy trình Kiểm chứng Sau Triển khai

```bash
# Kiểm chứng đồng thời 4 cổng Vercel Production (SSR + /api/v1/health + fail-closed 401 + public tracking)
node scripts/verify-deployment.mjs \
  --admin-url https://smartlogi-admin.vercel.app \
  --tenant-url https://smartlogi-tenant.vercel.app \
  --customer-url https://smartlogi-customer.vercel.app \
  --pack-url https://smartlogi-pack.vercel.app
```
