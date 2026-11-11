# AGENTS.md — SmartLogi SaaS

Tài liệu ràng buộc cho mọi agent làm việc trong repo này. Đọc hết trước khi sửa code.

## 1. Môi trường làm việc

- **Local chỉ để viết code.** Không chạy `npm`, `pnpm`, `npx`, `docker`, `docker compose`,
  `next dev`, `next build`, `prisma`, `go`, `cargo` trên máy local.
- **Ứng dụng chỉ chạy trên host free plan** (Vercel Hobby cho frontend). Mọi thay đổi phải
  build được ở đó, không được giả định có server riêng, cron, worker nền hay database local.
- Vì không chạy được build, mọi thay đổi phải **kiểm tra tĩnh**: đọc lại import/export, kiểu
  dữ liệu, đường dẫn route, props component, cú pháp JSX. Không dùng thư viện mới.
- Không commit `.env`, token, khoá Google, chuỗi kết nối thật.
- Không xoá file của người khác khi chưa đọc. Không `git checkout`/`reset`/`clean` để dọn
  working tree.

## 2. Kiến trúc hiện tại

```
frontend/feature-test/admin-portal      Admin Portal (Next 15) — site deploy chính
frontend/reporting/tenant-portal        Tenant Portal (Next 15) — back-office vận hành
frontend/reporting/customer-portal      Customer Portal (Next 15) — B2B self-service
frontend/reporting/pack-station-web     Pack Station (Next 15) — trạm đóng gói
frontend/mobile/driver-app              Driver App (Expo / React Native)
backend/core-api                        NestJS modular monolith, toàn bộ route /api/v1
backend/gps-ingestion-service           Go, UDP 8091 + PostGIS
backend/webhook-service                 Go, phát webhook ra ngoài
backend/rust-api                        Rust workspace — backend thay thế tương lai
workers/ai-worker                       Cloudflare Worker
packages/ui-tokens                      token màu/font duy nhất
packages/ui-kit                         shell + editorial primitives
packages/ui-components                  bảng, form, modal, toast, trạng thái dữ liệu
packages/wms-engine                     FIFO / LIFO / FEFO, putaway, wave
```

- Backend hiện tại là **modular monolith** `backend/core-api`, không phải microservice như
  báo cáo cũ. Không tạo lại `services/*` hay `apps/*`.
- Hợp đồng API chuẩn là `/api/v1/*` (gateway 3000, prefix global trong core-api). Mọi mock
  phải phản chiếu đúng hợp đồng này để sau này thay bằng Rust mà không sửa UI.

## 3. Frontend-first, mock là mặc định

- Biến môi trường: `NEXT_PUBLIC_DATA_SOURCE=mock|api`.
  - `mock` (mặc định khi không set): dùng lớp mock trong `src/lib/mock/`, không gọi mạng.
  - `api`: dùng adapter REST trỏ `/api/v1`, dành cho lúc backend thật chạy.
- Mọi truy cập dữ liệu của page/component đi qua `@/lib/data`, **không** gọi `api.get`
  trực tiếp trong page mới. Không import fixture rải rác trong component.
- Dữ liệu mock nằm trong `src/lib/mock/` của từng portal. Không tạo package workspace mới
  (lockfile không được regenerate trên host).
- Mock phải có: dữ liệu Việt Nam thực tế, thao tác ghi hoạt động, lưu `localStorage`, hàm
  `reset()` để trả về seed, độ trễ giả lập, trạng thái lỗi/rỗng có thể bật để kiểm tra UI.
- Không thêm dependency mới. Dùng `swr`, `axios`, `date-fns`, `recharts`, `@hello-pangea/dnd`,
  `react-dropzone` đã có trong portal tương ứng.

## 4. Hợp đồng dữ liệu

- Kiểu dữ liệu domain khai báo một lần trong `src/lib/mock/types.ts` của mỗi portal.
- Tiền tệ: `number` VND, hiển thị `1.234.567 ₫`; ngày lưu ISO 8601, hiển thị
  `dd/MM/yyyy HH:mm`; số liệu dùng `tabular-nums`.
- Mã nghiệp vụ theo mẫu đang dùng: `SLG-YYYYMMDD-XXXXXX` (đơn), `TRP-xxxx` (chuyến),
  `WAV-xxxx` (wave), `RET-xxxx` (trả hàng), `COD-xxxx` (quyết toán), `SOS-xxxx`.
- Trạng thái đơn: `NEW | UNASSIGNED | PENDING_PICKUP | PICKING | PACKED | IN_TRANSIT |
  OUT_FOR_DELIVERY | DELIVERED | FAILED | RETURN_REQUESTED | RETURNED | CANCELLED`.
- Trạng thái chuyến: `PLANNED | DISPATCHED | IN_PROGRESS | COMPLETED | CANCELLED`.
- Mọi danh sách trả về mảng đã sắp xếp mới nhất trước; lọc/phân trang xử lý ở tầng data.

## 5. Ngôn ngữ thị giác (bắt buộc)

Nguồn chuẩn: `docs/plans/design-refresh-no-icons.md` và `docs/plans/ui-consistency.md`.

