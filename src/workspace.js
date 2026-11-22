const CLOSED = new Set(['Cerrado', 'Matriculado']);
const STAGES = ['Nuevo', 'En orientación', 'En postulación', 'Admitido', 'Matriculado', 'Cerrado'];
const CHECKLIST = [
  ['contacted', 'Orientación o contacto realizado'],
  ['programChosen', 'Programa confirmado con el aspirante'],
  ['documentsReviewed', 'Documentación revisada'],
  ['financingReviewed', 'Inversión y alternativas revisadas'],
  ['enrollmentVerified', 'Matrícula verificada']
];
const OUTCOMES = [
  {key:'no_interes', label:'Ya no tiene interés'},
  {key:'sin_respuesta', label:'Sin respuesta'},
  {key:'pospuesto', label:'Decisión pospuesta'},
  {key:'no_elegible', label:'Requisitos no cumplidos'},
  {key:'otro', label:'Otro motivo'}
];
const TRANSITIONS = {
  'Nuevo': ['En orientación', 'En postulación', 'Cerrado'],
  'En orientación': ['En postulación', 'Nuevo', 'Cerrado'],
  'En postulación': ['Admitido', 'En orientación', 'Cerrado'],
  'Admitido': ['Matriculado', 'En postulación', 'Cerrado'],
  'Matriculado': ['Admitido', 'En postulación'],
  'Cerrado': ['En orientación', 'En postulación']
};
const ACTIVE = "l.stage NOT IN ('Matriculado','Cerrado')";
const REPLIES = `EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id=l.id AND t.status='pendiente' AND (
  t.title='Revisar una nueva consulta del mismo aspirante' OR (${ACTIVE} AND t.title IN
    ('Responder al correo del aspirante','Responder por WhatsApp al aspirante','Llamar al aspirante que solicitó hablar con un asesor'))))`;
const FROM = ' FROM leads l LEFT JOIN admissions_cases c ON c.lead_id=l.id';
const SELECT = `SELECT l.*,c.decision_at,c.blocker,c.checklist,c.outcome,c.admission_evidence_id,c.enrollment_evidence_id,
  EXISTS (SELECT 1 FROM whatsapp_consents w WHERE w.lead_id=l.id AND w.phone=l.phone AND w.state='granted'
    AND NOT EXISTS (SELECT 1 FROM whatsapp_suppressions s WHERE s.phone=w.phone)) whatsapp_consent`;
const QUEUES = [
  ['today', 'Para hoy', `${ACTIVE} AND (datetime(l.due_at)<datetime(?1) OR datetime(c.decision_at)<datetime(?1))`],
  ['overdue', 'Vencidos', `${ACTIVE} AND (datetime(l.due_at)<datetime(?2) OR datetime(c.decision_at)<datetime(?2))`],
  ['replies', 'Respuestas y nuevas consultas', REPLIES],
  ['decision', 'Decisión pendiente', `${ACTIVE} AND (c.decision_at IS NOT NULL OR l.stage='Admitido')`],
  ['blocked', 'Con bloqueos', `(${ACTIVE} AND (COALESCE(c.blocker,'')<>'' OR trim(l.next_action)='' OR l.due_at IS NULL))
    OR (l.stage='Admitido' AND c.admission_evidence_id IS NULL) OR (l.stage='Matriculado' AND c.enrollment_evidence_id IS NULL)`],
  ['unassigned', 'Sin responsable', `${ACTIVE} AND trim(l.owner)=''`],
  ['active', 'Activos', ACTIVE],
  ['closed', 'Finalizados', `NOT (${ACTIVE})`],
  ['all', 'Todos', '1']
];
const CHANGE_FIELDS = ['decisionAt', 'blocker', 'checklist', 'outcome', 'evidence', 'reason'];

