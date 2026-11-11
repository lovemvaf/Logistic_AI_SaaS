# A1 — Đơn hàng, tồn kho, WMS (tenant portal)

## Vai trò

Bạn sở hữu luồng fulfillment: đơn hàng → phân bổ → chọn hàng → đóng kiện; cộng với tồn
kho, kiểm kê chu kỳ, thiết bị kho, danh mục SKU. Kho bãi là phần của A2 (vận tải):
`/warehouses` và `/warehouses/[id]`. Chạy song song với A2 (vận tải) và A3 (tài chính).

## Đọc trước

- `AGENTS.md` mục 1–7
- `docs/agent-prompts/00-nen-tang-da-xong.md` — hợp đồng `@/lib/data` duy nhất
- `docs/plans/design-refresh-no-icons.md`
- `frontend/reporting/tenant-portal/src/lib/mock/store.ts` — kiểm tra lần cuối mỗi hàm
  `data.<nhóm>.<hàm>` bạn định gọi
- Mẫu editorial đã đúng: `src/app/dashboard/page.tsx`, `src/app/notifications/page.tsx`
- `src/components/{AppShell,Sidebar,Header,AuthGate,DemoActions}.tsx` — A0 sở hữu, **không sửa**

## Vùng được sửa

```
src/app/orders/**
src/app/inventory/**
src/app/wms/**
```

Không sửa `src/lib/**`, `src/components/**`, `app/logistics/**`, `app/finance/**`,
`app/admin/**`, `app/roles/**`, `app/users/**`, `app/settings/**`, `app/warehouses/**`
(kho do A2 quản lý), `app/profile/**` (do A3 quản lý).

## Dữ liệu dùng

```ts
import { data } from '@/lib/data';
import type { Order, OrderStatus, Wave, PickTask, ... } from '@/lib/mock';
```

Miễn phí các hàm sau (chỉ gõ đúng tên):
- `data.orders.{list,get,createOrder,advanceStatus,assignTrip,byTrackingCode,partialShipment,reschedule,live,sla}`
- `data.inventory.{list,adjust,receive,putawaySuggestion}`
- `data.products.{list,get,create,update,remove}`
- `data.movements.list`
- `data.waves.{list,allocate}`
- `data.pickTasks.{list,confirm}`
- `data.cycleCounts.{list,create,submit,approve}`
- `data.packSessions.{list,seal}`
- `data.equipment.{list,get,create,update,remove}`
- `data.warehouses.{list,get}`
- `data.bins.list`, `data.settings.{get,update}`
- `data.clients.{list,get}`
- `data.notifications.list`, `data.notifications.markAllRead`
- `data.reports.{summary,onTime,costs,fleet}` (báo cáo ở `/finance/reports`, A3 viết)

## Việc phải làm

### 1. `/orders` — danh sách đơn

- Header: tìm theo mã đơn / người nhận / mã khách, lọc trạng thái, dịch vụ, kho, hệ
  thống phân trang client 20 dòng/nhóm.
- Bảng: mã đơn, khách gửi, người nhận, tỉnh, trạng thái (chấm + `StatusLabel`), COD,
  cân nặng, ngày tạo. Không card KPI.
- `MetricBand` (4 ô): đơn mở, đơn trễ so với ngày hứa, chờ gán chuyến, giao hôm nay.
- Tạo đơn: modal nhiều bước (khách gửi + người nhận + hàng hóa/COD) gọi `createOrder`.
  Validate: SĐT VN, COD ≥ 0, khối lượng > 0, kho tồn tại. Sau khi tạo, đơn xuất hiện
  đầu bảng.
- Huỷ đơn: xác nhận rồi `advanceStatus(id, 'CANCELLED', lý do)`, disable với đơn đã giao.
- Phân đơn: đơn đang PICKING/PACKED có thể tách ra đơn con riêng (vì chọn hàng không
  đủ) → `partialShipment`, nhấn vào mã đơn con qua `/orders/[trackingCode]`.
