# Bóc Tách Chi Tiết Kiến Trúc 4 Tầng (BE, FE, API, Data) & Danh Mục Chức Năng Hệ Thống SmartLogi AI SaaS

> [!WARNING]
> **Tài liệu lịch sử (chốt ở mốc thiết kế 06/09/2026 — Không phản ánh cấu trúc mã nguồn hiện tại).**
> Toàn bộ mô tả cũ về Kong Gateway, tách 10 microservice dưới thư mục cũ `services/`, tách `apps/`, Python FastAPI + Google OR-Tools và Driver PWA đã được tái cấu trúc hoặc đính chính. Để xem kiến trúc thực tế (Modular Monolith NestJS `core-api` với **`11` modules**, `api/api-gateway`, Go GPS/Webhook, Cloudflare/Hono `ai-worker`, 4 Next.js 15 portals `91` trang + Expo React Native `driver-app`), vui lòng đọc:
> - Kiến trúc & CSDL thực tế (`104` models / `88` bảng `FORCE RLS`): [architecture-and-erd.md](architecture-and-erd.md)
> - Hợp đồng API hiện hành (`77` files / `488` endpoints): [api-contracts.md](api-contracts.md)
> - Hồ sơ đính chính B3–B4 (cập nhật Gate G7): [ho-so-cap-nhat-B3-B4.md](ho-so-cap-nhat-B3-B4.md)

| Mô tả lịch sử (06/09/2026) | Thực trạng mã nguồn hiện tại |
|---|---|
| `Kong API Gateway` | `api/api-gateway` (NestJS proxy + BFF + `helmet()` + circuit breaker) |
| Nhiều service rời tại thư mục cũ | Hợp nhất vào **`11` module** của `backend/core-api` (`iam`, `wms`, `orders`, `logistics`, `customer`, `notification`, `geography`, `freight`, `yard`, `pricing`, `trade`) |
| Python FastAPI + OR-Tools (`ai-service`) | `workers/ai-worker` (Cloudflare Hono TS): VRP NN + 2-opt & Container Drayage (`haversine_circuity_1.41`), Trade Docs & HS Advisory (`NEEDS_CUSTOMS_REVIEW`), LLM fallback, Z-score |
| `Driver PWA` | `frontend/mobile/driver-app` (Expo ~56 / React Native 0.85, CSPRNG `OfflineSyncEngine`) |
| 5 Next.js Apps dưới thư mục cũ `apps/` | 4 Next.js 15 portals (`91` trang, đã nối Vercel `visionary19`) dưới `frontend/feature-test/admin-portal` & `frontend/reporting/{tenant-portal,customer-portal,pack-station-web}` + 1 Expo mobile app |

---

> **Dự án**: Nền tảng Quản lý Kho bãi & Điều vận Thông minh Đa Khách thuê (SmartLogi AI SaaS WMS/TMS)  
> **Kiến trúc (lịch sử)**: Microservices Hướng Sự Kiện (Event-Driven) + Multi-Tenancy Dynamic Schema + Go Ingestion + Python OR-Tools VRP  
> **Cập nhật ngày**: 06/09/2026

---

