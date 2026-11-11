# Kế hoạch thực thi SmartLogi AI SaaS Enterprise (`implementation-plan.md`)

Ngày lập: 2026-11-11  
Nhánh làm việc: `feat/smartlogi-enterprise-2026` (baseline HEAD `affba05e5951fa522bcf15a6cf31e17a8cdebaba`)  
Mục tiêu: Hoàn thiện P0/P1 bảo mật-toàn vẹn dữ liệu, mở rộng 3PL/FCL/LCL/XNK/TP Đồng Nai 2026, chuẩn hóa UI/UX 4 portal, tích hợp demo thật (`db:seed:demo`), tự động CI/CD và triển khai Vercel team `visionary19`.

---

## 1. Critical Path & Phụ thuộc theo Gate

| Gate | Phạm vi | Phụ thuộc trước | Tiêu chí đạt | Trạng thái |
|---|---|---|---|---|
| **G0** | Re-baseline git, bảo toàn working tree, xác nhận Vercel `visionary19` (`lovemvaf`) | — | `git status` sạch, PG18+PostGIS+Redis hoạt động | DONE |
| **G1** | Inventory runtime, DB migrations, chạy baseline Jest/ts-node/ai-worker/RLS SQL/static-verify | G0 | 5 migration deployed, RLS pass, 67 Jest + 21 wms-engine + 42 ai-worker pass | DONE |
| **G2** | Ma trận thực thi (`enterprise-execution-matrix.csv`), sổ bằng chứng, change-log, ADR | G1 | Tài liệu đầy đủ, `static-verify.py` = 0 lỗi | DONE |
| **G3** | Sửa P0/P1: Outbox lease/Kafka ACK, DB Idempotency 409, GPS UDP HMAC canonical, Webhook Redis Streams + IP-pinned SSRF + bỏ `PUBLIC_PATHS` leak, RLS `ClientApiKey` + `PublicTrackingGrant`, Offline CSPRNG/sequence, Node 22 + Gateway `helmet` | G2 | Unit/concurrency tests đạt, RLS SQL pass, gateway & static checks xanh | IN_PROGRESS |
| **G4** | Schema mở rộng + Migration + RLS (TP Đồng Nai 2026 95 tên + GIS provenance, Container/Chassis/Yard/EIR, Freight RFQ/Quote/Booking/DEM-DET/AR-AP/Disputes, Trade XNK + HS advisory) + Core API modules + AI Worker extensions | G3 | Migration sạch, `tenant-isolation.sql` pass toàn bộ bảng mới, Jest + ai-worker pass | PENDING |
| **G5** | Nâng cấp 4 Next portals (`next.config`, `api.ts`, `vercel-build`, UI Đồng Nai 2026 / Freight Control Tower / Yard / XNK / Customer Freight / Public Tracking / Pack Station) + bộ seed demo `db:seed:demo`, `demo:reset`, `demo:verify` | G4 | 4 portal UI hoàn chỉnh không emoji/mock-leak, `demo:verify` pass S1–S12 invariants | PENDING |
| **G6** | 4x `next build`, chạy stack thật + Playwright E2E S1–S12 + security/load GPS + cập nhật CI GitHub Actions + push GitHub + tạo & triển khai 4 project Vercel `visionary19` + docs deployment | G5 | CI Run mới xanh, 4 portal build & E2E browser qua, Vercel Preview/Prod hoạt động (hoặc ghi rõ `[BLOCKED]`) | PENDING |
| **G7** | Đồng bộ B3–B4 & 6 tài liệu kiến trúc/API/vận hành/AI/vai trò + rà soát cuối `static-verify.py` + báo cáo bàn giao | G6 | Toàn bộ checks xanh sau edit cuối, evidence ledger đầy đủ | PENDING |

---

## 2. Quyết định kiến trúc bổ sung (ADR)

- **ADR-01 (Kiến trúc mở rộng trong Modular Monolith):** Bổ sung `GeographyModule`, `FreightModule`, `YardModule`, `TradeModule`, `PricingModule`, `PublicTrackingModule` ngay trong `backend/core-api` với tiền tố `/api/v1/*`, giữ nguyên RLS qua `PrismaService.runWithTenantRequest()` + `@ExcludeRoles(Roles.CUSTOMER_CLIENT)` cho toàn bộ endpoint nội bộ.
- **ADR-02 (Dữ liệu TP Đồng Nai 2026):** Sử dụng duy nhất 95 tên (33 phường + 62 xã) từ văn bản tham chiếu đính kèm, đặt `officialCodeStatus = 'PENDING_OFFICIAL_CODE'`, `boundaryStatus = 'NO_OFFICIAL_POLYGON'`; phân tách rõ cảng ngoài địa bàn (Cát Lái thuộc TP.HCM, Cái Mép–Thị Vải thuộc BR-VT) qua `LogisticsFacility.outsideCity = true`.
- **ADR-03 (Triển khai đa hạ tầng):** 4 portal Next.js đặt trên Vercel team `visionary19` (`smartlogi-admin`, `smartlogi-tenant`, `smartlogi-customer`, `smartlogi-pack`); các dịch vụ stateful/UDP (`core-api`, `api-gateway`, `gps-ingestion-service`, `webhook-service`, Postgres/PostGIS, Redis) chạy trên hạ tầng container hỗ trợ UDP + persistent network, không đưa vào Vercel Serverless Functions.
- **ADR-04 (Xây dựng tách biệt môi trường Demo vs Production):** Công cụ `db:seed:demo` / `demo:reset` tự động từ chối chạy khi `NODE_ENV=production`, `ALLOW_DEMO_SEED !== 'true'` hoặc host DB ngoài danh sách local/staging an toàn.
