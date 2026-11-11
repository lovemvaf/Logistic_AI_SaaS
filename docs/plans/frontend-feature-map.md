# Bản đồ tính năng frontend — đối chiếu báo cáo SmartLogi

> Cập nhật: 2026-11-10
> Nguồn yêu cầu: báo cáo SmartLogi (37 trang) + `docs/plans/design-refresh-no-icons.md`
> Nguyên tắc: frontend đi trước, dữ liệu mock mặc định, backend Rust thay thế sau.

## 1. Trạng thái tổng

| Hạng mục | Hiện tại | Đích của đợt này |
|---|---|---|
| Dữ liệu | Phần lớn page gọi `/api/v1` thật | `@/lib/data` + mock localStorage, đổi bằng 1 biến môi trường |
| Giao diện | 4 shell + dashboard đã editorial, page con còn kiểu SaaS cũ | Toàn bộ page chính theo ngôn ngữ editorial |
| Auth demo | Phải có backend | Đăng nhập mock theo vai trò, giữ nguyên luồng API thật |
| Backend | NestJS modular monolith + 2 Go service | Giữ nguyên, thêm workspace Rust song song |
| Deploy | Admin portal đã cấu hình Vercel | Giữ admin portal là site deploy chính, các portal còn lại deploy độc lập |

## 2. Đối chiếu yêu cầu báo cáo

| Yêu cầu trong báo cáo | Nơi thể hiện trên UI | Trạng thái code | Agent |
|---|---|---|---|
| WMS FIFO / LIFO / FEFO | `/wms/waves`, `/inventory` | Engine có trong `packages/wms-engine`; UI chưa chọn chiến lược khi gom wave | A2 |
| Putaway theo sức chứa bin | `/wms` (tab cất hàng) | Chưa có màn hình; mock đã có `putawaySuggestion()` | A2 |
| Optimistic locking khi trừ tồn | `/inventory`, `/inventory/adjustments` | API có `version`; UI chưa hiển thị xung đột phiên bản | A2 |
| Wave picking + pick task | `/wms/waves`, `/wms/tasks` | Có trang, còn gọi API trực tiếp, chưa thao tác trên mock | A2 |
| Kiểm kê chu kỳ | `/inventory/cycle-count` | Có trang; chưa có luồng đếm → duyệt trên mock | A2 |
| Trạm đóng gói Edge AI | `pack-station-web/pack` | Có TensorFlow/MobileNet; chưa nối dữ liệu mock, chưa editorial | A6 |
| Human-in-the-loop đính chính SKU | `pack-station-web/pack` | Log đính chính có, chưa lưu phiên | A6 |
| Geocoding + bản đồ Leaflet | `/logistics/dispatch` | Có Leaflet, dữ liệu API thật | A3 |
| VRP / tối ưu lộ trình | `/logistics/dispatch` | Có nút tối ưu gọi AI worker; mock chưa mô phỏng kết quả | A3 |
| GPS realtime + geofence | `/logistics/geofences`, `/logistics/dispatch` | Có trang geofence; chưa có bản đồ realtime trên mock | A3 |
| SOS khẩn cấp | `/logistics/sos` | Có trang; chưa xử lý tiếp nhận/đóng trên mock | A3 |
| RMA / trả hàng + kiểm định | `/logistics/returns` | Có trang; chưa có luồng kiểm định | A3 |
| COD remittance + đối soát sao kê | `/finance/cod` | Có trang; chưa có đối soát trên mock | A4 |
| AI dự báo nhu cầu / ETA / anomaly / churn | `/admin/ai-insights` | Có trang; dữ liệu API thật | A4 |
| RBAC 7 vai trò | `/roles`, `/users`, `/settings` | Có trang; mock chưa phản ánh quyền | A4 |
| API key + scopes + rotation | `/admin/api-keys` | Có trang; chưa phát/thu hồi trên mock | A4 |
| Audit log | `/admin/audit-logs` | Có trang; chưa nối mock | A4 |
| Multi-tenant (tenant admin) | `admin-portal` | Có mock local-store, UI cũ | A5 |
| Bảng điều phối đa tenant | `admin-portal/admin` | Có dashboard, tenants, billing | A5 |
| Customer self-service | `customer-portal` | Có trang, UI cũ, API thật | A6 |
| Driver app offline sync | `mobile/driver-app` | Có engine offline; chưa nối mock | A3 |
| Hợp đồng API thống nhất | `/api/v1` | NestJS có; chưa có Rust | A7 |

