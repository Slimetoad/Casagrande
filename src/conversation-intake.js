import { contactEmail, isPhoneIdentity, opaquePhoneIdentity } from './contact-identity.js';
import { extractConversationFacts, redactConversationLine } from './conversation-extraction.js';
import { channelPhone, digest, inHours } from './providers.js';
import { programs as catalog } from './catalog.js';
import { tableExists } from './workspace.js';

export { extractConversationFacts };
const stmt = (db,sql,...args) => args.length ? db.prepare(sql).bind(...args) : db.prepare(sql);
const first = (db,sql,...args) => stmt(db,sql,...args).first();
const now = () => new Date().toISOString();
const intakeStep = 'Revisar la conversación y acordar el siguiente paso';
const providers = {resend:'email',retell:'call',twilio:'call'};
const reviewLabel = {
  missing_identity:'Falta un identificador de contacto.',
  ambiguous_identity:'El contacto coincide con varios expedientes.',
  identity_conflict:'Los identificadores apuntan a expedientes diferentes.',
  identity_unverified:'El proveedor no pudo acreditar al remitente.',
  unmatched:'No encontramos un expediente asociado.',
  irrelevant:'La conversación requiere clasificación manual.'
};
const validId = value => typeof value==='string' && /^[\w.:+=/-]{1,240}$/.test(value);
const leadKey = value => typeof value==='string' && /^[\w.-]{1,100}$/.test(value);
const cleanContact = (value,max) => typeof value==='string' ? value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>]/g,' ').trim().slice(0,max) : '';
const validEmail = value => typeof value==='string' && value.length<=254 && /^[^<>@\s,;]+@[^<>@\s,;]+\.[^<>@\s,;]+$/.test(value) ? value.toLowerCase() : '';
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const problem = (status,error) => json({error},status);
const recent = `SELECT c.*,l.name AS lead_name,l.stage AS lead_stage,l.program AS lead_program
  FROM admissions_conversations c LEFT JOIN leads l ON l.id=c.lead_id`;

export async function conversationIntakeReady(db) {
  return !!db && await tableExists(db,'admissions_conversations');
}

async function identity(db,contact,allowCreate) {
  if (contact.forceReview) return {reason:'identity_unverified'};
  const {leadId,email,phone} = contact;
  if (!leadId && !email && !phone) return {reason:'missing_identity'};
  const sql = [];
  if (leadId) sql.push(stmt(db,'SELECT id,email,phone FROM leads WHERE id=?',leadId));
  if (email) sql.push(stmt(db,'SELECT id,email,phone FROM leads WHERE email=?',email));
  if (phone) sql.push(stmt(db,'SELECT id,email,phone FROM leads WHERE phone=? ORDER BY id LIMIT 2',phone));
  const results = await db.batch(sql);
  let offset = 0;
  const linked = leadId ? results[offset++].results[0] : null;
  const byEmail = email ? results[offset++].results[0] : null;
  const byPhone = phone ? results[offset].results : [];
  if (leadId && !linked) return {reason:'unmatched'};
  if (!linked && byPhone.length>1) return {reason:'ambiguous_identity'};
  const known = linked || byEmail || byPhone[0];
  if (!known) return allowCreate ? {create:true} : {reason:'unmatched'};
  const different = (byEmail && byEmail.id!==known.id) || (byPhone.length===1 && byPhone[0].id!==known.id);
  const conflicts = email && !isPhoneIdentity(known.email) && known.email.toLowerCase()!==email ||
    phone && known.phone && channelPhone(known.phone)!==phone;
  if (different || conflicts) return {reason:'identity_conflict'};
  return {leadId:known.id,upgradeEmail:allowCreate && email && phone && byPhone.length===1 && isPhoneIdentity(known.email) ? email : ''};
}

function eventTime(value) {
  const parsed = typeof value==='string' ? Date.parse(value) : typeof value==='number' ? value : NaN;
  return Number.isFinite(parsed) && parsed>=0 && parsed<=Date.now()+300000 ? new Date(parsed).toISOString() : now();
}

function extracted(value) {
  try { return JSON.parse(value); } catch { return {}; }
}

function view(r) {
  return {
    id:r.id,leadId:r.lead_id,provider:r.provider,direction:r.direction,kind:r.kind,subject:r.subject,excerpt:r.excerpt,
    extraction:extracted(r.extraction),reviewStatus:r.review_status,reviewReason:r.review_reason || null,
    reviewLabel:reviewLabel[r.review_reason] || '',contentStatus:r.content_status,
    occurredAt:r.occurred_at,updatedAt:r.updated_at,revision:r.revision,
    contact:{name:r.contact_name,email:contactEmail(r.contact_email),phone:r.contact_phone},
    lead:r.lead_id ? {id:r.lead_id,name:r.lead_name,program:r.lead_program,stage:r.lead_stage} : null
  };
}

