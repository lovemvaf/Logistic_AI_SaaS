# Báo cáo hoàn thành: Editorial Migration — Tenant Portal A3

Ngày: 11/11/2026
Phạm vi: `frontend/reporting/tenant-portal/src/app/finance/**`, `app/admin/**`, `app/roles/**`, `app/users/**`, `app/settings/**`, `app/branches/**`, `app/profile/**`
Phương thức: kiểm tĩnh (không chạy build), mock qua `@/lib/data` với `NEXT_PUBLIC_DATA_SOURCE=mock` mặc định.

---

## 1. Danh sách file đã sửa

Cả 12 trang đều tuân thủ quy thức: `EditorialPageHeader` (hoặc `EditorialSection`) ở đầu, `TableState` từ `ui-components` cho mọi bảng (4 trạng thái: loading / rỗng / lỗi / có dữ liệu),
`StatusLabel` + tone từ `@/lib/labels` cho trạng thái nghiệp vụ, `formatCurrency` (VND), `formatDateVN` / `formatDateTimeVN` (dd/MM/yyyy HH:mm), số `tabular-nums`.
Không `p-8 max-w-7xl mx-auto` (AppShell đã đệm), không icon trang trí, không pill CTA, không card KPI, không gradient.

| # | File | Ghi chú |
|---|------|---------|
| 1 | `src/app/finance/cod/page.tsx` | Bảng COD (nộp tiền + đối soát) + MetricBand |
| 2 | `src/app/finance/reports/page.tsx` | **Mới** — báo cáo doanh nghiệp (tháng/năm), 4 MetricBand, 3 bộ CSS bar + band thống kê |
| 3 | `src/app/admin/billing/page.tsx` | Bảng hóa đơn + modal ghi thanh toán (kiểm hạn mức, trọng ID, VOID) |
| 4 | `src/app/admin/clients/page.tsx` | Bảng khách + panel chi tiết, pause/activate, modal hạn mức |
| 5 | `src/app/admin/ai-insights/page.tsx` | Bảng nhóm model + modal quyết định (ACKNOWLEDGED/ACTIONED/DISMISSED) |
| 6 | `src/app/admin/api-keys/page.tsx` | Bảng key + modal phát hành (checkbox scopes) + revoke giữ hàng |
| 7 | `src/app/admin/audit-logs/page.tsx` | Bảng nhật ký (actor/action/entity/entityRef/IP/result), lọc + phân trang 25 |
| 8 | `src/app/users/page.tsx` | Bảng người dùng + modal mời, toggle trạng thái (cảnh giác tự khóa) |
| 9 | `src/app/roles/page.tsx` | Bảng phân quyền + panel mở rộng nhóm quyền theo business unit |
| 10 | `src/app/settings/page.tsx` | 3 `EditorialSection` (nền tảng, liên hệ, vận hành), validation thực hệ thống |
| 11 | `src/app/branches/page.tsx` | Bảng chi nhánh (1:1 kho) + MetricBand + tìm kiếm/lọc |
| 12 | `src/app/profile/page.tsx` | Form tài khoản + form liên hệ tenant, modal xác nhận 2 bước, fallback demo |

---

## 2. Route & Sidebar

`src/components/Sidebar.tsx` **đã chứa đầy đủ 12 mục A3**, không cần chỉnh sửa:

| Nhóm | Mục | Route | Trang |
|---|---|---|---|
| Tài chính | Đối soát COD | `/finance/cod` | `src/app/finance/cod/page.tsx` |
| Tài chính | Báo cáo doanh nghiệp | `/finance/reports` | `src/app/finance/reports/page.tsx` (mới) |
| Quản trị | Hoá đơn | `/admin/billing` | `src/app/admin/billing/page.tsx` |
| Quản trị | Khách hàng | `/admin/clients` | `src/app/admin/clients/page.tsx` |
| Quản trị | AI Insights | `/admin/ai-insights` | `src/app/admin/ai-insights/page.tsx` |
| Quản trị | API key | `/admin/api-keys` | `src/app/admin/api-keys/page.tsx` |
| Quản trị | Audit log | `/admin/audit-logs` | `src/app/admin/audit-logs/page.tsx` |
| Quản trị | Người dùng | `/users` | `src/app/users/page.tsx` |
| Quản trị | Phân quyền | `/roles` | `src/app/roles/page.tsx` |
| Quản trị | Chi nhánh | `/branches` | `src/app/branches/page.tsx` |
| Quản trị | Cài đặt | `/settings` | `src/app/settings/page.tsx` |
| Cá nhân | Hồ sơ | `/profile` | `src/app/profile/page.tsx` |

---

## 3. Hợp đồng dữ liệu — mọi `data.*` đều tồn tại trên mock store

Kế thừa mô hình `MockRepository` (`src/lib/mock/store.ts` + `repository.ts`):

