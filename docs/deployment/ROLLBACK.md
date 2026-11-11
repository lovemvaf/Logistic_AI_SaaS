# Quy trình Rollback & Phục hồi Sự cố (`ROLLBACK.md`)

Tài liệu xác định quy trình hoàn tác an toàn cho 4 portal Vercel, Cloudflare AI Worker, cụm backend container và PostgreSQL/PostGIS. **Tuyệt đối không dùng `git push --force`, `prisma db push --force-reset`, hay sửa/xóa trực tiếp dữ liệu bảng `outbox_events` / `system_audit_logs` trên production.**

---

## 1. Rollback 4 Portal Vercel (`visionary19`)

1. Mở Vercel Dashboard cho dự án gặp lỗi (`smartlogi-admin`, `smartlogi-tenant`, `smartlogi-customer`, hoặc `smartlogi-pack`) hoặc dùng Vercel CLI (đã xác thực team `team_T6s3oJUmrj5hwTjwgDszZMP2`).
2. Chọn Deployment Production ổn định liền trước trong mục **Deployments** -> bấm **Promote to Production** (hoặc `npx vercel rollback <deployment-url>`). Thời gian chuyển hướng CDN thường dưới `30` giây.
3. Kiểm tra lại bằng:
   ```bash
   node scripts/verify-deployment.mjs \
     --admin-url https://<admin-url> \
     --tenant-url https://<tenant-url> \
     --customer-url https://<customer-url> \
     --pack-url https://<pack-url> \
     --gateway-url https://<gateway-url> \
     --ai-url https://<ai-worker-url>
   ```
4. Tuyệt đối **không** chuyển `NEXT_PUBLIC_DATA_SOURCE` về `mock` trên Production để che lỗi backend; nếu cần bảo trì backend khẩn cấp, hiển thị lỗi kết nối thật hoặc trang bảo trì.

---

## 2. Rollback Cụm Backend (`api-gateway`, `core-api`, Go GPS/Webhook)

1. Nếu lỗi phát sinh ở code ứng dụng không đổi schema DB:
   - Hạ container image tag về release SHA ổn định trước đó trên Docker Compose / orchestrator.
   - Kiểm tra `GET /health` trên `api-gateway`, `GET /api/v1/health/ready` trên `core-api`, `GET /health` trên Go GPS (`:8090`) và Go Webhook (`:8092`).
2. Nếu sự kiện `outbox_events` hoặc Webhook rơi vào `DEAD_LETTER` do cấu hình sai tạm thời:
   - Không chạy `DELETE`; sử dụng màn hình Admin (`admin-portal` `/admin/geography`) hoặc endpoint `POST /api/v1/admin/dashboard/outbox/:id/redrive` (với Go Webhook dùng `/redrive` kèm `WEBHOOK_AUTH_TOKEN`) sau khi sửa nguyên nhân gốc.

---

## 3. Rollback PostgreSQL & Prisma Migrations

1. **Bắt buộc trước mọi deploy Production có migration mới**: chụp snapshot/backup:
   ```bash
   pg_dump --format=custom --no-owner "$MIGRATOR_DATABASE_URL" -f "backup_pre_deploy_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Rollback sau migration lỗi**:
   - Nếu migration mới fail giữa chừng ở một transaction Prisma: sửa nguyên nhân, tránh xóa bản ghi `_prisma_migrations` bừa bãi; dùng `prisma migrate resolve --rolled-back <migration_name>` rồi triển khai migration sửa lỗi.
   - Nếu migration đã chạy thành công nhưng gây hồi quy nghiêm trọng: tạo **forward compensating migration** (tường minh khôi phục cấu trúc/policy) hoặc phục hồi toàn bộ bản `pg_dump` trước giờ cắt tải trong cửa sổ bảo trì đã duyệt.
3. **Kiểm tra hậu rollback**: chạy lại bộ regression cô lập đa tenant [`packages/prisma-schemas/prisma/tests/tenant-isolation.sql`](../../packages/prisma-schemas/prisma/tests/tenant-isolation.sql) bằng tài khoản có quyền chạy kiểm tra đối với role ứng dụng `smartlogi_app`:
   ```bash
   psql "$MIGRATOR_DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f packages/prisma-schemas/prisma/tests/tenant-isolation.sql
   ```

---

## 4. Rollback Cloudflare Worker (`workers/ai-worker`) & Mã Nguồn Git

- **Cloudflare Worker**: Trong Cloudflare Dashboard -> `smartlogi-ai-worker` -> **Deployments** -> chọn phiên bản trước và chọn **Rollback**. Nếu có thay đổi D1 schema, sao lưu D1 (`wrangler d1 export`) trước khi chạy migration mới.
- **GitHub Repository (`lovemvaf/Logistic_AI_SaaS`)**: Dùng `git revert <commit_sha>` tạo commit hoàn tác trên nhánh mới, mở Pull Request đi qua đầy đủ 6 job kiểm tra của [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) trước khi merge vào `main`. **Cấm force-push.**
