# Hồ sơ Đính chính & Đồng bộ Bản 3 – Bản 4 (B3–B4 Patch Dossier)

> **Phiên bản tài liệu**: `B3-B4-PATCH-2026.11.11`  
> **Mốc mã nguồn đối chiếu**: Baseline commit `775ba1ce181191054397cb62bb7430530ce33f81` + các đợt gia cố `G0–G5` (mã nguồn đã **PASSED 6/6 CI jobs** ở commit `75cf1ea`, GitHub Actions Run [`43023689371`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43023689371))  
> **Nguyên tắc pháp lý & học thuật (`B3-07`)**: Hồ sơ Bản 3 đã ký ngày **`22/06/2026`** được giữ nguyên bất biến làm tài liệu lịch sử. Tài liệu này cung cấp bản sửa đổi/thay thế theo từng mục cho Bản 3 (`B3-01..B3-07`), Bản 4 (`B4-COVER`, `B4-CH01..B4-CH21`), 23 Hình (`FIG-01..FIG-23`), 11 Bảng (`TBL-01..TBL-11`) và 9+ Tài liệu tham khảo (`REF-01..REF-09`). Mọi số liệu hiệu quả kinh doanh hay độ chính xác chưa chạy thực địa đều gắn nhãn `[GIẢ ĐỊNH — CHƯA ĐO PILOT]`. Mọi kiểm thử runtime CI đã chạy PASSED ở cấp unit/typecheck/RLS, đồng thời phân tách rạch ròi với kiểm thử staging đa container & thực địa Pilot.

---

## Phần I. Đồng bộ Từng mục của Bản 3 (`B3-01` – `B3-07`)

### `B3-01` — Tên giải pháp & Phiên bản
- **Trước đây**: Dùng xen kẽ *"SmartLogi Adaptive Intelligence"* (B3) và *"SmartLogi AI SaaS"* (B4).
- **Nội dung thay thế**: Tên chính thức thống nhất là **SmartLogi AI SaaS** (tên đầy đủ mô tả nghiệp vụ: *Nền tảng Quản trị Kho bãi và Điều vận Thông minh Đa Khách thuê SmartLogi AI SaaS*). Tên viết tắt thương mại: **SmartLogi**. Phiên bản hồ sơ cập nhật: `v2.0-patch (11/11/2026)`.

### `B3-02` — Giải pháp đã biết & Căn cứ đối chiếu
- **Trước đây**: Nêu 6 nhận định tổng quát về phân mảnh phần mềm, thiếu AI/multi-tenancy mà không dẫn nguồn sản phẩm cụ thể.
- **Nội dung thay thế**: Sáu thách thức phổ biến của doanh nghiệp logistics SME tại Việt Nam được minh họa qua ma trận đối chứng 6 nhóm sản phẩm có ngày truy xuất rõ ràng trong **Bảng 6 (`TBL-06`)** bên dưới (ERP toàn phần như SAP S/4HANA/Odoo, phần mềm bán hàng/WMS phổ thông như KiotViet/Nhanh.vn, và hệ thống tối ưu vận tải chuyên biệt như Abivin vRoute). Không khái quát rằng mọi đối thủ trên thị trường đều thiếu AI hoặc kiến trúc đa khách thuê.

### `B3-03` — Sáu mục tiêu phân tách KPI Mục tiêu vs Thực trạng Mã nguồn
| Mục tiêu | Diễn đạt thay thế (Thu hẹp "toàn bộ quy trình") | Công thức KPI & Mục tiêu Pilot `[CHƯA ĐO PILOT]` | Trạng thái mã nguồn hiện tại |
|---|---|---|---|
| **1. Tự động hóa luồng lõi WMS–TMS–COD** | Chuẩn hóa trên một nền tảng các luồng nhập/xuất kho, đóng gói, lập chuyến, ePOD và đối soát sao kê COD | Thời gian lập chuyến + đối soát sao kê | Đã có API/UI tại `core-api` và 4 web portal; unit/typecheck/RLS **PASSED** trong CI Run `43023689371`; E2E liên container chờ môi trường staging |
| **2. Giảm sai sót đóng gói** | Hỗ trợ xác nhận hàng hóa bằng Web Serial Barcode + gợi ý MobileNet ImageNet + bước xác nhận người vận hành | Tỷ lệ sai lệch đóng gói mục tiêu **< 0,5%** (tách lỗi phát hiện tại trạm vs lỗi lọt ra khách) | `implemented` cơ chế quét barcode + `classify()` cổng `0.60` + log đính chính |
| **3. Tối ưu hóa lộ trình giao hàng** | Gom đơn và sắp thứ tự dừng tự động theo tải trọng & khoảng cách ước lượng | Giảm tối thiểu **15%** quãng đường/xe/ngày trên cùng tập đơn và địa bàn đối chứng | Heuristic TS Nearest-Neighbor + 2-opt (`haversine_circuity_1.41`); chưa tích hợp OR-Tools/giao thông thực |
| **4. Dự báo & Cảnh báo vận hành** | Cung cấp gợi ý bất thường đơn/vận hành và dự báo hỗ trợ ra quyết định | MAE/RMSE trên chuỗi thời gian thực tế (`[CHƯA ĐO]`) | LLM Cloudflare Workers AI / OpenAI + công thức tất định fallback + Z-score; trả rõ `evaluation_status: "unmeasured"` |
| **5. Kiến trúc SaaS Đa khách thuê** | Cô lập dữ liệu chặt chẽ giữa nhiều doanh nghiệp thuê chung hạ tầng | `0` ca rò rỉ đọc/ghi chéo tenant trong bộ test `tenant-isolation.sql` | ALS + `SET LOCAL search_path` + `app.tenant_id` GUC + `FORCE ROW LEVEL SECURITY` (58 bảng) |
| **6. Vòng phản hồi cải tiến dữ liệu (HITL)** | Ghi nhận đính chính từ con người để phục vụ huấn luyện offline định kỳ *(thay cho "tự học tự động")* | Tỷ lệ bản ghi có nhãn sạch `human_corrected IS NOT NULL` | Xuất dataset qua `GET /api/v1/ai/v1/training-dataset`; `POST /v1/train/:type` trả `501` |

### `B3-04` — Chỉnh sửa Kỹ thuật Mục `4a–4b` (Khớp 100% Mã nguồn Hiện tại)
- **Mục 4a**: Xác định *SmartLogi AI SaaS* là **nền tảng phần mềm quản trị vận hành chuỗi cung ứng (WMS/TMS)**, không phải hệ điều hành theo nghĩa hệ thống; không gọi chức năng quản lý Bin của WMS là "Digital Twin hoàn chỉnh". AI Co-pilot giữ vai trò trợ lý tổng hợp dữ liệu và thu thập phản hồi cho huấn luyện offline.
- **Mục 4b**:
  - *Kiến trúc*: **Modular Monolith** (`backend/core-api`, 6 module) đứng sau `api/api-gateway` (NestJS BFF), kết hợp 2 dịch vụ Go (`gps-ingestion-service`, `webhook-service`) và Cloudflare/Hono `workers/ai-worker`. (Không sử dụng Kong Gateway hay kiến trúc tách dịch vụ cũ.)
  - *Đa khách thuê*: Không dùng `Scope.REQUEST`; dùng `AsyncLocalStorage`, transaction `SET LOCAL search_path` + `app.tenant_id` GUC + `FORCE ROW LEVEL SECURITY` trên **58/66** bảng.
  - *WMS*: `packages/wms-engine` thực hiện FIFO/FEFO/LIFO, kiểm tra dung lượng bin cộng dồn (`allocateWithCapacity`), Putaway chuẩn hóa tỷ lệ khối lượng + thể tích (`assignPutawayBin`), Wave gom lô ưu tiên (`generateWave`), cộng tồn kho nguyên tử kèm `version` optimistic locking.
  - *Pack Station*: Trạm web `pack-station-web` (Web Serial + `@tensorflow-models/mobilenet` ImageNet mặc định `>= 0.60`), **luôn yêu cầu barcode hoặc nhân viên xác nhận** trước khi đóng kiện.
  - *TMS, SAI Core & COD*: Tối ưu tuyến bằng `vrp.ts` (NN + 2-opt, sửa lỗi rớt tuyến 1 khách và lệch `stops`); dự báo bằng LLM + fallback công thức; đối soát COD ưu tiên `qrCodeToken` và mã phiếu trong `$transaction` khi nhập CSV/XLSX (không phải kết nối ngân hàng trực tuyến tức thời).
  - *GPS & Mobile*: Go UDP `:8091` xác thực HMAC-SHA256 + cửa sổ 300s + replay cache (tắt mặc định chế độ không xác thực); kiểm tra PostGIS `ST_Contains` cho từng điểm trong batch kèm cooldown SOS 5 phút; Driver App dùng **Expo ~56 / React Native 0.85** (không phải PWA) với `OfflineSyncEngine` (`DEAD_LETTER` sau 5 lần + server `X-Sync-Id`).

