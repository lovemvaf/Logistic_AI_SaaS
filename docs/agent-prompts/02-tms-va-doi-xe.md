# A2 — Vận tải, đội xe, kho bãi (tenant portal)

## Vai trò

Bạn sở hữu nhóm TMS: dispatch tower, đội xe, geofence, SOS, trả hàng, chi phí chuyến,
báo cáo vận tải và danh sách tài xế. Bạn cũng tạo `/warehouses` (danh sách + sơ đồ bin)
để hoàn thiện luồng giao nhận của A1. Chạy song song với A1 (WMS) và A3 (tài chính).

## Đọc trước

- `AGENTS.md` mục 1–7
- `docs/agent-prompts/00-nen-tang-da-xong.md`
- `docs/plans/design-refresh-no-icons.md`
- `frontend/reporting/tenant-portal/src/lib/mock/store.ts` — kiểm tra lần cuối mỗi
  `data.<nhóm>.<hàm>` bạn định gọi
- `packages/map-components` — các component bản đồ đang có trong dự án và props của chúng
- Mẫu editorial đã đúng: `src/app/dashboard/page.tsx`, `src/app/notifications/page.tsx`
- `src/components/{AppShell,Sidebar,Header,AuthGate,DemoActions}.tsx` — A0 sở hữu, **không sửa**

## Vùng được sửa

```
src/app/logistics/**
src/app/drivers/**
src/app/warehouses/**
frontend/mobile/driver-app/src/**
```

Không sửa `src/lib/**`, `src/components/**`, `app/orders/**`, `app/inventory/**`,
`app/wms/**`, `app/finance/**`, `app/admin/**`, `app/profile/**` (A3 quản lý),
`app/settings/**`.

## Dữ liệu dùng

```ts
import { data } from '@/lib/data';
import type {
  Driver, Vehicle, Geofence, SosAlert, ReturnRequest, Expense, Trip, TripStop,
  Warehouse, StockMovement, TripStatus, Order,
} from '@/lib/mock';
import {
  tripStatusLabel, tripStatusTone, codStatusLabel, codStatusTone, returnStatusLabel,
  returnStatusTone, formatCurrency, formatDateTimeVN, formatNumber,
} from '@/lib/labels';
```

Miễn phí các hàm sau (chỉ gõ đúng tên):
- `data.trips.{list,get,assign,optimize,start,complete,submitPOD,pod}`
- `data.drivers.ranking`, `data.drivers.tripLog`
- `data.drivers`, `data.vehicles`
- `data.sosAlerts.{list,acknowledge,resolve}`
- `data.returns.{list,inspect,refund}`
- `data.expenses.{list,decide}`
- `data.warehouses.{list,get}`, `data.bins`
- `data.orders.{list,advanceStatus}`, `data.clients.list`
- `data.notifications.list`, `data.notifications.markAllRead`
- `data.customers.{list,get,stat,reviews}`, `data.reports.{summary,onTime,costs,fleet}`
- `data.vehicles.fuelLog`, `data.vehicles.maintenanceLog`

Kiểm tra lại `data.trips.list` có hỗ trợ `filter` không; nếu có, lọc từng cột.

## Việc phải làm

### 1. `/warehouses` — danh sách kho

- Bảng: mã, tên, tỉnh, sức chứa CBM, đã dùng, tỷ lệ lấp đầy (thanh hairline, không
  gradient), số bin, quản lý, trạng thái.
- Tìm theo mã/tên/tỉnh; lọc trạng thái. Kho `MAINTENANCE` có tông warning.
- Bấm tên → `/warehouses/[id]`.

### 2. `/warehouses/[id]` — sơ đồ bin

- Header: tên kho, địa chỉ, quản lý, trạng thái, tỷ lệ lấp đầy.
- Lưới bin theo zone A–D: mỗi ô hiển thị mã bin, % thể tích, % khối lượng; ô > 85% tông
  danger, > 65% warning. Không dùng chart, chỉ CSS grid + border.
- Bảng tồn trong kho: SKU, bin, lô, HSD, khả dụng.
- Không tìm thấy kho → `EmptyNote` + link quay lại.

