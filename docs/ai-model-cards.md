# Thẻ Mô hình AI, Heuristic & Quy trình Đánh giá Pilot (AI Model & Evaluation Cards)

Tài liệu công bố trung thực thuật toán, dữ liệu đầu vào, cơ chế fallback, phạm vi áp dụng và bộ chỉ số chưa đo lường (`unmeasured`) của toàn bộ tính năng AI/CV/tối ưu trong SmartLogi AI SaaS.

> **Nguyên tắc minh bạch học thuật & kỹ thuật**: Tuyệt đối không dùng thông số giả lập trong `local-store` hay mô hình ý tưởng cũ (Python Google OR-Tools, `RandomForestRegressor`, `IsolationForest`) làm năng lực hiện có của bản phát hành này.

---

## 1. Tổng hợp Thực trạng Các Thành phần AI / Heuristic

| Thành phần | Vị trí mã nguồn | Kỹ thuật thực tế chạy trong code | Nguồn Fallback | Trạng thái đánh giá thực nghiệm |
|---|---|---|---|---|
| **Tối ưu tuyến VRP** | [`workers/ai-worker/src/lib/vrp.ts`](../workers/ai-worker/src/lib/vrp.ts) | Heuristic Nearest-Neighbor có ràng buộc tải trọng + cải thiện cục bộ `2-opt`; ma trận khoảng cách đối xứng `haversine * 1.41` | Báo rõ `unassigned` kèm lý do tải trọng | Chưa benchmark thực địa / chưa đối chiếu OR-Tools trên dữ liệu kho thật |
| **Chat / Tóm tắt / Dự báo nhu cầu, giao hàng & rời bỏ** | [`workers/ai-worker/src/routes/compute.ts`](../workers/ai-worker/src/routes/compute.ts), [`llm.ts`](../workers/ai-worker/src/lib/llm.ts) | Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast` hoặc `CLOUDFLARE_MODEL`) / OpenAI (`gpt-4o-mini`) + chống prompt-injection `wrapUntrustedData` | Công thức tất định (`fallbackDemand`, `fallbackDelivery`, `fallbackChurnProbability`, `fallbackAnalyze`, `ruleBasedFallback`) | `evaluation_status: "unmeasured"` (trả trực tiếp trong JSON) |
| **Phát hiện bất thường** | [`workers/ai-worker/src/routes/compute.ts`](../workers/ai-worker/src/routes/compute.ts) | Z-score mẫu (sample stddev, ngưỡng `\|z\| > 3`) trên các cột số | Không gọi LLM; gắn `data_sufficiency: "insufficient_sample"` nếu `< 5` mẫu | Chưa hiệu chuẩn ngưỡng FPR/FNR theo bộ dữ liệu thực tế |
| **Thị giác trạm đóng gói (Pack Station)** | [`pack-station-web/src/app/pack/page.tsx`](../frontend/reporting/pack-station-web/src/app/pack/page.tsx), [`cv-mapper.ts`](../frontend/reporting/pack-station-web/src/lib/cv-mapper.ts) | `@tensorflow/tfjs` + `@tensorflow-models/mobilenet` (ImageNet mặc định) chạy trên stream `videoRef` mỗi `1.5s`, ánh xạ 12 SKU bằng từ khóa, ngưỡng `CV_CONFIDENCE_THRESHOLD = 0.6` | Quét Web Serial Barcode hoặc nhập tay; **bắt buộc xác nhận người vận hành trước khi đóng kiện** | Chưa fine-tune cho SKU kho riêng; độ chính xác ImageNet trên bao bì/hộp kín chưa kiểm chứng |
| **Cơ chế học lại (Retraining)** | [`workers/ai-worker/src/routes/admin.ts`](../workers/ai-worker/src/routes/admin.ts) | Xuất nhãn đã được con người sửa (`human_corrected IS NOT NULL`) qua `GET /v1/training-dataset` | `POST /v1/train/:type` trả HTTP **`501 TRAINING_NOT_IMPLEMENTED`** | Không có pipeline tự huấn luyện trực tuyến trên Worker |
| **Rust API AI (`backend/rust-api`)** | [`backend/rust-api/crates/api/src/routes/ai.rs`](../backend/rust-api/crates/api/src/routes/ai.rs) | Bộ sinh kết quả giả lập tất định phục vụ thử nghiệm port Axum | Trả trực tiếp dữ liệu tổng hợp | **Experimental / Non-production** |

---

## 2. Chi tiết Từng Model Card

### Card 1 — Bộ giải tuyến VRP (`solveRouting` — TS Heuristic)
- **Tệp nguồn**: [`workers/ai-worker/src/lib/vrp.ts`](../workers/ai-worker/src/lib/vrp.ts) & [`backend/core-api/src/modules/logistics/processors/routing.processor.ts`](../backend/core-api/src/modules/logistics/processors/routing.processor.ts).
- **Đầu vào thực tế**: Danh sách `locations` (`id`, `lat`, `lng`, `demand` được `LogisticsService` cộng dồn từ tổng khối lượng `OrderItem` hoặc số đơn thay vì hardcode `1`), `vehicles` (`id`, `capacity > 0`), `depotIndex`.
- **Thuật toán**:
  1. Dựng ma trận khoảng cách đối xứng bằng `Math.floor(haversine(a, b) * 1.41)` (`distance_source: "haversine_circuity_1.41"`).
  2. Xây tuyến tham lam theo láng giềng gần nhất thỏa mãn `load + demand <= capacity`.
  3. Đóng vòng quay về depot, chạy cải thiện cục bộ `2-opt`, bỏ depot lặp ở cuối nhưng giữ nguyên ít nhất độ dài `>= 2` để **chuyến 1 khách hàng không bị rớt mất**, đồng thời tính `stops = route.length - 1`.
- **Giới hạn đã biết**:
  - Không tính đường một chiều, cấm tải theo khung giờ cao điểm (TP.HCM/Hà Nội), giao thông thực tế hay khung giờ giao hẹn (VRPTW).
  - Tham lam + `2-opt` là heuristic; khi một số điểm rơi vào `unassigned` (`NO_AVAILABLE_VEHICLES`, `EXCEEDS_MAX_VEHICLE_CAPACITY`, `INSUFFICIENT_FLEET_CAPACITY`), điều đó phản ánh lời giải tham lam không gán hết chứ chưa chứng minh vô nghiệm theo nghĩa tối ưu tổ hợp chính xác (MILP).
- **Kiểm thử hiện có**: `workers/ai-worker/tests/vrp.test.ts` (**PASSED** trong GitHub Actions CI Run `43023689371` / job `ai-worker`; đối chiếu chất lượng tuyến thực tế với OR-Tools vẫn `[CHƯA ĐO PILOT]`).

### Card 2 — Trợ lý LLM & Dự báo/Phân tích Fallback (`compute.ts`, `llm.ts`)
- **Mô hình LLM cấu hình**: Mặc định `@cf/meta/llama-3.1-8b-instruct-fast` qua Cloudflare Workers `AI` binding (hoặc `CLOUDFLARE_MODEL`, dự phòng `OPENAI_API_KEY` dùng `gpt-4o-mini`), đệm KV `6` phút.
- **Bảo vệ Prompt Injection**: Mọi ghi chú đơn hàng, ngữ cảnh chat, payload đầu vào đều đi qua [`wrapUntrustedData`](../workers/ai-worker/src/lib/llm.ts) kèm chỉ thị hệ thống `UNTRUSTED_DATA_GUARD`.
- **Công thức Deterministic Fallback (khi LLM lỗi hoặc chưa cấp binding)**:
  - **Demand**: `base * 12.5 * dowFactor * hourFactor` (không phải chuỗi thời gian theo từng SKU/kho).
  - **Delivery Time**: `40 * weekendFactor * hourFactor` phút.
  - **Churn Probability**: Hàm logistic `1 / (1 + exp(-(days/15 - 4 + log(orders+1)/2)))`.
- **Minh bạch đầu ra**: Mọi endpoint đều trả `method` (`llm_cf_or_openai` hoặc `deterministic_heuristic_fallback`), `fallback_used` (`boolean`) và `evaluation_status: "unmeasured"`.

### Card 3 — Phát hiện Bất thường Z-Score (`detectAnomalies`)
- **Thuật toán**: Với từng cột số hợp lệ trong mảng bản ghi, tính trung bình mẫu và độ lệch chuẩn mẫu ($N - 1$ bậc tự do). Điểm nào có $|z| > 3$ được đánh dấu `is_anomaly: true`.
- **Điều kiện mẫu**: Trả kèm `min_recommended_samples: 5` và cờ `data_sufficiency` (`sufficient` vs `insufficient_sample`) nhằm cảnh báo khi số quan sát quá nhỏ.

### Card 4 — Nhận diện Hỗ trợ tại Trạm Đóng gói (MobileNet v2 ImageNet + HITL)
- **Kiến trúc thực thi**: Chạy hoàn toàn phía trình duyệt (WASM/WebGL) bằng `@tensorflow/tfjs` và `@tensorflow-models/mobilenet`.
- **Pipeline hiện tại**:
  1. Gọi `model.classify(videoRef.current, 5)` mỗi `1.5s`.
  2. Hàm [`mapImageNetPredictionsToSku`](../frontend/reporting/pack-station-web/src/lib/cv-mapper.ts) đối khớp 1.000 lớp ImageNet thô sang từ khóa của 12 SKU mẫu (`SKU-0001`..`SKU-0012`).
  3. Ngưỡng tin cậy `CV_CONFIDENCE_THRESHOLD = 0.6` (`60%`). Dưới ngưỡng chỉ hiển thị nhãn ImageNet gốc và yêu cầu quét barcode.
  4. Ngay cả khi vượt ngưỡng, quy trình đóng kiện bắt buộc người vận hành đối chiếu barcode/chọn xác nhận (`scan` / `matchStatus`) và ghi đính chính (`correction`) về `core-api` & `ai-worker`.
- **Giới hạn quan trọng**: Đây là bộ nhận diện ImageNet tổng quát **chưa qua fine-tune trên 12 SKU hộp/thùng thực tế**; không dùng để thay thế máy quét barcode 1D/2D.

---

## 3. Quy trình Thu thập Dữ liệu & Kiểm chứng Thực nghiệm cho Đợt Pilot

Để điền các cột đo đạc thực tế (hiện đang bỏ trống/`unmeasured`) và huấn luyện offline thực sự thay thế cho endpoint `501`, đợt pilot phải tuân thủ quy trình 4 bước:

1. **Thu thập nhãn có kiểm soát (Human-in-the-Loop Data Collection)**:
   - Tại trạm đóng gói, thu thập ảnh chụp thực tế kèm ánh sáng kho (tối thiểu 3 mức độ sáng và 3 góc đặt camera trên mỗi SKU), gắn nhãn từ barcode chuẩn và lưu qua `POST /api/v1/ai/v1/feedback`.
   - Xuất dữ liệu sạch đã được kiểm tra (`human_corrected IS NOT NULL`) bằng `GET /api/v1/ai/v1/training-dataset`.
2. **Phân chia tập dữ liệu không rò rỉ (Strict Time-Based Split)**:
   - Tách theo trục thời gian (`train` các tuần đầu -> `validation` tuần kế tiếp -> `holdout test` tuần cuối), tuyệt đối không xáo trộn ngẫu nhiên các bản ghi cùng đơn hàng hoặc cùng ca đóng gói.
3. **Thước đo bắt buộc theo từng bài toán**:
   - *Phân loại SKU (CV)*: Top-1/Top-5 Accuracy theo từng lớp SKU, **Confusion Matrix**, False Positive Rate (nhận nhầm SKU sai khi barcode không quét) dưới từng điều kiện ánh sáng, kèm độ trễ suy luận trên thiết bị mục tiêu.
   - *Dự báo nhu cầu & ETA*: **MAE**, **RMSE**, **MAPE** đối chiếu trực tiếp với baseline trung bình trượt đơn giản (moving average).
   - *VRP Heuristic*: Tổng quãng đường (km), số xe dùng, thời gian giải toàn luồng (gồm cả geocode) và % chênh lệch gap khi chạy đối chứng offline với bộ giải chuẩn (như Google OR-Tools) trên cùng tập đơn lịch sử.
4. **Đăng ký trọng số sau kiểm chứng**:
   - Chỉ khi vượt baseline trên tập `holdout test`, tiến hành chuyển đổi sang TF.js / ONNX / công thức đã hiệu chuẩn và gọi `POST /api/v1/ai/v1/models` với `accuracy` thực đo và biên bản `metadata`.