### `B3-05` — Chỉnh sửa Mục `4c` & `5a–5d` (Kết quả, Tính mới, TCO & Điều kiện Áp dụng)
- **4c (Kết quả đã đạt)**: Thay thế 6 khẳng định quá mức ("hoàn chỉnh microservices", "triển khai OR-Tools", "Edge AI thành công", "100% test passed", "cloud-ready") bằng thực trạng: đã hoàn thành mã nguồn Modular Monolith + Gateway + Go GPS/Webhook + Cloudflare AI Worker + 4 Web Portal + Mobile App + bộ test tĩnh (`8/8 PASS`) và toàn bộ **6/6 jobs GitHub Actions CI PASSED** (Run [`43023689371`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43023689371), commit `75cf1ea`); vận hành E2E live trên hạ tầng staging + Pilot 12 tuần vẫn là giai đoạn kế tiếp.
- **5a (Tính mới)**: Nhấn mạnh tính mới nằm ở **phương pháp tích hợp khép kín cho SME** (kết hợp Web Serial không cần phần mềm cài máy, multi-tenant RLS và offline mobile đồng bộ `X-Sync-Id`), không khẳng định đã phát minh thuật toán VRP hoặc kiến trúc AI mới.
- **5b (Khả năng áp dụng & Thiết bị)**: Dù không đòi hỏi GPU chuyên dụng tại trạm đóng gói nhờ MobileNet nhẹ trên WASM/WebGL, việc vận hành vẫn đòi hỏi hạ tầng thực: PC/Laptop cấu hình trung bình (RAM >= 8GB) + webcam HD + đầu đọc barcode/cân điện tử cổng Serial + kết nối Internet ổn định + server chạy PostgreSQL/PostGIS, Redis, Go UDP và Cloudflare Worker.
- **5c (Hiệu quả Kinh tế & TCO)**: Tách rạch ròi chỉ số kỹ thuật với bài toán kinh tế. **Không suy diễn trực tiếp `15,5%` giảm km (142 -> 120 km) thành `20%` tiết kiệm tổng chi phí**. Bổ sung mô hình **TCO (Tổng chi phí sở hữu)** hàng tháng cần theo dõi trong Pilot:
  - *Chi phí hạ tầng cloud*: DB PostgreSQL + PostGIS managed, Redis, Container VM (`core-api`, `api-gateway`, Go UDP `:8091`), Object Storage S3/R2, Google/OSM Geocoding API, Cloudflare Workers/AI quota vượt ngưỡng free tier.
  - *Chi phí triển khai & vận hành*: Thiết bị quét/cân/điện thoại tài xế, đào tạo nhân sự kho, bảo trì & giám sát lỗi.
- **5d (Mức triển khai)**: Thay danh từ "MVP hoàn chỉnh sẵn sàng công nghiệp" bằng **"Nguyên mẫu tích hợp đã gia cố bảo mật/logic (Hardened MVP), sẵn sàng bước vào giai đoạn chạy thử nghiệm CI & Pilot có kiểm soát"** khi thỏa mãn danh sách điều kiện tiên quyết (Portals + Core API + DB chạy live, cấu hình khóa thật, tài khoản thử nghiệm riêng và dữ liệu baseline thật).

### `B3-06` & `B3-07` — Phụ lục Truy vết (`6–7`) & Bảo toàn Chữ ký `22/06/2026`
- Phụ lục chính thức nay gắn trực tiếp tới [coverage.csv](upgrade/coverage.csv), [architecture-and-erd.md](architecture-and-erd.md), [api-contracts.md](api-contracts.md), [operations-runbook.md](operations-runbook.md), [ai-model-cards.md](ai-model-cards.md) và [upgrade/verification.md](upgrade/verification.md).
- **Bảo toàn chữ ký (`B3-07`)**: Toàn bộ chữ ký, con dấu và ngày ký **`22/06/2026`** trên bản gốc B3 được lưu trữ nguyên vẹn, không chỉnh sửa trực tiếp trên file PDF ký gốc; bản đính chính này đứng tên phụ lục kỹ thuật cập nhật ngày `11/11/2026`.

---

## Phần II. Đồng bộ Bìa, Mục lục, Kết luận & 21 Chương Bản 4 (`B4-COVER`, `B4-CH01` – `B4-CH21`)

