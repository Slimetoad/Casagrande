import {activeAI, aiText, normalized} from './providers.js';
import {finishModelReview, modelInfo, reserveModelReview} from './intelligence.js';

const stages = {
  Nuevo: 'Aclarar el objetivo profesional y verificar el programa que mejor lo atiende.',
  'En orientación': 'Preparar una comparación sustentada y acordar una duda concreta para resolver.',
  'En postulación': 'Comprobar en la convocatoria vigente los documentos y el próximo hito de postulación.',
  Admitido: 'Verificar con el equipo académico los pasos de matrícula que aún estén pendientes.',
  Matriculado: 'Verificar que el expediente tenga el respaldo de matrícula y revisar las tareas restantes.',
  Cerrado: 'Revisar el motivo de cierre y archivar las tareas comerciales que hayan quedado pendientes.'
};
const talkingPoints = {
  meta: '¿Qué cambio profesional esperas lograr con esta maestría?',
  proyecto: '¿Qué proyecto de tu trabajo te gustaría abordar durante la maestría?',
  horario: '¿Qué horarios o modalidad necesitas para compaginar la maestría con tu trabajo?',
  comparar: '¿Entre qué programas estás decidiendo y qué diferencia te ayudaría a elegir?',
  presupuesto: '¿Quieres revisar la cotización vigente, el aporte inicial o las opciones de pago?',
  requisitos: '¿Qué requisito de la convocatoria necesitas aclarar para avanzar con tu postulación?',
  documentos: '¿Qué documentos de la convocatoria ya tienes listos para presentar?',
  matricula: '¿Qué paso administrativo de la matrícula te gustaría revisar con admisiones?',
  convocatoria: '¿Para qué convocatoria te gustaría confirmar la disponibilidad?',
  proximo: '¿Qué información te ayudaría a decidir tu siguiente paso?'
};
const toolTypes = {
  simulador:'presupuesto', financiamiento:'presupuesto', calculadora:'presupuesto', finance:'presupuesto',
  test:'orientacion', quiz:'orientacion', orientacion:'orientacion',
  comparador:'comparacion', comparacion:'comparacion', comparar:'comparacion',
  programa:'programa', ficha:'programa', asistente:'asistente', guia:'guia',
  postulacion:'postulacion', postular:'postulacion', requisitos:'postulacion', inscripcion:'postulacion'
};
const toolSignals = {
  presupuesto:'La consulta incluye una referencia al simulador de inversión.',
  orientacion:'La orientación de programas aparece en el recorrido compartido.',
  comparacion:'Se registró interés en comparar programas.',
  asistente:'Se solicitó atención desde el asistente del portal.',
  guia:'Se solicitó orientación desde una guía de posgrados.',
  programa:'La solicitud procede de una ficha de programa.',
  postulacion:'La consulta indica interés en el proceso de postulación.'
};
const leadFields = 'stage,program,context,source,paused,consent_email,consent_voice,revision,due_at';
function json(data,status=200) {
  return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
function fromContext(raw) {
  try {const obj=JSON.parse(raw); return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};}
  catch {return {};}
}
const timeframes=new Set(['Próxima convocatoria','En seis a doce meses','Estoy explorando']);
function contextSignals(rows,programs) {
  const signals=new Set(), compared=new Set();
  const areas=new Set(programs.map(p=>p.area)), modes=new Set(programs.map(p=>p.mode));
  let area,modality,timeframe,quizProgram,recentIntent;
  for(const row of rows) {
    const ctx=fromContext(row.context);
    // Map only recognized tool values. Campaign parameters can contain names or emails.
    for(const value of [row.source,ctx.tool,ctx.herramienta,ctx.origen,ctx.action]) {
      const tool=normalized(value);
      if(!Object.hasOwn(toolTypes,tool))continue;
      const kind=toolTypes[tool];
      signals.add(kind);
      if(!recentIntent && ['presupuesto','postulacion','comparacion','orientacion'].includes(kind))recentIntent=kind;
    }
    if (!area && typeof ctx.quizArea==='string' && areas.has(ctx.quizArea)) area=ctx.quizArea;
    if (!modality && typeof ctx.quizMode==='string' && modes.has(ctx.quizMode)) modality=ctx.quizMode;
    if (!timeframe && timeframes.has(ctx.timeframe)) timeframe=ctx.timeframe;
    if (!quizProgram) quizProgram=programs.find(p=>p.slug===ctx.quizResult)?.title;
    if (area || modality || timeframe || quizProgram) signals.add('orientacion');
    if (Array.isArray(ctx.comparedPrograms)) {
      for (const slug of ctx.comparedPrograms.slice(0,6)) {
        const item=programs.find(p=>p.slug===slug);
        if(item) compared.add(item.title);
      }
    }
    if(Number.isFinite(ctx.investment) && ctx.investment>0 && Number.isFinite(ctx.months)) signals.add('presupuesto');
  }
  if(compared.size>0) signals.add('comparacion');
  return {tools:[...signals],area,modality,timeframe,quizProgram,recentIntent,compared:[...compared].slice(0,3)};
}
const blockerOptions={
  documentos:'Documentación por verificar',
  financiamiento:'Inversión o financiamiento',
  horario:'Horarios o modalidad',
  convocatoria:'Convocatoria',
  decision:'Decisión sobre el programa',
  respuesta:'Respuesta pendiente'
};
const responseTasks={
  email:'Responder al correo del aspirante',
  whatsapp:'Responder por WhatsApp al aspirante',
  voice:'Llamar al aspirante que solicitó hablar con un asesor'
};
const routeNames={email:'Correo',whatsapp:'WhatsApp',voice:'Llamada'};
const readableDate=value=>{
  const date=Date.parse(value);
  return Number.isFinite(date)?new Intl.DateTimeFormat('es-EC',{dateStyle:'medium',timeZone:'America/Guayaquil'}).format(date):null;
};
const evidenceItem=(label,detail)=>({label,detail});
const step=(label,detail,successSignal,channel='Interno')=>({label,detail,channel,successSignal});

