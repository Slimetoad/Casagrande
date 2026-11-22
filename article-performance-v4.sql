CREATE TABLE IF NOT EXISTS seo_article_counts (
  day TEXT NOT NULL,
  slug TEXT NOT NULL,
  event TEXT NOT NULL CHECK(event IN ('view','click')),
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,slug,event)
);
