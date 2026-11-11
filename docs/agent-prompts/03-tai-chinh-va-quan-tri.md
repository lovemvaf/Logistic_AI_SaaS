# A3 — Tài chính, quản trị tenant, hồ sơ, chi nhánh (tenant portal)

## Vai trò

Bạn sở hữu tiền, quyền, kho và cấu hình tenant: đối soát COD, hoá đơn, khách hàng B2B,
khuyến nghị AI, API key, audit log, người dùng, vai trò, cấu hình, chi nhánh, hồ sơ
cá nhân. Đây là nhóm màn hình nhạy cảm: mọi thao tác ghi phải có xác nhận rõ ràng.

## Đọc trước

- `AGENTS.md` mục 1–7
- `docs/agent-prompts/00-nen-tang-da-xong.md`
- `docs/plans/design-refresh-no-icons.md`
- `frontend/reporting/tenant-portal/src/lib/mock/store.ts` — kiểm tra lần cuối mỗi
  `data.<nhóm>.<hàm>` bạn định gọi
- Mẫu editorial đã đúng: `src/app/dashboard/page.tsx`, `src/app/notifications/page.tsx`
- `src/components/{AppShell,Sidebar,Header,AuthGate,DemoActions}.tsx` — A0 sở hữu, **không sửa**

## Vùng được sửa

```
src/app/finance/**
src/app/admin/**
src/app/roles/**
src/app/users/**
src/app/settings/**
src/app/branches/**
src/app/profile/**
```

Không sửa `src/lib/**`, `src/components/**`, `app/logistics/**`, `app/orders/**`,
`app/inventory/**`, `app/wms/**`, `app/warehouses/**`.

## Dữ liệu dùng

```ts
import { data } from '@/lib/data';
import type { CodRemittance, BankTransaction, Invoice, Client, AiInsight, ApiKey, AuditLog, UserAccount, RoleDefinition, TenantSettings, Warehouse } from '@/lib/mock';
import { formatCurrency, formatDateTimeVN, formatDateVN, codStatusLabel, codStatusTone, returnStatusLabel, returnStatusTone, formatNumber } from '@/lib/labels';
```

Miễn phí các hàm sau (chỉ gõ đúng tên):
- `data.remittances.{list,submit,reconcile}`
- `data.bankTransactions.list`
- `data.invoices.{list,recordPayment}`
- `data.clients.{list,get,update}`
- `data.aiInsights.{list,decide}`
- `data.apiKeys.{list,issue,revoke}`
- `data.auditLogs.list`
- `data.users.{list,invite,setStatus}`
- `data.roles`
- `data.settings.{get,update}`
- `data.warehouses.list` (dùng làm danh sách chi nhánh — `data.branches` **không tồn tại**)
- `data.users.list` / `data.roles.list`
- `data.clients.list` cho chi tiết khách tại `/admin/clients/[id]`.
- `data.clients.update`, `data.clients.credit` (tăng hạn mức khách B2B)
- `data.reports.{summary,onTime,costs,fleet}` — `/finance/reports`, bảng dữ liệu, không
  dùng chart, đến từng nhóm khách

## Việc phải làm

### 1. `/finance/cod` — đối soát hai chiều

- Bố cục hai cột ngang trên desktop:
  - Trái: phiếu quyết toán của tài xế (mã, tài xế, chuyến, dự kiến, đã nộp, lệch, trạng
    thái, giờ nộp, mã ngân hàng).
  - Phải: giao dịch ngân hàng (ngày, mô tả, số tiền, mã tham chiếu, đã khớp với phiếu
    nào).
- Metric: tổng phải thu, đã nộp, chênh lệch, số phiếu chờ.
- "Nộp tiền": modal nhập số thực nộp → `submit`; nếu lệch, hiện rõ chênh lệch, đánh dấu
  `SUBMITTED`/`DISPUTED` (mock quyết định), không giả vờ thành công.
- "Đối soát": chọn phiếu + giao dịch ngân hàng → `reconcile`. Nếu số tiền khác, hiển thị
  lý do lệch; nếu khớp, hai bên đổi trạng thái, giao dịch hiện "đã khớp".