- Đổi giờ giao: chọn đơn → `reschedule(id, promisedAt, lý do)`.
- Upload CSV/Excel: `react-dropzone` đã có. Chỉ nhận `.csv`; parse thủ công, hỗ trợ BOM,
  preview 5 dòng, đếm dòng lỗi, tạo lần lượt bằng `createOrder`.
- Mỗi dòng có link sang `/orders/[trackingCode]`.

### 2. `/orders/[trackingCode]` — chi tiết đơn (route mới)

- Tìm bằng `data.orders.byTrackingCode`; không thấy thì `EmptyNote` + link quay lại.
- Cột trái: người nhận, địa chỉ, liên hệ, ghi chú, COD, phí, cân, thể tích.
- Cột phải: timeline dọc (giờ, nhãn, người thao tác), trạng thái hiện tại, chuyến đã gán
  (nếu có) kèm link `/logistics/dispatch`.
- Hành động: chuyển trạng thái hợp lệ kế tiếp, huỷ. Dùng `StatusLabel`.
- Tab thứ hai "Theo dõi": gửi `data.orders.live(trackingCode)` — bản đồ thông tin:
  điểm đi, điểm đến, vị trí xe tiếp theo, điểm đến kế tiếp + ETA ước lượng, tên tài xế
  và xe; nếu đơn đã giao, ẩn bản đồ.
- Tab thứ ba "SLA": `data.orders.sla(trackingCode)` — so sánh giờ hẹn với giờ thực tế,
  trạng thái đạt/hết hạn + lý do.
- Tab thứ tư "Phân đơn": đơn này có thể chia nhỏ → `data.orders.partialShipment` ra
  đơn con; bảng danh sách đơn phân chia thuộc đơn cha, trạng thái `PARTIAL/COMPLETE`
  `update` đến `/orderPartials.update`.
- `generateStaticParams` không cần; đây là client page.

### 3. `/inventory` — tồn kho

- Hai tab: `Sổ kho` (movements) và `Tồn theo bin`. Giữ URL không đổi.
- Bảng tồn: SKU, tên, kho, bin, lô, HSD, khả dụng, giữ chỗ, version. Cảnh báo HSD < 30
  ngày bằng tông warning; hết hàng bằng danger.
- Nhập kho: chọn SKU, kho, bin, số lượng, lô, HSD → `data.inventory.receive`.
- Điều chỉnh: chọn dòng → số lượng +/- và lý do → `data.inventory.adjust`; hiện lỗi
  409/422 tại chỗ.
- Chuyển vị trí: `receive` vào bin đích + `adjust` âm ở bin nguồn trong cùng luồng; nếu
  thiếu tồn thì chặn trước khi gọi.
- Bảng có loading, rỗng, lỗi, dữ liệu; phân trang 20 dòng phía client.

### 4. `/inventory/adjustments`

- Chỉ hiện movement `ADJUST` và `CYCLE_COUNT`, nhóm theo ngày, cột: giờ, SKU, kho/bin,
  thay đổi, tồn sau, người làm, lý do. Lọc theo kho và khoảng ngày.
- Nút "Điều chỉnh mới" mở modal dùng chung logic với `/inventory` (tách component trong
  `src/app/inventory/_components/`).

### 5. `/inventory/cycle-count`

- Bảng phiếu: mã, kho, khu, phạm vi, tiến độ `đã đếm/ tổng`, lệch đơn vị, lệch giá trị,
  trạng thái, người làm.
- Tạo phiếu mới (kho, khu, phạm vi, số dòng) → thêm vào danh sách qua `data.cycleCounts.create`.
- Mở phiếu: nhập số dòng đã đếm và lệch → `submit`; khi đủ dòng hiện nút Duyệt → `approve`.
- Không cho duyệt khi chưa đếm đủ; hiển thị lỗi từ repository.

### 6. `/wms` — tổng quan

- Dựng lại trang rỗng thành cửa ngõ. `MetricBand`: SKU đang bán, bin đã dùng, wave đang
  chạy, tác vụ chờ.
