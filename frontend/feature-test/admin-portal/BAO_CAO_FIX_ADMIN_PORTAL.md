# BÁO CÁO TỔNG KẾT — Fix & Nâng Cấp SmartLogi Admin Portal (Logistics + AI)

## 1. Tổng quan dự án

- **Tên dự án**: SmartLogi — Admin Portal (Logistic AI Dashboard)
- **Thư mục**: `frontend/feature-test/admin-portal/`
- **Stack**: Next.js 15.2.0 (App Router), React 19, TypeScript 5.5.3, Tailwind CSS 3.4.7, Recharts 3.8.1, phosphor-react
- **Cổng chạy**: 4001
- **Trạng thái trước khi fix**: Hỏng, ~30 lỗi TypeScript, build thất bại, layout trùng lặp, theme sai, auth loop vô tận

---

## 2. Các vấn đề đã được phát hiện

### 2.1 Lỗi TypeScript (Build Errors)

| STT | Vị trí | Mô tả lỗi |
|-----|--------|-----------|
| 1 | 3 trang auth (profile, forgot-password, reset-password) | Icons JSX (`ShieldAlert`, `Mail`, `User`, `KeyRound`, `Lock`, `ArrowLeft`) được dùng mà không có import |
| 2 | `components/ui/GoogleLoginButton.tsx:32` | `onError` callback nhận tham số `error` nhưng GoogleLogin yêu cầu `() => void` (không nhận tham số) |
| 3 | `lib/api.ts:125,127` | Indexing `mockData[path]` gây lỗi TS7053 vì `mockData` không có index signature |
| 4 | `.next/types/app/admin/tenants/[id]/page.ts` | Stale build artifacts tham chiếu đến trang đã xóa |
| 5 | `tenants/[id]/page.tsx` | Next.js 15 yêu cầu `params` phải là `Promise` trong App Router |

### 2.2 Vấn đề kiến trúc (Architecture Problems)

| Vấn đề | Mô tả |
|--------|-------|
| **A — Double layout rendering** | Root `layout.tsx` bọc tất cả routes (bao gồm `/admin/*`) trong `<AppShell>` → AppShell render Sidebar + Header riêng. Đồng thời `admin/layout.tsx` LẠI render một Sidebar + TopBar nữa → 2 sidebar + 2 header trên mỗi trang admin |
| **B — AuthGate route mismatch** | AppShell kiểm tra `pathname.startsWith('/login')` — chỉ trùng khớp `/login`, KHÔNG trùng khớp `/admin/login` → dẫn đến vòng lặp đăng nhập vô tận |
| **C — Hai trang login trùng lặp** | `/app/login/page.tsx` (có nút Test Login) và `/app/admin/login/page.tsx` (không có) |
| **D — Dark theme mismatch** | `admin/profile/page.tsx` dùng dark theme classes (`text-white`, `bg-red-500/10`, `text-zinc-400`) nhưng `globals.css` định nghĩa light theme → text trắng trên nền trắng |
| **E — localStorage SSR crash** | `admin/layout.tsx` gọi `localStorage.getItem()` trực tiếp |
| **F — AI worker rewrite thiếu** | `next.config.js` có catch-all `/api/v1/:path*` → iam-service port 3001, nhưng không có rewrite nào cho `/api/v1/ai/*` → AI worker (port 8787) không được proxy |

---

## 3. Các thay đổi đã thực hiện

### 3.1 Fix lỗi TypeScript

#### a) Import icons từ phosphor-react (3 trang auth)
- **Profile page**: Thêm `import { ShieldWarning, Envelope, User, Key, Lock, ArrowLeft } from 'phosphor-react'`
  - Lưu ý: phosphor-react không có `ShieldAlert` → dùng `ShieldWarning`; không có `Mail` → dùng `Envelope`; không có `KeyRound` → dùng `Key`
