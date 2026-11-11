# Design refresh — bỏ icon, dày hơn, mềm hơn

> Trạng thái: **Phase 2.5 đã triển khai** — shell 4 portal, dashboard 4 portal, Pack Station 2 trang; các trang danh sách còn lại mới nhận token, chưa migrate nội dung
> Ngày: 2026-10-20
> Phạm vi: Admin, Tenant, Customer, Pack Station
> Liên quan: `docs/plans/ui-consistency.md`, `docs/plans/roadmap-5-phases.md`

---

## 1. Vì sao phải đổi

Sau Phase 2, 4 portal đã đồng bộ font/token/shell nhưng vẫn mang đúng "mùi"
template SaaS:

- Sidebar 256px với icon trong ô vuông bo góc, active state là pill xanh.
- Topbar 64px, search trong pill, chuông thông báo, avatar tròn, nút Logout
  viền + icon.
- Dashboard mở đầu bằng 3–4 KPI card trắng, mỗi card có icon trong ô bo góc,
  shadow nhẹ, padding 24px.
- Nội dung thường bị **double padding**: `AppShell` đã có `px-8 py-8`, page lại
  thêm `p-8 max-w-7xl mx-auto`.
- Rất nhiều khoảng trống dọc: card cao 128px cho một con số, section cách nhau
  32–40px, bảng bắt đầu sau 250–350px.
- Màu primary cobalt `#2563eb` + nền trắng + shadow card là bộ ba rất phổ biến
  của dashboard SaaS 2020–2024.
- Icon được dùng cho cả những thứ không cần icon (KPI, heading, nav), làm mắt
  phải xử lý nhiều hình khối hơn lượng thông tin thực.

Mục tiêu không phải "làm đẹp hơn template", mà là **đổi ngôn ngữ thị giác**:
gần với bảng điều vận / sổ giao ca / bản kê vận đơn hơn là một landing page SaaS.

---

## 2. Cơ sở nghiên cứu

### 2.1 Skill stack đã nạp

Đã nạp 6 skill và **chọn lọc theo bài toán dashboard vận hành**, không áp dụng
nguyên xi vì phần lớn skill thiết kế tối ưu cho landing page / portfolio:

| Skill | Lấy gì | Không lấy gì |
|---|---|---|
| `redesign-existing-projects` | Quy trình scan → diagnose → fix; ưu tiên font, palette, spacing, states; giữ nguyên stack | Hero, ảnh nền, parallax, kỹ thuật landing page |
| `minimalist-ui` | Warm monochrome, typographic contrast, flat, hairline, không gradient/shadow | Macro-whitespace, bento grid, ảnh nền, pill CTA |
| `design-taste-frontend` | Design read, 3 dials, một accent, full states, contrast, anti-slop | Toàn bộ playbook landing (skill tự ghi không dành cho dashboard); hero/bento; serif mặc định; ảnh bắt buộc |
| `frontend-ui-engineering` | Semantic HTML, a11y, responsive 320–1440, skeleton/empty/error, composition | Không có |
| `high-end-visual-design` | Grain 2–3%, micro-interaction, tỉ lệ typography | Double-bezel, pill CTA, `py-24`, scroll reveal 800ms, glass |
| `industrial-brutalist-ui` | Swiss grid, hairline, mật độ, số tabular | 0 radius, hazard red, CRT/scanline, all-caps terminal |

**Design read:** dashboard vận hành B2B cho dispatcher / kho / CSKH, ngôn ngữ
"warm editorial-utilitarian", đi theo token riêng (paper + ink + sage), nav
text-first, bảng dày, không icon trang trí.

**Dials:** `DESIGN_VARIANCE 3` (ổn định, dễ scan), `MOTION_INTENSITY 2`
(chỉ feedback 120–160ms), `VISUAL_DENSITY 8` (cockpit, bảng và hairline).

