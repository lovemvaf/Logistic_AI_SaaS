# Roadmap: Xác thực API Key (`X-API-Key`) cho tích hợp bên ngoài

> Trạng thái: **Phase 3–5 chưa triển khai** (mới sửa thứ tự kiểm tra Bearer/API key ở gateway)
> Ngày tạo: 2026-10-20
> Liên quan: `api/api-gateway/src/middleware/api-key.middleware.ts`, `backend/iam-service/src/controllers/api-keys.controller.ts`, `packages/prisma-schemas/prisma/schema.prisma`

---

## 1. Mục tiêu

Cho phép **hệ thống bên ngoài** (ERP/TMS của khách, đối tác, script tích hợp, webhook
receiver) gọi API SmartLogi **mà không cần đăng nhập bằng tài khoản người dùng**,
thông qua header:

```
X-API-Key: <raw-secret-key>
```

Yêu cầu của mục tiêu này:

1. Key được **xác thực thật** (không chỉ kiểm tra header có tồn tại).
2. Key thuộc về một **tenant** hoặc một **client** cụ thể → request chỉ truy cập
   được dữ liệu của chủ sở hữu key.
3. **Scopes** được enforce (key chỉ được gọi đúng nhóm API đã cấp).
4. Có **rate limit riêng theo key** và **audit/usage tracking**.
5. Key **thu hồi (revoke)** được và nên có **rotation** + **expiry**.

---

## 2. Hiện trạng (đã có gì / thiếu gì)

### 2.1 Đã có

| Hạng mục | Vị trí | Ghi chú |
|---|---|---|
| Middleware kiểm tra header | `api-key.middleware.ts` | Cho request có Bearer JWT đi thẳng; request không JWT vẫn chỉ check **có mặt**, chưa verify giá trị |
| Danh sách path bắt buộc key | `API_KEY_PATHS` = `/api/v1/public`, `/api/v1/client`, `/api/v1/webhooks` | |
| Danh sách path bỏ qua | `BYPASS_PATHS` = `/api/v1/public/track`, `/api/v1/public/verify`, `/api/v1/client/auth` | `/api/v1/client/auth` thêm để login hoạt động |
| Tạo / liệt kê / thu hồi key | `backend/iam-service/src/controllers/api-keys.controller.ts` | `POST/GET/DELETE /api/v1/api-keys`, cần quyền `ApiKeysManage` |
| Sinh key | `crypto.randomBytes(32).toString('hex')` | Trả raw key **1 lần duy nhất** |
| Lưu trữ | `bcrypt.hash(rawKey, 10)` vào `keyHash` | |
| Bảng dữ liệu | `TenantApiKey`, `ClientApiKey` | Có `name`, `scopes`, `revokedAt`, `deletedAt` |
| Bảng thống kê | `ApiUsageDaily` (`tenantId`, `date`, `endpoint`, `method`, `count`) | Chưa có code ghi dữ liệu |
| UI quản lý | `tenant-portal` → `/admin/api-keys` | |

### 2.2 Thiếu / chưa hoàn thiện

| Vấn đề | Chi tiết |
|---|---|
| **Không verify giá trị key** | Toàn repo chỉ có `bcrypt.hash` khi tạo key; **không có `bcrypt.compare`** nào cho `keyHash`. Gửi `X-API-Key: abc` bất kỳ vẫn lọt. |
| **Không có endpoint/service validate** | Comment trong middleware ghi *"delegated to IAM service"* nhưng **không có code tương ứng** (đã `grep` toàn bộ). |
| **Scopes không được dùng** | Cột `scopes` lưu chuỗi nhưng không nơi nào đọc/enforce. |
| **Không gắn danh tính key vào request** | Không set `req.tenantId` / `req.clientId` / `req.apiKeyScopes` sau khi xác thực. |
| **Không có `prefix` để tra cứu** | `keyHash` là bcrypt (không index được theo giá trị), muốn verify phải quét toàn bảng → O(n) `bcrypt.compare`. |
| **Không có expiry / lastUsedAt** | Khó vận hành (không biết key còn dùng, không tự hết hạn). |
| **`ApiUsageDaily` chưa được ghi** | Chưa phục vụ billing/quota. |
| **Rate limit chưa tách theo key** | `RateLimitMiddleware` hiện theo IP. |

