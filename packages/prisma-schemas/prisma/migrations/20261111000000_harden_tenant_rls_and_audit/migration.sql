-- Hardening pass (Gate G1): enable FORCE ROW LEVEL SECURITY on the
-- remaining tenant-owned billing, API key, feature flag, settings,
-- usage, and UI configuration tables omitted in 20240616000000.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'invoices',
    'payment_transactions',
    'tenant_api_keys',
    'feature_flags',
    'tenant_settings',
    'api_usage_daily',
    'tenant_ui_configs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN "tenant_id" SET DEFAULT public.app_current_tenant_id()',
      tbl
    );
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

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartlogi_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartlogi_app';
  END IF;
END $$;