- `data.aiInsights.list`, `decide` ✓ — `data.aiInsights` collection + quyết định
- `data.apiKeys.list`, `issue` (scope checkbox), `revoke` ✓
- `data.auditLogs.list` ✓ — collection `auditLogs`
- `data.bankTransactions.list` ✓ — collection `bankTransactions`
- `data.clients.list`, `update` (pause/activate), `credit` ✓
- `data.invoices.list`, `recordPayment` (chặn quá hạn mức, VOID) ✓
- `data.remittances.list`, `submit`, `reconcile` ✓
- `data.reports.summary`, `onTime`, `costs`, `fleet` (hiện theo tháng/năm) ✓
- `data.roles.list` ✓ — collection `roles`
- `data.settings.get`, `update` (validation: email, codCutoff 0–23, lowStockThreshold > 0, notifyChannels không rỗng) ✓
- `data.users.list`, `invite`, `setStatus` (self-lock guard), `update` ✓
- `data.warehouses.list` — dùng cho `/branches` (1:1) ✓
- Xem thêm: `data.branches` **không tồn tại** → `/branches` dùng `data.warehouses.list` (đã ghi chú gap riêng ở §5).

Mọi call đều xác nhận "lưu" vào `localStorage` mock + `appendAudit` khi ghi, để trả về giao diện thống nhất.

---

## 4. Gate cuối — tất cả sạch

Quét 12 trang A3:

- `console.log`: **0**
- `alert()`: **0**
- `TODO` / `FIXME`: **0**
- `handeDecide` (typo tìm thấy ở `ai-insights`): **0**
- Ký tự `¥` (mojibake tìm thấy ở `finance/reports` meta): **0**
- `p-8 max-w-7xl mx-auto`: **0**
- CTA dạng `pill`/gradient/card KPI: **0**
- Component import chưa xuất (ui-kit: `EditorialPageHeader`, `MetricBand`, `EditorialSection`, `StatusLabel`; ui-components: `TableState`, `Modal`, `Button`, `Input`, `Select`, `Checkbox`): **0**
- Import hết tồn tại (không import chéo portal, lockfile): **0**
- `packages/` và lockfile: **chưa sửa**

---

## 5. Lỗi / gap đã ghi nhận và xử lý

| # | Vấn đề | Xử lý |
|---|--------|-------|
| 1 | `handeDecide` typo trong `/admin/ai-insights` | Sửa thành `handleDecide` |
| 2 | Ký tự `¥` (mojibake UTF-8) trong meta string của `/finance/reports` | Đổi thành "Phiếu chưa đối soát" |
| 3 | **`data.branches` không tồn tại** | `/branches` dùng `data.warehouses.list` (1:1), 4 trạng thái; ghi nhận gap — backend thật sẽ cần route `/branches` thật hoặc bỏ qua |
| 4 | `Select` của `ui-components` không hỗ trợ `multiple` | `/settings` `notifyChannels` chuyển sang group `Checkbox` (email/sms/webhook) và persist vào mock store |
| 5 | Mock `channels` chưa có trường `notifyChannels` khi save | Chuyển thành submit cho `data.settings.update` — validate server-side |
| 6 | `/profile` là form đơn ghi, không phải bảng | Không dùng `TableState`; dùng `loading` + `error` banner + `savedAt`; demo user (không matched) ghi vào `data.settings.update` (liên hệ tenant) thay vì `data.users.update` |
| 7 | Form `settings` chưa có phần "sao lưu lại" khi reset | Modal `restore` xác nhận 2 bước, `data.settings.update` |

---

## 6. Boundary tuân thủ

- **A3** (đã sửa): `finance/**`, `admin/**`, `roles/**`, `users/**`, `settings/**`, `branches/**`, `profile/**`
- **Không sửa**: `src/lib/**` (A0), `packages/**` (layout, style, token), `logistics/**`, `orders/**`, `inventory/**`, `wms/**`, `warehouses/**`, lockfile, `package.json`
- **Không thêm dependency** mới.
- `Sidebar.tsx`, `src/components/Sidebar.tsx` — chỉnh sửa bởi các lane khác (tên route A3 đã có từ trước, không chỉnh sửa).
- `src/components/Ap*.tsx`, `src/components/Header.tsx`, `src/lib/auth.ts` — chỉnh sửa bởi lane khác (A0).

---

## 7. Phần chưa làm được / Đề xuất

- Không có phần chưa làm.
- Đề xuất khi backend Rustприклад tiếp giáp với `data.branches` — liên hệ A0 mở rộng `users` riêng cho `/profile` (tren không dùng email trong mock).
- Khi back-end thật chạy (`NEXT_PUBLIC_DATA_SOURCE=api`), toàn bộ mock sẽ được thay thế mà không sửa trang.

---

## 8. Tình trạng repo sau phiên

- 11 file tracked: modified (dữ liệu A3 được sửaditorial).
- 1 file untracked: `src/app/finance/reports/page.tsx`.
- Không `packages/**` edits; không lockfile edits; không dependency mới.
- Không còn `console.log`, `alert()`, `TODO`, `FIXME`, placeholder text (chỉ còn `placeholder` nhãn trên input).
- Sidebar: 12 mục đầy đủ; không thêm route cần thiết.
