# A0 — Nền tảng tenant portal (đã xong, đóng băng)

> Trạng thái: hoàn tất ngày 2026-11-11.
> Vai trò tài liệu: **hợp đồng tham chiếu** cho A1–A6. Không phải việc cần làm lại.

## 1. Đã dựng

```
tenant-portal/src/lib/
├── data.ts                 # export `data`, `dataSource`, `isMockDataSource`, `resetDemoData`, `simulateOutage`
├── mock/types.ts           # toàn bộ kiểu domain (Order, Trip, Invoice, TenantSettings...)
├── mock/seed.ts            # dữ liệu Việt Nam, tất định, 30+ bảng
├── mock/store.ts           # createMockRepository(): nghiệp vụ + localStorage + reset/outage
├── mock/repository.ts      # createRestRepository(request): cùng method surface, gọi /api/v1
├── mock/index.ts
├── mock-auth.ts            # 4 tài khoản demo theo vai trò
├── auth.ts / auth-context.tsx
├── labels.ts               # nhãn tiếng Việt + tone + formatCurrency/formatNumber/formatDate(VN)/formatDateTimeVN
├── permissions.ts          # can(), canAccessRoute(), allowedRoutes()
├── use-role.ts
└── notifications-bus.ts
```

Shell: `components/{AppShell,AuthGate,Header,Sidebar,DemoActions}.tsx`.
Route đã editorial + mock: `/login`, `/dashboard`, `/notifications`, `/profile` (link ở mục
"Cá nhân" trong Sidebar).

## 2. Hợp đồng dữ liệu — chỉ dùng đúng tên này

`data` là `MockRepository`. Mỗi nhóm có `list/get/create/update/remove` (trừ nơi ghi rõ).
Các hàm nghiệp vụ thêm vào:

| Nhóm | Hàm nghiệp vụ |
|---|---|
| `orders` | `createOrder(input)`, `advanceStatus(id, status, label)`, `assignTrip(orderIds, tripId)`, `byTrackingCode(code)`, `partialShipment(orderId, note)`, `reschedule(orderId, promisedAt, reason)`, `live(trackingCode)`, `sla(trackingCode)` |
| `inventory` | `adjust({inventoryId, quantity, reason})`, `receive({sku, warehouseCode, binCode, quantity, lotNo?, expiryDate?})`, `putawaySuggestion(sku, quantity)` |
| `waves` | `allocate({warehouseId, orderIds, strategy, picker?})` |
| `pickTasks` | `confirm(taskId, pickedQuantity)` |
| `cycleCounts` | `submit(id, countedLines, varianceUnits)`, `approve(id)` |
| `packSessions` | `seal(id, scannedSku)` |
| `trips` | `assign({tripId, driverId, vehicleId})`, `optimize(tripId)`, `start(tripId)`, `complete(tripId)`, `submitPOD({tripId, photo, signature, deliveredAt, recipient, note})`, `pod(tripId)` |
| `sosAlerts` | `acknowledge(id)`, `resolve(id, note)` |
| `returns` | `inspect(id, {inspection, status, refundAmount?, note?})`, `refund(id, reason)` |
| `remittances` | `submit(id, submittedAmount)`, `reconcile(id, bankTransactionId)` |
| `expenses` | `decide(id, 'APPROVED' \| 'REJECTED', note?)` |
| `invoices` | `recordPayment(id, amount)` |
| `aiInsights` | `decide(id, status)` |
| `apiKeys` | `issue({name, scopes})` → `{ record, secret }`, `revoke(id)` |
| `users` | `invite({name, email, role})`, `setStatus(id, status)` |
| `webhooks` | `setStatus(id, status)` |
| `customers` | `list(filter?)`, `get(id)`, `stat(customerId)`, `reviews(customerId)` |
| `reports` | `summary(params)`, `onTime(params)`, `costs(params)`, `fleet(params)` |
| `orderPartials` | `list()`, `get(id)`, `update({id, status, note})` |
| `notifications` | `markAllRead()`, `send({to, kind, subject, body, refId?})`, `events(filter?)` |
| `vehicles` | `fuelLog({vehicleId, at, liters, cost, km, station, note?})`, `maintenanceLog({vehicleId, type, scheduledAt, cost, doneAt?, provider, note?})` |
| `drivers` | `ranking({period?})`, `tripLog({driverId})` |
| (root) | `dashboard()`, `controls({latency?, failureRate?, reset?})`, `reset()` |

Nhóm chỉ đọc/CRUD thường: `products`, `warehouses`, `bins`, `movements`, `equipment`,
`drivers`, `vehicles`, `geofences`, `bankTransactions`, `clients`, `auditLogs`, `roles`.

**Không có `data.branches`.** Trang `/branches` phải dùng `data.warehouses`.

