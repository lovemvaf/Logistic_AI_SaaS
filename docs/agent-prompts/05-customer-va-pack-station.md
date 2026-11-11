# A5 — Customer portal và Pack Station

## Vai trò

Bạn sở hữu hai portal độc lập: khách hàng B2B (`customer-portal`) và trạm đóng gói
(`pack-station-web`). Cả hai phải chạy được bằng mock khi deploy Vercel, không phụ thuộc
backend. Pack Station giữ Edge AI thật (TensorFlow/MobileNet) nhưng phải có đường lui khi
model không tải được.

## Đọc trước

- `AGENTS.md` mục 1–7
- `docs/agent-prompts/00-nen-tang-da-xong.md` (quy tắc `@/lib/data`,
  `data.<nhóm>.<hàm>` phải tồn tại ở hàm thực tế)
- `docs/plans/design-refresh-no-icons.md`
- `frontend/reporting/customer-portal/src/lib/api.ts`, `src/lib/auth.ts`,
  `src/lib/auth-context.tsx`
- `frontend/reporting/customer-portal/src/app/client/**`, `src/app/track/**`, `src/app/page.tsx`
- `frontend/reporting/pack-station-web/src/app/**`, `package.json`
- `packages/ui-components/src/DataState.tsx` — chuẩn 4 trạng thái bảng: loading/empty/error/data

## Vùng được sửa

```
frontend/reporting/customer-portal/**
frontend/reporting/pack-station-web/**
```

Không sửa tenant/admin portal, `packages/**`, lockfile.

## Hiện trạng (cả hai portal)

- Ứng dụng đã install và import `ui-kit` + `ui-components` (thành phần font/editorial,
  bảng, form, modal, toast, `DataState`). Giữ nguyên.
- Customer portal: `src/lib/auth-context.tsx` xuất `AuthProvider` + `useAuth()` ({token,
  user, login, logout, isLoading}); cổng bảo vệ nằm ở `app/client/layout.tsx` (nếu token
  không tồn tại/chưa tải thì chuyển sang `/client/login`), không có `AuthGate.tsx` ở
  `/track/*` và `/` — đây là trang công cộng.
- Customer portal: tất cả `/client/*` page đều là mẫu legacy (cứu Axios + thẻ
  `ui-components/Card` cũ); `/track/[code]` đang dùng `useSWR` + `api`. Chúng phải được
  viết lại ở đây, không phải tạo mới.
- Pack station: `/pack`, `/pack/logs`, `/login`, `/forgot-password`, `/reset-password`,
  `/` đều có sẵn; giữ nguyên config Next/Vercel (`output: standalone`).
- Customer + packs: **không có** `src/lib/mock/` và `src/lib/data.ts`. Cả hai phải tự tạo.

## Phần A — Customer portal

### A1. Lớp mock riêng

Tạo `src/lib/mock/` (không import từ tenant portal):

- `types.ts`: `CustomerOrder`, `CustomerInvoice`, `CustomerReturn`, `WebhookEndpoint`,
  `StockItem`, `TrackingEvent`, `TrackingSummary`, `CustomerProfile`,
  `CustomerDashboardSummary`.
- `seed.ts`: 18 đơn của một khách B2B mẫu (Công ty TNHH Bán lẻ An Phát), 6 hoá đơn,
  4 yêu cầu trả hàng, 3 webhook, 10 dòng tồn ký gửi, 6 đoạn timeline trạng thái.
- `store.ts`: CRUD + `createOrder`, `cancelOrder`, `requestReturn`, `payInvoice`,
  `toggleWebhook`, `saveProfile`, `reset` — lưu `localStorage` (key
  `smartlogi.customer.mock.db`), có `simulateOutage`/`setLatency` (đối chiếu tenant
  portal), `DB_VERSION = 4`.
- `src/lib/data.ts`: chọn mock/api theo `NEXT_PUBLIC_DATA_SOURCE`. Khi `api`, adapter
  REST gọi `/api/v1/client/*` như tenant portal. `AuthGate` có sẵn trong `app/client/layout.tsx`
  (endpoint `login` mock cho phép demo).