- Ba khối: `Cất hàng` (form SKU + số lượng → `putawaySuggestion`, hiện bin/kho/vùng và
  sức chứa còn lại), `Gom wave` (link), `Danh mục` (link products/equipment).
- Bảng 8 tác vụ soạn hàng gần nhất kèm link `/wms/tasks`.

### 7. `/wms/waves`

- Form gom wave: chọn kho, chiến lược FIFO/LIFO/FEFO (giải thích 1 dòng mỗi chiến lược),
  chọn nhiều đơn trạng thái `NEW | UNASSIGNED | PENDING_PICKUP`, người soạn →
  `data.waves.allocate`.
- Bảng wave: mã, kho, chiến lược, số đơn, số tác vụ, người soạn, trạng thái, giờ tạo.
- Mở wave: panel tác vụ của wave, tiến độ, nút "Bắt đầu soạn" chuyển trạng thái hiển thị.

### 8. `/wms/tasks`

- Lọc theo wave, trạng thái, người soạn. Cột: thứ tự, wave, đơn, SKU, bin, SL, đã soạn,
  trạng thái.
- Nút "Xác nhận" mở input số lượng thực tế → `data.pickTasks.confirm`; cập nhật tiến độ
  wave ngay trên UI. Short pick hiển thị tông warning.

### 9. `/wms/products`

- Bảng SKU: mã, tên, nhóm, ĐVT, cân, thể tích, HSD, điểm đặt lại, giá, trạng thái.
- Tạo/sửa trong modal (dùng `data.products.create/update`), bật/tắt bán, tìm kiếm.
- Không xoá cứng SKU đã có tồn kho; chỉ chuyển `active=false`.

### 10. `/wms/packing`

- Bảng phiên đóng gói: mã, đơn, trạm, người, SKU dự kiến, SKU quét, khớp, độ tin cậy,
  trạng thái. Lọc theo trạm và kết quả khớp.
- Nút "Đóng kiện" nhập SKU quét → `data.packSessions.seal`; mismatch phải hiện rõ và
  không cho đóng.
- Liên kết sang Pack Station (`/pack` của portal pack) bằng text link, không iframe.

### 11. `/wms/equipment`

- Bảng thiết bị: mã, tên, loại, kho, trạng thái, pin, lần cuối online, ghi chú.
- Đổi trạng thái ONLINE/OFFLINE/MAINTENANCE qua `data.equipment.update`.
- Pin < 20% tông warning; offline > 30 phút tông danger (tính từ `lastSeenAt`).

## Giao diện

- `EditorialPageHeader` cho mọi trang; `MetricBand` tối đa 4 ô; `EditorialSection` cho
  từng khối; bảng hairline không zebra; input/select viền `border-line`, focus `accent`.
- Không icon, không emoji, không `rounded-xl`, không `shadow-lg`, không `bg-slate-50`.
- Số dùng `tabular-nums`; tiền dùng `formatCurrency` từ `@/lib/labels` (A0 cung cấp).
- Modal: nền `bg-surface`, viền `border-line`, không bo tròn lớn.
- Bảng cao 36–44px, header uppercase 10–11px.
- A0 (nền tảng) sở hữu `Sidebar` ở `src/components/`, **không được sửa**. Nếu muốn tách mục
  `Thiết bị` riêng dưới nhóm WMS, ghi rõ vào báo cáo (mục `WMS` đang match `/wms` nên
  `/wms/equipment` đã được đánh active).

## Nghiệm thu

- Mọi thao tác ghi đều thấy kết quả ngay và tồn tại sau reload (localStorage).
- Bảng có đủ 4 trạng thái; lọc không làm mất dữ liệu gốc.
- Không page nào còn gọi `api.*` trực tiếp.
- Không còn `console.log`, `alert`, `TODO`.
- Route mới `/orders/[trackingCode]` chạy được từ link trong bảng đơn.

## Báo cáo

Theo mẫu trong `docs/agent-prompts/README.md`, ghi rõ route mới, mục Sidebar cần thêm,
và hàm `@/lib/data` nào còn thiếu phải A0 bổ sung.
