// Back‑fill sync_version for existing records
// Run with: ts-node scripts/backfill-sync-version.ts

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  // Get all tenant schemas (public tenant table stores dbSchemaName)
  const tenants = await prisma.tenant.findMany({
    select: { dbSchemaName: true },
  });

  for (const { dbSchemaName } of tenants) {
    console.log(`Back‑filling schema: ${dbSchemaName}`);
    // Switch to tenant's schema
    await prisma.$executeRawUnsafe(`SET search_path TO "${dbSchemaName}", public`);

    // tenant_users – ensure sync_version is 1 if null
    await prisma.$executeRawUnsafe(`
      UPDATE "tenant_users"
      SET "sync_version" = 1
      WHERE "sync_version" IS NULL;
    `);

    // trips – derive version from updated_at (seconds since epoch)
    await prisma.$executeRawUnsafe(`
      UPDATE "trips"
      SET "sync_version" = FLOOR(EXTRACT(EPOCH FROM "updated_at"))
      WHERE "sync_version" IS NULL;
    `);

    // deliveries – similar versioning from updated_at
    await prisma.$executeRawUnsafe(`
      UPDATE "deliveries"
      SET "sync_version" = FLOOR(EXTRACT(EPOCH FROM "updated_at"))
      WHERE "sync_version" IS NULL;
    `);

    // driver_expenses – use created_at as base (no updates yet)
    await prisma.$executeRawUnsafe(`
      UPDATE "driver_expenses"
      SET "sync_version" = FLOOR(EXTRACT(EPOCH FROM "created_at"))
      WHERE "sync_version" IS NULL;
    `);
  }

  await prisma.$disconnect();
  console.log('Back‑fill completed.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
