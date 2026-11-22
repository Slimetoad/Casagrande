CREATE TABLE IF NOT EXISTS channel_dispatches (
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp','retell')),
  job_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  account TEXT NOT NULL,
  sender TEXT NOT NULL,
  version TEXT NOT NULL,
  state_rank INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider,job_id)
);

CREATE TABLE IF NOT EXISTS voice_suppressions (
  phone TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_provider_ref ON jobs(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_jobs_provider_ref ON whatsapp_jobs(provider_id) WHERE provider_id IS NOT NULL;