function linkEvent(db,id,actor) {
  return stmt(db,`INSERT INTO events(id,lead_id,type,description,created_at,actor)
    SELECT 'conversacion:'||id,lead_id,'conversación',
      CASE WHEN kind='email' THEN 'Correo' ELSE 'Llamada' END||CASE WHEN direction='inbound' THEN ' entrante' ELSE ' saliente' END||' registrada en la bandeja.',
      occurred_at,? FROM admissions_conversations WHERE id=? AND lead_id IS NOT NULL
    ON CONFLICT(id) DO NOTHING`,actor,id);
}

function newLeadStatements(db,selected,contact,facts,details,gate,args) {
  const {date,occurred,kind} = details;
  const {email,phone,name} = contact;
  const id = selected.leadId;
  const address = email || opaquePhoneIdentity(id);
  const source = kind==='email' ? 'Correo entrante' : 'Llamada entrante';
  const pref = crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  const sql = [
    stmt(db,`INSERT INTO leads(id,name,email,phone,program,source,next_action,due_at,created_at,updated_at,pref_token,score)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate}
      AND (?='' OR NOT EXISTS(SELECT 1 FROM leads WHERE phone=?))
      ON CONFLICT(email) DO NOTHING`,id,name || (kind==='email'?'Aspirante por correo':'Aspirante por teléfono'),address,
    phone,facts.program || '',source,intakeStep,inHours(4),occurred,date,pref, facts.confidence==='alta'?65:40,...args,phone,phone)
  ];
  if (!email) sql.push(stmt(db,`INSERT INTO admissions_phone_identities(lead_id,phone,created_at)
    SELECT id,phone,? FROM leads WHERE id=? ON CONFLICT(lead_id) DO NOTHING`,date,id));
  return sql;
}

