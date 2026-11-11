# Báo cáo Gate G0 — Baseline Audit Trước Thực thi (`77783fb`)

> **Thời điểm kiểm toán**: 2026-11-12 (Branch `feat/smartlogi-enterprise-2026`, HEAD `77783fb6da9f309d4c7f68727571c455c9818be7`; nhánh `main` đang ở `affba05e5951fa522bcf15a6cf31e17a8cdebaba`).  
> **Nguyên tắc phân loại**: Tách bạch `[REPRODUCED]` (đã chạy/đếm trực tiếp trên mã nguồn), `[LIVE_VERIFIED]` (đo trực tiếp từ HTTP/API Vercel & Neon) và `[REPORTED]` (mốc từ tài liệu trước).

---

## 1. Xác minh Thực tế Số lượng Mã nguồn (`[REPRODUCED]`)

| Chỉ số | Mốc tài liệu trước | Đo thực tế tại `77783fb` | Nguồn xác minh |
|---|---:|---:|---|
| Trang Web App Router | 91 | **91** (`admin` 18, `tenant` 53, `customer` 14, `pack` 6) | `frontend/` App Router `page.tsx` |
| Màn hình Driver App Expo | 10 | **10** | `frontend/mobile/driver-app/src/screens/` |
| Prisma Models | 104 | **104** | `packages/prisma-schemas/prisma/schema.prisma` |
| Prisma Migrations | 7 | **7** | `packages/prisma-schemas/prisma/migrations/` |
| Handler Decorator Core API | 488 | **488** (trên `77` file controller) | `backend/core-api/src/modules/` |
| Handler Cloudflare AI Worker | — | **21** | `workers/ai-worker/src/routes/` |
| Static Invariant Verifier | 8/8 PASS | **8/8 PASS (0 errors)** | `scripts/static-verify.py` |

---

## 2. Xác minh Hạ tầng Vercel & Cloud DB tại Baseline (`[LIVE_VERIFIED]`)

- **Tài khoản Vercel đích**: team `visionary19` (`team_T6s3oJUmrj5hwTjwgDszZMP2`, gói `hobby`), liên kết repo `lovemvaf/Logistic_AI_SaaS`, Production branch `main`.
- **Bảo vệ dự án hiện hữu**: `visionary-platform` (`prj_1RYie8YpvZSUGdN7u0C3uYEzEun6`) — giữ nguyên tuyệt đối, không chỉnh sửa.
- **Trạng thái 4 domain public trước khi sửa**:
  1. `https://smartlogi-admin.vercel.app/` (`frontend/feature-test/admin-portal`): `/` HTTP 200, `/admin/login` HTTP 200, `/api/v1/health` **HTTP 404**.
  2. `https://smartlogi-tenant.vercel.app/` (`frontend/reporting/tenant-portal`): `/` HTTP 200, `/login` HTTP 200, `/api/v1/health` **HTTP 404**.
  3. `https://smartlogi-customer.vercel.app/` (`frontend/reporting/customer-portal`): `/` HTTP 200, `/client/login` HTTP 200, `/login` **HTTP 404**, `/api/v1/health` **HTTP 404**.
  4. `https://smartlogi-pack.vercel.app/` (`frontend/reporting/pack-station-web`): `/` HTTP 200, `/login` HTTP 200, `/api/v1/health` **HTTP 404**.
- **Nguyên nhân gốc P0**: Cả 4 cổng cài `NEXT_PUBLIC_DATA_SOURCE=api`, `NEXT_PUBLIC_API_URL=/api/v1`, `NEXT_PUBLIC_DEMO_MODE=false`, chưa có `API_INTERNAL_URL`, nên hàm `rewrites()` trong `frontend/feature-test/admin-portal/next.config.js`, `frontend/reporting/tenant-portal/next.config.mjs`, `frontend/reporting/customer-portal/next.config.js` và `frontend/reporting/pack-station-web/next.config.js` trả về mảng rỗng `[]`, khiến mọi lời gọi `/api/v1/*` đều lỗi 404.
- **Cloud Database hiện hữu**: Dự án Neon `smartlogi-demo-db` (PG 18.6 + PostGIS 3.6, region `sin1`, Free Tier) đã được gắn `DATABASE_URL` / `DATABASE_URL_UNPOOLED` trên đúng 4 project SmartLogi, nhưng tại baseline chưa chạy migration và chưa seed dữ liệu.

---

## 3. Danh mục Lỗi & Hạn chế Cần Khắc phục (TODO Tracker)

