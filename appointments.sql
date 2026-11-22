CREATE TABLE admissions_slots (
  id TEXT PRIMARY KEY,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes IN (15,20,30,45,60)),
  advisor TEXT NOT NULL,
  advisor_key TEXT NOT NULL,
  cancelled_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX admissions_slots_calendar ON admissions_slots(advisor_key,start_at,end_at);
CREATE TABLE admissions_appointments (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  slot_id TEXT REFERENCES admissions_slots(id),
  program TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  preference TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','booked','cancelled','no_show','completed')),
  manage_hash TEXT NOT NULL UNIQUE,
  intent_hash TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  CHECK ((status NOT IN ('booked','completed','no_show')) OR slot_id IS NOT NULL)
);
CREATE UNIQUE INDEX admissions_one_active_slot ON admissions_appointments(slot_id) WHERE status IN ('booked','completed','no_show');
CREATE UNIQUE INDEX admissions_one_open_program ON admissions_appointments(lead_id,program) WHERE status IN ('booked','requested');
CREATE INDEX admissions_appointments_lead ON admissions_appointments(lead_id,created_at);
