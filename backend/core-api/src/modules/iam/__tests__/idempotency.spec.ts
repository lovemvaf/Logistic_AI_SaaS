import 'reflect-metadata';
import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from '../../../core/http/idempotency.interceptor';

function createDbBackedPrisma() {
  const rows = new Map<string, any>();
  const keyOf = (w: any) => {
    const k = w.tenantId_principalId_operation_idempotencyKey;
    return `${k.tenantId}::${k.principalId}::${k.operation}::${k.idempotencyKey}`;
  };
  const delegate = {
    apiIdempotencyRecord: {
      create: jest.fn(async ({ data }: any) => {
        const k = `${data.tenantId}::${data.principalId}::${data.operation}::${data.idempotencyKey}`;
        if (rows.has(k)) {
          const err: any = new Error('Unique violation');
          err.code = 'P2002';
          throw err;
        }
        const saved = { id: `id-${rows.size + 1}`, ...data };
        rows.set(k, saved);
        return saved;
      }),
      findUnique: jest.fn(async ({ where }: any) => rows.get(keyOf(where)) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const k = keyOf(where);
        const existing = rows.get(k);
        if (!existing) throw new Error('Not found');
        const next = { ...existing, ...data };
        rows.set(k, next);
        return next;
      }),
    },
  };
  const prisma: any = {
    getTenantDb: () => delegate,
  };
  return { prisma, rows };
}

function makeCtx(tenantId: string, sub: string, syncId: string, body: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        tenantId,
        user: { sub, tenant_id: tenantId },
        route: { path: '/driver-app/deliveries/:id/complete' },
        headers: { 'x-sync-id': syncId },
        body,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('DB-backed IdempotencyInterceptor', () => {
  it('persists completion across interceptor restarts and rejects altered payload with 409 Conflict', async () => {
    const { prisma } = createDbBackedPrisma();
    const instanceA = new IdempotencyInterceptor(prisma);
    const instanceB = new IdempotencyInterceptor(prisma);

    let sideEffects = 0;
    const syncId = 'csprng-sync-uuid-001';

    const first = await lastValueFrom(
      instanceA.intercept(makeCtx('tenant-1', 'driver-1', syncId, { codCollected: 250000 }), {
        handle: () => of({ ok: true, codRecorded: 250000, seq: ++sideEffects }),
      }),
    );

    expect(first).toEqual({ ok: true, codRecorded: 250000, seq: 1 });
    expect(sideEffects).toBe(1);

    // Retry against a brand new instance (simulates process restart / replica rollover)
    const replay = await lastValueFrom(
      instanceB.intercept(makeCtx('tenant-1', 'driver-1', syncId, { codCollected: 250000 }), {
        handle: () => of({ ok: true, codRecorded: 250000, seq: ++sideEffects }),
      }),
    );

    expect(replay).toEqual({ ok: true, codRecorded: 250000, seq: 1 });
    expect(sideEffects).toBe(1);

    // Same X-Sync-Id reused with altered body must throw 409 Conflict
    await expect(
      lastValueFrom(
        instanceB.intercept(makeCtx('tenant-1', 'driver-1', syncId, { codCollected: 999999 }), {
          handle: () => of({ ok: true, seq: ++sideEffects }),
        }),
      ),
    ).rejects.toThrow(ConflictException);
    expect(sideEffects).toBe(1);
  });
});
