# Danh mục 32 Kịch bản Mô phỏng Demo (`SCENARIO_CATALOG`)

Toàn bộ **32 kịch bản nghiệp vụ** được khai báo tập trung trong [`packages/demo-cloud-api/src/scenarios.ts`](../../packages/demo-cloud-api/src/scenarios.ts) (`SCENARIO_CATALOG`) và phục vụ đồng nhất qua `GET /api/v1/demo/scenarios`, `POST /api/v1/demo/scenarios/load` trên giao diện **Demo Control Center** của cả 4 portal.

---

## 1. Nhóm Vận hành & Điều phối (`OPERATIONS` — 8 kịch bản)

| Mã kịch bản | Mức độ | Cổng & Trang đích | Kết quả mong đợi & Hệ thống mô phỏng |
|---|---|---|---|
| `NORMAL_DAY` | `INFO` | `tenant` `/dashboard` | Trạng thái cân bằng 230+ đơn hàng trên các trục Đồng Nai – Cát Lái – Cái Mép (`GPS Telemetry Feed`, `Terminal Queue Feed`). |
| `PEAK_SURGE` | `WARNING` | `tenant` `/orders` | Ghi trực tiếp **5 đơn `SLG-SURGE-*` trạng thái `PENDING`** vào Neon DB phục vụ xếp wave & VRP (`Order Surge Generator`). |
| `SLA_BREACH` | `CRITICAL` | `tenant` `/dashboard` | Kích hoạt cờ cảnh báo đơn giao chậm vượt ngưỡng >2 giờ trên Control Tower (`SLA Watchdog`). |
| `CARRIER_DELAY` | `WARNING` | `tenant` `/freight` | Mô phỏng hãng tàu trễ ETD 48 giờ tại Cái Mép để điều phối cập nhật kế hoạch hạ container (`Carrier AIS Feed (Simulated)`). |
| `CONGESTION_CAT_LAI` | `CRITICAL` | `admin` `/admin/geography` | Tạo bản ghi `TerminalQueueObservation` nhãn `SYNTHETIC_DEMO` (`waitMinutes=148`, `queueLength=78`, `isOfficialTelemetry=false`) tại Cảng Cát Lái, gợi ý chuyển hướng sang Cảng Phước An. |
| `DRIVER_OFFLINE_SYNC` | `WARNING` | `tenant` `/driver-sim` | Mô phỏng tài xế mất sóng 4G cầu Nhơn Trạch, tích lũy gói offline và đồng bộ có `X-Sync-Id` idempotency (`Driver Offline Queue`). |
| `VEHICLE_BREAKDOWN` | `CRITICAL` | `tenant` `/logistics/vehicles` | Cảnh báo đầu kéo gặp sự cố trên QL51 và hỗ trợ điều chuyển đầu kéo dự phòng (`Fleet OBD-II Telemetry`). |
| `SOS_EMERGENCY` | `CRITICAL` | `tenant` `/driver-sim` | Tạo bản ghi `SosAlert` trạng thái `ACTIVE` thật tại tọa độ KCN Amata trong PostgreSQL (`Driver SOS Beacon`). |

---

## 2. Nhóm Giao nhận, COD & Tài chính (`DELIVERY_FINANCE` — 6 kịch bản)

| Mã kịch bản | Mức độ | Cổng & Trang đích | Kết quả mong đợi & Hệ thống mô phỏng |
|---|---|---|---|
| `POD_DISPUTED` | `WARNING` | `customer` `/client/returns` | Sinh yêu cầu hoàn trả/khiếu nại `RMA-SIM-*` cho đơn `DELIVERED` tại Long Bình (`ePOD Signature Canvas`). |
| `PARTIAL_DELIVERY` | `INFO` | `tenant` `/orders` | Kịch bản giao 70% kiện hàng với lý do tiếp nhận ca sáng tại kho khách (`Driver Partial Delivery Flow`). |
| `COD_MISMATCH` | `WARNING` | `tenant` `/finance/cod` | Làm nổi bật phiếu nộp COD có chênh lệch 250.000 VND chờ kế toán đối soát (`COD Remittance Checker`). |
| `BANK_RECONCILE` | `INFO` | `tenant` `/finance/cod` | Chuẩn bị các mã nộp quỹ `REM-20261101/02/03` khớp sao kê CSV mẫu kèm 1 dòng không khớp (`Simulated Bank Statement CSV Feed`). |
| `DEM_DET_OVERDUE` | `CRITICAL` | `tenant` `/freight` | Container `40HC` vượt quá 5 ngày miễn lưu bãi kích hoạt công thức phụ phí bậc thang (`DEM/DET Escalation Engine`). |
| `INVOICE_DISPUTED` | `WARNING` | `customer` `/client/freight` | Mở quy trình tranh chấp hóa đơn `DisputeCase` từ cổng Khách hàng B2B (`B2B Dispute Resolution`). |

---

## 3. Nhóm Container, Bãi EIR & Xuất Nhập Khẩu (`CONTAINER_YARD_TRADE` — 7 kịch bản)

