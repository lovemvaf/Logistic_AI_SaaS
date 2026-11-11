import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  __smartlogiDemoPrisma?: PrismaClient;
};

function resolveDatabaseUrl(): string | undefined {
  const candidates = [
    process.env.DEMO_APP_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.DIRECT_URL,
  ];
  for (const c of candidates) {
    if (c && c.trim().length > 0) {
      return c.trim().replace(/^["']|["']$/g, '');
    }
  }
  return undefined;
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__smartlogiDemoPrisma) {
    const url = resolveDatabaseUrl();
    globalForPrisma.__smartlogiDemoPrisma = new PrismaClient(
      url
        ? {
            datasources: {
              db: { url },
            },
          }
        : undefined,
    );
  }
  return globalForPrisma.__smartlogiDemoPrisma;
}

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  if (!tenantId || !/^[0-9a-f-]{8,}$/i.test(tenantId)) {
    throw new Error('Invalid tenant context for RLS transaction');
  }
  const prisma = getPrisma();
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true), set_config('app.tenant_id', $1, true)`,
        tenantId,
      );
      return fn(tx);
    },
    { maxWait: 10000, timeout: 30000 },
  );
}

export async function withPlatform<T>(
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  const prisma = getPrisma();
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);
      return fn(tx);
    },
    { maxWait: 10000, timeout: 30000 },
  );
}

export async function checkDbHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  postgisVersion?: string | null;
  error?: string;
}> {
  const start = Date.now();
  try {
    const prisma = getPrisma();
    await prisma.$queryRawUnsafe('SELECT 1 AS ok');
    let postgisVersion: string | null = null;
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ v?: string }>>('SELECT PostGIS_Version() AS v');
      const raw = rows?.[0]?.v ? String(rows[0].v) : null;
      postgisVersion = raw ? raw.split(' ')[0] : null;
    } catch {
      postgisVersion = null;
    }
    return { ok: true, latencyMs: Date.now() - start, postgisVersion };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      postgisVersion: null,
      error: err?.message ? String(err.message).slice(0, 180) : 'Database unreachable',
    };
  }
}

export function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function iso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function detUuid(prefixHex8: string, seq: number): string {
  const tail = Math.abs(seq).toString(16).padStart(12, '0').slice(-12);
  return `${prefixHex8}-0000-4000-8000-${tail}`;
}
