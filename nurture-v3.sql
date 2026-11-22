CREATE TABLE IF NOT EXISTS conversation_nurture_signals (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  channel TEXT NOT NULL CHECK(channel IN ('email','voice')),
  intent TEXT NOT NULL CHECK(intent IN ('programa','inversion','cita','requisitos','solicitar_asesor','baja','postergar','desconocido')),
  confidence TEXT NOT NULL CHECK(confidence IN ('alta','media','baja')),
  received_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('respuesta_programada','revision_humana','sin_contacto','pausa_solicitada','baja','superada')),
  reason TEXT NOT NULL,
  next_action TEXT NOT NULL,
  program TEXT,
  source_url TEXT,
  stage TEXT NOT NULL,
  lead_program TEXT NOT NULL,
  transactional INTEGER NOT NULL DEFAULT 0 CHECK(transactional IN (0,1)),
  lead_revision INTEGER NOT NULL,
  write_token TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS nurture_signal_timeline ON conversation_nurture_signals(lead_id,received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS nurture_first_direct_reply ON conversation_nurture_signals(lead_id) WHERE transactional=1;
CREATE TABLE IF NOT EXISTS conversation_nurture_jobs (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL UNIQUE REFERENCES conversation_nurture_signals(id),
  lead_id TEXT NOT NULL REFERENCES leads(id),
  status TEXT NOT NULL CHECK(status IN ('pending','processing','accepted','skipped','failed','uncertain')),
  due_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  provider_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS nurture_jobs_due ON conversation_nurture_jobs(status,due_at);
CREATE INDEX IF NOT EXISTS nurture_jobs_lead ON conversation_nurture_jobs(lead_id,status,updated_at);