async function storeConversation(env,input,contact,analysis,eventId) {
  const db = env.DB;
  const {provider,direction,kind} = input;
  const contentStatus = input.complete===false ? 'partial' : 'complete';
  const date = now(), occurred = eventTime(input.occurredAt);
  const args = [provider,eventId];
  const find = () => first(db,'SELECT * FROM admissions_conversations WHERE provider=? AND event_id=?',...args);
  const id = crypto.randomUUID();
  const {excerpt,...facts} = analysis;
  for (let retry=0;retry<3;retry++) {
    const previous = await find();
    if (previous && (previous.content_status==='complete' || contentStatus==='partial' || previous.kind!==kind || previous.direction!==direction)) {
      return {row:previous,duplicate:true};
    }
    const immutableReview = previous?.review_reason==='identity_unverified';
    const contradicts = previous && (previous.contact_email && contact.email && previous.contact_email!==contact.email ||
      previous.contact_phone && contact.phone && previous.contact_phone!==contact.phone ||
      previous.lead_id && contact.leadId && previous.lead_id!==contact.leadId);
    if (contradicts || (previous?.lead_id && contact.forceReview)) return {row:previous,duplicate:true};
    const selected = previous?.lead_id ? {leadId:previous.lead_id}
      : immutableReview ? {reason:'identity_unverified'}
      : await identity(db,contact,direction==='inbound' && input.allowCreate===true && !input.forceReview && contentStatus==='complete' &&
          facts.intent!=='baja' && (facts.intent!=='desconocido' || !!facts.program));
    if (selected.create) selected.leadId = crypto.randomUUID();
    if (selected.reason==='unmatched' && input.allowCreate===true && facts.intent==='desconocido' && !facts.program) selected.reason='irrelevant';
    const gate = previous
      ? "EXISTS (SELECT 1 FROM admissions_conversations WHERE provider=? AND event_id=? AND content_status='partial' AND revision=?)"
      : 'NOT EXISTS (SELECT 1 FROM admissions_conversations WHERE provider=? AND event_id=?)';
    const gateArgs = previous ? [...args,previous.revision] : args;
    const sql = [];
    if (selected.create) sql.push(...newLeadStatements(db,selected,contact,facts,{date,occurred,kind},gate,gateArgs));
    if (selected.upgradeEmail) {
      sql.push(stmt(db,`UPDATE leads SET email=?,updated_at=?,revision=revision+1
        WHERE id=? AND email=? AND phone=? AND NOT EXISTS(SELECT 1 FROM leads WHERE email=?) AND ${gate}`,
      selected.upgradeEmail,date,selected.leadId,opaquePhoneIdentity(selected.leadId),contact.phone,selected.upgradeEmail,...gateArgs));
      sql.push(stmt(db,`DELETE FROM admissions_phone_identities WHERE lead_id=?
        AND EXISTS(SELECT 1 FROM leads WHERE id=? AND email=?) AND ${gate}`,selected.leadId,selected.leadId,selected.upgradeEmail,...gateArgs));
    }
    const leadId = selected.leadId || null, rowId = previous?.id || id;
    const exists = `(? IS NULL OR EXISTS(SELECT 1 FROM leads WHERE id=? AND (?='' OR email=?)))`;
    const upgrade = selected.upgradeEmail || '';
    const linkGate = [leadId,leadId,upgrade,upgrade];
    const protectedReview = contact.forceReview || immutableReview;
    const subject = protectedReview ? 'Remitente sin verificar' : redactConversationLine(input.subject,200);
    const content = protectedReview ? extractConversationFacts({},[]) : facts;
    const excerptText = protectedReview ? '' : excerpt;
    const contactValues = [contact.name,contact.email,contact.phone].map(value=>protectedReview?'':value);
    const status = leadId?'linked':'unassigned';
    const reason = leadId?null:selected.reason;
    const trustedDirect = Number(!protectedReview && input.trustedDirect===true && direction==='inbound' && provider==='resend' && !!contact.email);
    const createdLead = Number(!!selected.create || previous?.created_lead===1);
    const writeIndex = sql.length;
    if (previous) {
      sql.push(stmt(db,`UPDATE admissions_conversations SET lead_id=?,direction=?,kind=?,subject=?,excerpt=?,extraction=?,
        contact_name=COALESCE(NULLIF(contact_name,''),?),contact_email=COALESCE(NULLIF(contact_email,''),?),
        contact_phone=COALESCE(NULLIF(contact_phone,''),?),review_status=?,review_reason=?,content_status=?,
        trusted_direct=MAX(trusted_direct,?),created_lead=?,updated_at=?,revision=revision+1
        WHERE id=? AND revision=? AND content_status='partial' AND ${exists}`,
      leadId,direction,kind,subject || previous.subject,excerptText,JSON.stringify(content),...contactValues,status,reason,contentStatus,
      trustedDirect,createdLead,date,rowId,previous.revision,...linkGate));
    } else {
      sql.push(stmt(db,`INSERT INTO admissions_conversations(id,provider,event_id,lead_id,direction,kind,subject,excerpt,extraction,
        contact_name,contact_email,contact_phone,review_status,review_reason,content_status,trusted_direct,created_lead,occurred_at,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${exists} ON CONFLICT(provider,event_id) DO NOTHING`,
      rowId,provider,eventId,leadId,direction,kind,subject,excerptText,JSON.stringify(content),...contactValues,status,reason,contentStatus,
      trustedDirect,createdLead,occurred,date,date,...linkGate));
    }
    sql.push(linkEvent(db,rowId,kind==='email'?'Correo':'Voz'));
    sql.push(stmt(db,'SELECT * FROM admissions_conversations WHERE provider=? AND event_id=?',...args));
    const results = await db.batch(sql);
    const row = results.at(-1).results[0];
    if (row && (results[writeIndex].meta.changes || row.content_status==='complete')) return {row,duplicate:!results[writeIndex].meta.changes};
  }
  throw new Error('No pudimos conciliar la conversación.');
}

/** Call only from verified provider webhooks and use identity metadata from the verified envelope. */
export async function ingestConversation(env,input) {
  if (!Object.hasOwn(providers,input.provider) || providers[input.provider]!==input.kind ||
    !['inbound','outbound'].includes(input.direction) || !validId(input.eventId)) throw new TypeError('Conversación no válida.');
  if (!await conversationIntakeReady(env.DB)) return {unavailable:true};
  const contact = {
    leadId:input.forceReview?null:leadKey(input.leadId)?input.leadId:null,
    email:input.forceReview?'':validEmail(input.email),
    phone:input.forceReview?'':channelPhone(input.phone),
    name:input.forceReview?'':redactConversationLine(cleanContact(input.name,120),120),
    forceReview:input.forceReview===true
  };
  const eventId = await digest(input.eventId);
  const analysis = extractConversationFacts(input,catalog);
  const {row,duplicate} = await storeConversation(env,input,contact,analysis,eventId);
  const extraction = extracted(row.extraction);
  const result = {id:row.id,leadId:row.lead_id,reviewStatus:row.review_status,reviewReason:row.review_reason,
    duplicate,kind:row.kind,direction:row.direction,contentStatus:row.content_status,occurredAt:row.occurred_at,
    trustedDirect:row.trusted_direct===1,createdLead:row.created_lead===1,extraction};
  if (row.lead_id && row.direction==='inbound' && row.content_status==='complete' && row.reviewed_by==='') {
    const {recordNurtureSignal} = await import('./conversation-nurture.js');
    result.nurture = await recordNurtureSignal(env,{id:row.id,leadId:row.lead_id,
      channel:row.kind==='email'?'email':'voice',receivedAt:row.occurred_at,extraction,
      trustedDirect:result.trustedDirect,createdLead:result.createdLead});
    try { env.onConversationRecorded?.(); } catch { console.error('admisiones: no se activó el seguimiento inmediato de la conversación'); }
  }
  return result;
}

