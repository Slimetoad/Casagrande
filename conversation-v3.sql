CREATE TABLE IF NOT EXISTS admissions_phone_identities (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id),
  phone TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

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
CREATE INDEX IF NOT EXISTS admissions_conversations_recent ON admissions_conversations(occurred_at DESC,id);
CREATE INDEX IF NOT EXISTS admissions_conversations_lead ON admissions_conversations(lead_id,occurred_at DESC,id);
CREATE INDEX IF NOT EXISTS admissions_conversations_review ON admissions_conversations(review_status,occurred_at DESC,id);