- **Forgot-password page**: Thêm `import { Envelope, ArrowLeft, ShieldWarning } from 'phosphor-react'`
- **Reset-password page**: Thêm `import { ShieldWarning, ArrowLeft, Lock } from 'phosphor-react'`

#### b) Fix GoogleLoginButton.tsx
- Loại bỏ `onError={(error) => ...}` → `onError={() => { onError?.('Google login failed') }}`
- Loại bỏ `loading` và `clientId` props không hợp lệ (clientId được cung cấp bởi `GoogleOAuthProvider`)
- Dùng `containerProps` để handle `fullWidth`
- Thêm loading spinner riêng khi `loading=true`

#### c) Fix api.ts
- Thêm `Record<string, any>` type annotation cho `mockData` → loại bỏ lỗi TS7053
- Cải thiện interceptor: xử lý query string, xử lý `error.config` undefined (network errors)

#### d) Fix tenants/[id]/page.tsx
- Thay props `{ params: { id: string } }` bằng `useParams<{ id: string }>()` từ Next.js navigation (Next.js 15 yêu cầu params là Promise)

#### e) Dọn stale `.next`
- Xóa toàn bộ `.next/` trước build

### 3.2 Fix hệ thống layout (Root Cause: Double Sidebar/Header)

#### AppShell.tsx — rewrite hoàn toàn
- Public routes (`/login`, `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`): render children trực tiếp, không có shell
- Admin routes (`/admin/*`): chỉ render `<AuthGate>{children}</AuthGate>` — để `admin/layout.tsx` lo việc render Sidebar + TopBar
- Non-admin routes: render với Sidebar + Header (shell gốc)

#### AuthGate.tsx — cập nhật public route detection
- Thêm `/admin/login`, `/admin/forgot-password`, `/admin/reset-password` vào danh sách `PUBLIC_ROUTES`
- Chuyển hướng non-authenticated → `/admin/login` (thay vì `/login`)

#### AdminLayout.tsx — rewrite
- Dùng `useAuth()` thay vì `localStorage.getItem()` trực tiếp
- Xử lý tất cả public routes (`/admin/login`, `/admin/forgot-password`, `/admin/reset-password`)
- Thêm loading fallback khi chưa có token
- Thêm `AIChatButton` ở footer layout — khả dụng trên mọi trang admin

#### TopBar.tsx — cập nhật
- Dùng `useAuth()` để hiển thị thông tin user thực tế (email, role, initials)
- Thêm nút Logout dùng `auth.logout()`

#### Sidebar.tsx — cập nhật
- Dùng `useAuth()` cho nút logout
- Thêm icon cho từng menu item

### 3.3 Fix theme consistency (Dark → Light)

Chuyển 3 trang auth từ dark theme sang light theme nhất quán với `globals.css`:

| Phần tử | Trước (dark) | Sau (light) |
|---------|----------------|--------------|
| Background overlay | `bg-red-500/10 blur` | `bg-emerald-50 blur` (trạng thái thành công) / `bg-primary/5` (trang chủ) |
| Border card | `border-red-500/20` | `border-primary/20` |
| Text chính | `text-white` | `text-ink` |
| Text phụ | `text-zinc-400` | `text-inkSoft` |
| Input text | `text-white` | `text-ink` |
| Buttons | `bg-red-500 hover:bg-red-600` | `bg-primary hover:bg-primary-hover` |
| Icon background | `bg-red-500/20 text-red-500` | `bg-primary/10 text-primary` |
| Error/success messages | `bg-red-500/20` / `bg-emerald-500/20` | `bg-rose-50` / `bg-emerald-50` |

### 3.4 Thêm chức năng Role Switch nhanh (Account section)

