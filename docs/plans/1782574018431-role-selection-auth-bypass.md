# Plan: Role Selection Auth Bypass

## Vấn đề
- Lỗi `Cannot read properties of undefined (reading 'findFirst')` khi `prisma.tenantClient` gọi các phương thức mà không có schema context
- Hệ thống xác thực JWT hiện tại cần token hợp lệ và tenant context

## Giải pháp: Bypass Authentication + Role Selection

### Thay đổi cần làm

1. **Tạo RoleSelectionGuard thay thế cho JwtAuthGuard**
   - Không kiểm tra token
   - Đọc role từ header `x-selected-role` hoặc body
   - Set payload giả lập cho request.user

2. **Cập nhật JwtAuthGuard ( iam-service và các services khác)**
   - Bỏ kiểm tra token validation
   - Chỉ kiểm tra header role từ client

3. **Cập nhật auth.service.ts**
   - Thêm method `mockLogin(role: string)` trả về token giả lập
   - Hoặc bỏ qua kiểm tra password

4. **Cập nhật controllers**
   - Thêm endpoint `/mock-login` nhận role name
   - Trả về access token với role tương ứng

### Chi tiết thay đổi file

#### services/iam-service/src/auth/jwt.strategy.ts
- Bỏ validation, chỉ return payload từ token

#### services/iam-service/src/controllers/tenant-auth.controller.ts
- Thêm `POST /role-login` nhận `role` và `tenantSlug`, trả token giả lập

#### services/*/auth/jwt-auth.guard.ts (mỗi service)
- Bỏ AuthGuard, dùng JwtAuthGuard tùy chỉnh không verify token
- Set user payload từ header `x-mock-role`

### Rủi ro
- Bỏ xác thực sẽ làm mất bảo mật - chỉ dùng cho môi trường demo/dev
- Cần đánh dấu rõ đây là chế độ bypass