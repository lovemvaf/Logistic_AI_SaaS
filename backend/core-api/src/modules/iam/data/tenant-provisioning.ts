export const TENANT_BASELINE_DDL = `
-- Create IAM tables for tenant schema
CREATE TABLE IF NOT EXISTS "tenant_users" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "status" VARCHAR(20) DEFAULT 'ACTIVE',
    "last_login" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "custom_roles" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "is_system_default" BOOLEAN DEFAULT FALSE,
    "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
    "role_id" UUID REFERENCES "custom_roles"("id") ON DELETE CASCADE,
    "resource" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    PRIMARY KEY ("role_id", "resource", "action")
);

CREATE TABLE IF NOT EXISTS "user_roles" (
    "user_id" UUID REFERENCES "tenant_users"("id") ON DELETE CASCADE,
    "role_id" UUID REFERENCES "custom_roles"("id") ON DELETE CASCADE,
    PRIMARY KEY ("user_id", "role_id")
);

CREATE TABLE IF NOT EXISTS "warehouses" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50) UNIQUE NOT NULL,
    "address" TEXT,
    "status" VARCHAR(20) DEFAULT 'ACTIVE',
    "manager_id" UUID REFERENCES "tenant_users"("id")
);

CREATE TABLE IF NOT EXISTS "products" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "sku" VARCHAR(100) UNIQUE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "barcode" VARCHAR(100) UNIQUE,
    "status" VARCHAR(20) DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "inventory" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID REFERENCES "warehouses"("id"),
    "product_id" UUID REFERENCES "products"("id"),
    "quantity_on_hand" INTEGER DEFAULT 0,
    "status" VARCHAR(20) DEFAULT 'AVAILABLE',
    "version" INTEGER DEFAULT 1
);
`;

export const SEED_TENANT_ADMIN_ROLE = async (tx: any) => {
   const role = await tx.customRole.create({
     data: {
       name: 'TENANT_ADMIN',
       is_system_default: true,
     }
   });

   const resources = ['inventory', 'warehouses', 'tasks', 'orders', 'trips', 'vehicles', 'drivers', 'users', 'roles', 'settings', 'clients', 'billing', 'api-keys', 'audit-logs', 'notifications', 'mobile', 'pack-station', 'returns'];
   const actions = ['read', 'create', 'update', 'delete', 'manage', 'invite'];

   const permissions = [];
   for (const res of resources) {
     for (const act of actions) {
        permissions.push({ roleId: role.id, resource: res, action: act });
     }
   }

   await tx.rolePermission.createMany({
     data: permissions
   });

   return role;
};