- Nền giấy ấm, accent sage, hairline, bảng dày, chữ rõ. Không gradient, không shadow lớn,
  không card KPI, không pill CTA, không hero/bento.
- Không icon trang trí (kể cả emoji trong UI). Trạng thái = chấm + nhãn chữ.
- `Cormorant Garamond` chỉ cho page title/wordmark; body `Plus Jakarta Sans`.
- Ưu tiên `EditorialPageHeader`, `MetricBand`, `EditorialSection`, `StatusLabel`, `EmptyNote`
  từ `ui-kit`. Form/bảng dùng `ui-components` (`Table`, `Modal`, `Input`, `Select`, `Button`,
  `TableState`, `Pagination`, `ToastHost`).
- Không double padding: `AppShell` đã có padding, page không thêm `p-8 max-w-7xl mx-auto`.
- Bảng mật độ cao: header 10–11px uppercase tracking, dòng 12–13px, cao 36–44px, đường kẻ
  hairline, không zebra màu mạnh.
- Copy UI tiếng Việt, không viết hoa toàn bộ câu, không dùng từ marketing.

## 6. Phân vùng sở hữu (tránh xung đột khi chạy song song)

| Làn | Vai | Được sửa | Không được sửa |
|---|---|---|---|
| A0 | Nền tảng (đã xong, đóng băng) | — | `frontend/reporting/tenant-portal/src/lib/**` — mọi sửa đổi |
| A1 | WMS & đơn hàng | `tenant-portal/src/app/orders/**`, `app/inventory/**`, `app/wms/**` | `src/lib/**`, `app/logistics/**`, `app/finance/**`, `app/admin/**`, `app/roles/**`, `app/users/**`, `app/settings/**`, `app/warehouses/**`, `app/profile/**` |
| A2 | TMS & đội xe | `tenant-portal/src/app/logistics/**`, `app/drivers/**`, `app/warehouses/**`, `frontend/mobile/driver-app/src/**` | `src/lib/**`, `app/orders/**`, `app/inventory/**`, `app/wms/**`, `app/finance/**`, `app/admin/**`, `app/profile/**` |
| A3 | Tài chính & quản trị tenant | `tenant-portal/src/app/finance/**`, `app/admin/**`, `app/roles/**`, `app/users/**`, `app/settings/**`, `app/branches/**`, `app/profile/**` | `src/lib/**`, `app/logistics/**`, `app/orders/**`, `app/inventory/**`, `app/wms/**`, `app/warehouses/**` |
| A4 | Admin portal | toàn bộ `frontend/feature-test/admin-portal/**` | các portal khác, `packages/**` |
| A5 | Customer + Pack Station | `frontend/reporting/customer-portal/**`, `frontend/reporting/pack-station-web/**` | tenant/admin portal, `packages/**`, lockfile |
| A6 | Rust | `backend/rust-api/**` | frontend, backend hiện tại |

- Chỉ A0 sửa `src/lib/**` tenant portal. Lập bản đồ mà không sửa.
- A1–A3 không sửa `src/lib/**` của tenant portal. Làn nào cần thêm hàm/kiểu mới thì báo
  lỗi cụ thể (tên hàm + file + lý do) vào báo cáo, A0 sẽ bổ sung sau.
- Không sửa `packages/ui-kit`, `packages/ui-components`, `packages/ui-tokens`,
  `packages/map-components` trong đợt song song này.
- A4 sửa `store.ts` admin portal riêng, A5 tạo `mock/` riêng cho customer và pack station.
- A6 sửa `backend/rust-api/**`. Không xoá `backend/core-api`.
- Không sửa `pnpm-lock.yaml`, `package.json` workspace, `docker-compose.yml`.

## 7. Chuẩn hoàn thành

Một task chỉ được coi là xong khi:

- Không còn `TODO`, `FIXME`, `placeholder`, nút bấm rỗng, `alert()` giả, `console.log` sót.
- Mọi bảng có đủ 4 trạng thái: loading, rỗng, lỗi, có dữ liệu.
- Mọi hành động ghi (tạo, sửa, duyệt, huỷ, đối soát) cập nhật mock và phản ánh lại UI.
- Không import chéo giữa các portal, không import file không tồn tại, không dùng component
  chưa được export.
- Route mới phải thêm mục điều hướng tương ứng trong `Sidebar` của portal đó (chỉ khi được
  phép sửa file đó — nếu không, ghi rõ route cần thêm trong báo cáo cuối).
- Báo cáo cuối: file đã sửa, route đã thêm, lỗi/thiếu/sai sót phát hiện, phần chưa làm được.
  Không đưa ra đề xuất ngoài phạm vi.

## 8. Backend Rust thay thế

- Workspace: `backend/rust-api`, crate `api` (axum), `domain`, `infra`.
- Route phải trùng `/api/v1/*` với core-api; response envelope giữ nguyên
  (`{ data, meta }` cho danh sách).
- Không chạy `cargo`. Mã phải biên dịch được về mặt cú pháp/kiểu khi đọc tĩnh.
- Không xoá `backend/core-api`; hai backend cùng tồn tại cho tới khi chuyển đổi xong.