- Tạo `src/lib/roles.ts` — định nghĩa tất cả 8 roles từ shared-types
- Tạo `src/lib/role-switch.ts` — utility `switchRole(newRole)` cập nhật localStorage (token + user object), dispatch storage event để sync giữa tabs
- Trang **Profile** (`/admin/profile`): 
  - Thêm thanh nút role-switch nhanh ở đầu trang với 8 roles
  - Nút role hiện tại được highlight bằng `bg-primary text-white`
  - Click nút khác → cập nhật role → tự động refresh sau 1.5s
  - Thêm nút "Sign Out" trong card Security

### 3.5 Nâng cấp Dashboard thành Logistics + AI Dashboard

#### a) Thay đổi sidebar menu
Thêm 2 mục mới:
- **Orders** (`/admin/orders`) — quản lý đơn hàng
- **Shipments** (`/admin/shipments`) — tracking vận đơn thời gian thực

#### b) Dashboard chính (`/admin/dashboard`)
Thêm các phần mới:
- **Logistics KPIs** (4 StatCards): Active Shipments, In Transit, On-Time Delivery, AI Optimization
- **Biểu đồ Predictive Delivery**: Bar chart so sánh dự báo AI vs số liệu thực tế qua 7 ngày
- **ShipmentMap** component: Live tracking shipments với status, progress bar
- **AIInsightsPanel** component: AI Model Hub (xem, retrain models) + AI Executive Summary (tóm tắt, rủi ro, khuyến nghị)

#### c) Tạo trang Orders (`/admin/orders`)
- Bảng quản lý đơn hàng với tracking number, khách hàng, tuyến đường, status, số tiền
- Fallback sang mock data khi backend không khả dụng

#### d) Tạo trang Shipments (`/admin/shipments`)
- Bảng tracking vận đơn thời gian thực với tài xế, xe, tuyến đường, progress, ETA
- Status badges: IN_TRANSIT (cyan), DELAYED (amber), DELIVERED (emerald)

#### e) AI Chat Button (`components/AIChatButton.tsx`)
- Nút floating ở góc dưới bên phải, khả dụng trên mọi trang admin
- Chat với AI phân tích logistics qua endpoint `/ai/v1/chat`
- Fallback message khi lỗi kết nối

### 3.6 Fix next.config.js — AI Worker Rewrite

Thêm 2 rewrite rules TRƯỚC catch-all `/api/v1/:path*`:
```js
{ source: '/api/v1/ai/v1/:path*', destination: '${AI_WORKER_URL}/api/v1/ai/v1/:path*' },
{ source: '/api/v1/ai/:path*', destination: '${AI_WORKER_URL}/api/v1/ai/:path*' },
```

### 3.7 Mock Data trong api.ts

Thêm mock data cho:
- `/admin/dashboard/stats` — platform stats (12 tenants, 847 users, $28.5k MRR, revenue/growth charts)
- `/admin/dashboard/logistics` — logistics KPIs (34 active shipments, 42 vehicles, 38 drivers, 7 inventory alerts, dự báo 7 ngày)
- `/ai/v1/models` — 4 AI models (demand, delivery-time, churn, anomaly)
- `/ai/v1/analyze` — AI executive summary (3 risks, 3 recommendations)

Interceptor cải tiến: tự động strip query string, xử lý network errors, fallback sang mock khi backend không khả dụng.

### 3.8 Fix layout-tokens.css

- Giữ nguyên `@tailwind` directives (cần thiết cho `@layer` hoạt động trong Next.js webpack)
- Cập nhật comment giải thích

---

## 4. Kết quả kiểm thử

### `npx tsc --noEmit` — PASS ✓
```
EXIT_CODE=0  (zero errors)
```

### `npx next build` — PASS ✓
```
✓ Generating static pages (18/18)
✓ Finalizing page optimization
```