export class InputError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const stmt = (db,sql,...values) => values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
const clean = (value,max) => typeof value==='string' ? value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max) : '';
const parse = (text) => {
  if (typeof text !== 'string') return {};
  try { return JSON.parse(text) || {}; } catch { return {}; }
};
const own = (object,field) => Object.hasOwn(object,field);

export async function tableExists(db, name) {
  return !!(await stmt(db,"SELECT 1 AS existing FROM sqlite_master WHERE type='table' AND name=?",name).first());
}

export function dateOrNull(value) {
  if (value===null || value==='') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
    throw new InputError(422,'Ingresa una fecha válida para el seguimiento.');
  }
  const day = value.slice(0,10);
  const check = new Date(day);
  const timestamp = new Date(value.length===10 ? value+'T17:00:00-05:00' : /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : value+'-05:00');
  if (!Number.isFinite(check.valueOf()) || check.toISOString().slice(0,10)!==day || !Number.isFinite(timestamp.valueOf())) {
    throw new InputError(422,'Ingresa una fecha válida para el seguimiento.');
  }
  return timestamp.toISOString();
}

function rowView(row) {
  const checklist = parse(row.checklist);
  const blockers = [];
  if (row.blocker) blockers.push({key:'reported',label:row.blocker});
  if (!CLOSED.has(row.stage) && (!row.next_action || !row.due_at)) blockers.push({key:'next-step',label:'Definir la próxima acción y su fecha'});
  if (row.stage==='Admitido' && !row.admission_evidence_id) blockers.push({key:'unverified-admission',label:'Verificar la decisión de admisión registrada'});
  if (row.stage==='Matriculado' && !row.enrollment_evidence_id) blockers.push({key:'unverified-enrollment',label:'Verificar la matrícula registrada'});
  return {
    case:{
      id:row.id,stage:row.stage,owner:row.owner,program:row.program,revision:row.revision,paused:!!row.paused,
      outcome:row.outcome || null,decisionAt:row.decision_at || null,updatedAt:row.updated_at,
      priority:row.score>=80?'Alta':row.score>=60?'Media':'Normal',score:row.score,note:row.note,source:row.source,
      admissionVerified:!!row.admission_evidence_id,enrollmentVerified:!!row.enrollment_evidence_id
    },
    student:{
      name:row.name,email:row.email,phone:row.phone,
      consentEmail:!!row.consent_email,consentVoice:!!row.consent_voice,consentWhatsapp:!!row.whatsapp_consent
    },
    nextStep:{title:row.next_action,dueAt:row.due_at || null},
    blockers,
    checklist:CHECKLIST.map(([key,label]) => ({key,label,done:key==='enrollmentVerified' ? !!row.enrollment_evidence_id : checklist[key]===true}))
  };
}

