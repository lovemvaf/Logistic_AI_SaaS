# Kiến trúc Môi trường Demo Cloud Tích hợp (`SmartLogi Demo Cloud`)

Tài liệu mô tả kiến trúc thực thi trực tuyến của **4 website SmartLogi** trên Vercel (`visionary19`) kết nối trực tiếp tới **Neon PostgreSQL 18.6 + PostGIS 3.6** (`sin1`) thông qua gói in-process **`demo-cloud-api`**, không dùng dữ liệu mock tĩnh khi `NEXT_PUBLIC_DATA_SOURCE=api`.

---

## 1. Sơ đồ Kết nối 4 Portal & Shared Cloud Database

```text
  +--------------------+   +--------------------+   +--------------------+   +--------------------+
  |  smartlogi-admin   |   |  smartlogi-tenant  |   | smartlogi-customer |   |   smartlogi-pack   |
  | (Vercel / Next 15) |   | (Vercel / Next 15) |   | (Vercel / Next 15) |   | (Vercel / Next 15) |
  +---------+----------+   +---------+----------+   +---------+----------+   +---------+----------+
            | /api/v1/*              | /api/v1/*              | /api/v1/*              | /api/v1/*
            v                        v                        v                        v
     +----------------------------------------------------------------------------------------+
     |   In-Process Catch-All App Router Handlers (`runtime = 'nodejs'`)                      |
     |   dispatchDemoApi() -> packages/demo-cloud-api/src/router.ts                           |
     |   (JWT HMAC-SHA256 Session + HttpOnly Portal Cookie + Sandbox Fault Injection Guard)   |
     +-------------------------------------------+--------------------------------------------+
                                                 |
                                                 v  PrismaClient ($transaction + FORCE RLS GUC)
                               +-----------------------------------+
                               |  Neon PostgreSQL 18.6 + PostGIS   |
                               |  Region: aws-ap-southeast-1 (sin1)|
                               |  Shared tables + 88 FORCE RLS     |
                               +-----------------------------------+
```

> **Phân tách kiến trúc**:
> - **Môi trường Vercel Demo Cloud**: Mỗi portal chạy route handler Node.js App Router gọi `handleNextApiRequest()` trong [`packages/demo-cloud-api/src/router.ts`](../../packages/demo-cloud-api/src/router.ts), truy vấn và ghi thật xuống Neon PostgreSQL để 4 website chia sẻ chung trạng thái nghiệp vụ tức thời.
> - **Cụm Stateful Microservices/Monolith Độc lập**: [`api/api-gateway`](../../api/api-gateway), [`backend/core-api`](../../backend/core-api), [`backend/gps-ingestion-service`](../../backend/gps-ingestion-service), [`backend/webhook-service`](../../backend/webhook-service), và [`workers/ai-worker`](../../workers/ai-worker) phục vụ triển khai container/VPS khi bật biến `API_INTERNAL_URL` qua gateway riêng. Xem thêm [VERCEL_VISIONARY19.md](../deployment/VERCEL_VISIONARY19.md).

---

## 2. Cơ chế Bảo mật, Đa Khách thuê (RLS) & Chuyển Cổng

1. **Cô lập phiên PostgreSQL (`packages/demo-cloud-api/src/db.ts`)**:
   - Mọi truy vấn thuộc tenant dùng `withTenant(tenantId, fn)`: mở `$transaction` thiết lập `SELECT set_config('app.bypass_rls', 'off', true), set_config('app.tenant_id', $1, true)` trước khi chạy Prisma query, kích hoạt `FORCE ROW LEVEL SECURITY` trên 88 bảng công khai.
   - Các bảng quản trị nền tảng (`Tenant`, `SystemAdmin`, `DemoSandbox`, `DemoHandoffToken`, `DemoSimulationEvent`, `AdministrativeUnit`, `OutboxEvent`) sử dụng `withPlatform(fn)` (`app.bypass_rls = 'on'`) và chỉ mở qua các endpoint có kiểm tra vai trò tường minh (`SUPER_ADMIN`).