- Không cho một giao dịch khớp hai phiếu; lỗi 409 hiển thị nguyên văn.
- Lọc theo trạng thái, tài xế, khoảng ngày. Tổng hợp theo ngày ở chân bảng.

### 2. `/admin/billing` — hoá đơn

- Bảng: mã, khách, kỳ, số tiền, đã trả, còn lại, trạng thái, phát hành, hạn.
- OVERDUE tông danger, PAID tông success, SENT neutral.
- Ghi nhận thanh toán qua `recordPayment`; chặn vượt số còn lại và chặn hoá đơn `VOID`.
- Metric: phải thu tháng, quá hạn, đã thu, số hoá đơn mở.

### 3. `/admin/clients`

- Bảng khách B2B: mã, tên, người liên hệ, email, trạng thái, đơn tháng, sản lượng,
  COD còn nợ, số API key.
- Bấm tên mở panel chi tiết: địa chỉ, điện thoại, ngày tham gia, 10 đơn gần nhất (lấy
  `data.orders.list()` lọc theo `clientId`), hoá đơn gần nhất.
- Tạm dừng/kích hoạt khách qua `data.clients.update`; PAUSED tông warning.
- Tìm kiếm theo tên/mã/email; lọc trạng thái.
- Tăng hạn mức tín dụng (`data.clients.credit`) qua modal: nhập khoản tăng, lý do,
  sau khi tăng, COD còn nợ không vượt hạn mức (khuyến nghị hiển thị ràng buộc).

### 4. `/admin/ai-insights`

- Nhóm theo model: dự báo nhu cầu, ETA, bất thường chi phí, rủi ro rời bỏ, tối ưu tuyến.
- Mỗi khuyến nghị: tiêu đề, mô tả, chỉ số + giá trị, độ tin cậy (thanh hairline), thực
  thể liên quan, thời điểm, trạng thái.
- Hành động: Ghi nhận (`ACKNOWLEDGED`), Đã xử lý (`ACTIONED`), Bỏ qua (`DISMISSED`) qua
  `decide`. Không cho đổi khuyến nghị đã `ACTIONED`/`DISMISSED`.
- Link thực thể: SKU → `/wms/products`, chuyến → `/logistics/dispatch`, khách →
  `/admin/clients`. Dùng `entityRef` để chọn đúng.
- Metric: số khuyến nghị mới, độ tin cậy trung bình, số đã xử lý 7 ngày.

### 5. `/admin/api-keys`

- Bảng: tên, prefix, scopes, trạng thái, ngày tạo, lần dùng cuối, người tạo.
- Tạo khoá: modal chọn tên + scopes (orders:read/write, inventory:read/write,
  shipments:read, tracking:read, webhooks:write). Sau khi tạo, hiển thị **một lần** secret
  đầy đủ trong khối `surface-alt`, nút saoCOPY, cảnh báo không hiện lại.
- Thu hồi: xác nhận, `revoke`; khoá REVOKED không dùng lại được, không xoá khỏi bảng.
- Không hiển thị secret cũ ở bất kỳ đâu.
- Metric: đang hoạt động, hết hạn, thu hồi, số lần dùng 24h (đếm từ `lastUsedAt`).

### 6. `/admin/audit-logs`

- Bảng: thời điểm, người thao tác, hành động, thực thể, mã thực thể, IP, kết quả.
- DENIED/ERROR tông danger, SUCCESS neutral.
- Lọc theo người thao tác, hành động, kết quả, khoảng ngày; tìm theo mã thực thể.
- Phân trang 25 dòng; hiển thị tổng.

### 7. `/users`

- Bảng: tên, email, điện thoại, vai trò, trạng thái, hoạt động cuối, ngày tạo.
- Mời người dùng: modal tên/email/vai trò → `invite`; email trùng hiện lỗi 409.
- Đổi trạng thái ACTIVE/SUSPENDED qua `setStatus`; không cho tự khoá chính mình (so
  email đăng nhập demo).
- Lọc vai trò/trạng thái; tìm theo tên/email.

### 8. `/roles`