| Mã kịch bản | Mức độ | Cổng & Trang đích | Kết quả mong đợi & Hệ thống mô phỏng |
|---|---|---|---|
| `CONTAINER_CONFLICT_409` | `NEGATIVE_TEST` | `tenant` `/freight` | Thao tác phân công đầu kéo đang bận trả chuẩn `HTTP 409 Conflict` (`Equipment Overlap Guard`). |
| `YARDFULL_REEFER` | `WARNING` | `tenant` `/yard` | Mô phỏng các slot cắm điện lạnh tại ICD Long Bình đạt ngưỡng >85% công suất (`Reefer Plug Telemetry`). |
| `GATE_IN_DAMAGED_EIR` | `WARNING` | `tenant` `/yard` | Tạo `ContainerGateEvent` + biên bản `EquipmentInterchangeReceipt` ghi nhận móp vách container (`Gate OCR & EIR Simulator`). |
| `TRADE_MISMATCH` | `WARNING` | `tenant` `/trade` | Đối chiếu Commercial Invoice (`21,200 kg`) vs Packing List (`20,950 kg`) trả trạng thái `MISMATCH_FOUND` (`Document Cross-Check Engine`). |
| `PASSWORD_PDF_422` | `NEGATIVE_TEST` | `tenant` `/trade` | Nạp tệp PDF đặt mật khẩu trả đúng HTTP `422 FAILED_PASSWORD_PROTECTED` (`Document PDF Parser`). |
| `CUSTOMS_RED_CHANNEL` | `CRITICAL` | `tenant` `/trade` | Sinh tờ khai `RED-*` phân luồng ĐỎ trạng thái `HOLD` + sự kiện `CustomsStatusEvent` (`Simulated VNACCS Customs Gateway`). |
| `HS_REVIEW_GATE` | `NEGATIVE_TEST` | `tenant` `/trade` | Chặn submit tờ khai chưa duyệt mã HS (`hsReviewRequired=true`) với HTTP `409/422` tới khi chuyên viên phê duyệt (`HS Advisory Rule Engine`). |

---

## 4. Nhóm Kho bãi WMS & Trạm Đóng gói (`WMS_PACK` — 6 kịch bản)

| Mã kịch bản | Mức độ | Cổng & Trang đích | Kết quả mong đợi & Hệ thống mô phỏng |
|---|---|---|---|
| `PACK_MISMATCH` | `NEGATIVE_TEST` | `pack` `/pack` | Quét sai mã SKU báo `MISMATCH` ("Khác biệt") và yêu cầu mở modal `CorrectionLog` (`Virtual Barcode Scanner`). |
| `PACK_WEIGHT_OVER` | `WARNING` | `pack` `/pack` | Cân điện tử ảo ghi nhận sai lệch >15% chuẩn SKU, cảnh báo trước khi đóng kiện (`Virtual Digital Scale`). |
| `CAMERA_LOW_CONFIDENCE` | `WARNING` | `pack` `/pack` | Camera CV trả độ tin cậy `< 0.6` (`52%`), bắt buộc nhân viên xác nhận barcode thủ công (`Virtual MobileNet V2 Camera`). |
| `WMS_STOCKOUT` | `CRITICAL` | `tenant` `/inventory` | Theo dõi SKU cạn tồn khả dụng hoặc lô FEFO sắp hết hạn <10 ngày (`WMS Stock Watchdog`). |
| `WAVE_PICKING` | `INFO` | `tenant` `/wms/waves` | Ghi bản ghi `WavePicking` `WAVE-SIM-*` gom 6 đơn / 18 kiện vào Neon DB (`WMS Wave Allocator`). |
| `CYCLE_COUNT_VARIANCE` | `WARNING` | `tenant` `/inventory/cycle-count` | Tạo phiếu `CycleCount` trạng thái `PENDING` chờ Quản lý kho phê duyệt điều chỉnh tồn (`Cycle Count Workflow`). |

---

## 5. Nhóm Địa giới Đồng Nai 2026, Bảo mật & Nền tảng (`GEO_SECURITY` — 5 kịch bản)

| Mã kịch bản | Mức độ | Cổng & Trang đích | Kết quả mong đợi & Hệ thống mô phỏng |
|---|---|---|---|
| `GEO_UNVERIFIED` | `INFO` | `admin` `/admin/geography` | Xác nhận 95 ĐVHC TP Đồng Nai 2026 giữ trung thực `PENDING_OFFICIAL_CODE` và `NO_OFFICIAL_POLYGON` (`Dong Nai 2026 Geo Registry`). |
| `GEO_RESTRICTED_TRUCK` | `WARNING` | `admin` `/admin/geography` | Hiển thị quy tắc cấm tải 32T/25T theo hành lang `NORTH` / `CENTRAL` / `SOUTH` (`Road Restriction Compliance`). |
| `TENANT_SUSPENDED_403` | `NEGATIVE_TEST` | `tenant` `/login` | Đăng nhập hoặc gọi API dưới `demo-suspended` bị từ chối tức thì HTTP `403 TENANT_SUSPENDED` (`Tenant Status Gate`). |
| `PUBLIC_GRANT_PRIVACY` | `INFO` | `customer` `/client/freight` | Token chia sẻ `STATUS_ONLY` ẩn địa chỉ/tọa độ/SĐT/COD; thu hồi grant trả `410 Gone` (`Privacy Projection Guard`). |
| `OUTBOX_DEAD_LETTER` | `CRITICAL` | `admin` `/admin/geography` | Tạo thêm bản ghi `OutboxEvent` trạng thái `DEAD_LETTER` phục vụ Admin thao tác Redrive (`Simulated Webhook Receiver`). |