## 3. Bản đồ route → agent → trạng thái

### Tenant portal (`frontend/reporting/tenant-portal`)

| Route | Mục đích | Hiện tại | Agent |
|---|---|---|---|
| `/login` | Đăng nhập, chọn vai trò demo | ✅ editorial + mock auth | A1 |
| `/dashboard` | Tổng quan theo vai trò | ✅ editorial + mock | A1 |
| `/notifications` | Hộp thông báo vận hành | ✅ mới, mock | A1 |
| `/orders` | Danh sách, tạo, huỷ, theo dõi đơn | API, UI cũ | A2 |
| `/orders/[trackingCode]` | Chi tiết đơn + timeline + chuyến | ❌ chưa có | A2 |
| `/inventory` | Tồn kho, nhập, chuyển vị trí, điều chỉnh | API, UI cũ | A2 |
| `/inventory/adjustments` | Lịch sử điều chỉnh | API, UI cũ | A2 |
| `/inventory/cycle-count` | Kiểm kê chu kỳ | API, UI cũ | A2 |
| `/wms` | Tổng quan WMS | 5 dòng, rỗng | A2 |
| `/wms/products` | Danh mục SKU | API, UI cũ | A2 |
| `/wms/waves` | Gom wave + chọn FIFO/LIFO/FEFO | API, UI cũ | A2 |
| `/wms/tasks` | Tác vụ soạn hàng | API, UI cũ | A2 |
| `/wms/packing` | Bàn giao sang trạm đóng gói | API, UI cũ | A2 |
| `/wms/equipment` | Thiết bị kho | API, UI cũ | A2 |
| `/warehouses` | Danh sách kho, sức chứa | API, UI cũ | A3 |
| `/warehouses/[id]` | Sơ đồ bin, tỷ lệ lấp đầy | API, UI cũ | A3 |
| `/logistics/dispatch` | Dispatch tower, bản đồ, gán chuyến | API, UI cũ | A3 |
| `/logistics/vehicles` | Đội xe, bảo trì, bảo hiểm | API, UI cũ | A3 |
| `/logistics/geofences` | Vùng an toàn / cấm | API, UI cũ | A3 |
| `/logistics/sos` | Cảnh báo SOS | API, UI cũ | A3 |
| `/logistics/returns` | RMA, kiểm định, hoàn tiền | API, UI cũ | A3 |
| `/logistics/expenses` | Chi phí chuyến, duyệt chi | API, UI cũ | A3 |
| `/logistics/reports` | Hiệu suất giao, chi phí/km | API, UI cũ | A3 |
| `/logistics/trips/[id]/pod` | Chi tiết POD của chuyến (ảnh/ký electronic) | ❌ mới | A2 |
| `/drivers` | Danh sách tài xế | ApiService cũ | A3 |
| `/drivers/[id]/ranking` | Xếp hạng tháng của tài xế | ❌ mới | A2 |
| `/drivers/[id]/trip-log` | Lịch hoạt động: check-in/out, đến/không giao, dừng, phạt/thưởng | ❌ mới | A2 |
| `/logistics/vehicles` | Đội xe, bảo trì, bảo hiểm | API, UI cũ | A3 |
| `/logistics/vehicles/[id]/fuel` | Lịch đổ xăng, ghi nhận nhiên liệu mới | ❌ mới | A2 |
| `/logistics/vehicles/[id]/maintenance` | Lịch bảo trì, ghi nhận bảo trì mới | ❌ mới | A2 |
| `/finance/reports` | Báo cáo doanh nghiệp (summary, on-time, chi phí, phương tiện) | ❌ mới | A3 |
| `/drivers/my-trips` | Chuyến của tôi (vai trò tài xế) | API, UI cũ | A3 |
| `/finance/cod` | Nộp và đối soát COD | API, UI cũ | A4 |
| `/admin/billing` | Hoá đơn, công nợ | API, UI cũ | A4 |
| `/admin/clients` | Khách hàng B2B | API, UI cũ | A4 |
| `/admin/ai-insights` | Khuyến nghị AI | API, UI cũ | A4 |
| `/admin/api-keys` | Khoá API | API, UI cũ | A4 |
| `/admin/audit-logs` | Nhật ký thao tác | API, UI cũ | A4 |
| `/users` | Người dùng tenant | API, UI cũ | A4 |
| `/roles` | Vai trò và quyền | API, UI cũ | A4 |
| `/settings` | Cấu hình tenant | API, UI cũ | A4 |
| `/branches` | Chi nhánh | API, UI cũ | A4 |

