# Mở rộng tính năng và dữ liệu mock — SmartLogi SaaS

> Cao độ: `docs/plans/` | Ngày: 2026-11-11 | Owner: A0 (nền tảng)
> Phụ thuộc: `AGENTS.md` mục 1 (local chỉ code), mục 2 (cấu trúc), mục 4 (hợp đồng dữ liệu).

## Tại sao

`src/lib/mock/store.ts` hiện tại là `CRUD + một vài hàm nghiệp vụ`. Vì mọi trang màn hình
đọc từ đó, cảm giác cuối cùng gửi đến user là "danh sách + form thêm/sửa/xóa". Nền tảng
logistics thực còn có: folio POD, báo cáo, theo dõi đội xe, phê duyệt, scan, cân nhắc,
giao hàng từng phần... Thứ tự ưu tiên là **các hàm thao tác trạng thái + báo cáo + ghi nhận**,
sau đó mới là dữ liệu mẫu cho chúng.

## Luồng triển khai

1. Mở rộng `src/lib/mock/types.ts` (định nghĩa type mới).
2. Mở rộng `src/lib/mock/seed.ts` (dữ liệu ban đầu cho type mới, tăng mật độ dữ liệu cũ).
3. Mở rộng `src/lib/mock/store.ts` (hàm vận hành theo kiểu không CRUD).
4. Mở rộng `src/lib/mock/repository.ts` (REST path tương đương cho `api` mode).
5. Cập nhật 6 prompt (A1-A6 + A0) + `PROGRESS.md` + `frontend-feature-map.md`.

## Phạm vi sở hữu

| Làn | Văn kiện thay đổi |
|---|---|
| A0 | `src/lib/{mock/store,seed,repository,types,index,data}.ts`, `src/lib/labels.ts`, `src/lib/permissions.ts` (nếu cần func mới) |
| A1 | `src/app/orders/**`, `src/app/wms/**` (dùng tính năng mới) |
| A2 | `src/app/logistics/**`, `src/app/drivers/**`, `frontend/mobile/driver-app/src/**` |
| A3 | `src/app/finance/**`, `src/app/admin/**`, `app/profile/**` (báo cáo) |
| A4 | admin portal (tập trung vào tenant/billing) |
| A5 | customer + pack station |
| A6 | `backend/rust-api` — bổ sung 10 path trên vào `routes/meta.rs` PENDING list |

## 10 hạng mục tính năng cần thêm

### 1. Báo cáo doanh nghiệp (`data.reports`)

- `summary({period})`: 4 top-line: đơn giao thành công, % trễ SLA, COD chưa đối, tồn rủi HSD.
- `onTime({period, groupId})`: tỷ lệ on-time theo nhóm (kho/l派/trip): `[deliveries, onTime, late]`.
- `costs({period})`: chi phí theo loại (xe nhiên liệu, kho bãi, nhân công, phạt).
- `fleet({period})`: phương tiện sử dụng %, km, dầu, chi phí/biển số.
- Phương thức `list` giống REST `/reports/*`.
- Data: tạo bộ tổng hợp giả lập, seed(months=6).

### 2. Bằng chứng giao hàng (`data.trips.submitPOD`, `data.returns.refund`)

- `data.trips.submitPOD({tripId, photo, signature, deliveredAt, recipient, note})`.
- `data.trips.pod({tripId})`: trả về danh sách POD của chuyến.
- `data.returns.refund({id, amount, reason})`: hoàn tiền cho RMA sau `approve`.

### 3. Hiệu suất tài xế (`data.drivers.report`)

- `data.drivers.ranking({period})`: xếp hạng theo đơn/gặp lỗi/giao đúng giờ/phí.
- `data.drivers.tripLog({driverId, page})`: lịch trình hoạt động (check-in/out, stop).

### 4. Xe cộ: bảo trì + xăng dầu (`data.vehicles.*`)

- `data.vehicles.fuel({page})`: ghi lo g巻 dầu.
- `data.vehicles.maintenance({vehicleId})`: lịch bảo trì/đoạn lịch.
- `data.vehicles.fuel.add({vehicleId, at, lit, cost, km, note})`.
- `data.vehicles.maintenance.add({vehicleId, type, cost, note})`.

### 5. Theo dõi đơn hàng (`data.orders.track`, `data.orders.live`)

- `data.orders.track(code)`: lấy theo địa chỉ + trạng thái (đã có `byTrackingCode`, bổ sung
  `live` trả về tọa độ driver đang vận chuyển + ETA ước lượng).
- `data.orders.sla({code})`: đánh dấu SLA đạt/hết hạn + hiển thị "reason".

### 6. Giao hàng từng phần + đổi thời gian (`data.orders`)

- `data.orders.partialShipment({orderId, track, note})`: đánh dấu một số đơn/chiều phân tách
  khỏi cái lớn.
- `data.orders.reschedule({orderId, at, reason})`: đổi giờ, cập nhật `promisedAt`.

### 7. Quét đơn (A1/A5)

- `data.packSessions.scan({id, sku, quantity})` — xác nhận SKU đang đóng.
- `data.packSessions.scanBatch({entries})`.

### 8. Phê duyệt ngoại lệ

- `data.clients.update` đã có. Thêm `data.clients.credit({id, value})` (tăng hạn mức).
- `data.orders.cancel` — đảm bảo hd / note + `data.returns.dispute` — kiện hàng.

### 9. Khách hàng (`data.customers`)

- `data.customers.list/filter`, `data.customers.get` — hồ sơ khách B2B riêng.
- `data.customers.reviews({customerId})`.
- `data.customers.stats({customerId})`: 10 đơn gần nhất + COD.

### 10. Thông báo đa kênh

- `data.notifications.send({to, kind: SMS|EMAIL|PUSH|IN_APP, subject, body, refId})`.
- `data.notifications.list` giữ nguyên, `events({kind})` lọc sự kiện.

## Dữ liệu mẫu (in `seed.ts`)

- Tăng đơn order từ 42 lên 60 (có đa dạng `service`, `status`, `clientId`, `warehouseId`).
- Tăng khách từ 10 lên 15 (có `active: false`).
- Tăng xe từ 6 lên 12, tài xế từ 6 lên 12.
- Tăng trip từ 3 lên 8 (nhiều `PLANNED`/`IN_PROGRESS` hơn).
- Thêm `FEEDBACK` cho khách (nếu cần) và bank transaction từ 5 lên 24.
- Thêm event logs cho drivers/vehicles.
- Thêm `reports` seed: 6 tháng data tổng hợp.

## Thời lượng

- A0: mở rộng mock + thư viện.
- A1-A6: dùng tính năng mới + hiển thị(1 trang mỗi tính năng nếu chạy kịp).
- Khi cần hàm/kiểu **mới**, A1-A3 ghi rõ `file + name + lý do` -> A0 bệnh
    