Lý do không dùng nguyên `minimalist-ui` / `high-end-visual-design`: hai skill này
tối ưu cho landing/portfolio, yêu cầu macro-whitespace, bento, ảnh nền, scroll
reveal — ngược yêu cầu "giảm khoảng trống, không template SaaS". Chỉ lấy phần
typography, palette, chất liệu và kỷ luật component.

### 2.2 Nguyên lý nền

1. **Data-ink ratio (Tufte)** — mỗi pixel không mang dữ liệu phải biện minh.
   Icon trang trí, shadow, gradient, card lồng card là "chartjunk".
2. **Swiss / International Typographic Style** — hierarchy bằng cỡ chữ, weight,
   khoảng cách và đường kẻ mảnh; không cần khối màu để phân nhóm.
3. **Density có kiểm soát (IBM Carbon, GOV.UK)** — bảng 40–44px/row, label 11px,
   input/button 36px, spacing 4px base; dày nhưng vẫn thở bằng line-height.
4. **Exception-first operations** — người vận hành cần thấy việc bất thường
   (trễ, thiếu tồn, chưa gán) trước, không phải KPI tổng quan đẹp.
5. **Softness bằng vật liệu, không bằng blur** — giấy ấm, viền thấp tương phản,
   accent sage trầm, bo góc nhỏ; không glassmorphism, không glow.

Tham chiếu tinh thần: annual report / manifest giấy + bảng điều khiển sân bay,
không phải dashboard marketing.

---

## 3. Định hướng: "Operational editorial"

Tên nội bộ: **Bàn giao ca** (shift handover).

Một câu mô tả:

> Trang trông như một bản báo cáo vận hành được in trên giấy ấm: chữ rõ, bảng
> dày, đường kẻ mảnh, màu chỉ dùng để đánh dấu trạng thái.

### 3.1 Giữ lại

- Cormorant Garamond cho **page title và wordmark** — đã có bản sắc; không dùng
  cho số liệu/KPI.
- Plus Jakarta Sans cho body/UI/số liệu — dễ đọc tiếng Việt, có tabular figures.
- Cấu trúc sidebar + topbar + content well — người dùng đã quen.
- Token semantic (`success/warning/danger`) — đổi giá trị, không đổi tên.
- Khả năng truy cập: focus ring, keyboard, contrast.

### 3.2 Bỏ

- Icon trong sidebar, KPI card, page header, section heading, button.
- Ô vuông bo góc chứa icon (`h-8 w-8 rounded-lg bg-...`).
- Pill active state cho nav; thay bằng text + vạch trái 2px.
- Card trắng nổi có shadow cho mọi khối; thay bằng section + hairline.
- Badge pill cho trạng thái; thay bằng chấm 6px + text.
- Collapse sidebar trên desktop (vì không còn icon để hiển thị ở rail 80px).
- Gradient, glow, glass, shadow lớn, bo góc >12px cho khối lớn.
- `max-w-7xl mx-auto` lồng trong content well; `p-8` lặp với shell.
- Bento grid, double-bezel, ảnh nền/ambient gradient, scroll reveal, pill CTA.
- Macro-whitespace kiểu landing (`py-24`, `py-32`) — dashboard vận hành cần
  `VISUAL_DENSITY 8`, không phải art gallery.

### 3.3 Icon policy

| Được giữ | Lý do |
|---|---|
| `×` đóng drawer/modal | chức năng, không thay bằng text được |
| `‹ ›` chevron cho pagination/collapse mobile | điều hướng |
| `⌕` search (16px) | tín hiệu nhận biết ô tìm kiếm |
| `↗` external link | ngữ nghĩa |
| Drag handle | thao tác kéo |

| Bỏ | Thay bằng |
|---|---|
| Icon nav | text label + section label |
| Icon KPI | label + số + delta |
| Icon button | text verb ("Tạo đơn", "Xuất CSV") |
| Icon trạng thái | chấm màu + text |
| Icon trong heading | không cần |
| Avatar icon | initials text (giữ) |

Quy tắc: nếu bỏ icon mà vẫn hiểu được, bỏ. Nếu bỏ icon làm mất nghĩa, giữ ở
16px, không đặt trong ô nền.

