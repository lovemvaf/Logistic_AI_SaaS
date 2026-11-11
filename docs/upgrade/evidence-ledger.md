# Sổ bằng chứng kiểm chứng (`evidence-ledger.md`)

Quy ước nhãn bắt buộc (tuyệt đối không gộp trạng thái chưa chạy vào đã nghiệm thu):
- `[CODE]`: Đã có mã nguồn/cấu hình trong repo.
- `[TESTED_LOCAL]`: Đã chạy và ghi exit code + sản phẩm đầu ra tại môi trường local (PG 18 + PostGIS 3.6 + Redis + Node 24/pnpm 9).
- `[CI]`: Đã chạy tự động trên GitHub Actions runner sạch (gồm Go race detector & Rust cargo test).
- `[STAGING_E2E]`: Đã chạy end-to-end đầy đủ giữa trình duyệt + portal + gateway + core-api + Postgres/Redis thật.
- `[PROD_VERIFIED]`: Đã kiểm tra endpoint health/TLS/UI trên môi trường production.
- `[PILOT_MEASURED]`: Đo từ pilot doanh nghiệp thực tế 12 tuần (hiện không có -> `[CHƯA ĐO PILOT]`).
- `[PROPOSED]`: Đề xuất kiến trúc/vận hành chưa có hạ tầng cấp phép.
- `[BLOCKED]`: Bị chặn do thiếu quyền/thiết bị/credentials ngoài repo.

---

## Mốc Baseline trước chỉnh sửa (`affba05`)

| Hạng mục | Nhãn | Lệnh / Đường dẫn / Run | Kết quả đo thực tế |
|---|---|---|---|
| Baseline repo kiểm chứng tĩnh | `[TESTED_LOCAL]` | `python -X utf8 scripts/static-verify.py` | **PASS** — 8 check groups, 0 errors |
| Prisma migrations + PostgreSQL 18.1 + PostGIS 3.6 | `[TESTED_LOCAL]` | `prisma migrate deploy` (5 migrations) + `psql ... tenant-isolation.sql` | **PASS** — `smartlogi_app` non-superuser + FORCE RLS + fail-closed `42501` |
| Backend / Gateway / WMS-Engine Jest + `tsc --noEmit` | `[TESTED_LOCAL]` | `jest` + `tsc --noEmit` across workspaces | **PASS** — `wms-engine` 21/21, `api-gateway` 11/11, `core-api` 67/67, 0 TS errors |
| AI Worker Typecheck & suites | `[TESTED_LOCAL]` | `npm test` (`workers/ai-worker`) | **PASS** — 42/42 (`llm` 13, `journey` 7, `vrp` 10, `compute` 12) |
| Vercel CLI Team Access | `[TESTED_LOCAL]` | `npx vercel whoami && npx vercel teams ls` | Logged in as `lovemvaf`; team `visionary19` (`hobby`) accessible (`visionary-platform` present, untouched) |
| Go race detector local | `[BLOCKED]` | `go version` | Máy Windows local không cài Go SDK; chuyển chạy trên GitHub Actions `go-services` (`go test -v -race ./...`) |
| 12-week Pilot KPIs | `[CHƯA ĐO PILOT]` | `docs/ho-so-cap-nhat-B3-B4.md` | Chưa có đối tác pilot thực địa; mọi chỉ số hiệu quả định lượng pilot chưa đo |

---

## Bảng cập nhật bằng chứng sau khi thực thi (G3 -> G7)

| Gate | Hạng mục | Nhãn | Lệnh kiểm chứng | Kết quả thực tế |
|---|---|---|---|---|
| G3.1 | Hardening migration `20261111120000_hardening_outbox_idempotency_rls` + `tenant-isolation.sql` | `[TESTED_LOCAL]` | `prisma migrate deploy` + `psql -v ON_ERROR_STOP=1 -f packages/prisma-schemas/prisma/tests/tenant-isolation.sql` | **PASS (exit 0)** — RLS fail-closed xác minh trên `client_api_keys`, `api_idempotency_records`, `public_tracking_grants`, `webhook_deliveries` |
| G3.2–G3.6 | Outbox lease + `emitAsync`, DB Idempotency SHA-256, Gateway remove `/api/v1/inbound/webhooks` + `helmet`, CSPRNG offline-sync, Node 22, Public tracking coarse GPS | `[TESTED_LOCAL]` | `jest` (`core-api`, `api-gateway`, `wms-engine`), `tsc --noEmit`, `offline-sync-engine build`, `scripts/static-verify.py` | **PASS (exit 0)** — `core-api` 6/6 suites (71/71), `api-gateway` 3/3 suites (11/11), `wms-engine` 1/1 suite (21/21), `static-verify.py` 8/8 (0 errors) |
| G3.4–G3.5 | Go `gps-ingestion-service` canonical v2 HMAC + `webhook-service` IP-pinned DialContext + Redis Streams + DLQ/redrive | `[CODE]` | Chờ GitHub Actions `go-services` (`go vet ./... && go test -v -race ./...`) | Đã sửa code & unit tests Go; máy Windows local không cài `go` SDK nên chờ kết quả `[CI]` |