### Admin portal (`frontend/feature-test/admin-portal`)

| Route | Mục đích | Hiện tại | Agent |
|---|---|---|---|
| `/admin/dashboard` | MRR, tenant, tăng trưởng | Mock + API, UI cũ | A5 |
| `/admin/tenants`, `/admin/tenants/[id]` | Quản lý tenant, gói dịch vụ | Mock + API | A5 |
| `/admin/orders`, `/admin/orders/new`, `/admin/orders/upload` | Đơn toàn hệ thống | Mock + API | A5 |
| `/admin/shipments` | Vận đơn toàn hệ thống | Mock + API | A5 |
| `/admin/billing` | Doanh thu, hoá đơn tenant | Mock + API | A5 |
| `/admin/ai-models` | Phiên bản mô hình AI | Mock + API | A5 |
| `/admin/audit-logs` | Audit toàn hệ thống | Mock + API | A5 |

### Customer portal (`frontend/reporting/customer-portal`)

| Route | Mục đích | Hiện tại | Agent |
|---|---|---|---|
| `/client/dashboard` | Tổng quan khách hàng | API, UI cũ | A6 |
| `/client/orders`, `/client/orders/upload` | Tạo và theo dõi đơn | API, UI cũ | A6 |
| `/client/inventory` | Tồn kho ký gửi | API, UI cũ | A6 |
| `/client/invoices` | Hoá đơn | API, UI cũ | A6 |
| `/client/returns` | Yêu cầu trả hàng | API, UI cũ | A6 |
| `/client/webhooks` | Webhook nhận sự kiện | API, UI cũ | A6 |
| `/track/[code]` | Tra cứu công khai | API, UI cũ | A6 |

### Pack Station (`frontend/reporting/pack-station-web`)

| Route | Mục đích | Hiện tại | Agent |
|---|---|---|---|
| `/pack` | Quét, AI nhận diện, đóng kiện | TensorFlow có, UI cũ | A6 |
| `/pack/logs` | Lịch sử đóng gói, đính chính | API, UI cũ | A6 |

## 4. Hợp đồng dùng chung (đã dựng)

```
tenant-portal/src/lib/
├── data.ts              # chọn mock | api, export `data`
├── mock/
│   ├── types.ts         # toàn bộ kiểu domain (order, trip, vehicle, driver,
│   │                    # report, pod, fuel, maintenance, driver_activity,
│   │                    # customer, notification_event, order_partial)
│   ├── seed.ts          # dữ liệu Việt Nam, tất định
│   ├── store.ts         # repository + nghiệp vụ + localStorage
│   ├── repository.ts    # adapter REST cùng method surface
│   └── index.ts
├── mock-auth.ts         # đăng nhập demo theo vai trò
├── auth.ts              # session thật (giữ nguyên)
├── auth-context.tsx
└── api.ts               # axios cho chế độ api
```

Quy ước gọi dữ liệu trong page:

```ts
import { data } from '@/lib/data';

const rows = await data.orders.list();
const wave = await data.waves.allocate({ warehouseId, orderIds, strategy: 'FEFO' });
```

Không import `seed`, không `fetch`/`axios` trực tiếp trong page mới, không tự khai báo lại
kiểu đã có trong `types.ts`.

## 5. Việc còn thiếu phải bổ sung trong đợt này

1. Chuyển toàn bộ page tenant sang `@/lib/data` + editorial.
2. Thêm `/orders/[trackingCode]`, tab putaway trong `/wms`, sơ đồ bin trong `/warehouses/[id]`,
   POD chuyến `/logistics/trips/[id]/pod`, xếp hạng tài xế, log nhiên liệu/bảo trì xe,
   `/finance/reports`.
3. Nối pack station với phiên đóng gói mock và kết quả AI.
4. Đối soát COD hai chiều: phiếu nộp ↔ giao dịch ngân hàng, có trạng thái lệch.
5. Phân quyền hiển thị theo vai trò demo (ẩn menu và chặn thao tác không có quyền).
6. Cấu hình deploy Vercel cho từng portal (root directory + build command).
7. Workspace Rust song song, route trùng `/api/v1`.
8. Mock phải có đủ dữ liệu cho: POD, báo cáo, xếp hạng tài xế, nhiên liệu/bảo trì xe,
   khách B2B, đơn phân chia, thông báo đa kênh — đã bổ sung lần này.
