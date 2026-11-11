import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

/**
 * Tables that belong to the platform (shared `public` schema) and must not be
 * duplicated inside a tenant schema. Everything else is tenant business data.
 */
const PLATFORM_TABLES = [
  'Tenant',
  'subscription_plans',
  'system_audit_logs',
  'system_admins',
  'system_settings',
  'tenant_api_keys',
  'client_api_keys',
  'feature_flags',
  'tenant_settings',
  'tenant_ui_configs',
  'api_usage_daily',
  'invoices',
  'invoice_line_items',
  'payment_transactions',
  'notification_templates',
];

export class SchemaProvisioner {
  /**
   * Row-level-security statements for one tenant table. The policy compares
   * the row owner against the `app.tenant_id` GUC that the services set for
   * every request; `app.bypass_rls` is only used by explicit platform code
   * paths.
   */
  private static rlsStatements(dbSchemaName: string, table: string): string[] {
    const qualified = `"${dbSchemaName}"."${table}"`;
    const guard =
      `("tenant_id" = current_setting('app.tenant_id', true) ` +
      `OR current_setting('app.bypass_rls', true) = 'on')`;
    return [
      `ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE ${qualified} FORCE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON ${qualified}`,
      `CREATE POLICY tenant_isolation ON ${qualified} USING ${guard} WITH CHECK ${guard}`,
    ];
  }

  static async getProvisioningSql(dbSchemaName: string): Promise<string[]> {
    // Defensive Programming: validate the identifier before interpolating it.
    if (!dbSchemaName || !/^[a-zA-Z0-9_]+$/.test(dbSchemaName)) {
      throw new Error('Invalid schema name. Only alphanumeric and underscores allowed.');
    }

    // Resolve the schema path flexibly depending on run context:
    //   - dev (ts-node): <repo>/packages/prisma-schemas/prisma/schema.prisma
    //   - build (dist):  cùng đường dẫn, tính từ file đã compile
    //   - docker:        /app/prisma/schema.prisma (Dockerfile copy vào)
    const candidates = [
      path.join(__dirname, '../../../../../packages/prisma-schemas/prisma/schema.prisma'),
      path.join(__dirname, '../../../../../../packages/prisma-schemas/prisma/schema.prisma'),
      path.join(process.cwd(), 'packages/prisma-schemas/prisma/schema.prisma'),
      path.join(process.cwd(), '../../packages/prisma-schemas/prisma/schema.prisma'),
      path.join(process.cwd(), 'prisma/schema.prisma'),
    ];
    const schemaPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!schemaPath) {
      throw new Error(
        `Prisma schema not found (looked in: ${candidates.join(', ')})`,
      );
    }

    try {
      // Generate SQL for the full single-schema model, then drop platform
      // tables. The previous implementation filtered on `"tenant".`, a schema
      // qualifier that does not exist in this Prisma schema, so it produced an
      // empty script and every new tenant was left without tables.
      const { stdout } = await execAsync(
        `npx prisma migrate diff --from-empty --to-schema-datamodel "${schemaPath}" --script`,
      );

      const isPlatformStatement = (statement: string) =>
        PLATFORM_TABLES.some((table) => statement.includes(`"${table}"`));

      const statements = stdout
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .filter((s) => !isPlatformStatement(s))
        // Only schema-qualified table references are rewritten. The tenant
        // helper function keeps its `public.` qualifier on purpose: it lives
        // in the shared schema and is shared by every tenant schema.
        .map((s) => s.replace(/"public"\."/g, `"${dbSchemaName}"."`))
        .map((s) => {
          // Partition the tracking log by timestamp. The primary key already
          // includes `timestamp`, which PostgreSQL requires for partitioned
          // tables. A DEFAULT partition keeps inserts working for any date.
          if (
            s.includes('CREATE TABLE') &&
            s.includes('"order_tracking_events"') &&
            !s.includes('PARTITION')
          ) {
            return `${s} PARTITION BY RANGE ("timestamp")`;
          }
          return s;
        });

      statements.push(
        `CREATE TABLE IF NOT EXISTS "${dbSchemaName}"."order_tracking_events_default" ` +
          `PARTITION OF "${dbSchemaName}"."order_tracking_events" DEFAULT`,
      );

      // Row-level security for the freshly created tenant schema. The policy
      // is identical to the one installed by the RLS migration on the shared
      // schema, so a tenant can only ever read or write its own rows.
      for (const statement of [...statements]) {
        // Prisma thêm comment `-- CreateTable` ở đầu mỗi statement nên không
        // được neo `^CREATE TABLE` - statement phải bắt đầu bằng comment.
        const match = statement.match(/CREATE TABLE "([^"]+)"/);
        if (!match || !statement.includes('"tenant_id"')) continue;
        const table = match[1];
        statements.push(...this.rlsStatements(dbSchemaName, table));
      }
      statements.push(
        ...this.rlsStatements(dbSchemaName, 'order_tracking_events_default'),
      );

      return statements;
    } catch (error: any) {
      console.error('Failed to generate SQL script from Prisma:', error);
      throw new Error(
        `Provisioning script generation failed: ${error?.message || 'unknown error'}`,
      );
    }
  }
}
