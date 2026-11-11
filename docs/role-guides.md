# Hướng dẫn Vận hành & Ma trận Phân quyền theo Vai trò (Role Guides & RBAC Matrix)

Tài liệu xác định ranh giới quyền tối thiểu (least-privilege), cơ chế đánh giá [`PermissionsGuard`](../packages/shared-types/src/guards/permissions.guard.ts), kiểm soát sở hữu dòng dữ liệu (row-level ownership) và luồng tác nghiệp cho **1 vai trò nền tảng (`SUPER_ADMIN`) + 7 vai trò trong tenant + Tra cứu công khai (có cấp `PublicTrackingGrant`)**.

---

## 1. Cơ chế Kiểm tra Quyền Thực thi (Authorization Architecture)

Trong [`PermissionsGuard`](../packages/shared-types/src/guards/permissions.guard.ts), thứ tự kiểm tra được khóa cứng theo 4 bước nhằm ngăn leo thang đặc quyền:
1. **`@ExcludeRoles(...)`**: Đánh giá **trước** cả quyền hạn lẫn bypass. Khóa cứng `CUSTOMER_CLIENT` khỏi toàn bộ controller nội bộ của tenant (`OrdersController`, `ReturnsController`, `WarehouseOpsController`, `CodRemittancesController`, `FinancePortalController`, `GeographyController`, `FreightController`, `YardController`, `PricingController`, `TradeController`, ...).
2. **`@RequireRoles(...)`**: Đánh giá trước bypass. Khóa cứng toàn bộ controller quản trị nền tảng (`admin-tenants`, `admin-billing`, `admin-dashboard`, `admin-audit-logs`, `geography-admin`) chỉ cho phép **`SUPER_ADMIN`**, chặn `TENANT_ADMIN` dù có trùng tên chuỗi quyền.
3. **`@RequirePermissions(...)`**: Nếu là `SUPER_ADMIN` (đã qua bước 1 & 2) thì cho qua; ngược lại phải sở hữu **đầy đủ** các chuỗi permission trong JWT/map của [`role-permission-map.ts`](../packages/shared-types/src/role-permission-map.ts) (tổng `50` chuỗi quyền).
4. **Row-Level Ownership & PostgreSQL `FORCE RLS`**: Ngoài RBAC ở endpoint, các luồng sau bắt buộc kiểm tra chủ thể ở service/controller kết hợp `FORCE ROW LEVEL SECURITY` trên **`88`** bảng DB:
   - `DRIVER`: Mọi thao tác nhận chuyến, check-in, hoàn tất điểm giao, upload POD đều kiểm tra `delivery.driverId === driver.id || delivery.trip.driverId === driver.id`. Ví tài xế & bảng xếp hạng dùng `driver.id` suy ra từ `req.user.sub`.
   - `CUSTOMER_CLIENT`: Mọi truy vấn đơn hàng, tồn kho ký gửi, hóa đơn, trả hàng, webhook (`/client/*`) và RFQ/Quote/Booking/Shipment/Document/Invoice/Dispute/TrackingGrant (`/client/freight/*`) tự động lọc theo `req.user.client_id`.
   - `WAREHOUSE_STAFF`: Khi mở ca/mượn thiết bị qua `warehouse-ops` hoặc `equipment`, luôn lấy `staffId = req.user.sub`, không nhận từ body hay fallback sang bản ghi đầu bảng.

---

## 2. Ma trận Phân quyền Chính xác từ Mã nguồn (`RolePermissionMap` + Role Guards)

