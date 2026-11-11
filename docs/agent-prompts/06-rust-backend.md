# A6 — Rust backend (backend thay thế, khung sẳn có)

## Vai trò

Bạn sở hữu `backend/rust-api`. Mục tiêu **không phải** viết lại backend ngay, mà là giữ
một workspace biên dịch được, route trùng `/api/v1`, để sau này chuyển từng module từ
`backend/core-api` (NestJS) sang mà frontend không phải sửa.

## Đọc trước

- `AGENTS.md` mục 1, 2, 8
- `backend/rust-api/README.md`
- `backend/rust-api/crates/{domain,infra,api}/src/**`
- `frontend/reporting/tenant-portal/src/lib/mock/repository.ts` — danh sách path frontend
  gọi, đây là nguồn đối chiếu chính
- `backend/core-api/src/modules/*/` — controller + DTO module sẽ chuyển

## Vùng được sửa

```
backend/rust-api/**
```

Không sửa `backend/core-api`, `backend/gps-ingestion-service`, `backend/webhook-service`,
frontend, `packages/**`. Không sửa `docker-compose.yml`, không đổi `pnpm-lock.yaml`.

## Trạng thái hiện tại

- Workspace 3 crate: `domain` (kiểu thuần), `infra` (sqlx pool + kiểm tra schema tenant),
  `api` (axum).
- `api/src/app.rs`: CORS theo `ALLOWED_ORIGINS`, request-id, trace, timeout.
- `api/src/auth.rs`: extractor `AuthUser`, verify HS256, kiểm tra `exp`, đọc
  `tenant_slug` từ token (không bao giờ từ header).
- `api/src/error.rs`: envelope lỗi giống NestJS (`error`, `message`, `statusCode`).
- `routes/`: đủ nhóm route, mỗi nhóm một file; handler chưa chuyển trả `501`.
- `GET /api/v1/health`, `GET /api/v1/meta/routes` chạy thật.
- `Dockerfile`, `.env.example`, `rust-toolchain.toml` (pin 1.82), unit test `safe_schema_name`.

## Việc 1 — Kiểm tra tĩnh toàn workspace

Không chạy `cargo`. Đọc và đối chiếu:

1. mọi `use` có tồn tại, không import thừa;
2. kiểu trả về của handler khớp `IntoResponse`;
3. `Router<AppState>` vs `Router<()>`: `routes::router()` trả `Router<AppState>`, `app.rs`
   gọi `.with_state(state)` sau cùng — không gắn state hai lần;
4. `.route("/x/*rest", ...)` chỉ dùng cú pháp axum 0.7, không dùng `:param` lẫn lộn;
5. `HeaderName`/`HeaderValue` dùng static hợp lệ (không tạo từ chuỗi động mà không xử lý
   lỗi);
6. không có `unwrap()` trên dữ liệu người dùng, `panic!` trong handler;
7. `#![allow(warnings)]` giấu check không được phép trừ khi ghi chú rõ.

Ghi lại mọi chỗ sai trong báo cáo, sửa if chắc chắn.

## Việc 2 — Đồng bộ route với frontend

Mở `repository.ts`, đây là nguồn đối chiếu duy nhất cho PATCH/POST vì cả `orders` và
`users` đều dùng `collection` CRUD thuần. Nhóm path cần khớp với `meta.rs` (ghi tên
route thực tế):

