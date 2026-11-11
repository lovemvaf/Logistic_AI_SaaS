# Hồ sơ Đính chính & Đồng bộ Bản 3 – Bản 4 (B3–B4 Patch Dossier)

> **Phiên bản tài liệu**: `B3-B4-PATCH-2026.11.12 (Gate G7)`  
> **Mốc mã nguồn đối chiếu**: Baseline commit `775ba1ce181191054397cb62bb7430530ce33f81` -> bản vá `75cf1ea` (Run `43023689371`) -> mở rộng Enterprise, TP Đồng Nai 2026, E2E & Vercel `visionary19` tại `4840cce` (GitHub Actions [Run `43069842957`](https://github.com/lovemvaf/Logistic_AI_SaaS/actions/runs/43069842957) — **6/6 jobs PASSED**)  
> **Nguyên tắc pháp lý & học thuật (`B3-07`)**: Hồ sơ Bản 3 đã ký ngày **`22/06/2026`** được giữ nguyên bất biến làm tài liệu lịch sử. Tài liệu này cung cấp bản sửa đổi/thay thế theo từng mục cho Bản 3 (`B3-01..B3-07`), Bản 4 (`B4-COVER`, `B4-CH01..B4-CH21`), 23 Hình (`FIG-01..FIG-23`), 11 Bảng (`TBL-01..TBL-11`) và 9+ Tài liệu tham khảo (`REF-01..REF-09`). Mọi số liệu hiệu quả kinh doanh hay độ chính xác chưa chạy thực địa đều gắn nhãn `[GIẢ ĐỊNH — CHƯA ĐO PILOT]`. Mọi kiểm thử CI (`Run 43069842957`), full-stack E2E cục bộ (`[TESTED_LOCAL]`) và Vercel Preview SSR (`4/4`) được tách rạch ròi với hạ tầng cloud public/Pilot 12 tuần (`[BLOCKED]` / `[CHƯA ĐO PILOT]`).

---

## Phần I. Đồng bộ Từng mục của Bản 3 (`B3-01` – `B3-07`)

### `B3-01` — Tên giải pháp & Phiên bản
- **Trước đây**: Dùng xen kẽ *"SmartLogi Adaptive Intelligence"* (B3) và *"SmartLogi AI SaaS"* (B4).
- **Nội dung thay thế**: Tên chính thức thống nhất là **SmartLogi AI SaaS** (*Nền tảng Quản trị Kho bãi, Điều vận 3PL & Thương mại Quốc tế Đa Khách thuê SmartLogi AI SaaS*). Tên viết tắt thương mại: **SmartLogi**. Phiên bản hồ sơ cập nhật: `v2.1-enterprise-patch (12/11/2026)`.

### `B3-02` — Giải pháp đã biết & Căn cứ đối chiếu
- **Trước đây**: Nêu 6 nhận định tổng quát về phân mảnh phần mềm, thiếu AI/multi-tenancy mà không dẫn nguồn sản phẩm cụ thể.
- **Nội dung thay thế**: Sáu thách thức phổ biến của doanh nghiệp logistics SME tại Việt Nam được minh họa qua ma trận đối chứng trong **Bảng 6 (`TBL-06`)** bên dưới (ERP toàn phần SAP S/4HANA/Odoo, phần mềm bán hàng/WMS phổ thông KiotViet/Nhanh.vn, và hệ thống tối ưu vận tải chuyên biệt Abivin vRoute). Không khái quát rằng mọi đối thủ trên thị trường đều thiếu AI hoặc kiến trúc đa khách thuê.

### `B3-03` — Sáu mục tiêu phân tách KPI Mục tiêu vs Thực trạng Mã nguồn
| Mục tiêu | Diễn đạt thay thế (Thu hẹp "toàn bộ quy trình") | Công thức KPI & Mục tiêu Pilot `[CHƯA ĐO PILOT]` | Trạng thái mã nguồn & kiểm chứng hiện tại |
|---|---|---|---|
| **1. Tự động hóa luồng lõi WMS–TMS–3PL–XNK–COD** | Chuẩn hóa trên một nền tảng các luồng kho, đóng gói, điều vận container/chành xe, DEM/DET, XNK & đối soát sao kê COD | Thời gian lập chuyến + đối soát sao kê + vòng RFQ–Booking–Invoice | Đã triển khai `11` modules (`77` files / `488` endpoints) & `91` trang web; đạt **6/6 jobs CI** (`43069842957`), Playwright `12/12 PASS` & `4` Vercel Preview SSR |
| **2. Giảm sai sót đóng gói** | Hỗ trợ xác nhận hàng hóa bằng Web Serial Barcode + gợi ý MobileNet ImageNet + bước xác nhận người vận hành | Tỷ lệ sai lệch đóng gói mục tiêu **< 0,5%** (tách lỗi phát hiện tại trạm vs lỗi lọt ra khách) | `implemented` cơ chế quét barcode + `classify()` cổng `0.60` + log đính chính |
| **3. Tối ưu hóa lộ trình kiện lẻ & container drayage** | Gom đơn và sắp thứ tự dừng/hồi rỗng tự động theo tải trọng, kích thước cont & `haversine * 1.41` | Giảm tối thiểu **15%** quãng đường/xe/ngày trên cùng tập đơn và địa bàn đối chứng | Heuristic TS NN + 2-opt (`vrp.ts`) & `solveContainerDrayage` (`container-routing.ts`); benchmark thực địa & đối chiếu OR-Tools chờ Pilot |
| **4. Dự báo, cảnh báo & hỗ trợ chứng từ XNK** | Cung cấp gợi ý bất thường Z-score, dự báo hỗ trợ và trích xuất chứng từ / mã HS (`NEEDS_CUSTOMS_REVIEW`) | MAE/RMSE trên chuỗi thời gian & tỷ lệ chấp thuận HS bởi chuyên viên hải quan (`[CHƯA ĐO PILOT]`) | LLM Workers AI / OpenAI + fallback tất định + Z-score; trả rõ `evaluation_status: "unmeasured"` / `advisoryOnly: true` |
| **5. Kiến trúc SaaS Đa khách thuê** | Cô lập dữ liệu chặt chẽ giữa nhiều doanh nghiệp thuê chung hạ tầng PostgreSQL/PostGIS | `0` ca rò rỉ đọc/ghi chéo tenant trong bộ test `tenant-isolation.sql` | ALS + `SET LOCAL search_path` + `app.tenant_id` GUC + **`88/106` bảng bật `FORCE ROW LEVEL SECURITY`** |
| **6. Vòng phản hồi cải tiến dữ liệu (HITL)** | Ghi nhận đính chính từ con người (đóng gói & duyệt mã HS) để phục vụ huấn luyện offline | Tỷ lệ bản ghi có nhãn sạch `human_corrected IS NOT NULL` & `approved_hs_code` | Xuất dataset qua `GET /api/v1/ai/v1/training-dataset`; `POST /v1/train/:type` trả `501` |

### `B3-04` — Chỉnh sửa Kỹ thuật Mục `4a–4b` (Khớp 100% Mã nguồn Hiện tại)
- **Mục 4a**: Xác định *SmartLogi AI SaaS* là **nền tảng phần mềm quản trị vận hành kho, vận tải 3PL/container & chứng từ XNK**, không phải hệ điều hành hệ thống; không gọi chức năng quản lý Bin của WMS là "Digital Twin hoàn chỉnh". AI giữ vai trò trợ lý có rào chắn (`UNTRUSTED_DATA_GUARD`, `advisoryOnly`) và thu thập nhãn HITL cho huấn luyện offline.
- **Mục 4b**:
  - *Kiến trúc*: **Modular Monolith** (`backend/core-api`, **`11` modules**, `77` controller files / `85` `@Controller` / `488` endpoint decorators) đứng sau `api/api-gateway` (Node 22 LTS, `helmet()`, BFF, gỡ `/api/v1/inbound/webhooks` khỏi `PUBLIC_PATHS`), kết hợp 2 dịch vụ Go (`gps-ingestion-service`, `webhook-service` dùng Redis Streams + IP-pinned `safeDialContext`) và Cloudflare/Hono `workers/ai-worker`.
  - *Đa khách thuê & Tin cậy*: Dùng `AsyncLocalStorage`, transaction `SET LOCAL search_path` + `app.tenant_id` GUC + `FORCE ROW LEVEL SECURITY` trên **`88/106`** bảng (gồm `client_api_keys`, `api_idempotency_records`, `public_tracking_grants`, `webhook_deliveries` và 26 bảng 3PL/Yard/XNK). Outbox v2 có lease reclaim, `emitAsync` ACK, `DEAD_LETTER` redrive; DB Idempotency kiểm xung đột `body_sha256` trả `409`.
  - *WMS*: `packages/wms-engine` thực hiện FIFO/FEFO/LIFO, kiểm tra dung lượng bin cộng dồn (`allocateWithCapacity`), Putaway chuẩn hóa tỷ lệ khối lượng + thể tích (`assignPutawayBin`), Wave gom lô ưu tiên (`generateWave`), cộng tồn kho nguyên tử kèm `version` optimistic locking.
  - *3PL Container, Yard/EIR, XNK & Địa giới TP Đồng Nai 2026*: Mô hình hóa 95 ĐVHC TP Đồng Nai 2026 (`33` phường + `62` xã, `PENDING_OFFICIAL_CODE`, `NO_OFFICIAL_POLYGON`) phân biệt hub nội tỉnh với cảng Cát Lái & Cái Mép–Thị Vải (`outsideCity: true`); phân công `TractorUnit`/`ChassisUnit`/`ContainerEquipment` chặn trùng lịch `409`; bãi `Yard`/`YardSlot`/`EIR`; tính phí lưu bãi (`DEM`) vs lưu vỏ (`DET`) tách biệt; quy trình XNK kèm khóa PDF mã hóa `HTTP 422` & duyệt tay mã HS.
  - *Pack Station & TMS & COD & GPS/Mobile*: `pack-station-web` (Web Serial + `@tensorflow-models/mobilenet >= 0.60`); TS `vrp.ts` + `container-routing.ts`; COD đối soát `qrCodeToken` trong `$transaction` qua CSV/XLSX; Go GPS UDP canonical v2 HMAC (`GPS_UDP_HMAC_SECRET`) + FIFO replay cache + batch `ST_Contains`; Expo `driver-app` dùng CSPRNG UUID + lưu `SYNCING` trước HTTP + `DEAD_LETTER` + `X-Sync-Id`.

### `B3-05` — Chỉnh sửa Mục `4c` & `5a–5d` (Kết quả, Tính mới, TCO & Điều kiện Áp dụng)
- **4c (Kết quả đã đạt)**: Đã hoàn thiện kiến trúc `11` modules Modular Monolith + Gateway + Go GPS/Webhook + Cloudflare AI Worker + `4` Next.js 15 portals (`91` trang) + Expo Mobile App (`10` màn hình), bộ test tĩnh (`8/8 PASS`), **`12/12` Jest suites (`114/114` tests)**, **`5/5` AI Worker suites (`48/48`)**, **6/6 jobs GitHub Actions CI PASSED** (Run `43069842957`), full-stack Playwright E2E **`12/12 PASS`** cục bộ và **`4` dự án Vercel Preview `visionary19` (`4/4` SSR PASS)**. Hạ tầng cloud Gateway HTTPS công khai, Cloudflare Workers Prod (`CLOUDFLARE_API_TOKEN`) & Pilot 12 tuần thực địa thuộc trạng thái `[BLOCKED]` / `[CHƯA ĐO PILOT]`.
- **5a (Tính mới)**: Nằm ở phương pháp tích hợp khép kín WMS + Pack Web Serial + TMS/3PL Container/XNK + chuẩn hóa địa giới 2026 + PostgreSQL `FORCE RLS` + offline mobile `X-Sync-Id` phù hợp cho SME, không khẳng định phát minh thuật toán VRP hay mô hình AI mới.
- **5b (Khả năng áp dụng & Thiết bị)**: Vận hành thực tế cần PC kho (RAM >= 8GB) + webcam HD + cân/máy quét Web Serial + máy chủ container hỗ trợ PostgreSQL/PostGIS, Redis >= 5.0, cổng UDP `:8091` và Cloudflare Worker.
- **5c (Hiệu quả Kinh tế & TCO)**: Không suy diễn trực tiếp `15,5%` giảm km thành `20%` tiết kiệm chi phí. Cần hạch toán TCO thực tế gồm: VPS/Container, Managed PostGIS/Redis/R2, quota Maps/Geocoding, Workers AI vượt ngưỡng free tier và chi phí thiết bị kho/vận hành.
- **5d (Mức triển khai)**: Định danh **"Nguyên mẫu Doanh nghiệp Tích hợp Đã Gia cố & Xác minh E2E/CI (Hardened Enterprise Candidate)"**, sẵn sàng bước vào giai đoạn cấp hạ tầng public backend + chạy thử nghiệm Pilot có kiểm soát.

### `B3-06` & `B3-07` — Phụ lục Truy vết (`6–7`) & Bảo toàn Chữ ký `22/06/2026`
- Phụ lục gắn trực tiếp tới [coverage.csv](upgrade/coverage.csv), [enterprise-execution-matrix.csv](upgrade/enterprise-execution-matrix.csv), [architecture-and-erd.md](architecture-and-erd.md), [api-contracts.md](api-contracts.md), [operations-runbook.md](operations-runbook.md), [ai-model-cards.md](ai-model-cards.md), [deployment/DEPLOYMENT_EVIDENCE.md](deployment/DEPLOYMENT_EVIDENCE.md) và [upgrade/verification.md](upgrade/verification.md).
- **Bảo toàn chữ ký (`B3-07`)**: Toàn bộ chữ ký, con dấu và ngày ký **`22/06/2026`** trên bản gốc B3 được lưu trữ nguyên vẹn bất biến; bản đính chính này đóng vai trò phụ lục cập nhật kỹ thuật (`11–12/11/2026`).

---

## Phần II. Đồng bộ Bìa, Mục lục, Kết luận & 21 Chương Bản 4 (`B4-COVER`, `B4-CH01` – `B4-CH21`)

| Mã mục | Nội dung đính chính / cập nhật đồng bộ với mã nguồn |
|---|---|
| **`B4-COVER`** | **Bìa & Mục lục (PDF p.1–3) & Kết luận (tr.32)**: Đổi cụm *"Bản sao số vận hành kho bãi (Digital Twin)"* thành *"Quản lý cấu trúc kho trực quan (Zone/Rack/Bin), Bãi Container/EIR & Tồn kho thời gian thực"*. Ghi rõ phiên bản `v2.1-enterprise-patch (12/11/2026)`, 23 Hình, 11 Bảng, danh mục viết tắt và kiểm tra link QR. Tại Kết luận (tr.32): bỏ các lặp lại về `Scope.REQUEST`/OR-Tools/RandomForest và gắn mục tiêu pilot từng kho có đối chứng. |
| **`B4-CH01`** | **Chương 1 — Khung Bằng chứng**: Đồng bộ 4 cấp độ `E0` (Mock), `E1` (Code `implemented`/`partial`), `E2` (Verified via `static-verify`, Jest/tsx/Go/Rust/Playwright E2E & GitHub Actions CI `43069842957`), `E3` (Pilot thực địa `[CHƯA ĐO PILOT]`). Sửa chú thích Hình 1 cho quy trình nghiên cứu A–E. |
| **`B4-CH02`** | **Chương 2 — Tổng quan Hệ thống**: Cập nhật đúng kiến trúc hiện hành (`11` module `core-api`, `api-gateway`, Go GPS/Webhook, Cloudflare `ai-worker`, `4` Next.js 15 portals `91` trang + Expo Driver App `10` màn hình). Thay OR-Tools thành TS VRP + `solveContainerDrayage`, nhận diện ImageNet + barcode, đối soát COD CSV/XLSX `qrCodeToken`. |
| **`B4-CH03`** | **Chương 3 — Cơ sở Lý thuyết & Bảng 1–2**: Loại bỏ trích dẫn sai Jacobs / VLDB 2018 (`DOI 10.1145/3183713`) khỏi cơ sở FEFO; bổ sung tài liệu chuẩn về PostgreSQL `FORCE RLS`, Interactive Transaction + ALS, PostGIS `ST_Contains`, Nearest-Neighbor + 2-opt VRP/Container Drayage, MobileNet v2 ImageNet và Z-score thống kê. |
| **`B4-CH04`** | **Chương 4 — Bối cảnh TP Đồng Nai 2026 & Đông Nam Bộ**: Ghi rõ năm, nguồn và số trang gốc cho số liệu kinh tế (Bộ Công Thương 2023, LPI 43). Tích hợp danh mục **`95` ĐVHC TP Đồng Nai 2026 (`33` phường + `62` xã)** trong bảng `administrative_units` với provenance minh bạch (`PENDING_OFFICIAL_CODE`, `NO_OFFICIAL_POLYGON`), tách rạch ròi hub nội tỉnh (`Biên Hòa`, `Long Thành`, `Nhơn Trạch`, `Phước An`) khỏi hành lang cảng ngoài địa bàn (`outsideCity = true`: **Cảng Cát Lái TP.HCM**, **Cái Mép–Thị Vải BR–VT**). Bổ sung mô hình Freight/Container/Yard/DEM-DET/XNK mới hoàn thiện trong code (nhưng chưa tích hợp EDI cảng thật hay đo thực địa). |
| **`B4-CH05`** | **Chương 5 — Khoảng trống Thị trường & Định vị SME**: Sử dụng Bảng 6 (`TBL-06`) so sánh đối thủ cụ thể kèm ngày kiểm tra tính năng/chi phí; chỉ ra phân khúc hợp nhất WMS + TMS/3PL + Container/EIR + COD + XNK cho SME mà không phủ nhận toàn bộ công nghệ đối thủ. |
| **`B4-CH06`** | **Chương 6 — Phương pháp Nghiên cứu, Kiểm toán & Usability**: Ghi rõ các đợt kiểm toán `11–12/11/2026`, kiểm tra tĩnh `scripts/static-verify.py` (`8/8 PASS`), CI 6 jobs (`43023689371` -> `43069842957` **6/6 PASSED**), cùng kiểm chứng Playwright E2E `12/12` (0 console errors, 0 HTTP 5xx, **0 overflow trên Desktop/Tablet/Mobile**), bổ sung quy chuẩn WCAG AA contrast và phỏng vấn người dùng cho Pilot. |
| **`B4-CH07`** | **Chương 7 — Kiến trúc Mục tiêu & Hiện trạng**: Đồng bộ sang Modular Monolith `11` modules + Dịch vụ chuyên biệt + Triển khai phân tầng (4 portals trên Vercel `visionary19` dùng `NEXT_PUBLIC_DATA_SOURCE=api`, backend stateful trên Docker/VM hỗ trợ UDP/Postgres/Redis). |
| **`B4-CH08`** | **Chương 8 — Đa khách thuê (ALS + `search_path` + `FORCE RLS`)**: Trình bày `PrismaService.runWithTenantRequest`, transaction-local `app.tenant_id` GUC, **`88/106` bảng công khai bật `FORCE ROW LEVEL SECURITY`** (gồm `client_api_keys`, `api_idempotency_records`, `public_tracking_grants`, `webhook_deliveries`, và `26` bảng Enterprise mới), role `smartlogi_app` (`NOSUPERUSER NOBYPASSRLS`) và `runAsPlatform()`. |
| **`B4-CH09`** | **Chương 9 — Phân quyền RBAC (`RolePermissionMap`)**: Cập nhật đầy đủ **`50` permissions** (thêm `geography`, `freight`, `yard`, `trade`, `pricing`, `tracking-grants`), cơ chế `@ExcludeRoles` -> `@RequireRoles(SUPER_ADMIN)` -> `@RequirePermissions` trước bypass, `DRIVER` không có `tasks:read` và quy tắc row-level ownership (`driver.id`, `client_id`, `user.sub`). Xem [role-guides.md](role-guides.md). |
| **`B4-CH10`** | **Chương 10 — Động cơ Kho (`wms-engine` & Concurrency)**: Ghi nhận vá `10` `::uuid` casts, sửa `allocateWithCapacity`, chuẩn hóa `assignPutawayBin`, chặn âm tồn kho, test `wms-concurrency.spec.ts` (`21` test `wms-engine` + `core-api` PASSED), giới hạn `generateWave` heuristic. |
| **`B4-CH11`** | **Chương 11 — Trạm Đóng gói CV & HITL**: Nối `model.classify(videoRef.current, 5)` trong `pack/page.tsx` (`CV_CONFIDENCE_THRESHOLD = 0.6`), sửa `store.ts`, khóa xác nhận barcode/con người, kết nối `/v1/feedback` -> `/v1/training-dataset` và `POST /v1/train/:type` (`501`). |
| **`B4-CH12`** | **Chương 12 — TMS, Container Drayage & VRP (`ai-worker`)**: Cập nhật TS VRP (`vrp.ts`) + **Container Drayage Heuristic (`container-routing.ts`: kiểm size `20GP..45HC`, reefer genset, time windows, backhaul pairing)**, công bố `haversine_circuity_1.41` và trạng thái `unmeasured_heuristic` ([`benchmark-dongnai.ts`](../workers/ai-worker/tests/benchmark-dongnai.ts)); OSRM/OR-Tools thực địa vẫn `[CHƯA ĐO PILOT]`. |
| **`B4-CH13`** | **Chương 13 — Dự báo, Bất thường & Trợ lý Chứng từ XNK/HS (Bảng 5)**: Xóa `RandomForestRegressor`/`IsolationForest`; công bố LLM + công thức fallback + Z-score + **trích xuất/đối chiếu chứng từ XNK (`HTTP 422 FAILED_PASSWORD_PROTECTED` nếu PDF mã hóa) + gợi ý HS Code (`advisoryOnly: true`, `NEEDS_CUSTOMS_REVIEW` chờ quyền `trade:approve`)**. Giữ `[CHƯA ĐO PILOT]` cho MAE/RMSE/FPR/FNR. |
| **`B4-CH14`** | **Chương 14 — Giám sát GPS, Geofence & An ninh Webhook**: Go GPS UDP `:8091` dùng canonical v2 HMAC + `GPS_UDP_HMAC_SECRET` tách riêng + FIFO replay cache + kiểm tra `heading` + batch `ST_Contains` + cooldown SOS `5` phút; kết hợp Go Webhook dùng Redis Streams + DLQ `/redrive` + `safeDialContext` ghim IP chống DNS rebinding + gỡ `/api/v1/inbound/webhooks` khỏi `PUBLIC_PATHS`. |
| **`B4-CH15`** | **Chương 15 — Dispatch Tower, Freight Control Tower, Yard/EIR & Driver App**: Đính chính `driver-app` là **Expo ~56 / React Native 0.85** dùng CSPRNG UUID + **lưu `SYNCING` trước HTTP** + monotonic sequence + `DEAD_LETTER` kết hợp DB `ApiIdempotencyRecord` (`body_sha256`, `409 Conflict`); bổ sung Freight Control Tower (`/freight`) & Yard/EIR (`/yard`) kèm chặn trùng lịch thiết bị `409`. |
| **`B4-CH16`** | **Chương 16 — Đối soát COD & Kế toán Freight DEM/DET (`AR/AP`)**: Cập nhật `reconcileBankStatement` (`qrCodeToken`/`$transaction`, CWE-1236) đồng thời bổ sung công cụ tính tách biệt **Demurrage (`DEM`) vs Detention (`DET`)** có quy tắc ngày lễ/cuối tuần + tier 1/tier 2, phân bổ thanh toán `PaymentAllocation`, sổ cái `FreightLedgerEntry` và quy trình tranh chấp `DisputeCase`. Open Banking live vẫn ngoài phạm vi. |
| **`B4-CH17`** | **Chương 17 — Kịch bản Nghiệp vụ S1–S12 & Ma trận Đối thủ**: Ghi nhận kiểm chứng thực thi **toàn bộ 12 kịch bản S1–S12 qua Playwright (`12/12 PASS`)** và `23/23` `verify-deployment.mjs` trên stack thật cục bộ (`PG18 + Redis + core-api + gateway + ai-worker + 4 portals`), đồng thời tách riêng với nghiệm thu cloud public Gateway `[BLOCKED]` & Pilot kho thật `[CHƯA ĐO PILOT]`. |
| **`B4-CH18`** | **Chương 18 — Thiết kế Pilot 12 Tuần & KPI**: Thống nhất lộ trình **12 tuần** (`2w Baseline + 8w Pilot + 2w Đối chứng`) và mục tiêu lỗi đóng gói **`< 0,5%`**; toàn bộ con số baseline/mục tiêu gắn nhãn `[GIẢ ĐỊNH — CHƯA ĐO PILOT]`. |
| **`B4-CH19`** | **Chương 19 — Kiểm chứng & Thử nghiệm (Bảng 8–9)**: Cập nhật đầy đủ `12` Jest suites (`114/114` tests), `5` AI Worker suites (`48/48`), Go `-race` (`19` tests), Rust (`8` tests), `tenant-isolation.sql` (`88/106` RLS), `static-verify.py` (`8/8`), `4x vercel-build`, `12/12` Playwright E2E, CI Run `43069842957` (`6/6`) và `4/4` Vercel Preview SSR. |
| **`B4-CH20`** | **Chương 20 — Quản trị Rủi ro (Bảng 10)**: Cập nhật toàn bộ `R01–R24`, `NEW-01..10`, `SEC-01..07`, `ENT-01..04` đã hoàn tất trong code/test/CI cùng các blocker hạ tầng public & Pilot thực địa còn lại. |
| **`B4-CH21`** | **Chương 21 — Lộ trình Phát triển & Kết luận (Bảng 11 & Hình 21)**: Thống nhất **3 Pha (Tuần 1–4, 5–8, 9–12)**, trong đó Pha chuẩn bị kỹ thuật (hệ thống 4 portals Vercel + CI + E2E local) đã sẵn sàng để nối domain public backend và khởi động Pha 1 Pilot. |

---

## Phần III. Danh sách Đính chính Toàn bộ 23 Hình (`FIG-01` – `FIG-23`)

| ID Hình | Vị trí B4 | Vấn đề trên hình cũ | Nội dung & Đặc tả thay thế (Chú thích + Nhãn + Logic đúng) |
|---|---|---|---|
| **`FIG-01`** | tr.1 | Hình vẽ chuỗi 5 bước A–E nhưng chú thích là *"Tháp phân loại độ tin cậy bằng chứng"* | Đổi chú thích: *"Hình 1. Quy trình 5 bước thu thập và đối chiếu bằng chứng nghiên cứu (A–E)"*, tách biệt với Bảng E0–E3. |
| **`FIG-02`** | tr.2 | Vẽ 8+ microservices + Kong Gateway cũ | Sơ đồ 5 runtime thực tế: 4 Portals (`91` tr.) + Driver App (`10` màn) -> `api/api-gateway` -> `backend/core-api` (`11` modules) + Go GPS/Webhook + Cloudflare `ai-worker`. |
| **`FIG-03`** | tr.8 | Bản đồ phân bố vùng công nghiệp thiếu nguồn và năm | Gắn nhãn *"Minh họa định hướng khu vực công nghiệp trọng điểm"*, ghi nguồn quy hoạch thời điểm tham chiếu. |
| **`FIG-04`** | tr.8 | Gộp cảng Cái Mép–Thị Vải vào nội tỉnh Đồng Nai | Phân biệt rạch ròi **`95` ĐVHC nội tỉnh TP Đồng Nai 2026** (`PENDING_OFFICIAL_CODE`, `NO_OFFICIAL_POLYGON`) với **Trục kết nối vùng (`outsideCity: true`)** tới Cát Lái (TP.HCM) & Cái Mép–Thị Vải (BR–VT). |
| **`FIG-05`** | tr.8 | Hình ảnh khu công nghiệp / kho phối cảnh dễ hiểu nhầm triển khai thật | Giữ rõ nhãn `[ẢNH Ý TƯỞNG — MINH HỌA NGHIÊN CỨU]`, ghi nguồn cấp phép ảnh trước khi xuất bản. |
| **`FIG-06`** | tr.9 | Định vị khoảng trống thị trường chưa gắn nguồn đối thủ | Gắn tham chiếu trực tiếp sang dữ liệu Bảng 6 (`TBL-06`), chú thích trục X/Y kèm ngày truy xuất. |
| **`FIG-07`** | tr.10 | Sơ đồ phương pháp đề xuất dùng thay minh chứng đã chạy test | Ghi rõ quy trình kiểm toán/kiểm thử thực tế đã hoàn thành (`static-verify` `8/8`, CI `43069842957` `6/6`, Playwright `12/12`) vs giai đoạn chờ public backend & Pilot (`E3`). |
| **`FIG-08`** | tr.12 | Sơ đồ chi tiết microservices tách rời cũ | Vẽ lại cấu trúc bên trong `backend/core-api`: **`11` NestJS Modules** (`iam`, `wms`, `orders`, `logistics`, `customer`, `notification`, `geography`, `freight`, `yard`, `pricing`, `trade`) dùng chung `PrismaModule`, `CoreAuthModule`, `OutboxModule` v2, `KafkaModule` & `PermissionsGuard`. |
| **`FIG-09`** | tr.13 | Sơ đồ Docker có Kong và dễ nhầm với Vercel production | Vẽ topology kết hợp thực tế: **4 Portal Next.js 15 trên Vercel `visionary19`** kết nối via `API_INTERNAL_URL` tới **Cụm Backend Stateful (`api-gateway`, `core-api`, `gps-ingestion-service`, `webhook-service`, PostGIS, Redis 7, S3/R2)** + **Cloudflare Worker** (xem [DEPLOYMENT_TOPOLOGY.md](deployment/DEPLOYMENT_TOPOLOGY.md)). |
| **`FIG-10`** | tr.13 | Luồng `Scope.REQUEST` + `switchSchema` đơn lẻ cũ | Thay bằng sơ đồ trình tự **`AsyncLocalStorage` + Transaction `SET LOCAL search_path` + `app.tenant_id` GUC + `FORCE ROW LEVEL SECURITY` (`88/106` bảng)** kèm nhánh `runAsPlatform()`. |
| **`FIG-11`** | tr.15 | Luồng FEFO thiếu đơn vị, thiếu đầu vào & ví dụ kiểm chứng | Bổ sung ví dụ số cụ thể (`kg`/`cbm`) cùng kiểm tra `quantityAvailable >= 0` và `allocateWithCapacity`. |
| **`FIG-12`** | tr.16 | Luồng Optimistic Locking chỉ là logic khái niệm | Gắn nhãn cơ chế version locking trong `InventoryService` + test `wms-concurrency.spec.ts` (benchmark tải cao thực địa chờ Pilot). |
| **`FIG-13`** | tr.17 | Ảnh trạm đóng gói không ghi nhãn nguồn/concept | Bổ sung nhãn **`[ẢNH MINH HỌA CONCEPT — THAY BẰNG ẢNH CHỤP THỰC TẾ KHI LẮP TRẠM PILOT]`**. |
| **`FIG-14`** | tr.18 | Vẽ khép kín vòng lặp Feedback -> Auto-Retrain | Tô nét đứt **`[CHƯA TRIỂN KHAI ONLINE — HTTP 501]`** tại khối huấn luyện tự động; vẽ đường thực tại `/v1/feedback` -> `/v1/training-dataset` -> Huấn luyện offline. |
| **`FIG-15`** | tr.19 | Gắn tên Google OR-Tools cho sơ đồ định tuyến | Đổi sang **"Luồng tối ưu TS Heuristic (`solveRouting` & `solveContainerDrayage` trên `haversine_circuity_1.41`)"**, hiển thị `unassigned` kèm lý do và nhãn `unmeasured_heuristic`. |
| **`FIG-16`** | tr.21 | Thiếu chi tiết xác thực GPS UDP/Webhook & chống SSRF | Bổ sung `HTTP :8090` (`ConstantTimeCompare`), `UDP :8091` (canonical v2 HMAC dùng `GPS_UDP_HMAC_SECRET` + 300s + FIFO replay), batch `ST_Contains`, cộng thêm **Go Webhook Redis Streams + `safeDialContext` IP-pinning**. |
| **`FIG-17`** | tr.22 | Sơ đồ Dispatch Tower dễ nhầm đã có GPS thực địa | Giữ rõ nhãn `[KIẾN TRÚC & DỮ LIỆU DEMO — CHƯA CHẠY THIẾT BỊ THỰC ĐỊA]`; sửa Mobile App thành `Expo React Native Driver App` (CSPRNG UUID + `SYNCING` checkpoint + `DEAD_LETTER` + `X-Sync-Id` / `body_sha256` `409`). |
| **`FIG-18`** | tr.23 | Vẽ khớp tự động `qrCodeToken` dù code cũ chưa làm & Open Banking | Cập nhật đúng luồng COD CSV/XLSX (`qrCodeToken`/`$transaction`, `[CHƯA TÍCH HỢP OPEN BANKING]`) kết hợp luồng tính phí **DEM/DET tách biệt** & phân bổ hóa đơn AR/AP. |
| **`FIG-19`** | tr.26 | Sơ đồ Pilot 2+8 tuần mâu thuẫn "3 tháng" | Vẽ lại biểu đồ Gantt **12 tuần (3 tháng)**: Tuần 1–2 Baseline + Tuần 3–10 Pilot + Tuần 11–12 Đối chứng. |
| **`FIG-20`** | tr.26 | Trộn 3 đơn vị & lệch `0,4%` vs `< 0,5%` | Tách thành **3 subplot độc lập** (Phút, %, km/ngày/xe), thống nhất **`< 0,5%`** và gắn `[GIẢ ĐỊNH — CHƯA ĐO PILOT]`. |
| **`FIG-21`** | tr.30 | Mốc thời gian không khớp Bảng 11 | Đồng bộ 1-1 với **Bảng 11 (`TBL-11`)** theo **3 Pha (Tuần 1–4, 5–8, 9–12)**. |
| **`FIG-22`** | tr.31 | Sơ đồ GPS nhưng chú thích là *"Kiến trúc tổng thể"* | Đổi chú thích thành **"Hình 22. Chi tiết luồng xử lý GPS Telemetry, PostGIS Geofence & Cảnh báo SOS (Code hiện hành)"**. |
| **`FIG-23`** | tr.32 | Trình bày ROI như kết quả đã đạt | Gắn nhãn rõ **"Hình 23. Mô hình kỳ vọng giá trị & cấu trúc TCO cần kiểm chứng qua Pilot `[GIẢ ĐỊNH]`"**. |

---

## Phần IV. Toàn bộ 11 Bảng Đính chính / Sinh lại từ Mã nguồn (`TBL-01` – `TBL-11`)

### `TBL-01` & `TBL-02` — Bảng Cơ sở Lý thuyết & Ma trận Rà soát Tài liệu (`B4 Ch.3`, tr.4–5)
- **Đính chính `TBL-01`**: Thay Jacobs/VLDB 2018 bằng nguồn chính thức PostgreSQL `FORCE ROW LEVEL SECURITY` và Prisma Interactive Transactions; đặt TS VRP / Container Drayage heuristic cạnh đối chứng OR-Tools tương lai; làm rõ MobileNet ImageNet v2 cổng `0.60` + barcode HITL.
- **Đính chính `TBL-02` (`LR-01..LR-10`)**: Tách nhóm **Tài liệu học thuật đã xác minh** (`Toth & Vigo 2014`, `PostGIS ST_Contains`, `ACM SIGMOD 2018`) với **Tài liệu kỹ thuật chính thức** (`NestJS`, `Prisma`, `Cloudflare Workers AI`, `TensorFlow.js`) và nhóm **Chưa xác minh / Thực địa** (bỏ *"Auto Banking"* thiếu nguồn).

### `TBL-03` — Bảng Vùng Ứng dụng, Địa giới 2026 & Nguồn Quy hoạch (`B4 Ch.4`, tr.7)
- Mọi chỉ số quy mô KCN/cảng biển (Đông Nam Bộ, ĐBSH, ĐBSCL, Duyên Hải Miền Trung) phải trích kèm **văn bản quy hoạch, năm ban hành và đường dẫn truy xuất**. Về phạm vi phần mềm: ngoài WMS/TMS truyền thống, bản nâng cấp đã mô hình hóa và kiểm thử ở mức code/DB/UI nghiệp vụ **95 ĐVHC TP Đồng Nai 2026**, **Container/Chassis/Yard/EIR**, **RFQ–Booking–DEM/DET** và **XNK/HS Advisory**; tuy nhiên **kết nối EDI cảng biển trực tiếp (TOS Cát Lái / Cái Mép), VNACCS thật và thiết bị cân/GPS thực địa** vẫn chưa kích hoạt ngoài môi trường tích hợp thực địa.

### `TBL-04` — Ma trận Phân quyền RBAC Chuẩn xác từ `RolePermissionMap` (`B4 Ch.9`, tr.14)
*(Sinh trực tiếp từ [`role-permission-map.ts`](../packages/shared-types/src/role-permission-map.ts) — `50` chuỗi quyền, [`permissions.guard.ts`](../packages/shared-types/src/guards/permissions.guard.ts) và các controller thực tế.)*

| Vai trò | Phạm vi & Cơ chế chặn | Đọc/Sửa Kho & Bãi | Task & Pack Scan | Đơn, Freight 3PL & Geo | XNK & Hải quan | Điều phối & Equipment | Billing / COD / DEM-DET | Audit & Cài đặt Tenant | Row-Level Ownership |
|---|---|---|---|---|---|---|---|---|---|
| `SUPER_ADMIN` | Platform (`@RequireRoles`) | Bypass* | Bypass* | Toàn quyền Geo Admin + Bypass* | Bypass* | Bypass* | Toàn quyền Platform Billing | Toàn quyền Audit + Outbox Redrive | Xuyên tenant (`SystemAdmin`) |
| `TENANT_ADMIN` | Nội bộ 1 Tenant | Kho: Đọc+Sửa; Bãi: Đọc+Quản lý | Đọc+Tạo+Sửa & Pack Scan | Đọc Geo; Đọc+Tạo Đơn; Quản lý Freight & Tracking Grant | Đọc+Duyệt (`trade:approve`) | Điều phối Chuyến/Xe/Tài xế/Container | Đọc SaaS Billing + Quản lý Pricing/DEM-DET + COD | Đọc Audit Tenant + Cài đặt + API Keys | Chặn `/admin/*` & `/geography/admin/*` |
| `WAREHOUSE_MANAGER` | Kho & Bãi Tenant | Kho: Đọc+Sửa; Bãi: Đọc+Quản lý | Đọc+Tạo+Sửa & Pack Scan | Đọc Geo, Đọc Đơn & Freight | Không | Xem Xe | Không (`BillingManage` cấm) | Không | Giới hạn trong `tenant_id` |
| `WAREHOUSE_STAFF` | Thao tác Kho & Trạm | Kho: Chỉ Đọc; Bãi: Chỉ Đọc | Đọc+Cập nhật & Pack Scan | Đọc Geo | Không | Không | Không | Không | `staffId = req.user.sub` khi mở ca |
| `LOGISTICS_MANAGER` | Điều vận 3PL & Container | Bãi: Đọc+Quản lý | Không | Đọc Geo; Đọc+Tạo Đơn; Quản lý Freight & Tracking Grant | Chỉ Đọc (`trade:read`) | Điều phối Chuyến/Xe/Tài xế/Container | Đọc Pricing; Duyệt COD (cấm `BillingManage`) | Không | Giới hạn trong `tenant_id` |
| `DRIVER` | App Tài xế | Không | **Không** (`mobile/trips`) | Không | Không | Chỉ đọc chuyến mình | Tạo phiếu nộp COD riêng | Không | Khóa cứng `trip.driverId === driver.id` |
| `CUSTOMER_CLIENT` | Cổng Khách B2B (`/client/*`) | Tồn của mình | Không | Đọc Geo; Đơn+RFQ/Quote & Tracking Grant của mình | Upload & Xem Chứng từ mình | Không | Hóa đơn SaaS/Freight & Tranh chấp mình | Webhook cá nhân (SSRF) | `@ExcludeRoles` chặn route nội bộ; lọc `client_id` |
| `TENANT_USER` | Người xem chuẩn | Chỉ Đọc Kho/Bãi | Chỉ Đọc Task | Chỉ Đọc Geo, Đơn, Freight | Chỉ Đọc | Chỉ Đọc Chuyến | Chỉ Đọc Pricing | Không | Giới hạn trong `tenant_id` |

*\* `SUPER_ADMIN` bypass tenant permissions chỉ sau khi vượt qua kiểm tra tường minh `@ExcludeRoles` / `@RequireRoles`.*

### `TBL-05` — Mô hình AI, Heuristic & Trạng thái Đo lường Thực tế (`B4 Ch.13`, tr.20)
*(Loại bỏ hoàn toàn tên `RandomForestRegressor` và `IsolationForest`; mọi chỉ số độ chính xác thực nghiệm để `[CHƯA ĐO PILOT]`.)*

| Tên bài toán | Thành phần thực tế | Kỹ thuật & Công thức thực thi | Đầu vào chính | Cơ chế Fallback | Chỉ số Pilot cần đo (Hiện tại: Trống) |
|---|---|---|---|---|---|
| **1. Tối ưu tuyến VRP kiện lẻ** | [`vrp.ts`](../workers/ai-worker/src/lib/vrp.ts) | TS NN + 2-opt; `floor(haversine * 1.41)` | `locations[]`, `vehicles[]`, `depotIndex` | Trả `unassigned[]` kèm lý do | Gap % vs OR-Tools: `[CHƯA ĐO PILOT]` |
| **2. Điều phối Container Drayage** | [`container-routing.ts`](../workers/ai-worker/src/lib/container-routing.ts) | Time-window + backhaul heuristic trên `haversine_circuity_1.41` | Size `20GP..45HC`, reefer flag, tải trọng, cửa sổ giờ | Trả lý do cụ thể (`NO_REEFER_GENSET_TRACTOR`...) | Empty miles % thật trên đội xe Đồng Nai: `[CHƯA ĐO PILOT — unmeasured_heuristic]` |
| **3. Trích xuất & Đối chiếu XNK + HS Advisory** | [`trade-documents.ts`](../workers/ai-worker/src/routes/trade-documents.ts), [`hs-code.ts`](../workers/ai-worker/src/routes/hs-code.ts) | LLM JSON (`wrapUntrustedData`) + `advisoryOnly: true`, `NEEDS_CUSTOMS_REVIEW` | Text chứng từ CI/PL/B/L, mô tả hàng hóa | Regex tất định / từ khóa HS; **PDF mã hóa trả `422 FAILED_PASSWORD_PROTECTED`** | Precision/Recall trích xuất & Top-3 accuracy HS duyệt tay: `[CHƯA ĐO PILOT]` |
| **4. Dự báo nhu cầu, ETA & Churn + Bất thường** | [`compute.ts`](../workers/ai-worker/src/routes/compute.ts) | LLM JSON prompt / Z-score mẫu (`min_recommended_samples: 5`) | Lịch sử đơn, ngày/giờ, chuỗi số | Công thức tất định / gắn `insufficient_sample` | MAE/RMSE/AUC/FPR/FNR: `[CHƯA ĐO PILOT]` |
| **5. Hỗ trợ nhận diện SKU trạm đóng gói** | [`cv-mapper.ts`](../frontend/reporting/pack-station-web/src/lib/cv-mapper.ts) | `@tensorflow-models/mobilenet` ImageNet v2 (`>= 0.60`) | Khung hình `videoRef` mỗi `1.5s` | Bắt buộc Web Serial Barcode / nhập tay | Top-1 Accuracy, Confusion Matrix: `[CHƯA ĐO PILOT]` |

### `TBL-06` — Ma trận Định vị Sản phẩm & Đối thủ Tham khảo (`B4 Ch.17`, tr.24)
*(Ngày truy xuất tham chiếu thông tin sản phẩm công khai: `11–12/11/2026`. Bỏ hoàn toàn nhận định cảm tính "mọi đối thủ không có AI / đòi GPU riêng".)*

| Giải pháp / Nhóm | Trọng tâm chính | Kiến trúc AI / Tối ưu công bố | Mô hình chi phí công khai | Định vị khác biệt của SmartLogi AI SaaS |
|---|---|---|---|---|
| **SAP S/4HANA EWM/TM** | Enterprise quy mô lớn | Tối ưu tuyến nâng cao, hoạch định chuỗi cung ứng sâu | Phí license + triển khai doanh nghiệp lớn, dài tháng–năm | Nhắm SME không đủ ngân sách/nhân lực IT vận hành ERP nặng |
| **Odoo Inventory + Fleet (Enterprise)** | ERP mô-đun linh hoạt | Tùy biến ngoài cho COD/EIR VN & GPS UDP | Theo số user/tháng + chi phí địa phương hóa VN | Đóng gói sẵn luồng COD VN, 95 ĐVHC Đồng Nai 2026, DEM/DET, RLS đa tenant |
| **KiotViet / Nhanh.vn** | Bán lẻ đa kênh & đẩy đơn 3PL | Tập trung POS/sàn TMĐT & hãng vận chuyển ngoài | Thuê bao cửa hàng phổ thông | Nhắm đơn vị **vận hành kho riêng, đội xe cont nội bộ & chứng từ XNK** |
| **Abivin vRoute** | Tối ưu lộ trình TMS chuyên sâu | VRPTW/multi-echelon công nghiệp | Thuê bao theo xe/tính năng B2B | Hợp nhất **WMS + Pack Web Serial + TMS/3PL/Yard + COD + XNK** trong 1 nền tảng |
| **SmartLogi AI SaaS** | Hợp nhất WMS + Pack + 3PL/Yard + XNK + COD | TS VRP/Drayage + LLM Fallback + MobileNet HITL + HS Advisory | Xây bảng giá theo mô hình TCO thực tế sau Pilot | Nguyên mẫu Enterprise đã kiểm chứng CI/E2E cục bộ; chờ Pilot xác nhận thực địa |

### `TBL-07` — Bảng Thiết kế Pilot & Công thức KPI Chuẩn hóa (`B4 Ch.18`, tr.25)
| Chỉ số KPI | Công thức đo thực tế | Giá trị Baseline `[GIẢ ĐỊNH — CHƯA ĐO PILOT]` | Mục tiêu Pilot (12 tuần) | Cỡ mẫu & Biến kiểm soát bắt buộc |
|---|---|---|---|---|
| **Thời gian soạn & đóng gói / đơn** | $\text{Avg}(t_{\text{seal}} - t_{\text{pick\_start}})$ từ `StaffShift` & `PackStationLog` | `8,5 phút/đơn` `[GIẢ ĐỊNH]` | `6,0 phút/đơn` (~29,4% giảm) | Tối thiểu 300–500 đơn/nhóm; phân tầng 1 SKU vs đa SKU |
| **Tỷ lệ lỗi đóng gói** | `(Lỗi tại trạm + Khiếu nại sai SKU) / Tổng đơn xuất` | `2,1%` `[GIẢ ĐỊNH]` | **`< 0,5%`** (thống nhất) | Tách riêng lỗi chặn tại trạm vs lỗi lọt ra khách |
| **Quãng đường di chuyển/xe/ngày** | $\sum \text{actualDistanceKm} / \text{số ngày-xe hoạt động}$ | `142 km/ngày/xe` `[GIẢ ĐỊNH]` | `120 km/ngày/xe` (~15,5% giảm) | Khống chế mật độ điểm dừng, tải trọng xe & tuyến Đồng Nai |
| **Thời gian lập & phân chuyến** | `nhập đơn -> geocode -> solve -> điều phối duyệt` | `45 phút/đợt` `[GIẢ ĐỊNH]` | `5 phút/đợt` | Đo bấm giờ quy trình thủ công đối chứng vs hệ thống |
| **Thời gian đối soát COD/ngày** | `t_reconciled - t_upload_statement` | `120 phút/ngày` `[GIẢ ĐỊNH]` | `5 phút/ngày` | Cùng khối lượng 100–300 phiếu nộp kèm ca lệch/trùng |

### `TBL-08` — Danh mục Mã nguồn & Thực trạng Triển khai (`B4 Ch.19`, tr.27)
| Phân hệ | Đường dẫn thực tế đã xác minh | Chức năng lõi đã triển khai | Trạng thái (`lifecycle_status`) |
|---|---|---|---|
| **API Gateway / BFF** | [`api/api-gateway/src/config/services.config.ts`](../api/api-gateway/src/config/services.config.ts) | `helmet()`, CORS, JWT Guard (bỏ `/inbound/webhooks` khỏi `PUBLIC_PATHS`), `ROUTE_RULES` `11` modules, circuit breaker | `implemented` (CI `43069842957` & E2E PASS) |
| **Core API (`11` Modules)** | [`backend/core-api/src/app.module.ts`](../backend/core-api/src/app.module.ts) | `77` files (`85` `@Controller`, `488` eps), ALS+RLS, Outbox v2 lease/`emitAsync`/DLQ redrive, DB Idempotency SHA-256 `409`, Geography 2026 + Freight + Yard/EIR + Pricing DEM/DET + Trade | `implemented` (`82/82` Jest & CI `43069842957` PASS) |
| **Prisma Schema & RLS** | [`packages/prisma-schemas/prisma/schema.prisma`](../packages/prisma-schemas/prisma/schema.prisma) | **`104` models**, `7` migrations, **`88/106` bảng `FORCE RLS`**, `tenant-isolation.sql`, `demo-enterprise.ts` (khóa an toàn chống prod) | `implemented` (`postgres-rls` CI & local PG18 PASS) |
| **WMS Engine & Offline Sync** | [`packages/wms-engine/src/index.ts`](../packages/wms-engine/src/index.ts), [`driver-app/src/lib/offline-sync.ts`](../frontend/mobile/driver-app/src/lib/offline-sync.ts) | FIFO/FEFO/LIFO, `allocateWithCapacity`, normalized `assignPutawayBin`, CSPRNG + pre-flight `SYNCING` + `DEAD_LETTER` | `implemented` (`21/21` Jest & `driver-app tsc` PASS) |
| **Go GPS & Webhook** | [`backend/gps-ingestion-service/main.go`](../backend/gps-ingestion-service/main.go), [`webhook-service/main.go`](../backend/webhook-service/main.go) | HTTP constant-time Bearer, UDP canonical v2 HMAC (`GPS_UDP_HMAC_SECRET`), Webhook Redis Streams + DLQ/redrive + `safeDialContext` IP-pinning | `implemented` (`go-services -race` `19` tests PASSED) |
| **Cloudflare AI Worker** | [`workers/ai-worker/src/index.ts`](../workers/ai-worker/src/index.ts) | TS VRP, Container Drayage (`unmeasured_heuristic`), Trade Extract (`422` encrypted) & HS Advisory (`NEEDS_CUSTOMS_REVIEW`), Z-score, `train` `501` | `implemented` (`5/5` suites `48/48` local; live CF prod `[BLOCKED]`) |
| **4 Web Portals (`91` trang)** | `frontend/feature-test/admin-portal`, `frontend/reporting/{tenant,customer}-portal`, `pack-station-web` | `18+53+14+6 = 91` trang, `NEXT_PUBLIC_DATA_SOURCE=api` (no silent fallback), CWE-1236 CSV, MobileNet `classify()` `>=0.60`, Vercel `visionary19` `4/4` Preview | `implemented` (`4x next build`, `12/12` Playwright, Vercel SSR `4/4` PASS) |
| **Driver Mobile App** | [`frontend/mobile/driver-app`](../frontend/mobile/driver-app) | Expo ~56 / RN 0.85, `10` màn hình, CSPRNG `OfflineSyncEngine` | `implemented` (`tsc` PASSED; native EAS pending) |
| **Rust API** | [`backend/rust-api`](../backend/rust-api) | Experimental Axum parity workspace (`501` routes + stub AI) | `partial` (`8` tests + `cargo check` PASSED; thử nghiệm) |

### `TBL-09` — Ma trận Kiểm thử & Chứng cứ Thực thi (`B4 Ch.19`, tr.28)
| Bộ kiểm thử | Đường dẫn tệp kiểm chứng | Phạm vi khẳng định | Trạng thái hiện tại | Lệnh chạy thực tế |
|---|---|---|---|---|
| **Static Invariant Verifier** | [`scripts/static-verify.py`](../scripts/static-verify.py) | RBAC `@RequireRoles`/`@ExcludeRoles`, zero `::uuid`, RLS, parity gateway-portal, CWE-1236 CSV, links & `173` ID `coverage.csv` | **PASSED (`8/8`, `0` lỗi)** | `python -X utf8 scripts/static-verify.py` & CI |
| **Node Build, 4x `next build`, Typecheck & Jest** | `wms-engine`, `api-gateway` (`3`), `core-api` (`8`) | **`12/12` suites / `114/114` tests**: RBAC, RLS, COD, WMS, Outbox v2, Idempotency `409`, Freight/Geo/DEM-DET + `4` Next.js 15 portals build | **PASSED** (`[TESTED_LOCAL]` & CI `43069842957`) | `jest` & GitHub Actions `node-workspace` |
| **AI Worker Typecheck & Suites** | `workers/ai-worker/tests/{vrp,compute,llm,journey,enterprise}.test.ts` | **`5/5` suites / `48/48` assertions**: VRP, fallback `unmeasured`, `501` train, Container Drayage, encrypted PDF `422`, HS review | **PASSED (`48/48`)** | `npx tsx tests/*.test.ts` (đã thêm `enterprise.test.ts` vào CI) |
| **Go Vet & Race Tests** | [`gps-ingestion-service/main_test.go`](../backend/gps-ingestion-service/main_test.go), [`webhook-service/main_test.go`](../backend/webhook-service/main_test.go) | **`19` tests `-race`**: canonical v2 HMAC, SSRF DNS rebind `safeDialContext`, Redis Streams `dispatchWG` sync, auth token | **PASSED (`[CI]`)** | Job `go-services` Run `43069842957` (`go vet && go test -v -race ./...`) |
| **PostgreSQL + PostGIS RLS & Demo Seed** | [`tenant-isolation.sql`](../packages/prisma-schemas/prisma/tests/tenant-isolation.sql), [`demo-enterprise.ts`](../packages/prisma-schemas/prisma/seeds/demo-enterprise.ts) | `88/106` `FORCE RLS`, fail-closed `42501`, `app.bypass_rls`, idempotent `demo:reset -> db:seed:demo -> demo:verify` (`95` ĐVHC Đồng Nai 2026...) | **PASSED** (`[TESTED_LOCAL]` PG18 & CI `postgis:15-3.3`) | `psql -v ON_ERROR_STOP=1 -f tenant-isolation.sql` & `pnpm demo:verify` |
| **Full-Stack E2E & Vercel Smoke** | [`tests/e2e/verify_s1_s12.py`](../tests/e2e/verify_s1_s12.py), [`scripts/verify-deployment.mjs`](../scripts/verify-deployment.mjs) | **`12/12` Playwright S1–S12** (0 console errors, 0 5xx, 0 overflow), **`23/23` local stack**, **`4/4` Vercel Preview SSR** (`visionary19`) | **PASSED** (`[TESTED_LOCAL]` & Vercel SSR) | `python tests/e2e/verify_s1_s12.py` & `node scripts/verify-deployment.mjs` |
| **Rust Check & Test** | [`backend/rust-api`](../backend/rust-api) | Biên dịch `--all-targets` & **`8` unit test** | **PASSED** (CI `43069842957`) | `cargo check --workspace --all-targets && cargo test` |

### `TBL-10` — Sổ Đăng ký Rủi ro Đã cập nhật (`B4 Ch.20`, tr.29)
| Mã rủi ro | Mô tả thực tế | Trạng thái sau G0–G7 | Biện pháp kiểm soát / Blocker còn lại |
|---|---|---|---|
| **RSK-01 / RSK-02 (Cũ)** | SQLite schema drift & `Scope.REQUEST` service rò rỉ | **Đã thay thế (Lịch sử)** | Dùng PostgreSQL + ALS + TX + **`88/106` bảng `FORCE RLS`** |
| **`SEC-01..07` (P0/P1 Reliability & Edge)** | Outbox thiếu lease/ACK, Idempotency RAM map, UDP HMAC yếu, Webhook LPUSH/DNS rebinding/`PUBLIC_PATHS`, ClientApiKey non-RLS, CSPRNG sync, Node 20 EOL | **Đã vá & kiểm chứng CI/Local** | Unit specs (`outbox-dispatcher`, `idempotency`), Go `-race`, PG18/CI RLS & `static-verify.py` đều PASS |
| **`R01–R08, R14–R16` (VRP, WMS, COD)** | Lỗi tuyến 1 khách, `stops`, dung lượng bin cộng dồn, `qrCodeToken` COD, CWE-1236 | **Đã vá & CI PASSED** | `vrp.test.ts`, `index.spec.ts`, `wms-concurrency.spec.ts`, `cod-reconcile.spec.ts` PASSED; Open Banking & OR-Tools thực địa chờ Pilot |
| **`R17–R20, NEW-01..10`** | RBAC `SUPER_ADMIN` / `CUSTOMER_CLIENT`, IDOR tài xế, `::uuid` SQL, SSRF, Driver crash, Admin fallback mock | **Đã vá & xác minh E2E/CI** | Kiểm chứng xuyên qua `12/12` Playwright S1–S12 & CI `43069842957` |
| **`ENT-01..04, FE-01..02, OPS-01` (Enterprise, 2026 & Vercel)** | Địa giới 2026, Container/Yard/DEM-DET/XNK, UI responsive, 4 project Vercel | **Đã triển khai & nghiệm thu local/SSR** | Live API qua domain Vercel & Cloudflare Prod mang nhãn `[BLOCKED]` (chờ cấp HTTPS Gateway host + `CLOUDFLARE_API_TOKEN`); Pilot `[CHƯA ĐO PILOT]` |

### `TBL-11` — Lộ trình Thống nhất 3 Pha & Ngân sách Tham chiếu (`B4 Ch.21`, tr.30)
*(Khớp 1-1 với Hình 21 (`FIG-21`).)*

| Pha & Thời lượng | Hạng mục trọng tâm | Owner | Đầu ra (Deliverables) | Tiêu chí Nghiệm thu (Exit Gate) |
|---|---|---|---|---|
| **Pha 1: Tuần 1–4**<br>*(Kết nối Cloud Gateway Public & Smoke Production)* | Đưa cụm stateful (`api-gateway`, `core-api`, Go GPS/Webhook, PostGIS `smartlogi_app`, Redis >= 7) lên cloud host; gắn `API_INTERNAL_URL` cho `4` project Vercel `visionary19`; merge PR vào `main` kích hoạt Production Deployment & deploy `ai-worker` Cloudflare Prod | Platform Lead & DevOps | `node scripts/verify-deployment.mjs` (không `--skip-proxy`) **PASS 100%** trên cả 4 domain Production + live Workers AI | 0 mock fallback, 0 lỗi `42501`/`5xx` xuyên từ Vercel -> Gateway -> PostGIS |
| **Pha 2: Tuần 5–8**<br>*(Đo Baseline & Huấn luyện/Thiết bị Thực địa)* | Tuần 5–6 đo baseline thật tại kho Đồng Nai; lắp cân Serial + webcam + đầu đọc barcode + EAS Android/iOS tài xế; xuất dữ liệu `human_corrected IS NOT NULL` & HS approved; đối chứng VRP/Container Drayage với OR-Tools | Ops Lead, Warehouse Lead & ML Eng | Biên bản baseline có chữ ký; tập nhãn ảnh/HS thật; bảng Latency/Accuracy thực | Đủ >= 300 đơn chuẩn; phần cứng ổn định trước mở rộng |
| **Pha 3: Tuần 9–12**<br>*(Pilot Vận hành có Kiểm soát & Tổng kết TCO)* | Chạy 4–6 tuần vận hành song song + 2 tuần đối chứng KPI & tính TCO thực tế (Cloud, Maps API, LLM Neurons, bảo trì) | Product Owner & Ban Điều hành | Báo cáo Pilot trước/sau có khoảng tin cậy; bảng TCO/ROI; Go/No-Go | Lỗi đóng gói `< 0,5%`, kiểm chứng hiệu quả ròng trên TCO |

---

## Phần V. Đối chiếu & Chỉnh sửa 9+ Tài liệu Tham khảo (`REF-01` – `REF-09`)

| Mã | Trích dẫn gốc trong B4 | Kết quả kiểm chứng nguồn | Hướng xử lý & Trích dẫn chuẩn thay thế |
|---|---|---|---|
| **`REF-01`** | Bộ Công Thương (2023), Báo cáo Logistics Việt Nam 2023 | **Đã xác minh tên báo cáo** ([logistics.gov.vn](https://logistics.gov.vn/bao-cao-logistics-viet-nam-2023)), cần ghi chính xác chương/trang bản PDF | Giữ nguồn, bổ sung URL, ngày truy cập (`11/11/2026`) và số trang trích dẫn |
| **`REF-02`** | World Bank LPI 2023 | Xếp hạng **43** khớp thông báo chính thức; **chi phí `16,8–18% GDP` KHÔNG thuộc LPI 2023** | Tách 2 nguồn: World Bank LPI 2023 (hạng 43) và nguồn VLA / Bộ Công Thương cho chi phí GDP |
| **`REF-03`** | Quy hoạch tỉnh Đồng Nai 2024 & Đề án sáp nhập 2025–2026 | Thiếu số Quyết định/Nghị quyết chính thức và mã ĐVHC chi tiết cho 95 đơn vị mới | Bảo tồn `officialCodeStatus = 'PENDING_OFFICIAL_CODE'` & `NO_OFFICIAL_POLYGON` trong `schema.prisma` cho đến khi có văn bản chính thức |
| **`REF-04`** | Ivanov, Tang & Dolgui (2021), DOI `...1843781` | **KHÔNG XÁC MINH ĐƯỢC** (Crossref trả HTTP `404`) | **Gỡ bỏ nhãn `CONFIRMED-EXTERNAL`**. Không trích dẫn làm nguồn đã kiểm chứng |
| **`REF-05`** | Toth & Vigo (2014), ISBN qua SIAM | **Đã xác minh**: *Vehicle Routing: Problems, Methods, and Applications*, Second Edition ([SIAM](https://epubs.siam.org/doi/10.1137/1.9781611973594.fm)) | Giữ nguyên danh mục đã sửa vai trò đồng chủ biên (*editors*) |
| **`REF-06`** | Wang, Zhang & Liu (2023), DOI `...3168899` | **CHƯA XÁC MINH ĐƯỢC** (Crossref HTTP `429`) | Giữ nhãn **`[CHƯA XÁC MINH NGUỒN GỐC]`**, yêu cầu bổ sung bản gốc trước khi in nộp |
| **`REF-07`** | Jacobs & VLDB Journal (2018), DOI `10.1145/3183713` | **LỖI SAI THƯ MỤC ĐÃ XÁC ĐỊNH** (DOI trỏ tới SIGMOD '18 Proceedings) | Đã xóa khỏi các ô FEFO; thay bằng tài liệu chính thức PostgreSQL RLS & FEFO chuẩn |
| **`REF-08`** | Google OR-Tools Documentation | Mã nguồn hiện tại chưa tích hợp OR-Tools | Đặt vào nhóm tài liệu tham khảo cho bước đối chứng VRPTW tương lai |
| **`REF-09`** | PostGIS `ST_Contains` Documentation | Khớp chính xác hàm trong `gps-ingestion-service` | Bổ sung lưu ý `ST_Covers` khi cần tính điểm nằm trên ranh polygon |
