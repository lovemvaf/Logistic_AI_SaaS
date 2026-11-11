#!/bin/sh
# Database bootstrap for the db-migrator container.
#
# Goals:
#   - fresh database  -> apply the baseline migration, then seed once
#   - existing database created before migrations existed (prisma db push)
#                     -> adopt the baseline, then continue
#   - every other run -> migrate (no-op) and skip seeding
#
# Never wipes data unless FORCE_RESEED=true is passed explicitly.
set -e

BASELINE="20240615000000_init_full_schema"
SCHEMA="prisma/schema.prisma"

if [ -z "$DATABASE_URL" ]; then
  echo "[db] DATABASE_URL is required" >&2
  exit 1
fi

has_relation() {
  psql "$DATABASE_URL" -tAc "SELECT to_regclass('$1')" 2>/dev/null | grep -q .
}

# The application connects with a dedicated role that is neither a superuser
# nor BYPASSRLS, so the row-level-security policies of the tenant tables are
# actually enforced. The role is created here (not in a migration) because the
# password must not be stored in version control.
ensure_app_role() {
  app_user="${APP_DB_USER:-smartlogi_app}"
  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "[db] POSTGRES_PASSWORD is required to create the application role" >&2
    exit 1
  fi
  echo "[db] ensuring application role '$app_user' exists (RLS is enforced for it)"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    --set=app_user="$app_user" --set=app_pw="$POSTGRES_PASSWORD" <<'SQL' >/dev/null
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', :'app_user', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', :'app_user', :'app_pw')
\gexec
SQL
}

if has_relation 'public._prisma_migrations'; then
  echo "[db] migration history found"
elif has_relation 'public."Tenant"'; then
  echo "[db] existing schema without migration history — adopting baseline $BASELINE"
  pnpm exec prisma migrate resolve --applied "$BASELINE" --schema "$SCHEMA"
  echo "[db] NOTE: if this database was created by 'prisma db push' with an older"
  echo "[db]       schema, run 'docker compose down -v' once to rebuild it cleanly."
else
  echo "[db] empty database — migrations will create the schema"
fi

echo "[db] applying migrations"
ensure_app_role
pnpm exec prisma migrate deploy --schema "$SCHEMA"

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[db] seeding (skipped automatically when data already exists)"
  pnpm exec prisma db seed --schema "$SCHEMA"
else
  echo "[db] SEED_ON_START=false — skipping seed"
fi

echo "[db] database ready"
