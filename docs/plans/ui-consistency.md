# UI Consistency — Fonts, Tokens & Shared Shell

> Trạng thái: **Phase 2.5 hoàn tất** (shell + dashboard 4 portal, Pack Station 2 trang)
> Ngày: 2026-10-20
> Phạm vi: Admin, Tenant, Customer, Pack Station
> Roadmap tổng: `docs/plans/roadmap-5-phases.md`
> Design plan: `docs/plans/design-refresh-no-icons.md`

---

## 1. Nguyên tắc hiện tại

Bốn portal dùng chung một ngôn ngữ thị giác **"Operational editorial / Bàn giao ca"**:

- Giấy ấm, chữ rõ, hairline, bảng dày, một accent sage.
- Nav text-first, không icon trang trí; trạng thái là chấm + text.
- Không card KPI, không shadow lớn, không pill CTA, không bento/hero.
- Cormorant chỉ cho page title/wordmark; số liệu dùng Plus Jakarta tabular.
- "Mềm mại" đến từ màu, chữ, radius 6–8, line-height và grain — không phải
  macro-whitespace.

---

## 2. Nguồn token duy nhất

```
packages/ui-tokens/
├── tailwind-preset.cjs     # màu, font, shadow dùng chung
├── fonts.css               # @font-face canonical (self-hosted)
└── fonts/*.woff2           # latin / latin-ext / vietnamese
```

Mỗi portal dùng preset:

```ts
const uiPreset = require('../../../packages/ui-tokens/tailwind-preset.cjs');

const config: Config = {
  presets: [uiPreset],
  content: ['./src/**/*.{ts,tsx}', '../../../packages/ui-kit/**/*.{ts,tsx}'],
};
```

### 2.1 Token màu chuẩn

| Token | Giá trị | Dùng cho |
|---|---|---|
| `canvas` / `background` | `#F6F3EE` | nền toàn trang |
| `surface` | `#FBF9F5` | vùng nội dung, input |
| `surface-alt` | `#EFEAE2` | hover row, toolbar |
| `line` / `border` | `#DED7CB` | hairline 1px |
| `line-strong` | `#C9C0B2` | divider tiêu đề, empty note |
| `ink` | `#20241F` | chữ chính |
| `ink-soft` | `#6A6E64` | chữ phụ |
| `ink-faint` | `#62665C` | metadata; đạt AA trên canvas |
| `accent` / `primary` | `#2F4A3C` | CTA, active, link |
| `accent-hover` / `primary-hover` | `#263D31` | hover CTA |
| `accent-soft` | `#E4EAE4` | active nav |
| `success` | `#3F6B4F` | trạng thái tốt |
| `warning` | `#8A5D28` | cần chú ý |
| `danger` | `#A3483F` | lỗi, trễ |
| `info` | `#4C6570` | thông tin |

`white` override về `#FBF9F5`, `black` về `#20241F` để page cũ không còn nền trắng
lạnh. Các họ `slate/gray/zinc/neutral/stone` map về cùng một ramp trung tính.
Alias camelCase (`text-inkSoft`, `bg-surfaceMuted`...) được giữ để 154 class cũ
không vỡ; code mới dùng kebab-case.

### 2.2 Typography

| Vai trò | Font | Ghi chú |
|---|---|---|
| Page title / wordmark | Cormorant Garamond 600 | `h1`, `.font-editorial`; 40–46px |
| Section title | Plus Jakarta Sans 600 | `h2–h6`, `.font-section`; 15–20px |
| Body / UI | Plus Jakarta Sans 400 | 12–14px, line-height 1.5–1.6 |
| Table label | Plus Jakarta Sans 600 | 10–11px uppercase, tracking 0.14em |
| KPI number | Plus Jakarta Sans 600 | 26–30px, `tabular-nums` |
| Mã đơn / SKU | Mono hệ thống | 11–12px |

Font self-host trong `public/fonts/` của từng portal, đủ subset `latin`,
`latin-ext`, `vietnamese`.

---

## 3. Shared shell

```
packages/ui-kit/
├── AppShell.tsx        # sidebar + topbar + content well, skip link
├── Sidebar.tsx         # nav text-only, active rule, mobile drawer
├── Topbar.tsx          # title/search, user text, logout; 52px
├── shell-context.tsx   # state mobile drawer
└── editorial.tsx       # page header, metric band, section, status, empty
```

### 3.1 Spec

| Thành phần | Giá trị |
|---|---|
| Sidebar desktop | 208px (`lg:w-52`), offset `lg:pl-52` |
| Sidebar mobile | drawer 288px, đóng/mở bằng text "Menu"/"×" |
| Topbar | 52px, sticky, border-bottom |
| Content | `lg:px-6 lg:py-5`; mobile `px-4` |
| Nav item | 36px, text 13px, active = vạch trái 2px + `accent-soft` |
| Section gap | 24px (`space-y-5/6`) |
| Table row | 42px |
| Input/button | 36–48px tùy form; radius 6–8 |

- Sidebar chỉ text; section label 10px uppercase `ink-faint`; không icon, không collapse desktop.
- Mobile drawer khi đóng có `invisible` để link không còn focusable/đọc bởi AT;
  desktop luôn `lg:visible`.