| Nhóm Quyền / Phạm vi | `SUPER_ADMIN` | `TENANT_ADMIN` | `WAREHOUSE_MANAGER` | `WAREHOUSE_STAFF` | `LOGISTICS_MANAGER` | `DRIVER` | `CUSTOMER_CLIENT` | `TENANT_USER` |
|---|---|---|---|---|---|---|---|---|
| **Cổng & Ứng dụng sử dụng** | `admin-portal` (18 tr.) | `tenant-portal` (53 tr.) | `tenant-portal`, `pack-station-web` | `pack-station-web`, `tenant-portal` | `tenant-portal` | `driver-app` (Mobile) | `customer-portal` (14 tr.) | `tenant-portal` (Chỉ xem) |
| **Platform Admin & Geo Admin (`/admin/*`, `/geography/admin/*`)** | Toàn quyền | Bị chặn (`@RequireRoles`) | Bị chặn | Bị chặn | Bị chặn | Bị chặn | Bị chặn | Bị chặn |
| `tenant-dashboard:read` | Bypass | Có | Không | Không | Không | Không | Không | Không |
| `inventory:read` / `inventory:adjust` | Bypass | Đọc + Điều chỉnh | Đọc + Điều chỉnh | Chỉ Đọc | Không | Không | Chỉ tồn của `client_id` (`/client/*`) | Chỉ Đọc |
| `warehouses:manage` | Bypass | Có | Có | Không | Không | Không | Không | Không |
| `tasks:read` / `create` / `update` | Bypass | Đọc + Tạo + Sửa | Đọc + Tạo + Sửa | Đọc + Cập nhật | Không | **Không** (`mobile/trips`) | Không | Chỉ Đọc |
| `pack-station:scan` | Bypass | Có | Có | Có | Không | Không | Không | Không |
| `orders:read` / `orders:create` | Bypass | Đọc + Tạo | Chỉ Đọc | Không | Đọc + Tạo | Không | Chỉ đơn của `client_id` (`/client/orders`) | Chỉ Đọc |
| `trips:read` / `trips:dispatch` | Bypass | Đọc + Điều phối | Không | Không | Đọc + Điều phối | Chỉ đọc chuyến mình | Không | Chỉ Đọc |
| `vehicles:read` / `vehicles:manage` | Bypass | Đọc + Quản lý | Chỉ Đọc | Không | Đọc + Quản lý | Không | Không | Không |
| `drivers:manage` | Bypass | Có | Không | Không | Có | Không | Không | Không |
| `geography:read` / `geography:manage` | Đọc + Quản lý (`geography/admin`) | Chỉ Đọc (`/geography/*`) | Chỉ Đọc | Chỉ Đọc | Chỉ Đọc | Không | Chỉ Đọc (`/client/freight/geography/units`) | Chỉ Đọc |
| `freight:read` / `freight:manage` | Bypass | Đọc + Quản lý | Chỉ Đọc | Không | Đọc + Quản lý | Không | Đọc + RFQ/Quote của `client_id` (`/client/freight/*`) | Chỉ Đọc |
| `yard:read` / `yard:manage` | Bypass | Đọc + Quản lý | Đọc + Quản lý | Chỉ Đọc | Đọc + Quản lý | Không | Không | Chỉ Đọc |
| `pricing:read` / `pricing:manage` | Bypass | Đọc + Quản lý | Không | Không | Chỉ Đọc | Không | Chỉ hóa đơn/tranh chấp của `client_id` | Chỉ Đọc |
| `trade:read` / `trade:approve` | Bypass | Đọc + Duyệt/Hải quan | Không | Không | Chỉ Đọc | Không | Đọc + Upload chứng từ của `client_id` | Chỉ Đọc |
| `tracking-grants:manage` | Bypass | Có | Không | Không | Có | Không | Tạo/thu hồi grant cho đơn/lô của `client_id` | Không |
| `users:read` / `users:invite` | Bypass | Đọc + Mời | Chỉ Đọc | Không | Chỉ Đọc | Không | Không | Không |
| `roles:manage` / `settings:manage` / `api-keys:manage` | Bypass | Có | Không | Không | Không | Không | Không | Không |
| `audit-logs:read` | Bypass (mọi tenant) | Chỉ đọc trong tenant mình | Không | Không | Không | Không | Không | Không |
| `billing:read` / `billing:manage` | Toàn quyền (`SUPER_ADMIN`) | Chỉ Đọc hóa đơn (`/tenant/billing`) | Không (`BillingManage` cấm) | Không | Không | Không | Chỉ trả hóa đơn của mình (`/client/invoices`) | Không |
| `mobile:sync:*`, `uploads`, `gps:batch`, `sos` | Bypass | Có (mô phỏng/hỗ trợ) | Không | `sync:pull` + `sync:push` (PDA) | Không | Đủ 5 quyền (ràng buộc `driver.id`) | Không | Không |
| `returns:read` / `create` / `approve` / `inspect` / `refund` | Bypass | Đầy đủ 5 quyền | Không | Không | Đọc + Tạo + Duyệt | Không | Đọc + Tạo (`/client/returns`) | Không |
| `notifications:read` | Bypass | Có | Có | Không | Có | Không (xem qua app) | Có | Không |

