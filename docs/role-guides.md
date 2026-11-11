# Hướng dẫn Vận hành & Ma trận Phân quyền theo Vai trò (Role Guides & RBAC Matrix)

Tài liệu xác định ranh giới quyền tối thiểu (least-privilege), cơ chế đánh giá [`PermissionsGuard`](../packages/shared-types/src/guards/permissions.guard.ts), kiểm soát sở hữu dòng dữ liệu (row-level ownership) và luồng tác nghiệp cho **1 vai trò nền tảng (`SUPER_ADMIN`) + 7 vai trò trong tenant + Tra cứu công khai**.

---

## 1. Cơ chế Kiểm tra Quyền Thực thi (Authorization Architecture)

Trong [`PermissionsGuard`](../packages/shared-types/src/guards/permissions.guard.ts), thứ tự kiểm tra được khóa cứng theo 4 bước nhằm ngăn leo thang đặc quyền:
1. **`@ExcludeRoles(...)`**: Đánh giá **trước** cả quyền hạn lẫn bypass. Dùng để khóa cứng `CUSTOMER_CLIENT` khỏi toàn bộ controller nội bộ của tenant (`OrdersController`, `ReturnsController`, `WarehouseOpsController`, `CodRemittancesController`, `FinancePortalController`, ...).
2. **`@RequireRoles(...)`**: Đánh giá trước bypass. Khóa cứng toàn bộ controller quản trị nền tảng (`admin-tenants`, `admin-billing`, `admin-dashboard`, `admin-audit-logs`) chỉ cho phép **`SUPER_ADMIN`**, chặn `TENANT_ADMIN` dù có trùng tên chuỗi quyền.
3. **`@RequirePermissions(...)`**: Nếu là `SUPER_ADMIN` (đã qua bước 1 & 2) thì cho qua; ngược lại phải sở hữu **đầy đủ** các chuỗi permission trong JWT/map của [`role-permission-map.ts`](../packages/shared-types/src/role-permission-map.ts).
4. **Row-Level Ownership & PostgreSQL RLS**: Ngoài RBAC ở endpoint, các luồng sau bắt buộc kiểm tra chủ thể ở service/controller kết hợp `FORCE ROW LEVEL SECURITY` trên DB:
   - `DRIVER`: Mọi thao tác nhận chuyến, check-in, hoàn tất điểm giao, upload POD đều kiểm tra `delivery.driverId === driver.id || delivery.trip.driverId === driver.id`. Ví tài xế & bảng xếp hạng dùng `driver.id` suy ra từ `req.user.sub`.
   - `CUSTOMER_CLIENT`: Mọi truy vấn đơn hàng, tồn kho ký gửi, hóa đơn, trả hàng, webhook dưới `/client/*` tự động lọc theo `req.user.client_id`.
   - `WAREHOUSE_STAFF`: Khi mở ca/mượn thiết bị qua `warehouse-ops` hoặc `equipment`, luôn lấy `staffId = req.user.sub`, không nhận từ body hay fallback sang bản ghi đầu bảng.

---

## 2. Ma trận Phân quyền Chính xác từ Mã nguồn (`RolePermissionMap` + Role Guards)

