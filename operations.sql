CREATE TABLE funnel_counts (
  day TEXT NOT NULL, event TEXT NOT NULL, source TEXT NOT NULL, total INTEGER NOT NULL,
  PRIMARY KEY(day,event,source)
);
CREATE TABLE traffic_limits (
  id TEXT PRIMARY KEY, hour INTEGER NOT NULL, hits INTEGER NOT NULL
);
CREATE INDEX traffic_limits_hour ON traffic_limits(hour);
CREATE TABLE background_runs (
  kind TEXT NOT NULL, slot TEXT NOT NULL, state TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, result TEXT,
  PRIMARY KEY(kind,slot)
);
