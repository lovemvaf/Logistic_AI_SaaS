-- D1 schema for the migrated SmartLogi AI Worker.
-- Replaces the Postgres `tenant.ai_models` / `tenant.ai_feedbacks` tables.
-- Multi-tenancy is achieved with a `tenant_id` column (extracted from the
-- verified JWT) instead of Postgres schema-per-tenant.

CREATE TABLE IF NOT EXISTS ai_models (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL DEFAULT '__system__',
  name          TEXT NOT NULL,
  version       TEXT NOT NULL,
  type          TEXT NOT NULL,            -- 'demand' | 'delivery_time' | 'churn' | 'anomaly'
  accuracy      REAL,
  model_path    TEXT,
  metadata      TEXT,
  is_current    INTEGER NOT NULL DEFAULT 0,
  trained_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_models_tenant_type ON ai_models (tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_ai_models_tenant_current ON ai_models (tenant_id, is_current);

CREATE TABLE IF NOT EXISTS ai_feedbacks (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL DEFAULT '__system__',
  model_id          TEXT NOT NULL,
  resource_type     TEXT NOT NULL,
  resource_id       TEXT NOT NULL,
  ai_prediction     TEXT,
  human_corrected   TEXT,
  confidence        REAL NOT NULL DEFAULT 1.0,
  is_used_for_train INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_feedbacks_tenant ON ai_feedbacks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedbacks_model ON ai_feedbacks (model_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedbacks_unused ON ai_feedbacks (tenant_id, is_used_for_train);
