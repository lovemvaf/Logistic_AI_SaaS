import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

interface TenantStore {
  tenantId?: string;
  schemaName?: string;
  /** Transaction client bound to the current request, when one is active. */
  tx?: any;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

/**
 * Client dùng trong request: có thể là transaction của request hoặc client gốc.
 *
 * `$transaction` được mở rộng vì `Prisma.TransactionClient` không có hàm này,
 * trong khi proxy của ta hỗ trợ cả hai dạng (callback và mảng lệnh).
 */
export type TenantDb = Omit<Prisma.TransactionClient, '$transaction'> & {
  $transaction: (...args: any[]) => Promise<any>;
};


@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static _isSqlite: boolean | null = null;
  private readonly logger = new Logger(PrismaService.name);

  static get isSqlite(): boolean {
    if (PrismaService._isSqlite === null) {
      PrismaService._isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
    }
    return PrismaService._isSqlite;
  }

  async onModuleInit() {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.$connect();
        this.logger.log(`Database connected successfully (attempt ${attempt})`);
        return;
      } catch (err: any) {
        lastError = err;
        this.logger.error(`Database connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 1000;
          this.logger.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    this.logger.error('All database connection attempts failed');
    throw lastError;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `callback` inside a single transaction that carries the tenant
   * context. Both the legacy schema `search_path` (schema-per-tenant) and the
   * `app.tenant_id` GUC used by row-level security are set on the same pooled
   * connection, so every query in the request sees the same tenant.
   */
  public runWithTenantRequest<T>(
    tenantId: string | undefined,
    schemaName: string | undefined,
    callback: () => Promise<T>,
  ): Promise<T> {
    if (PrismaService.isSqlite) {
      return this.runWithTenant({ tenantId, schemaName: 'public' }, callback);
    }

    const safeSchema =
      schemaName && schemaName !== 'public' ? this.assertSchemaName(schemaName) : null;

    return this.$transaction(
      async (tx) => {
        if (safeSchema) {
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${safeSchema}", public`);
        }
        if (tenantId) {
          await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
        }
        return this.runWithTenant(
          { tenantId, schemaName: safeSchema || 'public', tx },
          callback,
        );
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }

  /**
   * Compatibility helper for non-HTTP call sites (login, password reset,
   * tenant provisioning). Reuses the ambient request transaction when one is
   * already open, because Prisma forbids nested interactive transactions.
   */
  public async runWithSchema<T>(schemaName: string, callback: () => Promise<T>): Promise<T> {
    const target = schemaName || 'public';

    if (PrismaService.isSqlite) {
      return this.runWithTenant({ schemaName: 'public' }, callback);
    }

    const ambient = tenantContext.getStore();
    if (ambient?.tx) {
      if (target !== 'public') {
        await ambient.tx.$executeRawUnsafe(
          `SET LOCAL search_path TO "${this.assertSchemaName(target)}", public`,
        );
      }
      const tenantId = await this.applyTenantGuc(ambient.tx, target);
      return this.runWithTenant({ ...ambient, tenantId: ambient.tenantId || tenantId || undefined, schemaName: target }, callback);
    }

    return this.$transaction(
      async (tx) => {
        if (target !== 'public') {
          await tx.$executeRawUnsafe(
            `SET LOCAL search_path TO "${this.assertSchemaName(target)}", public`,
          );
        }
        const tenantId = await this.applyTenantGuc(tx, target);
        return this.runWithTenant({ tenantId: tenantId || undefined, schemaName: target, tx }, callback);
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }

  /**
   * Runs `callback` with row-level security lifted.
   *
   * Only platform code paths may use this: password-reset lookups that happen
   * before the tenant is known, admin dashboards that aggregate over every
   * tenant, and background workers that read across tenants. Every other read
   * must go through the tenant scope so that the `app.tenant_id` guard applies.
   */
  public async runAsPlatform<T>(callback: (db: any) => Promise<T>): Promise<T> {
    if (PrismaService.isSqlite) {
      return callback(this);
    }

    const ambient = tenantContext.getStore();
    if (ambient?.tx) {
      // Restore the previous value afterwards: the GUC is transaction-local,
      // but the surrounding request may still need its own setting.
      const previous = (await ambient.tx.$queryRawUnsafe(
        `SELECT current_setting('app.bypass_rls', true) AS value`,
      )) as { value: string | null }[];
      const previousValue = previous[0]?.value ?? '';
      await ambient.tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);
      try {
        return await callback(this.asAmbientClient(ambient.tx));
      } finally {
        try {
          await ambient.tx.$executeRawUnsafe(
            `SELECT set_config('app.bypass_rls', $1, true)`,
            previousValue,
          );
        } catch {
          // The transaction is already broken - the original error matters more.
        }
      }
    }

    return this.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', true)`);
        return this.runWithTenant({ schemaName: 'public', tx }, () =>
          callback(this.asAmbientClient(tx)),
        );
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }

  /**
   * Resolves the tenant that owns `schemaName` and stores it in the
   * `app.tenant_id` GUC, which is what the row-level-security policies
   * compare against. The GUC is transaction-local, so it never leaks to the
   * next request that reuses the pooled connection.
   */
  private async applyTenantGuc(tx: any, schemaName: string): Promise<string | null> {
    const rows = (await tx.$queryRawUnsafe(
      `SELECT id::text AS id FROM public."Tenant" WHERE db_schema_name = $1 LIMIT 1`,
      schemaName,
    )) as { id: string }[];
    const tenantId = rows[0]?.id ?? null;
    await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId || '');
    return tenantId;
  }

  /**
   * Chạy raw SQL trong đúng tenant scope của request.
   *
   * Raw SQL trên client gốc sẽ chạy ngoài transaction của request ⇒ mất
   * `app.tenant_id` ⇒ RLS chặn (fail-closed) và có thể đọc nhầm tenant.
   * Hàm này luôn chạy trên transaction của request (mở mới nếu cần).
   */
  public async tenantQuery<T = any>(sql: string, ...params: any[]): Promise<T> {
    const db = this.getTenantDb();
    return (db as any).$queryRawUnsafe(sql, ...params) as Promise<T>;
  }

  /** @see tenantQuery - dùng cho UPDATE/INSERT/DELETE. */
  public async tenantExec(sql: string, ...params: any[]): Promise<number> {
    const db = this.getTenantDb();
    const result = await (db as any).$executeRawUnsafe(sql, ...params);
    return Number(result ?? 0);
  }

  public runWithTenant<T>(store: TenantStore, callback: () => Promise<T>): Promise<T> {
    return tenantContext.run(store, callback);
  }

  public get currentTenant(): TenantStore {
    return tenantContext.getStore() || {};
  }

  public get currentSchema(): string {
    return this.currentTenant.schemaName || 'public';
  }

  /**
   * Returns the request transaction client, or the base client when called
   * outside an HTTP request (seeds, queue workers).
   */
  public getTenantDb(): TenantDb {
    const store = tenantContext.getStore();
    if (store?.tx) {
      return this.asAmbientClient(store.tx);
    }
    return this as unknown as TenantDb;
  }

  /** Kept for callers that switch schema explicitly (workers, tests). */
  public switchSchema(_schemaName?: string): any {
    return this.getTenantDb();
  }

  private assertSchemaName(schemaName: string): string {
    if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid tenant schema name: ${schemaName}`);
    }
    return schemaName;
  }

  /**
   * The request transaction already provides atomicity, so nested
   * `$transaction` calls must not open a second transaction (Prisma rejects
   * nested interactive transactions). Callbacks receive the ambient client;
   * the array form is awaited in place inside the same transaction.
   */
  private asAmbientClient(tx: any): TenantDb {
    return new Proxy(tx, {
      get(target, prop, receiver) {
        if (prop === '$transaction') {
          return (arg: any) => {
            if (typeof arg === 'function') return arg(target);
            return Promise.all(arg);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as TenantDb;
  }
}