### 3.4 Công thức kết hợp yêu cầu gốc

| Yêu cầu gốc | Cách đạt | Không làm |
|---|---|---|
| Bỏ icon | Nav text-first, stat line, button text | Icon-only, ô icon bo góc, icon trang trí |
| Giảm khoảng trống | Density 8: content 24px, row 42px, section 24px, table-first | Macro-whitespace `py-24`, card cao 128px cho một con số |
| Mềm mại | Giấy ấm, sage trầm, hairline, radius 6–8, line-height 1.55, grain 2% | Glass, shadow lớn, pill, gradient |
| Không template SaaS | Section + bảng + đường kẻ, KPI dạng stat line | Card grid, bento, hero, icon tile, double-bezel |

**Một câu:** *Swiss grid + giấy ấm + chữ dẫn dắt + bảng dày + một accent sage.*

Điểm dễ hiểu sai: **mềm mại không đồng nghĩa với nhiều khoảng trắng**. Trong
dashboard vận hành, mềm đến từ màu, chữ, đường kẻ và nhịp dòng; còn khoảng trống
phải giảm để thấy nhiều dữ liệu hơn.

---

## 4. Token mới

### 4.1 Màu — phương án A (khuyến nghị): giấy ấm + sage

| Token | Giá trị | Dùng cho |
|---|---|---|
| `canvas` | `#F6F3EE` | nền toàn trang |
| `surface` | `#FBF9F5` | vùng nội dung chính |
| `surface-alt` | `#EFEAE2` | hover row, input, toolbar |
| `line` | `#DED7CB` | hairline 1px |
| `line-strong` | `#C9C0B2` | divider tiêu đề bảng |
| `ink` | `#20241F` | chữ chính |
| `ink-soft` | `#6A6E64` | chữ phụ |
| `ink-faint` | `#62665C` | metadata; đã tối hơn phương án ban đầu để đạt AA trên `canvas` |
| `accent` | `#2F4A3C` | CTA, active, link |
| `accent-hover` | `#263D31` | hover CTA |
| `accent-soft` | `#E4EAE4` | active nav background |
| `success` | `#3F6B4F` | trạng thái tốt |
| `warning` | `#8A5D28` | trạng thái cần chú ý; đã tối để đạt AA |
| `danger` | `#A3483F` | lỗi, trễ |
| `info` | `#4C6570` | thông tin |

**Chỉ một accent** là sage. Các màu `success/warning/danger/info` chỉ dùng cho
trạng thái, không dùng làm CTA, heading hay nền trang trí. Không dùng clay/brass
làm accent thứ hai — đó là palette "premium consumer" rất dễ thành template.

Phương án B (nếu muốn lạnh/industrial hơn): `canvas #F4F5F3`, `ink #1B211E`,
`accent #34473F`, `line #D7DBD4`. Không dùng cobalt.

### 4.2 Typography

| Vai trò | Font | Size / line-height | Ghi chú |
|---|---|---|---|
| Page title | Cormorant 600 | 40–46 / 0.95 | chỉ 1 lần mỗi trang |
| Section title | Plus Jakarta 600 | 13 / 1.3 | sentence case |
| Body | Plus Jakarta 400 | 14 / 1.55 | mặc định |
| Body nhỏ | Plus Jakarta 400 | 13 / 1.5 | metadata |
| Label bảng | Plus Jakarta 600 | 11 / 1.2, tracking 0.06em | uppercase |
| KPI number | Plus Jakarta 600 | 28 / 1 | `font-variant-numeric: tabular-nums` |
| Code / tracking | Mono hệ thống | 12 / 1.4 | chỉ mã đơn, SKU |

Cormorant chỉ dùng cho page title/wordmark. Số liệu dùng sans tabular để không
gây cảm giác "menu nhà hàng" và để các cột số thẳng hàng. Bỏ thói quen uppercase
+ tracking rộng cho mọi label; chỉ dùng cho table header và nav section.