async function conversationsList(db,url) {
  const leadId = url.searchParams.get('leadId') || '';
  const status = url.searchParams.get('status') || 'all';
  if ((leadId && !leadKey(leadId)) || !['unassigned','linked','all'].includes(status)) return problem(422,'Selecciona un filtro de conversación válido.');
  const limit = Math.min(100,Math.max(1,parseInt(url.searchParams.get('limit') || '30',10)||30));
  const offset = Math.min(100000,Math.max(0,parseInt(url.searchParams.get('offset') || '0',10)||0));
  const filter = " WHERE (?1='' OR c.lead_id=?1) AND (?2='all' OR c.review_status=?2)";
  const [list,count,unassigned] = await db.batch([
    stmt(db,recent+filter+' ORDER BY c.occurred_at DESC,c.id LIMIT ? OFFSET ?',leadId,status,limit,offset),
    stmt(db,'SELECT COUNT(*) n FROM admissions_conversations c'+filter,leadId,status),
    stmt(db,"SELECT COUNT(*) n FROM admissions_conversations WHERE review_status='unassigned'")
  ]);
  return json({conversations:list.results.map(view),total:count.results[0].n,unassigned:unassigned.results[0].n,limit,offset});
}

async function assignConversation(request,db,id,operator) {
  let input;
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return problem(415,'Envía la revisión como JSON.');
    if (Number(request.headers.get('content-length'))>2048) return problem(413,'La revisión es demasiado extensa.');
    const payload = await request.text();
    if (payload.length>2048) return problem(413,'La revisión es demasiado extensa.');
    input = JSON.parse(payload);
  } catch { return problem(400,'La revisión no es válida.'); }
  if (!input || !leadKey(input.leadId) || !Number.isInteger(input.revision)) return problem(422,'Indica el expediente y la revisión actual.');
  const date = now(), marker = crypto.randomUUID();
  const [result,row,lead] = await db.batch([
    stmt(db,`UPDATE admissions_conversations SET lead_id=?,review_status='linked',review_reason=NULL,
      updated_at=?,reviewed_by=?,mutation_id=?,revision=revision+1 WHERE id=? AND revision=? AND review_status='unassigned'
      AND EXISTS(SELECT 1 FROM leads WHERE id=?)`,input.leadId,date,operator,marker,id,input.revision,input.leadId),
    stmt(db,recent+' WHERE c.id=?',id),
    stmt(db,'SELECT id FROM leads WHERE id=?',input.leadId),
    stmt(db,`INSERT INTO events(id,lead_id,type,description,created_at,actor)
      SELECT ?,lead_id,'conversación','El equipo vinculó una conversación al expediente.',?,?
      FROM admissions_conversations WHERE id=? AND mutation_id=?`,'conversacion:'+id,date,operator,id,marker)
  ]);
  if (!row.results[0] || !lead.results[0]) return problem(404,'No encontramos la conversación o el expediente.');
  if (!result.meta.changes) return problem(409,'La conversación cambió. Vuelve a abrirla antes de vincularla.');
  return json(view(row.results[0]));
}

export async function handleConversations(request,env,url,_programs,operator) {
  const path = url.pathname.replace(/\/$/,'');
  if (path!=='/api/staff/conversations' && !path.startsWith('/api/staff/conversations/')) return null;
  if (!operator) return problem(403,'Esta sección requiere acceso del equipo de admisiones.');
  if (!await conversationIntakeReady(env.DB)) return problem(503,'La bandeja de conversaciones aún no está disponible.');
  const db = env.DB, match = path.match(/^\/api\/staff\/conversations\/([\w.-]{1,100})$/);
  if (request.method==='GET') {
    if (!match && path==='/api/staff/conversations') return conversationsList(db,url);
    if (!match) return problem(404,'No encontramos esa conversación.');
    const row = await first(db,recent+' WHERE c.id=?',match[1]);
    return row ? json(view(row)) : problem(404,'No encontramos esa conversación.');
  }
  if (request.method==='PATCH' && match) {
    if (request.headers.has('origin') && request.headers.get('origin')!==url.origin) return problem(403,'Origen no permitido.');
    return assignConversation(request,db,match[1],operator);
  }
  return problem(405,'Método no permitido.');
}