Đăng nhập: thay `api` bằng mock login + `useAuth().login(token)` như tenant portal
(email `buyer@anphat.vn`, mật khẩu bất kỳ), tạo profile vai trò `CLIENT`. Giữ `useAuth`
đây là duy nhất, không tự viết hook mới.

### A2. Trang (viết lại, không tạo mới)

- `/` (landing): editorial, một tiêu đề, một dòng mô tả, form nhập tracking + nút,
  link Đến đăng nhập, bỏ nền tối/spinner... dài cũ.
- `/track/[code]`: công khai, không login. Timeline, trạng thái, ETA, điểm dừng kế
  tiếp; không lộ COD, số điện thoại đầy đủ (che 3 số cuối), không lộ tên khách gửi
  nội bộ, không lộ giá trị khuyến nghị. Nếu tìm không thấy → `EmptyNote` + link `/`.
- `/track/[code]` theo dõi thêm: `data.orders.live(code)` cho bản đồ tâm động: điểm
  đi, điểm đến, vị trí xe cuối cùng, ETA ước lượng, tài xế đang vận chuyển (nếu
  có). Tên khách gửi/địa chỉ khách ẩn với người nhận khi chưa mở.
- `/track/[code]` SLA: `data.orders.sla(code)` — ngày hẹn so ngày thực, trạng thái
  đạt/hết hạn, lý do MDB (nếu trễ).
