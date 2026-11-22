import { integrationDashboard } from './integrations.js';
import { InputError, caseChanges, dateOrNull, hasCaseFields, tableExists, workspaceList, workspaceDetail } from './workspace.js';

const STAGES = ['Nuevo', 'En orientación', 'En postulación', 'Admitido', 'Matriculado', 'Cerrado'];
const CLOSED = new Set(['Matriculado', 'Cerrado']);
const CONSENT_VERSION = 'posgrados-2026-11-v1';
const WHATSAPP_CONSENT_VERSION = 'posgrados-whatsapp-2026-11-v1';
const SUCCESS = { ok: true, message: 'Recibimos tu solicitud. El equipo de admisiones podrá revisar tu consulta.' };
const NO_STORE = { 'cache-control': 'no-store, private', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
const WHATSAPP_CHOICE = `EXISTS (SELECT 1 FROM whatsapp_consents w WHERE w.lead_id=leads.id AND w.phone=leads.phone
  AND w.state='granted' AND NOT EXISTS (SELECT 1 FROM whatsapp_suppressions s WHERE s.phone=w.phone)) whatsapp_consent`;
const WA_JOB_COLUMNS = "id,lead_id,'whatsapp' channel,kind,status,due_at,attempts,updated_at,last_error,provider_id,created_at";
const EMAIL_VOICE_JOB_COLUMNS = "id,lead_id,channel,kind,status,due_at,attempts,updated_at,last_error,provider_id,created_at";
const PLAN = {
  'Nuevo': ['Revisar la solicitud de orientación', 24],
  'En orientación': ['Revisar dudas y acordar el siguiente paso', 48],
  'En postulación': ['Revisar los requisitos pendientes con el aspirante', 24],
  'Admitido': ['Confirmar los pasos de matrícula con el aspirante', 24],
  'Matriculado': ['', 0], 'Cerrado': ['', 0]
};

function json(data, status = 200) {
  return Response.json(data, {status, headers: NO_STORE});
}
function problem(status, message) { return json({ok:false, error:message}, status); }
function clean(value, max = 200) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0,max) : '';
}
function hours(isoDate, n) { return new Date(Date.parse(isoDate) + n*3600000).toISOString(); }
function entries(result) { return result?.results || []; }
function stmt(db, sql, ...values) { return db.prepare(sql).bind(...values); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function sha(input) {
  const buffer = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2,'0')).join('');
}
function boundedContext(input, includeAttribution, level = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output = Object.create(null);
  for (const [k,v] of Object.entries(input).slice(0,24)) {
    if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(k) || ['prototype','constructor','__proto__'].includes(k)) continue;
    if (!includeAttribution && (/^utm_/i.test(k) || k.toLowerCase() === 'hubvariant')) continue;
    if (typeof v === 'string') output[k] = clean(v,240);
    else if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) output[k] = v;
    else if (Array.isArray(v)) output[k] = v.slice(0,8).filter(x => typeof x === 'string').map(x => clean(x,120));
    else if (v && typeof v === 'object' && level < 2) output[k] = boundedContext(v,includeAttribution,level+1);
  }
  return output;
}
async function body(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new InputError(415, 'Envía los datos como JSON.');
  if (Number(request.headers.get('content-length')) > 16384) throw new InputError(413,'La solicitud es demasiado extensa.');
  const reader = request.body?.getReader();
  if (!reader) throw new InputError(400,'Faltan los datos de la solicitud.');
  const chunks = []; let size = 0;
  while (true) {
    const {value,done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new InputError(413,'La solicitud es demasiado extensa.'); }
    chunks.push(value);
  }
  let parsed;
  try { parsed = JSON.parse(await new Blob(chunks).text()); } catch { throw new InputError(400,'El contenido de la solicitud no es válido.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new InputError(400,'El contenido de la solicitud no es válido.');
  return parsed;
}
function normalizePhone(value) {
  const raw = clean(value,40);
  if (!raw) return '';
  if (!/^[+0-9()\s.\-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g,'');
  if (/^0[2-9]\d{7,8}$/.test(digits)) digits = '593' + digits.slice(1);
  if (/^00/.test(digits)) digits = digits.slice(2);
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return '+' + digits;
}
function contactIntent(source, context, program) {
  const fields = [source, context.origen, context.tool, context.herramienta, context.action].filter(x=>typeof x === 'string').join(' ').toLowerCase();
  if (/\bcita\b/.test(fields)) return {score:90,action:'Preparar la orientación solicitada',delay:4};
  if (/financ|simula|calcul/.test(fields)) return {score:80, action:'Resolver las dudas de inversión y financiamiento', delay:4};
  if (/postula|matricul/.test(fields)) return {score:90, action:'Acompañar el inicio de la postulación', delay:4};
  if (/quiz|orienta|test/.test(fields)) return {score:65, action:'Revisar el resultado de orientación con el aspirante',delay:12};
  if (program) return {score:60,action:'Revisar la consulta sobre el programa elegido',delay:24};
  return {score:40,action:'Identificar el área de interés del aspirante',delay:24};
}
export async function prepareCapture(request,db,programs) {
  const input = await body(request);
  const name = clean(input.name,120);
  const email = clean(input.email,255).toLowerCase();
  const phone = normalizePhone(input.phone);
  const program = clean(input.program,160);
  const source = clean(input.source,100) || 'Formulario web';
  const includeAttribution = request.headers.get('Sec-GPC') !== '1' && !['1','yes'].includes(request.headers.get('DNT'));
  const context = boundedContext(input.context,includeAttribution);
  const consentEmail = input.consentEmail === true ? 1 : 0;
  const consentVoice = input.consentVoice === true ? 1 : 0;
  const consentWhatsapp = input.consentWhatsapp === true;
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError(422,'Ingresa tu nombre y un correo electrónico válido.');
  if (phone === null || ((consentVoice || consentWhatsapp) && !phone)) throw new InputError(422,'Ingresa un número de teléfono válido.');
  if (program && !programs.some(p => p.slug === program)) throw new InputError(422,'Selecciona un programa del catálogo.');
  if (JSON.stringify(context).length > 7500) throw new InputError(422,'El contexto de la solicitud es demasiado extenso.');
  const now = new Date().toISOString();
  const key = request.headers.get('idempotency-key');
  if (key && !/^[\w.:-]{1,128}$/.test(key)) throw new InputError(400,'La referencia de la solicitud no es válida.');
  // A retry without a client token is deduplicated for the current UTC day.
  const requestKey = await sha(JSON.stringify([email, key || [now.slice(0,10),program,source,context]]));
  const newId = crypto.randomUUID(), receiptId = crypto.randomUUID();
  const prefToken = crypto.randomUUID().replaceAll('-','') + crypto.randomUUID().replaceAll('-','');
  const intent = contactIntent(source,context,program);
  const due = hours(now,intent.delay);
  const sql = [
    stmt(db,'INSERT INTO leads(id,name,email,phone,program,source,next_action,due_at,consent_email,consent_voice,created_at,updated_at,context,pref_token,score) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING',
      newId,name,email,phone,program,source,intent.action,due,consentEmail,consentVoice,now,now,JSON.stringify(context),prefToken,intent.score),
    stmt(db,'INSERT INTO lead_submissions(id,request_key,lead_id,program,source,context,email_choice,voice_choice,consent_version,created_at) SELECT ?,?,id,?,?,?,?,?,?,? FROM leads WHERE email=? ON CONFLICT(request_key) DO NOTHING',
      receiptId,requestKey,program,source,JSON.stringify(context),consentEmail,consentVoice,CONSENT_VERSION,now,email),
    stmt(db,'INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,lead_id,?, ?,?,? FROM lead_submissions WHERE id=?',
      crypto.randomUUID(),'solicitud','Solicitud recibida desde ' + source + (program ? ' · ' + (programs.find(p=>p.slug===program)?.title || program) : '') + '.',now,'Aspirante',receiptId),
    stmt(db,'INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,id,?,?,?,? FROM leads WHERE id=?',crypto.randomUUID(),'preferencias','Preferencias iniciales. Correo: ' + (consentEmail?'autorizado':'sin autorización') + '. Llamada: ' + (consentVoice?'autorizada':'sin autorización') + '.',now,'Aspirante',newId),
    stmt(db,'INSERT INTO tasks(id,lead_id,title,status,due_at,created_at) SELECT ?,id,?,?,?,? FROM leads WHERE id=?',crypto.randomUUID(),intent.action,'pendiente',due,now,newId),
    stmt(db,"INSERT INTO tasks(id,lead_id,title,status,due_at,created_at) SELECT ?,s.lead_id,?,'pendiente',?,? FROM lead_submissions s WHERE s.id=? AND s.lead_id<>? AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id=s.lead_id AND t.status='pendiente' AND t.title=?)",
      crypto.randomUUID(),'Revisar una nueva consulta del mismo aspirante',due,now,receiptId,newId,'Revisar una nueva consulta del mismo aspirante')
  ];
  // New inquiries from an unauthenticated visitor can never change another person's
  // email, phone, consent, stage or scheduled outreach, including after an opt-out.
  const welcomeJobs=[];
  for (const [kind,channel,delay,consent] of [['welcome','email',0,consentEmail],['guidance','email',48,consentEmail],['callback','voice',1,consentVoice]]) {
    if (consent && kind==='welcome') welcomeJobs.push([channel,sql.length]);
    if (consent) sql.push(stmt(db,"INSERT INTO jobs(id,lead_id,kind,channel,status,due_at,created_at,updated_at) SELECT ?,id,?,?,'pending',?,?,? FROM leads WHERE id=?",
      crypto.randomUUID(),kind,channel,hours(now,delay),now,now,newId));
  }
  if (consentWhatsapp) {
    if (!await tableExists(db,'whatsapp_consents')) throw new InputError(503,'El canal de WhatsApp no está disponible. Inténtalo más tarde.');
    sql.push(stmt(db,`INSERT INTO whatsapp_consents(lead_id,phone,state,source,policy_version,created_at,updated_at)
      SELECT id,phone,'granted',?,?,?,? FROM leads WHERE id=? AND phone=?
      AND NOT EXISTS (SELECT 1 FROM whatsapp_suppressions WHERE phone=?)`,source,WHATSAPP_CONSENT_VERSION,now,now,newId,phone,phone));
    sql.push(stmt(db,`INSERT INTO events(id,lead_id,type,description,created_at,actor)
      SELECT ?,lead_id,'preferencias','El aspirante autorizó el seguimiento por WhatsApp para el número registrado.',?,'Aspirante'
      FROM whatsapp_consents WHERE lead_id=? AND phone=?`,crypto.randomUUID(),now,newId,phone));
    welcomeJobs.push(['whatsapp',sql.length]);
    sql.push(whatsappJob(db,newId,'welcome',now,now),whatsappJob(db,newId,'guidance',hours(now,48),now));
  }
  return {statements:sql,leadId:newId,email,welcomeJobs};
}
async function capture(request,db,programs,onLeadCreated) {
  const {statements,welcomeJobs} = await prepareCapture(request,db,programs);
  const results=await db.batch(statements);
  if (onLeadCreated && results[0]?.meta?.changes===1) {
    const channels=welcomeJobs.filter(([,index])=>results[index]?.meta?.changes===1).map(([channel])=>channel);
    if (channels.length) {
      try { onLeadCreated(channels); }
      catch (error) { console.error('admisiones: no se pudo iniciar el seguimiento',error?.name || 'Error'); }
    }
  }
  return json(SUCCESS,201);
}
function whatsappJob(db,id,kind,due,now,marker='') {
  return stmt(db,`INSERT INTO whatsapp_jobs(id,lead_id,phone,kind,status,due_at,created_at,updated_at,last_error)
    SELECT ?,l.id,l.phone,?,CASE WHEN l.paused=1 THEN 'skipped' ELSE 'pending' END,?,?,?,
      CASE WHEN l.paused=1 THEN 'Pausado por admisiones' END FROM leads l
    JOIN whatsapp_consents c ON c.lead_id=l.id AND c.phone=l.phone AND c.state='granted'
    WHERE l.id=? AND (?='' OR l.mutation_id=?)
      AND NOT EXISTS (SELECT 1 FROM whatsapp_suppressions s WHERE s.phone=l.phone)
      AND NOT EXISTS (SELECT 1 FROM leads duplicate WHERE duplicate.phone=l.phone AND duplicate.id<>l.id AND duplicate.phone<>'')
    ON CONFLICT(lead_id,kind,phone) DO UPDATE SET status=excluded.status,due_at=excluded.due_at,
      last_error=CASE WHEN excluded.status='skipped' THEN 'Pausado por admisiones' END,updated_at=excluded.updated_at
    WHERE whatsapp_jobs.status='skipped' AND whatsapp_jobs.attempts=0
      AND whatsapp_jobs.last_error IN ('El expediente cambió de etapa','Proceso de admisión finalizado')`,
    crypto.randomUUID(),kind,due,now,now,id,marker,marker);
}
function leadView(row) {
  let context = {};
  try { context = JSON.parse(row.context); } catch { /* Records from earlier versions can omit context. */ }
  return {id:row.id,name:row.name,email:row.email,phone:row.phone,program:row.program,source:row.source,
    stage:row.stage,owner:row.owner,note:row.note,nextAction:row.next_action,dueAt:row.due_at,
    paused:!!row.paused,consentEmail:!!row.consent_email,consentVoice:!!row.consent_voice,consentWhatsapp:!!row.whatsapp_consent,
    createdAt:row.created_at,updatedAt:row.updated_at,context,score:row.score,
    priority:row.score>=80?'Alta':row.score>=60?'Media':'Normal',revision:row.revision};
}
const taskView = r => ({id:r.id,leadId:r.lead_id,title:r.title,status:r.status,dueAt:r.due_at,createdAt:r.created_at});
const eventView = r => ({id:r.id,leadId:r.lead_id,type:r.type,description:r.description,createdAt:r.created_at,actor:r.actor});
const jobView = r => ({id:r.id,leadId:r.lead_id,channel:r.channel,kind:r.kind,status:r.status,dueAt:r.due_at,attempts:r.attempts,updatedAt:r.updated_at,lastError:r.last_error});
const groupCount = (results,k) => Object.fromEntries(entries(results).map(r=>[r[k],r.n]));
async function dashboard(db,env) {
  const now = new Date().toISOString();
  const modern = await tableExists(db,'admissions_cases');
  const [data,growth] = await Promise.all([
    db.batch([
      db.prepare('SELECT *' + (modern?', '+WHATSAPP_CHOICE:'') + ' FROM leads ORDER BY updated_at DESC,id DESC LIMIT 200'),
      db.prepare("SELECT * FROM tasks ORDER BY status='pendiente' DESC,due_at LIMIT 500"),
      db.prepare('SELECT * FROM events ORDER BY created_at DESC,id DESC LIMIT 500'),
      db.prepare('SELECT ' + EMAIL_VOICE_JOB_COLUMNS + ' FROM jobs' +
        (modern ? ' UNION ALL SELECT ' + WA_JOB_COLUMNS + ' FROM whatsapp_jobs' : '') + ' ORDER BY updated_at DESC,id DESC LIMIT 500'),
      db.prepare('SELECT stage,COUNT(*) n FROM leads GROUP BY stage'),
      db.prepare('SELECT source,COUNT(*) n FROM leads GROUP BY source'),
      stmt(db,"SELECT COUNT(*) open_count,COALESCE(SUM(CASE WHEN due_at < ? THEN 1 ELSE 0 END),0) overdue FROM tasks WHERE status='pendiente'",now),
      db.prepare(modern ? "SELECT COUNT(*) n FROM admissions_cases c JOIN leads l ON l.id=c.lead_id WHERE l.stage='Matriculado' AND c.enrollment_evidence_id IS NOT NULL" : "SELECT COUNT(*) n FROM leads WHERE stage='Matriculado'")
    ]),
    integrationDashboard(env)
  ]);
  const byStage = Object.assign(Object.fromEntries(STAGES.map(k=>[k,0])),groupCount(data[4],'stage'));
  const total = Object.values(byStage).reduce((a,b)=>a+b,0);
  const t = entries(data[6])[0];
  return json({...growth,leads:entries(data[0]).map(leadView),tasks:entries(data[1]).map(taskView),events:entries(data[2]).map(eventView),jobs:entries(data[3]).map(jobView),
    metrics:{total,enrolled:entries(data[7])[0]?.n || 0,recordedEnrolled:byStage.Matriculado,byStage,bySource:groupCount(data[5],'source'),openTasks:t?.open_count || 0,overdueTasks:t?.overdue || 0}});
}
async function listLeads(db,url) {
  const query = clean(url.searchParams.get('q'),120);
  const stage = url.searchParams.get('stage') || '';
  if (stage && !STAGES.includes(stage)) throw new InputError(422,'Selecciona una etapa válida.');
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100',10) || 100));
  const offset = Math.min(1000000, Math.max(0, parseInt(url.searchParams.get('offset') || '0',10) || 0));
  const pattern = '%' + query.replace(/[!%_]/g, c => '!' + c) + '%';
  const filter = " WHERE (?='' OR stage=?) AND (?='' OR name LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!' OR phone LIKE ? ESCAPE '!' OR program LIKE ? ESCAPE '!' OR owner LIKE ? ESCAPE '!')";
  const params = [stage,stage,query,pattern,pattern,pattern,pattern,pattern];
  const modern = await tableExists(db,'admissions_cases');
  const [rows,count] = await db.batch([
    stmt(db,'SELECT *' + (modern?', '+WHATSAPP_CHOICE:'') + ' FROM leads' + filter + ' ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?',...params,limit,offset),
    stmt(db,'SELECT COUNT(*) n FROM leads' + filter,...params)
  ]);
  return json({leads:entries(rows).map(leadView),total:entries(count)[0].n,limit,offset});
}
async function leadDetail(db,id) {
  const modern = await tableExists(db,'admissions_cases');
  const jobQuery = 'SELECT ' + EMAIL_VOICE_JOB_COLUMNS + ' FROM jobs WHERE lead_id=?' +
    (modern ? ' UNION ALL SELECT ' + WA_JOB_COLUMNS + ' FROM whatsapp_jobs WHERE lead_id=?' : '') + ' ORDER BY due_at';
  const [lr,tr,er,jr,sr] = await db.batch([
    stmt(db,'SELECT *' + (modern?', '+WHATSAPP_CHOICE:'') + ' FROM leads WHERE id=?',id),
    stmt(db,'SELECT * FROM tasks WHERE lead_id=? ORDER BY created_at DESC LIMIT 500',id),
    stmt(db,'SELECT * FROM events WHERE lead_id=? ORDER BY created_at DESC, rowid DESC LIMIT 500',id),
    stmt(db,jobQuery,...(modern?[id,id]:[id])),
    stmt(db,'SELECT program,source,context,created_at FROM lead_submissions WHERE lead_id=? ORDER BY created_at DESC LIMIT 50',id)
  ]);
  const row = entries(lr)[0];
  if (!row) throw new InputError(404,'No encontramos ese registro.');
  return json({lead:leadView(row),tasks:entries(tr).map(taskView),events:entries(er).map(eventView),jobs:entries(jr).map(jobView),
    submissions:entries(sr).map(s=>({program:s.program,source:s.source,context:JSON.parse(s.context),createdAt:s.created_at}))});
}
async function updateLead(request,db,id,operator,workspace=false) {
  const input = await body(request);
  const allowed = ['stage','owner','note','nextAction','dueAt','paused'];
  const modern = await tableExists(db,'admissions_cases');
  if (workspace && !modern) throw new InputError(503,'La bandeja de admisiones no está disponible.');
  const caseFields = modern && hasCaseFields(input);
  if (!caseFields && !allowed.some(k=>Object.hasOwn(input,k))) throw new InputError(422,'Indica qué dato quieres actualizar.');
  for (const field of ['owner','note','nextAction']) if (field in input && typeof input[field] !== 'string') throw new InputError(422,'Revisa los campos de texto.');
  if ('paused' in input && typeof input.paused !== 'boolean') throw new InputError(422,'Selecciona un estado de seguimiento válido.');
  const original = await stmt(db,'SELECT *' + (modern?', '+WHATSAPP_CHOICE:'') + ' FROM leads WHERE id=?',id).first();
  if (!original) throw new InputError(404,'No encontramos ese registro.');
  if (workspace && !Number.isInteger(input.revision)) throw new InputError(422,'Abre el expediente antes de guardar los cambios.');
  if ('revision' in input && input.revision !== original.revision) throw new InputError(409,'Este registro cambió. Actualiza la ficha y vuelve a intentarlo.');
  const stage = 'stage' in input ? input.stage : original.stage;
  if (!STAGES.includes(stage)) throw new InputError(422,'Selecciona una etapa válida.');
  const changedStage = original.stage !== stage;
  const paused = 'paused' in input ? Number(input.paused) : original.paused;
  const owner = 'owner' in input ? clean(input.owner,100) : original.owner;
  const note = 'note' in input ? clean(input.note,2000) : original.note;
  const now = new Date().toISOString();
  const [plan,delay] = PLAN[stage];
  const next = CLOSED.has(stage) ? '' : ('nextAction' in input ? clean(input.nextAction,240) : changedStage ? plan : original.next_action);
  const due = !next ? null : ('dueAt' in input ? dateOrNull(input.dueAt) : changedStage || (!original.due_at && next!==original.next_action) ? hours(now,delay) : original.due_at);
  if (modern && !CLOSED.has(stage) && ('nextAction' in input || 'dueAt' in input || changedStage) && (!next || !due)) {
    throw new InputError(422,'Registra una próxima acción y la fecha de seguimiento.');
  }
  const savedCase = modern && (caseFields || changedStage) ? await caseChanges(db,original,stage,input,now,operator) : null;
  const activity = [...(savedCase?.activity || [])];
  if (changedStage) activity.push(['etapa',original.stage + ' → ' + stage + '.']);
  if (owner !== original.owner) activity.push(['asignación',owner ? 'Responsable: ' + owner + '.' : 'Se retiró la asignación de responsable.']);
  if (paused !== original.paused) activity.push(['seguimiento',paused?'Se pausó el seguimiento automático.':'Se reanudó el seguimiento automático.']);
  if (note !== original.note) activity.push(['nota',note || 'Se retiró la nota actual.']);
  if (next !== original.next_action || due !== original.due_at) activity.push(['próxima acción',next ? next + (due ? ' · ' + due.slice(0,10) : '') : 'Sin próxima acción programada.']);
  if (!activity.length) return json(workspace ? {ok:true,...await workspaceDetail(db,id)} : {ok:true,lead:leadView(original)});
  // SQLite changes() cannot guard multiple statements. A unique transaction marker
  // binds every side effect to this exact compare-and-swap, including on concurrent edits.
  const marker = crypto.randomUUID();
  const sql = [
    stmt(db,'UPDATE leads SET stage=?,owner=?,note=?,next_action=?,due_at=?,paused=?,updated_at=?,revision=revision+1,mutation_id=? WHERE id=? AND revision=?',stage,owner,note,next,due,paused,now,marker,id,original.revision)
  ];
  const matches = ' EXISTS (SELECT 1 FROM leads WHERE id=? AND mutation_id=?)';
  for (const [type,description] of activity) sql.push(stmt(db,'INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,?,?,?,?,? WHERE' + matches,crypto.randomUUID(),id,type,description,now,operator,id,marker));
  if (savedCase) sql.push(...savedCase.statements(marker));
  if (changedStage || next !== original.next_action || due !== original.due_at) {
    const closeAll = CLOSED.has(stage) ? 1 : 0;
    sql.push(stmt(db,"UPDATE tasks SET status='hecha' WHERE lead_id=? AND status='pendiente' AND (?=1 OR title=?) AND" + matches,id,closeAll,original.next_action,id,marker));
    if (next) sql.push(stmt(db,"INSERT INTO tasks(id,lead_id,title,status,due_at,created_at) SELECT ?,?,?,'pendiente',?,? WHERE" + matches,crypto.randomUUID(),id,next,due,now,id,marker));
  }
  if ((changedStage || savedCase?.confirmedAdmission) && !CLOSED.has(stage)) {
    const allowedKinds = stage === 'En postulación' ? ['application'] : stage === 'Admitido' ? ['admission'] : ['welcome','guidance','callback'];
    const placeholders = allowedKinds.map(()=>'?').join(',');
    sql.push(stmt(db,"UPDATE jobs SET status='skipped',last_error='El expediente cambió de etapa',updated_at=? WHERE lead_id=? AND kind NOT IN (" + placeholders + ") AND (status='pending' OR (status='skipped' AND last_error='Pausado por admisiones')) AND" + matches,now,id,...allowedKinds,id,marker));
    const milestone = stage === 'En postulación' ? 'application' : stage === 'Admitido' ? 'admission' : null;
    if (milestone) {
      // A human-confirmed milestone gets one relevant email, only with active consent.
      // Re-entering a stage may revive an unsent superseded step, never a sent message.
      sql.push(stmt(db,`INSERT INTO jobs(id,lead_id,channel,kind,status,due_at,created_at,updated_at)
        SELECT ?,id,'email',?,'pending',?,?,? FROM leads WHERE id=? AND mutation_id=? AND consent_email=1
        ON CONFLICT(lead_id,kind,channel) DO UPDATE SET status='pending',due_at=excluded.due_at,last_error=NULL,updated_at=excluded.updated_at
        WHERE jobs.status='skipped' AND jobs.attempts=0 AND jobs.last_error IN ('El expediente cambió de etapa','Proceso de admisión finalizado')`,crypto.randomUUID(),milestone,now,now,now,id,marker));
      if (modern) sql.push(whatsappJob(db,id,milestone,now,now,marker));
    }
  }
  if (CLOSED.has(stage) || paused) {
    const reason = CLOSED.has(stage) ? 'Proceso de admisión finalizado' : 'Pausado por admisiones';
    sql.push(stmt(db,`UPDATE jobs SET status='skipped',last_error=?,updated_at=? WHERE lead_id=?
      AND (status='pending' OR (?=1 AND status='skipped' AND last_error='Pausado por admisiones')) AND`+matches,
    reason,now,id,Number(CLOSED.has(stage)),id,marker));
  } else if (original.paused && !paused) {
    sql.push(stmt(db,`UPDATE jobs SET status='pending',last_error=NULL,updated_at=?,
        due_at=CASE WHEN due_at>=? THEN due_at WHEN kind='guidance' THEN ? WHEN channel='voice' THEN ? ELSE ? END
      WHERE lead_id=? AND status='skipped' AND last_error='Pausado por admisiones' AND attempts=0
      AND ((channel='email' AND ?=1) OR (channel='voice' AND ?=1))
      AND EXISTS (SELECT 1 FROM leads l WHERE l.id=? AND l.mutation_id=? AND
        ((l.stage='En postulación' AND jobs.kind='application') OR (l.stage='Admitido' AND jobs.kind='admission')
          OR (l.stage IN ('Nuevo','En orientación') AND jobs.kind IN ('welcome','guidance','callback'))))`,
    now,now,hours(now,48),hours(now,1),now,id,original.consent_email,original.consent_voice,id,marker));
    if (modern) sql.push(stmt(db,`UPDATE whatsapp_jobs SET status='pending',last_error=NULL,updated_at=?,
        due_at=CASE WHEN due_at>=? THEN due_at WHEN kind='guidance' THEN ? ELSE ? END
      WHERE lead_id=? AND status='skipped' AND last_error='Pausado por admisiones' AND attempts=0
      AND NOT EXISTS (SELECT 1 FROM whatsapp_suppressions s WHERE s.phone=whatsapp_jobs.phone)
      AND NOT EXISTS (SELECT 1 FROM leads duplicate WHERE duplicate.phone=whatsapp_jobs.phone AND duplicate.id<>whatsapp_jobs.lead_id)
      AND EXISTS (SELECT 1 FROM whatsapp_consents c WHERE c.lead_id=whatsapp_jobs.lead_id AND c.phone=whatsapp_jobs.phone AND c.state='granted')
      AND EXISTS (SELECT 1 FROM leads l WHERE l.id=? AND l.mutation_id=? AND l.phone=whatsapp_jobs.phone AND
        ((l.stage='En postulación' AND whatsapp_jobs.kind='application') OR (l.stage='Admitido' AND whatsapp_jobs.kind='admission')
          OR (l.stage IN ('Nuevo','En orientación') AND whatsapp_jobs.kind IN ('welcome','guidance'))))`,now,now,hours(now,48),now,id,id,marker));
  }
  sql.push(stmt(db,'SELECT *' + (modern?', '+WHATSAPP_CHOICE:'') + ' FROM leads WHERE id=?',id));
  const result = await db.batch(sql);
  if (!result[0].meta.changes) throw new InputError(409,'Este registro cambió. Actualiza la ficha y vuelve a intentarlo.');
  return json(workspace ? {ok:true,...await workspaceDetail(db,id)} : {ok:true,lead:leadView(entries(result[result.length-1])[0])});
}
async function updateTask(request,db,id,operator) {
  const {status} = await body(request);
  if (!['pendiente','hecha'].includes(status)) throw new InputError(422,'El estado de la tarea no es válido.');
  const now = new Date().toISOString();
  const modern = await tableExists(db,'admissions_cases');
  const eventId = crypto.randomUUID();
  const allowed = modern && status==='pendiente' ? " AND EXISTS (SELECT 1 FROM leads l WHERE l.id=tasks.lead_id AND l.stage NOT IN ('Cerrado','Matriculado'))" : '';
  const sql = [
    stmt(db,'SELECT t.*,l.stage FROM tasks t JOIN leads l ON l.id=t.lead_id WHERE t.id=?',id),
    stmt(db,"INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,lead_id,'tarea',? || title,?,? FROM tasks WHERE id=? AND status<>?"+allowed,eventId,status === 'hecha'?'Tarea completada: ':'Tarea reabierta: ',now,operator,id,status),
    stmt(db,"UPDATE tasks SET status=? WHERE id=? AND EXISTS (SELECT 1 FROM events WHERE id=?)",status,id,eventId)
  ];
  if (modern) {
    sql.push(stmt(db,`UPDATE leads SET (next_action,due_at)=(SELECT COALESCE(next.title,''),next.due_at FROM
      (SELECT 1) anchor LEFT JOIN (
        SELECT * FROM tasks WHERE lead_id=(SELECT lead_id FROM events WHERE id=?) AND status='pendiente'
        ORDER BY title IN ('Responder al correo del aspirante','Responder por WhatsApp al aspirante','Llamar al aspirante que solicitó hablar con un asesor') DESC,
          due_at IS NULL,due_at,created_at,id LIMIT 1
      ) next),updated_at=?,revision=revision+1
      WHERE id=(SELECT lead_id FROM events WHERE id=?) AND stage NOT IN ('Cerrado','Matriculado')
      AND (next_action='' OR next_action=(SELECT title FROM tasks WHERE id=?))`,eventId,now,eventId,id));
  }
  const [lookup] = await db.batch(sql);
  const task = entries(lookup)[0];
  if (!task) throw new InputError(404,'No encontramos esa tarea.');
  if (modern && status==='pendiente' && CLOSED.has(task.stage)) throw new InputError(422,'Reabre el expediente para continuar con sus tareas.');
  return json({ok:true});
}
function prefPage(token,row,message = '') {
  const box = (field,label,active) => '<label><input type="checkbox" name="' + field + '" value="1"' + (active?' checked':' disabled') + '> ' + label + (active?'':' · desactivado') + '</label>';
  const html = '<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Mis preferencias de contacto | Posgrados UCG</title><style>body{margin:0;background:#f4f5f2;color:#172a24;font:17px/1.6 system-ui,sans-serif}main{max-width:34rem;margin:8vh auto;padding:2rem;background:white;border-top:5px solid #075a48}h1{line-height:1.15;font-size:2.2rem}label{display:block;padding:.7rem 0}input{width:1.15rem;height:1.15rem;vertical-align:middle}button{display:block;margin-top:1.3rem;background:#173f35;color:white;border:0;padding:.8rem 1.2rem;font:inherit;border-radius:.4rem}a{color:#173f35}small{display:block;color:#43534d}</style></head><body><main><small>Universidad Casa Grande · Posgrados</small><h1>Mis preferencias de contacto</h1>' +
    (message?'<p role="status">'+escapeHtml(message)+'</p>':'') + '<p>Desmarca los canales que deseas desactivar para el seguimiento automatizado de admisiones.</p><form method="post" action="/preferencias/'+escapeHtml(token)+'">'+
    box('email','Correo electrónico',row.consent_email)+box('voice','Llamadas',row.consent_voice)+
    (Object.hasOwn(row,'whatsapp_consent') ? box('whatsapp','WhatsApp',row.whatsapp_consent) : '')+
    '<button type="submit">Guardar preferencias</button></form><p><a href="/">Volver a posgrados</a></p></main></body></html>';
  return new Response(html,{headers:{...NO_STORE,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
async function preferences(request,db,token,oneClick) {
  const whatsapp = await tableExists(db,'whatsapp_consents');
  const fieldsSQL = 'consent_email,consent_voice' + (whatsapp?', '+WHATSAPP_CHOICE:'');
  const row = await stmt(db,'SELECT id,'+fieldsSQL+' FROM leads WHERE pref_token=?',token).first();
  if (!row) throw new InputError(404,'El enlace de preferencias no es válido.');
  if (request.method === 'GET' && !oneClick) return prefPage(token,row);
  if (request.method !== 'POST') return problem(405,'Método no permitido.');
  let keepEmail = 0, keepVoice = 1, keepWhatsapp = 1;
  if (!oneClick) {
    if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type')||'')) throw new InputError(415,'El formato del formulario no es válido.');
    if (Number(request.headers.get('content-length')) > 2048) throw new InputError(413,'El formulario es demasiado extenso.');
    const payload = await request.text();
    if (payload.length > 2048) throw new InputError(413,'El formulario es demasiado extenso.');
    const fields = new URLSearchParams(payload);
    keepEmail = fields.get('email') === '1' ? 1 : 0;
    keepVoice = fields.get('voice') === '1' ? 1 : 0;
    keepWhatsapp = fields.get('whatsapp') === '1' ? 1 : 0;
  }
  const now = new Date().toISOString();
  const sql = [
    stmt(db,"INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,id,'preferencias',?,?,'Aspirante' FROM leads WHERE id=? AND ((consent_email=1 AND ?=0) OR (consent_voice=1 AND ?=0))",crypto.randomUUID(),oneClick?'Se retiró la autorización de correo electrónico.':'El aspirante actualizó sus preferencias de contacto.',now,row.id,keepEmail,keepVoice),
    stmt(db,'UPDATE leads SET consent_email=MIN(consent_email,?),consent_voice=MIN(consent_voice,?),updated_at=?,revision=revision+1 WHERE id=? AND ((consent_email=1 AND ?=0) OR (consent_voice=1 AND ?=0))',keepEmail,keepVoice,now,row.id,keepEmail,keepVoice),
    stmt(db,"UPDATE jobs SET status='skipped',last_error='Autorización retirada',updated_at=? WHERE lead_id=? AND status='pending' AND ((channel='email' AND ?=0) OR (channel='voice' AND ?=0))",now,row.id,keepEmail,keepVoice)
  ];
  if (whatsapp && !keepWhatsapp) {
    const consent = `FROM leads l JOIN whatsapp_consents c ON c.lead_id=l.id AND c.phone=l.phone AND c.state='granted'
      WHERE l.id=? AND NOT EXISTS (SELECT 1 FROM whatsapp_suppressions s WHERE s.phone=l.phone)`;
    sql.push(stmt(db,`INSERT INTO events(id,lead_id,type,description,created_at,actor)
      SELECT ?,l.id,'preferencias','El aspirante retiró la autorización de WhatsApp para el número registrado.',?,'Aspirante' ${consent}`,crypto.randomUUID(),now,row.id));
    sql.push(stmt(db,`INSERT INTO whatsapp_suppressions(phone,created_at) SELECT l.phone,? ${consent} ON CONFLICT(phone) DO NOTHING`,now,row.id));
  }
  sql.push(stmt(db,'SELECT '+fieldsSQL+' FROM leads WHERE id=?',row.id));
  const results = await db.batch(sql);
  return oneClick ? json({ok:true,message:'Desactivamos el envío de correos.'}) : prefPage(token,entries(results.at(-1))[0],'Guardamos tus preferencias.');
}

export async function handleAdmissions(request,env,url,programs,operator,onLeadCreated=undefined) {
  const path = url.pathname.replace(/\/$/,'');
  const staff = /^\/api\/staff\/(dashboard|leads(?:\/[^/]+)?|tasks\/[^/]+|workspace(?:\/[^/]+)?)$/.test(path);
  const pref = path.match(/^\/(preferencias|api\/preferences)\/([a-f0-9]{64})$/);
  if (!staff && path !== '/api/leads' && !pref) return null;
  if (staff && !operator) return problem(403,'Inicia sesión como integrante del equipo de admisiones.');
  if (request.method !== 'GET' && request.headers.has('origin') && request.headers.get('origin') !== url.origin) return problem(403,'El origen de la solicitud no está permitido.');
  if (!env.DB) return problem(503,'El servicio de admisiones no está disponible. Inténtalo más tarde.');
  try {
    if (pref) return await preferences(request,env.DB,pref[2],pref[1]==='api/preferences');
    if (path === '/api/leads' && request.method === 'POST') return await capture(request,env.DB,programs,onLeadCreated);
    if (path === '/api/staff/dashboard' && request.method === 'GET') return await dashboard(env.DB,env);
    if (path === '/api/staff/workspace' && request.method === 'GET') {
      if (!await tableExists(env.DB,'admissions_cases')) throw new InputError(503,'La bandeja de admisiones no está disponible.');
      return json(await workspaceList(env.DB,url));
    }
    const workspace = path.match(/^\/api\/staff\/workspace\/([^/]+)$/);
    if (workspace && request.method === 'GET') {
      if (!await tableExists(env.DB,'admissions_cases')) throw new InputError(503,'La bandeja de admisiones no está disponible.');
      return json(await workspaceDetail(env.DB,workspace[1]));
    }
    if (workspace && ['POST','PATCH'].includes(request.method)) return await updateLead(request,env.DB,workspace[1],operator,true);
    if (path === '/api/staff/leads' && request.method === 'GET') return await listLeads(env.DB,url);
    const record = path.match(/^\/api\/staff\/leads\/([^/]+)$/);
    if (record && request.method === 'GET') return await leadDetail(env.DB,record[1]);
    if (record && request.method === 'POST') return await updateLead(request,env.DB,record[1],operator);
    const task = path.match(/^\/api\/staff\/tasks\/([^/]+)$/);
    if (task && request.method === 'POST') return await updateTask(request,env.DB,task[1],operator);
    return problem(405,'Método no permitido.');
  } catch (error) {
    if (error instanceof InputError) return problem(error.status,error.message);
    // Server logs contain a category only. Submitted contact details stay in D1.
    console.error('admisiones: almacenamiento no disponible',error?.name || 'Error');
    return problem(503,'No pudimos completar la operación. Inténtalo de nuevo.');
  }
}