| Mã mục | Nội dung đính chính / cập nhật đồng bộ với mã nguồn |
|---|---|
| **`B4-COVER`** | **Bìa & Mục lục (PDF p.1–3) & Kết luận (tr.32)**: Đổi cụm *"Bản sao số vận hành kho bãi (Digital Twin)"* thành *"Quản lý cấu trúc kho trực quan (Zone/Rack/Bin) & Tồn kho thời gian thực"*. Ghi rõ danh sách thành viên thực hiện, đơn vị chủ quản, phiên bản `v2.0-patch (11/11/2026)` và kiểm tra đường dẫn QR hợp lệ trước khi phát hành. Bổ sung **Danh mục Hình (23 hình), Danh mục Bảng (11 bảng), Danh mục Thuật ngữ viết tắt** và loại bỏ trang trắng không chủ đích (tr.3 PDF). Tại Kết luận (tr.32): bỏ các lặp lại về `Scope.REQUEST`/OR-Tools/RandomForest và thay *"pilot diện rộng"* bằng *"kế hoạch pilot từng kho thử nghiệm có đối chứng"*. |
| **`B4-CH01`** | **Chương 1 — Khung Bằng chứng**: Đồng bộ 4 cấp độ bằng chứng `E0` (Khái niệm/Mock), `E1` (Có mã nguồn tĩnh `implemented`/`partial`), `E2` (Đã chạy test tĩnh/CI `verified`), `E3` (Đã đo thực địa Pilot `deployed`). Không dùng nhãn `CONFIRMED-CODE` cho phần chỉ mới có schema hoặc giao diện mock. Sửa chú thích Hình 1 cho đúng quy trình nghiên cứu A–E. |
| **`B4-CH02`** | **Chương 2 — Tổng quan Hệ thống**: Cập nhật đúng 5 thành phần chạy (Core API Modular Monolith, API Gateway/BFF, Go GPS/Webhook, Cloudflare AI Worker, 4 Next.js portals + Expo Driver App). Thay OR-Tools thành TS VRP heuristic, Camera nhận diện bằng MobileNet ImageNet + xác nhận barcode, đối soát ngân hàng bằng import sao kê CSV/XLSX khớp `qrCodeToken`. |
| **`B4-CH03`** | **Chương 3 — Cơ sở Lý thuyết & Bảng 1–2**: Loại bỏ trích dẫn sai Jacobs / VLDB 2018 (`DOI 10.1145/3183713`) khỏi cơ sở FEFO; bổ sung tài liệu chuẩn về PostgreSQL RLS, Interactive Transaction + ALS, PostGIS `ST_Contains`, Nearest-Neighbor + 2-opt CVRP, MobileNet v2 ImageNet và Z-score thống kê. |
| **`B4-CH04`** | **Chương 4 — Bối cảnh Đồng Nai & Đông Nam Bộ**: Ghi rõ năm, số quyết định/tài liệu gốc, URL và số trang cho từng số liệu: tỷ trọng `4,5% GDP`, quy mô `45–50 tỷ USD` ([Bộ Công Thương 2023](https://logistics.gov.vn/bao-cao-logistics-viet-nam-2023)), chi phí logistics `16,8–18% GDP` (tách khỏi xếp hạng LPI hạng 43), số liệu `32 KCN`, `8 trung tâm logistics`. Tách rạch ròi địa giới hành chính tỉnh Đồng Nai với **hành lang liên kết vùng** tới cụm cảng Cái Mép–Thị Vải (Bà Rịa–Vũng Tàu). Nêu rõ container yard và dừng đỗ phức tạp chưa nằm trong phạm vi CVRP hiện tại. |
| **`B4-CH05`** | **Chương 5 — Khoảng trống Thị trường & Định vị SME**: Sử dụng Bảng 6 (`TBL-06`) so sánh đối thủ cụ thể kèm ngày kiểm tra giá/tính năng; chỉ ra rõ phân khúc tích hợp WMS+TMS+COD cho SME mà không phủ nhận toàn bộ công nghệ của đối thủ. |
| **`B4-CH06`** | **Chương 6 — Phương pháp Nghiên cứu, Kiểm toán & Usability**: Ghi rõ mốc audit `11/11/2026` (commit `775ba1c` -> xác minh CI `75cf1ea`), phương pháp kiểm tra tĩnh bằng [`scripts/static-verify.py`](../scripts/static-verify.py) (`8/8 PASS`), bộ CI 6 job trên GitHub Actions (đã **PASSED 6/6** ở Run `43023689371`). Bổ sung quy trình nghiên cứu người dùng (phỏng vấn điều phối/thủ kho/tài xế), thiết kế phản hồi trạng thái rỗng/lỗi và kiểm tra khả năng truy cập (WCAG AA contrast, responsive mobile/desktop). |
| **`B4-CH07`** | **Chương 7 — Kiến trúc Mục tiêu & Hiện trạng**: Sửa kiến trúc sang Modular Monolith + Dịch vụ chuyên biệt; công bố rõ công tắc `NEXT_PUBLIC_DATA_SOURCE=mock\|api` trên cả 4 cổng web; thu hẹp tuyên bố COD thành *"Nhập sao kê CSV/XLSX và khớp tự động theo `qrCodeToken` / mã phiếu trong `$transaction`"*. |
| **`B4-CH08`** | **Chương 8 — Đa khách thuê (ALS + `search_path` + `FORCE RLS`)**: Viết lại hoàn toàn thay cho mục `Scope.REQUEST` cũ. Trình bày `PrismaService.runWithTenantRequest`, transaction-local `app.tenant_id` GUC, **58 bảng bật `FORCE ROW LEVEL SECURITY`** (gồm migration bổ sung 7 bảng `20261111000000`), role ứng dụng `smartlogi_app` (`NOSUPERUSER NOBYPASSRLS`) và `runAsPlatform` (`app.bypass_rls`) có kiểm soát. Xem chi tiết tại [architecture-and-erd.md](architecture-and-erd.md). |
| **`B4-CH09`** | **Chương 9 — Phân quyền RBAC (`RolePermissionMap`)**: Bổ sung vai trò nền tảng **`SUPER_ADMIN`** (`@RequireRoles(Roles.SUPER_ADMIN)`), vai trò **`TENANT_USER`**, cơ chế đánh giá `@ExcludeRoles` -> `@RequireRoles` -> `@RequirePermissions` trước bypass trong `PermissionsGuard`, sửa lỗi `DRIVER` không có `tasks:read` và bổ sung quy tắc sở hữu dòng dữ liệu (`driver.id`, `client_id`, `user.sub`). Xem chi tiết tại [role-guides.md](role-guides.md). |
| **`B4-CH10`** | **Chương 10 — Động cơ Kho (`wms-engine` & Concurrency)**: Ghi nhận đã vá 10 phép ép kiểu `::uuid` trong SQL thô, sửa `allocateWithCapacity` theo dõi dung lượng còn lại cộng dồn cho nhiều lô chung bin, chuẩn hóa tỷ lệ khối lượng/thể tích trong `assignPutawayBin`, chặn âm `quantityAvailable < 0` ở `adjustStock`/`transferStock` và bổ sung test [`wms-concurrency.spec.ts`](../backend/core-api/src/modules/wms/__tests__/wms-concurrency.spec.ts). Nêu giới hạn `generateWave` là gom lô heuristic và chưa chạy benchmark hàng trăm thủ kho đồng thời. |
| **`B4-CH11`** | **Chương 11 — Trạm Đóng gói CV & HITL**: Ghi nhận đã nối `model.classify(videoRef.current, 5)` trong `pack/page.tsx` kết hợp bộ ánh xạ 12 SKU tại `cv-mapper.ts` (ngưỡng `CV_CONFIDENCE_THRESHOLD = 0.6`) và sửa lỗi chỉ số độ tin cậy mock (`predictSku`). Nhấn mạnh trọng số ImageNet mặc định chỉ đóng vai trò gợi ý phụ trợ bên cạnh bắt buộc quét barcode/xác nhận con người; liên kết vòng phản hồi sang `GET /v1/training-dataset` và `POST /v1/train/:type` (`501`). |
| **`B4-CH12`** | **Chương 12 — TMS & Bộ giải VRP (`ai-worker`)**: Sửa toàn bộ sang TS heuristic Nearest-Neighbor + 2-opt; ghi nhận đã vá lỗi rớt chuyến 1 khách (`route.length >= 2`), lỗi đếm thiếu `stops`, và nâng cấp `LogisticsService` truyền trọng lượng/thể tích thực của đơn hàng; công bố rõ khoảng cách dùng `haversine_circuity_1.41` (có geocoder cache 24h + Google fallback nếu cấu hình), chưa tính đường cấm tải/1 chiều. |
| **`B4-CH13`** | **Chương 13 — Dự báo & Phát hiện Bất thường (Bảng 5)**: Xóa tên `RandomForestRegressor` và `IsolationForest`; công bố đúng kiến trúc LLM (`llama-3.1-8b-instruct-fast`) + công thức tất định fallback + Z-score (`min_recommended_samples: 5`, `data_sufficiency`). Giữ nguyên trạng thái `[CHƯA ĐO PILOT]` cho các cột MAE/RMSE/FPR/FNR. |
| **`B4-CH14`** | **Chương 14 — Giám sát GPS & Geofence**: Cập nhật đường dẫn `backend/gps-ingestion-service`; ghi nhận HTTP Bearer `ConstantTimeCompare`, **bổ sung HMAC-SHA256 + replay cache 300s cho UDP `:8091`** (`GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED=false`), kiểm tra `ST_Contains` qua **tất cả các điểm trong batch**, chuyển `tripId` rỗng thành `NULL` và chống spam SOS bằng cooldown `5` phút. |
| **`B4-CH15`** | **Chương 15 — Dispatch Tower & App Tài xế**: Đính chính Driver App là **Expo ~56 / React Native 0.85** (không phải PWA); cập nhật `OfflineSyncEngine` (`MAX_RETRY_COUNT = 5`, backoff lũy thừa, `DEAD_LETTER`) đi kèm `IdempotencyInterceptor` (`X-Sync-Id`) phía `core-api`, và ghi nhận đã vá các lỗi crash (`HomeScreen`, `TripDetailScreen`, `SafetyScreen`, `ExpenseScreen`, `RemittanceScreen`). |
| **`B4-CH16`** | **Chương 16 — Đối soát Tài chính COD (`LogisticsService`)**: Cập nhật đúng sau khi vá lỗi nghiêm trọng `R05–R08`: `reconcileBankStatement` ưu tiên đối khớp `qrCodeToken` / mã phiếu nộp trong `$transaction`, bỏ ràng buộc `createdAt >= transactionDate` bằng cửa sổ thời gian hợp lý, tách rạch ròi số lượng `matched`, `unmatched`, `ambiguous`, khôi phục Unicode cột tiếng Việt và làm sạch CSV CWE-1236. Vẫn nêu rõ cơ chế đầu vào là tải tệp CSV/XLSX (chưa kết nối Open Banking tự động). |
| **`B4-CH17`** | **Chương 17 — Kịch bản Nghiệp vụ & Ma trận Đối thủ**: Phân tách rõ kịch bản liên portal đã nối hợp đồng code (`/api/v1/*`) và đạt kiểm tra parity/unit/typecheck CI (`43023689371`) với trạng thái **chưa chạy nghiệm thu E2E liên container trên server live (staging/Pilot)**. Chuẩn hóa Bảng 6 đối thủ có nguồn và ngày truy xuất. |
| **`B4-CH18`** | **Chương 18 — Thiết kế Pilot 12 Tuần & KPI**: Giải quyết xung đột thời lượng: thống nhất lộ trình Pilot **12 tuần** gồm **2 tuần đo Baseline + 8 tuần chạy Pilot + 2 tuần tổng hợp/đối chứng & dự phòng**. Thống nhất 1 giá trị mục tiêu lỗi đóng gói **`< 0,5%`** (loại bỏ `0,4%` mâu thuẫn). Mọi số baseline (`8,5 phút`, `2,1%`, `142 km`, `45 phút`, `120 phút`) gắn nhãn **`[GIẢ ĐỊNH — CHƯA ĐO PILOT]`**. Tách trục đơn vị biểu đồ, bổ sung cỡ mẫu tối thiểu, biến kiểm soát (tuyến/số đơn/tải), yếu tố nhiễu (thời tiết, tài xế) và tiêu chí dừng thử nghiệm. |
| **`B4-CH19`** | **Chương 19 — Kiểm chứng & Thử nghiệm**: Cập nhật đường dẫn file thực (`backend/core-api`, `api/api-gateway`, `packages/wms-engine`, `workers/ai-worker`, Go services); xóa các con số chưa kiểm chứng `100% Passed / 90–95%`; sửa đúng ví dụ FEFO trong test (`2024`) và GPS test (`91/151`); bổ sung đầy đủ danh sách 15 tệp regression test mới tạo + `scripts/static-verify.py` (`8/8`) + kết quả CI **6/6 jobs PASSED** tại Run `43023689371` (tách riêng phạm vi chưa chạy `next build` & staging E2E). |
| **`B4-CH20`** | **Chương 20 — Quản trị Rủi ro**: Loại bỏ rủi ro `RSK-01/02` cũ (SQLite & `Scope.REQUEST`) sang mục đã xử lý trong lịch sử; cập nhật toàn bộ 24 phát hiện `R01–R24` và `NEW-01..NEW-10` kèm trạng thái (đã sửa trong code/test tĩnh vs còn phụ thuộc hạ tầng CI/Pilot). |
| **`B4-CH21`** | **Chương 21 — Lộ trình Phát triển & Kết luận**: Hợp nhất thống nhất **Bảng 11 (`TBL-11`)** và **Hình 21 (`FIG-21`)** theo 3 pha (`Pha 1: Tuần 1–4`, `Pha 2: Tuần 5–8`, `Pha 3: Tuần 9–12`), ghi rõ Owner, Đầu ra và Tiêu chí Pass từng cổng. |

---

## Phần III. Danh sách Đính chính Toàn bộ 23 Hình (`FIG-01` – `FIG-23`)

| ID Hình | Vị trí B4 | Vấn đề trên hình cũ | Nội dung & Đặc tả thay thế (Chú thích + Nhãn + Logic đúng) |
|---|---|---|---|
| **`FIG-01`** | tr.1 | Hình vẽ chuỗi 5 bước nghiên cứu A–E nhưng chú thích là *"Tháp phân loại độ tin cậy bằng chứng"* | Đổi chú thích: *"Hình 1. Quy trình 5 bước thu thập và đối chiếu bằng chứng nghiên cứu (A–E)"*, tách biệt rõ với Bảng phân tầng E0–E3. |
| **`FIG-02`** | tr.2 | Vẽ 8+ microservices + Kong Gateway cũ | Vẽ lại sơ đồ 5 runtime thực tế: 4 Portals + Driver App -> `api/api-gateway` -> `backend/core-api` (6 modules) + Go GPS/Webhook + Cloudflare `ai-worker`. (Tham chiếu sơ đồ Mermaid tại [architecture-and-erd.md](architecture-and-erd.md)). |
| **`FIG-03`** | tr.8 | Bản đồ phân bố vùng công nghiệp thiếu nguồn và năm | Gắn chú thích rõ *"Minh họa định hướng khu vực công nghiệp trọng điểm"*, bổ sung nguồn Niên giám thống kê / Quy hoạch tỉnh thời điểm tham chiếu và ranh giới địa lý. |
| **`FIG-04`** | tr.8 | Gộp hành lang cảng Cái Mép–Thị Vải vào như nội tỉnh Đồng Nai | Sửa nhãn sơ đồ phân biệt **Địa bàn nội tỉnh Đồng Nai** (Biên Hòa, Long Thành, Nhơn Trạch) với **Trục kết nối vùng Đông Nam Bộ** (Cảng Cái Mép–Thị Vải thuộc BR–VT, Cát Lái thuộc TP.HCM). |
| **`FIG-05`** | tr.8 | Hình ảnh khu công nghiệp / kho phối cảnh dễ hiểu nhầm triển khai thật | Giữ rõ nhãn `[ẢNH Ý TƯỞNG — MINH HỌA NGHIÊN CỨU]`, ghi nguồn cấp phép ảnh trước khi xuất bản. |
| **`FIG-06`** | tr.9 | Định vị khoảng trống thị trường chưa gắn nguồn đối thủ | Gắn tham chiếu trực tiếp sang dữ liệu Bảng 6 (`TBL-06`), chú thích trục X/Y dựa trên tính năng công khai có ngày truy xuất. |
| **`FIG-07`** | tr.10 | Sơ đồ phương pháp đề xuất dùng thay minh chứng đã chạy test | Ghi rõ nhãn *"Hình 7. Quy trình kiểm toán và kiểm thử đề xuất"*; tách các bước đã chạy (`static-verify.py` 8/8 + CI Run `43023689371` 6/6) với các bước chờ staging E2E & Pilot (`E3`). |
| **`FIG-08`** | tr.12 | Sơ đồ chi tiết microservices tách rời cũ | Vẽ lại cấu trúc bên trong `backend/core-api`: 6 NestJS Modules dùng chung `PrismaModule`, `CoreAuthModule`, `OutboxModule`, `KafkaModule` và `PermissionsGuard`. |
| **`FIG-09`** | tr.13 | Sơ đồ Docker có Kong và tách container cũ, dễ nhầm với Vercel production | Vẽ đúng topology của `docker-compose.yml` (`postgis`, `redis`, `zookeeper`, `kafka`, `localstack`, `core-api`, `api-gateway`, `gps-ingestion-service`, `webhook-service`, 4 portals + `portals-proxy`), gắn nhãn *"Kiến trúc cụm Docker Compose cục bộ/staging (khác kiến trúc demo tĩnh Vercel)"*. |
| **`FIG-10`** | tr.13 | Luồng `Scope.REQUEST` + `switchSchema` đơn lẻ cũ | Thay bằng sơ đồ trình tự **`AsyncLocalStorage` + Transaction `SET LOCAL search_path` + `app.tenant_id` GUC + `FORCE ROW LEVEL SECURITY` (58 bảng)** kèm nhánh `runAsPlatform()`. |
| **`FIG-11`** | tr.15 | Luồng FEFO thiếu đơn vị, thiếu đầu vào & ví dụ kiểm chứng | Bổ sung ví dụ số cụ thể (Lô A hết hạn trước / 50 kg / 0.2 cbm trong Bin B1) cùng kiểm tra `quantityAvailable >= 0` và `allocateWithCapacity` trừ dung lượng cộng dồn của bin. |
| **`FIG-12`** | tr.16 | Luồng Optimistic Locking chỉ là logic khái niệm | Gắn nhãn *"Cơ chế khóa lạc quan trong `InventoryService` (cộng kèm test đơn vị/mô phỏng `wms-concurrency.spec.ts`, benchmark tải cao thực địa chờ Pilot)"*. |
| **`FIG-13`** | tr.17 | Ảnh trạm đóng gói không ghi nhãn nguồn/concept | Bổ sung nhãn **`[ẢNH MINH HỌA CONCEPT — THAY BẰNG ẢNH CHỤP THỰC TẾ KHI LẮP TRẠM PILOT]`**; mô tả đúng flow camera WASM + barcode + cân RS-232. |
| **`FIG-14`** | tr.18 | Vẽ khép kín vòng lặp Feedback -> Auto-Retrain như đang chạy | Tô nét đứt có nhãn **`[CHƯA TRIỂN KHAI ONLINE — HTTP 501]`** tại khối huấn luyện tự động; vẽ đường thực hiện tại từ `pack/page.tsx` -> `POST /v1/feedback` -> `GET /v1/training-dataset` (xuất nhãn `human_corrected IS NOT NULL`) -> Huấn luyện offline. |
| **`FIG-15`** | tr.19 | Gắn tên Google OR-Tools cho sơ đồ định tuyến | Đổi nhãn sang **"Luồng tối ưu tuyến TS Heuristic (`solveRouting`: Nearest-Neighbor + 2-opt, `haversine * 1.41`)"**, hiển thị đầu vào khối lượng/thể tích thật và nhánh trả `unassigned` kèm lý do. |
| **`FIG-16`** | tr.21 | Thiếu chi tiết xác thực HTTP/UDP và cô lập tenant trên luồng GPS | Bổ sung nhánh `HTTP :8090` (`ConstantTimeCompare` Bearer), nhánh `UDP :8091` (HMAC-SHA256 + 300s + replay cache), kiểm tra **mọi điểm trong batch** qua `ST_Contains` và cooldown SOS 5 phút. |
| **`FIG-17`** | tr.22 | Sơ đồ Dispatch Tower dễ nhầm đã có GPS thực địa | Giữ rõ nhãn `[KIẾN TRÚC & DỮ LIỆU DEMO — CHƯA CHẠY THIẾT BỊ THỰC ĐỊA]`; sửa nhãn Mobile App từ `PWA` thành `Expo React Native Driver App` (`X-Sync-Id` + `DEAD_LETTER`). |
| **`FIG-18`** | tr.23 | Vẽ khớp tự động `qrCodeToken` dù code cũ chưa làm, và ngụ ý Open Banking trực tiếp | Cập nhật đúng luồng **sau gia cố `G1`**: Upload CSV/XLSX (`[CHƯA TÍCH HỢP OPEN BANKING TRỰC TIẾP]`) -> Parse UTF-8 sạch -> `$transaction` ưu tiên khớp `qrCodeToken` / mã tham chiếu + cửa sổ ngày hợp lệ -> phân tách `matched` / `unmatched` / `ambiguous`. |
| **`FIG-19`** | tr.26 | Sơ đồ Pilot 2+8 tuần mâu thuẫn với tuyên bố "3 tháng" | Vẽ lại biểu đồ Gantt **12 tuần (3 tháng)** thống nhất: Tuần 1–2 (Baseline), Tuần 3–10 (Chạy Pilot có kiểm soát), Tuần 11–12 (Đối chứng số liệu & Nghiệm thu/Dự phòng). |
| **`FIG-20`** | tr.26 | Trộn 3 đơn vị (phút, %, km) trên cùng 1 trục Y và ghi mục tiêu `0,4%` lệch `< 0,5%`; tiêu đề "Trước/Sau" dễ hiểu nhầm kết quả thật | Đổi tiêu đề thành **"Hình 20. Giả định Baseline & Mục tiêu Pilot theo từng nhóm chỉ số (`[CHƯA ĐO PILOT]`)"**; tách thành **3 subplot độc lập** theo đơn vị (Phút, %, km/ngày/xe) và thống nhất mục tiêu lỗi đóng gói **`< 0,5%`**. |
| **`FIG-21`** | tr.30 | Mốc thời gian không khớp Bảng 11 (ngày 30/60/90 vs tháng 1–6) | Đồng bộ hoàn toàn với **Bảng 11 (`TBL-11`)** theo **3 Pha thống nhất (Tuần 1–4, Tuần 5–8, Tuần 9–12)**. |
| **`FIG-22`** | tr.31 | Sơ đồ vẽ riêng cụm GPS/Geofence/SOS nhưng chú thích là *"Kiến trúc tổng thể hệ thống"* | Đổi chú thích thành **"Hình 22. Chi tiết luồng xử lý GPS Telemetry, PostGIS Geofence & Cảnh báo SOS (Code hiện hành)"**. |
| **`FIG-23`** | tr.32 | Trình bày giá trị tài chính/vận hành như kết quả đã đạt | Gắn nhãn rõ **"Hình 23. Mô hình kỳ vọng giá trị & cấu trúc TCO cần kiểm chứng qua Pilot `[GIẢ ĐỊNH]`"**. |

---

## Phần IV. Toàn bộ 11 Bảng Đính chính / Sinh lại từ Mã nguồn (`TBL-01` – `TBL-11`)

### `TBL-01` & `TBL-02` — Bảng Cơ sở Lý thuyết & Ma trận Rà soát Tài liệu (`B4 Ch.3`, tr.4–5)
- **Đính chính `TBL-01` (Đối chiếu nền tảng kỹ thuật)**: Thay Jacobs/VLDB 2018 bằng nguồn chính thức PostgreSQL Row-Level Security (`CREATE POLICY ... FORCE ROW LEVEL SECURITY`) và Prisma Interactive Transactions; đổi Google OR-Tools sang nguồn cơ sở phương pháp so sánh với TS Nearest-Neighbor + 2-opt thực tế; đổi MobileNet tự nhận diện SKU thành `@tensorflow-models/mobilenet` ImageNet v2 kết hợp cổng xác nhận barcode (`0.60`).
- **Đính chính `TBL-02` (LR-01..LR-10)**: Tách riêng nhóm **Tài liệu học thuật đã xác minh** (`Toth & Vigo 2014`, `PostGIS ST_Contains`, `ACM SIGMOD 2018`) với **Tài liệu kỹ thuật chính thức** (`NestJS`, `Prisma`, `Cloudflare Workers AI`, `TensorFlow.js`) và nhóm **Chưa xác minh / Bổ sung từ thực địa** (gỡ nhãn *"Auto Banking Integration Patterns"* thiếu nguồn, thay bằng *"Nhập sao kê CSV/XLSX và khớp tham chiếu `qrCodeToken`"*).

### `TBL-03` — Bảng Vùng Ứng dụng & Nguồn Quy hoạch (`B4 Ch.4`, tr.7)
- Mọi chỉ số quy mô khu công nghiệp/cảng biển (Đông Nam Bộ, Đồng Bằng Sông Hồng, ĐBSCL, Duyên Hải Miền Trung) phải trích dẫn kèm **tên văn bản quy hoạch, năm ban hành và đường dẫn truy xuất**. Gắn chú thích phạm vi giới hạn: Các module WMS/TMS hiện tại hỗ trợ kho hàng thông thường và tuyến giao nhận nội địa; **nghiệp vụ bãi container (container yard), vận tải biển đa phương thức chưa có thiết kế chuyên sâu trong code**.

### `TBL-04` — Ma trận Phân quyền RBAC Chuẩn xác từ `RolePermissionMap` (`B4 Ch.9`, tr.14)
*(Sinh trực tiếp từ [`role-permission-map.ts`](../packages/shared-types/src/role-permission-map.ts), [`permissions.guard.ts`](../packages/shared-types/src/guards/permissions.guard.ts) và các controller thực tế — thay thế cho bảng 5 role cũ bị thiếu `SUPER_ADMIN`, thiếu `TENANT_USER` và sai quyền `DRIVER`.)*

| Vai trò | Phạm vi & Cơ chế chặn | Đọc/Sửa Kho | Đọc/Tạo/Sửa Task | Pack Scan | Đọc/Tạo Đơn | Điều phối Chuyến | Billing SaaS / COD | Audit & Cài đặt Tenant | Row-Level Ownership |
|---|---|---|---|---|---|---|---|---|---|
| `SUPER_ADMIN` | Platform (`@RequireRoles`) | Bypass* | Bypass* | Bypass* | Bypass* | Bypass* | Toàn quyền Platform Billing | Toàn quyền Audit Platform | Xuyên tenant (`SystemAdmin`) |
| `TENANT_ADMIN` | Nội bộ 1 Tenant | Đọc + Sửa | Đọc + Tạo + Sửa | Có | Đọc + Tạo | Đọc + Điều phối | Chỉ đọc Billing Tenant + COD | Đọc Audit Tenant + Cài đặt | Bị chặn toàn bộ `/admin/*` |
| `WAREHOUSE_MANAGER` | Kho thuộc Tenant | Đọc + Sửa | Đọc + Tạo + Sửa | Có | Chỉ Đọc | Không (xem xe) | Không (`BillingManage` cấm) | Không | Giới hạn trong `tenant_id` |
| `WAREHOUSE_STAFF` | Thao tác Kho | Chỉ Đọc | Đọc + Cập nhật | Có | Không | Không | Không | Không | `staffId = req.user.sub` khi mở ca |
| `LOGISTICS_MANAGER` | Điều vận Tenant | Không | Không | Không | Đọc + Tạo | Đọc + Điều phối | Duyệt COD (cấm `BillingManage`) | Không | Giới hạn trong `tenant_id` |
| `DRIVER` | App Tài xế | Không | **Không** (`mobile/trips`) | Không | Không | Chỉ đọc chuyến mình | Tạo phiếu nộp COD riêng | Không | Khóa cứng `trip.driverId === driver.id` |
| `CUSTOMER_CLIENT` | Cổng Khách B2B (`/client/*`) | Tồn của mình | Không | Không | Chỉ đơn của mình | Không | Thanh toán hóa đơn của mình | Chỉ webhook của mình | `@ExcludeRoles` chặn route nội bộ; lọc `client_id` |
| `TENANT_USER` | Người xem chuẩn | Chỉ Đọc | Chỉ Đọc | Không | Chỉ Đọc | Chỉ Đọc | Không | Không | Giới hạn trong `tenant_id` |

*\* `SUPER_ADMIN` bypass tenant permissions chỉ sau khi vượt qua kiểm tra tường minh `@ExcludeRoles` / `@RequireRoles`.*

### `TBL-05` — Mô hình AI, Heuristic & Trạng thái Đo lường Thực tế (`B4 Ch.13`, tr.20)
*(Loại bỏ hoàn toàn tên `RandomForestRegressor` và `IsolationForest`; mọi chỉ số độ chính xác thực nghiệm để trống chờ dữ liệu Pilot thực tế.)*

| Tên bài toán | Thành phần thực tế | Kỹ thuật & Công thức thực thi | Đầu vào chính | Cơ chế Fallback | Chỉ số Pilot cần đo (Hiện tại: Trống) |
|---|---|---|---|---|---|
| **1. Tối ưu tuyến VRP** | [`vrp.ts`](../workers/ai-worker/src/lib/vrp.ts) | TS Nearest-Neighbor (capacity-feasible) + 2-opt; khoảng cách `floor(haversine * 1.41)` | `locations[]` (lat, lng, demand từ trọng lượng/thể tích), `vehicles[]`, `depotIndex` | Trả `unassigned[]` với mã lý do cụ thể | Gap % vs OR-Tools trên tập đơn thật; thời gian toàn luồng: `[CHƯA ĐO PILOT]` |
| **2. Dự báo nhu cầu** | [`compute.ts`](../workers/ai-worker/src/routes/compute.ts) (`/v1/predict/demand`) | LLM Workers AI (`llama-3.1-8b-instruct-fast`) / OpenAI JSON prompt + `wrapUntrustedData` | `day_of_week`, `hour`, `item_count` | `base * 12.5 * dowFactor * hourFactor` (`deterministic_heuristic_fallback`) | MAE, RMSE vs Moving Average: `[CHƯA ĐO PILOT — evaluation_status: unmeasured]` |
| **3. Dự báo thời gian giao & Churn** | [`compute.ts`](../workers/ai-worker/src/routes/compute.ts) (`/v1/predict/{delivery-time,churn}`) | LLM JSON prompt có `wrapUntrustedData` | Thời gian ngày/tuần hoặc tần suất đơn, số ngày từ đơn cuối | `40 * weekend * hourFactor` (ETA); Logistic formula (Churn) | MAE (phút), AUC/F1 (Churn): `[CHƯA ĐO PILOT]` |
| **4. Phát hiện bất thường** | [`compute.ts`](../workers/ai-worker/src/routes/compute.ts) (`/v1/detect/anomalies`) | Z-score mẫu (sample stddev, ngưỡng `\|z\| > 3`) | Mảng bản ghi số; yêu cầu `min_recommended_samples: 5` | Gắn `data_sufficiency: "insufficient_sample"` nếu `< 5` mẫu | FPR / FNR trên log sự cố thật: `[CHƯA ĐO PILOT]` |
| **5. Hỗ trợ nhận diện SKU trạm đóng gói** | [`cv-mapper.ts`](../frontend/reporting/pack-station-web/src/lib/cv-mapper.ts) | `@tensorflow-models/mobilenet` (ImageNet v2) + ánh xạ từ khóa 12 SKU (`>= 0.60`) | Khung hình `videoRef` 640x480 mỗi `1.5s` | Bắt buộc Web Serial Barcode / nhập tay & xác nhận người vận hành | Top-1 Accuracy, Confusion Matrix theo điều kiện sáng: `[CHƯA ĐO PILOT]` |

### `TBL-06` — Ma trận Định vị Sản phẩm & Đối thủ Tham khảo (`B4 Ch.17`, tr.24)
*(Ngày truy xuất tham chiếu thông tin sản phẩm công khai: `11/11/2026`. Bỏ hoàn toàn nhận định cảm tính "mọi đối thủ không có AI / đòi GPU riêng".)*

| Giải pháp / Nhóm | Trọng tâm chính | Kiến trúc AI / Tối ưu công bố | Mô hình chi phí công khai (cần đối chiếu báo giá theo năm) | Định vị khác biệt của SmartLogi AI SaaS |
|---|---|---|---|---|
| **SAP S/4HANA EWM/TM** | Enterprise quy mô lớn | Tối ưu tuyến nâng cao, hoạch định chuỗi cung ứng sâu | Phí license + triển khai doanh nghiệp lớn, chu kỳ triển khai dài tháng–năm | Nhắm SME không đủ ngân sách/nhân lực IT vận hành ERP nặng |
| **Odoo Inventory + Fleet (Enterprise)** | ERP mô-đun linh hoạt | Cộng đồng/bổ sung ngoài; chưa tích hợp sẵn bộ giải GPS UDP + Pack Serial VN | Theo số user/tháng + chi phí tùy biến địa phương hóa VN (COD, kho VN) | Đóng gói sẵn luồng COD đối soát sao kê VN, tiếng Việt, RLS đa tenant |
| **KiotViet / Nhanh.vn** | Bán lẻ đa kênh & đẩy đơn qua 3PL | Tập trung POS/sàn TMĐT & kết nối đơn vị vận chuyển ngoài (GHTK, GHN...) | Gói thuê bao phổ thông theo cửa hàng/tháng | Nhắm đơn vị **tự vận hành kho riêng và đội xe giao nhận nội bộ** |
| **Abivin vRoute** | Tối ưu hóa lộ trình TMS chuyên sâu | Thuật toán tối ưu VRPTW/multi-echelon công nghiệp | Thuê bao theo xe/tính năng B2B | Kết hợp **WMS vị trí + Pack Station Web Serial + TMS + COD** trong 1 giao diện SME |
| **SmartLogi AI SaaS (Đề xuất)** | Hợp nhất WMS + Pack + TMS + COD | TS Heuristic VRP + LLM Fallback + MobileNet HITL | Cần xây bảng giá trên mô hình TCO (VPS/DB/Maps/Worker) sau Pilot | Triển khai gọn cho kho & đội xe SME (cần Pilot xác nhận độ ổn định thực địa) |

### `TBL-07` — Bảng Thiết kế Pilot & Công thức KPI Chuẩn hóa (`B4 Ch.18`, tr.25)
| Chỉ số KPI | Công thức đo thực tế | Giá trị Baseline `[GIẢ ĐỊNH — CHƯA ĐO PILOT]` | Mục tiêu Pilot (12 tuần) | Cỡ mẫu & Biến kiểm soát bắt buộc |
|---|---|---|---|---|
| **Thời gian soạn & đóng gói / đơn** | $\text{Avg}(t_{\text{seal}} - t_{\text{pick\_start}})$ từ `StaffShift` & `PackStationLog` | `8,5 phút/đơn` `[GIẢ ĐỊNH]` | `6,0 phút/đơn` (~29,4% giảm) | Tối thiểu 300–500 đơn/nhóm; phân tầng theo số dòng hàng/đơn (1 SKU vs đa SKU) |
| **Tỷ lệ lỗi đóng gói** | `(Lỗi phát hiện tại trạm + Khiếu nại sai SKU sau giao) / Tổng đơn xuất` | `2,1%` `[GIẢ ĐỊNH]` | **`< 0,5%`** (thống nhất, bỏ số `0,4%`) | Ghi riêng: lỗi được trạm chặn lại vs lỗi lọt tới khách |
| **Quãng đường di chuyển/xe/ngày** | $\sum \text{actualDistanceKm} / \text{số ngày-xe hoạt động}$ | `142 km/ngày/xe` `[GIẢ ĐỊNH]` | `120 km/ngày/xe` (~15,5% giảm) | Khống chế mật độ điểm dừng/đơn, tải trọng xe và khu vực giao |
| **Thời gian lập & phân chuyến** | Toàn luồng: `nhập đơn -> geocode -> solve -> điều phối duyệt` | `45 phút/đợt` `[GIẢ ĐỊNH]` | `5 phút/đợt` | Đo đồng hồ bấm giờ toàn quy trình thủ công đối chứng vs dùng hệ thống |
| **Thời gian đối soát COD/ngày** | `t_reconciled - t_upload_statement` (gồm xử lý ca lệch/trùng) | `120 phút/ngày` `[GIẢ ĐỊNH]` | `5 phút/ngày` | Cùng khối lượng 100–300 phiếu nộp/ngày kèm ca chênh lệch/ngoại lệ |

### `TBL-08` — Danh mục Mã nguồn & Thực trạng Triển khai (`B4 Ch.19`, tr.27)
*(Loại bỏ hoàn toàn % hoàn thành cảm tính; thay bằng đường dẫn thực tế đã xác minh và hệ nhãn trạng thái chuẩn.)*

| Phân hệ | Đường dẫn thực tế đã xác minh | Chức năng lõi đã triển khai | Trạng thái (`lifecycle_status`) |
|---|---|---|---|
| **API Gateway / BFF** | [`api/api-gateway/src/config/services.config.ts`](../api/api-gateway/src/config/services.config.ts) | JWT Guard edge, `ROUTE_RULES` segment match, circuit breaker, `/api/v1/bff/*` | `implemented` (CI `43023689371` PASSED) |
| **Core API (6 Modules)** | [`backend/core-api/src/app.module.ts`](../backend/core-api/src/app.module.ts) | 70 controllers / 407 endpoints, ALS+RLS, Outbox `SKIP LOCKED`, `X-Sync-Id` idempotency | `implemented` (CI `43023689371` PASSED) |
| **Prisma Schema & RLS** | [`packages/prisma-schemas/prisma/schema.prisma`](../packages/prisma-schemas/prisma/schema.prisma) | 66 models PostgreSQL/PostGIS, 58 bảng `FORCE RLS`, `tenant-isolation.sql` | `implemented` (`postgres-rls` PASSED) |
| **WMS Engine** | [`packages/wms-engine/src/index.ts`](../packages/wms-engine/src/index.ts) | FIFO/FEFO/LIFO, `allocateWithCapacity`, normalized `assignPutawayBin`, `generateWave` | `implemented` (CI Jest PASSED) |
| **Go GPS & Webhook** | [`backend/gps-ingestion-service/main.go`](../backend/gps-ingestion-service/main.go), [`webhook-service/main.go`](../backend/webhook-service/main.go) | HTTP Bearer constant-time, UDP HMAC+replay, batch geofence, webhook SSRF + mask secret | `implemented` (`go-services -race` PASSED) |
| **Cloudflare AI Worker** | [`workers/ai-worker/src/index.ts`](../workers/ai-worker/src/index.ts) | TS VRP (`vrp.ts`), LLM + fallback (`compute.ts`), export dataset; `train` trả `501` | `implemented` / `partial` (`ai-worker` PASSED) |
| **4 Web Portals (84 trang)** | `frontend/feature-test/admin-portal`, `frontend/reporting/{tenant,customer}-portal`, `pack-station-web` | Tách `NEXT_PUBLIC_DATA_SOURCE=mock\|api`, CWE-1236 CSV, MobileNet `classify()` cổng `0.60` | `implemented` / `demo-only` (`typegen+tsc` PASSED) |
| **Driver Mobile App** | [`frontend/mobile/driver-app`](../frontend/mobile/driver-app) | Expo ~56 / RN 0.85, 10 màn hình, `OfflineSyncEngine` backoff + `DEAD_LETTER` | `implemented` (`tsc` PASSED; native EAS pending) |
| **Rust API** | [`backend/rust-api`](../backend/rust-api) | Experimental Axum parity workspace (`501` nhiều route + stub AI) | `partial` (`cargo test` PASSED; thử nghiệm) |

### `TBL-09` — Ma trận Kiểm thử & Chứng cứ Thực thi (`B4 Ch.19`, tr.28)
*(Thay hoàn toàn cho tuyên bố "100% Test Passed" không log trước đây; ghi nhận kết quả chạy thực tế `scripts/static-verify.py` và GitHub Actions CI Run [`43023689371`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43023689371) trên commit `75cf1ea`, đồng thời giữ nguyên ranh giới chưa chạy `next build`, staging E2E liên container và Pilot thực địa.)*

| Bộ kiểm thử | Đường dẫn tệp kiểm chứng | Phạm vi khẳng định | Trạng thái hiện tại | Lệnh chạy thực tế |
|---|---|---|---|---|
| **Static Invariant Verifier** | [`scripts/static-verify.py`](../scripts/static-verify.py) | RBAC `@RequireRoles`/`@ExcludeRoles`, không `::uuid`, parity gateway-portal, CWE-1236 CSV, link/path docs | **PASSED (8/8, 0 lỗi)** | `python -X utf8 scripts/static-verify.py` & CI `static-verify` (`5s`) |
| **Node Workspace Build, Typecheck & Jest** | `packages/wms-engine/src/index.spec.ts`, `api-gateway/*.spec.ts`, `core-api/__tests__/*.spec.ts` | Build 6 package, `prisma generate`, `rbac-boundary`, `tenant-isolation`, `cod-reconcile`, `wms-concurrency`, `next typegen` + `tsc` 4 portals & `driver-app` | **PASSED** (CI Run `43023689371`) | Job `node-workspace` trong `.github/workflows/ci.yml` (`~1m 54s`) |
| **AI Worker Typecheck & Tests** | `workers/ai-worker/tests/{vrp,compute,llm,journey}.test.ts` | VRP 1-khách & `stops`, fallback công thức, Z-score `insufficient_sample`, `501` train, `wrapUntrustedData` | **PASSED** (CI Run `43023689371`) | Job `ai-worker` (`tsc --noEmit` + 4 `tsx` suites, `16s`) |
| **Go Vet & Race Tests** | [`backend/gps-ingestion-service/main_test.go`](../backend/gps-ingestion-service/main_test.go), [`webhook-service/main_test.go`](../backend/webhook-service/main_test.go) | HMAC UDP valid/tamper/replay, HTTP constant-time Bearer, GPS bounds (`lat 91/lng 151`), SSRF IP guard & maskSecret | **PASSED** (CI Run `43023689371`) | Job `go-services` (`go vet && go test -v -race ./...`, `1m 28s`) |
| **PostgreSQL + PostGIS RLS Test** | [`packages/prisma-schemas/prisma/tests/tenant-isolation.sql`](../packages/prisma-schemas/prisma/tests/tenant-isolation.sql) | Ép fail-closed `smartlogi_app`, chặn cross-tenant SELECT/UPDATE/DELETE (`42501`), test `app.bypass_rls` | **PASSED** (CI Run `43023689371`) | Job `postgres-rls` trên container `postgis/postgis:15-3.3` (`45s`) |
| **Rust Check & Test** | [`backend/rust-api`](../backend/rust-api) | Kiểm tra biên dịch workspace (`--all-targets`) & route metadata | **PASSED** (CI Run `43023689371`) | Job `rust-api` (`cargo check && cargo test`, `17s`) |

### `TBL-10` — Sổ Đăng ký Rủi ro Đã cập nhật (`B4 Ch.20`, tr.29)
| Mã rủi ro | Mô tả thực tế | Trạng thái sau G0–G5 | Biện pháp kiểm soát / Blocker còn lại |
|---|---|---|---|
| **RSK-01 / RSK-02 (Cũ)** | SQLite schema drift & `Scope.REQUEST` service rò rỉ | **Đã thay thế (Lịch sử)** | Dùng PostgreSQL + ALS + TX + `FORCE RLS` (58 bảng) |
| **`R01–R04, R14–R16` (VRP & WMS)** | Lỗi tuyến 1 khách, đếm `stops`, trừ dung lượng bin lặp, cộng `kg+cbm` | **Đã vá & CI PASSED** | `vrp.test.ts`, `index.spec.ts`, `wms-concurrency.spec.ts` PASSED (`43023689371`); benchmark thực địa chờ Pilot |
| **`R05–R08` (COD Finance)** | Khớp mù bỏ `qrCodeToken`, lọc sai ngày, đếm nhầm `unmatched`, mojibake | **Đã vá & CI PASSED** | `cod-reconcile.spec.ts` PASSED (`43023689371`); nhập sao kê vẫn thủ công (chưa Open Banking) |
| **`NEW-01..NEW-08` (RBAC, IDOR, `::uuid`, SSRF, Audit)** | Leo thang `admin/*`, `CUSTOMER_CLIENT` lọt vào nội bộ, driver IDOR, SSRF webhook, thiếu RLS 7 bảng, 10 `::uuid` crash | **Đã vá & CI PASSED** | `rbac-boundary`, `tenant-isolation`, `go-services -race`, `postgres-rls` (`postgis:15-3.3`) đều PASSED (`43023689371`) |
| **`R17–R19` (GPS UDP & Geofence)** | UDP không xác thực, chỉ check điểm cuối batch, SOS spam/FK `''` | **Đã vá trong code (`implemented`)** | Mặc định `GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED=false`; cần test thực địa thiết bị IoT |
| **`R20` & `NEW-09` (Mobile App)** | `HomeScreen`/`TripDetail`/`Safety`/`Expense` crash, không retry limit | **Đã vá trong code (`implemented`)** | Đã thêm `DEAD_LETTER`, backoff, `X-Sync-Id`; cần build EAS/Expo trên thiết bị |
| **`P05–P06, P13–P14, R12–R13, R21–R22` (Demo/AI)** | Nhầm lẫn số giả lập thành thực đo, `train` giả thành công, `classify` chưa nối | **Đã vá & minh bạch hóa** | `NEXT_PUBLIC_DATA_SOURCE=mock\|api`; `501` train stub; chờ thu thập dataset Pilot |

### `TBL-11` — Lộ trình Thống nhất 3 Pha & Ngân sách Tham chiếu (`B4 Ch.21`, tr.30)
*(Khớp 1-1 với Hình 21 (`FIG-21`), chấm dứt mâu thuẫn tháng 1–6 vs ngày 30–60–90 ở bản cũ.)*

| Pha & Thời lượng | Hạng mục trọng tâm | Owner | Đầu ra (Deliverables) | Tiêu chí Nghiệm thu (Exit Gate) |
|---|---|---|---|---|
| **Pha 1: Tuần 1–4**<br>*(Hạ tầng Staging & Smoke Live)* | Duy trì CI xanh (đã đạt **6/6 jobs PASSED** ở Run `43023689371`); cấp VM + Managed PostGIS/Redis + R2; cấu hình khóa thật (`JWT`, `HMAC`, `GPS_AUTH_TOKEN`, `AI_API_KEY`); chạy `next build` + smoke test E2E 4 Portals chế độ `api` trên cụm staging | Platform Lead & QA | Báo cáo CI Run `43023689371` PASSED + Staging Live URL cho cả 4 portals; log `tenant-isolation.sql` trên staging DB | Không dùng dữ liệu `mock`; test xuyên luồng Đơn -> Kho -> Chuyến -> COD đạt E2 trên staging live |
| **Pha 2: Tuần 5–8**<br>*(Đo Baseline & Huấn luyện/Thiết bị Thực địa)* | Tuần 5–6 đo baseline thật tại kho thử nghiệm; lắp đặt cân Serial + camera + barcode + app Android tài xế; xuất dữ liệu `human_corrected IS NOT NULL` qua `/v1/training-dataset`; đánh giá benchmark TS VRP vs OR-Tools trên dữ liệu đơn thật | Ops Lead, Warehouse Lead & ML Eng | Biên bản baseline có chữ ký kho; tập ảnh/đơn gắn nhãn thực tế; bảng đo Latency & Accuracy thực của MobileNet & VRP | Đủ mẫu tối thiểu (≥ 300 đơn); xác nhận thiết bị phần cứng ổn định trước khi mở rộng |
| **Pha 3: Tuần 9–12**<br>*(Pilot Vận hành có Kiểm soát & Tổng kết TCO)* | Chạy song song 4–6 tuần vận hành thực + 2 tuần đối chiếu KPI & tính TCO thực tế (cloud, API bản đồ, LLM, bảo trì); quyết định phạm vi nhân rộng SME hoặc nâng cấp OSRM/OR-Tools nếu cần | Product Owner & Ban Điều hành | Báo cáo Pilot đối chứng trước/sau có khoảng tin cậy; bảng TCO/ROI thực tế; quyết định Go/No-Go | Đạt mục tiêu `< 0,5%` sai lệch đóng gói & chứng minh tiết kiệm vận hành ròng dương trên TCO |

---

## Phần V. Đối chiếu & Chỉnh sửa 9+ Tài liệu Tham khảo (`REF-01` – `REF-09`)

| Mã | Trích dẫn gốc trong B4 | Kết quả kiểm chứng nguồn | Hướng xử lý & Trích dẫn chuẩn thay thế |
|---|---|---|---|
| **`REF-01`** | Bộ Công Thương (2023), Báo cáo Logistics Việt Nam 2023 | **Đã xác minh tên báo cáo** ([logistics.gov.vn](https://logistics.gov.vn/bao-cao-logistics-viet-nam-2023)), nhưng số `4,5%` / `45–50 tỷ USD` cần ghi chính xác chương/trang của bản PDF báo cáo | Giữ nguồn, bổ sung URL, ngày truy cập (`11/11/2026`) và chỉ rõ số trang trích dẫn từ bản in Bộ Công Thương |
| **`REF-02`** | World Bank LPI 2023 | Xếp hạng **43** xác minh khớp thông báo chính thức; **chi phí `16,8–18% GDP` KHÔNG thuộc LPI 2023** | Tách 2 nguồn độc lập: World Bank LPI 2023 cho hạng 43; trích nguồn VLA / Bộ Công Thương riêng cho tỷ lệ chi phí logistics/GDP |
| **`REF-03`** | Quy hoạch tỉnh Đồng Nai 2024 | Thiếu số Quyết định phê duyệt của Thủ tướng, mốc thời gian hiệu lực và link gốc | Bổ sung đúng số Quyết định quy hoạch thời kỳ 2021–2030 tầm nhìn 2050, URL Cổng TTĐT và ngày truy cập |
| **`REF-04`** | Ivanov, Tang & Dolgui (2021), DOI `...1843781` | **KHÔNG XÁC MINH ĐƯỢC** (Crossref trả HTTP `404` cho DOI trên tại thời điểm kiểm tra) | **Gỡ bỏ nhãn `CONFIRMED-EXTERNAL`**. Không trích dẫn làm nguồn đã kiểm chứng nếu chưa đối chiếu được bản PDF/DOI đúng |
| **`REF-05`** | Toth & Vigo (2014), ISBN qua SIAM | **Đã xác minh**: ISBN tương ứng cuốn *Vehicle Routing: Problems, Methods, and Applications*, Second Edition (SIAM, [link](https://epubs.siam.org/doi/10.1137/1.9781611973594.fm)) | Sửa chính xác tên sách và vai trò đồng chủ biên (*editors*) |
| **`REF-06`** | Wang, Zhang & Liu (2023), DOI `...3168899` | **CHƯA XÁC MINH ĐƯỢC** (Crossref bị giới hạn tần suất `429` khi đối chiếu) | Giữ nhãn **`[CHƯA XÁC MINH NGUỒN GỐC]`**, yêu cầu bổ sung bản gốc trước khi nộp bản cuối |
| **`REF-07`** | Jacobs & VLDB Journal (2018), DOI `10.1145/3183713` | **LỖI SAI THƯ MỤC ĐÃ XÁC ĐỊNH**: DOI `10.1145/3183713` trỏ tới *Proceedings of the 2018 International Conference on Management of Data (SIGMOD '18)*, không phải bài báo FEFO hay "VLDB Journal" | **Xóa khỏi các ô FEFO trong Bảng 1–2**. Thay bằng tài liệu chuẩn về PostgreSQL Row-Level Security / FEFO inventory control có thật |
| **`REF-08`** | Google OR-Tools Documentation | Tài liệu chính thức về solver tối ưu; tuy nhiên **mã nguồn hiện tại không sử dụng OR-Tools** | Đặt vào nhóm *"Tài liệu cơ sở tham khảo cho bài toán đối chứng VRPTW dự kiến"*, không trích làm minh chứng đang chạy |
| **`REF-09`** | PostGIS `ST_Contains` Documentation | Phù hợp chính xác hàm không gian đang gọi trong `gps-ingestion-service` | Bổ sung lưu ý ngữ nghĩa **điểm nằm đúng trên đường biên polygon** (`ST_Contains` trả `false` với biên, cần `ST_Covers` nếu tính cả biên) và nguồn hàm không tự chứng minh throughput |

### Tài liệu Kỹ thuật Bổ sung Cần có trong Danh mục Tham khảo Chính thức (`B4 tr.33`)
1. **PostgreSQL Global Development Group**, *Row Security Policies (`CREATE POLICY`, `FORCE ROW LEVEL SECURITY`)* & *PostGIS Geometry Types*.
2. **Prisma Documentation**, *Interactive Transactions* & *Multi-schema / Row-Level Security patterns with AsyncLocalStorage*.
3. **TensorFlow.js & `@tensorflow-models/mobilenet`**, *MobileNet v1/v2 ImageNet pre-trained weights in WebGL/WASM* (nêu rõ giới hạn 1.000 nhãn ImageNet khi chưa transfer learning).
4. **Cloudflare Developers**, *Workers AI Models (`@cf/meta/llama-3.1-8b-instruct-fast`), D1 & KV limits*.
5. **NestJS Documentation**, *Guards (`CanActivate`), ExecutionContext & Reflector Metadata* và **Expo / React Native Documentation**, *AsyncStorage & Offline Resilience*.
