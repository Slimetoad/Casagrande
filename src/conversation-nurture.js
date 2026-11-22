import {brand,programs as catalog} from './catalog.js';
import {all, digest, enabled, mailReady, now, outreachStartAt, publicOrigin, requestRemote, select, ServiceError} from './providers.js';
import {recruitmentReplyTo} from './replies.js';
import {leadConfirmationUrl} from './lead-confirmation.js';

const intents=new Set(['programa','inversion','cita','requisitos','solicitar_asesor','baja','postergar','desconocido']);
const confidenceLevels=new Set(['alta','media','baja']);
const closed=new Set(['Cerrado','Matriculado']);
const hours=3600000;
const maxSignalAge=48*hours;
const cooldown=24*hours;
const weekly=7*24*hours;
const maxPerWeek=2;
const flow='posgrados-ucg-nurture';
const intakeTable='conversation_nurture_signals';
const jobTable='conversation_nurture_jobs';
const incidentTitle='Conciliar la respuesta por correo';
const pilotSender='Equipo de orientación · Portal piloto de posgrados';
const goodId=value=>typeof value==='string' && /^[\w.:-]{1,160}$/.test(value);
const labels={
  programa:'datos de la maestría',
  inversion:'inversión',
  cita:'agenda',
  requisitos:'requisitos de postulación',
  solicitar_asesor:'atención de un asesor',
  baja:'preferencias de contacto',
  postergar:'seguimiento aplazado',
  desconocido:'consulta del aspirante'
};

const dateBefore=(date,difference)=>new Date(Date.parse(date)-difference).toISOString();
function institutionalUrl(value) {
  try {
    const url=new URL(value);
    if(url.protocol==='https:' && (url.hostname==='casagrande.edu.ec'||url.hostname.endsWith('.casagrande.edu.ec')) &&
        !url.username && !url.password && !url.port)return url.href;
  }catch{/* The catalog can omit an external application link. */}
  return null;
}
function makeDraft(intent,program,stage,base='',institutional=false) {
  const visit=program?base+'/programas/'+encodeURIComponent(program.slug):base+'/programas';
  const official=institutionalUrl(program?.url);
  const source=official||brand.catalogUrl;
  const title=program?.title||(institutional?'los posgrados de Universidad Casa Grande':'los posgrados del portal piloto');
  const office=institutional?'Admisiones':'el equipo de orientación';
  const registration=institutionalUrl(program?.applicationUrl);
  const closedIntake=program?.admissionsStatus==='Inscripciones cerradas';
  let subject,body,follow;
  if(intent==='inversion') {
    subject='Inversión y orientación sobre '+title;
    body=Number.isFinite(program?.price) && program.price>0
      ?'La ficha institucional publica una inversión de '+new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(program.price)+'. Confirma con '+office+' el valor y las condiciones de la convocatoria que te interesa.'
      :'Confirma el valor para tu convocatoria con '+office+'. Puedes responder a este correo indicando si necesitas una cotización, el aporte inicial o las opciones de pago.';
    follow='Si ya tienes una cotización puedes explorar escenarios en '+base+'/financiamiento.';
  }else if(intent==='cita') {
    subject=institutional?'Agenda de orientación de Posgrados UCG':'Agenda de orientación de posgrados';
    body='Puedes consultar las franjas disponibles y solicitar una cita de orientación. El calendario te indicará si el horario queda confirmado o si se registra una solicitud para revisión.';
    follow='Abre la agenda '+base+'/cita'+(program?'?programa='+encodeURIComponent(program.slug):'')+'. Si ya tienes una cita registrada, utiliza el enlace de gestión que conservaste al solicitarla.';
  }else if(intent==='requisitos') {
    subject='Orientación sobre la postulación a '+title;
    body=closedIntake?'La ficha institucional indica que las inscripciones están cerradas. Puedes revisar próximas convocatorias con '+office+'.':
      'Consulta los requisitos de la cohorte vigente en la ficha oficial. El equipo puede verificar contigo el documento o paso que te falta.';
    follow=!closedIntake && registration?'La ficha oficial enlaza a '+registration+'.':'Puedes responder con el requisito específico que necesitas confirmar.';
  }else {
    subject=program?'Ficha de '+title:'Orientación para elegir una maestría';
    const facts=[program?.mode?'Modalidad publicada: '+program.mode+'.':'',program?.duration?'Duración publicada: '+program.duration+'.':''].filter(Boolean);
    body=(facts.length?facts.join(' ')+' ':'')+(closedIntake?'La ficha institucional indica que las inscripciones están cerradas.':
      program?'La ficha del programa reúne su plan de estudios y la información de convocatoria.':
        'En el catálogo puedes comparar modalidades y áreas de estudio. Si ya tienes una maestría en mente, puedes responder con su nombre para revisar la ficha.');
    follow=program?'Puedes revisar la ficha del portal en '+visit+'.':'Explora el catálogo del portal en '+visit+'.';
  }
  const stageContext=stage==='En postulación'?' Si ya presentaste documentos, verifica el siguiente hito con '+office+'.':
    stage==='Admitido'?' El equipo puede confirmar los trámites administrativos pendientes de tu expediente.':'';
  const signature=institutional?'Equipo de Admisiones de Posgrados\nUniversidad Casa Grande':pilotSender;
  return {subject,text:['Hola,',body+stageContext,follow,'Fuente de la universidad: '+source,signature].join('\n\n')};
}