| Nhóm Quyền / Phạm vi | `SUPER_ADMIN` | `TENANT_ADMIN` | `WAREHOUSE_MANAGER` | `WAREHOUSE_STAFF` | `LOGISTICS_MANAGER` | `DRIVER` | `CUSTOMER_CLIENT` | `TENANT_USER` |
|---|---|---|---|---|---|---|---|---|
| **Cổng & Ứng dụng sử dụng** | `admin-portal` | `tenant-portal` | `tenant-portal`, `pack-station-web` | `pack-station-web`, `tenant-portal` | `tenant-portal` | `driver-app` (Mobile) | `customer-portal` | `tenant-portal` (Chỉ xem) |
| **Platform Admin (`/admin/*`, ngoài auth)** | Toàn quyền | Bị chặn (`@RequireRoles`) | Bị chặn | Bị chặn | Bị chặn | Bị chặn | Bị chặn | Bị chặn |
| `tenant-dashboard:read` | Bypass | Có | Không | Không | Không | Không | Không | Không |
| `inventory:read` / `inventory:adjust` | Bypass | Đọc + Điều chỉnh | Đọc + Điều chỉnh | Chỉ Đọc | Không | Không | Chỉ đọc đơn/tồn của `client_id` (`/client/*`) | Chỉ Đọc |
| `warehouses:manage` | Bypass | Có | Có | Không | Không | Không | Không | Không |
| `tasks:read` / `create` / `update` | Bypass | Đọc + Tạo + Sửa | Đọc + Tạo + Sửa | Đọc + Cập nhật | Không | **Không** (`mobile/trips` đọc stop chuyến) | Không | Chỉ Đọc |
| `pack-station:scan` | Bypass | Có | Có | Có | Không | Không | Không | Không |
| `orders:read` / `orders:create` | Bypass | Đọc + Tạo | Chỉ Đọc | Không | Đọc + Tạo | Không | Chỉ đơn của `client_id` (`/client/orders`) | Chỉ Đọc |
| `trips:read` / `trips:dispatch` | Bypass | Đọc + Điều phối | Không | Không | Đọc + Điều phối | Chỉ đọc chuyến của mình | Không | Chỉ Đọc |
| `vehicles:read` / `vehicles:manage` | Bypass | Đọc + Quản lý | Chỉ Đọc | Không | Đọc + Quản lý | Không | Không | Không |
| `drivers:manage` | Bypass | Có | Không | Không | Có | Không | Không | Không |
| `users:read` / `users:invite` | Bypass | Đọc + Mời | Chỉ Đọc | Không | Chỉ Đọc | Không | Không | Không |
| `roles:manage` / `settings:manage` / `api-keys:manage` | Bypass | Có | Không | Không | Không | Không | Không | Không |
| `audit-logs:read` | Bypass (mọi tenant) | Chỉ đọc trong tenant mình | Không | Không | Không | Không | Không | Không |
| `billing:read` / `billing:manage` | Toàn quyền (`SUPER_ADMIN`) | Chỉ Đọc hóa đơn (`/tenant/billing`) | Không (`BillingManage` bị chặn) | Không | Không | Không | Chỉ trả hóa đơn của mình (`/client/invoices`) | Không |
| `mobile:sync:*`, `uploads`, `gps:batch`, `sos` | Bypass | Có (mô phỏng/hỗ trợ) | Không | `sync:pull` + `sync:push` (PDA) | Không | Đủ 5 quyền (ràng buộc `driver.id`) | Không | Không |
| `returns:read` / `create` / `approve` / `inspect` / `refund` | Bypass | Đầy đủ 5 quyền | Không | Không | Đọc + Tạo + Duyệt | Không | Đọc + Tạo (`/client/returns`) | Không |
| `notifications:read` | Bypass | Có | Có | Không | Có | Không (xem qua app) | Có | Không |

*(Lưu ý sửa sai lệch tài liệu cũ: Trong phiên bản B4 cũ, bảng role từng ghi `DRIVER` có quyền xem task soạn hàng và gộp thiếu `SUPER_ADMIN` lẫn `TENANT_USER`. Thực tế code: `DRIVER` **không có** `tasks:read` mà thao tác trên chuyến giao `/mobile/trips` và `/driver-app`.)*

---

## 3. Hướng dẫn Nghiệp vụ Từng Vai trò

### 3.1. `SUPER_ADMIN` — Quản trị Nền tảng (`admin-portal`, 17 trang)
- **Đăng nhập & Ngữ cảnh**: `/admin/login` (hỗ trợ Google nếu cấu hình OAuth). Xác thực qua bảng `SystemAdmin`, JWT mang `role: "SUPER_ADMIN"`.
- **Tác vụ chính**:
  - Tạo, gia hạn, tạm khóa tenant & định mức quota (`/admin/tenants`, `PATCH /api/v1/admin/tenants/:id`).
  - Quản trị gói cước (`SubscriptionPlan`), xuất hóa đơn SaaS & ghi nhận thanh toán (`/admin/billing`).
  - Theo dõi nhật ký bảo mật đa tenant (`/admin/audit-logs`, xuất CSV an toàn CWE-1236).
  - Quản lý danh mục model AI & xuất dữ liệu nhãn chuẩn (`/admin/ai-models`, lưu ý nút "Train" không thực hiện huấn luyện online mà báo rõ quy trình offline).
- **Cảnh báo chế độ dữ liệu**: Kiểm tra cờ `NEXT_PUBLIC_DATA_SOURCE`. Nếu ở `mock`, mọi chỉ số dashboard (`SEED_DASHBOARD_STATS`) chỉ là dữ liệu mẫu tĩnh phục vụ minh họa, không phản ánh DB thật.

### 3.2. `TENANT_ADMIN` — Quản trị Doanh nghiệp Khách thuê (`tenant-portal`)
- **Tác vụ chính**:
  - Quản lý chi nhánh (`/branches`), kho (`/warehouses`), người dùng nội bộ & role tùy chỉnh (`/users`, `/roles`), API key (`/admin/api-keys`), feature flags và thiết lập tenant.
  - Theo dõi toàn trình đơn hàng, điều phối, trả hàng, hóa đơn B2B (`/admin/billing`), đối soát COD (`/finance/cod`) và nhật ký riêng của tenant (`/admin/audit-logs`, tự động cô lập không thấy log platform).
- **Giới hạn**: Bị chặn truy cập toàn bộ `/api/v1/admin/*` (`403 Forbidden`).

