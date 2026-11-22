CREATE TABLE IF NOT EXISTS openseo_sources (
  key TEXT PRIMARY KEY,
  project_id TEXT,
  state TEXT NOT NULL,
  checked_at TEXT,
  observed_at TEXT,
  detail TEXT NOT NULL,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS openseo_keywords (
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  program TEXT NOT NULL,
  keyword_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(project_id,source,program,keyword_key)
);
CREATE INDEX IF NOT EXISTS openseo_keywords_program ON openseo_keywords(project_id,program,source);

CREATE TABLE IF NOT EXISTS openseo_program_audit (
  project_id TEXT NOT NULL,
  program TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(project_id,program)
);

CREATE TABLE IF NOT EXISTS openseo_runtime (
  id INTEGER PRIMARY KEY CHECK(id=1),
  token TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  state TEXT NOT NULL
);
