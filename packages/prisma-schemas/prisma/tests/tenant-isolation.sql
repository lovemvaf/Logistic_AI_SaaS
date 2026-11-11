-- Postgres RLS Isolation & Fail-Closed Regression Test (CI / psql ON_ERROR_STOP=1)
-- Exercises both 20240616000000_enable_tenant_rls and 20261111000000_harden_tenant_rls_and_audit.

-- 1. Ensure the restricted application role exists (NOSUPERUSER, NOBYPASSRLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartlogi_app') THEN
    CREATE ROLE smartlogi_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO smartlogi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartlogi_app;
GRANT EXECUTE ON FUNCTION public.app_current_tenant_id() TO smartlogi_app;

-- 2. Verify FORCE ROW LEVEL SECURITY metadata on hardened + core tenant tables
DO $$
DECLARE
  tbl text;
  expected_tables text[] := ARRAY[
    'orders',
    'inventory',
    'invoices',
    'payment_transactions',
    'tenant_api_keys',
    'client_api_keys',
    'api_idempotency_records',
    'public_tracking_grants',
    'webhook_deliveries',
    'feature_flags',
    'tenant_settings',
    'api_usage_daily',
    'tenant_ui_configs',
    'tractor_units',
    'chassis_units',
    'container_equipments',
    'equipment_assignments',
    'yards',
    'yard_slots',
    'container_gate_events',
    'equipment_interchange_receipts',
    'contract_rates',
    'surcharge_rules',
    'dem_det_rules',
    'freight_rfqs',
    'freight_quotes',
    'quote_lines',
    'freight_bookings',
    'freight_shipments',
    'freight_legs',
    'freight_invoices',
    'freight_ledger_entries',
    'payment_allocations',
    'dispute_cases',
    'trade_documents',
    'trade_document_versions',
    'customs_declarations',
    'customs_status_events',
    'hs_code_suggestions'
  ];
  has_rls boolean;
  has_force boolean;
BEGIN
  FOREACH tbl IN ARRAY expected_tables LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity
      INTO has_rls, has_force
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = tbl;

    IF NOT COALESCE(has_rls, false) OR NOT COALESCE(has_force, false) THEN
      RAISE EXCEPTION 'Table public.% missing ENABLE/FORCE ROW LEVEL SECURITY (rls=%, force=%)',
        tbl, has_rls, has_force;
    END IF;
  END LOOP;
END $$;

BEGIN;

-- 3. Seed synthetic Tenant A & Tenant B fixtures with platform bypass enabled
SELECT set_config('app.bypass_rls', 'on', true);

INSERT INTO public."Tenant" ("id", "name", "slug", "db_schema_name", "status", "updated_at")
VALUES
  ('11111111-1111-4111-8111-111111111111', 'RLS Tenant Alpha', 'rls-test-alpha', 'tenant_rls_alpha', 'ACTIVE', now()),
  ('22222222-2222-4222-8222-222222222222', 'RLS Tenant Beta',  'rls-test-beta',  'tenant_rls_beta',  'ACTIVE', now());

INSERT INTO public."warehouses" ("id", "tenant_id", "name", "code", "address", "status", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0001', '11111111-1111-4111-8111-111111111111', 'WH A', 'WH-RLS-A', 'Addr A', 'ACTIVE', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0001', '22222222-2222-4222-8222-222222222222', 'WH B', 'WH-RLS-B', 'Addr B', 'ACTIVE', now());

INSERT INTO public."zones" ("id", "tenant_id", "warehouse_id", "code", "type", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0002', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-aaaaaaaa0001', 'Z-A', 'STORAGE', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0002', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-bbbbbbbb0001', 'Z-B', 'STORAGE', now());

INSERT INTO public."racks" ("id", "tenant_id", "zone_id", "code", "aisle", "rows", "levels", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0003', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-aaaaaaaa0002', 'R-A', 'A1', 1, 1, now()),
  ('22222222-2222-4222-8222-bbbbbbbb0003', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-bbbbbbbb0002', 'R-B', 'B1', 1, 1, now());

INSERT INTO public."bins" ("id", "tenant_id", "rack_id", "warehouse_id", "barcode", "row_index", "level_index", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0004', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-aaaaaaaa0003', '11111111-1111-4111-8111-aaaaaaaa0001', 'BIN-RLS-A', 1, 1, now()),
  ('22222222-2222-4222-8222-bbbbbbbb0004', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-bbbbbbbb0003', '22222222-2222-4222-8222-bbbbbbbb0001', 'BIN-RLS-B', 1, 1, now());

INSERT INTO public."products" ("id", "tenant_id", "sku", "name", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0005', '11111111-1111-4111-8111-111111111111', 'SKU-RLS-A', 'Prod A', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0005', '22222222-2222-4222-8222-222222222222', 'SKU-RLS-B', 'Prod B', now());

INSERT INTO public."inventory" ("id", "tenant_id", "warehouse_id", "bin_id", "product_id", "quantity_on_hand", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0006', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-aaaaaaaa0001', '11111111-1111-4111-8111-aaaaaaaa0004', '11111111-1111-4111-8111-aaaaaaaa0005', 10, now()),
  ('22222222-2222-4222-8222-bbbbbbbb0006', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-bbbbbbbb0001', '22222222-2222-4222-8222-bbbbbbbb0004', '22222222-2222-4222-8222-bbbbbbbb0005', 20, now());

INSERT INTO public."orders" ("id", "tenant_id", "tracking_code", "status", "recipient_name", "recipient_phone", "recipient_address", "shipping_fee", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0007', '11111111-1111-4111-8111-111111111111', 'TRK-RLS-AAA1', 'NEW', 'Rec A', '0900000001', 'Addr A', 25000, now()),
  ('22222222-2222-4222-8222-bbbbbbbb0007', '22222222-2222-4222-8222-222222222222', 'TRK-RLS-BBB1', 'NEW', 'Rec B', '0900000002', 'Addr B', 30000, now());

INSERT INTO public."invoices" ("id", "tenant_id", "invoice_number", "total_amount", "status", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0008', '11111111-1111-4111-8111-111111111111', 'INV-RLS-A', 100.00, 'PENDING', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0008', '22222222-2222-4222-8222-222222222222', 'INV-RLS-B', 200.00, 'PENDING', now());

INSERT INTO public."payment_transactions" ("id", "tenant_id", "invoice_id", "amount", "method", "status", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0009', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-aaaaaaaa0008', 100.00, 'BANK', 'COMPLETED', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0009', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-bbbbbbbb0008', 200.00, 'BANK', 'COMPLETED', now());

INSERT INTO public."tenant_api_keys" ("id", "tenant_id", "key_hash", "name", "scopes", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0010', '11111111-1111-4111-8111-111111111111', 'rls_hash_alpha_001', 'Alpha Key', ARRAY['orders:read']::text[], now()),
  ('22222222-2222-4222-8222-bbbbbbbb0010', '22222222-2222-4222-8222-222222222222', 'rls_hash_beta_001',  'Beta Key',  ARRAY['orders:read']::text[], now());

INSERT INTO public."feature_flags" ("id", "tenant_id", "key", "enabled", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0011', '11111111-1111-4111-8111-111111111111', 'rls.flag', true, now()),
  ('22222222-2222-4222-8222-bbbbbbbb0011', '22222222-2222-4222-8222-222222222222', 'rls.flag', false, now());

INSERT INTO public."tenant_settings" ("id", "tenant_id", "key", "value", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0012', '11111111-1111-4111-8111-111111111111', 'rls.setting', 'alpha', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0012', '22222222-2222-4222-8222-222222222222', 'rls.setting', 'beta', now());

INSERT INTO public."api_usage_daily" ("id", "tenant_id", "date", "endpoint", "method", "count")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0013', '11111111-1111-4111-8111-111111111111', '2026-11-11T00:00:00Z', '/api/v1/orders', 'GET', 5),
  ('22222222-2222-4222-8222-bbbbbbbb0013', '22222222-2222-4222-8222-222222222222', '2026-11-11T00:00:00Z', '/api/v1/orders', 'GET', 9);

INSERT INTO public."tenant_ui_configs" ("id", "tenant_id", "brandName", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0014', '11111111-1111-4111-8111-111111111111', 'Alpha Portal', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0014', '22222222-2222-4222-8222-222222222222', 'Beta Portal', now());

INSERT INTO public."clients" ("id", "tenant_id", "name", "status", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0015', '11111111-1111-4111-8111-111111111111', 'Client Alpha', 'ACTIVE', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0015', '22222222-2222-4222-8222-222222222222', 'Client Beta', 'ACTIVE', now());

INSERT INTO public."client_api_keys" ("id", "tenant_id", "client_id", "key_hash", "name", "scopes", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0016', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-aaaaaaaa0015', 'rls_ckey_a', 'CA Key', ARRAY['orders:read']::text[], now()),
  ('22222222-2222-4222-8222-bbbbbbbb0016', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-bbbbbbbb0015', 'rls_ckey_b', 'CB Key', ARRAY['orders:read']::text[], now());

INSERT INTO public."api_idempotency_records" ("id", "tenant_id", "principal_id", "operation", "idempotency_key", "body_sha256", "state", "expires_at", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0017', '11111111-1111-4111-8111-111111111111', 'user-a', 'POST:/orders', 'idem-rls-1', 'hash-a', 'COMPLETED', now() + interval '1 day', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0017', '22222222-2222-4222-8222-222222222222', 'user-b', 'POST:/orders', 'idem-rls-1', 'hash-b', 'COMPLETED', now() + interval '1 day', now());

INSERT INTO public."public_tracking_grants" ("id", "tenant_id", "tracking_code", "token_hash", "expires_at", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0018', '11111111-1111-4111-8111-111111111111', 'TRK-RLS-AAA1', 'grant_hash_a', now() + interval '1 day', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0018', '22222222-2222-4222-8222-222222222222', 'TRK-RLS-BBB1', 'grant_hash_b', now() + interval '1 day', now());

INSERT INTO public."webhook_deliveries" ("id", "webhook_id", "tenant_id", "url", "event", "status")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0019', 'wh-a', '11111111-1111-4111-8111-111111111111', 'https://a.example.com/hook', 'order.created', 'DELIVERED'),
  ('22222222-2222-4222-8222-bbbbbbbb0019', 'wh-b', '22222222-2222-4222-8222-222222222222', 'https://b.example.com/hook', 'order.created', 'DELIVERED');

INSERT INTO public."freight_bookings" ("id", "tenant_id", "booking_no", "service_mode", "status", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0020', '11111111-1111-4111-8111-111111111111', 'BK-RLS-AAA1', 'FCL_EXPORT', 'CONFIRMED', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0020', '22222222-2222-4222-8222-222222222222', 'BK-RLS-BBB1', 'FCL_EXPORT', 'CONFIRMED', now());

INSERT INTO public."customs_declarations" ("id", "tenant_id", "declaration_no", "direction", "channel", "port_code", "status", "updated_at")
VALUES
  ('11111111-1111-4111-8111-aaaaaaaa0021', '11111111-1111-4111-8111-111111111111', 'DEC-RLS-AAA1', 'EXPORT', 'GREEN', 'VNSGN', 'NEEDS_CUSTOMS_REVIEW', now()),
  ('22222222-2222-4222-8222-bbbbbbbb0021', '22222222-2222-4222-8222-222222222222', 'DEC-RLS-BBB1', 'EXPORT', 'RED', 'VNSGN', 'NEEDS_CUSTOMS_REVIEW', now());

-- 4. Drop bypass and enforce restricted role + Tenant A GUC
SELECT set_config('app.bypass_rls', '', true);
SET LOCAL ROLE smartlogi_app;
SELECT set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', true);

DO $$
DECLARE
  cnt integer;
  affected integer;
  leaked_insert boolean := false;
BEGIN
  SELECT count(*) INTO cnt FROM public.inventory
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0006', '22222222-2222-4222-8222-bbbbbbbb0006');
  IF cnt <> 1 THEN RAISE EXCEPTION 'inventory RLS failed: expected 1 row for Tenant A, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.orders
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0007', '22222222-2222-4222-8222-bbbbbbbb0007');
  IF cnt <> 1 THEN RAISE EXCEPTION 'orders RLS failed: expected 1 row for Tenant A, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.invoices
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0008', '22222222-2222-4222-8222-bbbbbbbb0008');
  IF cnt <> 1 THEN RAISE EXCEPTION 'invoices RLS failed: expected 1 row for Tenant A, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.payment_transactions
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0009', '22222222-2222-4222-8222-bbbbbbbb0009');
  IF cnt <> 1 THEN RAISE EXCEPTION 'payment_transactions RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.tenant_api_keys
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0010', '22222222-2222-4222-8222-bbbbbbbb0010');
  IF cnt <> 1 THEN RAISE EXCEPTION 'tenant_api_keys RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.feature_flags
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0011', '22222222-2222-4222-8222-bbbbbbbb0011');
  IF cnt <> 1 THEN RAISE EXCEPTION 'feature_flags RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.tenant_settings
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0012', '22222222-2222-4222-8222-bbbbbbbb0012');
  IF cnt <> 1 THEN RAISE EXCEPTION 'tenant_settings RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.api_usage_daily
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0013', '22222222-2222-4222-8222-bbbbbbbb0013');
  IF cnt <> 1 THEN RAISE EXCEPTION 'api_usage_daily RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.tenant_ui_configs
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0014', '22222222-2222-4222-8222-bbbbbbbb0014');
  IF cnt <> 1 THEN RAISE EXCEPTION 'tenant_ui_configs RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.client_api_keys
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0016', '22222222-2222-4222-8222-bbbbbbbb0016');
  IF cnt <> 1 THEN RAISE EXCEPTION 'client_api_keys RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.api_idempotency_records
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0017', '22222222-2222-4222-8222-bbbbbbbb0017');
  IF cnt <> 1 THEN RAISE EXCEPTION 'api_idempotency_records RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.public_tracking_grants
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0018', '22222222-2222-4222-8222-bbbbbbbb0018');
  IF cnt <> 1 THEN RAISE EXCEPTION 'public_tracking_grants RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.webhook_deliveries
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0019', '22222222-2222-4222-8222-bbbbbbbb0019');
  IF cnt <> 1 THEN RAISE EXCEPTION 'webhook_deliveries RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.freight_bookings
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0020', '22222222-2222-4222-8222-bbbbbbbb0020');
  IF cnt <> 1 THEN RAISE EXCEPTION 'freight_bookings RLS failed: expected 1 row, got %', cnt; END IF;

  SELECT count(*) INTO cnt FROM public.customs_declarations
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0021', '22222222-2222-4222-8222-bbbbbbbb0021');
  IF cnt <> 1 THEN RAISE EXCEPTION 'customs_declarations RLS failed: expected 1 row, got %', cnt; END IF;

  -- Cross-tenant UPDATE/DELETE must match 0 rows
  UPDATE public.orders
     SET status = 'TAMPERED'
   WHERE id = '22222222-2222-4222-8222-bbbbbbbb0007';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Cross-tenant UPDATE on orders modified % row(s)', affected;
  END IF;

  DELETE FROM public.invoices
   WHERE id = '22222222-2222-4222-8222-bbbbbbbb0008';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Cross-tenant DELETE on invoices removed % row(s)', affected;
  END IF;

  -- Cross-tenant INSERT must fail RLS WITH CHECK (SQLSTATE 42501)
  BEGIN
    INSERT INTO public.orders (
      "id", "tenant_id", "tracking_code", "status",
      "recipient_name", "recipient_phone", "recipient_address", "shipping_fee", "updated_at"
    )
    VALUES (
      '11111111-1111-4111-8111-aaaaaaaa9999',
      '22222222-2222-4222-8222-222222222222',
      'TRK-RLS-FORGED',
      'NEW',
      'Forged',
      '0900000003',
      'Addr',
      1000,
      now()
    );
    leaked_insert := true;
  EXCEPTION WHEN insufficient_privilege THEN
    leaked_insert := false;
  END;

  IF leaked_insert THEN
    RAISE EXCEPTION 'Cross-tenant INSERT succeeded under Tenant A session (WITH CHECK broken)';
  END IF;
END $$;

-- 5. Fail-closed check: empty app.tenant_id returns 0 rows
SELECT set_config('app.tenant_id', '', true);

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM public.orders
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0007', '22222222-2222-4222-8222-bbbbbbbb0007');
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'Fail-closed check failed on orders: expected 0, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt FROM public.invoices
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0008', '22222222-2222-4222-8222-bbbbbbbb0008');
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'Fail-closed check failed on invoices: expected 0, got %', cnt;
  END IF;
END $$;

-- 6. Platform bypass check: app.bypass_rls = 'on' reads across both tenants
SELECT set_config('app.bypass_rls', 'on', true);

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM public.orders
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0007', '22222222-2222-4222-8222-bbbbbbbb0007');
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'Platform bypass check failed on orders: expected 2, got %', cnt;
  END IF;

  SELECT count(*) INTO cnt FROM public.invoices
   WHERE id IN ('11111111-1111-4111-8111-aaaaaaaa0008', '22222222-2222-4222-8222-bbbbbbbb0008');
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'Platform bypass check failed on invoices: expected 2, got %', cnt;
  END IF;
END $$;

ROLLBACK;