export function previewNurturePlan(facts={},options={}) {
  const {stage='Nuevo',consentEmail=false,paused=false,enabled:dispatch=true,programs=catalog,base='',institutional=false}=options;
  const intent=intents.has(facts.intent)?facts.intent:'desconocido';
  const channel=options.channel==='call'?'voice':options.channel||'email';
  const trusted=facts.confidence==='alta' && facts.needsReview===false;
  const program=programs.find(p=>p.slug===facts.program)||programs.find(p=>p.slug===options.program);
  const stageTask=stage==='En postulación'?'Comprobar el requisito pendiente y registrar el siguiente hito de postulación.':
    stage==='Admitido'?'Verificar el trámite administrativo pendiente y registrar el acuerdo.':'Resolver la consulta y acordar el siguiente paso de orientación.';
  const plan=(decision,title,reason,action,dueMinutes=null,draft=null)=>({decision,title,reason,channel:draft?'email':'interno',action,
    program:program?.slug||null,sourceUrl:institutionalUrl(program?.url)||(draft?brand.catalogUrl:null),draft,dueMinutes,transactional:false});
  const transactional=channel==='email' && options.trustedDirect===true && !consentEmail;
  if(intent==='baja' && trusted && (!facts.optOutChannel||facts.optOutChannel===channel||facts.optOutChannel==='all'))
    return plan('baja','Registrar la baja','La conversación contiene una solicitud explícita para dejar de recibir seguimiento.',
      'Actualizar los permisos correspondientes y detener los seguimientos pendientes.');
  if(closed.has(stage))return plan('sin_contacto','Conservar la consulta','La etapa actual corresponde a un expediente finalizado.','Conservar la conversación en el historial del expediente.');
  if(options.superseded)return plan('superada','Conservar la consulta anterior','El expediente ya recibió una conversación posterior.','Consultar la interacción más reciente.');
  if(intent==='postergar' && trusted)return plan('pausa_solicitada','Revisar el aplazamiento','La persona solicitó aplazar el seguimiento.',
    'Conservar la pausa y registrar cuándo desea retomar la conversación si existe un acuerdo.',240);
  if(intent==='baja')return plan('revision_humana','Verificar la baja solicitada','La preferencia de contacto requiere confirmación.',
    'Suspender la cadencia y verificar qué canal solicitó desactivar.',60);
  if(!trusted || intent==='desconocido')return plan('revision_humana','Revisar la consulta del aspirante','La intención requiere lectura humana.',
    stageTask,240);
  if(paused)return plan('revision_humana','Revisar la conversación en pausa','El expediente conserva una pausa registrada.',
    'Revisar el mensaje y los acuerdos antes de retomar el caso.',240);
  if(intent==='solicitar_asesor')return plan('revision_humana','Atender la solicitud de un asesor','La persona solicitó atención humana.',
    stageTask,60);
  if((!consentEmail && !transactional) || (channel==='voice' && facts.contactPreference!=='email') ||
      (facts.contactPreference && facts.contactPreference!=='email'))
    return plan('revision_humana','Orientar por el canal solicitado','La consulta requiere un canal autorizado y acorde a la preferencia de la persona.',
      'Revisar el pedido y los permisos vigentes en el expediente.',240);
  if(options.ageExceeded || options.cooldown)return plan('revision_humana','Revisar el seguimiento reciente',
    options.ageExceeded?'La consulta supera la ventana de respuesta automática.':'El expediente tiene un seguimiento reciente o un intento que requiere conciliación.',
    'Leer la conversación antes de preparar otro contacto.',240);
  if(!dispatch)return plan('revision_humana','Preparar una respuesta para admisiones','El canal automático de correo está pendiente de habilitación.',
    stageTask,240);
  if(intent!=='cita' && !program && !(transactional && intent==='programa'))return plan('revision_humana','Identificar la maestría consultada','Falta identificar una ficha que respalde la respuesta.',
    'Confirmar el programa de interés antes de responder.',240);
  if(intent==='cita' && options.activeAppointment)return plan('revision_humana','Revisar la cita existente','El calendario registra una cita confirmada o una solicitud pendiente.',
    'Verificar el estado del calendario y el cambio que solicitó la persona.',240);
  return {...plan('respuesta_programada','Preparar respuesta sobre '+labels[intent],transactional
    ?'La persona inició una consulta directa verificada. Se prepara una única respuesta a esa consulta.'
    :'La consulta tiene una intención clara y el expediente autoriza responder por correo.',
    'Responder sobre '+labels[intent]+' y registrar el resultado de la gestión.',0,makeDraft(intent,program,stage,base,institutional)),transactional};
}

