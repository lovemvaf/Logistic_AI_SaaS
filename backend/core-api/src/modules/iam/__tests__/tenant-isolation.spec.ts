import 'reflect-metadata';
import { ConflictException, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditLogInterceptor } from '../../../core/tenant/audit-log.interceptor';
import { IdempotencyInterceptor } from '../../../core/http/idempotency.interceptor';

describe('Multi-Tenant Isolation (PrismaService ALS, AuditLogInterceptor, IdempotencyInterceptor)', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'postgresql://smartlogi:smartlogi@localhost:5432/smartlogi';
    (PrismaService as any)._isSqlite = false;
  });

  describe('PrismaService transaction-local tenant scoping', () => {
    it('sets schema search_path and transaction-local app.tenant_id for each tenant', async () => {
      const prisma = new PrismaService();
      const calls: Array<{ sql: string; params: any[] }> = [];

      const mockTx = {
        $executeRawUnsafe: jest.fn(async (sql: string, ...params: any[]) => {
          calls.push({ sql, params });
          return 1;
        }),
        $queryRawUnsafe: jest.fn(async () => [{ value: '' }]),
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(mockTx));

      const storeSeen = await prisma.runWithTenantRequest(
        'tenant-a-id',
        'tenant_a',
        async () => prisma.currentTenant,
      );

      expect(storeSeen.tenantId).toBe('tenant-a-id');
      expect(storeSeen.schemaName).toBe('tenant_a');
      expect(calls).toEqual([
        { sql: 'SET LOCAL search_path TO "tenant_a", public', params: [] },
        { sql: "SELECT set_config('app.tenant_id', $1, true)", params: ['tenant-a-id'] },
      ]);
    });

    it('rejects malformed or SQL-injection schema names in runWithTenantRequest', () => {
      const prisma = new PrismaService();
      const txSpy = jest.spyOn(prisma, '$transaction');

      expect(() =>
        prisma.runWithTenantRequest('t-1', 'tenant_a"; DROP TABLE orders;--', async () => 'x'),
      ).toThrow(/Invalid tenant schema name/);
      expect(() =>
        prisma.runWithTenantRequest('t-1', 'tenant-hyphen', async () => 'x'),
      ).toThrow(/Invalid tenant schema name/);
      expect(txSpy).not.toHaveBeenCalled();
    });

    it('isolates overlapping AsyncLocalStorage tenant contexts without cross-leak', async () => {
      const prisma = new PrismaService();
      jest.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) =>
        fn({
          $executeRawUnsafe: jest.fn(async () => 1),
          $queryRawUnsafe: jest.fn(async () => [{ value: '' }]),
        }),
      );

      const [resA, resB] = await Promise.all([
        prisma.runWithTenantRequest('tenant-alpha', 'schema_alpha', async () => {
          await new Promise((r) => setTimeout(r, 15));
          return {
            tenantId: prisma.currentTenant.tenantId,
            schema: prisma.currentSchema,
          };
        }),
        prisma.runWithTenantRequest('tenant-beta', 'schema_beta', async () => {
          await new Promise((r) => setTimeout(r, 5));
          return {
            tenantId: prisma.currentTenant.tenantId,
            schema: prisma.currentSchema,
          };
        }),
      ]);

      expect(resA).toEqual({ tenantId: 'tenant-alpha', schema: 'schema_alpha' });
      expect(resB).toEqual({ tenantId: 'tenant-beta', schema: 'schema_beta' });
      expect(prisma.currentTenant).toEqual({});
    });

    it('saves and restores app.bypass_rls when runAsPlatform executes inside an active tenant tx', async () => {
      const prisma = new PrismaService();
      const gucOps: Array<[string, ...any[]]> = [];

      const mockTx = {
        $queryRawUnsafe: jest.fn(async () => [{ value: 'off' }]),
        $executeRawUnsafe: jest.fn(async (sql: string, ...params: any[]) => {
          gucOps.push([sql, ...params]);
          return 1;
        }),
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(mockTx));

      await expect(
        prisma.runWithTenantRequest('tenant-a', 'schema_a', async () =>
          prisma.runAsPlatform(async () => {
            throw new Error('simulated failure');
          }),
        ),
      ).rejects.toThrow('simulated failure');

      expect(gucOps).toContainEqual(["SELECT set_config('app.bypass_rls', 'on', true)"]);
      expect(gucOps).toContainEqual(["SELECT set_config('app.bypass_rls', $1, true)", 'off']);
    });
  });

  describe('AuditLogInterceptor tenant scoping and credential redaction', () => {
    it('stamps tenantId and redacts sensitive fields in systemAuditLog entries', async () => {
      const createdPayloads: any[] = [];
      const mockPrisma = {
        systemAuditLog: {
          create: jest.fn(async (arg: any) => {
            createdPayloads.push(arg.data);
            return arg.data;
          }),
        },
      } as any;

      const interceptor = new AuditLogInterceptor(mockPrisma);
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            originalUrl: '/api/v1/tenant/users',
            ip: '10.0.0.1',
            user: { sub: 'u-1', email: 'ops@alpha.vn', tenant_id: 'tenant-alpha' },
            body: {
              email: 'driver@alpha.vn',
              password: 'SuperSecretPassword!',
              apiKey: 'sk_live_12345',
              nested: { refreshToken: 'rt_abc', role: 'DRIVER' },
            },
            query: { invite: 'true' },
          }),
        }),
      } as unknown as ExecutionContext;

      await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ ok: true }) }));

      expect(createdPayloads).toHaveLength(1);
      expect(createdPayloads[0].tenantId).toBe('tenant-alpha');
      expect(createdPayloads[0].resourceId).toBe('SUCCESS');

      const logged = JSON.parse(createdPayloads[0].newValues);
      expect(logged.body.password).toBe('[REDACTED]');
      expect(logged.body.apiKey).toBe('[REDACTED]');
      expect(logged.body.nested.refreshToken).toBe('[REDACTED]');
      expect(logged.body.email).toBe('driver@alpha.vn');
      expect(logged.body.nested.role).toBe('DRIVER');
    });
  });

  describe('IdempotencyInterceptor cross-tenant key isolation', () => {
    const interceptor = new IdempotencyInterceptor();

    function makeReqCtx(tenantId: string, sub: string, syncId: string, route = '/mobile/sync'): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            tenantId,
            user: { sub, tenant_id: tenantId },
            route: { path: route },
            headers: { 'x-sync-id': syncId },
          }),
        }),
      } as unknown as ExecutionContext;
    }

    it('replays cached payload only for matching tenant + user + route + syncId', async () => {
      const sharedSyncId = `sync-${Date.now()}-isolated`;
      let handlerACount = 0;
      let handlerBCount = 0;

      const firstA = await lastValueFrom(
        interceptor.intercept(makeReqCtx('tenant-A', 'user-1', sharedSyncId), {
          handle: () => of({ tenant: 'A', run: ++handlerACount }),
        }),
      );
      const replayA = await lastValueFrom(
        interceptor.intercept(makeReqCtx('tenant-A', 'user-1', sharedSyncId), {
          handle: () => of({ tenant: 'A', run: ++handlerACount }),
        }),
      );
      const firstB = await lastValueFrom(
        interceptor.intercept(makeReqCtx('tenant-B', 'user-1', sharedSyncId), {
          handle: () => of({ tenant: 'B', run: ++handlerBCount }),
        }),
      );

      expect(firstA).toEqual({ tenant: 'A', run: 1 });
      expect(replayA).toEqual({ tenant: 'A', run: 1 });
      expect(handlerACount).toBe(1);
      expect(firstB).toEqual({ tenant: 'B', run: 1 });
      expect(handlerBCount).toBe(1);
    });

    it('throws ConflictException when duplicate in-flight key arrives before completion', async () => {
      const inflightId = `sync-${Date.now()}-inflight`;
      const obs = interceptor.intercept(makeReqCtx('tenant-A', 'user-2', inflightId), {
        handle: () => throwError(() => new Error('boom')),
      });

      expect(() =>
        interceptor.intercept(makeReqCtx('tenant-A', 'user-2', inflightId), {
          handle: () => of({ ok: true }),
        }),
      ).toThrow(ConflictException);

      await expect(lastValueFrom(obs)).rejects.toThrow('boom');
    });
  });
});