| Hàm repository | Đường dẫn cần trùng |
|---|---|
| crud(request, '/orders') | `POST,GET,PATCH,DELETE /api/v1/orders` |
| orders.createOrder | `POST /api/v1/orders` |
| orders.advanceStatus | `POST /api/v1/orders/:id/status` |
| orders.assignTrip | `POST /api/v1/orders/assign-trip` |
| orders.byTrackingCode | `GET /api/v1/orders/track/:code` **(thiếu)** |
| crud(request, '/wms/products') | `GET,POST,PATCH,DELETE /api/v1/wms/products` |
| crud(request, '/warehouses') | `GET,POST,PATCH,DELETE /api/v1/warehouses` |
| crud(request, '/warehouses/bins') | `GET,POST /api/v1/warehouses/bins` |
| crud(request, '/inventory') | `GET,POST,PATCH,DELETE /api/v1/inventory` |
| inventory.adjust | `POST /api/v1/inventory/adjust` |
| inventory.receive | `POST /api/v1/inventory/receive` |
| inventory.putawaySuggestion | `POST /api/v1/inventory/putaway-suggestion` |
| crud(request, '/inventory/ledger') | `GET /api/v1/inventory/ledger` |
| crud(request, '/inventory/cycle-counts') | `GET,POST,PATCH,DELETE /api/v1/inventory/cycle-counts` |
| cycleCounts.submit | `POST /api/v1/inventory/cycle-counts/:id/submit` |
| cycleCounts.approve | `POST /api/v1/inventory/cycle-counts/:id/approve` |
| crud(request, '/wms/waves') | `GET,POST /api/v1/wms/waves` |
| waves.allocate | `POST /api/v1/wms/waves/allocate` |
| crud(request, '/wms/tasks') | `GET,POST,PATCH,DELETE /api/v1/wms/tasks` |
| pickTasks.confirm | `POST /api/v1/wms/tasks/:id/confirm` |
| crud(request, '/wms/packing-sessions') | `GET,POST,PATCH,DELETE /api/v1/wms/packing-sessions` |
| packSessions.seal | `POST /api/v1/wms/packing-sessions/:id/seal` |
| crud(request, '/wms/equipment') | `GET,POST,PATCH,DELETE /api/v1/wms/equipment` |
| crud(request, '/logistics/trips') | `GET,POST,PATCH,DELETE /api/v1/logistics/trips` |
| trips.assign | `POST /api/v1/logistics/trips/assign` |
| trips.optimize | `POST /api/v1/logistics/trips/:id/optimize` |
| trips.start | `POST /api/v1/logistics/trips/:id/start` |
| trips.complete | `POST /api/v1/logistics/trips/:id/complete` |
| crud(request, '/logistics/drivers') | `GET /api/v1/logistics/drivers` |
| crud(request, '/logistics/vehicles') | `GET,POST,PATCH,DELETE /api/v1/logistics/vehicles` |
| crud(request, '/logistics/geofences') | `GET,POST,PATCH,DELETE /api/v1/logistics/geofences` |
| crud(request, '/logistics/sos') | `GET,POST,PATCH,DELETE /api/v1/logistics/sos` |
| sosAlerts.acknowledge | `POST /api/v1/logistics/sos/:id/acknowledge` |
| sosAlerts.resolve | `POST /api/v1/logistics/sos/:id/resolve` |
| crud(request, '/logistics/returns') | `GET,POST,PATCH,DELETE /api/v1/logistics/returns` |
| returns.inspect | `POST /api/v1/logistics/returns/:id/inspect` |
| crud(request, '/finance/cod-remittances') | `GET,POST,PATCH,DELETE /api/v1/finance/cod-remittances` |
| remittances.submit | `POST /api/v1/finance/cod-remittances/:id/submit` |
| remittances.reconcile | `POST /api/v1/finance/cod-remittances/:id/reconcile` |
| crud(request, '/finance/bank-transactions') | `GET,POST,PATCH,DELETE /api/v1/finance/bank-transactions` |
| crud(request, '/finance/expenses') | `GET,POST,PATCH,DELETE /api/v1/finance/expenses` |
| expenses.decide | `POST /api/v1/finance/expenses/:id/decision` |
| crud(request, '/finance/invoices') | `GET,POST,PATCH,DELETE /api/v1/finance/invoices` |
| invoices.recordPayment | `POST /api/v1/finance/invoices/:id/payments` |
| crud(request, '/admin/clients') | `GET,POST,PATCH,DELETE /api/v1/admin/clients` |
| crud(request, '/admin/ai-insights') | `GET,POST,PATCH,DELETE /api/v1/admin/ai-insights` |
| aiInsights.decide | `POST /api/v1/admin/ai-insights/:id/decision` **(thiếu)** |
| crud(request, '/admin/api-keys') | `GET,POST,PATCH,DELETE /api/v1/admin/api-keys` |
| apiKeys.issue | `POST /api/v1/admin/api-keys` |
| apiKeys.revoke | `POST /api/v1/admin/api-keys/:id/revoke` |
| crud(request, '/admin/audit-logs') | `GET,POST,PATCH,DELETE /api/v1/admin/audit-logs` |
| crud(request, '/users') | `GET,POST,PATCH,DELETE /api/v1/users` |
| users.invite | `POST /api/v1/users/invite` |
| users.setStatus | `PATCH /api/v1/users/:id/status` **(thiếu)** |
| crud(request, '/roles') | `GET /api/v1/roles` |
| crud(request, '/admin/webhooks') | `GET,POST,PATCH,DELETE /api/v1/admin/webhooks` |
| webhooks.setStatus | `PATCH /api/v1/admin/webhooks/:id/status` **(thiếu)** |
| crud(request, '/notifications') | `GET,POST,PATCH,DELETE /api/v1/notifications` |
| notifications.markAllRead | `POST /api/v1/notifications/read-all` |
| settings.get/update | `GET /api/v1/settings`, `PATCH /api/v1/settings` |
| dashboard | `GET /api/v1/dashboard/summary` |

Yêu cầu:
- Mọi path phải nằm dưới `/api/v1` và có trong `PENDING` (hoặc `IMPLEMENTED` nếu đã
  chuyển).