- Ma trận vai trò × quyền, dùng `data.roles`.
- Cột: vai trò, mô tả, số thành viên, số quyền, builtin.
- Mở vai trò xem danh sách quyền dạng nhóm (kho, vận tải, tài chính, quản trị). Vai trò
  builtin chỉ đọc; không bịa nút sửa nếu chưa có API.
- Ghi rõ `*` nghĩa là toàn quyền.
- Không cho sửa quyền của TENANT_ADMIN.

### 9. `/settings`

- Form cấu hình tenant: tên, mã, múi giờ, tiền tệ, ngôn ngữ, địa chỉ, người liên hệ,
  chiến lược phân bổ mặc định (FIFO/LIFO/FEFO), giờ chốt COD, ngưỡng tồn thấp, kênh
  thông báo (email/SMS/webhook).
- Lưu qua `data.settings.update`; hiển thị "đã lưu lúc ..." và nút khôi phục giá trị đã lưu.
- Validate: giờ chốt 0–23, ngưỡng > 0, email liên hệ đúng định dạng.
- Không tách nhiều trang con nếu không cần; dùng section trong cùng trang.

### 10. `/branches`

- Bảng chi nhánh/kho: mã, tên, tỉnh, địa chỉ, quản lý, trạng thái, số bin.
- Dùng `data.warehouses`; ghi rõ trong báo cáo là chi nhánh đang ánh xạ 1-1 với kho.
- Không thêm tạo chi nhánh nếu thiếu API; chỉ xem, sửa trạng thái tương đương `warehouses.update`.

### 12. `/finance/reports` — báo cáo doanh nghiệp

- Bộ lọc tháng/năm mặc định là tháng hiện hành, khoảng tùy chọn 6–12 tháng.
- 4 ô MetricBand: đơn hàng tháng, tỷ lệ giao đúng SLA, COD chưa đối, lợi nhuận.
- Được cung cấp bởi `data.reports.summary` (`data.reports.summary({period})`) và 3 bảng:
  `onTime` (phân nhóm theo kho), `costs` (mỗi loại chi phí: nhiên liệu, cầu đường,
  phí gửi, bảo trì, lương, bảo hiểm, khấu hao), `fleet` (xe, chuyến, km, xăng, bảo trì,
  tỷ lệ hoạt động).
- Thanh ngang CSS cho chi phí/năng lượng; không chart. Bonus là `data.customers`
  (lưu ý `data.clients` khác — khách B2B portal).

### 13. `/profile`

- Form: tên, email, điện thoại, vai trò (readonly), ngày tạo.
- Dùng `data.users.list` tìm theo email đăng nhập, cập nhật tên/điện thoại qua
  `data.users.update`. Nếu mô hình không hỗ trợ cập nhật trực tiếp `users`, dùng
  `data.settings.update` cho thông tin liên hệ (ghi rõ trong báo cáo).
- Không gọi `api` trực tiếp, không hiển thị mật khẩu.

## Giao diện và an toàn

- Editorial, không icon, không card KPI. Bảng tiền dùng `tabular-nums`, canh phải.
- Mọi hành động ghi có xác nhận hai bước hoặc modal, không dùng `confirm()` native.
- Lỗi nghiệp vụ hiển thị tại chỗ (dưới form hoặc đầu bảng), không chỉ toast.
- Không hiển thị secret, token, số tài khoản đầy đủ. Che số tài khoản/STK nếu có.
- Modal: `ui-components/Modal` (nền `bg-surface`, viền `border-line`).

## Nghiệm thu

- Đối soát đúng: khớp thì cả hai bên đổi trạng thái; lệch thì báo lệch và không giả khớp.
- API key chỉ hiện secret một lần; thu hồi không xoá dòng.
- Mời trùng email bị chặn; tự khóa mình bị chặn.
- Settings lưu và tồn tại sau reload.
- Mọi trang dùng `data`, không `api` trực tiếp; không `console.log`, `alert`, `TODO`.

## Báo cáo

Theo mẫu trong `docs/agent-prompts/README.md`. Ghi rõ:
- route mới cần thêm vào Sidebar,
- hàm `@/lib/data` còn thiếu,
- cách xử lý `branches` vì `data.branches` không tồn tại.
