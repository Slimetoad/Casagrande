CREATE TABLE IF NOT EXISTS openseo_sources (
  key TEXT PRIMARY KEY,
  project_id TEXT,
  state TEXT NOT NULL,
  checked_at TEXT,
  observed_at TEXT,
  detail TEXT NOT NULL,
  payload TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS openseo_keywords (
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  program TEXT NOT NULL,
  keyword_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(project_id,source,program,keyword_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS openseo_keywords_program ON openseo_keywords(project_id,program,source);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS openseo_program_audit (
  project_id TEXT NOT NULL,
  program TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(project_id,program)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS openseo_runtime (
  id INTEGER PRIMARY KEY CHECK(id=1),
  token TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  state TEXT NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seo_editorial_calendar ON seo_editorial_plan(status,scheduled_at,priority DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seo_editorial_history (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES seo_editorial_plan(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seo_editorial_history_recent ON seo_editorial_history(plan_id,occurred_at DESC);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seo_editorial_cms_due ON seo_editorial_cms(status,due_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seo_editorial_cms_plan ON seo_editorial_cms(plan_id,version DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seo_editorial_copy_cache (
  fingerprint TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('reserved','ready')),
  lease_token TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  draft TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seo_article_counts (
  day TEXT NOT NULL,
  slug TEXT NOT NULL,
  event TEXT NOT NULL CHECK(event IN ('view','click')),
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,slug,event)
);
