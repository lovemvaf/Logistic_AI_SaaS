# Migrations

Schema hiện do `packages/prisma-schemas` quản lý. Không tạo migration mới ở đây cho tới
khi một module thực sự được chuyển sang Rust.

Khi chuyển:

1. Đọc migration Prisma tương ứng, không suy đoán cột.
2. Viết migration idempotent (`IF NOT EXISTS`), không sửa dữ liệu tenant.
3. Chạy trên bản sao trước, so sánh kết quả với core-api.
4. Giữ migration trong cùng transaction với backfill; không khoá bảng lâu.
5. Chỉ xoá migration Prisma sau khi cả hai backend ngừng đọc cột cũ.
