# A4 — Admin portal (quản trị nền tảng)

## Vai trò

Bạn sở hữu `frontend/feature-test/admin-portal`, site được deploy chính trên Vercel.
Mục tiêu: chuyển toàn bộ màn hình sang ngôn ngữ editorial, phủ đủ tính năng quản trị đa
tenant, và bảo đảm bản demo chạy hoàn toàn bằng mock + "test login" khi không có backend.

## Đọc trước

- `AGENTS.md` mục 1–7
- `docs/agent-prompts/00-nen-tang-da-xong.md` (về `@/lib/data` của tenant portal — bạn
  không dùng, nhưng cùng quy tắc)
- `docs/plans/design-refresh-no-icons.md`
- `frontend/feature-test/admin-portal/src/lib/local-store.ts` (toàn bộ),
  `src/lib/auth.ts`, `src/components/AuthGate.tsx`
- `next.config.js` của admin portal

## Vùng được sửa

Toàn bộ `frontend/feature-test/admin-portal/**`. Không sửa portal khác, không sửa
`packages/**`, không sửa `pnpm-lock.yaml`.

## Hiện trạng

- Mock localStorage trong `src/lib/local-store.ts`: orders, shipments, dashboard,
  logistics, audit logs, tenants, invoices, AI models, AI analysis, profile.
- Có `AuthGate`, `setToken`, nút "test login" tạo token cục bộ.
- Sidebar tự viết, thiếu link Orders / Shipments / AI Models dù page tồn tại.
- Nhiều page còn card KPI, icon Phosphor, `rounded-xl`, `shadow`.
- `next.config.js` đã xử lý `output: standalone` theo `VERCEL`.

## Việc phải làm

### 1. Khung và điều hướng

- Thay Sidebar tự viết bằng `Sidebar` của `ui-kit` với `NavSection[]`, giữ brand
  "SmartLogi / Platform admin".
- Nhóm menu:
  - Tổng quan: Dashboard
  - Khách thuê: Tenants, Gói & hoá đơn (billing)
  - Vận hành: Orders, Shipments
  - AI: AI Models
  - Hệ thống: Audit logs, Hồ sơ
- Thêm mục còn thiếu (Orders, Shipments, AI Models) — hiện page có nhưng không vào được.
- Header dùng `Topbar` của `ui-kit`; bỏ avatar tròn/chuông icon; giữ logout chữ.
- `AppShell` chuyển sang shell `ui-kit`; không double padding (đã có 24px).

### 2. `/admin/login` và `/admin/dashboard`

- Login: bố cục editorial 2 cột như tenant portal, tiếng Việt, bỏ SVG trang trí.
- Giữ nút "Vào bằng tài khoản thử nghiệm" hoạt động khi không có backend; đổi nhãn tiếng
  Việt và giải thích dữ liệu là mẫu.
