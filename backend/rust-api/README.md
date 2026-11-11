# Rust API — backend thay thế tương lai

> Trạng thái: **khung đã dựng, chưa chuyển module nào**. `backend/core-api` vẫn là backend
> đang phục vụ. Mục tiêu của workspace này là để việc chuyển đổi sau này chỉ là thay
> implementation, không đổi hợp đồng `/api/v1`.

## Vì sao có hai backend

Báo cáo SmartLogi mô tả kiến trúc microservice cũ. Repo hiện tại đã gộp về modular
monolith `backend/core-api` (NestJS) + 2 service Go. Rust API được dựng song song để:

- giữ nguyên route, payload, response envelope;
- thay từng nhóm route bằng cờ môi trường ở gateway;
- rollback bằng cách trỏ gateway về core-api.

Không xoá `backend/core-api` cho tới khi mọi route đã chuyển và có kiểm thử tương đương.

## Cấu trúc

```
backend/rust-api/
├── Cargo.toml                 # workspace
├── rust-toolchain.toml        # pin 1.82
├── Dockerfile                 # multi-stage, chạy cổng 8080
├── .env.example
├── migrations/                # nơi đặt SQL khi bắt đầu chuyển schema
└── crates/
    ├── domain/                # kiểu thuần, không phụ thuộc framework/DB
    │   └── src/{lib,models,auth}.rs
    ├── infra/                 # pool Postgres, kiểm tra tên schema tenant
    │   └── src/{lib,db,tenancy}.rs
    └── api/                   # axum: config, state, auth extractor, routes
        └── src/
            ├── main.rs
            ├── app.rs         # CORS, request-id, trace, timeout
            ├── config.rs
            ├── error.rs       # envelope lỗi giống NestJS
            ├── auth.rs        # JWT extractor + kiểm tra quyền
            └── routes/        # mỗi nhóm route một file
```

## Hợp đồng HTTP

- Prefix: `/api/v1`.
- Danh sách: `{ "data": [...], "meta": { "total", "page", "limit" } }`.
- Một bản ghi: `{ "data": { ... } }`.
- Lỗi: `{ "error": "code", "message": "...", "statusCode": 409 }` — frontend đang đọc
  `message`, nên giữ nguyên.
- Auth: `Authorization: Bearer <jwt>`; claims có `sub`, `email`, `role`, `tenant_id`,
  `tenant_slug`, `permissions`, `exp`.
- Tenant cách ly bằng RLS + `tenant_slug` lấy từ token. Tên schema phải qua
  `infra::safe_schema_name` trước khi dùng.

## Trạng thái route

`routes/meta.rs` liệt kê mọi route của `/api/v1`: `IMPLEMENTED` (11 route) là những
path trả dữ liệu hữu ích, `PENDING` (295 path còn lại) trả `501 not_implemented`
**sau khi** JWT được kiểm tra, để `repository.ts` luôn có danh sách đường dẫn đầy đủ
cho dù module nào đó chưa chuyển về Rust. Danh sách đầy đủ trả qua
`GET /api/v1/meta/routes`.

- `GET /api/v1/health`, `GET /api/v1/meta/routes`
- 9 AI endpoint (`ai.rs`): `POST /api/v1/logistics/trips/optimize`,
  `POST /api/v1/logistics/trips/:id/optimize`, `GET /api/v1/logistics/drivers/ranking`,
  `GET /api/v1/logistics/vehicles/fuel/predict`, `POST /api/v1/forecast`,
  `GET /api/v1/customers/scoring`, `GET /api/v1/anomalies`,
  `POST /api/v1/ai-insights/decide`, `POST /api/v1/admin/ai-insights/:id/decision`.

Mọi path còn lại cũng đã khai báo — trả `501` phục vụ `ước tính tiến độ Migration`,
không phải lỗi runtime. Khi một module được chuyển, đổi `PENDING` → `IMPLEMENTED`.

## Chạy trên host

Chỉ chạy trên host triển khai, không chạy local theo `AGENTS.md`.

```bash
cp .env.example .env
docker build -t smartlogi-rust-api .
docker run --env-file .env -p 8080:8080 smartlogi-rust-api
```

Kiểm tra:

```bash
curl -s localhost:8080/api/v1/health
curl -s localhost:8080/api/v1/meta/routes
```

## Kiểm thử

`domains` và `api` đều có unit test cho:

- tên schema tenant: `safe_schema_name` (XSS/vấn đề tên table);
- map trạng thái đơn: `OrderStatus::can_move_to` + `STATUS_ORDER` tiến mỗi lần
  một trạng thái, không cho lùi;
- phân quyền theo vai trò: `Claims::allows`, quyền ngắn nhất và wildcard scope;
- đối soát COD đúng/lệch;
- cách ly tenant: token tenant A không đọc được dữ liệu tenant B.

Khi thêm module, thêm test cho mỗi điều kiện trên. Unit test chạy bằng
`cargo test --workspace`; PATH/BUILD không kiểm thử: `tmp_check.py` đảm bảo
mọi route `/api/v1` đã được khai báo và mọi package route không trùng lặp.

## Biến môi trường

Xem `.env.example`. Bắt buộc: `DATABASE_URL`, `JWT_SECRET` (≥ 32 ký tự ở production).
`ALLOWED_ORIGINS` phải được đặt ở production; để trống chỉ dành cho development.