const signalView=row=>({id:row.id,channel:row.channel,intent:row.intent,confidence:row.confidence,receivedAt:row.received_at,
  decision:row.decision,reason:row.reason,nextAction:row.next_action,program:row.program,sourceUrl:row.source_url,
  jobStatus:row.job_status??null,dueAt:row.due_at??null});
const signalSelect=`SELECT s.*,j.status AS job_status,j.due_at FROM ${intakeTable} s LEFT JOIN ${jobTable} j ON j.signal_id=s.id`;
const findSignal=(db,id)=>select(db,signalSelect+' WHERE s.id=?',id).first();
function outcome(row) {return {handled:true,...signalView(row)};}
function isMissingStorage(error) {return /no such table.*(?:conversation_nurture_signals|conversation_nurture_jobs)/i.test(error?.message||'');}

async function intakeState(db,id,signalId,date) {
  return select(db,`SELECT l.id,l.program,l.stage,l.paused,l.consent_email,l.revision,
    (SELECT MAX(s.received_at) FROM ${intakeTable} s WHERE s.lead_id=l.id AND s.decision<>'superada') AS latest,
    (SELECT COUNT(*) FROM ${jobTable} j WHERE j.lead_id=l.id AND
      (j.status IN ('processing','uncertain') OR (j.provider_id IS NOT NULL AND j.updated_at>=?))) AS cooldown,
    (SELECT COUNT(*) FROM ${jobTable} j WHERE j.lead_id=l.id AND j.status='accepted' AND j.updated_at>=?) AS weekly,
    EXISTS(SELECT 1 FROM ${intakeTable} s WHERE s.lead_id=l.id AND s.transactional=1) AS prior_direct,
    EXISTS(SELECT 1 FROM admissions_conversations c WHERE c.id=? AND c.lead_id=l.id AND c.provider='resend'
      AND c.direction='inbound' AND c.content_status='complete' AND c.trusted_direct=1 AND c.created_lead=1
      AND c.contact_email=l.email COLLATE NOCASE) AS direct_proof,
    EXISTS(SELECT 1 FROM events e WHERE e.lead_id=l.id AND e.type='preferencias' AND e.description LIKE '%retiró%correo%') AS revoked_email,
    EXISTS(SELECT 1 FROM admissions_appointments a LEFT JOIN admissions_slots st ON st.id=a.slot_id
      WHERE a.lead_id=l.id AND (a.status='requested' OR (a.status='booked' AND st.end_at>=?))) AS active_appointment
    FROM leads l WHERE l.id=?`,dateBefore(date,cooldown),dateBefore(date,weekly),signalId,date,id).first();
}
function signalWrites(db,{id,leadId,channel,receivedAt,extraction},state,plan,date) {
  const token=crypto.randomUUID();
  const marker=` EXISTS(SELECT 1 FROM ${intakeTable} WHERE id=? AND write_token=?)`;
  const q=(sql,...args)=>select(db,sql,...args);
  const sql=[q(`INSERT INTO ${intakeTable}(id,lead_id,channel,intent,confidence,received_at,recorded_at,decision,reason,next_action,program,source_url,stage,lead_program,transactional,lead_revision,write_token)
    SELECT ?,l.id,?,?,?,?,?,?,?,?,?,?,l.stage,l.program,?,l.revision+1,? FROM leads l WHERE l.id=? AND l.revision=? ON CONFLICT(id) DO NOTHING`,
  id,channel,extraction.intent,extraction.confidence,receivedAt,date,plan.decision,plan.reason,plan.action,plan.program,plan.sourceUrl,Number(plan.transactional),token,leadId,state.revision)];
  sql.push(q(`INSERT INTO events(id,lead_id,type,description,created_at,actor)
    SELECT ?,?,'conversación',?,?,'Agente de conversaciones' WHERE`+marker,'conv:'+id,leadId,plan.title+'. '+plan.reason,date,id,token));
  if(plan.decision==='superada')return sql;
  const revoked=plan.decision==='baja';
  const revokeEmail=Number(revoked && (channel==='email'||extraction.optOutChannel==='all'));
  const revokeVoice=Number(revoked && (channel==='voice'||extraction.optOutChannel==='all'));
  const hold=Number(['pausa_solicitada','revision_humana'].includes(plan.decision) && !plan.cooldown);
  const active=!closed.has(state.stage);
  // Every live signal replaces pending cadence. Accepted, ambiguous and already
  // claimed messages retain their state for reconciliation.
  sql.push(q(`UPDATE ${jobTable} SET status='skipped',updated_at=? WHERE lead_id=? AND status='pending' AND`+marker,date,leadId,id,token),
    q("UPDATE jobs SET status='skipped',last_error='Consulta entrante registrada',updated_at=? WHERE lead_id=? AND status='pending' AND"+marker,date,leadId,id,token),
    q("UPDATE whatsapp_jobs SET status='skipped',last_error='Consulta entrante registrada',updated_at=? WHERE lead_id=? AND status='pending' AND"+marker,date,leadId,id,token));
  if(revoked && extraction.optOutChannel==='all')
    sql.push(q("UPDATE whatsapp_consents SET state='revoked',updated_at=? WHERE lead_id=? AND state='granted' AND"+marker,date,leadId,id,token));
  if(!active && !revoked)return sql;
  const due=plan.dueMinutes===null?null:new Date(Date.parse(date)+plan.dueMinutes*60000).toISOString();
  const task=active && ['pausa_solicitada','revision_humana'].includes(plan.decision);
  if(task)sql.push(q(`INSERT INTO tasks(id,lead_id,title,status,due_at,created_at)
    SELECT ?,?,?,'pendiente',?,? WHERE `+marker+" AND NOT EXISTS (SELECT 1 FROM tasks WHERE lead_id=? AND title=? AND status='pendiente')",
  'conv-task:'+id,leadId,plan.title,due,date,id,token,leadId,plan.title));
  const action=task?plan.title:plan.decision==='respuesta_programada'?plan.action:null;
  sql.push(q(`UPDATE leads SET consent_email=CASE WHEN ?=1 THEN 0 ELSE consent_email END,
    consent_voice=CASE WHEN ?=1 THEN 0 ELSE consent_voice END,paused=MAX(paused,?),
    next_action=CASE WHEN paused=0 AND ? IS NOT NULL AND
      (next_action='' OR NOT EXISTS(SELECT 1 FROM events e WHERE e.lead_id=leads.id AND e.type='próxima acción' AND e.actor NOT IN ('Sistema','Agente de conversaciones')))
      THEN ? ELSE next_action END,
    due_at=CASE WHEN paused=0 AND ? IS NOT NULL AND
      (next_action='' OR NOT EXISTS(SELECT 1 FROM events e WHERE e.lead_id=leads.id AND e.type='próxima acción' AND e.actor NOT IN ('Sistema','Agente de conversaciones')))
      THEN ? ELSE due_at END,
    updated_at=?,revision=revision+1 WHERE id=? AND `+marker,revokeEmail,revokeVoice,hold,action,action,action,due,date,leadId,id,token));
  if(plan.decision==='respuesta_programada')
    sql.push(q(`INSERT INTO ${jobTable}(id,signal_id,lead_id,status,due_at,updated_at) SELECT ?,?,?,'pending',?,? WHERE`+marker,
      crypto.randomUUID(),id,leadId,due,date,id,token));
  return sql;
}
export async function recordNurtureSignal(env,signal) {
  const {id,leadId,channel}=signal||{};
  if(!env?.DB || !goodId(id) || !goodId(leadId) || !['email','voice'].includes(channel))return {handled:false};
  const input=signal.extraction||{};
  const extraction={intent:intents.has(input.intent)?input.intent:'desconocido',confidence:confidenceLevels.has(input.confidence)?input.confidence:'baja',
    needsReview:input.needsReview!==false,program:input.program,contactPreference:input.contactPreference,optOutChannel:input.optOutChannel};
  if(signal.consentRevoked===true && extraction.intent==='baja' && !input.optOutChannel)extraction.optOutChannel=channel;
  const date=now(),parsed=Date.parse(signal.receivedAt);
  const receivedAt=Number.isFinite(parsed)&&parsed<=Date.parse(date)+5*60000?new Date(parsed).toISOString():date;
  const db=env.DB;
  try {
    const existing=await findSignal(db,id);
    if(existing)return existing.lead_id===leadId?outcome(existing):{handled:false};
    for(let attempt=0;attempt<3;attempt++) {
      const state=await intakeState(db,leadId,id,date);
      if(!state)return {handled:false};
      const cooling=state.cooldown>0 || state.weekly>=maxPerWeek;
      const plan=previewNurturePlan(extraction,{channel,stage:state.stage,paused:Boolean(state.paused),program:state.program,
        consentEmail:state.consent_email===1,enabled:enabled(env.OUTREACH_ENABLED)&&mailReady(env),activeAppointment:Boolean(state.active_appointment),
        trustedDirect:signal.trustedDirect===true && signal.createdLead===true && state.stage==='Nuevo' &&
          state.direct_proof===1 && !state.prior_direct && !state.revoked_email,
        superseded:Boolean(state.latest && state.latest>receivedAt),ageExceeded:Date.parse(date)-Date.parse(receivedAt)>maxSignalAge,cooldown:cooling});
      plan.cooldown=cooling && plan.title==='Revisar el seguimiento reciente';
      await db.batch(signalWrites(db,{id,leadId,channel,receivedAt,extraction},state,plan,date));
      const current=await findSignal(db,id);
      if(current)return current.lead_id===leadId?outcome(current):{handled:false};
    }
    throw new ServiceError('El expediente cambió durante la revisión. Se requiere reintentar el ingreso.',503);
  }catch(error) {
    if(isMissingStorage(error))return {handled:false};
    throw error;
  }
}

