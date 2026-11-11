# Báo cáo cuối — A5 Pack Station + Customer Portal

> Đợt: 2026-11-11 — `pack-station-web` (trạm đóng gói) + `customer-portal` (B2B khách hàng), tuân thủ `AGENTS.md` mục 7 (chuẩn hoàn thành), `docs/plans/design-refresh-no-icons.md`, `docs/plans/ui-consistency.md` và mẫu báo cáo `docs/agent-prompts/README.md`.

## Đã sửa / tạo mới

### Lớp mock + dữ liệu (mặc định `NEXT_PUBLIC_DATA_SOURCE=mock`, độc lập cho mỗi portal)

**Pack station (`pack-station-web`)**
- `src/lib/data.ts` — cổng duy nhất: `mock` mặc định, `api` khi đặt `NEXT_PUBLIC_DATA_SOURCE=api`.
- `src/lib/labels.ts` — nhãn trạng thái, `formatDateTimeVN`, `formatCurrency`, `boxTypeLabel`, `priorityLabel`, `anomalyKindLabel`, `anomalySeverityLabel`, `anomalySeverityTone` (14 label/domain map).
- `src/lib/mock/{types,seed,store,repository,mock-auth}.ts` — `MockRepository` đầy đủ : CRUX + `nextOrder/scan/seal/byPackCode/summary`, `sessions.start/active/scans/dashboard`, `corrections.create/updateStatus`, `stations`, `staff`, `aiFeature.predictSku/detectAnomaly`, `controls`, `reset`. `localStorage` key `smartlogi.pack.mock.db`, `DB_VERSION = 4`, `settle()` (độ trễ + 503), `reset()`.
- `src/lib/mock/repository.ts` — adapter REST đồng bề mặt (`/api/v1/inventory/ops/pack-log`, `/api/v1/wms/packing‑sessions`); AI trả default khi backend chưa sẵn sàng.

**Customer portal (`customer-portal`)**
- `src/lib/data.ts` + `src/lib/mock/{types,seed,store,repository,mock-auth}.ts` — `MockRepository` cho khách hàng B2B: `orders.createOrder/cancelOrder/byTrackingCode/live/sla/summary`, `invoices.list/recordPayment`, `returns.requestReturn/` list, `webhooks CRUD/toggleWebhook`, `stock.list`, `profiles.list/saveProfile`, `aiFeature.predictETA/deliverySuggestions/anomalyForecast/profileInsights/chatReply/feedback`, `controls`. `localStorage` key `smartlogi.customer.mock.db`, `DB_VERSION = 4`, `settle()` + lỗi giả.
- `src/lib/api.ts` — axios kèm interceptor token/x-tenant-slug, trả về cùng envelope `{ data, meta }`.

### Trang

| Portal | Trang | Nội dung |
|---|---|---|
| Pack | `/pack` | 2 cột: AI camera (MobileNet/`try-catch`) + Web Serial scanner. Chọn đơn → quét → MATCH/MISMATCH/OVERRIDE → seal + đính chính; MetricBand + station rail 3 bước. |
| Pack | `/pack/logs` | Bảng lịch sử ghi nhận + cột AI: dự báo bất thường, trạng thái sửa. |
| Pack | `/login` | Form giả `pack@smartlogi.vn` + token base64payload → `useAuth`. |
| Customer | `/client/dashboard` | 2 bảng (đơn/hoá đơn), `predictETA`. |
| Customer | `/client/orders` | CRUD + gợi ý `deliverySuggestions`. |
| Customer | `/client/invoices` | Bảng + thanh toán, `anomalyForecast`. |
| Customer | `/client/returns` | Yêu cầu trả hàng. |
| Customer | `/client/webhooks` | CRUD webhook. |
| Customer | `/client/inventory` | Tồn kho. |
| Customer | `/client/profile` + `/client/orders/upload` | Hồ sơ + nhập hàng loạt CSV. |
| Customer | `/track/[code]` (công cộng) | Timeline + ETA dự đoán. |
| Customer | `/client/login` + FirebaseAuth | Gated container (`client/layout.tsx`). |