### 4.3 Spacing / shape

| Token | Giá trị |
|---|---|
| Base | 4px |
| Page padding desktop | 24px (`px-6 py-5`) |
| Page padding mobile | 16px |
| Section gap | 24px |
| Block gap | 16px |
| Table row | 42px (compact 36px) |
| Input / button height | 36px |
| Nav item | 36px |
| Topbar | 52px |
| Sidebar | 208px (không collapse desktop) |
| Radius | 6px input/button, 8px section, 10px modal |
| Shadow | chỉ modal/dropdown: `0 8px 24px rgb(32 36 31 / .08)` |
| Grain | optional, fixed overlay 2–3%, `pointer-events-none`; không đặt trên scrolling container |

Không dùng grain nếu làm giảm độ rõ của chữ hoặc tăng CPU trên mobile. Đây là
chi tiết tạo chất liệu giấy, không phải hiệu ứng bắt buộc.

---

## 5. Layout

### 5.1 Shell

```
┌──────────────┬──────────────────────────────────────────────┐
│ SmartLogi    │  Tổng quan / 20.10.2026      Tìm kiếm  User  │ 52px
│              ├──────────────────────────────────────────────┤
│ VẬN HÀNH     │  Bàn giao ca                 20.10 · 08:00   │
│ Tổng quan    │  Hệ thống ổn định. 3 việc cần xử lý.         │
│ Đơn hàng     │                                              │
│ Tồn kho      │  ĐƠN HÀNG MỚI        ĐANG GIAO       TRỄ     │  stat line
│ Kho          │  128                 42              3       │
│ Vận chuyển   │  ─────────────────────────────────────────   │
│ WMS          │  Cần xử lý                    Hoạt động      │
│              │  ┌───────────────────────┐  ┌─────────────┐  │
│ PHÂN TÍCH    │  │ bảng exception 42px   │  │ text list   │  │
│ AI Insights  │  │                       │  │             │  │
│ Tài chính    │  └───────────────────────┘  └─────────────┘  │
│ Cài đặt      │                                              │
│              │  VẬN ĐƠN HÔM NAY                             │
│              │  bảng full-width 42px/row                    │
└──────────────┴──────────────────────────────────────────────┘
```

- Sidebar: chỉ text, section label 10px uppercase, item 13px; active = chữ
  `ink` + vạch trái 2px `accent` + nền `accent-soft` rất nhẹ.
- Bỏ nút collapse desktop; mobile dùng drawer text-only, đóng bằng `×`.
- Topbar: không chuông icon; "Thông báo · 2" là text link. User là tên + role,
  không avatar tròn nếu không cần.
- Content không căn giữa bằng `max-w-7xl`; dùng full width tới 1440px, prose
  block max 720px.

### 5.2 Density targets

Ở 1440×900:

- Dashboard: 4 stat line + ít nhất 8 dòng bảng hiển thị không scroll.
- Orders: 14–16 dòng bảng.
- Customer dashboard: 12 dòng shipment ledger.
- Pack: input + 10 recent scans không cần scroll.

Nếu chưa đạt, giảm page padding trước, rồi giảm row height, rồi giảm font
metadata — không giảm contrast.

---

## 6. Components

### 6.1 Stat line (thay KPI card)

```
ĐƠN HÀNG MỚI        ĐANG GIAO          TRỄ
128                 42                 3
+12 hôm nay         —                  cần xử lý
```

- 4 cột, ngăn bằng hairline dọc.
- Không nền, không shadow, không icon.
- Số dùng Plus Jakarta 600 28px, tabular; Cormorant chỉ ở page title.
- Delta là text 12px, không badge.

### 6.2 Section

```
VẬN ĐƠN HÔM NAY                              42 đơn
────────────────────────────────────────────────────
```

- `border-t border-line-strong`, title 13px, meta bên phải 12px.
- Không card, không radius cho section full-width.

### 6.3 Table

