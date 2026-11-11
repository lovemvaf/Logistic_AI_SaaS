-- Gate G1/G3: Persistent Cloud Demo Control Plane tables (platform-layer)
-- Supports isolated sandboxes, single-use HMAC handoff tokens, and deterministic scenario/simulator telemetry.

CREATE TABLE "demo_sandboxes" (
    "id" TEXT NOT NULL,
    "sandbox_key" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "active_scenario" TEXT NOT NULL DEFAULT 'NORMAL_DAY',
    "scenario_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sim_speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "telemetry_paused" BOOLEAN NOT NULL DEFAULT false,
    "network_sim_mode" TEXT NOT NULL DEFAULT 'NORMAL',
    "state_json" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_sandboxes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demo_handoff_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "persona_id" TEXT NOT NULL,
    "sandbox_key" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_handoff_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demo_simulation_events" (
    "id" TEXT NOT NULL,
    "sandbox_key" TEXT NOT NULL,
    "tenant_id" TEXT,
    "category" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_simulation_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "demo_sandboxes_sandbox_key_key" ON "demo_sandboxes"("sandbox_key");
CREATE INDEX "demo_sandboxes_tenant_id_idx" ON "demo_sandboxes"("tenant_id");
CREATE INDEX "demo_sandboxes_expires_at_idx" ON "demo_sandboxes"("expires_at");

CREATE UNIQUE INDEX "demo_handoff_tokens_token_hash_key" ON "demo_handoff_tokens"("token_hash");
CREATE INDEX "demo_handoff_tokens_expires_at_idx" ON "demo_handoff_tokens"("expires_at");
CREATE INDEX "demo_handoff_tokens_sandbox_key_idx" ON "demo_handoff_tokens"("sandbox_key");

CREATE INDEX "demo_simulation_events_sandbox_key_created_at_idx" ON "demo_simulation_events"("sandbox_key", "created_at");
CREATE INDEX "demo_simulation_events_tenant_id_idx" ON "demo_simulation_events"("tenant_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartlogi_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo_sandboxes, public.demo_handoff_tokens, public.demo_simulation_events TO smartlogi_app';
  END IF;
END $$;