### Sửa lỗi và hoàn thiện (lần này)

- `src/app/pack/logs/page.tsx` — hợp nhất 2 khối `import type` trùng (`CorrectionLog…` / `AiAnomaly`), kiểm tra lại `colSpan`: bảng có 10 `<th>` (phiên, mã đơn, trạm, nhân viên, dự kiến/quét, khớp, cân, hộp, trạng thái, giờ), 10 `<td>`/dòng, `colSpan={10}` — **khớp, không cần sửa**.
- `src/app/client/layout.tsx` — thêm 2 mục sidebar còn thiếu: `Orders Upload` (`/client/orders/upload`), `Profile` (`/client/profile`).
- `src/app/client/orders/upload/page.tsx` — `TableState loading={false}` → `loading={uploading}`, đảm bảo trạng thái loading của bảng khả thi.
- `src/app/reset-password/page.tsx` — placeholder "Min. 8 characters" → "Tối thiểu 8 ký tự", "Re-enter password" → "Nhập lại mật khẩu" (copy tiếng Việt).
- Checks tĩnh: vùng Sidebar, 7 table có đủ 4 trạng thái, các hàm `data.*` tồn tại ở cả `store.ts` và `repository.ts`.

## Route thêm

- `/pack`, `/pack/logs`, `/login` — đã có mục trong `src/components/Sidebar.tsx` (`Đóng gói` + `Nhật ký`), không cần thêm.
- `/client/profile`, `/client/orders/upload` — **đã thêm** mục điều hướng vào sidebar của `client/layout.tsx`.
- `/track/[code]` — công cộng, không đi qua sidebar.

## Dữ liệu dùng

Tất cả `data.<nhóm>.<hàm>` được các trang gọi đều có ở cả `mock/store.ts` và `mock/repository.ts` — **không hàm nào thiếu, không cần A0 bổ sung**:

| Portal | Nhóm | Hàm |
|---|---|---|
| Pack | `orders` | `list`, `nextOrder`, `scan`, `seal`, `byPackCode`, `summary` |
| Pack | `sessions` | `list`, `start`, `active`, `scans`, `dashboard` |
| Pack | `corrections` | `list`, `create`, `updateStatus` |
| Pack | `stations`, `staff` | `list` |
| Pack | `aiFeature` | `predictSku`, `detectAnomaly` |
| Customer | `orders` | `list`, `createOrder`, `cancelOrder`, `byTrackingCode`, `live`, `sla`, `summary` |
| Customer | `invoices` | `list`, `recordPayment` |
| Customer | `returns` | `list`, `requestReturn` |
| Customer | `webhooks` | `list`, `create`, `toggleWebhook`, `remove` |
| Customer | `stock` | `list` |
| Customer | `profiles` | `list`, `saveProfile` |
| Customer | `aiFeature` | `predictETA`, `deliverySuggestions`, `anomalyForecast`, `profileInsights`, `chatReply`, `feedback` |

Hàm đang có trên mock nhưng chưa dùng bởi trang: `chatReply`, `profileInsights`, `feedback` (customer — mock parity), `predictSku` (pack — chuẩn REST).

## Đã kiểm tra tĩnh

