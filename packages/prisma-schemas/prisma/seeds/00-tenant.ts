import { PrismaClient } from '@prisma/client';

/**
 * The tenant that owns the shared `public` schema.
 *
 * Every business table carries a `tenant_id` column whose default is
 * `public.app_current_tenant_id()`. Outside of a request (migrations, seed
 * script) that function resolves the tenant from the schema the statement
 * runs in, so the tenant row has to exist before the first business row is
 * written.
 */
export const DEMO_TENANT_ID = '11111111-1111-4111-8111-111111111111';

export async function ensureTenant(prisma: PrismaClient) {
  const existing = await prisma.tenant.findFirst();
  if (existing) {
    return existing;
  }

  return prisma.tenant.create({
    data: {
      id: DEMO_TENANT_ID,
      name: 'Demo Logistics VN',
      slug: 'demo-logistics-vn',
      dbSchemaName: 'public',
      status: 'ACTIVE',
    },
  });
}