const eligibleJob=`FROM ${jobTable} j JOIN ${intakeTable} s ON s.id=j.signal_id
  JOIN leads l ON l.id=j.lead_id
  WHERE j.id=? AND j.status='processing' AND l.stage=s.stage AND l.program=s.lead_program AND l.paused=0
  AND l.stage NOT IN ('Cerrado','Matriculado') AND s.received_at>=? AND s.recorded_at>=?
  AND (l.consent_email=1 OR (s.transactional=1 AND s.channel='email' AND l.revision=s.lead_revision AND EXISTS(
    SELECT 1 FROM admissions_conversations c WHERE c.id=s.id AND c.lead_id=l.id AND c.provider='resend'
      AND c.direction='inbound' AND c.content_status='complete' AND c.trusted_direct=1 AND c.created_lead=1
      AND c.contact_email=l.email COLLATE NOCASE
  ) AND NOT EXISTS(
    SELECT 1 FROM events e WHERE e.lead_id=l.id AND e.type='preferencias' AND e.description LIKE '%retiró%correo%'
  )))
  AND NOT EXISTS(SELECT 1 FROM ${intakeTable} newer WHERE newer.lead_id=l.id AND newer.id<>s.id AND newer.decision<>'superada'
    AND (newer.received_at>s.received_at OR (newer.received_at=s.received_at AND newer.rowid>s.rowid)))
  AND NOT EXISTS(SELECT 1 FROM admissions_replies r WHERE r.lead_id=l.id AND r.body_status='pendiente' AND r.received_at>s.recorded_at)
  AND NOT EXISTS(SELECT 1 FROM ${jobTable} other WHERE other.lead_id=l.id AND other.id<>j.id AND
    (other.status IN ('processing','uncertain') OR (other.provider_id IS NOT NULL AND other.updated_at>=?)))`;