- Không gọi Google OAuth khi chưa cấu hình `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; ẩn nút thay
  vì để bấm lỗi.
- Dashboard: bỏ 4 card KPI, dùng `MetricBand` (MRR, tenant hoạt động, đơn tháng, tỷ lệ
  huỷ). Doanh thu theo tháng bằng bảng + thanh CSS hoặc `recharts` đã có, không thêm lib.
- Danh sách tenant tăng trưởng nhanh, hoá đơn quá hạn, audit gần nhất: 3 khối
  `EditorialSection` có link.

### 3. `/admin/tenants` và `/admin/tenants/[id]`

- Bảng: mã, tên, gói, trạng thái, người dùng, đơn tháng, MRR, ngày tạo. Tìm + lọc gói/trạng
  thái.
- Tạo tenant: modal (tên, mã slug, gói, email quản trị) → `create('tenants', ...)`.
- Chi tiết: thông tin, gói, người dùng, hoá đơn, hoạt động gần nhất; tạm dừng/kích hoạt.
- Không xoá tenant; chỉ đổi trạng thái `SUSPENDED`.

### 4. `/admin/orders`, `/admin/orders/new`, `/admin/orders/upload`

- Bảng đơn toàn hệ thống: mã, tenant, khách gửi, người nhận, trạng thái, COD, ngày tạo.
- Lọc tenant/trạng thái, tìm mã đơn.
- Tạo đơn dùng `create('orders', ...)`; upload CSV parse thủ công như A2, không thêm lib.
- Sau khi tạo, danh sách cập nhật ngay, không reload trang.

### 5. `/admin/shipments`

- Bảng vận đơn: mã, tài xế, xe, tuyến, tiến độ, ETA, trạng thái. Thanh tiến độ hairline.
- Lọc trạng thái; DELAYED tông danger, PENDING warning.
- Không thêm bản đồ nếu admin portal chưa có `map-components` trong dependencies.

### 6. `/admin/billing`

- Bảng hoá đơn tenant: mã, tenant, kỳ, số tiền, trạng thái, hạn.
- Ghi nhận thanh toán qua `update('invoices', id, { status: 'PAID' })`; xác nhận trước.
- Metric: doanh thu kỳ, quá hạn, đã thu, số hoá đơn mở.

### 7. `/admin/ai-models`

- Bảng mô hình: tên, phiên bản, loại, trạng thái, độ chính xác, lần huấn luyện, người
  phụ trách.
- Bật/tắt triển khai qua `update`; không bịa nút huấn luyện nếu không có mock action.
- Panel phân tích AI: tổng quan, cảnh báo, đề xuất; dùng dữ liệu `SEED_DATA`.

### 8. `/admin/audit-logs`

- Bảng: thời điểm, actor, hành động, đối tượng, IP, kết quả.
- Lọc actor/hành động/kết quả, tìm đối tượng; phân trang client.
- DENIED/ERROR tông danger.

### 9. `/admin/profile`

- Form hồ sơ: tên, email, điện thoại, vai trò (read-only), múi giờ.
- Lưu vào local-store `profile`; hiển thị trạng thái đã lưu.

### 10. Mock và deploy

- Tất cả page đọc/ghi qua `local-store` (`getAll`, `getOne`, `create`, `update`, `remove`,
  `fetchFromStoreOrAPI`). Không gọi `api` trực tiếp trong page mới.
- Tăng `SEED_VERSION` khi đổi cấu trúc seed để trình duyệt cũ tự nạp lại.
- `fetchFromStoreOrAPI` phải trả mock ngay khi `NEXT_PUBLIC_DATA_SOURCE !== 'api'` hoặc
  khi request lỗi; không chặn UI bằng timeout dài.
- Giữ `next.config.js` tương thích Vercel; không thêm `vercel.json` mới nếu không cần.
- Root `vercel-build` đã build `ui-components` + `ui-kit` trước admin portal; không phá
  script này.

## Giao diện

- Editorial: nền canvas, Cormorant cho page title, Plus Jakarta cho bảng, hairline, một
  accent sage, không icon/emoji, không card nổi, không pill.
- Bảng dày 36–44px, header uppercase 10px, số `tabular-nums`.
- Trạng thái dùng chấm + nhãn chữ (`StatusLabel` của ui-kit hoặc badge hiện có nhưng phải
  cùng ngôn ngữ màu).
- Mọi bảng có loading/rỗng/lỗi/dữ liệu.

## Nghiệm thu

- Vào `/admin/login` → test login → dashboard, không cần backend.
- Sidebar có đủ 8 mục, active state đúng route con.
- Tạo tenant/đơn/hoá đơn cập nhật ngay và tồn tại sau reload.
- Không còn `phosphor-react` trong page đã sửa (có thể giữ dependency, không cần gỡ).
- Không còn `alert`, `console.log`, `TODO`; không còn card `rounded-xl shadow`.

## Báo cáo

Theo mẫu trong `docs/agent-prompts/README.md`.