- Topbar không chuông icon; "Thông báo" là text link. Search 360px, xuống hàng
  riêng dưới topbar trên mobile; không render trùng.
- Content mặc định full width, không `max-w-7xl mx-auto`; page tự đặt `max-w`
  nếu cần (Pack dùng `max-w-[1040px]`, Admin `1180px`).

### 3.2 Primitive editorial

```tsx
import {
  EditorialPageHeader,
  MetricBand,
  EditorialSection,
  StatusLabel,
  EmptyNote,
} from '../../../../packages/ui-kit/editorial';
```

- `EditorialPageHeader`: eyebrow + Cormorant title + description + meta/actions.
- `MetricBand`: 2 cột mobile / 4 cột desktop, hairline dọc, không card.
- `EditorialSection`: title + hairline + optional action; children là bảng/list.
- `StatusLabel`: chấm 6px + text; tone `neutral/success/warning/danger/info`.
- `EmptyNote`: 1 dòng giải thích, vạch trái; không illustration.

---

## 4. Trạng thái migrate

| Portal | Shell | Dashboard | Trang khác |
|---|---|---|---|
| Admin | ✅ text-only | ✅ "Operations overview" | Token/shell; nội dung orders/shipments/... còn legacy |
| Tenant | ✅ text-only | ✅ "Bàn giao ca" | Token/shell; orders/inventory/... còn legacy |
| Customer | ✅ text-only | ✅ "Delivery desk" | Token/shell; orders/invoices/... còn legacy |
| Pack | ✅ text-only | ✅ `/pack`, `/pack/logs` | — |

### 4.1 Đã bỏ khỏi dashboard/Pack

- `StatCard` icon + trend giả; thay bằng `MetricBand` lấy API thật.
- Mock shipments/random progress; thay bằng dữ liệu API hoặc empty/error.
- Chart cobalt/teal; thay bằng sage `#2F4A3C`, line `#DED7CB`, tick `#62665C`.
- Card trắng `rounded-xl shadow-card`; thay section + hairline.
- Icon `⚠`, `✓`, nav icon, KPI icon; thay text + status dot.

### 4.2 Trang còn legacy

Các trang sau mới nhận token/shell, chưa migrate nội dung:
`admin/orders`, `admin/shipments`, `admin/tenants`, `admin/billing`,
`admin/audit-logs`, `admin/ai-models`, `tenant/orders`, `tenant/inventory`,
`tenant/warehouses`, `tenant/logistics/dispatch`, `tenant/wms`,
`tenant/finance/cod`, `tenant/settings`, `customer/orders`, `customer/inventory`,
`customer/webhooks`, `customer/invoices`, `customer/returns`.

---

## 5. Đồng bộ font

```bash
# 1. Cập nhật packages/ui-tokens/fonts.css + fonts/*.woff2
# 2. Copy sang cả 4 portal (idempotent):
node scripts/sync-ui-fonts.mjs
# 3. Rebuild portal
docker compose build tenant-portal customer-portal pack-station-web admin-portal
docker compose up -d --no-deps tenant-portal customer-portal pack-station-web admin-portal
```

`NEXT_PUBLIC_*` chỉ inline lúc build; phải truyền qua Docker build args. SSR dùng
`API_INTERNAL_URL=http://api-gateway:3000/api/v1`.

Dockerfile portal dùng `pnpm install --no-frozen-lockfile --filter <portal>...`
để chỉ cài dependency của portal, tránh kéo `bcrypt` từ backend.

---

## 6. Verify Phase 2.5

```
tsc --noEmit: tenant / customer / admin / pack → pass
Playwright route scan: admin 7/7, tenant 9/9, customer 6/6, pack 2/2
  → 24/24 route OK, 0 failing
axe-core (wcag2a + wcag2aa): 4/4 trang đại diện → 0 violation
GET /api/v1/inventory/summary (tenant token) → 200
  500 SKUs, 23 out-of-stock, 1.500 inventory records, 5 warehouses
Mobile 390×844: tenant/customer/pack/admin không scroll ngang toàn trang;
  chỉ bảng scroll; drawer mở/đóng đúng; search không lặp
```

Screenshot đã review: `tenant-dashboard-v4.png`, `customer-dashboard-v3.png`,
`admin-final-v6.png`, `admin-mobile-v5.png`, `pack-v5.png`, `pack-logs-v5.png`,
`pack-mobile-v5.png`, `tenant-mobile-menu.png`.

Backend `inventory-service` còn 2 lỗi `tsc` sẵn có do `wms-engine` không resolve
trong typecheck cục bộ; image build và endpoint chạy bình thường.

---

## 7. Còn lại / known gaps

- Migrate nội dung các trang danh sách còn lại sang section + bảng editorial.
- Dark mode chưa làm.
- AI worker `/api/v1/ai/v1/*` trả 502 vì Cloudflare Worker không nằm trong
  docker-compose; Admin hiển thị "Unavailable" thay vì mock.
- Google OAuth cần Google Console: Authorized JavaScript origins
  `http://localhost:4001–4004`; thêm Gmail vào Test users hoặc Publish app.
- Chưa commit/push; working tree còn nhiều thay đổi.
