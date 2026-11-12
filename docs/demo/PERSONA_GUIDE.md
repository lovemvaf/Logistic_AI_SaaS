# Hướng dẫn 15 Tài khoản Persona & Cô lập Đa Khách thuê (`PERSONA_GUIDE.md`)

Tài liệu liệt kê **15 vai trò nhân vật (persona)** được định nghĩa trong [`packages/demo-cloud-api/src/auth.ts`](../../packages/demo-cloud-api/src/auth.ts) và đồng bộ trên 4 cổng SmartLogi.

> **Bảo mật thông tin đăng nhập**:
> - Tài liệu này **chỉ công bố Email, Tenant Slug, Vai trò RBAC và Đường dẫn mặc định** để phục vụ phân tích/kiểm thử kiến trúc.
> - Nếu đăng nhập bằng mật khẩu chuẩn (`POST /api/v1/auth/login`), quản trị viên lấy mật khẩu phát sinh cục bộ từ file **`DEMO_ACCOUNTS.local.md`** (đã khóa trong `.gitignore`, tuyệt đối không commit lên Git).
> - Khi `NEXT_PUBLIC_DEMO_MODE=true`, người dùng thử có thể bấm đăng nhập 1 chạm trong khung **Persona** hoặc thanh **Demo Control Center** qua `POST /api/v1/demo/login` mà không cần truyền mật khẩu từ client.

---

## 1. Bảng Danh mục 15 Persona Theo Tenant & Cổng

| Persona Key | Portal chính | Tenant Slug | Vai trò (`DemoRole`) | Email | Mục đích & Phạm vi kiểm chứng |
|---|---|---|---|---|---|
| `super-admin` | `admin` (`/admin/dashboard`) | `platform` | `SUPER_ADMIN` | `superadmin@smartlogi.demo` | Quản trị 4 tenant, Outbox DLQ, Địa giới 95 phường/xã Đồng Nai 2026, AI Models (`501` train boundary) |
| `dn3pl-admin` | `tenant` (`/dashboard`) | `demo-3pl-dn` | `TENANT_ADMIN` | `ops.admin@3pl-dn.demo` | Toàn quyền vận hành WMS, TMS, Freight, Yard, Trade, Finance tại SmartLogi 3PL Đồng Nai |
| `dn3pl-dispatcher` | `tenant` (`/freight`) | `demo-3pl-dn` | `LOGISTICS_MANAGER` | `dispatcher@3pl-dn.demo` | RFQ/Quote/Booking, kiểm trùng đầu kéo/container `409`, bãi ICD & đối soát COD |
| `dn3pl-whmgr` | `tenant` (`/inventory`) | `demo-3pl-dn` | `WAREHOUSE_MANAGER` | `wh.manager@3pl-dn.demo` | Nhập/xuất/chuyển kho FIFO/FEFO, phát hành Wave Picking, phê duyệt Cycle Count |
| `dn3pl-pack` | `pack` (`/pack`) | `demo-3pl-dn` | `WAREHOUSE_STAFF` | `pack.staff@3pl-dn.demo` | Quét barcode, cân ảo, camera CV (`< 0.6` -> HITL), xử lý sai SKU & đóng kiện |
| `dn3pl-driver` | `tenant` (`/driver-sim`) | `demo-3pl-dn` | `DRIVER` | `driver.01@3pl-dn.demo` | Simulator tài xế GPS Đồng Nai, ePOD canvas, hàng đợi Offline `X-Sync-Id` & SOS |
| `dn3pl-client` | `customer` (`/client/dashboard`) | `demo-3pl-dn` | `CUSTOMER_CLIENT` | `buyer.amata@3pl-dn.demo` | Chủ hàng B2B Amata Precision: gửi RFQ, duyệt Quote, up chứng từ, cấp & thu hồi Tracking Grant |
| `dn3pl-analyst` | `tenant` (`/dashboard`) | `demo-3pl-dn` | `TENANT_USER` | `analyst@3pl-dn.demo` | Tài khoản chỉ đọc để kiểm chứng fail-closed `403` trên route ghi/cài đặt |
| `fdi-admin` | `tenant` (`/dashboard`) | `demo-fdi-bh` | `TENANT_ADMIN` | `admin@fdi-bh.demo` | Giám đốc Tenant #2 (FDI Biên Hòa Electronics) — đối chứng cô lập dữ liệu chéo tenant (RLS) |
| `fdi-customs` | `tenant` (`/trade`) | `demo-fdi-bh` | `LOGISTICS_MANAGER` | `customs.lead@fdi-bh.demo` | Duyệt mã HS, xử lý lệch CI/PL & tờ khai phân luồng ĐỎ cho Tenant #2 |
| `fdi-pack` | `pack` (`/pack`) | `demo-fdi-bh` | `WAREHOUSE_STAFF` | `pack.bh@fdi-bh.demo` | Kiểm chứng hàng đợi bàn đóng gói riêng của kho ngoại quan FDI Biên Hòa |
| `fdi-client` | `customer` (`/client/dashboard`) | `demo-fdi-bh` | `CUSTOMER_CLIENT` | `shipping@fdi-electronics.demo` | Khách B2B của Tenant #2 (tuyệt đối không thấy đơn của Amata Precision / Tenant #1) |
| `lmlk-admin` | `tenant` (`/dashboard`) | `demo-lm-lk` | `TENANT_ADMIN` | `admin@lm-lk.demo` | Quản lý Tenant #3 (Last-Mile Long Khánh & Xuân Lộc, gói Growth) |
| `lmlk-client` | `customer` (`/client/dashboard`) | `demo-lm-lk` | `CUSTOMER_CLIENT` | `merchant@longkhanh-agro.demo` | HTX Nông sản Long Khánh thuộc Tenant #3 |
| `suspended-admin` | `tenant` (`/dashboard`) | `demo-suspended` | `TENANT_ADMIN` | `admin@suspended.demo` | **Negative Test**: Bị chặn tức thì **HTTP `403 TENANT_SUSPENDED`** khi đăng nhập hoặc gọi API |

---

## 2. Chế độ Khách Chỉ Đọc (`readOnlyGuest`) & Chuyển Cổng Bảo mật

- **Khách chỉ đọc (`readOnlyGuest: true`)**: Giới hạn tập quyền về `['orders.read', 'reports.read']`, cho phép xem số liệu/luồng giao diện an toàn mà không thực thi thao tác đột biến hệ thống.
- **Chuyển cổng (`POST /api/v1/demo/handoff`)**: Khi người dùng bấm **Mở Admin / Tenant / Customer / Pack** trong Demo Control Center, hệ thống tự ánh xạ sang persona tương thích trong cùng tenant (ví dụ từ `dn3pl-admin` sang cổng Customer sẽ ánh xạ sang `buyer.amata@3pl-dn.demo`) thông qua token dùng một lần có hiệu lực 300 giây.
