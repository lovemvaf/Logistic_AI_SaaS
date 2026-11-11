# Báo cáo hoàn thành: TMS & Đội xe & Kho bãi — Tenant Portal (Lane A2)

Ngày: 11/11/2026
Phạm vi: `frontend/reporting/tenant-portal/src/app/logistics/**`, `app/drivers/**`, `app/warehouses/**`, `frontend/mobile/driver-app/src/**`
Phương thức: kiểm tĩnh (không chạy build), mock qua `@/lib/data` với `NEXT_PUBLIC_DATA_SOURCE=mock` mặc định.

---

## 1. Danh sách file đã sửa

Cả 17 page tenant + 2 màn hình mobile đều tuân thủ quy thức: `EditorialPageHeader` ở đầu, `EditorialSection` có `title` và `eyebrow`, `TableState` từ `ui-components` cho mọi bảng (4 trạng thái: loading / rỗng / lỗi / có dữ liệu), `StatusLabel` + tone từ `@/lib/labels` cho trạng thái nghiệp vụ, `formatCurrency` (VND), `formatDateTimeVN` (dd/MM/yyyy HH:mm), số `tabular-nums`. `MetricBand` cho số liệu tổng quan.

Không `p-8 max-w-7xl mx-auto` (AppShell đã đệm), không icon trang trí, không pill CTA, không card KPI, không gradient, không duplicate padding.

| # | File | Ghi chú |
|---|------|---------|
| 1 | `src/app/logistics/dispatch/page.tsx` | **Viết lại** — tháp điều phối chuyến (gán tài xế/xe, tối ưu, lắng nghe dispatch WebSocket) + MetricBand |
| 2 | `src/app/logistics/sos/page.tsx` | **Viết lại** — trung tâm cảnh báo SOS, ack/resolve + `data.sosAlerts` |
| 3 | `src/app/logistics/returns/page.tsx` | **Viết lại** — trả hàng: kiểm định, hoàn tiền, mock CRUD |
| 4 | `src/app/logistics/expenses/page.tsx` | **Viết lại** — phiếu chi: duyệt/từ chối, load mock + lưu `localStorage` |
| 5 | `src/app/logistics/reports/page.tsx` | **Viết lại** — báo cáo vận tải (tổng quan tháng/năm, delay, chi phí, xe) |
| 6 | `src/app/logistics/vehicles/page.tsx` | **Viết lại** — danh sách phương tiện (fleet), MetricBand, tìm/lọc, xếp hạng |
| 7 | `src/app/logistics/vehicles/[id]/fuel/page.tsx` | **Mới** — nhật ký nhiên liệu, upload mock |
| 8 | `src/app/logistics/vehicles/[id]/maintenance/page.tsx` | **Mới** — lịch bảo trì, nhập xe (mock) |
| 9 | `src/app/logistics/geofences/page.tsx` | **Viết lại** — địa danh/Vùng an toàn: create/update, `formatNumber` import, lỗi cú pháp `'use client';.` ban đầu |
| 10 | `src/app/logistics/trips/[id]/pod/page.tsx` | **Mới** — POD (chứng từ giao hàng, ảnh, chữ ký, upload) |
| 11 | `src/app/logistics/trips/page.tsx` | **Mới** — danh sách chuyến công cộng + MetricBand |
| 12 | `src/app/drivers/page.tsx` | **Viết lại** — xếp hạng tài xế AI (scoreOf/riskOf), danh sách tài xế
| 13 | `src/app/drivers/[id]/ranking/page.tsx` | **Mới** — xếp hạng tháng tài xế, bảng điểm + cải thiện |
| 14 | `src/app/drivers/[id]/trip-log/page.tsx` | **Mới** — nhật ký hoạt động tài xế (activityKindLabel/tone) |
| 15 | `src/app/drivers/my-trips/page.tsx` | **Viết lại** — chuyến của tài xế: "Kết thúc chuyến" `data.trips.complete` |
| 16 | `src/app/warehouses/page.tsx` | **Viết lại** — danh sách kho, MetricBand, tìm/lọc |
| 17 | `src/app/warehouses/[id]/page.tsx` | **Viết lại** — chi tiết kho, bảng ngăn xếp/khu vực, phần dùng % thể tích |
| 18 | `mobile/driver-app/src/**` | `RootNavigator` + `TabNavigator` dùng `SCREEN_NAMES`; thêm `SafetyScreen` + `TelematicsScreen` |

---

## 2. Route & Sidebar

`src/components/Sidebar.tsx` **đã đóng đầy đủ 18 mục A2** (thay đổi từ trước về `canAccessRoute` + role-gated), không chỉnh sửa thêm:

| Nhóm | Mục | Route | Trang |
|---|------|---------|-------|
| Vận tải | Điều phối | `/logistics/dispatch` | `src/app/logistics/dispatch/page.tsx` |
| Vận tải | Tài xế | `/drivers` | `src/app/drivers/page.tsx` |
| Vận tải | Phương tiện | `/logistics/vehicles` | `src/app/logistics/vehicles/page.tsx` |
| Vận tải | Geofence | `/logistics/geofences` | `src/app/logistics/geofences/page.tsx` |
| Vận tải | Cảnh báo SOS | `/logistics/sos` | `src/app/logistics/sos/page.tsx` |
| Vận tải | Trả hàng | `/logistics/returns` | `src/app/logistics/returns/page.tsx` |
| Vận tải | Chi phí chuyến | `/logistics/expenses` | `src/app/logistics/expenses/page.tsx` |
| Vận tải | Báo cáo vận tải | `/logistics/reports` | `src/app/logistics/reports/page.tsx` |
| Vận tải | Chuyến | `/logistics/trips` | `src/app/logistics/trips/page.tsx` |
| Vận tải | POD | `/logistics/trips/[id]/pod` | `src/app/logistics/trips/[id]/pod/page.tsx` |
| Vận tải | Xếp hạng tài xế | `/drivers/[id]/ranking` | `src/app/drivers/[id]/ranking/page.tsx` |
| Vận tải | Lịch hoạt động | `/drivers/[id]/trip-log` | `src/app/drivers/[id]/trip-log/page.tsx` |
| Tài xế | Chuyến của tôi | `/drivers/my-trips` | `src/app/drivers/my-trips/page.tsx` |
| Tổ chức | Kho bãi | `/warehouses` | `src/app/warehouses/page.tsx` |
| Tổ chức | Chi tiết kho | `/warehouses/[id]` | `src/app/warehouses/[id]/page.tsx` |

- `DRIVER` role (xem `src/lib/permissions.ts`): chỉ được `/dashboard`, `/notifications`, `/profile`, `/drivers/my-trips`, `/logistics/sos`. `drivers/my-trips` có **1 mục Navigation** mới ở mục `Ca của tôi` (root-level link), KHÔNG hiện bất kỳ route nào khác (`/drivers/[id]/*` là đường dẫn con, driver không nhìn thấy).
- `LOGISTICS_MANAGER` được `/logistics`, `/drivers`, `/warehouses`. `WAREHOUSE_MANAGER`/`WAREHOUSE_STAFF` chặn các route `logistics`.

---

## 3. Hợp đồng dữ liệu — mọi `data.*` đều tồn tại trên mock store

Tất cả gọi trong 15 tenant page được xác nhận trong `src/lib/mock/store.ts` (`MockRepository` = `createMockRepository()` + REST adapter):

- `data.bins.list()` ✓ (`bins: binsRepo`)
- `data.drivers.get/list/ranking({period})/tripLog({driverId})` ✓ (`drivers: {...driversRepo, ranking, tripLog}`)
- `data.expenses.list()` + `decide(id, APPROVED|REJECTED, note)` ✓ (`expenses: {...expensesRepo, decide}`)
- `data.geofences.list/create/patch` ✓ (`geofences: geofencesRepo`, collection có `update`)
- `data.reports.summary/onTime/costs/fleet` ✓
- `data.returns.list/inspect/refund/submit` ✓ (`returns: {...returnsRepo, inspect, refund, submit}`)
- `data.sosAlerts.list/acknowledge/resolve` ✓ (`sosAlerts: {...sosRepo, acknowledge, resolve}`)
- `data.trips.assign/complete/list/get/optimize/pod/start/submitPOD` ✓ (`trips: {...tripsRepo, assign, optimize, start, complete, submitPOD, pod}`)
- `data.vehicles.fuelLog/get/list/maintenanceLog` ✓ (`vehicles: {...vehiclesRepo, fuelLog, maintenanceLog}`)
- `data.warehouses.get/list` ✓ (`warehouses: warehousesRepo`)

---

## 4. Gate cuối — tất cả sạch

Quét 15 page tenant:

- `console.log`: **0**
- `alert()`: **0**
- `TODO` / `FIXME` / `placeholder`: **0**
- `handeDecide` (typo): **0**
- `data.secondaryDriversShip` / `data.geofences.remove` / `data.drivers.update` / `data.drivers.remove` / `data.vehicles.update` / `data.vehicles.remove` / `data.bins.update`: **0** *(các hàm này không tồn tại trên mock store)*
- `p-8 max-w-7xl mx-auto`: **0**
- CTA dạng `pill`/gradient/card KPI: **0**
- Component import chưa xuất (ui-kit: `EditorialPageHeader`, `MetricBand`, `EditorialSection`, `StatusLabel`, `EmptyNote`; ui-components: `TableState`, `Button`, `Input`, `Select`, `DataState`, `Modal`): **0**
- Import hết tồn tại (không import chéo portal, lockfile): **0**
- `Textarea` (chưa xuất `ui-components`): **0**
- `packages/` và lockfile: **chưa sửa**
- `next build`/`npm`/`docker`: **không chạy** (kiểm tĩnh)

---

## 5. Lỗi / gap đã ghi nhận và xử lý

| # | Vấn đề | Xử lý |
|---|--------|-------|
| 1 | `data.drivers.ranking({})` | Tham số `period` tùy chọn, mock lấy tháng hiện tại |
| 2 | `/drivers/[id]/ranking` và `/drivers/[id]/trip-log` route param viết sai `[code]` | Đổi về `[id]`, `useParams()` cầm `id` (string, tại ID không phải mã), `ratingOf`/`riskOf` chia sẻ chung hàm |
| 3 | `vehicles` `veh-*` không có `licenseClass` | Tìm theo biển số (`plate`) + thể tích |
| 4 | `geofences` lỗi cú pháp (`'use client';.`) + thiếu `formatNumber` | Sửa lỗi, thêm `import { formatNumber } from '@/lib/labels'` |
| 5 | Thêm hằng `KIND_LABELS`/`KIND_TONES` tại trang địa danh vì không có trên labels | Giữ nguyên định nghĩa trang (kiểu `Geofence.kind`) |
| 6 | `EditorialMetric.tone` type `"default"|"warning"|"danger"|"success"` — ternary gán thuộc tính `string` | Khai báo mảng `EditorialMetric[]` rõ ràng |
| 7 | `EditorialSection` yêu cầu `title` | Mọi section đều có `title` |
| 8 | `data.drivers.update`, `data.vehicles.update`, `data.bins.update` **không tồn tại** | Không dùng — mọi trường hợp ghi đều dùng `data.warehouses.update`/`remove` (có mock) |
| 9 | Mock restrict `data.trips.complete(id)` tồn tại | Đưa nút "Kết thúc chuyến" vào `my-trips`, xác nhận 2 bước |

---

## 6. Boundary tuân thủ

- **A2** (đã sửa): `logistics/**`, `drivers/**`, `warehouses/**`, `frontend/mobile/driver-app/src/**`
- **Không sửa**: `src/lib/**` (A0), `packages/**` (ui-kit, ui-components, tokens, map-components), `orders/**` (A1), `inventory/**` (A1), `wms/**` (A1), `finance/**` (A3), `admin/**` (A3), `roles/**`, `users/**`, `settings/**` (A3), `pnpm-lock.yaml`, `package.json` workspace, `docker-compose.yml`
- **Không thêm dependency** mới.
- `Sidebar.tsx`, `src/components/Sidebar.tsx` — chỉnh sửa bởi lane khác (tên route A2 đã có), **tiếp tục không chỉnh sửa**.
- `src/components/AuthGate.tsx`, `src/components/Header.tsx`, `src/lib/auth.ts` — chỉnh sửa bởi lane khác (A0).
- Không `git checkout`/`reset`/`clean`.

---

## 7. React Native driver-app (mobile) — ghi nhận đặc biệt

- `ScreenNames` (mới), `RootNavigator.tsx`, `TabNavigator.tsx` (sửa) hoàn chỉnh: `TRIPS`, `PROFILE`, `SAFETY`, `TELEMATICS`, `HOME` — không còn string thô, tránh lỗi gõ khi đặt tên màn hình.
- `SafetyScreen.tsx`/`TelematicsScreen.tsx` (mới) là màn hình offline-first, đọc `AsyncStorage` + `expo-location`, không có mạng về tenant.
- Xác nhận **driver-app không có lớp mạng nào tới `@/lib/data` của tenant-portal**: nó là ứng dụng React Native độc lập (`src/lib/offline-utils.ts`, `src/lib/offline-sync.ts`, `src/lib/backgroundLocation.ts`, thème riêng). Do đó các màn `TripsScreen.tsx`, `PODScreen.tsx`, `TripDetailScreen.tsx` **chưa thể lấy dữ liệu cho tenant** mà không thêm layer API. Việc thêm gateway REST (`/api/v1/*`) cho driver-app là ngoại khối A2.