- Header 11px uppercase, `ink-soft`, nền `surface-alt` hoặc trong suốt.
- Row 42px, divider 1px `line`, hover `surface-alt`.
- Số căn phải, `tabular-nums`.
- Status: chấm 6px + text 12px; không pill.
- Empty state: 1 dòng text + hành động text, không illustration.

### 6.4 Button

| Loại | Style |
|---|---|
| Primary | nền `accent`, chữ `#FBF9F5`, 36px, radius 6, không icon |
| Secondary | viền `line-strong`, nền trong suốt, chữ `ink` |
| Ghost | không viền, chữ `accent`, underline khi hover |
| Destructive | chữ `danger`, viền `danger/40` |

Label là động từ + đối tượng: "Tạo đơn", "Xuất CSV", "Duyệt COD". Không viết
"Submit", không icon-only.

### 6.5 Form

- Label 12px `ink-soft`, phía trên, margin 6px.
- Input 36px, nền `surface`, viền `line`, radius 6.
- Focus: viền `accent`, ring 2px `accent/20`.
- Error: text `danger` 12px dưới input; không đổi nền đỏ.

### 6.6 Nav

- Item 36px, padding 8px 10px, radius 6.
- Active: nền `accent-soft`, vạch trái 2px, chữ `ink`.
- Section label: 10px uppercase, `ink-faint`, margin-top 20px.
- Không icon, không badge trừ số đếm text nhỏ bên phải.

### 6.7 Status

| Trạng thái | Dot | Text |
|---|---|---|
| Thành công | `success` | "Đã giao" |
| Đang chạy | `info` | "Đang giao" |
| Cần chú ý | `warning` | "Chờ xử lý" |
| Lỗi/trễ | `danger` | "Trễ 2h" |
| Trung tính | `ink-faint` | "Nháp" |

Không dùng màu làm tín hiệu duy nhất; luôn có text.

### 6.8 States

- **Loading:** skeleton đúng shape của bảng/stat line, không spinner tròn.
- **Empty:** 1 dòng giải thích + 1 text action; không illustration lớn.
- **Error:** banner inline trên section, có nút "Thử lại"; không `window.alert`.
- **Disabled:** giảm opacity + `cursor: not-allowed`, vẫn đọc được label.
- **Focus:** ring 2px `accent`, offset 2px, không bỏ outline.

---

## 7. Page recipes

### 7.1 Admin dashboard — "Platform brief"

- Header: "Tổng quan nền tảng" + ngày + 1 câu trạng thái.
- Stat line: MRR, tenant active, user, system health (text).
- Section "Cần chú ý": tenant pending, tenant sắp hết hạn, lỗi thanh toán.
- Section "Vận đơn hôm nay": bảng shipment 8–10 dòng.
- Section "Hoạt động gần đây": text list 5 dòng, không card.
- Biểu đồ MRR: 1 chart full-width, không card, gridline ngang mảnh.

### 7.2 Tenant dashboard — "Bàn giao ca"

- Header: "Ca làm việc · 08:00–16:00" + trạng thái.
- Stat line: đơn mới, đang giao, trễ, tồn thấp.
- "Việc cần xử lý": bảng exception (đơn chưa gán, tồn thấp, COD chờ duyệt).
- "Hoạt động gần đây": text list.
- Bỏ "Organization Overview" card; thông tin kho/xe đưa vào stat line hoặc
  section "Nguồn lực".

### 7.3 Orders

- Filter bar 1 dòng: search, status text tabs, date range, "Xuất CSV".
- Bảng full-width, cột: mã, người nhận, trạng thái, COD, ngày tạo.
- Row click mở detail; không icon mắt/bút.
- Bulk action hiện khi chọn: "Gán chuyến", "In phiếu", "Huỷ".

### 7.4 Inventory

- Bảng: SKU, tên, kho, on-hand, allocated, available, trạng thái.
- Low stock: text `warning` + dot, không badge.
- Filter theo kho dạng text tabs, không select pill.

### 7.5 Finance / COD