## 3. Hành vi mock

- Độ trễ mặc định 80–220ms mỗi lệnh; `failureRate = 0`.
- Lỗi nghiệp vụ là `MockApiError` có `status` (404/409/422/503), message tiếng Việt. UI hiện
  `error.message` tại chỗ, không đoán lại lỗi.
- Dữ liệu lưu `localStorage` khoá `smartlogi.tenant.mock.db`, có `DB_VERSION` để tự seed lại.
- `resetDemoData()` và `simulateOutage(true)` dùng cho nút demo; REST adapter cố tình
  không hỗ trợ reset.
- `DB_VERSION` chỉ tăng khi đổi cấu trúc seed. A1–A3 không sửa seed nên không đổi.

## 4. Nghiệp vụ đã siết (đừng viết lại ở UI)

- Đơn: chặn lùi/đổi trạng thái đơn đã `DELIVERED | RETURNED | CANCELLED`; `createOrder`
  validate SĐT VN, khối lượng > 0, COD ≥ 0, kho tồn tại và `ACTIVE`.
- Wave: chặn đơn không tồn tại, sai kho, sai trạng thái (`NEW | UNASSIGNED | PENDING_PICKUP`).
- Chuyến: `start` chỉ từ `PLANNED | DISPATCHED`; `complete` chỉ từ `IN_PROGRESS`; COD thu
  theo stop đã giao.
- SOS: phải `acknowledge` trước khi `resolve`; ghi chú bắt buộc.
- RMA: không `REFUNDED` khi kiểm định `PENDING`.
- COD: không nộp lại phiếu `RECONCILED`; không đối soát phiếu `PENDING` hoặc đã khớp.
- Chi phí: không duyệt lại phiếu đã xử lý; từ chối phải có lý do.
- Hoá đơn: chặn `VOID`, chặn vượt công nợ còn lại.
- Người dùng: email trùng (không phân biệt hoa thường) bị chặn.
- Settings: giờ chốt 0–23, ngưỡng > 0, email hợp lệ, ít nhất một kênh thông báo.

UI không cần validate lại toàn bộ; chỉ cần hiện lỗi và disable nút khi chắc chắn sai.

## 5. Quyền và route

`canAccessRoute(role, pathname)` là nguồn duy nhất cho Sidebar và AuthGate. Ma trận hiện
tại:

| Vai trò | Route |
|---|---|
| TENANT_ADMIN / SUPER_ADMIN | tất cả |
| WAREHOUSE_MANAGER | dashboard, notifications, profile, orders, inventory, wms, warehouses, logistics/returns, logistics/expenses, finance/reports, admin/ai-insights |
| WAREHOUSE_STAFF | dashboard, notifications, profile, orders, inventory, wms |
| LOGISTICS_MANAGER | dashboard, notifications, profile, orders, logistics, drivers, finance/cod, finance/reports, warehouses, admin/ai-insights |
| DRIVER | dashboard, notifications, profile, drivers/my-trips, logistics/sos |
| CUSTOMER_CLIENT | dashboard, notifications, profile, orders |
| TENANT_USER | dashboard, notifications, profile, orders, inventory |

Tài khoản demo: `admin@smartlogi.vn`, `hanh.nguyen@smartlogi.vn`,
`trang.pham@smartlogi.vn`, `tai.nguyen@smartlogi.vn`; mật khẩu bất kỳ.

## 6. Điều A1–A3 được phép giả định

- `data` đã có đủ hàm ở mục 2; không cần thêm.
- `@/lib/labels` đã có nhãn/tone cho tất cả trạng thái và loại dữ liệu (`order`, `trip`,
  `return`, `cod`, `movement`, `role`, `customer`, `client`, `driver`, `vehicle`,
  `shipping`, `service`, `warehouse`, `wave`, `pickTask`, `cycleCount`, `equipment`,
  `invoice`, `account`, `apiKey`, `webhook`, `sosAlert`, `insight`, `maintenance`,
  `activity`, `orderPartial`, `notificationEvent`, `expense`) và 4 hàm format.
- `@/lib/permissions` đã có `can` cho 13 action ghi.
- `useRole()` trả `{ role, can }`.
- `DataState` của `ui-components` lo 4 trạng thái bảng.
- Sidebar đã có đủ mục cấp 1; route con nằm dưới trang hub (`/wms`, `/inventory`).

## 7. Điều A1–A3 **không** được làm

- Không sửa `src/lib/**`, kể cả để thêm một hàm "nhỏ".
- Không sửa `Sidebar`, `Header`, `AuthGate`, `AppShell`, `DemoActions`.
- Không đổi `DB_VERSION`, seed, hay storage key.
- Không thêm dependency để vẽ chart; tenant portal **không có** `recharts`.
