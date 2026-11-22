CREATE TABLE IF NOT EXISTS admissions_stage_evidence (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  stage TEXT NOT NULL CHECK (stage IN ('Admitido','Matriculado')),
  reference TEXT NOT NULL CHECK (length(trim(reference)) BETWEEN 3 AND 300),
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admissions_stage_evidence_lead ON admissions_stage_evidence(lead_id,recorded_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admissions_cases (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id),
  decision_at TEXT,
  blocker TEXT NOT NULL DEFAULT '',
  checklist TEXT NOT NULL DEFAULT '{}',
  outcome TEXT CHECK (outcome IN ('matriculado','no_interes','sin_respuesta','pospuesto','no_elegible','otro')),
  admission_evidence_id TEXT REFERENCES admissions_stage_evidence(id),
  enrollment_evidence_id TEXT REFERENCES admissions_stage_evidence(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admissions_cases_decision ON admissions_cases(decision_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS whatsapp_consents (
  lead_id TEXT NOT NULL REFERENCES leads(id),
  phone TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('granted','revoked')),
  source TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(lead_id,phone)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS whatsapp_consents_phone ON whatsapp_consents(phone,state);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leads_phone ON leads(phone) WHERE phone <> '';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS whatsapp_suppressions (
  phone TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS whatsapp_jobs (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  phone TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('welcome','guidance','application','admission')),
  status TEXT NOT NULL CHECK (status IN ('pending','processing','sent','failed','skipped','uncertain')),
  due_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT,
  provider_id TEXT,
  UNIQUE(lead_id,kind,phone)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS whatsapp_jobs_due ON whatsapp_jobs(status,due_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS whatsapp_jobs_phone ON whatsapp_jobs(phone,status);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS whatsapp_suppress_number
AFTER INSERT ON whatsapp_suppressions
BEGIN
  UPDATE whatsapp_consents SET state='revoked',updated_at=NEW.created_at
  WHERE phone=NEW.phone AND state='granted';
  UPDATE whatsapp_jobs SET status='skipped',last_error='Autorización de WhatsApp retirada',updated_at=NEW.created_at
  WHERE phone=NEW.phone AND status='pending';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS whatsapp_revoke_consent
AFTER UPDATE OF state ON whatsapp_consents WHEN OLD.state='granted' AND NEW.state='revoked'
BEGIN
  UPDATE whatsapp_jobs SET status='skipped',last_error='Autorización de WhatsApp retirada',updated_at=NEW.updated_at
  WHERE lead_id=NEW.lead_id AND phone=NEW.phone AND status='pending';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS whatsapp_suspend_changed_lead
AFTER UPDATE OF phone,stage,paused ON leads
WHEN OLD.phone<>NEW.phone OR OLD.stage<>NEW.stage OR OLD.paused<>NEW.paused
BEGIN
  UPDATE whatsapp_jobs SET status='skipped',
    last_error=CASE
      WHEN phone<>NEW.phone THEN 'El número del expediente cambió'
      WHEN NEW.stage IN ('Cerrado','Matriculado') THEN 'Proceso de admisión finalizado'
      WHEN (NEW.stage='En postulación' AND kind<>'application') OR (NEW.stage='Admitido' AND kind<>'admission')
        OR (NEW.stage IN ('Nuevo','En orientación') AND kind NOT IN ('welcome','guidance')) THEN 'El expediente cambió de etapa'
      WHEN NEW.next_action IN ('Responder al correo del aspirante','Responder por WhatsApp al aspirante','Llamar al aspirante que solicitó hablar con un asesor') THEN 'El aspirante respondió'
      ELSE 'Pausado por admisiones' END,
    updated_at=NEW.updated_at
  WHERE lead_id=NEW.id AND (
    status='pending' OR (status='skipped' AND last_error='Pausado por admisiones')
  ) AND (
    phone<>NEW.phone OR NEW.stage IN ('Cerrado','Matriculado') OR NEW.paused=1
    OR (NEW.stage='En postulación' AND kind<>'application') OR (NEW.stage='Admitido' AND kind<>'admission')
    OR (NEW.stage IN ('Nuevo','En orientación') AND kind NOT IN ('welcome','guidance'))
  );
  UPDATE whatsapp_jobs SET status='skipped',last_error='El número aparece en varios expedientes',updated_at=NEW.updated_at
  WHERE OLD.phone<>NEW.phone AND phone=NEW.phone AND status='pending'
    AND EXISTS (SELECT 1 FROM leads l WHERE l.phone=NEW.phone AND l.id<>NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS whatsapp_suspend_shared_number
AFTER INSERT ON leads
WHEN NEW.phone<>'' AND EXISTS (SELECT 1 FROM leads l WHERE l.phone=NEW.phone AND l.id<>NEW.id)
BEGIN
  UPDATE whatsapp_jobs SET status='skipped',last_error='El número aparece en varios expedientes',updated_at=NEW.updated_at
  WHERE phone=NEW.phone AND status='pending';
END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS channel_dispatches (
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp','retell')),
  job_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  account TEXT NOT NULL,
  sender TEXT NOT NULL,
  version TEXT NOT NULL,
  state_rank INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider,job_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS voice_suppressions (
  phone TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jobs_provider_ref ON jobs(provider_id) WHERE provider_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS whatsapp_jobs_provider_ref ON whatsapp_jobs(provider_id) WHERE provider_id IS NOT NULL;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX admissions_slots_calendar ON admissions_slots(advisor_key,start_at,end_at);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE UNIQUE INDEX admissions_one_active_slot ON admissions_appointments(slot_id) WHERE status IN ('booked','completed','no_show');
--> statement-breakpoint
CREATE UNIQUE INDEX admissions_one_open_program ON admissions_appointments(lead_id,program) WHERE status IN ('booked','requested');
--> statement-breakpoint
CREATE INDEX admissions_appointments_lead ON admissions_appointments(lead_id,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_audit (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('expediente','campaña')),
  subject TEXT NOT NULL,
  actor TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('en_curso','aplicado','fallo','desactualizado')),
  chosen TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_audit_budget ON intelligence_audit(scope,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_campaigns (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE,
  program TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('propuesta','aprobada','activa','cerrada','descartada')),
  brief TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  measured_at TEXT,
  baseline_program_leads INTEGER,
  lead_count INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  enrolled_count INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_campaigns_review ON intelligence_campaigns(state,measured_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_campaign_history (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES intelligence_campaigns(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_campaign_history_campaign ON intelligence_campaign_history(campaign_id,at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_submissions_window ON lead_submissions(created_at,program,lead_id);
--> statement-breakpoint
CREATE TABLE admissions_hub_counts (
  day TEXT NOT NULL, program TEXT NOT NULL, event TEXT NOT NULL, variant TEXT NOT NULL,
  total INTEGER NOT NULL, PRIMARY KEY(day,program,event,variant)
);