1. **Import:** mọi `@/...` trỏ file tồn tại; named export có thật (`grep "^export"`) — xác nhận trên cả 30+ page/component.
2. **Props component:** `EditorialPageHeader`, `MetricBand`, `EditorialSection`, `StatusLabel`, `EmptyNote`, `Button`, `Input`, `Select`, `Modal`, `TableState` — đều truyền đúng prop, đúng kiểu, không `as any` mới.
3. **4 trạng thái bảng:** 9 `TableState` trên 8 trang (`/pack/logs`, `dashboard` ×2, `orders`, `orders/upload`, `webhooks`, `inventory`, `returns`, `invoices`) — đủ loading/empty/error/data.
4. **Ghi dữ liệu:** mọi `await data.x.y(...)` đều cập nhật state/danh sách (`fetchCorrections`, `setSelectedCorrection`, `setSessions`...) + catch hiển thị lỗi gốc; không có try/sweet chỉ toast.
5. **Client boundary:** page đều `'use client'`; `localStorage` chỉ đọc ghi trong mock-store hook, không ở module scope.
6. **Không sót:** sweep toàn bộ `src` của cả 2 portal — không `console.log`, `alert(`, `TODO`, `FIXME`, nút rỗng, `bg-paper`, `href="#"`.
7. **Currency/ngày/số:** vND `Intl.NumberFormat('vi-VN')` (ký `₫`), ISO lưu trữ, `dd/MM/yyyy HH:mm`, `tabular-nums`.
8. **Design system:** canvas `#f6f3ee` (`bg-canvas`), hairline border, trạng thái = chấm + chữ, không gradient/shadow lớn/hero/pill/icon; `shadow-floating` có trong `src/styles/*.css`.
9. **Demo account:** `pack@smartlogi.vn` (WAREHOUSE_STAFF, `hw-001`), `buyer@anphat.vn` (CLIENT, `Nguyễn Văn An`).
10. **AuthProvider:** `/track/*`/`/` công cộng; `/client/*` được `client/layout.tsx` bảo vệ; Pack `AuthGate` ở `components/AppShell.tsx`.
11. **Không đổi lockfile:** `git status` không có `pnpm-lock.yaml`, `package.json` workspace.
12. **Không import chéo portal:** sweep `from '.*portal'` — khôngoner.

## Lỗi / thiếu / sai sót phát hiện

1. **Customer Portal — AI chatbot / feedback:** `aiFeature.chatReply`, `profileInsights`, `feedback` có sẵn trên mock layer + REST default (`null`/`[]`) để trang không cảnh nhánh, nhưng **chưa có trang nào gọi** (chatbot, feedback page). Đây là tính năng nằm trên mock layer chứ chưa có UI. Khách chỉ dùng `predictETA`, `deliverySuggestions`, `anomalyForecast`.
2. **`AIChatButton.tsx` (sẵn)** — thành phần này đã có sẵn (3 commit, dùng nhiều portal: pack/tenant/admin) và gọi `api.post('/ai/v1/chat')` trực tiếp thay qua `@/lib/data`, chưa tuân thủ `AGENTS.md` mục 3 ("Mọi truy cập dữ liệu của page/component đi qua `@/lib/data`") cùng bubble chat nổi + icon; chưa sửa vì là tài nguyên chung đã đóng băng.
3. **`/pack/reset-password`** (đã sửa content placeholders) — các trang login/gia hạn cũ (`/forgot-password`, `reset-password`, `Header`) mặc định `@/lib/api` — không phải trang mới.
4. **`useSerialPort`** — chỉ trả `data` dạng chuỗi, Mock xác nhận `isConnected`. Scan vật lý chưa được khẳng định trên thiết bị.
5. **TensorFlow/MobileNet** — phụ thuộc WebGL backend (WASM); chưa build thực tế nên kích thước bundle chưa đo được, đảm bảo `try/catch` không treo.

## Chưa làm được

- Backend thật (core-api NestJS / Rust): `mock/repository.ts` thoát payload/response; đã đảm bảo `NEXT_PUBLIC_DATA_SOURCE=api` sẽ không thay đổi cách chạy của trang, chỉ xác nhận khi backend live.
- Không chạy build (`next build`) vì môi trường host free plan bị cấm; mọi xác minh là tĩnh.
- Chatbot/feedback UI (customer): chỉ mock layer parity, chưa có page + sidebar entry.
