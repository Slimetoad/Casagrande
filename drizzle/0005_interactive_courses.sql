CREATE TABLE IF NOT EXISTS interactive_courses (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  program_slug TEXT,
  level TEXT NOT NULL,
  voice_id TEXT NOT NULL DEFAULT 'ef_dora',
  source TEXT NOT NULL DEFAULT 'generated',
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS interactive_courses_created ON interactive_courses(created_at DESC);
