/**
 * One-time migration: move historical AI metadata from the legacy Postgres
 * schema-per-tenant store (`tenant_<x>.ai_models` / `tenant_<x>.ai_feedbacks`)
 * into the Cloudflare D1 database owned by `workers/ai-worker`.
 *
 * The Worker now partitions AI metadata by `tenant_id` (read from the JWT)
 * instead of Postgres schema-per-tenant; this script bridges the two.
 *
 * Requirements: `pg` (npm i -g pg) OR run via `npx pg` is not possible; install
 * locally:  npm i -D pg   (or use node-postgres). `wrangler` must be logged in.
 *
 * Usage:
 *   export PG_DATABASE_URL="postgresql://root:...@postgres:5432/smartlogi"
 *   export D1_DATABASE=smartlogi-ai-meta        # matches wrangler.toml [[d1_databases]]
 *   node scripts/migrate-postgres-ai-to-d1.mjs
 */
import { Client } from 'pg';
import { execSync } from 'child_process';

const PG_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
const D1_DB = process.env.D1_DATABASE || 'smartlogi-ai-meta';

if (!PG_URL) {
  console.error('Set PG_DATABASE_URL (or DATABASE_URL) and D1_DATABASE before running.');
  process.exit(1);
}

const client = new Client({ connectionString: PG_URL });

// Map a Postgres schema name to a D1 tenant_id. The old TenantMiddleware used
// schema names like `tenant_<uuid>` (or `public` for system models).
function schemaToTenant(schema) {
  if (!schema || schema === 'public' || schema === 'pg_catalog') return '__system__';
  if (schema.startsWith('tenant_')) return schema.slice('tenant_'.length);
  return schema;
}

function q(sql, params, txn) {
  const cmd = `INSERT OR IGNORE ${sql}`;
  execSync(`npx wrangler d1 execute ${D1_DB} --command ${JSON.stringify(cmd)}`, { stdio: 'pipe' });
}

async function main() {
  await client.connect();
  try {
    // Enumerate tenant schemas that actually own ai_models.
    const schemas = await client.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public'`
    );

    let models = 0, feedbacks = 0;
    for (const { schema_name } of schemas.rows) {
      const tenantId = schemaToTenant(schema_name);

      const mRes = await client.query(`SELECT * FROM "${schema_name}".ai_models`);
      for (const r of mRes.rows) {
        const sql = `INTO ai_models (id,tenant_id,name,version,type,accuracy,model_path,metadata,is_current,trained_at,created_at,updated_at) VALUES (${r.id},'${tenantId}','${(r.name||'').replace(/'/g,"''")}','${(r.version||'').replace(/'/g,"''")}','${(r.type||'').replace(/'/g,"''")}',${r.accuracy ?? 'NULL'},'${r.model_path||''}','${(r.metadata||'').replace(/'/g,"''")}',${r.is_current ? 1 : 0},'${r.trained_at||''}','${r.created_at||''}','${r.updated_at||''}')`;
        q(sql, [], undefined);
        models++;
      }

      const fRes = await client.query(`SELECT * FROM "${schema_name}".ai_feedbacks`);
      for (const r of fRes.rows) {
        const ap = r.ai_prediction != null ? JSON.stringify(r.ai_prediction) : 'NULL';
        const hc = r.human_corrected != null ? JSON.stringify(r.human_corrected) : 'NULL';
        const sql = `INTO ai_feedbacks (id,tenant_id,model_id,resource_type,resource_id,ai_prediction,human_corrected,confidence,is_used_for_train,created_at,updated_at) VALUES (${r.id},'${tenantId}','${(r.model_id||'').replace(/'/g,"''")}','${(r.resource_type||'').replace(/'/g,"''")}','${(r.resource_id||'').replace(/'/g,"''")}',${ap},${hc},${r.confidence ?? 1.0},${r.is_used_for_train ? 1 : 0},'${r.created_at||''}','${r.updated_at||''}')`;
        q(sql, [], undefined);
        feedbacks++;
      }
      console.log(`[${schema_name}] tenant=${tenantId}: ${mRes.rows.length} models, ${fRes.rows.length} feedbacks`);
    }
    console.log(`Migration complete: ${models} models, ${feedbacks} feedbacks written to D1 "${D1_DB}".`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
