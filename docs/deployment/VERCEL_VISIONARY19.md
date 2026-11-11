# Thiết lập & Triển khai 4 Cổng Next.js trên Vercel (`visionary19`)

Tài liệu đặc tả cấu hình **4 dự án Vercel độc lập** cho SmartLogi AI SaaS trong team **`visionary19`** (`team_T6s3oJUmrj5hwTjwgDszZMP2`, gói `hobby`), liên kết trực tiếp với repository GitHub `lovemvaf/Logistic_AI_SaaS`.

> **Ràng buộc bảo vệ tài nguyên hiện hữu:**
> - **Tuyệt đối không chỉnh sửa hoặc xóa** dự án `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`, đã kiểm chứng giữ nguyên `updatedAt=1792953414661`) đang tồn tại trong team `visionary19`.
> - Không nâng cấp gói cước (`hobby`) hay tạo hạ tầng trả phí tự động.
> - Không đặt tệp `vercel.json` dùng chung ở thư mục gốc repository; mỗi dự án dùng `rootDirectory` riêng biệt để build chính xác từng portal.

---

## 1. Danh mục 4 Dự án Vercel (`visionary19`)

| Project Name | Vercel Project ID | Vai trò | `rootDirectory` | Cổng dev local | Entry SSR & Public Alias |
|---|---|---|---|---:|---|
| `smartlogi-admin` | `prj_wbGhEWOdUz0khF8S0cqWIeFKZfhi` | Platform Governance (`SUPER_ADMIN`) | `frontend/feature-test/admin-portal` | `4001` | `/admin/login` — `smartlogi-admin-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app` |
| `smartlogi-tenant` | `prj_fvHuOLZqucpjnVzRVhsCDw78uzyS` | Vận hành Kho, Fleet, Freight 3PL, Yard & XNK | `frontend/reporting/tenant-portal` | `4002` | `/login` — `smartlogi-tenant-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app` |
| `smartlogi-customer` | `prj_eSQvpGluaOMQZhioj6dLFVY5jSMq` | Cổng Khách hàng B2B & Public Tracking | `frontend/reporting/customer-portal` | `4003` | `/client/login` & `/track/[code]` — `smartlogi-customer-git-feat-smartlogi-enterp-b5189a-visionary19.vercel.app` |
| `smartlogi-pack` | `prj_DkRnjpLl146dbdt3Gmf7rZvtrxl9` | Trạm Đóng gói Web Serial & MobileNet HITL | `frontend/reporting/pack-station-web` | `4004` | `/login` — `smartlogi-pack-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app` |

---

## 2. Cấu hình Build & Monorepo trên Từng Project

Vì repository dùng `pnpm` workspaces (`pnpm@9.0.0`) và **Node 22 LTS**, cả 4 dự án đều nằm sâu 3 cấp (`frontend/<group>/<portal>`). Cấu hình thống nhất cho từng project:

- **Git Repository**: `lovemvaf/Logistic_AI_SaaS`
- **Production Branch**: `main` (push lên các nhánh `feat/**` tạo **Preview Deployment**; merge PR vào `main` mới kích hoạt **Production Deployment**)
- **Deployment Protection (`ssoProtection`)**: `null` (tắt SSO Protection ở Preview/Production để `verify-deployment.mjs` và người dùng cuối truy cập trang login/public track không bị Vercel SSO chặn HTTP `401`)
- **Install Command**: `cd ../../.. && pnpm install --frozen-lockfile`
- **Build Command**: `pnpm run vercel-build`
- **Include source files outside Root Directory**: `Enabled` (bắt buộc để truy cập [`packages/ui-components`](../../packages/ui-components), [`packages/ui-kit`](../../packages/ui-kit), [`packages/shared-types`](../../packages/shared-types), [`packages/hardware-bridge`](../../packages/hardware-bridge), [`packages/map-components`](../../packages/map-components))