### 3. `/logistics/dispatch` — dispatch tower

- Giữ dynamic import Leaflet, `ssr: false`; không import `leaflet` trực tiếp ở server.
- Bố cục 2 cột: bản đồ (2/3) + danh sách chuyến (1/3), dưới là bảng điểm dừng của
  chuyến đang chọn.
- Marker lấy từ `trip.stops`; polyline nối các điểm theo thứ tự.
- Metric: chuyến đang chạy, điểm dừng còn lại, COD trên xe, cảnh báo mở.
- Chọn chuyến → panel: tài xế, xe, kho, quãng đường kế hoạch/thực tế, giờ bắt đầu,
  trạng thái. Hành động: phân công (modal chọn tài xế + xe), tối ưu (`optimize`),
  bắt đầu (`start`), đóng chuyến (`complete`, xác nhận thu đủ COD).
- Đóng chuyến xong cho phép ghi nhận POD — ảnh, chữ ký, giờ giao, người nhận, ghi chú
  → `data.trips.submitPOD({tripId, photo, signature, deliveredAt, recipient, note})`.
  Khách đã ghi nhận POD thì `data.trips.pod(tripId)` cho tải/hiển thị từng POD.
- `optimize` phải hiển thị so sánh sau tối ưu, không chỉ toast.
- Chuyến đã tối ưu disable nút và ghi "đã tối ưu".
- Lọc theo trạng thái, kho, tài xế; tìm theo mã chuyến/biển số.

### 4. `/logistics/vehicles`

- Bảng xe: biển, loại, tải trọng, thể tích, trạng thái, số km, hạn bảo hiểm, lần bảo trì.
- Hạn bảo hiểm < 30 ngày tông warning, qua hạn tông danger.
- Đổi trạng thái AVAILABLE/MAINTENANCE qua `data.vehicles.update`; chặn đưa xe đang
  `IN_USE` về AVAILABLE nếu còn chuyến mở (kiểm tra `data.trips.list`).
- Không thêm trang tạo xe nếu thiếu API mock; dùng modal sửa.
- Bảng chi tiết xe `/logistics/vehicles/[id]` (A2 phụ trách nhưng chỉ page):
  hai tab: "Nhiên liệu" — `data.vehicles.fuelLog` nhập một lần đổ xăng
  (`data.vehicles.fuelLog({vehicleId, at, liters, cost, km, station, note})`) và
  "Bảo trì" — `data.vehicles.maintenanceLog` (`{vehicleId, type, scheduledAt, cost,
  doneAt, provider, note}`).

### 5. `/logistics/geofences`

- Bảng: tên, loại SAFE/RESTRICTED, tỉnh, bán kính, trạng thái, cảnh báo 24h, ghi chú.
- Bật/tắt qua `data.geofences.update`; RESTRICTED đang bật tông danger.
- Panel bản đồ nhỏ hiển thị tâm + bán kính nếu `map-components` hỗ trợ; nếu không,
  hiển thị toạ độ và khoảng cách bằng text.
- Tạo geofence mới qua modal `data.geofences.create`.

### 6. `/logistics/sos`

- Ưu tiên `OPEN` trên cùng, nền `surface-alt`, viền trái danger.
- Cột: mã, tài xế, chuyến, loại, mức độ, vị trí, thời điểm, trạng thái, người tiếp nhận.
- Hành động: Tiếp nhận (`acknowledge`), Đóng (`resolve` kèm ghi chú bắt buộc).
- Không cho đóng khi chưa tiếp nhận; nút disable + giải thích.
- Bộ lọc trạng thái/mức độ; đếm cảnh báo mở ở header.

### 7. `/logistics/returns`

- Bảng RMA: mã, đơn gốc, khách, lý do, trạng thái, kiểm định, tiền hoàn, ngày tạo.
- Mở phiếu: thông tin đơn, lý do, ghi chú; form kiểm định (SELLABLE/DAMAGED/SCRAP) và
  quyết định (REFUNDED/REJECTED) → `data.returns.inspect`.