| ID | Mức độ | Mô tả phát hiện & Vị trí | Hướng xử lý bắt buộc | Kiểm tra nghiệm thu |
|---|---|---|---|---|
| `D01` | **P0** | Toàn bộ `/api/v1/*` trả HTTP 404 trên 4 domain Vercel do thiếu `API_INTERNAL_URL` | Triển khai Phương án B + giữ Phương án A: shared serverless Demo API (`packages/demo-cloud-api`) mount tại `app/api/v1/[[...path]]/route.ts` trên cả 4 portal dùng chung Neon DB; vẫn giữ rewrite `API_INTERNAL_URL` khi deploy cùng gateway | `verify-deployment.mjs` (không `--skip-proxy`) + `E01..E40` |
| `D02` | **P0** | Neon DB chưa migrate, chưa tạo role `smartlogi_app` (`NOBYPASSRLS`) và chưa seed dữ liệu demo | Chạy `prisma migrate deploy`, tạo/cấp quyền `smartlogi_app`, xác minh `tenant-isolation.sql` trực tiếp trên Neon, chạy `demo:reset -> seed:demo -> demo:verify` | `psql`/Node RLS test PASS + `demo:verify` PASS |
| `D03` | **P0** | Đăng nhập nhanh vai trò demo bị ẩn khi `NEXT_PUBLIC_DATA_SOURCE=api`; `NEXT_PUBLIC_DEMO_MODE=false`; `frontend/reporting/tenant-portal/src/app/login/page.tsx` dùng slug cũ `demo-logistics-vn` | Mở trải nghiệm "Trải nghiệm bản demo" qua `/api/v1/demo/login` theo sandbox + persona; sửa slug mặc định thành `demo-3pl-dn`; lưu phiên cookie `HttpOnly` và giữ đăng nhập sau reload | `E02`, `E03`, `E05` trên 4 domain |
| `D04` | **P0** | `https://smartlogi-customer.vercel.app/login` trả HTTP 404 (chỉ có `/client/login`) | Bổ sung route `frontend/reporting/customer-portal/src/app/login/page.tsx` đồng bộ với `/client/login` | `E01`, `E03` deep link refresh |
| `D05` | **P0** | 4 origin Vercel không dùng chung `localStorage`; thiếu cơ chế chuyển cổng & sandbox cô lập | Xây `/api/v1/demo/handoff` token ký HMAC một lần (TTL 60s lưu DB) + `/demo-handoff` trên cả 4 cổng + `sandboxId` cho phép chia sẻ hoặc cô lập | `E20`, `E21`, `E32`, `E33` |
| `D06` | **P0** | Tài xế hiện chỉ có Expo app (`frontend/mobile/driver-app`), chưa thao tác được trên Vercel | Xây Web Driver Simulator responsive tại route `/driver-sim` trên Tenant Portal nối shared Demo API (GPS replay, geofence, SOS, ePOD, COD, offline queue & conflict `409`) | `E14`, `E15`, `E16`, `E17` |
| `D07` | **P1** | `frontend/reporting/pack-station-web/src/app/pack/page.tsx` thiếu cụm simulator tương tác Camera/Barcode/Scale/In nhãn | Bổ sung Virtual Camera (chọn SKU mẫu/sai + confidence + nhãn `SIMULATED`), Virtual Barcode, Virtual Digital Scale (gồm case quá dung sai) và modal in phiếu PDF/preview | `E09`, `E10`, `E11`, `E12` |
| `D08` | **P1** | Thiếu Demo Control Center và preset 32 kịch bản thay đổi trạng thái DB thật | Xây `DemoScenarioEngine` + bảng điều khiển 32 preset (`NORMAL_DAY`..`OUTBOX_DEAD_LETTER`), thanh chuyển portal, health telemetry và nút Reset sandbox | `E31`, `E32`, `E33` |
| `D09` | **P1** | `frontend/feature-test/admin-portal/src/app/admin/orders/page.tsx` dùng `window.confirm` trình duyệt | Thay bằng Confirm Modal chuẩn truy cập (ESC/focus trap/ARIA) | Audit DOM + `E34`, `E37` |
| `D10` | **P1** | `frontend/reporting/tenant-portal/src/app/orders/rate-estimation/page.tsx` tách rời biểu giá module `pricing` | Đồng bộ công thức với `ContractRate` / `SurchargeRule` và hiển thị rõ công thức giải thích | `E21`, `E24` |
| `D11` | **P1** | `frontend/feature-test/admin-portal/src/app/admin/ai-models/page.tsx` thiếu trải nghiệm mô phỏng huấn luyện tách bạch khỏi API 501 thật | Giữ `POST /api/v1/ai/v1/train/:type` trả HTTP `501 TRAINING_NOT_IMPLEMENTED`; bổ sung tab **Simulation: Retraining Workflow** có nhãn `SIMULATION ONLY, MODEL NOT TRAINED` | API check + `E30` |
| `D12` | **P0** | Production 4 domain Vercel đang dừng ở `018adb9` (cũ hơn `feat/smartlogi-enterprise-2026`) | Sau khi xác minh Preview & CI xanh 100%, hợp nhất vào `main` để 4 domain production chạy đúng commit SHA mới nhất | `E40` + `/build-info` |

Xem chi tiết kiểm kê từng trang (97 dòng) trong [AUDIT_MATRIX.csv](./AUDIT_MATRIX.csv).
