-- 3B - Ranh giới: unique constraint theo tenant
--
-- Trước đây các cột như email / sku / barcode / plate_number ... unique TOÀN CỤC,
-- nên hai tenant không thể dùng cùng một giá trị. Ràng buộc được đổi thành
-- unique theo (tenant_id, <cột>) để mỗi tenant có không gian giá trị riêng.
--
-- Ghi chú: `orders.tracking_code` vẫn unique toàn cục vì đó là mã tra cứu
-- công khai (khách chỉ có mã, không có tenant) - tra cứu phải là duy nhất.
--
-- Các bảng platform (Tenant.slug, SystemAdmin.email, SubscriptionPlan.code,
-- NotificationTemplate.code, SystemSetting.key, api key hash) giữ nguyên
-- unique toàn cục vì bản chất chúng đã thuộc phạm vi global.

DROP INDEX IF EXISTS "tenant_users_email_key";
DROP INDEX IF EXISTS "branches_code_key";
DROP INDEX IF EXISTS "warehouses_code_key";
DROP INDEX IF EXISTS "bins_barcode_key";
DROP INDEX IF EXISTS "categories_slug_key";
DROP INDEX IF EXISTS "products_sku_key";
DROP INDEX IF EXISTS "products_barcode_key";
DROP INDEX IF EXISTS "wave_picking_wave_number_key";
DROP INDEX IF EXISTS "vehicles_plate_number_key";
DROP INDEX IF EXISTS "trips_trip_code_key";
DROP INDEX IF EXISTS "return_reasons_code_key";
DROP INDEX IF EXISTS "return_requests_return_code_key";
DROP INDEX IF EXISTS "invoices_invoice_number_key";
DROP INDEX IF EXISTS "feature_flags_key_key";

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_users_tenant_id_email_key" ON public."tenant_users" ("tenant_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenant_id_code_key" ON public."branches" ("tenant_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_tenant_id_code_key" ON public."warehouses" ("tenant_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "bins_tenant_id_barcode_key" ON public."bins" ("tenant_id", "barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "categories_tenant_id_slug_key" ON public."categories" ("tenant_id", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_id_sku_key" ON public."products" ("tenant_id", "sku");
CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_id_barcode_key" ON public."products" ("tenant_id", "barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "wave_picking_tenant_id_wave_number_key" ON public."wave_picking" ("tenant_id", "wave_number");
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_tenant_id_plate_number_key" ON public."vehicles" ("tenant_id", "plate_number");
CREATE UNIQUE INDEX IF NOT EXISTS "trips_tenant_id_trip_code_key" ON public."trips" ("tenant_id", "trip_code");
CREATE UNIQUE INDEX IF NOT EXISTS "return_reasons_tenant_id_code_key" ON public."return_reasons" ("tenant_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "return_requests_tenant_id_return_code_key" ON public."return_requests" ("tenant_id", "return_code");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_tenant_id_invoice_number_key" ON public."invoices" ("tenant_id", "invoice_number");
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_tenant_id_key_key" ON public."feature_flags" ("tenant_id", "key");
