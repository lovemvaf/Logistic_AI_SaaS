# Bộ prompt — 6 agent song song

> Đợt: frontend-first, mock mặc định, Rust dựng khung song song.
> Cập nhật: 2026-11-11
> Nền tảng A0 đã xong và **đóng băng** — xem `00-nen-tang-da-xong.md`.

## 1. Cấu trúc đợt này

| Làn | Agent | Prompt | Phạm vi chính | Phụ thuộc |
|---|---|---|---|---|
| A0 | Nền tảng (đã xong) | `00-nen-tang-da-xong.md` | `tenant-portal/src/lib/**`, shell, login, dashboard, notifications | — |
| A1 | WMS & đơn hàng | `01-wms-va-don-hang.md` | `app/orders/**`, `app/inventory/**`, `app/wms/**` | A0 |
| A2 | TMS & đội xe | `02-tms-va-doi-xe.md` | `app/logistics/**`, `app/drivers/**`, `app/warehouses/**`, `mobile/driver-app/src/**` | A0 |
| A3 | Tài chính & quản trị tenant | `03-tai-chinh-va-quan-tri.md` | `app/finance/**`, `app/admin/**`, `app/users/**`, `app/roles/**`, `app/settings/**`, `app/branches/**`, `app/profile/**` | A0 |
| A4 | Admin portal | `04-admin-portal.md` | `frontend/feature-test/admin-portal/**` | — |
| A5 | Customer portal & Pack Station | `05-customer-va-pack-station.md` | `frontend/reporting/customer-portal/**`, `frontend/reporting/pack-station-web/**` | — |
| A6 | Rust backend | `06-rust-backend.md` | `backend/rust-api/**` | — |

A1–A3 chạm ba vùng khác nhau của cùng `tenant-portal`, không sửa chéo. A4 và A5 chạm
portal riêng. A6 chỉ chạm Rust. Sáu làn chạy được đồng thời sau khi A0 đóng băng.

## 2. Điều kiện trước khi chạy

1. Đọc `AGENTS.md` (toàn bộ), `docs/plans/frontend-feature-map.md`,
   `docs/plans/design-refresh-no-icons.md`.
2. Đọc `00-nen-tang-da-xong.md` để biết chính xác `@/lib/data` có gì; **không đoán tên hàm**.
3. Chỉ sửa file trong vùng của mình. Không sửa `packages/**`, `pnpm-lock.yaml`,
   `package.json` workspace, `docker-compose.yml`.
4. Không chạy `npm`, `pnpm`, `npx`, `docker`, `cargo`, `next dev`, `next build`, `prisma`.
   Mọi xác minh bằng đọc code, `grep`, đối chiếu kiểu và import.
5. Không thêm dependency. Không import chéo giữa các portal.
6. Không `git checkout`/`reset`/`clean`. Working tree đang có nhiều thay đổi chưa commit.

## 3. Đóng băng nền tảng

- `tenant-portal/src/lib/**` chỉ A0 sửa. A1–A3 cần thêm hàm/kiểu thì **ghi vào báo cáo**,
  dùng tạm dữ liệu sẵn có, không tự thêm.
- `src/components/{AppShell,AuthGate,Header,Sidebar,DemoActions}.tsx` và
  `app/{layout,login,dashboard,notifications}` cũng thuộc A0.
- Nếu một trang cần route mới mà Sidebar chưa có mục, ghi rõ trong báo cáo; không tự sửa
  Sidebar.
- `packages/ui-kit`, `packages/ui-components`, `packages/ui-tokens` không sửa. Thiếu
  primitive thì dựng bằng Tailwind ngay trong page.

## 4. Kiểm tra tĩnh bắt buộc (thay cho build)

Trước khi báo xong, tự kiểm từng mục:

1. **Đường dẫn import**: mọi `@/...` và tương đối trỏ tới file có thật; named export có
   thật trong file đích (`grep "^export"`).
2. **Hợp đồng dữ liệu**: mỗi `data.<nhóm>.<hàm>` phải tồn tại ở **cả** `mock/store.ts` và
   `mock/repository.ts`. Sai lệch sẽ vỡ khi đổi `NEXT_PUBLIC_DATA_SOURCE=api`.
3. **Kiểu**: đọc interface component đang dùng (`Table`, `Modal`, `Input`, `Select`,
   `StatusLabel`, `MetricBand`…) và truyền đúng prop, đúng kiểu. Không `as any` mới.
4. **Client boundary**: page dùng hook/`window`/`localStorage` phải có `'use client'` ở
   dòng đầu. Không đọc `localStorage` ở module scope.
5. **Bốn trạng thái bảng**: loading, rỗng, lỗi, có dữ liệu — dùng `DataState` của
   `ui-components` (cũng tồn tại `TableState` dành cho một dòng bảng, khuyến nghị dùng
   `DataState` bao phòng conten).
6. **Ghi dữ liệu**: sau `await data.x.y(...)` phải cập nhật state/danh sách; `catch` phải
   hiện lỗi tại chỗ, không chỉ `toast`.
7. **Route**: thư mục `app/.../page.tsx` khớp `href` trong link; route động dùng đúng tên
   tham số (`[trackingCode]` → `params.trackingCode`).
8. **Không sót**: không `TODO`, `FIXME`, `placeholder`, `alert(`, `console.log`, nút bấm
   rỗng, `href="#"`.
9. **Không đổi lockfile**: `git status` không được có `pnpm-lock.yaml`, `package.json`
   workspace.
10. **Tiếng Việt**: copy UI tiếng Việt, không viết hoa cả câu, không từ marketing.

## 5. Mẫu báo cáo cuối mỗi agent

```
Làn: A1 / A2 / A3 / A4 / A5 / A6
Đã sửa: <đường dẫn> — <việc đã làm>
Route thêm: <route> — <cần thêm mục Sidebar hay không>
Dữ liệu dùng: <data.nhóm.hàm> — <hàm nào còn thiếu, cần A0 bổ sung>
Đã kiểm tra tĩnh: <import, kiểu props, 4 trạng thái, ghi + reload, client boundary>
Lỗi/thiếu/sai sót phát hiện: <mô tả hoặc "không">
Chưa làm được: <lý do hoặc "không">
```

Không đề xuất ngoài phạm vi. Không thêm kế hoạch mới. Chỉ báo việc đã làm và cái còn thiếu.
