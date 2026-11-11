-- 3A - Row Level Security (tenant isolation enforced by PostgreSQL)
--
-- The application isolates tenants with one schema per tenant
-- (`search_path`), which means a query that falls back to the shared
-- `public` schema can read another tenant's rows. This migration adds the
-- second layer of defence: every tenant business table carries a
-- `tenant_id` column and a row-level-security policy that only lets a
-- connection see the rows of the tenant carried in the `app.tenant_id`
-- GUC.
--
-- Connection roles
--   * the owner / migrator role (POSTGRES_USER) bypasses RLS - it is used
--     for `prisma migrate` and for the seed script.
--   * the application role (`smartlogi_app`) is NOSUPERUSER / NOBYPASSRLS
--     and is therefore subject to the policies below.
--
-- Tenant context
--   * `app.tenant_id`      - set per request with `set_config(..., true)`
--                            (transaction local) by the NestJS services.
--   * `app.bypass_rls`     - set to 'on' only by explicit platform code
--                            paths (password reset lookup, admin
--                            dashboards, background workers that read
--                            across tenants).

-- ---------------------------------------------------------------------------
-- 1. Resolve the tenant of the current session.
--
--    During a request the application sets `app.tenant_id`. Outside of a
--    request (migrations, seeds) the tenant is resolved from the schema the
--    statement runs in, so a tenant schema always stamps its own rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_current_tenant_id() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.tenant_id', true), ''),
    (
      SELECT t.id::text
      FROM public."Tenant" t
      WHERE t.db_schema_name = current_schema()
      ORDER BY t.created_at
      LIMIT 1
    )
  )
$$;

COMMENT ON FUNCTION public.app_current_tenant_id() IS
  'Tenant id of the current session: app.tenant_id GUC, else the tenant owning the current schema.';

-- ---------------------------------------------------------------------------
-- 2. tenant_id column, index and RLS policy for every tenant business table.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'adjustments',
    'ai_feedbacks',
    'ai_models',
    'bins',
    'branches',
    'categories',
    'client_users',
    'client_webhooks',
    'clients',
    'cod_remittances',
    'custom_roles',
    'cycle_counts',
    'deliveries',
    'demand_forecasts',
    'driver_expenses',
    'drivers',
    'equipment_checkout',
    'file_attachments',
    'geofences',
    'gps_tracking_logs',
    'inventory',
    'invoice_line_items',
    'notifications',
    'order_items',
    'order_tracking_events',
    'orders',
    'pack_station_logs',
    'products',
    'racks',
    'refunds',
    'return_inspections',
    'return_items',
    'return_reasons',
    'return_requests',
    'role_permissions',
    'route_optimization_jobs',
    'scan_logs',
    'shipping_rates',
    'sos_alerts',
    'staff_shifts',
    'stock_movements',
    'task_items',
    'tasks',
    'tenant_users',
    'trip_stops',
    'trips',
    'user_roles',
    'vehicles',
    'warehouses',
    'wave_picking',
    'zones'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- The column is added as nullable so that existing rows can be stamped
    -- before the NOT NULL constraint is applied.
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS "tenant_id" TEXT', tbl);

    EXECUTE format(
      'UPDATE public.%I SET "tenant_id" = COALESCE(public.app_current_tenant_id(), '
      '(SELECT t.id::text FROM public."Tenant" t ORDER BY t.created_at LIMIT 1)) '
      'WHERE "tenant_id" IS NULL',
      tbl
    );

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN "tenant_id" SET DEFAULT public.app_current_tenant_id()',
      tbl
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN "tenant_id" SET NOT NULL', tbl);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I ("tenant_id")',
      tbl || '_tenant_id_idx',
      tbl
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I '
      'USING ("tenant_id" = current_setting(''app.tenant_id'', true) '
      'OR current_setting(''app.bypass_rls'', true) = ''on'') '
      'WITH CHECK ("tenant_id" = current_setting(''app.tenant_id'', true) '
      'OR current_setting(''app.bypass_rls'', true) = ''on'')',
      tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. PostGIS columns.
--
--    The baseline stored the geofence polygon and the driver position as plain
--    text, so every PostGIS expression (`ST_Contains`, `ST_SetSRID`, ...)
--    failed at runtime. Existing values are kept: WKT is parsed first and
--    GeoJSON is the fallback.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_text_to_geometry(txt text)
RETURNS geometry
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF txt IS NULL OR btrim(txt) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN ST_GeomFromText(txt, 4326);
  EXCEPTION WHEN others THEN
    RETURN ST_GeomFromGeoJSON(txt);
  END;
END $$;

ALTER TABLE public.geofences
  ALTER COLUMN "polygon" TYPE geometry(Polygon, 4326)
  USING public.app_text_to_geometry("polygon")::geometry(Polygon, 4326);

ALTER TABLE public.drivers
  ALTER COLUMN "last_known_location" TYPE geometry(Point, 4326)
  USING public.app_text_to_geometry("last_known_location")::geometry(Point, 4326);

CREATE INDEX IF NOT EXISTS "geofences_polygon_idx"
  ON public."geofences" USING GIST ("polygon");

CREATE INDEX IF NOT EXISTS "drivers_last_known_location_idx"
  ON public."drivers" USING GIST ("last_known_location");

-- ---------------------------------------------------------------------------
-- 4. Grants for the application role.
--
--    The role is created by the database bootstrap (docker-entrypoint.sh)
--    because the password must not be stored in a migration. If the role
--    does not exist yet the grants are skipped silently.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartlogi_app') THEN
    EXECUTE 'GRANT USAGE, CREATE ON SCHEMA public TO smartlogi_app';
    EXECUTE format('GRANT CREATE ON DATABASE %I TO smartlogi_app', current_database());
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartlogi_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartlogi_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smartlogi_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
      'GRANT USAGE, SELECT ON SEQUENCES TO smartlogi_app';
  END IF;
END $$;