### Tương thích `next.config.*` trên Vercel
Cả 4 cấu hình [`frontend/feature-test/admin-portal/next.config.js`](../../frontend/feature-test/admin-portal/next.config.js), [`frontend/reporting/tenant-portal/next.config.mjs`](../../frontend/reporting/tenant-portal/next.config.mjs), [`frontend/reporting/customer-portal/next.config.js`](../../frontend/reporting/customer-portal/next.config.js) và [`frontend/reporting/pack-station-web/next.config.js`](../../frontend/reporting/pack-station-web/next.config.js) đều áp dụng chuẩn chung:
- Kiểm tra `process.env.VERCEL === '1'`: tắt `output: 'standalone'` khi build trên Vercel (chỉ bật `standalone` cho Docker/node self-host).
- Kiểm tra kiểu TypeScript nghiêm ngặt khi build (`typescript: { ignoreBuildErrors: false }`).
- **Same-origin API Proxy (`/api/v1/:path*`)**: Chỉ kích hoạt `rewrites()` khi có `API_INTERNAL_URL` ở môi trường server Vercel, tránh vòng lặp lỗi tới hostname nội bộ `api-gateway:3000` khi chưa gắn backend gateway công khai.

---

## 3. Chiến lược Biến Môi trường (Fail-Closed Production)

| Biến môi trường | Target (đã nạp trên Vercel) | Giá trị chuẩn | Ghi chú bảo mật |
|---|---|---|---|
| `NEXT_PUBLIC_DATA_SOURCE` | `production`, `preview` | `api` | Tuyệt đối không đặt `mock` ở Production; khi lỗi API phải báo lỗi thật thay vì rơi ngầm về seed giả lập |
| `NEXT_PUBLIC_API_URL` | `production`, `preview` | `/api/v1` | Client gọi cùng origin qua Next rewrite để tránh CORS cross-domain với cookie/token |
| `API_INTERNAL_URL` | `production`, `preview` *(Server-only)* | URL HTTPS của `api-gateway` | Đặt tại Project Env ngay khi backend container gateway có domain HTTPS công khai; khi chưa cấu hình, trang SSR login/UI vẫn render nhưng `/api/v1/*` ở trạng thái `[BLOCKED]` |
| `NEXT_PUBLIC_DEMO_MODE` | `production`, `preview` | `false` (hiện đặt `false` an toàn trên Vercel) | Chỉ bật `true` trên môi trường staging demo tách biệt khỏi dữ liệu khách hàng thật |

Xem đầy đủ ma trận biến môi trường cho toàn bộ backend/worker trong [ENV_MATRIX.md](./ENV_MATRIX.md).

---

## 4. Quy trình Kiểm chứng Sau Triển khai

Sử dụng công cụ không phụ thuộc package ngoài [`scripts/verify-deployment.mjs`](../../scripts/verify-deployment.mjs):

```bash
# Kiểm tra đầy đủ khi đã nối backend gateway + AI worker công khai
node scripts/verify-deployment.mjs \
  --admin-url https://smartlogi-admin.vercel.app \
  --tenant-url https://smartlogi-tenant.vercel.app \
  --customer-url https://smartlogi-customer.vercel.app \
  --pack-url https://smartlogi-pack.vercel.app \
  --gateway-url https://<gateway-https-domain> \
  --ai-url https://<worker-subdomain>.workers.dev

# Kiểm tra riêng SSR 4 portal Vercel khi hạ tầng backend công khai đang [BLOCKED]
node scripts/verify-deployment.mjs --skip-proxy \
  --admin-url https://smartlogi-admin-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app \
  --tenant-url https://smartlogi-tenant-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app \
  --customer-url https://smartlogi-customer-git-feat-smartlogi-enterp-b5189a-visionary19.vercel.app \
  --pack-url https://smartlogi-pack-git-feat-smartlogi-enterprise-2026-visionary19.vercel.app
```