- Ledger table, số tiền VND căn phải, tabular.
- Cột: tài xế, COD, phí, thực nộp, trạng thái, hành động text "Duyệt".
- Không card bao ngoài; section + table.

### 7.6 Customer portal

- Header: "Xin chào, {tên}" + "6 đơn đang giao".
- Stat line 3 cột: tổng đơn, đã giao, tỷ lệ hoàn.
- "Vận đơn gần đây": bảng 12 dòng.
- Invoices: bảng, số tiền VND, nút "Thanh toán" text.
- Bỏ KPI card lớn và khoảng trống dưới.

### 7.7 Pack Station

- Layout 2 cột: trái input scan + kết quả; phải "Quét gần đây" + hướng dẫn.
- Input cao 44px, font 18px, autofocus.
- Kết quả: dòng text + dot, không card lớn.
- Không chiếm giữa màn hình bằng một khối trống.

---

## 8. Responsive

| Breakpoint | Thay đổi |
|---|---|
| ≥1280 | sidebar 208, content 24px, bảng full |
| 1024–1279 | sidebar 208, content 20px, stat 4 cột |
| 768–1023 | sidebar drawer text, content 20px, stat 2×2 |
| <768 | topbar 52, content 16px, stat 2×2, bảng scroll ngang |
| <480 | page title 28, button full-width khi là primary action |

- Bảng: `overflow-x-auto`, sticky cột đầu nếu >6 cột.
- Không icon-only ở mobile; nút text đủ 40px touch target.
- Test 320×568, 390×844, 768×1024, 1024×768, 1440×900.

---

## 9. Accessibility

- Body text contrast ≥ 4.5:1; large text ≥ 3:1.
- Focus ring 2px `accent`, offset 2px, không `outline: none` không thay thế.
- Status không chỉ dựa vào màu.
- Table có `<th scope="col">`, caption hoặc heading liên kết.
- Giữ `prefers-reduced-motion`; transition 120–160ms, không bounce.
- Form label gắn `htmlFor`; error có `aria-describedby`.
- Skip link "Bỏ qua điều hướng" ở đầu trang.
- Loading có `aria-busy`; toast/alert dùng `aria-live="polite"`.
- Chạy axe-core trên 4 trang đại diện trước khi sign-off.

---

## 10. Migration plan

### Bước 0 — Audit (0.5 ngày)

- `rg` đếm icon trong nav/KPI/header/button.
- `rg "p-8|px-8 py-8|max-w-7xl mx-auto|space-y-8|mb-10"` trong `src/app`.
- Chụp screenshot baseline 4 portal × 3 breakpoint.
- Lập bảng page → mức độ dày hiện tại → mục tiêu.

### Bước 1 — Token + typography (0.5–1 ngày)

- Thêm token mới vào `packages/ui-tokens/tailwind-preset.cjs`
  (`canvas`, `line`, `accent`, `ink-faint`).
- Giữ alias cũ để page cũ không vỡ.
- Đổi `font-variant-numeric: tabular-nums` cho số.
- Chưa đổi layout; chỉ màu/chữ.

### Bước 2 — Shell (1 ngày)

- `Sidebar`: bỏ icon, bỏ collapse desktop, item 36px, active vạch trái.
- `Topbar`: 52px, bỏ chuông icon, user text, search 36px.
- `AppShell`: padding 24/20/16, bỏ `max-w-7xl` mặc định (mặc định `full`).
- Mobile drawer text-only.

### Bước 3 — Primitives (1–2 ngày)

- `StatLine`, `Section`, `Table`, `StatusDot`, `Button`, `Input`, `Tabs`.
- Xoá `Card` khỏi dashboard; giữ `Card` cho form/modal.
- Storybook hoặc trang demo `/design` để review nhanh.

### Bước 4 — Page migration (3–5 ngày)

Thứ tự ưu tiên:

1. Tenant dashboard + orders + inventory (đại diện 3 pattern).
2. Admin dashboard + shipments + audit logs.
3. Customer dashboard + orders + invoices.
4. Pack Station.
5. Các trang còn lại.

