CREATE TABLE IF NOT EXISTS seo_live_targets (
  url TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom',
  program_slug TEXT,
  added_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seo_live_audits (
  url TEXT PRIMARY KEY,
  label TEXT,
  role TEXT,
  program_slug TEXT,
  status_code INTEGER,
  response_ms INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  title_length INTEGER,
  meta_description TEXT,
  meta_desc_length INTEGER,
  canonical TEXT,
  h1_count INTEGER,
  h2_count INTEGER,
  word_count INTEGER,
  img_total INTEGER,
  img_missing_alt INTEGER,
  internal_posgrado_links INTEGER,
  schema_types_json TEXT,
  issues_json TEXT,
  metrics_json TEXT,
  sitemap_json TEXT,
  crawled_at TEXT NOT NULL,
  error TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seo_live_audits_crawled ON seo_live_audits(crawled_at DESC);
