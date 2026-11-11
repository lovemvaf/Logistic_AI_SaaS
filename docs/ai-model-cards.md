# Thẻ Mô hình AI, Heuristic & Quy trình Đánh giá Pilot (AI Model & Evaluation Cards)

Tài liệu công bố trung thực thuật toán, dữ liệu đầu vào, cơ chế fallback, phạm vi áp dụng và bộ chỉ số chưa đo lường (`unmeasured`) của toàn bộ tính năng AI/CV/tối ưu & hỗ trợ XNK trong SmartLogi AI SaaS.

> **Nguyên tắc minh bạch học thuật & kỹ thuật**: Tuyệt đối không dùng thông số giả lập trong `local-store` hay mô hình ý tưởng cũ (Python Google OR-Tools, `RandomForestRegressor`, `IsolationForest`, tự động nộp tờ khai hải quan không qua người duyệt) làm năng lực sản xuất tự động của bản phát hành này.

---

## 1. Tổng hợp Thực trạng Các Thành phần AI / Heuristic

| Thành phần | Vị trí mã nguồn | Kỹ thuật thực tế chạy trong code | Nguồn Fallback | Trạng thái đánh giá thực nghiệm |
|---|---|---|---|---|
| **Tối ưu tuyến VRP kiện lẻ** | [`workers/ai-worker/src/lib/vrp.ts`](../workers/ai-worker/src/lib/vrp.ts) | Heuristic Nearest-Neighbor có ràng buộc tải trọng + cải thiện cục bộ `2-opt`; ma trận khoảng cách `haversine * 1.41` | Báo rõ `unassigned` kèm lý do tải trọng | Chưa đối chiếu OR-Tools trên dữ liệu đơn giao thực địa (`[CHƯA ĐO PILOT]`) |
| **Điều phối Container Drayage** | [`workers/ai-worker/src/lib/container-routing.ts`](../workers/ai-worker/src/lib/container-routing.ts) | Heuristic ghép cặp thời gian mở/đóng cửa sổ + thưởng hồi rỗng (`backhaulPairedCount`), kiểm kích thước container (`20GP/40GP/40HC/40RF/45HC`), reefer & tải trọng | Báo rõ mã lỗi `UNSUPPORTED_CONTAINER_SIZE`, `NO_REEFER_GENSET_TRACTOR`, `TIME_WINDOW_OR_CAPACITY_INFEASIBLE` | Benchmark 5 kịch bản TP Đồng Nai tổng hợp ([`benchmark-dongnai.ts`](../workers/ai-worker/tests/benchmark-dongnai.ts)); trả **`evaluation_status: "unmeasured_heuristic"`** |
| **Trích xuất & Đối chiếu Chứng từ XNK** | [`workers/ai-worker/src/routes/trade-documents.ts`](../workers/ai-worker/src/routes/trade-documents.ts) | LLM JSON extraction (`wrapUntrustedData`) + đối chiếu trọng lượng/số kiện/tiền tệ giữa CI, PL & B/L | Fallback regex tất định (`deterministic_regex_fallback`); **từ chối HTTP `422 FAILED_PASSWORD_PROTECTED` nếu PDF đặt mật khẩu** | Đã test unit (`enterprise.test.ts`); chưa benchmark độ chính xác OCR/LLM trên bộ hồ sơ hải quan thực (`[CHƯA ĐO PILOT]`) |
| **Gợi ý Mã HS Hải quan (Advisory)** | [`workers/ai-worker/src/routes/hs-code.ts`](../workers/ai-worker/src/routes/hs-code.ts) | LLM top-K gợi ý HS 8 số kèm confidence & rationale + cờ **`advisoryOnly: true`** | `suggestHsDeterministic` tra từ khóa thuế quan; luôn khóa ở trạng thái **`NEEDS_CUSTOMS_REVIEW`** | Không tự nộp hải quan; **bắt buộc chuyên viên có quyền `trade:approve` duyệt tay** |
| **Chat / Tóm tắt / Dự báo nhu cầu, ETA & Churn** | [`workers/ai-worker/src/routes/compute.ts`](../workers/ai-worker/src/routes/compute.ts), [`llm.ts`](../workers/ai-worker/src/lib/llm.ts) | Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast` hoặc `CLOUDFLARE_MODEL`) / OpenAI (`gpt-4o-mini`) + `wrapUntrustedData` | Công thức tất định (`fallbackDemand`, `fallbackDelivery`, `fallbackChurnProbability`, `fallbackAnalyze`, `ruleBasedFallback`) | `evaluation_status: "unmeasured"` (trả trực tiếp trong JSON) |
| **Phát hiện bất thường** | [`workers/ai-worker/src/routes/compute.ts`](../workers/ai-worker/src/routes/compute.ts) | Z-score mẫu (sample stddev, ngưỡng `\|z\| > 3`) trên các cột số | Không gọi LLM; gắn `data_sufficiency: "insufficient_sample"` nếu `< 5` mẫu | Chưa hiệu chuẩn ngưỡng FPR/FNR theo bộ dữ liệu thực tế |
| **Thị giác trạm đóng gói (Pack Station)** | [`pack-station-web/src/app/pack/page.tsx`](../frontend/reporting/pack-station-web/src/app/pack/page.tsx), [`cv-mapper.ts`](../frontend/reporting/pack-station-web/src/lib/cv-mapper.ts) | `@tensorflow/tfjs` + `@tensorflow-models/mobilenet` (ImageNet mặc định) chạy trên `videoRef` mỗi `1.5s`, ánh xạ 12 SKU, ngưỡng `CV_CONFIDENCE_THRESHOLD = 0.6` | Quét Web Serial Barcode hoặc nhập tay; **bắt buộc xác nhận người vận hành trước khi đóng kiện** | Chưa fine-tune cho SKU kho riêng; độ chính xác ImageNet trên bao bì/hộp kín chưa kiểm chứng |
| **Cơ chế học lại (Retraining)** | [`workers/ai-worker/src/routes/admin.ts`](../workers/ai-worker/src/routes/admin.ts) | Xuất nhãn đã được con người sửa (`human_corrected IS NOT NULL`) qua `GET /v1/training-dataset` | `POST /v1/train/:type` trả HTTP **`501 TRAINING_NOT_IMPLEMENTED`** | Không có pipeline tự huấn luyện trực tuyến trên Worker |
| **Rust API AI (`backend/rust-api`)** | [`backend/rust-api/crates/api/src/routes/ai.rs`](../backend/rust-api/crates/api/src/routes/ai.rs) | Bộ sinh kết quả giả lập tất định phục vụ thử nghiệm port Axum | Trả trực tiếp dữ liệu tổng hợp | **Experimental / Non-production** |

---

## 2. Chi tiết Từng Model Card

### Card 1 — Bộ giải tuyến VRP (`solveRouting` — TS Heuristic)
- **Tệp nguồn**: [`workers/ai-worker/src/lib/vrp.ts`](../workers/ai-worker/src/lib/vrp.ts) & [`backend/core-api/src/modules/logistics/processors/routing.processor.ts`](../backend/core-api/src/modules/logistics/processors/routing.processor.ts).
- **Đầu vào thực tế**: Danh sách `locations` (`id`, `lat`, `lng`, `demand` được `LogisticsService` cộng dồn từ tổng khối lượng `OrderItem`), `vehicles` (`id`, `capacity > 0`), `depotIndex`.
- **Thuật toán**: Ma trận `Math.floor(haversine(a, b) * 1.41)` (`distance_source: "haversine_circuity_1.41"`), tham lam nearest-neighbor + `2-opt`, giữ `route.length >= 2` cho chuyến 1 khách, `stops = route.length - 1`.
- **Giới hạn đã biết**: Không tính đường một chiều, cấm tải theo giờ hoặc lưu lượng giao thông thực; kiểm thử qua `workers/ai-worker/tests/vrp.test.ts` (`[CI] PASSED`), benchmark thực địa `[CHƯA ĐO PILOT]`.

### Card 2 — Bộ giải Container Drayage (`solveContainerDrayage`)
- **Tệp nguồn**: [`workers/ai-worker/src/lib/container-routing.ts`](../workers/ai-worker/src/lib/container-routing.ts) (`POST /v1/routing/containers`).
- **Ràng buộc nghiệp vụ**: Kiểm tra tương thích `supportedSizes`, cờ cấp lạnh `supportsReefer` cho cont `40RF`, tổng tải `maxGrossKg`, cửa sổ thời gian `[earliestMinute, latestMinute]` và điểm thưởng ghép chặng có hàng ngay sau hạ hàng / trả rỗng (`backhaulPairedCount`).
- **Tính minh bạch**: Đầu ra trả tường minh `method: "heuristic_timewindow_backhaul_v1"`, `distance_source: "haversine_circuity_1.41"`, `evaluation_status: "unmeasured_heuristic"`. Không sử dụng giá trị `emptyMilesRatioPct` trên dữ liệu tổng hợp để tuyên bố tiết kiệm chi phí thực.

### Card 3 — Trợ lý LLM, Trích xuất Chứng từ XNK & HS Code Advisory
- **Tệp nguồn**: [`workers/ai-worker/src/routes/compute.ts`](../workers/ai-worker/src/routes/compute.ts), [`trade-documents.ts`](../workers/ai-worker/src/routes/trade-documents.ts), [`hs-code.ts`](../workers/ai-worker/src/routes/hs-code.ts), [`llm.ts`](../workers/ai-worker/src/lib/llm.ts).
- **Chống Prompt Injection**: Mọi ghi chú đơn hàng, mô tả hàng hóa và text chứng từ XNK đi qua [`wrapUntrustedData`](../workers/ai-worker/src/lib/llm.ts) kèm `UNTRUSTED_DATA_GUARD`.
- **Fail-Closed & Human-in-the-Loop**:
  - Chứng từ XNK mã hóa mật khẩu (`isEncrypted` hoặc `/%PDF.*Encrypt/i`) -> trả ngay **`HTTP 422` (`FAILED_PASSWORD_PROTECTED`)** kèm `requires_manual_upload: true`.
  - Gợi ý mã HS luôn gắn **`advisoryOnly: true`**, **`requiresHumanReview: true`**, **`status: "NEEDS_CUSTOMS_REVIEW"`**; chỉ khi chuyên viên hải quan duyệt qua `POST /api/v1/trade/hs-suggestions/:id/review` (quyền `trade:approve`) mới lưu mã duyệt chính thức.

### Card 4 — Phát hiện Bất thường Z-Score (`detectAnomalies`)
- **Thuật toán**: Với từng cột số hợp lệ, tính trung bình mẫu và độ lệch chuẩn mẫu ($N - 1$ bậc tự do); điểm có $|z| > 3$ gắn `is_anomaly: true`. Kèm `min_recommended_samples: 5` và `data_sufficiency`.

### Card 5 — Nhận diện Hỗ trợ tại Trạm Đóng gói (MobileNet v2 ImageNet + HITL)
- **Tệp nguồn**: [`pack-station-web/src/app/pack/page.tsx`](../frontend/reporting/pack-station-web/src/app/pack/page.tsx), [`cv-mapper.ts`](../frontend/reporting/pack-station-web/src/lib/cv-mapper.ts).
- **Pipeline**: Chạy WASM/WebGL trên trình duyệt (`model.classify(videoRef.current, 5)` mỗi `1.5s`), ngưỡng `CV_CONFIDENCE_THRESHOLD = 0.6`. Dưới ngưỡng hoặc chưa xác nhận barcode -> không cho phép bỏ qua bước kiểm đếm thủ công/Web Serial. Chưa fine-tune trên dữ liệu thùng hàng thật (`[CHƯA ĐO PILOT]`).

---

## 3. Quy trình Thu thập Dữ liệu & Kiểm chứng Thực nghiệm cho Đợt Pilot

1. **Thu thập nhãn có kiểm soát (HITL)**: Ảnh trạm đóng gói (tối thiểu 3 góc x 3 mức sáng/SKU) gắn barcode chuẩn qua `POST /api/v1/ai/v1/feedback`, kết hợp lịch sử sửa mã HS (`hs_code_suggestions.approved_hs_code`); xuất qua `GET /api/v1/ai/v1/training-dataset` (`human_corrected IS NOT NULL`).
2. **Tách tập dữ liệu theo thời gian (`Strict Time-Based Split`)**: Tuần 1–N (`train`) -> tuần kế (`validation`) -> tuần cuối (`holdout test`), không xáo trộn bản ghi cùng đơn hoặc cùng ngày.
3. **Thước đo bắt buộc (`[CHƯA ĐO PILOT]`)**:
   - *CV*: Top-1/Top-5 Accuracy, Confusion Matrix, FPR khi sai bao bì.
   - *Demand / ETA*: MAE, RMSE, MAPE đối chiếu Moving Average.
   - *VRP & Container Drayage*: Quãng đường thực tế, tỷ lệ chạy rỗng (`emptyMilesRatioPct`), đối chứng offline với OR-Tools trên đơn thật tại Đồng Nai – Cát Lái – Cái Mép.
   - *HS Code*: Tỷ lệ chấp thuận top-1 / top-3 bởi nhân viên khai báo hải quan.
4. **Đăng ký mô hình**: Chỉ gọi `POST /api/v1/ai/v1/models` với chỉ số đo thật sau khi vượt baseline trên `holdout test`.