async function dispatchable(db,id,date,startsAt) {
  return select(db,`SELECT l.id,l.email,l.pref_token,s.intent,s.program,s.transactional,s.stage,s.received_at `+eligibleJob,
    id,dateBefore(date,maxSignalAge),startsAt,dateBefore(date,cooldown)).first();
}
function emailPayload(env,job,lead,draft,replyTo,confirmation) {
  const pref=new URL('/preferencias/'+encodeURIComponent(lead.pref_token),env.PUBLIC_BASE_URL);
  const oneClick=new URL('/api/preferences/'+encodeURIComponent(lead.pref_token),env.PUBLIC_BASE_URL);
  const institutional=env.INSTITUTIONAL_LIVE==='true';
  const info=lead.transactional?
    'Respondemos una vez a la consulta que enviaste al equipo de orientación. Si deseas autorizar correos de seguimiento, indícaselo al equipo al responder.':
    'Este correo responde a tu consulta. Puedes gestionar tus preferencias en '+pref.href+'.';
  const confirm=confirmation?'\n\nSi quieres, confirma la maestría y el momento en que deseas empezar: '+confirmation:'';
  const configured=env.RESEND_FROM.trim();
  const address=configured.match(/<([^<>]+)>$/)?.[1]||configured;
  const from=institutional?configured:pilotSender+' <'+address+'>';
  return {from,to:[lead.email],subject:draft.subject,text:draft.text+confirm+'\n\n'+info,
    tags:[{name:'flujo',value:flow},{name:'seguimiento',value:job.id}],
    ...(replyTo?{reply_to:replyTo}:{}),
    ...(!lead.transactional?{headers:{'List-Unsubscribe':'<'+oneClick.href+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}:{})};
}
function incidentTask(db,id,status,date) {
  return select(db,`INSERT INTO tasks(id,lead_id,title,status,due_at,created_at)
    SELECT ?,j.lead_id,?,'pendiente',?,? FROM ${jobTable} j JOIN leads l ON l.id=j.lead_id
    WHERE j.id=? AND j.status=? AND l.stage NOT IN ('Cerrado','Matriculado')
    AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.lead_id=j.lead_id AND t.title=? AND t.status='pendiente')
    ON CONFLICT(id) DO NOTHING`,
  'conv-reconcile:'+id,incidentTitle,new Date(Date.parse(date)+4*hours).toISOString(),date,id,status,incidentTitle);
}
function statusWrite(db,id,status,description,date,options={}) {
  const writes=[
    select(db,`UPDATE ${jobTable} SET status=?,updated_at=?,due_at=COALESCE(?,due_at),
      provider_id=COALESCE(?,provider_id) WHERE id=? AND status IN (${options.allowUncertain?"'processing','uncertain'":"'processing'"})
      AND (? IS NULL OR updated_at<?)`,status,date,options.retryAt||null,options.providerId||null,id,
      options.lastUpdatedBefore||null,options.lastUpdatedBefore||null),
    select(db,`INSERT OR IGNORE INTO events(id,lead_id,type,description,created_at,actor)
      SELECT ?,lead_id,'seguimiento',?,?,'Agente de conversaciones' FROM ${jobTable} WHERE id=? AND changes()>0`,
    options.eventId||'conv-status:'+id+':'+status,description,date,id)
  ];
  if(status==='failed'||status==='uncertain')writes.push(incidentTask(db,id,status,date));
  if(status==='accepted')writes.push(select(db,`UPDATE tasks SET status='hecha' WHERE id=? AND status='pendiente'
    AND EXISTS(SELECT 1 FROM ${jobTable} WHERE id=? AND status='accepted')`,'conv-reconcile:'+id,id));
  return db.batch(writes);
}

export async function runNurtureJobs(env,programs=catalog) {
  const counts={accepted:0,skipped:0,retry:0,review:0};
  if(!env.DB || !mailReady(env))return {status:'sin_configurar',...counts};
  if(!enabled(env.OUTREACH_ENABLED))return {status:'en_pausa',...counts};
  const startsAt=outreachStartAt(env);
  if(startsAt===null)return {status:'sin_configurar',message:'Usa una fecha de inicio con hora y zona horaria en OUTREACH_START_AT.',...counts};
  const db=env.DB,date=now();
  let due;
  try {
    const cutoff=dateBefore(date,hours);
    const abandoned=await all(db,`SELECT id FROM ${jobTable} WHERE status='processing' AND updated_at<? ORDER BY updated_at LIMIT 10`,cutoff);
    for(const job of abandoned) {
      const [result]=await statusWrite(db,job.id,'uncertain','La respuesta contextual requiere conciliación con el proveedor.',date,{lastUpdatedBefore:cutoff});
      counts.review+=result.meta?.changes||0;
    }
    const limit=Math.max(1,Math.min(3,Number.parseInt(env.OUTREACH_BATCH_SIZE,10)||3));
    // The signal and its job are created together. Retrying changes only the job's due/update times.
    due=await all(db,`SELECT j.id FROM ${jobTable} j JOIN ${intakeTable} s ON s.id=j.signal_id
      WHERE j.status='pending' AND j.due_at<=? AND j.attempts<2 AND s.recorded_at>=? ORDER BY j.due_at,j.id LIMIT ?`,date,startsAt,limit);
  }catch(error) {
    if(isMissingStorage(error))return {status:'sin_configurar',...counts};
    throw error;
  }
  await Promise.all(due.map(async job=>{
    const started=now();
    const claimed=await select(db,`UPDATE ${jobTable} SET status='processing',updated_at=?,attempts=attempts+1
      WHERE id=? AND status='pending' AND due_at<=? AND attempts<2 AND EXISTS(
        SELECT 1 FROM ${intakeTable} s WHERE s.id=${jobTable}.signal_id AND s.recorded_at>=?) RETURNING attempts`,started,job.id,started,startsAt).first();
    if(!claimed)return;
    const skipped=() => statusWrite(db,job.id,'skipped',
      'Se canceló la respuesta automática al volver a comprobar la conversación, la etapa y el permiso.',now());
    let before,draft,replyTo,confirmation,providerId;
    try {
      before=await dispatchable(db,job.id,started,startsAt);
      const program=before && programs.find(item=>item.slug===before.program);
      if(!before || (before.program && !program)) {
        await skipped();counts.skipped++;return;
      }
      draft=makeDraft(before.intent,program,before.stage,publicOrigin(env),env.INSTITUTIONAL_LIVE==='true');
      replyTo=await recruitmentReplyTo(env,before)||env.RESEND_REPLY_TO;
      confirmation=before.transactional?await leadConfirmationUrl(publicOrigin(env),before,before.received_at):'';
      const current=await dispatchable(db,job.id,now(),startsAt);
      if(!current || current.email!==before.email || current.pref_token!==before.pref_token) {
        await skipped();counts.skipped++;return;
      }
      const response=await requestRemote('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'posgrados-conversacion-'+job.id},
        body:JSON.stringify(emailPayload(env,job,current,draft,replyTo,confirmation))
      },'Resend');
      const payload=await response.json();
      providerId=typeof payload.id==='string' && goodId(payload.id)?payload.id:null;
      if(!providerId)throw new ServiceError('El proveedor no confirmó un identificador de respuesta.');
    }catch(error) {
      const code=error.remoteStatus;
      if(code===429 && claimed.attempts<2) {
        const date=now();
        await statusWrite(db,job.id,'pending','El proveedor limitó temporalmente el envío. La respuesta sigue pendiente.',date,
          {retryAt:new Date(Date.parse(date)+5*60000).toISOString()});
        counts.retry++;return;
      }
      const failed=code>=400 && code<500 && ![408,409].includes(code);
      const [changed]=await statusWrite(db,job.id,failed?'failed':'uncertain','Revisar la respuesta automática en el proveedor antes de volver a contactar.',now());
      counts.review+=changed.meta?.changes||0;return;
    }
    const [written]=await statusWrite(db,job.id,'accepted','El proveedor aceptó la respuesta contextual para procesamiento.',now(),{providerId});
    if(written.meta?.changes || await select(db,`SELECT 1 AS found FROM ${jobTable} WHERE id=? AND provider_id=?`,job.id,providerId).first())counts.accepted++;
  }));
  return {status:'completado',...counts};
}

