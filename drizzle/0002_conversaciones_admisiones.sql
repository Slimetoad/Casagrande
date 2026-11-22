CREATE TABLE IF NOT EXISTS admissions_phone_identities (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id),
  phone TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admissions_conversations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('resend','retell','twilio')),
  event_id TEXT NOT NULL,
  lead_id TEXT REFERENCES leads(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  kind TEXT NOT NULL CHECK (kind IN ('email','call')),
  subject TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  extraction TEXT NOT NULL DEFAULT '{}',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL CHECK (review_status IN ('linked','unassigned')),
  review_reason TEXT CHECK (review_reason IN ('missing_identity','ambiguous_identity','identity_conflict','identity_unverified','unmatched','irrelevant')),
  content_status TEXT NOT NULL CHECK (content_status IN ('partial','complete')),
  trusted_direct INTEGER NOT NULL DEFAULT 0 CHECK (trusted_direct IN (0,1)),
  created_lead INTEGER NOT NULL DEFAULT 0 CHECK (created_lead IN (0,1)),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  reviewed_by TEXT NOT NULL DEFAULT '',
  mutation_id TEXT,
  CHECK ((review_status='linked' AND lead_id IS NOT NULL AND review_reason IS NULL)
      OR (review_status='unassigned' AND lead_id IS NULL AND review_reason IS NOT NULL)),
  CHECK (trusted_direct=0 OR (provider='resend' AND direction='inbound' AND kind='email' AND contact_email<>'')),
  CHECK (created_lead=0 OR lead_id IS NOT NULL),
  UNIQUE(provider,event_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admissions_conversations_recent ON admissions_conversations(occurred_at DESC,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admissions_conversations_lead ON admissions_conversations(lead_id,occurred_at DESC,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admissions_conversations_review ON admissions_conversations(review_status,occurred_at DESC,id);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS nurture_signal_timeline ON conversation_nurture_signals(lead_id,received_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS nurture_first_direct_reply ON conversation_nurture_signals(lead_id) WHERE transactional=1;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS nurture_jobs_due ON conversation_nurture_jobs(status,due_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS nurture_jobs_lead ON conversation_nurture_jobs(lead_id,status,updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admissions_mail_probes (
  id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL,
  outbound_id TEXT,
  inbound_id TEXT,
  received_at TEXT,
  state TEXT NOT NULL DEFAULT 'preparada'
);