- `/client/login`: editorial 2 cột tiếng Việt; nút "Vào bằng tài khoản thử nghiệm"
  (mock login), không gọi Google OAuth nếu chưa có `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- `/client/dashboard`: 4 metric (`MetricBand`: đơn tháng, đang giao, tỷ lệ giao đúng hạn,
  công nợ), đơn gần nhất, hoá đơn quá hạn, tồn sắp hết. Không card KPI.
- `/client/orders`: bảng đơn, lọc trạng thái, tìm mã, tạo đơn và huỷ (chỉ khi
  `NEW`/`UNASSIGNED`); mỗi dòng link `/track/[code]` của đơn.
- `/client/orders/upload`: nhận CSV, preview, đếm lỗi, tạo lần lượt qua mock.
- `/client/inventory`: tồn ký gửi theo SKU/kho, HSD, khả dụng; cảnh báo dưới điểm đặt
  lại (tông danger).
- `/client/invoices`: bảng hoá đơn, trạng thái, hạn; "Thanh toán" xác nhận trước,
  cập nhật trạng thái.
- `/client/returns`: tạo yêu cầu trả từ một đơn đã giao, chọn lý do, theo dõi trạng
  thái xử lý + tiền hoàn dự kiến.
- `/client/webhooks`: danh sách endpoint, sự kiện, trạng thái, tỷ lệ thành công; bật/tạm
  dừng qua mock. Không hiển thị secret đầy đủ.
- `/client/profile`: thông tin công ty, người liên hệ, địa chỉ, mật khẩu (chỉ UI, không
  lưu plaintext).

### A3. Giao diện

- Header theo `ui-kit` Components (Topbar + sidebar như `app/client/layout.tsx`); không
  icon, không emoji, không card nổi, không pill.
- Bảng hairline, số `tabular-nums`, tiền VND (`Intl.NumberFormat('vi-VN')` hoặc hàm
  format tương đương).
- Mọi bảng có loading/rỗng/lỗi/dữ liệu (`DataState`).
- Không gọi `axios`/`api` trực tiếp trong page mới; chỉ `@/lib/data`.
- Lấy lại `formatCurrency`/`formatDateTimeVN` nếu cần (CHỈ từ `ci` của mình, không
  import tenant).

## Phần B — Pack Station

### B1. Lớp mock riêng

Tạo `src/lib/mock/`:

- `types.ts`: `PackSession`, `PackOrder`, `PackProduct`, `AiPrediction`,
  `CorrectionLog`, `StationSummary`.
- `seed.ts`: 20 đơn chờ đóng, 12 SKU, 8 phiên đã đóng, 3 đính chính, 2 trạm, 3 nhân viên.
- `store.ts`: `sealSession`, `overrideSku`, `logCorrection`, `nextOrder`, `reset`,
  localStorage.
- `data.ts`: chọn mock/api; API gọi `/api/v1/inventory/ops/pack-log` và
  `/api/v1/wms/packing-sessions`. Đăng nhập giữ email `pack@smartlogi.vn`.

### B2. `/pack` — trạm đóng gói

- Bố cục 2 cột: camera/AI bên trái, thông tin đơn + quét bên phải.
- Giữ TensorFlow + MobileNet. Bọc toàn bộ trong try/catch:
  - Nếu model không tải được (mạng chặn, WebGL/WASM lỗi), chuyển sang "chế độ quét mã"
    và hiển thị lý do rõ ràng, không treo spinner vô hạn.
  - Không chặn thao tác đóng kiện khi AI lỗi.
- Quy trình: chọn đơn kế tiếp → camera dự đoán SKU → so khớp `expectedSku` → nhân viên
  xác nhận hoặc quét laser (Web Serial) → đóng kiện.
- Kết quả: MATCH cho đóng; MISMATCH chặn và yêu cầu đính chính; OVERRIDE cho phép nhưng
  ghi log lý do.
- Cân nặng: nếu có cân điện tử, hiển thị; nếu không, nhập tay.
- Sau khi đóng: hiện mã kiện, đơn kế tiếp, cập nhật metric ca (đã đóng, mismatch, đính
  chính, thời gian/kiện).
- Không dùng `alert`; lỗi hiển thị trong panel.

### B3. `/pack/logs`

- Bảng phiên: mã, đơn, trạm, nhân viên, SKU dự kiến/quét, khớp, độ tin cậy, cân, hộp,
  trạng thái, giờ.
- Bộ lọc trạm/kết quả/trạng thái; tìm mã đơn.
- Mở phiên xem chi tiết đính chính (nếu có).
- Metric: tỷ lệ khớp, số đính chính, thời gian trung bình/kiện.

### B4. `/login` — trang đăng nhập (gốc, đã có)

- Stay là `app/login/page.tsx` (route `/login`, không phải `/pack/login`).
- `components/AuthGate.tsx` (dùng bởi `components/AppShell.tsx`) đã chặn các route chưa
  token; `/login`, `/forgot-password`, `/reset-password` là công cộng. Giữ nguyên.
- Mock login: `useAuth().login(token, user)` + `setToken` từ `src/lib/auth`, không gọi
  `api`; email `pack@smartlogi.vn`, mật khẩu bất kỳ, role `WAREHOUSE_STAFF`.
- Header (Topbar, pack station) giữ nguyên, chỉ đổi lại cho không icon; không avatar
  tròn, hiện tên trạm và ca.

## Ràng buộc chung

- Không thêm dependency. `@tensorflow/*` đã có trong pack station.
- Không chạy build/install; kiểm tra tĩnh import, kiểu, props.
- Không sửa `packages/map-components`, `ui-kit`, `ui-components`.
- Không để secret/webhook thật trong seed.
- Không import `@/lib/data` từ tenant portal — cả hai portal giữ lớp mock độc lập.

## Nghiệm thu

- Customer: đăng nhập mock → tạo đơn → thấy trong danh sách → tra cứu công khai đúng
  timeline; thanh toán hoá đơn đổi trạng thái; tạo RMA thành công; landing `/` phải
  truy cập được mà không login.
- Pack: AI lỗi vẫn đóng kiện bằng quét tay; mismatch bị chặn; log ghi đính chính.
- Không page nào gọi mạng ở chế độ mock.
- Không còn `alert`, `console.log`, `TODO`; bảng đủ 4 trạng thái.

## Báo cáo

Theo mẫu trong `docs/agent-prompts/README.md`. Ghi rõ:
- route mới cần thêm Sidebar/menu liên kết.
- hàm `@/lib/data` (của mock riêng bạn tạo) nào gặp hạn chế giao diện.
- cách xử lý model TensorFlow khi không tải được.