---

## 3. Thiết kế đề xuất

### 3.1 Quyết định: validate ở đâu?

Có 2 lựa chọn:

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Validate tại api-gateway** (khuyến nghị) | Một điểm duy nhất; service con không phải biết về API key; dễ cache Redis; dễ rate-limit & usage tracking | Gateway cần đọc DB IAM (hoặc gọi nội bộ) |
| B. Validate tại từng service | Service tự chủ | Lặp code ở 7 service; khó đồng bộ; dễ bỏ sót |

→ **Chọn A**: gateway gọi endpoint nội bộ của IAM (`POST /internal/api-keys/verify`)
hoặc đọc trực tiếp qua Prisma/Kafka. Ưu tiên endpoint nội bộ để giữ ranh giới service.

### 3.2 Luồng xác thực đề xuất

```
Client ── X-API-Key: slk_live_<prefix>_<secret> ──▶ api-gateway
                                                       │
                                   1. Có Bearer JWT? ──┴─▶ bỏ qua (user session)
                                                       │
                                   2. Parse key: prefix + secret
                                                       │
                                   3. Redis cache: apikey:<prefix> ?──hit──▶ dùng luôn
                                                       │ miss
                                                       ▼
                                   4. Gọi IAM nội bộ: verify(prefix, secret)
                                        - tra bản ghi theo prefix (unique, indexed)
                                        - timing-safe compare secret với keyHash
                                        - kiểm tra revokedAt / expiresAt
                                                       │
                                   5. Gắn vào request:
                                        req.auth = { type:'api_key', tenantId|clientId, scopes, keyId }
                                                       │
                                   6. Enforce scope theo route (bảng map bên dưới)
                                                       │
                                   7. Rate limit theo keyId + ghi ApiUsageDaily
                                                       ▼
                                              ProxyMiddleware → service
```

### 3.3 Định dạng key (khuyến nghị)

```
slk_<env>_<prefix8>_<secret32>
  slk   = SmartLogi key
  env   = live | test
  prefix8  = 8 ký tự đầu, lưu plaintext trong DB (dùng để tra cứu, không phải bí mật)
  secret32 = phần bí mật, chỉ lưu hash
```

Bổ sung cột vào `TenantApiKey` / `ClientApiKey`:

```prisma
prefix     String   @unique @map("prefix")      // 8 ký tự, tra cứu nhanh
env        String   @default("live")            // live | test
lastUsedAt DateTime? @map("last_used_at")
expiresAt  DateTime? @map("expires_at")
lastUsedIp String?  @map("last_used_ip")
```

> ⚠️ Migration: các key cũ chỉ có `keyHash` → cần thu hồi và cấp lại (không thể suy ra prefix).

### 3.4 Enforce scopes theo route

Bảng map route → scope (đặt tại gateway, ví dụ):

| Route prefix | Scope yêu cầu |
|---|---|
| `/api/v1/public/*` | `public:read` |
| `/api/v1/client/orders*` | `orders:read` hoặc `orders:write` theo method |
| `/api/v1/client/invoices*` | `invoices:read` |
| `/api/v1/client/webhooks*` | `webhooks:manage` |
| `/api/v1/webhooks/*` | `webhooks:receive` |

Quy tắc: `GET` → `:read`, `POST/PUT/PATCH/DELETE` → `:write`, trừ khi route được khai báo riêng.
Nếu key thiếu scope → `403 { message: 'API key missing required scope: <scope>' }`.

### 3.5 Rate limit & quota

- Key có quota riêng (đọc từ `SubscriptionPlan` của tenant, hoặc bảng `ApiUsageDaily`).
- Dùng Redis (`redis` service đã có) với key `ratelimit:apikey:<keyId>:<window>`.
- Vượt quota → `429` + header `X-RateLimit-Limit / -Remaining / -Reset`.
- Ghi `ApiUsageDaily` (upsert theo `tenantId, date, endpoint, method`, cộng `count`).

### 3.6 Audit & bảo mật

