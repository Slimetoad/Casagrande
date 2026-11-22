CREATE TABLE IF NOT EXISTS admissions_stage_evidence (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  stage TEXT NOT NULL CHECK (stage IN ('Admitido','Matriculado')),
  reference TEXT NOT NULL CHECK (length(trim(reference)) BETWEEN 3 AND 300),
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS admissions_stage_evidence_lead ON admissions_stage_evidence(lead_id,recorded_at DESC);

CREATE TABLE IF NOT EXISTS admissions_cases (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id),
  decision_at TEXT,
  blocker TEXT NOT NULL DEFAULT '',
  checklist TEXT NOT NULL DEFAULT '{}',
  outcome TEXT CHECK (outcome IN ('matriculado','no_interes','sin_respuesta','pospuesto','no_elegible','otro')),
  admission_evidence_id TEXT REFERENCES admissions_stage_evidence(id),
  enrollment_evidence_id TEXT REFERENCES admissions_stage_evidence(id)
);
CREATE INDEX IF NOT EXISTS admissions_cases_decision ON admissions_cases(decision_at);

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
CREATE INDEX IF NOT EXISTS whatsapp_consents_phone ON whatsapp_consents(phone,state);
CREATE INDEX IF NOT EXISTS leads_phone ON leads(phone) WHERE phone <> '';

CREATE TABLE IF NOT EXISTS whatsapp_suppressions (
  phone TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

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
CREATE INDEX IF NOT EXISTS whatsapp_jobs_due ON whatsapp_jobs(status,due_at);
CREATE INDEX IF NOT EXISTS whatsapp_jobs_phone ON whatsapp_jobs(phone,status);

CREATE TRIGGER IF NOT EXISTS whatsapp_suppress_number
AFTER INSERT ON whatsapp_suppressions
BEGIN
  UPDATE whatsapp_consents SET state='revoked',updated_at=NEW.created_at
  WHERE phone=NEW.phone AND state='granted';
  UPDATE whatsapp_jobs SET status='skipped',last_error='Autorización de WhatsApp retirada',updated_at=NEW.created_at
  WHERE phone=NEW.phone AND status='pending';
END;

CREATE TRIGGER IF NOT EXISTS whatsapp_revoke_consent
AFTER UPDATE OF state ON whatsapp_consents WHEN OLD.state='granted' AND NEW.state='revoked'
BEGIN
  UPDATE whatsapp_jobs SET status='skipped',last_error='Autorización de WhatsApp retirada',updated_at=NEW.updated_at
  WHERE lead_id=NEW.lead_id AND phone=NEW.phone AND status='pending';
END;

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

CREATE TRIGGER IF NOT EXISTS whatsapp_suspend_shared_number
AFTER INSERT ON leads
WHEN NEW.phone<>'' AND EXISTS (SELECT 1 FROM leads l WHERE l.phone=NEW.phone AND l.id<>NEW.id)
BEGIN
  UPDATE whatsapp_jobs SET status='skipped',last_error='El número aparece en varios expedientes',updated_at=NEW.updated_at
  WHERE phone=NEW.phone AND status='pending';
END;