---

## 3. Hướng dẫn Nghiệp vụ Từng Vai trò

### 3.1. `SUPER_ADMIN` — Quản trị Nền tảng (`admin-portal`, 18 trang)
- **Đăng nhập & Ngữ cảnh**: `/admin/login`. Xác thực qua bảng `SystemAdmin`, JWT mang `role: "SUPER_ADMIN"`.
- **Tác vụ chính**:
  - Tạo, gia hạn, tạm khóa tenant & định mức quota (`/admin/tenants`, `PATCH /api/v1/admin/tenants/:id`).
  - Quản trị gói cước (`SubscriptionPlan`), xuất hóa đơn SaaS & ghi nhận thanh toán (`/admin/billing`).
  - Theo dõi nhật ký bảo mật đa tenant (`/admin/audit-logs`, xuất CSV an toàn CWE-1236).
  - Quản lý danh mục **95 ĐVHC TP Đồng Nai 2026**, cập nhật mã định danh chính thức (`PATCH /geography/admin/units/:id/official`) & theo dõi/khôi phục **Outbox Dead-Letter** (`/admin/geography`, `/admin/dashboard/outbox*`).
  - Quản lý danh mục model AI & xuất dữ liệu nhãn chuẩn (`/admin/ai-models`, `POST /v1/train/:type` trả `501` minh bạch quy trình offline).

### 3.2. `TENANT_ADMIN` — Quản trị Doanh nghiệp Khách thuê (`tenant-portal`, 53 trang)
- **Tác vụ chính**:
  - Quản lý chi nhánh (`/branches`), kho (`/warehouses`), người dùng nội bộ & role tùy chỉnh (`/users`, `/roles`), API key (`/admin/api-keys`), feature flags và thiết lập tenant.
  - Quản lý danh mục giá hợp đồng, quy tắc DEM/DET, hóa đơn freight AR/AP & xử lý tranh chấp (`/finance/freight`), theo dõi toàn trình 3PL Freight Control Tower (`/freight`), Yard/EIR (`/yard`), chứng từ XNK/hải quan (`/trade`) & chuẩn hóa địa chỉ TP Đồng Nai 2026 (`/geography`).
  - Theo dõi đơn hàng, điều phối, trả hàng, hóa đơn SaaS (`/admin/billing`), đối soát COD (`/finance/cod`) và nhật ký riêng tenant (`/admin/audit-logs`).
- **Giới hạn**: Bị chặn truy cập toàn bộ `/api/v1/admin/*` và `/api/v1/geography/admin/*` (`403 Forbidden`).

### 3.3. `WAREHOUSE_MANAGER` & `WAREHOUSE_STAFF` — Vận hành Kho, Bãi & Đóng gói (`tenant-portal` + `pack-station-web`)
- **Trưởng kho (`WAREHOUSE_MANAGER`)**:
  - Thiết lập cấu trúc `Warehouse -> Zone -> Rack -> Bin` (`/locations`), quản lý SKU (`/wms/products`), `WavePicking`, kiểm kê chu kỳ (`/inventory/cycle-count`), putaway & quản lý slot bãi/EIR (`/yard`).
- **Nhân viên kho / Đóng gói (`WAREHOUSE_STAFF`)**:
  - Mở ca & mượn thiết bị qua `warehouse-ops` (tự động gắn `staffId = req.user.sub`).
  - Tại `pack-station-web` (`/pack`): dùng đầu đọc Web Serial / nhập tay mã SKU; camera MobileNet chỉ đưa gợi ý ImageNet (`>= 0.60`) — **bắt buộc quét barcode/xác nhận** trước khi niêm phong (`seal`) hoặc ghi đính chính (`correction`).

