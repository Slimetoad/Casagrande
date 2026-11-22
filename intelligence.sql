CREATE TABLE IF NOT EXISTS intelligence_audit (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('expediente','campaña')),
  subject TEXT NOT NULL,
  actor TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('en_curso','aplicado','fallo','desactualizado')),
  chosen TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS intelligence_audit_budget ON intelligence_audit(scope,created_at);

CREATE TABLE IF NOT EXISTS intelligence_campaigns (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE,
  program TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('propuesta','aprobada','activa','cerrada','descartada')),
  brief TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  measured_at TEXT,
  baseline_program_leads INTEGER,
  lead_count INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  enrolled_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS intelligence_campaigns_review ON intelligence_campaigns(state,measured_at);

CREATE TABLE IF NOT EXISTS intelligence_campaign_history (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES intelligence_campaigns(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS intelligence_campaign_history_campaign ON intelligence_campaign_history(campaign_id,at);

CREATE INDEX IF NOT EXISTS intelligence_submissions_window ON lead_submissions(created_at,program,lead_id);