export async function workspaceList(db,url) {
  const selected = url.searchParams.get('queue') || 'today';
  const queue = QUEUES.find(([key]) => key===selected);
  const stage = url.searchParams.get('stage') || '';
  if (!queue || (stage && !STAGES.includes(stage))) throw new InputError(422,'Selecciona una cola y una etapa válidas.');
  const now = new Date();
  const localDay = new Date(now.valueOf()-5*3600000);
  localDay.setUTCDate(localDay.getUTCDate()+1);
  const nextDay = localDay.toISOString().slice(0,10)+'T05:00:00.000Z';
  const dateParams = [nextDay,now.toISOString()];
  const q = clean(url.searchParams.get('q'),120);
  const pattern = '%' + q.replace(/[!%_]/g, c => '!' + c) + '%';
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50',10) || 50));
  const offset = Math.min(1000000, Math.max(0, parseInt(url.searchParams.get('offset') || '0',10) || 0));
  const filter = ` WHERE ?1 IS NOT NULL AND ?2 IS NOT NULL AND (${queue[2]})
    AND (?3='' OR l.stage=?3) AND (?4='' OR l.name LIKE ?4 ESCAPE '!' OR l.email LIKE ?4 ESCAPE '!'
      OR l.phone LIKE ?4 ESCAPE '!' OR l.program LIKE ?4 ESCAPE '!' OR l.owner LIKE ?4 ESCAPE '!')`;
  const order = ` ORDER BY (${REPLIES}) DESC,${selected==='decision'?'c.decision_at IS NULL,c.decision_at,':''}
    l.due_at IS NULL, l.due_at, l.score DESC,l.updated_at DESC,l.id`;
  const params = [...dateParams,stage,q?pattern:''];
  const countQueues = QUEUES.map(([key,,condition])=>`COUNT(CASE WHEN ${condition} THEN 1 END) "${key}"`).join(',');
  const [rows,totals,counts,stages] = await db.batch([
    stmt(db,SELECT+FROM+filter+order+' LIMIT ? OFFSET ?',...params,limit,offset),
    stmt(db,'SELECT COUNT(*) n'+FROM+filter,...params),
    stmt(db,`SELECT ${countQueues},
      COUNT(CASE WHEN l.stage='Admitido' AND c.admission_evidence_id IS NOT NULL THEN 1 END) verified_admitted,
      COUNT(CASE WHEN l.stage='Matriculado' AND c.enrollment_evidence_id IS NOT NULL THEN 1 END) verified_enrolled`+FROM,...dateParams),
    stmt(db,'SELECT stage,COUNT(*) n FROM leads GROUP BY stage')
  ]);
  const m = counts.results[0], byStage = Object.fromEntries(STAGES.map(stage=>[stage,0]));
  for (const row of stages.results) byStage[row.stage] = row.n;
  return {
    queue:rows.results.map(rowView),selectedQueue:selected,queues:QUEUES.map(([key,label])=>({key,label,count:m[key]})),
    metrics:{
      total:m.all,active:m.active,enrolled:m.verified_enrolled,verifiedEnrolled:m.verified_enrolled,recordedEnrolled:byStage.Matriculado,
      admitted:byStage.Admitido,verifiedAdmitted:m.verified_admitted,needsDecision:m.decision,overdue:m.overdue,blocked:m.blocked,unassigned:m.unassigned,
      replies:m.replies,byStage
    },
    total:totals.results[0].n,limit,offset
  };
}

export async function workspaceDetail(db,id) {
  const appointmentsEnabled = await tableExists(db,'admissions_appointments') && await tableExists(db,'admissions_slots');
  const statements = [
    stmt(db,SELECT+FROM+' WHERE l.id=?',id),
    stmt(db,'SELECT * FROM events WHERE lead_id=? ORDER BY created_at DESC,rowid DESC LIMIT 250',id),
    stmt(db,"SELECT * FROM tasks WHERE lead_id=? ORDER BY status='pendiente' DESC,due_at,created_at DESC LIMIT 150",id),
    stmt(db,"SELECT id,lead_id,channel,kind,status,due_at,attempts,updated_at,last_error FROM jobs WHERE lead_id=? UNION ALL SELECT id,lead_id,'whatsapp',kind,status,due_at,attempts,updated_at,last_error FROM whatsapp_jobs WHERE lead_id=? ORDER BY due_at",id,id),
    stmt(db,'SELECT program,source,context,created_at FROM lead_submissions WHERE lead_id=? ORDER BY created_at DESC LIMIT 50',id),
    stmt(db,'SELECT * FROM admissions_stage_evidence WHERE lead_id=? ORDER BY recorded_at DESC,rowid DESC LIMIT 100',id)
  ];
  if (appointmentsEnabled) {
    statements.push(stmt(db,`SELECT a.id,a.program,a.status,s.start_at,s.end_at,s.advisor
      FROM admissions_appointments a LEFT JOIN admissions_slots s ON s.id=a.slot_id
      WHERE a.lead_id=? ORDER BY a.created_at DESC LIMIT 50`,id));
  }
  const [lead,events,tasks,jobs,submissions,evidence,appointments] = await db.batch(statements);
  const row = lead.results[0];
  if (!row) throw new InputError(404,'No encontramos ese expediente.');
  return {
    ...rowView(row),
    activity:events.results.map(r=>({id:r.id,leadId:r.lead_id,type:r.type,description:r.description,createdAt:r.created_at,actor:r.actor})),
    tasks:tasks.results.map(r=>({id:r.id,leadId:r.lead_id,title:r.title,status:r.status,dueAt:r.due_at,createdAt:r.created_at})),
    jobs:jobs.results.map(r=>({id:r.id,leadId:r.lead_id,channel:r.channel,kind:r.kind,status:r.status,dueAt:r.due_at,attempts:r.attempts,updatedAt:r.updated_at,lastError:r.last_error})),
    submissions:submissions.results.map(r=>({program:r.program,source:r.source,context:parse(r.context),createdAt:r.created_at})),
    evidence:evidence.results.map(r=>({id:r.id,stage:r.stage,reference:r.reference,recordedAt:r.recorded_at,recordedBy:r.recorded_by,
      current:r.id===row.admission_evidence_id || r.id===row.enrollment_evidence_id})),
    availableActions:TRANSITIONS[row.stage],outcomes:OUTCOMES,
    appointments:appointments?.results.map(r=>({id:r.id,program:r.program,status:r.status,startAt:r.start_at,endAt:r.end_at,advisor:r.advisor})) || []
  };
}

