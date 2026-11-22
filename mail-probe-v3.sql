CREATE TABLE IF NOT EXISTS admissions_mail_probes (
  id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL,
  outbound_id TEXT,
  inbound_id TEXT,
  received_at TEXT,
  state TEXT NOT NULL DEFAULT 'preparada'
);