## MỤC LỤC
1. [Tổng Quan Kiến Trúc Kỹ Thuật Hệ Thống](#1-tổng-quan-kiến-trúc-kỹ-thuật-hệ-thống)
2. [Bóc Tách Tầng Backend (BE Layer)](#2-bóc-tách-tầng-backend-be-layer)
3. [Bóc Tách Tầng Frontend & Thiết Bị (FE Layer)](#3-bóc-tách-tầng-frontend--thiết-bị-fe-layer)
4. [Bóc Tách Tầng Giao Tiếp API & Event Mesh (API Layer)](#4-bóc-tách-tầng-giao-tiếp-api--event-mesh-api-layer)
5. [Bóc Tách Tầng Dữ Liệu & Multi-Tenancy (Data Layer)](#5-bóc-tách-tầng-dữ-liệu--multi-tenancy-data-layer)
6. [Đặc Tả Chi Tiết Từng Chức Năng Nghiệp Vụ](#6-đặc-tả-chi-tiết-từng-chức-năng-nghiệp-vụ)

---

## 1. Tổng Quan Kiến Trúc Kỹ Thuật Hệ Thống

SmartLogi AI SaaS là nền tảng quản lý chuỗi cung ứng khép kín tích hợp Quản trị Kho hàng (WMS - Warehouse Management System) và Quản trị Điều vận Vận tải (TMS - Transportation Management System):

```
[Khách hàng / Quản lý Kho / Điều phối viên / Tài xế]
                         │
                         ▼
        [Lớp Giao Diện Đa Cổng (5 Next.js Apps)]
(Admin Portal, Tenant Portal, Pack Station Web, Driver PWA)
                         │
                         ▼
             [Kong API Gateway / Ingress]
     (Tenant Header Filter, Rate Limit, SSL Term)
                         │
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
[IAM Service]    [Inventory WMS]     [Logistics TMS]
  (:3001)            (:3002)             (:3003)
     │                   │                   │
     └─────────────┬─────┴─────────────┬─────┘
                   ▼                   ▼
     [Go GPS Ingestion - :8080]  [AI VRP Engine - :5000]
     (Goroutines, WebSocket)     (Google OR-Tools, OSRM)
                   │                   │
                   └─────────┬─────────┘
                             ▼
              [Apache Kafka Event Mesh Cluster]
           (Topics: orders.events, gps.telemetry)
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
[PostgreSQL Multi-Schema] [Redis 7 + Redis GEO]  [MinIO S3 ePOD]
 (Dynamic search_path)     (Geohash, Latency<2ms) (Ảnh giao hàng)
```

---

## 2. Bóc Tách Tầng Backend (BE Layer)

### 2.1. Ngăn Xếp Công Nghệ Đa Ngôn Ngữ (Polyglot Backend)
- **Dịch vụ Lõi Nghiệp vụ**: Node.js 20 LTS, NestJS 10.x, TypeScript 5.4.
- **Dịch vụ Nạp Tọa độ Siêu Tốc**: Go (Golang 1.22), Goroutines xử lý đồng thời 50,000 kết nối GPS Socket, memory footprint cực thấp (<30MB).
- **Động cơ Trí tuệ Nhân tạo**: Python 3.11, Google OR-Tools 9.8, FastAPI, NumPy, SciPy giải bài toán quy hoạch tuyến xe vận tải đa ràng buộc (VRPTW).
- **Thông điệp & Sự kiện**: Apache Kafka 3.6 (Strimzi Operator), Zookeeper, KafkaJS.
- **Bộ đệm & Chỉ mục Địa lý**: Redis 7 Cluster, Redis GEO (`GEOADD`, `GEORADIUS`).

### 2.2. Danh Mục Các Vi Dịch Vụ Độc Lập (`services/`)

| Vi Dịch Vụ | Cổng | Ngôn Ngữ / Framework | Trách Nhiệm & Vai Trò Nghiệp Vụ |
|---|:---:|---|---|
| `api-gateway` | `8000` | Kong / Express Gateway | Định tuyến lưu lượng, xác thực token JWT, trích xuất Header `x-tenant-id` |
| `iam-service` | `3001` | NestJS / TypeScript | Quản lý định danh tổ chức khách thuê (Tenants), người dùng, phân quyền RBAC |
| `inventory-service` | `3002` | NestJS / TypeScript | Quản trị kho (WMS): Quản lý sơ đồ Bin, nhập hàng ASN, Wave picking, kiểm kê |
| `logistics-service` | `3003` | NestJS / TypeScript | Quản trị vận tải (TMS): Quản lý đội xe, lộ trình chuyến xe, điểm dừng, COD |
| `order-service` | `3004` | NestJS / TypeScript | Tiếp nhận đơn hàng, xác thực địa chỉ, chuyển trạng thái vòng đời đơn |
| `customer-api` | `3005` | NestJS / TypeScript | Cổng API dành riêng cho khách hàng tạo đơn và theo dõi vị trí kiện hàng |
| `notification-service` | `3006` | NestJS / TypeScript | Gửi thông báo SMS, Email và Webhook trạng thái giao hàng cho đối tác |
| `webhook-service` | `3007` | NestJS / TypeScript | Bắn sự kiện ra hệ thống ERP ngoại vi (SAP, Odoo, Shopee, TikTok Shop) |
| `gps-ingestion-service`| `8080` | Go (Golang) | Nhận dòng dữ liệu telemetry tọa độ GPS từ xe, nạp vào Kafka và Redis GEO |
| `ai-service` | `5000` | Python / FastAPI | Lõi giải thuật VRP: Tối ưu tuyến giao hàng đa phương tiện thời gian thực |

---

## 3. Bóc Tách Tầng Frontend & Thiết Bị (FE Layer)

Hệ thống cung cấp 5 ứng dụng giao diện chuyên biệt cho từng đối tượng người dùng:

### 3.1. Danh Mục 5 Ứng Dụng Frontend (`apps/`)
1. **`apps/admin-portal`**: Cổng quản trị dành cho Super Admin (theo dõi doanh thu nền tảng, tạo mới tenant, giám sát tài nguyên cụm máy chủ).
2. **`apps/tenant-portal`**: Bảng điều khiển trung tâm của từng công ty logistics:
   - *WMS Module*: Sơ đồ kho 2D/3D trực quan, định vị hàng hóa trên từng ô kệ (Bin), tạo đợt lấy hàng (Wave).
   - *TMS Control Tower*: Bản đồ số thời gian thực (Leaflet / Mapbox), hiển thị vị trí toàn bộ phương tiện đang di chuyển trên đường.
3. **`apps/pack-station-web`**: Màn hình dành riêng cho bàn đóng gói tại kho:
   - Tích hợp trực tiếp với **Cân điện tử qua Web Serial API** (đọc số cân tự động không cần nhập tay).
   - Tích hợp **Máy quét mã vạch laser PDA** (bắt sự kiện quét bàn phím tốc độ cao, xác thực đúng SKU và số lượng).
4. **`apps/driver-app`**: Ứng dụng PWA di động dành cho tài xế:
   - Nhận danh sách đơn hàng trong chuyến xe, chỉ đường qua Google Maps.
   - Chụp ảnh chứng từ giao hàng thành công (e-POD), thu tiền mặt COD.
   - Nút bấm **Kích hoạt Báo động Khẩn cấp SOS** một chạm khi gặp nạn hoặc sự cố xe.
5. **`apps/customer-portal`**: Cổng tra cứu hành trình kiện hàng công khai theo mã vận đơn (`Tracking Code`).

---

## 4. Bóc Tách Tầng Giao Tiếp API & Event Mesh (API Layer)

### 4.1. Ma Trận API Endpoints Phân Hệ WMS & TMS

| Phân Hệ | Method | Endpoint Path | Quyền Hạn (Guards) | Mục Đích Xử Lý & Dữ Liệu |
|---|---|---|---|---|
| **Kho bãi (WMS)** | `POST` | `/api/v1/wms/inbound/asn` | `Roles(WH_STAFF)` | Tạo lệnh nhập kho trước hạn (Advance Shipping Notice) |
| | `POST` | `/api/v1/wms/waves/generate` | `Roles(DISPATCHER)`| Tự động gom đơn hàng và sinh đợt lấy hàng (Wave Picking) |
| | `PATCH`| `/api/v1/wms/bins/:id/lock` | `Roles(WH_MANAGER)`| Khóa ô kệ để kiểm kê hoặc xử lý hàng hỏng |
| | `POST` | `/api/v1/wms/cycle-count` | `Roles(WH_STAFF)` | Gửi số liệu kiểm đếm thực tế đối soát tồn kho |
| **Vận chuyển (TMS)**| `POST` | `/api/v1/tms/vrp/optimize` | `Roles(DISPATCHER)`| Đẩy danh sách đơn và đội xe sang Python AI giải bài toán VRP |
| | `POST` | `/api/v1/tms/trips` | `Roles(DISPATCHER)`| Tạo chuyến xe chính thức từ kết quả tối ưu của AI |
| | `PATCH`| `/api/v1/tms/trips/:id/start`| `Roles(DRIVER)` | Tài xế kích hoạt bắt đầu xuất phát chuyến xe |
| **Đổi trả (RMA)** | `POST` | `/api/v1/returns/rma` | Public / Customer | Tạo yêu cầu hoàn trả đơn hàng kèm hình ảnh lỗi |
| | `POST` | `/api/v1/returns/inspect` | `Roles(QC_STAFF)` | Nhập kết quả giám định (Tái nhập / Phế liệu / Từ chối) |
| **Tài xế & Khẩn cấp**|`POST`| `/api/v1/driver/cod/remit` | `Roles(DRIVER)` | Kê khai tiền mặt COD nộp về quỹ kèm biên lai chuyển khoản |
| | `POST` | `/api/v1/driver/sos` | `Roles(DRIVER)` | Phát tín hiệu SOS khẩn cấp kèm tọa độ GPS và âm thanh cảnh báo |

### 4.2. Lưới Sự Kiện Bất Đồng Bộ Apache Kafka
- `orders.lifecycle`: Phát các sự kiện `OrderCreated`, `InventoryAllocated`, `Packed`, `PickedUp`, `Delivered`.
- `gps.telemetry`: Luồng tọa độ gửi từ Go Ingestion với tần suất 2 giây/bản tin (`driverId`, `lat`, `lng`, `speed`, `heading`, `battery`).
- `alerts.emergency`: Phát sóng sự kiện `SOS_TRIGGERED` đến bảng điều khiển trung tâm trong vòng dưới 100 mili-giây.

---

## 5. Bóc Tách Tầng Dữ Liệu & Multi-Tenancy (Data Layer)

### 5.1. Cơ Chế Cô Lập Đa Khách Thuê (Dynamic Schema Isolation)
Hệ thống áp dụng mô hình **Single Database - Multiple Schemas** trong PostgreSQL 16:
- Mỗi công ty khách thuê (Tenant) được cấp một PostgreSQL Schema vật lý riêng biệt (ví dụ: `tenant_lazada`, `tenant_shopee`, `tenant_ghn`).
- Cấu hình Prisma Client qua kỹ thuật `$extends` tự động chèn lệnh:
  ```sql
  SET search_path TO tenant_xxx, public;
  ```
- **Lợi ích**: Bảo mật tuyệt đối, ngăn chặn triệt để rủi ro rò rỉ dữ liệu chéo giữa các doanh nghiệp đối thủ, đồng thời cho phép backup hoặc khôi phục độc lập từng khách hàng.

### 5.2. Danh Mục Hơn 25 Thực Thể CSDL (`packages/prisma-schemas`)
1. **Phân Hệ Tổ Chức**: `Tenant`, `User`, `Role`, `Warehouse`, `Zone`, `Location`, `Bin`.
2. **Phân Hệ Hàng Hóa & Tồn Kho (WMS)**:
   - `Product`, `SKU`, `InventoryItem`, `LotNumber`, `StockMovement`, `Wave`, `PickingTask`.
3. **Phân Hệ Vận Tải & Phương Tiện (TMS)**:
   - `Order`, `OrderItem`, `Trip`, `RouteLeg`, `StopPoint`, `Vehicle`, `Driver`, `GPSTrack`, `PODRecord`.
4. **Phân Hệ Đổi Trả & Tài Chính Hiện Trường**:
   - `RmaRequest`: Quản lý hồ sơ đổi trả hàng từ khách.
   - `ReturnInspection`: Biên bản giám định chất lượng hàng trả về.
   - `CodTransaction`: Giao dịch thu và nộp tiền mặt COD của tài xế.
   - `DriverExpense`: Các chi phí phát sinh (xăng xe, vé cầu đường BOT, phí bến bãi).
   - `SosAlert`: Bản ghi sự cố khẩn cấp (tọa độ, thời gian, trạng thái xử lý).

---

## 6. Đặc Tả Chi Tiết Từng Chức Năng Nghiệp Vụ

### Chức Năng 1: Tối Ưu Hóa Tuyến Đường Giao Hàng AI VRP
- **Tác nhân**: Điều phối viên vận tải (Dispatcher).
- **Luồng hoạt động qua 4 tầng**:
  1. *FE*: Điều phối viên chọn 120 đơn hàng cần giao trong buổi chiều và 6 xe tải có sẵn trên giao diện TMS.
  2. *API*: Gọi `POST /api/v1/tms/vrp/optimize`.
  3. *BE (NestJS)*: Trích xuất tọa độ các điểm giao, gửi yêu cầu sang `Python AI Service` (:5000).
  4. *AI Service*:
     - Gọi OSRM trích xuất ma trận khoảng cách và thời gian di chuyển 121x121 điểm.
     - Khởi tạo mô hình định tuyến `pywrapcp.RoutingModel` của Google OR-Tools.
     - Thiết lập ràng buộc: Tải trọng tối đa mỗi xe (không vượt quá 1.5 tấn), khung giờ giao hàng của từng khách hàng (Time Windows).
     - Thuật toán Guided Local Search chạy trong 8 giây, tìm ra giải pháp tối ưu giảm 23% tổng quãng đường di chuyển.
  5. *Data*: Lưu các lộ trình dự kiến vào bảng `Trip` và `StopPoint`.
  6. *FE hiển thị*: Bản đồ Leaflet vẽ 6 tuyến đường có màu sắc khác nhau, hiển thị thứ tự giao hàng tối ưu cho từng xe.

### Chức Năng 2: Đóng Gói Tự Động Kết Hợp Cân Điện Tử Web Serial
- **Tác nhân**: Nhân viên đóng gói tại kho (Packer).
- **Luồng hoạt động qua 4 tầng**:
  1. *Thiết bị ngoại vi*: Cân bàn điện tử kết nối cổng COM/USB của máy tính đóng gói.
  2. *FE (`pack-station-web`)*: Nhân viên mở trình duyệt, cấp quyền Web Serial API (`navigator.serial.requestPort`). Hook `useWebSerialScale` liên tục lắng nghe luồng dữ liệu byte RS-232, tự động giải mã ra trọng lượng thực tế (ví dụ: `1.45 kg`).
  3. *Thao tác quét*: Nhân viên quét mã vận đơn bằng máy quét laser.
  4. *API*: Gửi `POST /api/v1/wms/orders/:id/pack` kèm `{ actualWeight: 1.45 }`.
  5. *BE*: `InventoryService` đối chiếu:
     - Tính tổng trọng lượng lý thuyết của các sản phẩm trong đơn (1.42 kg).
     - Kiểm tra sai số: $\Delta = |1.45 - 1.42| = 0.03\text{ kg} \le 2\%$ (nằm trong ngưỡng dung sai cho phép).
     - Cập nhật trạng thái đơn thành `PACKED` và kích hoạt lệnh in tem vận chuyển mã vạch tự động.
  6. *Data*: Ghi nhận trọng lượng thực tế và lịch sử đóng gói vào bảng `Order`.

### Chức Năng 3: Giám Định Hàng Đổi Trả Khách Hàng (RMA Reverse Logistics)
- **Tác nhân**: Khách hàng (yêu cầu trả) và Nhân viên QC Kho (giám định).
- **Luồng hoạt động qua 4 tầng**:
  1. *FE*: Khách hàng tạo phiếu đổi trả trên ứng dụng vì hàng bị vỡ nắp hộp.
  2. *API*: Gửi `POST /api/v1/returns/rma`.
  3. *BE*: Chuyển trạng thái đơn sang `RMA_REQUESTED`, sinh mã vận đơn thu hồi cho shipper.
  4. *Tại kho*: Khi hàng về, nhân viên QC mở `/wms/returns`, quét mã kiện hàng và kiểm tra ngoại quan.
  5. *Quyết định phân loại*:
     - Nếu còn nguyên seal $\rightarrow$ Tái nhập ô kệ khả dụng (`RESTOCKED`).
     - Nếu lỗi nhà sản xuất $\rightarrow$ Chuyển khu vực bảo hành nhà cung cấp.
     - Nếu vỡ hỏng hoàn toàn $\rightarrow$ Xuất bản ghi phế liệu tiêu hủy (`SCRAPPED`).
  6. *Data*: Cập nhật bảng `ReturnInspection` và điều chỉnh lại số lượng tồn kho tự động.

### Chức Năng 4: Tiếp Nhận & Phản Ứng Khẩn Cấp Báo Động SOS Tài Xế
- **Tác nhân**: Tài xế ngoài hiện trường và Điều phối viên tại trung tâm điều hành.
- **Luồng hoạt động qua 4 tầng**:
  1. *FE Mobile*: Xe tải gặp sự cố hỏng phanh trên đèo, tài xế nhấn giữ nút SOS 3 giây trên `driver-app`.
  2. *API*: Thiết bị gửi gói tin khẩn cấp `POST /api/v1/driver/sos` qua mạng 4G chứa `{ tripId, lat, lng, speed, battery: 45% }`.
  3. *BE (Go Ingestion & NestJS)*:
     - Ghi nhận bản ghi `SosAlert` với trạng thái `CRITICAL`.
     - Đẩy ngay lập tức vào Kafka topic `alerts.emergency`.
  4. *Notification Push*:
     - Server bắn tín hiệu WebSocket khẩn cấp tới toàn bộ màn hình điều phối TMS.
  5. *FE Control Tower*: Màn hình trung tâm phát chuông báo động âm lượng lớn, tự động phóng to bản đồ đến vị trí xe gặp sự cố, nhấp nháy đèn đỏ và hiển thị danh sách các xe gần nhất để điều động hỗ trợ.

---
*Tài liệu được biên soạn và bảo chứng bởi Ban Kiến Trúc Kỹ Thuật Dự Án SmartLogi AI SaaS.*