export function hasCaseFields(input) { return CHANGE_FIELDS.some(key=>own(input,key)); }

export async function caseChanges(db,original,stage,input,now,operator) {
  const saved = await stmt(db,'SELECT * FROM admissions_cases WHERE lead_id=?',original.id).first();
  const moved = stage!==original.stage;
  const closing = stage==='Cerrado';
  const reopening = moved && CLOSED.has(original.stage);
  const movingBack = moved && !closing && STAGES.indexOf(stage)<STAGES.indexOf(original.stage);
  const reason = clean(input.reason,600);
  const evidence = clean(input.evidence,300);
  if (own(input,'blocker') && typeof input.blocker!=='string') throw new InputError(422,'Describe el bloqueo pendiente.');
  if (own(input,'evidence') && typeof input.evidence!=='string') throw new InputError(422,'Ingresa una referencia institucional.');
  if (own(input,'reason') && typeof input.reason!=='string') throw new InputError(422,'Describe el motivo del cambio.');
  if (moved && !TRANSITIONS[original.stage].includes(stage)) throw new InputError(422,'Registra primero la etapa anterior en el expediente.');
  if (moved && (closing || reopening || movingBack) && reason.length<3) throw new InputError(422,'Registra el motivo del cierre, reapertura o regreso de etapa.');
  if (moved && ['Admitido','Matriculado'].includes(stage) && !movingBack && evidence.length<3) {
    throw new InputError(422,stage==='Admitido'?'Ingresa la referencia de la decisión de admisión.':'Ingresa la referencia institucional que verifica la matrícula.');
  }
  if (evidence && (!['Admitido','Matriculado'].includes(stage) || evidence.length<3)) throw new InputError(422,'La referencia debe identificar una decisión de admisión o una matrícula.');
  if (own(input,'outcome') && ((!closing && input.outcome!==null && input.outcome!=='' && (stage!=='Matriculado' || input.outcome!=='matriculado')) ||
    (closing && !OUTCOMES.some(outcome=>outcome.key===input.outcome)))) {
    throw new InputError(422,'Selecciona un resultado válido para esta etapa.');
  }

  const activity = [];
  let decisionAt = saved?.decision_at || null;
  if (CLOSED.has(stage) || reopening) decisionAt = null;
  if (!CLOSED.has(stage) && own(input,'decisionAt')) decisionAt = dateOrNull(input.decisionAt);
  if (decisionAt !== (saved?.decision_at || null)) activity.push(['decisión',decisionAt ? 'Fecha de decisión registrada: '+decisionAt.slice(0,10)+'.' : 'Se retiró la fecha de decisión.']);
  const blocker = CLOSED.has(stage) ? '' : own(input,'blocker') ? clean(input.blocker,600) : reopening ? '' : saved?.blocker || '';
  if (blocker !== (saved?.blocker || '')) activity.push(['bloqueo',blocker || 'Bloqueo resuelto.']);
  const outcome = closing ? input.outcome || saved?.outcome || null : stage==='Matriculado' && (evidence || saved?.enrollment_evidence_id) ? 'matriculado' : null;
  if (moved && closing && !OUTCOMES.some(option=>option.key===outcome)) throw new InputError(422,'Selecciona un resultado para cerrar el expediente.');
  if (outcome !== (saved?.outcome || null)) activity.push(['resultado',outcome ? OUTCOMES.find(x=>x.key===outcome)?.label || 'Matrícula verificada.' : 'Se retiró el resultado del proceso.']);
  if (reason) activity.push(['motivo',reason]);

  const checklist = parse(saved?.checklist);
  if (own(input,'checklist')) {
    if (!input.checklist || typeof input.checklist!=='object' || Array.isArray(input.checklist)) throw new InputError(422,'Revisa los datos de la lista de verificación.');
    for (const [key,done] of Object.entries(input.checklist)) {
      const item = CHECKLIST.find(([id])=>id===key);
      if (!item || typeof done!=='boolean') throw new InputError(422,'Revisa los datos de la lista de verificación.');
      if (key==='enrollmentVerified') {
        if (done && (stage!=='Matriculado' || (!evidence && !saved?.enrollment_evidence_id))) throw new InputError(422,'Registra la referencia institucional para verificar la matrícula.');
      } else if ((checklist[key]===true)!==done) {
        checklist[key] = done;
        activity.push(['verificación',item[1]+(done?' · completado.':' · pendiente.')]);
      }
    }
  }

  const keepAdmission = ['Admitido','Matriculado'].includes(stage);
  let admissionId = keepAdmission ? saved?.admission_evidence_id || null : null;
  let enrollmentId = stage==='Matriculado' ? saved?.enrollment_evidence_id || null : null;
  const proofId = evidence && crypto.randomUUID();
  if (proofId) {
    if (stage==='Admitido') admissionId = proofId;
    else enrollmentId = proofId;
    activity.push(['confirmación',stage==='Admitido'?'Se verificó la decisión de admisión.':'Se verificó la referencia institucional de matrícula.']);
  }
  return {
    activity,
    confirmedAdmission:!!proofId && stage==='Admitido' && !saved?.admission_evidence_id,
    statements(marker) {
      const id = original.id;
      const matches = ' EXISTS (SELECT 1 FROM leads WHERE id=? AND mutation_id=?)';
      const sql = [];
      if (proofId) sql.push(stmt(db,'INSERT INTO admissions_stage_evidence(id,lead_id,stage,reference,recorded_at,recorded_by) SELECT ?,?,?,?,?,? WHERE'+matches,proofId,id,stage,evidence,now,operator,id,marker));
      sql.push(stmt(db,`INSERT INTO admissions_cases(lead_id,decision_at,blocker,checklist,outcome,admission_evidence_id,enrollment_evidence_id)
        SELECT ?,?,?,?,?,?,? WHERE${matches} ON CONFLICT(lead_id) DO UPDATE SET decision_at=excluded.decision_at,blocker=excluded.blocker,
        checklist=excluded.checklist,outcome=excluded.outcome,admission_evidence_id=excluded.admission_evidence_id,
        enrollment_evidence_id=excluded.enrollment_evidence_id`,id,decisionAt,blocker,JSON.stringify(checklist),outcome,admissionId,enrollmentId,id,marker));
      return sql;
    }
  };
}
