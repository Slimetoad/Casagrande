CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  program TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Nuevo' CHECK (stage IN ('Nuevo','En orientación','En postulación','Admitido','Matriculado','Cerrado')),
  owner TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0,1)),
  consent_email INTEGER NOT NULL DEFAULT 0 CHECK (consent_email IN (0,1)),
  consent_voice INTEGER NOT NULL DEFAULT 0 CHECK (consent_voice IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  pref_token TEXT NOT NULL UNIQUE,
  score INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  mutation_id TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leads_updated ON leads(updated_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leads_stage ON leads(stage, due_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lead_submissions (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  program TEXT NOT NULL,
  source TEXT NOT NULL,
  context TEXT NOT NULL,
  email_choice INTEGER NOT NULL,
  voice_choice INTEGER NOT NULL,
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS submissions_lead ON lead_submissions(lead_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'Sistema'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS events_lead ON events(lead_id,created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS events_recent ON events(created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendiente','hecha')),
  due_at TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_open ON tasks(status,due_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_lead ON tasks(lead_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  channel TEXT NOT NULL CHECK (channel IN ('email','voice')),
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','sent','failed','skipped','uncertain')),
  due_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT,
  provider_id TEXT,
  UNIQUE(lead_id,kind,channel)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,due_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jobs_lead ON jobs(lead_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admissions_reply_routes (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id),
  token TEXT NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admissions_replies (
  provider_id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL UNIQUE,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  subject TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body_status TEXT NOT NULL,
  received_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admissions_replies_lead ON admissions_replies(lead_id,received_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seo_opportunities (
  id TEXT PRIMARY KEY, query TEXT NOT NULL, source TEXT NOT NULL, clicks INTEGER,
  impressions INTEGER, ctr REAL, position REAL, volume INTEGER, priority REAL NOT NULL,
  period_start TEXT, period_end TEXT, updated_at TEXT NOT NULL,
  UNIQUE(source,query)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seo_articles (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, opportunity_id TEXT NOT NULL UNIQUE,
  program TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL,
  source_query TEXT NOT NULL, source_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, editor TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seo_article_public ON seo_articles(status,published_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS growth_limits (
  bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS growth_sync (
  source TEXT PRIMARY KEY, synced_at TEXT, status TEXT NOT NULL, total INTEGER, message TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE funnel_counts (
  day TEXT NOT NULL, event TEXT NOT NULL, source TEXT NOT NULL, total INTEGER NOT NULL,
  PRIMARY KEY(day,event,source)
);
--> statement-breakpoint
CREATE TABLE traffic_limits (
  id TEXT PRIMARY KEY, hour INTEGER NOT NULL, hits INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX traffic_limits_hour ON traffic_limits(hour);
--> statement-breakpoint
CREATE TABLE background_runs (
  kind TEXT NOT NULL, slot TEXT NOT NULL, state TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, result TEXT,
  PRIMARY KEY(kind,slot)
);