Mỗi page: bỏ `p-8`/`max-w`, thay card → section, bỏ icon, dùng `StatLine`/table.

### Bước 5 — Responsive + dark (1–2 ngày)

- 3 breakpoint, bảng scroll, drawer.
- Dark mode: nếu làm, dùng "ink paper" (`#1B1F1C` canvas, `#222822` surface,
  `#E7E3D8` ink); không invert đơn giản.
- Có thể defer dark mode sau khi chốt light.

### Bước 6 — Verify + sign-off (1 ngày)

- Playwright 24 route, 0 error.
- Screenshot 3 breakpoint, so baseline.
- Contrast check.
- User review 1 page đại diện trước khi rollout toàn bộ.

Tổng: **7–11 ngày** cho 1 người, chưa tính dark mode.

---

## 11. Acceptance criteria

- [x] 0 icon trong sidebar, topbar, KPI band, page header và button ở shell + 4 dashboard + Pack Station.
- [x] 0 `p-8` / `max-w-7xl mx-auto` lồng trong content well ở các page đã migrate.
- [x] 0 card shadow ngoài modal/dropdown ở các page đã migrate.
- [ ] 1440×900: dashboard thấy ≥8 dòng bảng; orders ≥14 dòng (các trang orders chưa migrate).
- [x] 390×844: không scroll ngang toàn trang; chỉ bảng scroll.
- [x] Contrast AA; focus ring rõ; status có text (axe-core 0 violation trên 4 trang đại diện).
- [x] 24 route Playwright pass; screenshot desktop + mobile đã review.
- [ ] User sign-off trên toàn bộ 4 dashboard sau đợt rollout này.

---

## 12. Rủi ro & cách giảm

| Rủi ro | Giảm |
|---|---|
| Bỏ icon làm khó scan | Dùng section label + hierarchy + row hover; test với user |
| Dày quá gây mệt | Tăng line-height, giảm số cột, chỉ giữ exception-first |
| Palette ấm bị cho là "không công nghiệp" | Dùng sage trầm + hairline chính xác; tránh beige quá vàng |
| Rollout lớn, dễ vỡ page | Làm tenant trước, giữ alias token, verify từng page |
| Dark mode phức tạp | Defer; thiết kế riêng sau khi chốt light |
| Mất bản sắc Cormorant | Chỉ dùng cho title/wordmark, không dùng cho body/số liệu |

---

## 13. Quyết định đã chốt

1. **Palette**: phương án A — giấy ấm `#F6F3EE` + sage `#2F4A3C`.
2. **Logo**: chỉ wordmark "SmartLogi" + tagline text; bỏ ô "SL".
3. **Mật độ mặc định**: row 42px, content padding 24px, section gap 24px.
4. **Ngôn ngữ**: Tenant/Customer/Pack ưu tiên tiếng Việt; Admin giữ tiếng Anh;
   trạng thái luôn có text, không chỉ màu.
5. **Dark mode**: defer; chưa làm trong Phase 2.5.
6. **Phạm vi đợt 1**: cả 4 portal cho shell + dashboard; Pack Station migrate cả
   2 trang. Các trang orders/inventory/tenants/... migrate nội dung ở đợt sau.

---

## 14. Ngoài phạm vi

- Đổi backend API, schema, auth.
- Đổi font family (giữ Cormorant + Plus Jakarta).
- Rebrand logo/màu thương hiệu.
- Mobile app native.
- AI worker / endpoint còn thiếu.

---

## 15. Kết quả triển khai Phase 2.5 (2026-10-20)

### 15.1 Đã hoàn tất

**Token + typography**
- Palette giấy ấm + sage trong `packages/ui-tokens/tailwind-preset.cjs`.
- `white` / `black` override về `surface` / `ink` để page cũ không còn nền trắng lạnh.
- `ink-faint` hạ xuống `#62665C`, `warning` hạ xuống `#8A5D28` để đạt contrast AA.
- `globals.css` + `layout-tokens.css` cả 4 portal: scrollbar ấm, shadow phẳng,
  `h1`/wordmark Cormorant, `h2–h6` Plus Jakarta, scroll-reveal thành no-op.