### Routing đã được sinh (18 routes)
```
○ /                  151 B
○ /admin/ai-models   2.37 kB
○ /admin/audit-logs  3.11 kB
○ /admin/billing     2.99 kB
○ /admin/dashboard   120 kB
○ /admin/forgot-password  1.95 kB
○ /admin/login       1.07 kB
○ /admin/orders      2.01 kB
○ /admin/profile     6.06 kB
○ /admin/reset-password  2.21 kB
○ /admin/shipments   2.23 kB
○ /admin/tenants     5.61 kB
ƒ /admin/tenants/[id]   4.15 kB
○ /login              1.26 kB
○ /tenant             151 B
```

---

## 5. Tích hợp backend (API endpoints)

| Endpoint | Service | Port | Mô tả |
|----------|---------|------|-------|
| `/api/v1/admin/dashboard/stats` | IAM | 3001 | Platform stats (tenants, users, MRR) |
| `/api/v1/admin/dashboard/logistics` | Logistics | 3004 | Logistics KPIs (shipments, vehicles, drivers) |
| `/api/v1/admin/tenants` | IAM | 3001 | Tenant CRUD |
| `/api/v1/admin/billing` | IAM | 3001 | Billing & invoices |
| `/api/v1/admin/audit-logs` | IAM | 3001 | Security audit logs |
| `/api/v1/admin/auth/google` | IAM | 3001 | Google OAuth login |
| `/api/v1/admin/auth/profile` | IAM | 3001 | Get/update profile |
| `/api/v1/admin/auth/change-password` | IAM | 3001 | Change password |
| `/api/v1/admin/auth/forgot-password` | IAM | 3001 | Forgot password |
| `/api/v1/admin/auth/reset-password` | IAM | 3001 | Reset password |
| `/api/v1/logistics/shipments` | Logistics | 3004 | Real-time shipment tracking |
| `/api/v1/orders` | Order | 3003 | Order management |
| `/api/v1/ai/v1/models` | AI Worker | 8787 | AI model management |
| `/api/v1/ai/v1/chat` | AI Worker | 8787 | AI analysis chat |
| `/api/v1/ai/v1/analyze` | AI Worker | 8787 | One-shot payload analysis |
| `/api/v1/ai/v1/train/:type` | AI Worker | 8787 | Retrain AI models |
| `/api/v1/ai/v1/models/:id/activate` | AI Worker | 8787 | Activate model |

---

## 6. Shared Types integration

Admin portal đã tích hợp shared types từ `packages/shared-types/src/`:
- **Roles**: `SUPER_ADMIN`, `TENANT_ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF`, `LOGISTICS_MANAGER`, `DRIVER`, `CUSTOMER_CLIENT`, `TENANT_USER`
- **Permissions**: 37 quyền được định nghĩa (Inventory, Orders, Trips, Vehicles, Drivers, Billing, Tenants, etc.)

---

## 7. Danh sách files đã thay đổi / tạo mới

### Đã sửa (Modified)
| File | Thay đổi |
|------|----------|
| `src/app/layout.tsx` | Root layout — giữ nguyên (AppShell + AuthProvider + GoogleOAuthProvider) |
| `src/app/admin/layout.tsx` | Rewrite: dùng `useAuth()`, xử lý public routes, thêm AIChatButton |
| `src/components/AppShell.tsx` | Rewrite: không render Sidebar/Header cho admin routes |
| `src/components/AuthGate.tsx` | Rewrite: cập nhật public routes, redirect → `/admin/login` |
| `src/components/ui/GoogleLoginButton.tsx` | Fix type errors (onError, loading, clientId, fullWidth) |
| `src/components/layout/TopBar.tsx` | Dùng `useAuth()` để hiển thị user thực tế |
| `src/components/layout/Sidebar.tsx` | Dùng `useAuth()` cho logout, thêm icon menu items |
| `src/lib/api.ts` | Fix TS7053, thêm mock data (dashboard stats, logistics, AI models, AI analyze) |
| `src/app/admin/profile/page.tsx` | Rewrite: fix icon imports, light theme, thêm role-switch buttons |
| `src/app/admin/forgot-password/page.tsx` | Rewrite: fix icon imports, light theme |
| `src/app/admin/reset-password/page.tsx` | Rewrite: fix icon imports, light theme |
| `src/app/admin/login/page.tsx` | Cleanup: dùng `setToken` từ auth.ts |
| `src/app/login/page.tsx` | Cleanup: dùng `setToken`, test login |
| `src/app/admin/dashboard/page.tsx` | Rewrite: thêm Logistics KPIs, predictive chart, ShipmentMap, AIInsightsPanel |
| `src/app/admin/tenants/[id]/page.tsx` | Fix Next.js 15 params type (dùng `useParams`) |
| `src/styles/layout-tokens.css` | Giữ @tailwind directives, cập nhật comment |
| `next.config.js` | Thêm AI worker rewrite rules |

