CREATE TABLE IF NOT EXISTS seo_editorial_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  last_plan_week TEXT,
  planned_at TEXT,
  plan_marker TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS seo_editorial_plan (
  id TEXT PRIMARY KEY,
  program TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'catalogo' CHECK (kind IN ('catalogo','signal')),
  signal_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  cluster TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('programa','requisitos','inversion','comparacion','aplicacion')),
  search_question TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}',
  source_url TEXT NOT NULL DEFAULT '',
  source_verified_at TEXT,
  scheduled_at TEXT,
  schedule_locked INTEGER NOT NULL DEFAULT 0 CHECK (schedule_locked IN (0,1)),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','draft','published','paused')),
  paused_from TEXT CHECK (paused_from IN ('planned','draft','published')),
  auto_ready INTEGER NOT NULL DEFAULT 1 CHECK (auto_ready IN (0,1)),
  draft_title TEXT,
  draft_summary TEXT,
  draft_body TEXT,
  generation TEXT NOT NULL DEFAULT '{}',
  content_revision INTEGER NOT NULL DEFAULT 0,
  published_revision INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  mutation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(program,kind,signal_key)
);
CREATE INDEX IF NOT EXISTS seo_editorial_calendar ON seo_editorial_plan(status,scheduled_at,priority DESC);

CREATE TABLE IF NOT EXISTS seo_editorial_history (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES seo_editorial_plan(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seo_editorial_history_recent ON seo_editorial_history(plan_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS seo_editorial_cms (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES seo_editorial_plan(id),
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','retry','published','failed','uncertain','superseded')),
  attempts INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  receipt_id TEXT,
  official_url TEXT,
  last_error TEXT,
  lease_token TEXT,
  UNIQUE(plan_id,version)
);
CREATE INDEX IF NOT EXISTS seo_editorial_cms_due ON seo_editorial_cms(status,due_at);
CREATE INDEX IF NOT EXISTS seo_editorial_cms_plan ON seo_editorial_cms(plan_id,version DESC);

CREATE TABLE IF NOT EXISTS seo_editorial_copy_cache (
  fingerprint TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('reserved','ready')),
  lease_token TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  draft TEXT
);