### 3.4. `LOGISTICS_MANAGER` — Điều phối Vận tải Container, Freight 3PL & Tài chính Chuyến (`tenant-portal`)
- **Tác vụ chính**:
  - Quản lý đội xe, tài xế, vùng `Geofence` (`/logistics/*`), đội đầu kéo (`TractorUnit`), sơ-mi rơ-moóc (`ChassisUnit`), vỏ container (`ContainerEquipment`) và phân công không trùng lịch (`POST /api/v1/freight/assignments`, chặn chồng lấn `409 Conflict`).
  - Điều hành RFQ -> Báo giá -> Booking -> Shipment -> Chặng vận tải (`/freight`), tính cước/phí lưu bãi-lưu vỏ tách riêng (`GET /api/v1/pricing/shipments/:id/dem-det`), điều hành cổng bãi & biên bản EIR (`/yard`), phối hợp hải quan (`/trade`, đọc & chuẩn bị tờ khai) và đối soát COD (`/finance/cod`).

### 3.5. `DRIVER` — Tài xế Giao nhận (`driver-app` Expo React Native, 10 màn hình)
- **Tác vụ chính**:
  - Xem danh sách chuyến (`TripsScreen`), chi tiết điểm dừng (`TripDetailScreen`).
  - Trong vùng mất sóng: check-in, hoàn tất giao, chụp POD (`PODScreen`), kê khai chi phí (`ExpenseScreen`), gửi SOS (`SafetyScreen`) tự động xếp vào `OfflineSyncEngine` (CSPRNG UUID + lưu `SYNCING` trước HTTP + `DEAD_LETTER` sau 5 lần + header `X-Sync-Id` / SHA-256 kiểm tra xung đột `409`).
  - Quản lý ví COD & phiếu quyết toán (`RemittanceScreen`); gửi telemetry theo batch (`TelematicsScreen`).

### 3.6. `CUSTOMER_CLIENT` — Khách hàng Doanh nghiệp B2B (`customer-portal`, 14 trang)
- **Tác vụ chính**:
  - Tạo đơn B2B & tải CSV (`/client/orders`), hủy đơn hợp lệ, xem tồn kho ký gửi (`/client/inventory`), yêu cầu trả hàng RMA (`/client/returns`), thanh toán hóa đơn (`/client/invoices`), quản lý webhook bảo vệ SSRF (`/client/webhooks`).
  - Cổng Freight & XNK B2B (`/client/freight`): tra cứu 95 ĐVHC TP Đồng Nai 2026, gửi RFQ, duyệt báo giá, theo dõi booking/lô container/chứng từ XNK, mở tranh chấp hóa đơn (`DisputeCase`), và **tạo/thu hồi `PublicTrackingGrant`** có thời hạn chia sẻ cho người nhận/đối tác.
- **Ranh giới bảo mật**: `@ExcludeRoles(Roles.CUSTOMER_CLIENT)` chặn truy cập toàn bộ controller nội bộ của tenant.

### 3.7. Người nhận cuối / Công khai (Unauthenticated Public Tracking)
- **Truy vấn ẩn danh**: `/track/[code]` gọi `GET /api/v1/public/track/:code` (và `/live`, `/sla`, `/verify`). API lọc bỏ dữ liệu tài chính nhạy cảm (`shippingFee`, `codAmount`, ghi chú nội bộ) và **làm tròn thô tọa độ GPS** thay vì trả vị trí chính xác của tài xế/điểm giao.
- **Truy vấn có mã cấp quyền (`PublicTrackingGrant`)**: Truy cập với `?grant=<token>` hoặc `GET /api/v1/public/t/:token` kiểm tra chữ ký hash SHA-256, `expiresAt` và `revokedAt` để mở thông tin lộ trình chi tiết hơn theo đúng cấp độ cho phép (`precision`).