**Shell dùng chung**
- Sidebar text-only 208px; bỏ collapse desktop; active state là vạch trái +
  `accent-soft`; mobile drawer chỉ render tương tác khi mở (`invisible` khi đóng).
- Topbar 52px, bỏ chuông/icon/scroll progress; title + search cùng hàng; search
  xuống hàng riêng trên mobile; user là tên + role text.
- `AppShell` mặc định full width, content `24px`, skip link.
- Layout gốc Tenant/Customer/Pack tách `Providers` client để export metadata
  (`<title>`) và `lang` đúng; Admin đã có metadata từ trước.

**Primitive editorial**
- `packages/ui-kit/editorial.tsx`: `EditorialPageHeader`, `MetricBand`,
  `EditorialSection`, `StatusLabel`, `EmptyNote`.
- Không dùng card, icon trang trí, pill CTA, shadow lớn.

**Trang đã migrate**
- Tenant dashboard "Bàn giao ca": metric band, bảng hàng đợi 42px, ghi chú ca,
  thao tác nhanh, trạng thái phiên; dữ liệu thật từ API theo role.
- Customer dashboard "Delivery desk": metric band, bảng shipment, account/summary,
  invoice/return actions; `formatVnd()`.
- Admin dashboard "Operations overview": metric band, MRR/growth charts dùng
  accent sage, logistics metric band, forecast, active shipments, AI model hub,
  audit table. Bỏ toàn bộ StatCard icon và trend giả.
- Pack Station:
  - `/pack`: scan form, metric band, nhật ký phiên, quy trình 3 bước, side rail.
  - `/pack/logs`: metric band + bảng audit 42px; bỏ card/icon.
- Nav Pack đổi sang "Đóng gói" / "Nhật ký"; topbar "Trạm đóng gói".

**Sửa lỗi phát sinh**
- Inventory summary: thêm `GET /inventory/summary`; tenant dashboard không còn
  gọi `/inventory` (404).
- Bỏ số liệu giả trong admin: trend "+15.2%", "+3 this week", mock shipments,
  random progress; thay bằng dữ liệu API hoặc trạng thái "—"/empty.
- Chart cũ đổi cobalt/teal sang sage/ink/line.
- Dockerfile portal dùng `pnpm install --filter <portal>...` để không kéo
  `bcrypt` từ backend và tránh lỗi native build.

### 15.2 Verify

```
tsc --noEmit: tenant / customer / admin / pack → pass
Playwright route scan: admin 7/7, tenant 9/9, customer 6/6, pack 2/2
  → 24/24 route OK, 0 failing
axe-core (wcag2a + wcag2aa): 4/4 trang đại diện → 0 violation
GET /api/v1/inventory/summary (tenant token) → 200:
  totalSkus=500, outOfStockSkus=23, inventoryRecords=1500, warehouses=5
Mobile 390×844: tenant/customer/pack/admin → không scroll ngang toàn trang;
  drawer mở/đóng đúng; search không lặp
```

Backend `inventory-service` vẫn còn 2 lỗi `tsc` sẵn có do module `wms-engine`
không resolve trong typecheck cục bộ; image build và endpoint chạy bình thường.

### 15.3 Còn lại

- Các trang danh sách (orders, inventory, shipments, tenants, billing, audit logs,
  AI models, settings...) mới nhận token/shell, chưa migrate nội dung sang
  section + bảng editorial.
- Dark mode chưa làm.
- AI worker `/api/v1/ai/v1/*` vẫn 502 vì không nằm trong docker-compose; admin
  hiển thị trạng thái "Unavailable" thay vì dữ liệu giả.
- Google OAuth thực tế vẫn cần cấu hình Authorized JavaScript origins
  `http://localhost:4001–4004` và test users/publish app trên Google Console.
