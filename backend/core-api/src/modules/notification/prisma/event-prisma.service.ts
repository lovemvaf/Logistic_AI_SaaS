import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class EventPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static _isSqlite: boolean | null = null;
  private readonly logger = new Logger(EventPrismaService.name);

  static get isSqlite(): boolean {
    if (EventPrismaService._isSqlite === null) {
      EventPrismaService._isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');
    }
    return EventPrismaService._isSqlite;
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
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }
    throw lastError;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `callback` with the tenant schema applied to the same connection.
   *
   * The previous implementation issued `SET search_path` on the pooled client
   * and then ran the query separately, so both statements could land on
   * different connections and the tenant schema was never used.
   */
  public async runWithSchema<T>(schemaName: string, callback: (client: any) => Promise<T>): Promise<T> {
    if (EventPrismaService.isSqlite || !schemaName || schemaName === 'public') {
      return callback(this);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid tenant schema name: ${schemaName}`);
    }

    return this.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}", public`);
        // Row-level security compares the row owner with `app.tenant_id`, so
        // the tenant that owns the schema has to be set on the same
        // transaction.
        const rows = (await tx.$queryRawUnsafe(
          `SELECT id::text AS id FROM public."Tenant" WHERE db_schema_name = $1 LIMIT 1`,
          schemaName,
        )) as { id: string }[];
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.tenant_id', $1, true)`,
          rows[0]?.id || '',
        );
        return callback(tx);
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }
}