### 3.3. `WAREHOUSE_MANAGER` & `WAREHOUSE_STAFF` — Vận hành Kho & Trạm Đóng gói (`tenant-portal` + `pack-station-web`)
- **Trưởng kho (`WAREHOUSE_MANAGER`)**:
  - Thiết lập cấu trúc `Warehouse -> Zone -> Rack -> Bin` (`/locations`), quản lý danh mục SKU (`/wms/products`).
  - Lập đợt lấy hàng `WavePicking`, điều phối `Task` nhập/xuất/chuyển kho, duyệt kết quả kiểm kê chu kỳ (`/inventory/cycle-count`) và theo dõi cảnh báo thiếu tồn (`/inventory/stock-alerts`).
  - Dùng gợi ý Putaway (`POST /api/v1/inventory/putaway-suggestion`) dựa trên tỷ lệ lấp đầy chuẩn hóa trọng lượng + thể tích.
- **Nhân viên kho / Đóng gói (`WAREHOUSE_STAFF`)**:
  - Mở ca & mượn thiết bị PDA/cân qua `warehouse-ops` (tự động gắn `staffId` từ JWT).
  - Tại `pack-station-web` (`/pack`): Chọn đơn hàng từ hàng chờ, dùng đầu đọc barcode Web Serial / nhập tay mã SKU; camera MobileNet chỉ đưa gợi ý ImageNet tham khảo (ngưỡng `>= 60%`) — nhân viên **phải quét/xác nhận đúng SKU** trước khi bấm niêm phong (`seal`) hoặc ghi đính chính (`correction`).

### 3.4. `LOGISTICS_MANAGER` — Điều phối Vận tải & Tài chính Chuyến (`tenant-portal`)
- **Tác vụ chính**:
  - Quản lý đội xe (`/logistics/vehicles`), lịch bảo trì/nhiên liệu, hồ sơ tài xế (`/drivers`), thiết lập vùng địa danh `Geofence` trên bản đồ (`/logistics/geofences`).
  - Gom đơn chưa gán vào chuyến (`/logistics/dispatch`), chạy tác vụ tối ưu VRP bất đồng bộ (`POST /api/v1/logistics/routing/optimize-async`) và áp dụng kết quả sau khi kiểm tra danh sách đơn chưa gán (`unassigned`).
  - Xử lý cảnh báo khẩn cấp SOS (`/logistics/sos`: `acknowledge` -> `resolve`), duyệt chi phí tài xế (`/logistics/expenses`), duyệt hoàn trả & tạo chuyến thu hồi (`/logistics/returns`) và tải sao kê ngân hàng để đối soát COD (`/finance/cod`).

### 3.5. `DRIVER` — Tài xế Giao nhận (`driver-app` Expo React Native)
- **Tác vụ chính**:
  - Xem danh sách chuyến được phân công (`TripsScreen`), chi tiết điểm dừng (`TripDetailScreen`).
  - Khi đi vào vùng mất sóng: Mọi thao tác check-in, hoàn tất giao, chụp ảnh POD/chữ ký (`PODScreen`), kê khai chi phí (`ExpenseScreen`, kiểm tra số tiền dương hợp lệ), gửi SOS (`SafetyScreen`) tự động xếp vào `OfflineSyncEngine` (`AsyncStorage`) với `X-Sync-Id` duy nhất.
  - Theo dõi ví tiền COD & tạo phiếu quyết toán (`RemittanceScreen`); chỉ ghi nhận nhận/nộp thực tế của tài xế đang đăng nhập.
  - Hệ thống `TelematicsScreen` gửi gói tọa độ theo batch HTTP (hoặc thiết bị IoT gửi qua Go UDP có HMAC).

### 3.6. `CUSTOMER_CLIENT` — Khách hàng Doanh nghiệp B2B (`customer-portal`, 13 trang)
- **Tác vụ chính**:
  - Tự tạo đơn lẻ hoặc tải hàng loạt CSV (`/orders`), hủy đơn hợp lệ (`POST /api/v1/client/orders/:id/cancel`), xem tồn kho ký gửi (`/stock`), tạo yêu cầu hoàn trả RMA (`/returns`), xem và thanh toán từng phần/toàn phần hóa đơn (`/invoices`).
  - Đăng ký webhook nhận sự kiện (`/webhooks`), bị chặn URL nội bộ (SSRF) và luôn ẩn `secretToken` sau khi tạo.
- **Ranh giới bảo mật**: Không truy cập được dữ liệu của client khác trong cùng tenant cũng như mọi endpoint vận hành nội bộ (`/orders`, `/inventory`, `/finance`).

### 3.7. Người nhận cuối / Công khai (Unauthenticated Public Tracking)
- Truy cập `/track/[code]` trên `customer-portal` -> gọi `GET /api/v1/public/track/:trackingCode` (và `/live`, `/sla`).
- API chỉ trả danh sách trường an toàn (mã vận đơn, trạng thái, lịch sử mốc thời gian chung, ETA), lọc bỏ dữ liệu tài chính nhạy cảm (`codAmount`, ghi chú nội bộ) và tọa độ/danh tính cá nhân đầy đủ của người gửi/tài xế khi không cần thiết.