function engagement(rows,lead) {
  const tasks=rows.tasks||{};
  const reply=rows.reply?.count>0;
  const pendingChannels=['email','whatsapp','voice'].filter(channel=>tasks[channel+'_open']>0);
  const scheduled=readableDate(tasks.due_at||lead.due_at);
  const jobPending=Number(rows.jobs?.pending)||0;
  const reconciling=Number(rows.jobs?.reconciling)||0;
  return {pending:Number(tasks.pending)||0,overdue:Number(tasks.overdue)||0,reply,pendingChannels,scheduled,jobPending,reconciling};
}
function questionsFor(stage,context,alternative,blocker) {
  const choices=[];
  if(stage==='Admitido')choices.push('matricula');
  if(stage==='En postulación')choices.push('requisitos','documentos');
  if(blocker==='horario')choices.push('horario');
  if(blocker==='convocatoria')choices.push('convocatoria');
  if(blocker==='documentos'||context.recentIntent==='postulacion')choices.push('requisitos','documentos');
  if(blocker==='financiamiento'||context.recentIntent==='presupuesto')choices.push('presupuesto');
  if(alternative || context.tools.includes('comparacion'))choices.push('comparar');
  if(context.tools.includes('presupuesto'))choices.push('presupuesto');
  if(context.tools.includes('orientacion'))choices.push('meta','horario');
  if(stage==='Nuevo')choices.push('meta');
  if(stage==='En orientación')choices.push('proyecto','horario');
  return [...new Set([...choices,'proximo'])];
}
function followup(facts) {
  const {stage,paused,closed,canContact,inbox,journey,program,caseBlocker,appointment,needsEvidence,context,alternative,preferred,checklist}=facts;
  const success='Dejar el resultado y el próximo compromiso en el expediente.';
  if(closed) {
    const details=stage==='Matriculado'&&needsEvidence?'Verificar el respaldo de matrícula con el registro universitario y completar el expediente.':stages[stage];
    return step(stage==='Matriculado'?'Conciliar el expediente':'Revisar el cierre',details,'Confirmar la evidencia y las tareas de cierre.');
  }
  if(inbox) {
    const name=routeNames[inbox];
    if(inbox==='voice' && (!canContact || preferred!=='Llamada'))return step('Revisar la solicitud de llamada','Revisar internamente la petición y verificar que el permiso de voz esté vigente.',success);
    return step('Revisar el contacto entrante',inbox==='voice'?'Confirmar la solicitud de hablar con un asesor y revisar la tarea asignada.':'Abrir la respuesta anterior en el canal '+name+' y verificar la duda o solicitud que queda pendiente.',success,inbox==='voice'?preferred:'Interno');
  }
  if(appointment==='booked')return step('Preparar la cita confirmada','Revisar el objetivo de la cita agendada, la etapa del expediente y los asuntos que requieren confirmación.','Registrar el resultado de la cita y la siguiente tarea.');
  if(appointment==='requested')return step('Revisar la solicitud de cita','Comprobar las opciones de agenda y la solicitud pendiente en el calendario de admisiones.','Confirmar un horario acordado o registrar que la solicitud sigue pendiente.');
  if(appointment==='pendingResult')return step('Conciliar la cita vencida','Verificar si se realizó la cita y registrar su resultado en el calendario.','Registrar asistencia o inasistencia y el siguiente hito.');
  if(paused)return step('Mantener la pausa','Mantener la pausa y revisar internamente las tareas pendientes.','Registrar la condición acordada para retomar el caso.');
  if(!canContact)return step('Preparar material de consulta','Preparar la información para una futura consulta iniciada por el aspirante. '+(stage==='En postulación'?stages[stage]:''),'Dejar preparada la información verificable de la etapa.');
  if(journey.reconciling)return step('Conciliar seguimiento','Verificar con el proveedor el estado del seguimiento en curso o sin confirmación.','Registrar el estado antes de programar otro contacto.');
  if(stage==='En postulación')return step(checklist.documentsReviewed?'Confirmar el siguiente hito de postulación':'Revisar documentos de postulación',checklist.documentsReviewed?'Consultar el resultado de la revisión documental y dejar listo el siguiente hito de la convocatoria.':stages[stage],
    'Actualizar la lista de requisitos pendientes y registrar el siguiente hito.',preferred);
  if(stage==='Admitido')return step(needsEvidence?'Validar admisión registrada':'Acompañar la matrícula',
    needsEvidence?'Verificar el respaldo de admisión con la autoridad académica.':stages[stage],
    'Registrar la evidencia o el siguiente paso administrativo.',needsEvidence?'Interno':preferred);
  if(caseBlocker==='documentos'||context.recentIntent==='postulacion')return step('Aclarar el inicio de postulación','Confirmar qué documentos y fechas establece la convocatoria para el programa de interés.',
    'Registrar el requisito aclarado y el próximo paso acordado.',preferred);
  if(caseBlocker==='respuesta')return step('Revisar el contacto anterior','Conciliar el último intento y preparar un siguiente paso según lo que haya quedado pendiente.',success);
  if(caseBlocker==='financiamiento'||(!caseBlocker && context.recentIntent==='presupuesto')||(!caseBlocker && !context.recentIntent && context.tools.includes('presupuesto')))return step('Aclarar inversión','Confirmar la cotización vigente con admisiones y preparar una explicación de las formas de pago.',
    'Registrar si se resolvió la consulta económica y qué información queda por confirmar.',preferred);
  if(caseBlocker==='horario')return step('Contrastar horarios y modalidad','Verificar la modalidad publicada y confirmar con el equipo el horario que aplica a la cohorte.',
    'Registrar el horario confirmado y su compatibilidad con la consulta.',preferred);
  if(caseBlocker==='convocatoria'||(!caseBlocker && (context.timeframe==='Próxima convocatoria'||program?.admissionsStatus==='Inscripciones cerradas')))return step('Verificar la convocatoria',
    'Confirmar con admisiones el estado de la próxima convocatoria y el proceso que aplica al programa.',
    'Registrar la convocatoria confirmada o la fecha acordada para revisar novedades.',preferred);
  if(caseBlocker==='decision'||alternative||context.compared.length)return step('Comparar los programas considerados',
    'Contrastar objetivos, modalidad y plan de estudios con las fichas oficiales para resolver una diferencia concreta.',
    'Registrar la opción de interés confirmada y el criterio que orientó la decisión.',preferred);
  return step('Preparar la orientación',stages[stage],success,preferred);
}
function buildBrief(lead,rows,programs) {
  const stage=Object.hasOwn(stages,lead.stage)?lead.stage:'Nuevo';
  const program=programs.find(p=>p.slug===lead.program);
  const alternative=rows.receipts.map(r=>programs.find(p=>p.slug===r.program)).find(p=>p && p.slug!==program?.slug);
  const context=contextSignals([...rows.receipts,lead],programs);
  const {tools}=context;
  const closed=stage==='Cerrado'||stage==='Matriculado';
  const paused=Boolean(lead.paused);
  const email=Boolean(lead.consent_email);
  const voice=Boolean(lead.consent_voice) && !rows.voice?.suppressed;
  const whatsapp=Boolean(rows.whatsapp?.allowed);
  const canContact=!closed && !paused && (email || voice || whatsapp);
  const preferred=voice && rows.tasks?.voice_open>0?'Llamada':email?'Correo':whatsapp?'WhatsApp':voice?'Llamada':'Interno';
  const journey=engagement(rows,lead);
  const inbox=journey.pendingChannels[0];
  const rawBlocker=normalized(rows.caseData?.blocker).trim();
  const caseBlocker=Object.hasOwn(blockerOptions,rawBlocker)?rawBlocker:'';
  const checklist=fromContext(rows.caseData?.checklist);
  const dateOfDecision=readableDate(rows.caseData?.decision_at);
  const appointment=rows.appointment?.status==='booked' && rows.appointment?.expired?'pendingResult':rows.appointment?.status;
  const appointmentOpen=['booked','requested','pendingResult'].includes(appointment);
  const needsEvidence=(stage==='Admitido'&&!rows.caseData?.admitted)||(stage==='Matriculado'&&!rows.caseData?.enrolled);
  const evidence=[
    ...tools.map(t=>evidenceItem('Recorrido',toolSignals[t])),
    evidenceItem('Tareas','Tareas pendientes: '+journey.pending+'. Vencidas: '+journey.overdue+'.')
  ];
  if(context.area)evidence.push(evidenceItem('Orientación','Área elegida en el test: '+context.area+'.'));
  if(context.modality)evidence.push(evidenceItem('Orientación','Modalidad elegida en el test: '+context.modality+'.'));
  if(context.timeframe)evidence.push(evidenceItem('Orientación','Horizonte que indicó en el test: «'+context.timeframe+'».'));
  if(context.quizProgram)evidence.push(evidenceItem('Orientación','Resultado del test: '+context.quizProgram+'.'));
  if(context.compared.length)evidence.push(evidenceItem('Comparación','Programas incluidos en la comparación: '+context.compared.join(' · ')+'.'));
  if(alternative)evidence.push(evidenceItem('Otra consulta','En otra consulta figura '+alternative.title+'. Conviene confirmar el interés actual.'));
  if(program?.mode)evidence.push(evidenceItem('Ficha oficial','La modalidad publicada es '+program.mode+'.'));
  if(program?.duration)evidence.push(evidenceItem('Ficha oficial','La duración publicada es '+program.duration+'.'));
  if(inbox)evidence.push(evidenceItem('Contacto entrante','Hay una tarea pendiente asociada a '+routeNames[inbox]+'.'));
  else if(journey.reply)evidence.push(evidenceItem('Contacto entrante','El expediente registra una respuesta por correo.'));
  if(journey.scheduled&&!closed)evidence.push(evidenceItem('Vencimiento interno','Próxima tarea registrada para el '+journey.scheduled+'.'));
  if(appointment==='booked')evidence.push(evidenceItem('Cita confirmada','El calendario registra una cita para el '+readableDate(rows.appointment.start_at)+'.'));
  if(appointment==='requested')evidence.push(evidenceItem('Solicitud de cita','La solicitud de cita está pendiente de confirmación.'));
  if(appointment==='pendingResult')evidence.push(evidenceItem('Cita vencida','El calendario espera que el equipo registre el resultado de la cita.'));
  if(appointment==='completed')evidence.push(evidenceItem('Cita completada','El calendario registra una cita completada.'));
  if(appointment==='no_show')evidence.push(evidenceItem('Inasistencia','El calendario registra una cita a la que la persona no asistió.'));
  if(dateOfDecision)evidence.push(evidenceItem('Fecha de decisión','El expediente registra una fecha de decisión para el '+dateOfDecision+'.'));
  if(checklist.contacted===true)evidence.push(evidenceItem('Hito del expediente','El equipo marcó el primer contacto como realizado.'));
  if(checklist.programChosen===true)evidence.push(evidenceItem('Hito del expediente','El equipo marcó la elección del programa como confirmada.'));
  if(checklist.documentsReviewed===true)evidence.push(evidenceItem('Hito del expediente','El equipo marcó la documentación como revisada.'));
  if(checklist.financingReviewed===true)evidence.push(evidenceItem('Hito del expediente','El equipo marcó la consulta de financiamiento como revisada.'));
  if(journey.jobPending)evidence.push(evidenceItem('Cola de seguimiento','Hay '+journey.jobPending+' seguimientos en espera.'));
  if(closed)evidence.push(evidenceItem('Seguimiento','El seguimiento comercial terminó.'));
  else if(paused)evidence.push(evidenceItem('Seguimiento','El seguimiento está en pausa.'));
  else if(canContact)evidence.push(evidenceItem('Seguimiento','Canales autorizados: '+[email?'correo':'',voice?'llamada':'',whatsapp?'WhatsApp':''].filter(Boolean).join(' y ')+'.'));
  else evidence.push(evidenceItem('Seguimiento','El expediente carece de autorización de contacto en los canales registrados.'));
  const blockers=[];
  if(stage==='En postulación' && checklist.documentsReviewed===false)blockers.push(evidenceItem('Hito pendiente','La revisión de documentos figura pendiente en el expediente.'));
  if(caseBlocker)blockers.push(evidenceItem('Bloqueo registrado',blockerOptions[caseBlocker]+'.'));
  else if(rows.caseData?.blocker)blockers.push(evidenceItem('Bloqueo registrado','Consultar el detalle registrado por el equipo en el expediente.'));
  if(needsEvidence)blockers.push(evidenceItem('Respaldo de etapa','El expediente requiere verificación del respaldo de la etapa.'));
  if(journey.overdue && !closed)blockers.push(evidenceItem('Seguimiento vencido','Resolver la tarea vencida antes de agregar otro compromiso.'));
  if(journey.reconciling && !closed)blockers.push(evidenceItem('Contacto sin confirmar','Hay un seguimiento en curso o con resultado sin conciliar.'));
  if(!canContact&&!closed)blockers.push(evidenceItem('Canal de seguimiento',paused?'Seguimiento en pausa.':'Sin un permiso vigente para iniciar el seguimiento.'));
  const nextStep=followup({stage,paused,closed,canContact,inbox,journey,program,caseBlocker,appointment,needsEvidence,context,alternative,preferred,checklist});
  const overdueFirst=journey.overdue && canContact && !inbox && !journey.reconciling;
  const recommendedAction=(overdueFirst?'Revisar primero la tarea vencida. ':'')+nextStep.detail;
  const choices=canContact && !inbox && !journey.reconciling ? questionsFor(stage,context,Boolean(alternative),caseBlocker) : [];
  const internalQuestions=inbox?['¿Qué pidió la persona y qué acción queda por acordar?']:
    closed?['¿El expediente conserva la evidencia que sustenta la etapa registrada?']:
    paused?['¿Se dejó constancia interna del motivo de la pausa?']:
    journey.reconciling?['¿Qué estado registró el proveedor para el seguimiento anterior?']:
    ['¿Qué información puede dejar lista el equipo para la próxima consulta entrante?'];
  const data={summary:'Etapa actual: '+stage+'. '+(program?'El expediente registra interés en '+program.title+'.':'Todavía falta confirmar una maestría de interés en el expediente.'),
    signals:evidence.map(item=>item.detail),evidence,blockers,nextStep,recommendedAction,
    questions:choices.length?choices.slice(0,3).map(k=>talkingPoints[k]):internalQuestions,draftEmail:'',mode:'catalogo'};
  const facts={etapa:stage,programa:program?.title||null,modalidad:program?.mode||null,duracion:program?.duration||null,
    herramientas:tools,horizonte:context.timeframe||null,areaOrientacion:context.area||null,modalidadPreferida:context.modality||null,
    comparaProgramas:Boolean(alternative || context.compared.length),tareasPendientes:Math.min(9,journey.pending),tareasVencidas:Math.min(9,journey.overdue),
    bloqueo:caseBlocker||null,citaRegistrada:appointment||null,intencionReciente:context.recentIntent||null,
    hitosVerificados:Object.entries({contacted:'contacto',programChosen:'programa_elegido',documentsReviewed:'documentacion',financingReviewed:'financiamiento'})
      .filter(([key])=>checklist[key]===true).map(([,label])=>label),
    correoAutorizado:email,vozAutorizada:voice,whatsappAutorizado:whatsapp,temasDisponibles:choices};
  const canDraft=choices.length>0 && email && !appointmentOpen && !needsEvidence;
  return {data,facts,choices,canDraft,program,stage};
}
function complete(brief,topics,status) {
  const {data,canDraft,program,stage}=brief;
  const questions=topics.length?topics.slice(0,3).map(k=>talkingPoints[k]):data.questions;
  let draftEmail='';
  if(canDraft) {
    const focus=program?' sobre '+program.title:' sobre los posgrados de Universidad Casa Grande';
    const next=stage==='En postulación'?'Podemos revisar contigo los requisitos de la convocatoria vigente.':
      stage==='Admitido'?'Podemos ayudarte a revisar los siguientes pasos administrativos de matrícula.':'Podemos orientarte con información de la universidad.';
    draftEmail='Hola,\n\nGracias por tu consulta'+focus+'. '+next+' '+questions[0]+'\n\nEquipo de Admisiones de Posgrados\nUniversidad Casa Grande';
  }
  return {...data,questions,draftEmail,mode:status==='aplicado'?'modelo':'catalogo',modelReview:modelInfo(status)};
}
function optionalRow(db,sql,...params) {
  return Promise.resolve().then(()=>db.prepare(sql).bind(...params).first()).catch(error=>{
    if(/no such table/i.test(error?.message||''))return null;
    throw error;
  });
}
async function readCase(db,id) {
  const q=sql=>db.prepare(sql).bind(id);
  const [primary,caseData,whatsapp,voice,appointment]=await Promise.all([
    db.batch([
      q('SELECT '+leadFields+' FROM leads WHERE id=?'),
      q('SELECT source,context,program,created_at FROM lead_submissions WHERE lead_id=? ORDER BY created_at DESC,id DESC LIMIT 20'),
      db.prepare(`SELECT COUNT(*) AS pending,COUNT(CASE WHEN datetime(due_at)<datetime('now') THEN 1 END) AS overdue,
        MIN(due_at) AS due_at,COUNT(CASE WHEN title=? THEN 1 END) AS email_open,COUNT(CASE WHEN title=? THEN 1 END) AS whatsapp_open,
        COUNT(CASE WHEN title=? THEN 1 END) AS voice_open FROM tasks WHERE lead_id=? AND status='pendiente'`)
        .bind(responseTasks.email,responseTasks.whatsapp,responseTasks.voice,id),
      q("SELECT COUNT(*) AS count FROM admissions_replies WHERE lead_id=? AND body_status<>'automática'"),
      q(`SELECT COUNT(CASE WHEN j.status='pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN j.status IN ('processing','uncertain') THEN 1 END) AS reconciling
        FROM jobs j JOIN leads l ON l.id=j.lead_id WHERE j.lead_id=? AND
        ((j.channel='email' AND l.consent_email=1) OR (j.channel='voice' AND l.consent_voice=1))`)
    ]),
    optionalRow(db,`SELECT blocker,checklist,decision_at,admission_evidence_id IS NOT NULL AS admitted,
      enrollment_evidence_id IS NOT NULL AS enrolled FROM admissions_cases WHERE lead_id=?`,id),
    optionalRow(db,`SELECT COUNT(*) AS allowed FROM whatsapp_consents c JOIN leads l ON c.lead_id=l.id AND c.phone=l.phone
       WHERE c.lead_id=? AND c.state='granted' AND NOT EXISTS (SELECT 1 FROM whatsapp_suppressions s WHERE s.phone=c.phone)
       AND NOT EXISTS (SELECT 1 FROM leads other WHERE other.phone=c.phone AND other.id<>c.lead_id)`,id),
    optionalRow(db,`SELECT COUNT(*) AS suppressed FROM leads l
      WHERE l.id=? AND (EXISTS (SELECT 1 FROM voice_suppressions s WHERE s.phone=l.phone) OR
      (l.phone<>'' AND EXISTS (SELECT 1 FROM leads other WHERE other.phone=l.phone AND other.id<>l.id)))`,id),
    optionalRow(db,`SELECT a.status,s.start_at,datetime(s.end_at)<datetime('now') AS expired FROM admissions_appointments a
      LEFT JOIN admissions_slots s ON a.slot_id=s.id WHERE a.lead_id=? AND a.status IN ('booked','requested','completed','no_show')
      AND (a.status IN ('booked','requested') OR datetime(a.updated_at)>=datetime('now','-60 days'))
      ORDER BY CASE WHEN a.status='booked' AND datetime(s.end_at)>=datetime('now') THEN 0 WHEN a.status='requested' THEN 1
      WHEN a.status='booked' THEN 2 ELSE 3 END,a.updated_at DESC,a.id LIMIT 1`,id)
  ]);
  return {lead:primary[0].results?.[0],receipts:primary[1].results||[],tasks:primary[2].results?.[0],
    reply:primary[3].results?.[0],jobs:primary[4].results?.[0],caseData,whatsapp,voice,appointment};
}
export async function handleAdvisor(request,env,url,programs,operator) {
  const match=/^\/api\/staff\/leads\/([A-Za-z0-9_-]{1,128})\/brief\/?$/.exec(url.pathname);
  if(!match)return null;
  if(!operator)return json({error:'Se requiere acceso al equipo de admisiones.'},403);
  if(request.method!=='POST')return json({error:'Este recurso se prepara mediante POST.'},405);
  if(!env.DB)return json({error:'El expediente no está disponible en este momento.'},503);
  const id=match[1],initial=await readCase(env.DB,id);
  if(!initial.lead)return json({error:'No encontramos el expediente solicitado.'},404);
  const brief=buildBrief(initial.lead,initial,programs);
  if(brief.choices.length<2)return json(complete(brief,brief.choices,'no_aplica'));
  if(!activeAI(env))return json(complete(brief,brief.choices,'sin_configurar'));
  const review=await reserveModelReview(env,'expediente',id,operator);
  if(!review.id)return json(complete(brief,brief.choices,review.status));
  let topics=brief.choices,status='fallo',selected;
  try {
    const answer=await aiText(env,'Ordena los temas para preparar una conversación de orientación de Posgrados UCG. Usa etapa, herramientas y próximos hitos de los hechos compartidos. Devuelve solo un arreglo JSON con una a tres claves distintas de temasDisponibles. Evita texto libre e indicaciones de contacto.',JSON.stringify(brief.facts),180);
    selected=JSON.parse(answer);
    if(Array.isArray(selected) && selected.length && selected.length<=3 && new Set(selected).size===selected.length && selected.every(key=>brief.choices.includes(key))) {
      topics=[...new Set([...selected,...topics])];status='aplicado';
    }
  } catch {/* Keep the verified preparation and report the failed review. */}
  const current=await readCase(env.DB,id);
  if(!current.lead) {
    await finishModelReview(env,review.id,'desactualizado');
    return json({error:'No encontramos el expediente solicitado.'},404);
  }
  const refreshed=buildBrief(current.lead,current,programs);
  const changed=current.lead.revision!==initial.lead.revision || JSON.stringify(refreshed)!==JSON.stringify(brief);
  if(changed) {
    await finishModelReview(env,review.id,'desactualizado');
    return json(complete(refreshed,refreshed.choices,'desactualizado'));
  }
  await finishModelReview(env,review.id,status,status==='aplicado'?selected:[]);
  return json(complete(brief,topics,status));
}