const failureEvents=new Set(['email.bounced','email.complained','email.suppressed','email.failed']);
const acceptanceEvents=new Set(['email.sent','email.delivered','email.delivery_delayed']);
const revokedBy=new Set(['email.bounced','email.complained','email.suppressed']);
function tagValue(tags,key) {
  return Array.isArray(tags)?tags.find(item=>item?.name===key)?.value:tags?.[key];
}
export async function reconcileNurtureEmail(env,event,eventId) {
  const type=event?.type,contact=event?.data;
  if(!env.DB || !goodId(contact?.email_id) || !goodId(eventId) ||
      (!failureEvents.has(type) && !acceptanceEvents.has(type)))return false;
  const db=env.DB;
  try {
    let row=await select(db,`SELECT id,lead_id,status FROM ${jobTable} WHERE provider_id=?`,contact.email_id).first();
    const tagged=tagValue(contact.tags,'seguimiento');
    if(!row && tagValue(contact.tags,'flujo')===flow && goodId(tagged))
      row=await select(db,`SELECT id,lead_id,status FROM ${jobTable}
        WHERE id=? AND provider_id IS NULL AND status IN ('processing','uncertain')`,tagged).first();
    if(!row)return false;
    const date=now();
    if(acceptanceEvents.has(type)) {
      await statusWrite(db,row.id,'accepted','El proveedor aceptó la respuesta contextual para procesamiento.',date,
        {providerId:contact.email_id,allowUncertain:true});
      return true;
    }
    const eid='conv-provider:'+await digest(eventId);
    const notYet=' AND NOT EXISTS(SELECT 1 FROM events WHERE id=?)';
    const writes=[select(db,`UPDATE ${jobTable} SET status='failed',provider_id=?,updated_at=?
      WHERE id=? AND (provider_id IS NULL OR provider_id=?)`+notYet,contact.email_id,date,row.id,contact.email_id,eid)];
    if(revokedBy.has(type))writes.push(
      select(db,"UPDATE leads SET consent_email=0,revision=revision+1,updated_at=? WHERE id=?"+notYet,date,row.lead_id,eid),
      select(db,`UPDATE ${jobTable} SET status='skipped',updated_at=? WHERE lead_id=? AND status='pending'`+notYet,date,row.lead_id,eid),
      select(db,"UPDATE jobs SET status='skipped',last_error='Canal de correo suprimido por el proveedor',updated_at=? WHERE lead_id=? AND channel='email' AND status='pending'"+notYet,date,row.lead_id,eid)
    );
    writes.push(select(db,`INSERT OR IGNORE INTO events(id,lead_id,type,description,created_at,actor)
      VALUES(?,?,'correo',?,?,'Resend')`,eid,row.lead_id,revokedBy.has(type)
      ?'El proveedor informó una incidencia. Se retiró el permiso de correo en el expediente.'
      :'El proveedor informó una incidencia con la respuesta contextual.',date));
    writes.push(incidentTask(db,row.id,'failed',date));
    await db.batch(writes);
    return true;
  }catch(error) {
    if(isMissingStorage(error))return false;
    throw error;
  }
}
export async function handleNurture(request,env,url,programs,operator) {
  const match=/^\/api\/staff\/leads\/([\w.:-]{1,160})\/nurture\/?$/.exec(url.pathname);
  if(!match)return null;
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  if(!operator)return json({error:'Se requiere acceso al equipo de admisiones.'},403);
  if(request.method!=='GET')return json({error:'Utiliza GET para consultar las decisiones.'},405);
  if(!env.DB)return json({error:'El historial de seguimiento no está disponible.'},503);
  try {
    const lead=await select(env.DB,'SELECT id FROM leads WHERE id=?',match[1]).first();
    if(!lead)return json({error:'No encontramos el expediente.'},404);
    const signals=await all(env.DB,signalSelect+' WHERE s.lead_id=? ORDER BY s.received_at DESC,s.rowid DESC LIMIT 30',lead.id);
    return json({signals:signals.map(signalView)});
  }catch(error) {
    if(isMissingStorage(error))return json({error:'El historial de seguimiento está pendiente de configuración.'},503);
    throw error;
  }
}