2. **Xác thực & Chống Replay (`packages/demo-cloud-api/src/auth.ts` & `handlers/demo.ts`)**:
   - Hỗ trợ đăng nhập chuẩn (`POST /api/v1/auth/login` với bcryptjs + tenant lookup) và đăng nhập nhanh theo persona (`POST /api/v1/demo/login`, chỉ bật khi `NEXT_PUBLIC_DEMO_MODE=true` hoặc `SMARTLOGI_DEMO_MODE=true`).
   - Kiểm tra `TENANT_SUSPENDED` (HTTP `403`) cả lúc đăng nhập lẫn qua `assertSessionTenantActive()` cho phiên đang mở.
   - **Single-Use Cross-Portal Handoff**: `POST /api/v1/demo/handoff` phát hành token ngẫu nhiên `handoff_*`, chỉ lưu `sha256` trong `demo_handoff_tokens` (TTL 90 giây). `POST /api/v1/demo/handoff/exchange` dùng câu lệnh `updateMany({ where: { id, usedAt: null } })` để đảm bảo mỗi link chuyển cổng chỉ đổi được duy nhất 1 lần (lần 2 trả `410 HANDOFF_ALREADY_USED`).
3. **Cô lập Sandbox (`x-smartlogi-sandbox`)**:
   - Mặc định dùng `shared-demo` để 4 website đồng bộ trực tiếp. Khi người thuyết trình bấm **Tạo Sandbox Riêng**, `POST /api/v1/demo/sandbox/create` cấp `sbx-<hex>` mới; các thao tác kịch bản/lỗi mạng giả lập (`SLOW_800MS`, `RATE_LIMIT_429`, `SERVER_500`) và log sự kiện chỉ tác động tới `sandboxKey` đó.

---

## 3. Phân định Rõ: Thao tác Dữ liệu Thật vs Mô phỏng Nghiệp vụ

| Nhóm tính năng | Thành phần chạy THẬT trên Cloud | Thành phần MÔ PHỎNG (Gắn nhãn minh bạch) |
|---|---|---|
| **Auth, RBAC, Cross-Portal** | Signed JWT + HttpOnly Cookie + bcryptjs + Neon DB `demo_handoff_tokens` | Danh sách Persona Quick-Login trong [`auth.ts`](../../packages/demo-cloud-api/src/auth.ts) |
| **WMS, Orders, Pack Seal** | CRUD đơn hàng, phân bổ tồn kho, tạo Wave, Cycle Count, `PackStationLog` & `CorrectionLog` | Camera MobileNet v2/Barcode/Cân ảo khi kho không gắn thiết bị Web Serial thật |
| **3PL Freight, Yard/EIR, Trade** | RFQ -> Quote -> Booking, kiểm trùng thiết bị `409`, `YardSlot` & `EIR`, tính `DEM`/`DET`, kiểm mật khẩu PDF `422`, `hsReviewRequired` | Trạng thái luồng ĐỎ/VÀNG/XANH (`Simulated VNACCS Customs Gateway`), AIS trễ tàu & lịch ùn ứ `SYNTHETIC_DEMO` |
| **Driver Telemetry & COD Finance** | Lưu `GpsTrackingLog`, `SosAlert`, `OrderPod`, `CodRemittance`, kiểm `X-Sync-Id` chống trùng batch | Nhịp tick `+1 GPS Tick` dọc hành lang Đồng Nai (`GPS Telemetry Feed`) & file sao kê `Simulated Bank Statement CSV Feed` |
| **AI & Tối ưu lộ trình** | Gợi ý VRP/ETA/HS trên dữ liệu thật + **giữ nguyên HTTP `501 TRAINING_NOT_IMPLEMENTED`** tại `/api/v1/ai/v1/train/:type` | Dry-run mô phỏng đánh giá mẫu `/api/v1/demo/ai-sim/retrain` trả cờ `modelTrained: false` |

---

## 4. Vận hành & Khôi phục Dữ liệu Mẫu (`packages/prisma-schemas/prisma/seeds/demo-enterprise.ts`)

```bash
# Kiểm tra sức khỏe toàn diện và số lượng bản ghi từng tenant/bảng Enterprise
pnpm demo:diagnose

# Bootstrap idempotent an toàn lên DB sandbox (bắt buộc ALLOW_DEMO_SEED=true và host trong whitelist)
pnpm demo:bootstrap

# Kiểm chứng toàn vẹn sau bootstrap (95 ĐVHC Đồng Nai 2026, 4 tenants, 230+ orders, 15 personas)
pnpm demo:verify
```

UI Control Center ([`packages/ui-kit/src/DemoControlCenter.tsx`](../../packages/ui-kit/src/DemoControlCenter.tsx)) cung cấp nút **Reset Sandbox** (`POST /api/v1/demo/sandbox/reset`) để dọn các bản ghi mô phỏng tạm thời mà không làm gián đoạn phiên người dùng khác.