- Log mọi lần dùng key vào `SystemAuditLog` / `TenantAuditLog` (đã có interceptor `AuditLogInterceptor`).
- **Không** log raw key; `apiKey` đã nằm trong `SENSITIVE_FIELDS` của interceptor → giữ nguyên.
- So sánh secret bằng `crypto.timingSafeEqual` để tránh timing attack (nếu không dùng bcrypt).
- Cảnh báo key sắp hết hạn; tự động `revokedAt` khi hết hạn.

---

## 4. Kế hoạch triển khai theo giai đoạn

### Phase 1 — Nền tảng (bắt buộc)
1. Migration Prisma: thêm `prefix`, `env`, `lastUsedAt`, `expiresAt`, `lastUsedIp` cho 2 bảng key.
2. Cập nhật `api-keys.controller.ts`:
   - Sinh key theo định dạng `slk_<env>_<prefix8>_<secret32>`, lưu `prefix` + `keyHash` + `scopes` (mảng JSON).
   - Trả raw key **1 lần** kèm `prefix`, `scopes`, `expiresAt`.
3. Thêm endpoint nội bộ `POST /internal/api-keys/verify` (không public, chặn ở gateway/network):
   - Input: `{ prefix, secret }` → Output: `{ valid, keyId, tenantId|clientId, scopes }`.
   - Verify: tra theo `prefix` → `timingSafeEqual`/bcrypt compare → check `revokedAt`/`expiresAt`.
4. Gateway: thay phần "delegated" bằng validate thật + set `req.auth`.

### Phase 2 — Phân quyền & hạn mức
5. Bảng map route → scope; enforce trong middleware/guard.
6. Rate limit + quota theo key (Redis).
7. Ghi `ApiUsageDaily`.

### Phase 3 — Vận hành
8. UI: hiển thị `prefix`, `scopes`, `lastUsedAt`, `expiresAt`; nút revoke; nút rotate.
9. Cảnh báo key hết hạn qua notification-service.
10. Dashboard usage cho tenant.

---

## 5. Test plan

- Unit: sinh key đúng format; `verify` đúng/sai secret; key revoked; key hết hạn.
- Integration: gọi `/api/v1/client/orders` với key thiếu scope → 403; đủ scope → 200.
- Security: không log raw key; timing-safe compare; key tenant A không đọc được dữ liệu tenant B.
- Load: `bcrypt` chậm (cost 10 ~100ms) → **bắt buộc dùng Redis cache** cho `prefix` để không tăng latency mỗi request.
- Regression: các endpoint login (`/api/v1/client/auth/*`) vẫn đi qua không cần key.

---

## 6. Rủi ro & câu hỏi mở

| # | Vấn đề | Cần quyết định |
|---|---|---|
| 1 | Verify đồng bộ (IAM nội bộ) có thành SPOF không? | Dùng Redis cache + fallback; hoặc cho gateway đọc DB read-replica trực tiếp |
| 2 | Dùng `bcrypt` hay HMAC-SHA256 cho secret? | HMAC (`secret` lưu plaintext hash SHA-256) nhanh hơn nhiều, phù hợp API key; bcrypt quá chậm cho per-request |
| 3 | `scopes` lưu dạng chuỗi hay JSON? | Chuẩn hoá JSON array; cần migrate dữ liệu cũ |
| 4 | Có cần IP allowlist cho key không? | Nếu có → thêm cột `allowedIps` |
| 5 | Key dùng chung cho cả tenant hay riêng cho từng client? | Hiện có cả `TenantApiKey` và `ClientApiKey` → giữ cả hai, phân biệt qua `req.auth` |
| 6 | Billing theo lượng gọi API? | Cần `ApiUsageDaily` chính xác theo key |

---

## 7. Phụ lục — Code hiện tại cần sửa

- `api/api-gateway/src/middleware/api-key.middleware.ts` — dòng 22–42 (nhánh "delegated").
- `backend/iam-service/src/controllers/api-keys.controller.ts` — hàm `create()`.
- `packages/prisma-schemas/prisma/schema.prisma` — model `TenantApiKey` (dòng ~1173), `ClientApiKey` (~1190), `ApiUsageDaily` (~1158).
- `api/api-gateway/src/middleware/rate-limit.middleware.ts` — bổ sung nhánh theo key.
