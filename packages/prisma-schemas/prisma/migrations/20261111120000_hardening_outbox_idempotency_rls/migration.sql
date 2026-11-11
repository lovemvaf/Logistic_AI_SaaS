-- Gate G3 P0/P1 Hardening Migration:
-- 1. Durable Outbox leases, payload hashing, correlation & DLQ metadata
-- 2. EventConsumptionLedger for idempotent consumers
-- 3. DB-backed ApiIdempotencyRecord with payload SHA-256 fingerprint & FORCE RLS
-- 4. ClientApiKey direct tenant_id + FORCE RLS
-- 5. PublicTrackingGrant scoped token tracking + FORCE RLS
-- 6. WebhookDelivery persistent states (QUEUED/DELIVERING/RETRYING/DELIVERED/FAILED/DLQ) + FORCE RLS

-- 1. Extend outbox_events
ALTER TABLE "public"."outbox_events"
  ADD COLUMN IF NOT EXISTS "event_id" TEXT,
  ADD COLUMN IF NOT EXISTS "schema_version" TEXT NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS "aggregate_id" TEXT,
  ADD COLUMN IF NOT EXISTS "payload_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "correlation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "locked_by" TEXT,
  ADD COLUMN IF NOT EXISTS "dead_letter_reason" TEXT;

UPDATE "public"."outbox_events"
   SET "event_id" = gen_random_uuid()::text
 WHERE "event_id" IS NULL;

ALTER TABLE "public"."outbox_events"
  ALTER COLUMN "event_id" SET NOT NULL,
  ALTER COLUMN "event_id" SET DEFAULT (gen_random_uuid()::text);

CREATE UNIQUE INDEX IF NOT EXISTS "outbox_events_event_id_key" ON "public"."outbox_events"("event_id");
CREATE INDEX IF NOT EXISTS "outbox_events_status_lease_until_idx" ON "public"."outbox_events"("status", "lease_until");

-- 2. Create event_consumption_ledger
CREATE TABLE IF NOT EXISTS "public"."event_consumption_ledger" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
  "event_id" TEXT NOT NULL,
  "consumer_group" TEXT NOT NULL,
  "tenant_id" TEXT,
  "topic" TEXT NOT NULL,
  "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_consumption_ledger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_consumption_ledger_event_id_consumer_group_key"
  ON "public"."event_consumption_ledger"("event_id", "consumer_group");
CREATE INDEX IF NOT EXISTS "event_consumption_ledger_tenant_id_idx"
  ON "public"."event_consumption_ledger"("tenant_id");

-- 3. Create api_idempotency_records (DB-backed idempotency)
CREATE TABLE IF NOT EXISTS "public"."api_idempotency_records" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
  "tenant_id" TEXT NOT NULL DEFAULT 'public',
  "principal_id" TEXT NOT NULL DEFAULT 'anon',
  "operation" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "body_sha256" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PROCESSING',
  "status_code" INTEGER,
  "response_body" JSONB,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_idempotency_records_scope_key"
  ON "public"."api_idempotency_records"("tenant_id", "principal_id", "operation", "idempotency_key");
CREATE INDEX IF NOT EXISTS "api_idempotency_records_expires_at_idx"
  ON "public"."api_idempotency_records"("expires_at");
CREATE INDEX IF NOT EXISTS "api_idempotency_records_tenant_id_idx"
  ON "public"."api_idempotency_records"("tenant_id");

ALTER TABLE "public"."api_idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."api_idempotency_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."api_idempotency_records";
CREATE POLICY tenant_isolation ON "public"."api_idempotency_records"
  USING (
    "tenant_id" = current_setting('app.tenant_id', true)
    OR ("tenant_id" = 'public' AND COALESCE(current_setting('app.tenant_id', true), '') = '')
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "tenant_id" = current_setting('app.tenant_id', true)
    OR ("tenant_id" = 'public' AND COALESCE(current_setting('app.tenant_id', true), '') = '')
    OR current_setting('app.bypass_rls', true) = 'on'
  );

-- 4. Add direct tenant_id + FORCE RLS to client_api_keys
ALTER TABLE "public"."client_api_keys"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

UPDATE "public"."client_api_keys" cak
   SET "tenant_id" = c."tenant_id"
  FROM "public"."clients" c
 WHERE cak."client_id" = c."id"
   AND cak."tenant_id" IS NULL;

ALTER TABLE "public"."client_api_keys"
  ALTER COLUMN "tenant_id" SET DEFAULT public.app_current_tenant_id(),
  ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "client_api_keys_tenant_id_idx"
  ON "public"."client_api_keys"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'client_api_keys_tenant_id_fkey'
       AND table_schema = 'public'
  ) THEN
    ALTER TABLE "public"."client_api_keys"
      ADD CONSTRAINT "client_api_keys_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."client_api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."client_api_keys" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."client_api_keys";
CREATE POLICY tenant_isolation ON "public"."client_api_keys"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

-- 5. Create public_tracking_grants with FORCE RLS
CREATE TABLE IF NOT EXISTS "public"."public_tracking_grants" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
  "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
  "tracking_code" TEXT NOT NULL,
  "order_id" TEXT,
  "shipment_id" TEXT,
  "token_hash" TEXT NOT NULL,
  "allowed_precision" TEXT NOT NULL DEFAULT 'CITY_WARD',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_by" TEXT,
  "access_count" INTEGER NOT NULL DEFAULT 0,
  "last_accessed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_tracking_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_tracking_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "public_tracking_grants_token_hash_key"
  ON "public"."public_tracking_grants"("token_hash");
CREATE INDEX IF NOT EXISTS "public_tracking_grants_tenant_id_idx"
  ON "public"."public_tracking_grants"("tenant_id");
CREATE INDEX IF NOT EXISTS "public_tracking_grants_tracking_code_idx"
  ON "public"."public_tracking_grants"("tracking_code");
CREATE INDEX IF NOT EXISTS "public_tracking_grants_expires_at_idx"
  ON "public"."public_tracking_grants"("expires_at");

ALTER TABLE "public"."public_tracking_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_tracking_grants" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."public_tracking_grants";
CREATE POLICY tenant_isolation ON "public"."public_tracking_grants"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

-- 6. Create webhook_deliveries with tenant scope + FORCE RLS
CREATE TABLE IF NOT EXISTS "public"."webhook_deliveries" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
  "webhook_id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "url" TEXT NOT NULL,
  "event" VARCHAR(120) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_retries" INTEGER NOT NULL DEFAULT 5,
  "last_status_code" INTEGER,
  "last_error" TEXT,
  "dlq_reason" TEXT,
  "idempotency_key" VARCHAR(255),
  "payload_json" JSONB,
  "next_retry_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_attempted_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "webhook_deliveries_tenant_id_idx"
  ON "public"."webhook_deliveries"("tenant_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_created_at_idx"
  ON "public"."webhook_deliveries"("status", "created_at");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_id_idx"
  ON "public"."webhook_deliveries"("webhook_id");

ALTER TABLE "public"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."webhook_deliveries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."webhook_deliveries";
CREATE POLICY tenant_isolation ON "public"."webhook_deliveries"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartlogi_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartlogi_app';
  END IF;
END $$;