### Đã tạo mới (New Files)
| File | Mô tả |
|------|-------|
| `src/lib/roles.ts` | Role definitions (8 roles từ shared-types) |
| `src/lib/role-switch.ts` | Utility `switchRole()` — cập nhật localStorage, sync tabs |
| `src/components/AIChatButton.tsx` | Floating AI assistant chat button |
| `src/components/dashboard/ShipmentMap.tsx` | Live shipment tracking component |
| `src/components/dashboard/AIInsightsPanel.tsx` | AI model hub + analysis panel |
| `src/app/admin/orders/page.tsx` | Orders management page |
| `src/app/admin/shipments/page.tsx` | Shipments tracking page |

---

## 8. Kiến trúc layout sau khi fix

```
Root Layout (app/layout.tsx)
├── GoogleOAuthProvider (clientId)
├── AuthProvider (token, user, login, logout)
└── AppShell (root shell wrapper)
    ├── Public routes (login, admin/login, admin/forgot-password, admin/reset-password)
    │   └── Render children directly (no shell)
    │
    ├── Admin routes (admin/*, non-public)
    │   ├── AuthGate (check token, redirect if unauthenticated)
    │   └── children → AdminLayout (admin/layout.tsx)
    │       ├── Sidebar (layout/Sidebar.tsx) — menu có icon
    │       ├── TopBar (layout/TopBar.tsx) — user info + logout
    │       ├── main > children (page content)
    │       └── AIChatButton (floating, all pages)
    │
    └── Non-admin routes
        ├── AuthGate
        └── SimpleSidebar + Header (simple versions) + main > children
```

---

## 9. Hướng dẫn chạy dự án

```bash
# 1. Cài dependencies (nếu chưa có)
cd frontend/feature-test/admin-portal
pnpm install --frozen-lockfile

# 2. Chạy dev server (port 4001)
pnpm run dev

# 3. Mở trình duyệt
# http://localhost:4001/login
# Click "Test Login (Skip Google)" để vào dashboard
```

### Chế độ dev với backend đầy đủ:
```bash
# Chạy toàn bộ backend stack (IAM, Logistics, Orders, AI Worker)
# xem docker-compose.yml ở thư mục gốc dự án
docker-compose up -d
```

---

## 10. Lưu ý & hạn chế

1. **Role switch** là tính năng demo: cập nhật localStorage ngay lập tức, tự động refresh để áp dụng permissions mới. Trong môi trường production, role switch phải thông qua backend API để cấp quyền chính xác.
2. **Mock data** được kích hoạt ở chế độ `development` (NODE_ENV === 'development'). Khi backend không khả dụng, frontend sẽ tự động fallback về mock data.
3. **AI Worker** chạy ở port 8787 (Cloudflare Workers / `host.docker.internal:8787`). Rewrite trong `next.config.js` proxy `/api/v1/ai/*` → AI worker.
4. **Google OAuth** yêu cầu `NEXT_PUBLIC_GOOGLE_CLIENT_ID` được cấu hình trong môi trường.
5. **Test Login** button trên trang `/login` dùng token mẫu để bypass Google OAuth trong dev.