- REFUNDED bắt buộc kiểm định khác PENDING; REJECTED đặt hoàn tiền 0.
- Lý do/trạng thái dùng nhãn tiếng Việt từ `@/lib/labels`.
- Sau khi kiểm định, hoàn tiền → `data.returns.refund(reason)`: trạng thái đổi thành
  `REFUNDED`, tiền ghi nhận vào bảng quyết toán.

### 8. `/logistics/expenses`

- Bảng chi phí: mã, chuyến, tài xế, loại, số tiền, số chứng từ, trạng thái, ngày tạo.
- Metric: tổng tháng, chờ duyệt, đã duyệt, bị từ chối.
- Duyệt/từ chối qua `data.expenses.decide`; từ chối bắt buộc nhập lý do.
- Lọc theo chuyến, loại, trạng thái. Không cho duyệt phiếu đã duyệt.

### 9. `/logistics/reports` — báo cáo vận tải

- Thể lệ: số chuyến, tổng km, km/chuyến, chi phí/km, tỷ lệ giao đúng hạn, COD đã
  thu, chi phí theo loại.
- Thay đổi khoảng ngày 7/30/90 ngày; tổng số từ `data.reports.summary` (trung bình
  doanh thu/chi phí/tháng), `onTime` (`groupBy: 'warehouse'`), `costs` (mỗi loại
  chi phí), `fleet` (hiệu suất phương tiện theo biển).
- Bảng + thanh ngang CSS, không chart; trạng thái giao hàng tính từ `zo fulfill`
  so với giờ hứa.

### 10. `/drivers` — bảng tài xế

- Bảng: mã, tên, điện thoại, bằng lái, trạng thái, đánh giá, chuyến tháng, COD đang giữ,
  giờ joining. Lọc trạng thái; COD đang giữ > 0 tông warning.
- Bảng cột "Đánh giá" mở link `/drivers/[code]/ranking` — xem xếp hạng tháng của tài
  xế đó (`data.drivers.ranking({period})`) so sánh các tài xế khác, và cột "Lịch sử
  chuyến" — `/drivers/[code]/trip-log` (`data.drivers.tripLog({driverId})`) — danh
  sách hoạt động: check-in/out, đến/giao/không giao được, dừng, nguyên liệu, phạt, thưởng.
- `/drivers/my-trips`: dành cho vai trò DRIVER, chỉ hiện chuyến của tài xế đang đăng
  nhập. Mỗi chuyến: mã, xe, điểm dừng, tiến độ, COD dự kiến, nút bắt đầu/hoàn tất.
- Không cho tài xế xem dữ liệu của tài xế khác.

### 11. Driver App (Expo)

- Chỉ sửa khi còn thời gian; ưu tiên web.
- Giữ nguyên offline queue hiện có.
- Nếu thêm màn hình, dùng dữ liệu cục bộ trong `src/lib/` của app, không import từ
  tenant portal.
- Không đổi navigation hiện có làm vỡ deep link.

## Giao diện

- Editorial: tiêu đề Cormorant, nhãn 10px uppercase, bảng hairline, chấm trạng thái.
- Bản đồ là ngoại lệ duy nhất được dùng màu; lớp phủ panel phải là giấy ấm, không kính mờ.
- Không icon, không emoji, không gradient, không card nổi.
- Modal: `ui-components/Modal` (nền `bg-surface`, viền `border-line`).

## Nghiệm thu

- Bản đồ render không lỗi SSR; không import Leaflet ở module server.
- Phân công → tối ưu → bắt đầu → đóng chuyến cập nhật cả bảng và bản đồ.
- SOS: tiếp nhận rồi đóng, trạng thái đổi và số mở giảm.
- Trả hàng: không thể REFUNDED khi kiểm định PENDING.
- Bảng có đủ 4 trạng thái; mọi trang dùng `data`, không `api` trực tiếp.

## Báo cáo

Theo mẫu trong `docs/agent-prompts/README.md`. Ghi rõ:
- route mới cần thêm vào Sidebar,
- hàm `@/lib/data` còn thiếu,
- phạm vi sửa trong `frontend/mobile/driver-app/src/**`.
