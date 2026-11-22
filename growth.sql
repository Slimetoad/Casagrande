CREATE TABLE IF NOT EXISTS seo_opportunities (
  id TEXT PRIMARY KEY, query TEXT NOT NULL, source TEXT NOT NULL, clicks INTEGER,
  impressions INTEGER, ctr REAL, position REAL, volume INTEGER, priority REAL NOT NULL,
  period_start TEXT, period_end TEXT, updated_at TEXT NOT NULL,
  UNIQUE(source,query)
);
CREATE TABLE IF NOT EXISTS seo_articles (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, opportunity_id TEXT NOT NULL UNIQUE,
  program TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL,
  source_query TEXT NOT NULL, source_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, editor TEXT
);
CREATE INDEX IF NOT EXISTS seo_article_public ON seo_articles(status,published_at);
CREATE TABLE IF NOT EXISTS growth_limits (
  bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS growth_sync (
  source TEXT PRIMARY KEY, synced_at TEXT, status TEXT NOT NULL, total INTEGER, message TEXT NOT NULL
);
