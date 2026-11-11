# Báo cáo cuối — A6 (Rust backend thay thế)

> Đợt: 2026-11-11 — `backend/rust-api/` untracked (chưa commit). Trình tự giữ nguyên
> `06-rust-backend.md` và `docs/agent-prompts/README.md` (kiểm tra tĩnh, không `cargo`).

## Đã sửa / tạo mới

- `backend/rust-api/crates/domain/src/models.rs` — 11 kiểu AI mới: `RouteOptimization`,
  `OptimizedStop`, `DriverRankingRow`, `DemandForecast`, `DemandPrediction`, `FuelPrediction`,
  `CustomerCreditScore`, `CreditFactor`, `Anomaly`, `AnomalyKind`, `AiDecision`. Xuất khẩu
  đầy đủ qua `pub use models::*`.
- `backend/rust-api/crates/domain/src/auth.rs` — `Permission::AiRead` (`ai:read`) /
  `AiWrite` (`ai:write`) + `as_str` (exhaustive), cấp cho `WarehouseManager` và
  `LogisticsManager`.
- `backend/rust-api/crates/api/src/routes/ai.rs` — module 9 endpoint mới (`.route()`,
  phản chiếu đúng hợp đồng `frontend/reporting/tenant-portal/src/lib/mock/repository.ts`).
- `backend/rust-api/crates/api/src/routes/mod.rs` — `pub mod ai;` + `.merge(ai::router())`
  vào router `/api/v1` (trước `orders`).
- `backend/rust-api/crates/api/src/routes/meta.rs` — 9 AI endpoint từ PENDING → IMPLEMENTED
  (tổng 11), bổ sung 3 path còn thiếu vào PENDING:
  `GET /api/v1/orders/track/:code`, `PATCH /api/v1/users/:id/status`,
  `PATCH /api/v1/admin/webhooks/:id/status`.
- `backend/rust-api/README.md` — mục "Trạng thái route" thêm `POST /api/v1/logistics/trips/:id/optimize`.
- Gỡ lỗi tĩnh: dòng 599 `payload.0` (tuple field) sai cấu trúc `AiInsightDecision` là
  struct có tên trường → `payload` trực tiếp.

## Route thêm (backend — không cần Sidebar)

`POST /api/v1/logistics/trips/optimize` (batch, dùng `AiWrite`),
`POST /api/v1/logistics/trips/:id/optimize` (form đơn),
`GET /api/v1/logistics/drivers/ranking`,
`GET /api/v1/logistics/vehicles/fuel/predict`,
`POST /api/v1/forecast`,
`GET /api/v1/customers/scoring`,
`GET /api/v1/anomalies`,
`POST /api/v1/ai-insights/decide`,
`POST /api/v1/admin/ai-insights/:id/decision`.

Tất cả trả envelope `{ data }` / `{ data, meta }` (danh sách), 403 khi thiếu quyền,
400 khi `status` khuyến nghị không thuộc `ACKNOWLEDGED/ACTIONED/DISMISSED`.

## Dữ liệu dùng

- Backend trả proxy route khi API chưa có model thực tế: dữ liệu deterministic (seeded
  SplitMix64 theo tham số request), path phù hợp với hợp đồng `repository.ts`.
- Không áp dụng `data.<nhóm>.<hàm>` của tenant portal (A0 đóng băng) — backend trả lại
  REST `/api/v1`, không thêm hàm/mock vào `src/lib/**`.
- `aiInsights.decide` (frontend) trỏ chính xác `POST /api/v1/admin/ai-insights/:id/decision`
  — đã bật.

## Đã kiểm tra tĩnh

- 9 import `domain::{...}` ⊂ `domain/src/models.rs` (xác nhận: 9/9).
- 9 route `.route(...)` trong `ai.rs` ⊂ `meta.rs` IMPLEMENTED (11 entries, 65 PENDING).
- Quyền: `AuthUser::require(AiRead/AiWrite)` — cố định, `payload.0` logic đã sửa.
- Phương thức: không `todo!`, `unimplemented!`, `panic!`, `unwrap()`, `TODO`, `FIXME`,
  placeholder, hoặc `console.log` sót.
- Nhãn: mã nghiệp vụ (`SLG-YYYYMMDD-XXXXXX`, `TRP-xxxx`) và trạng thái vế — đúng mẫu
  AGENTS.md mục 4; tiền tệ VND (`Vnd = i64`), ngày ISO 8601.
- axum: `.route(path, method)` + `.nest("/api/v1", routes::router())` (app.rs:67).
- Không dependency mới, không `packages/**` touched.

## Lỗi / thiếu / sai sót phát hiện

1. **`payload.0` (ai.rs:599)** — `Json(payload): Json<AiInsightDecision>` đã giải
   tháo thành `AiInsightDecision`; `payload.0` là truy cập tuple field không tồn tại
   → *đã sửa*, code trả về `payload` trực tiếp (route `admin/ai-insights/:id/decision`
   ưu tiên `id` URL khi body bỏ trống).
2. **3 path của 4-missing-list** (`06-rust-backend.md` §3) chưa được PENDING hóa:
   `orders/track/:code`, `users/:id/status`, `webhooks/:id/status` → *đã thêm* vào
   PENDING list của `routes/meta.rs`.
3. **Comment sai**: dòng 113 ghi "FNV-1a" nhưng RNG là SplitMix64
   (chọn định danh, không phải bug).

## Chưa làm được

1. **Chạy `cargo`** — AGENTS.md cấm, máy local không có `rustc` (`which` Ngữ Rỗng).
   Xác minh kiểu & cú pháp chỉ đọc file thủ công, regex, so sánh import/export.
2. **Model thực tế / DB**: endpoint vẫn trả synthetic data ổn định theo seed, chưa
   thực sự tính toán route hoặc prediction.
3. **Module tĩnh**: không kiểm tra động (`cargo build`, `cargo test`) → chỉ có thể
   cam kết dài hạn qua check list tĩnh đã thực hiện.