- Không đổi tên path đã có trong frontend.
- Bổ sung các path **mới** (sinh bởi lần mở rộng mock lần này):
  - `POST /api/v1/orders/:id/partial` — phân đơn hàng lẻ (`orders.partialShipment`)
  - `PATCH /api/v1/orders/:id/reschedule` — đổi giờ giao (`orders.reschedule`)
  - `GET /api/v1/orders/:trackingCode/live` — theo dõi hành trình (`orders.live`)
  - `GET /api/v1/orders/:trackingCode/sla` — kiểm SLA (`orders.sla`)
  - `GET /api/v1/customers`, `GET /api/v1/customers/:id`, `GET /api/v1/customers/:id/stat`,
    `GET /api/v1/customers/:id/reviews` — khách hàng B2B (`customers`)
  - `GET /api/v1/order-partials`, `GET /api/v1/order-partials/:id`,
    `PATCH /api/v1/order-partials/:id` — đơn phân chia (`orderPartials`)
  - `GET /api/v1/reports/summary`, `GET /api/v1/reports/on-time`, `GET /api/v1/reports/costs`,
    `GET /api/v1/reports/fleet` — báo cáo tổng hợp (`reports`)
  - `POST /api/v1/logistics/trips/pod`, `GET /api/v1/logistics/trips/:tripId/pod` — POD
    (`trips.submitPOD/pod`)
  - `GET /api/v1/logistics/drivers/ranking`, `GET /api/v1/logistics/drivers/:driverId/trip-log`
    — xếp hạng + lịch hoạt động tài xế (`drivers`)
  - `POST /api/v1/logistics/vehicles/fuel`, `POST /api/v1/logistics/vehicles/maintenance`
    — nhiên liệu/bảo trì (`vehicles.fuelLog/maintenanceLog`)
  - `POST /api/v1/logistics/returns/:id/refund` — hoàn tiền trả hàng (`returns.refund`)
  - `POST /api/v1/notifications/send`, `GET /api/v1/notifications/events` — thông báo
    đa kênh (`notifications.send/events`)
- Bổ sung 4 path thiếu: `GET /api/v1/orders/track/:code`, `PATCH /api/v1/users/:id/status`,
  `PATCH /api/v1/admin/webhooks/:id/status`, `POST /api/v1/admin/ai-insights/:id/decision`.
  Nếu nhóm chưa có file route, thêm vào file route module tương ứng.
- Viết lại `IMPLEMENTED`/`PENDING` ở cuối `routes/meta.rs` khi đã đồng bộ.
- Khi frontend dùng chế độ `api`, mọi hơi gọi đều là `POST/GET/PATCH/DELETE /api/v1/...`;
  danh sách router phải khớp 100%.

## Việc 3 — Chuyển module đầu tiên (khuyến nghị `orders`)

Chỉ làm khi mục 1–2 sạch:

- `GET /api/v1/orders` — đọc bảng `orders`, lọc theo `status`, `warehouse_id`, tìm theo
  `tracking_code`; trả `{ data, meta }`, sắp xếp `created_at DESC`.
- `GET /api/v1/orders/:id` — 404 nếu không thuộc tenant trong token.
- `POST /api/v1/orders` — validate DTO bằng `serde` + hàm kiểm tra thủ công (không thêm
  crate mới); sinh `tracking_code` dạng `SLG-YYYYMMDD-XXXXXX`.
- `POST /api/v1/orders/:id/status` — chỉ cho chuyển tới trạng thái hợp lệ (dùng
  `OrderStatus::is_terminal`), lỗi 409 khi lùi trạng thái.
- Mọi query dùng `sqlx::query_as` với tham số bind, **không** nối chuỗi SQL.
- Set `search_path` bằng `infra::safe_schema_name(&claims.tenant_slug)` trong transaction
  của từng request.

Nếu schema thật khác giả định, dừng lại và ghi rõ trong báo cáo thay vì đoán cột.

## Việc 4 — Test tĩnh + unit test

- Thêm unit test cho: map trạng thái, `Claims::allows`, `safe_schema_name`.
- Không viết test cần database thật; nếu cần, đánh dấu `#[ignore]` và ghi lý do.

## Việc 5 — Tài liệu

- Cập nhật `backend/rust-api/README.md`: route nào đã chuyển, route nào còn `501`.
- Ghi rõ biến môi trường mới (nếu có) vào `.env.example`.

## Ràng buộc

- Không chạy `cargo`, `docker`, `npm`. Không commit `.env`.
- Không thêm crate ngoài workspace hiện có nếu chưa được duyệt.
- Không xoá `backend/core-api`.
- Không đổi response envelope; frontend đang đọc `message` khi lỗi.

## Nghiệm thu

- Đọc code thấy rõ: mọi handler có `AuthUser` hoặc chủ đích public; quyền ghi kiểm tra
  `Permission` tương ứng.
- `routes/meta.rs` khớp 100% path frontend gọi.
- Không còn `TODO`, `unwrap()` trên dữ liệu người dùng, `panic!` trong handler.
- Báo cáo nêu rõ: đã chuyển module nào, còn module nào, rủi ro schema.

## Báo cáo

Theo mẫu trong `docs/agent-prompts/README.md`.
