import {activeAI, aiText, all, digest, eligibleQuery, gscReady, normalized, now, select, semrushReady, ServiceError} from './providers.js';

const searchConsole='Google Search Console';
const semrush='Semrush';
const day=86400000;
const windowDays=28;
const sourceKinds=[searchConsole,semrush];
const intentLabels={
  requisitos:'Requisitos y postulación',
  inversion:'Inversión y pago',
  modalidad:'Modalidad y horarios',
  plan:'Plan de estudios',
  comparacion:'Selección de maestría'
};
const transitions={
  aprobar:{from:['propuesta'],to:'aprobada'},
  iniciar:{from:['aprobada'],to:'activa'},
  cerrar:{from:['activa'],to:'cerrada'},
  descartar:{from:['propuesta','aprobada'],to:'descartada'}
};
const labels={
  propuesta:'Campaña registrada como propuesta para revisión.',
  aprobada:'Propuesta aprobada. El equipo puede preparar su lanzamiento.',
  activa:'Medición de campaña iniciada. El enlace está disponible para el equipo.',
  cerrada:'Medición de campaña cerrada y registrada.',
  descartada:'Propuesta descartada.'
};
const stopWords=new Set('universidad casa grande ecuador guayaquil maestria maestrias posgrado posgrados posgrado master mba flex mencion en de y del el la los las por para con online linea modalidad maestrias precio costo requisitos requisitos programa como mejores cuanto estudiar admision inscripciones horarios informacion'.split(' '));
const words=s=>[...new Set(normalized(s).match(/[a-z]{2,}/g)||[])].filter(w=>!stopWords.has(w));
const shift=(date,days)=>new Date(Date.parse(date)+days*day).toISOString();
const num=v=>typeof v==='number' && Number.isFinite(v) && v>=0?v:null;
const auditStatus={
  aplicado:'El modelo eligió un enfoque entre las opciones verificadas. La decisión queda a cargo del equipo.',
  sin_configurar:'Se preparó con reglas verificables del portal. El modelo está sin configurar.',
  no_aplica:'Se preparó con reglas y datos del portal.',
  fallo:'Se conservó la propuesta basada en datos. La revisión del modelo quedó registrada como fallida.',
  limite:'Se preparó con reglas del portal. Se alcanzó el cupo de revisiones de hoy.',
  desactualizado:'Se volvió a preparar con los datos actuales después de un cambio durante la revisión.'
};
export const modelInfo=status=>({status,detail:auditStatus[status]});
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

export async function reserveModelReview(env,scope,subject,operator) {
  const provider=activeAI(env);
  if(!provider)return {status:'sin_configurar'};
  const date=now(),id=crypto.randomUUID(),limit=scope==='expediente'?80:20;
  const row=await select(env.DB,`INSERT INTO intelligence_audit(id,scope,subject,actor,provider,status,created_at)
    SELECT ?,?,?,?,?,'en_curso',? WHERE (SELECT COUNT(*) FROM intelligence_audit WHERE scope=? AND created_at>=?)<?
    RETURNING id`,id,scope,subject,String(operator).slice(0,180),provider,date,scope,date.slice(0,10),limit).first();
  return row?{id,status:'en_curso'}:{status:'limite'};
}
export async function finishModelReview(env,id,status,chosen=[]) {
  if(id)await select(env.DB,'UPDATE intelligence_audit SET status=?,chosen=?,finished_at=? WHERE id=? AND status=\'en_curso\'',status,JSON.stringify(chosen),now(),id).run();
}

function intentFor(query) {
  const q=normalized(query);
  if(/\b(requisit\w*|document\w*|admision|postul\w*|inscri\w*|convocatoria)\b/.test(q))return 'requisitos';
  if(/\b(precio|costo|cuota\w*|beca\w*|inversion|financiamiento|arancel)\b/.test(q))return 'inversion';
  if(/\b(modalidad|horario\w*|virtual|semipresencial|presencial|hibrid\w*|online|linea|duracion)\b/.test(q))return 'modalidad';
  if(/\b(malla|curricul\w*|materia\w*|plan|asignatura\w*)\b/.test(q))return 'plan';
  return 'comparacion';
}
function mapProgram(query,programs) {
  const queryWords=words(query), titles=programs.map(program=>({program,terms:words([program.title,program.shortTitle,program.slug].join(' '))}));
  const inTitle=term=>titles.filter(item=>item.terms.includes(term)).length;
  const ranked=titles.map(({program,terms})=>{
    const common=queryWords.filter(term=>terms.includes(term));
    const score=common.reduce((total,term)=>total+(inTitle(term)===1?3:inTitle(term)<=3?1.5:1),0);
    return {program,score};
  }).sort((a,b)=>b.score-a.score);
  const [best,alternate]=ranked;
  return best?.score>=3 && best.score>(alternate?.score||0)?best.program:null;
}
function boardPeriod(asOf) {
  return {start:shift(asOf,1-windowDays).slice(0,10),end:asOf.slice(0,10),days:windowDays};
}
const utcDay=date=>date+'T00:00:00.000Z';
const trackedCampaign="CASE WHEN json_valid(s.context) THEN json_extract(s.context,'$.utm_campaign') END";
const campaignMarker="CASE WHEN json_valid(s.context) THEN COALESCE(NULLIF(TRIM(json_extract(s.context,'$.utm_source')),''),NULLIF(TRIM(json_extract(s.context,'$.utm_campaign')),'')) END";
const programCounts=groupedProgram=>`
  SELECT ${groupedProgram} AS program,COUNT(*) AS requests,COUNT(DISTINCT s.lead_id) AS leads,
    COUNT(DISTINCT CASE WHEN l.program=s.program AND l.stage IN ('En postulación','Admitido','Matriculado') THEN s.lead_id END) AS advanced,
    COUNT(DISTINCT CASE WHEN l.program=s.program AND l.stage='Matriculado' AND ac.enrollment_evidence_id IS NOT NULL THEN s.lead_id END) AS enrolled,
    COUNT(DISTINCT CASE WHEN ${campaignMarker} IS NOT NULL THEN s.lead_id END) AS attributed
  FROM lead_submissions s JOIN leads l ON l.id=s.lead_id LEFT JOIN admissions_cases ac ON ac.lead_id=l.id WHERE s.created_at>=? AND s.created_at<? GROUP BY 1`;

function sourceStatus(env,rows,asOf) {
  return sourceKinds.map(source=>{
    const row=rows.find(item=>item.source===source);
    const connected=source===searchConsole?gscReady(env):semrushReady(env);
    if(!row)return {source,status:connected?'pendiente':'sin_configurar',detail:connected?'A la espera de la primera sincronización.':'Conecta la fuente para importar datos reales.',syncedAt:null};
    if(row.status!=='ok')return {source,status:'error',detail:'La última sincronización falló. Se requiere revisar la conexión.',syncedAt:row.synced_at};
    if(!(Date.parse(row.synced_at)>=Date.parse(shift(asOf,-14))))return {source,status:'desactualizado',detail:'La última sincronización válida supera los catorce días.',syncedAt:row.synced_at};
    return {source,status:row.total>0?'vigente':'sin_datos',detail:row.total>0?row.total+' consultas pertinentes en la importación.':'La importación no encontró consultas pertinentes.',syncedAt:row.synced_at};
  });
}
function programmeStat(program,m) {
  return {program:program?.slug||'',title:program?.title||'Sin programa identificado',leads:m?.leads||0,
    requests:m?.requests||0,advanced:m?.advanced||0,enrolled:m?.enrolled||0,attributed:m?.attributed||0};
}
function contentFor(op,articles,program,intent) {
  let item=op?articles.find(a=>a.opportunity_id===op.id):null;
  if(!item && op) {
    const related=articles.filter(a=>a.status!=='archived' &&
      (normalized(a.source_query)===normalized(op.query) || (program && a.program===program.slug && intentFor(a.source_query)===intent)));
    item=related.find(a=>a.status==='published')||related[0];
  }
  return {status:item?.status||'none',articleId:item?.id||null,slug:item?.slug||null,related:Boolean(item && item.opportunity_id!==op?.id)};
}
function actionFor(source,program,intent,content) {
  if(!program)return 'Validar qué ficha responde a esta consulta antes de decidir un contenido.';
  if(content.status==='published')return 'Revisar la guía publicada y su enlace a la ficha antes de preparar contenido adicional.';
  if(content.status==='draft')return 'Revisar el borrador existente y contrastarlo con la ficha oficial.';
  if(content.status==='archived')return 'Revisar el motivo del archivo y la vigencia del tema antes de reabrir la guía.';
  if(source==='Portal UCG')return 'Revisar el paso de la ficha a la solicitud y probar una llamada a la acción con enlace medible.';
  if(['modalidad','requisitos','inversion','plan'].includes(intent))return 'Mejorar la respuesta en la ficha oficial y comprobar la vigencia de sus datos antes de preparar una guía.';
  return 'Revisar las fichas relacionadas y preparar un comparativo para revisión editorial.';
}
function scoreFor(source,op,stat,program,content) {
  const reasons=[];
  let score=0;
  if(source===searchConsole) {
    const impressions=num(op.impressions),position=num(op.position),ctr=num(op.ctr);
    if(impressions>0 && ctr!==null && ctr<=1) {
      score+=Math.min(40,Math.round(Math.log1p(impressions)*5*(1-ctr)));
      if(position>=4 && position<=25) {score+=12;reasons.push('Posición media entre 4 y 25 en Search Console.');}
      reasons.push(impressions+' impresiones y '+(num(op.clicks)??'sin cifra de')+' clics en la propiedad.');
    }
  }
  if(source===semrush && num(op.volume)>0) {
    score+=Math.min(22,Math.round(Math.log1p(op.volume)*3));
    if(op.position>=4 && op.position<=25)score+=6;
    reasons.push('Volumen estimado de '+op.volume+' en el mercado configurado en Semrush.');
  }
  if(stat.leads) {
    score+=Math.min(24,Math.round(Math.log1p(stat.leads)*7));
    reasons.push(stat.leads+' aspirantes únicos solicitaron información sobre el programa.');
    if(source==='Portal UCG' && stat.leads>=5 && stat.attributed/stat.leads<.5) {
      score+=8;
      reasons.push('Menos de la mitad de los aspirantes tiene un marcador de campaña en su solicitud.');
    }
  }
  if(program) {score+=10;reasons.push('La acción puede apoyarse en una ficha verificada.');}
  if(content.status==='draft') {score+=6;reasons.push('Hay un borrador pendiente de revisión.');}
  if(content.status==='published') {score-=8;reasons.push('La guía publicada permite revisar la cobertura primero.');}
  return {score:Math.max(0,score),reasons};
}
function candidateFor(op,program,stat,articles) {
  const source=op?.source||'Portal UCG';
  const intent=intentFor(op?.query||'');
  const content=contentFor(op,articles,program,intent);
  return {id:op?'seo:'+op.id:'programa:'+program.slug,program:program?.slug||null,title:program?.title||'Posgrados UCG',
    source,query:op?.query||null,intent:intentLabels[intent],content,action:actionFor(source,program,intent,content),
    ...scoreFor(source,op,stat,program,content),
    metrics:{clicks:num(op?.clicks),impressions:num(op?.impressions),ctr:num(op?.ctr),position:num(op?.position),volume:num(op?.volume),
      leads:stat.leads,requests:stat.requests,advanced:stat.advanced,enrolled:stat.enrolled,attributed:stat.attributed},
    opportunityId:op?.id||null,periodStart:op?.period_start||null,periodEnd:op?.period_end||null};
}
const gaps=[
  'Las consultas de Search Console corresponden a la propiedad y al período indicados. La importación actual no incluye páginas de destino.',
  'Semrush aporta estimaciones de su mercado. Se muestran aparte de las impresiones y los clics observados.',
  'El CRM cuenta personas distintas por programa solicitado. Una persona puede aparecer en varios programas. Los avances reflejan la etapa actual del mismo programa. Las matrículas contabilizadas tienen un respaldo registrado en el CRM.',
  'La importación registra búsqueda y solicitudes en fuentes separadas. Los marcadores dependen del navegador. Para estimar costo, tasa de conversión o efecto incremental hacen falta datos de gasto, visitas elegibles y diseño experimental.',
  'El recuento del piloto describe solicitudes asociadas al enlace. La línea base contextual es el volumen del programa antes del inicio.'
];
async function boardEvidence(env,programs,asOf) {
  const window=boardPeriod(asOf);
  const slugs=programs.map(program=>program.slug);
  const grouped=slugs.length?"CASE WHEN s.program IN ("+slugs.map(()=>'?').join(',')+") THEN s.program ELSE '' END":"''";
  const [aggregates,opportunities,articles,sourceRows]=await Promise.all([
    all(env.DB,programCounts(grouped),...slugs,utcDay(window.start),utcDay(shift(asOf,1).slice(0,10))),
    all(env.DB,'SELECT * FROM seo_opportunities ORDER BY priority DESC,id LIMIT 100'),
    all(env.DB,"SELECT id,opportunity_id,program,slug,status,source_query FROM seo_articles ORDER BY updated_at DESC LIMIT 500"),
    all(env.DB,'SELECT source,synced_at,status,total FROM growth_sync')
  ]);
  const sources=sourceStatus(env,sourceRows,asOf);
  const ps=programs.map(program=>programmeStat(program,aggregates.find(row=>row.program===program.slug)));
  const unidentified=aggregates.find(item=>item.program==='');
  if(unidentified)ps.push(programmeStat(null,unidentified));
  const imported=opportunities.filter(op=>eligibleQuery(op.query,programs) &&
    sources.some(s=>s.source===op.source && s.status==='vigente' && s.syncedAt===op.updated_at));
  const candidates=imported.map(op=>{
    const match=mapProgram(op.query,programs);
    return candidateFor(op,match,match?ps.find(p=>p.program===match.slug):programmeStat(null),articles);
  });
  const internal=programs.filter(p=>ps.some(row=>row.program===p.slug && row.leads>0));
  for(const program of internal)candidates.push(candidateFor(null,program,ps.find(p=>p.program===program.slug),articles));
  candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  ps.sort((a,b)=>b.leads-a.leads||a.title.localeCompare(b.title,'es'));
  return {window,sources,gaps,programs:ps,candidates};
}
const approachDetails={
  ficha:'Resolver la pregunta con la información oficial en la ficha del programa y enlazar su formulario de orientación.',
  revision:'Verificar la vigencia de la guía existente y alinear su enlace de orientación con la ficha oficial.',
  comparativo:'Contrastar opciones verificables y explicar a quién le conviene revisar cada ficha.',
  medicion:'Usar un enlace identificado en una sola pieza para observar las solicitudes asociadas.'
};
function approaches(candidate) {
  if(!candidate.program)return [];
  if(candidate.content.status!=='none')return ['revision','medicion'];
  if(candidate.source==='Portal UCG')return ['medicion','ficha'];
  return candidate.intent===intentLabels.comparacion?['comparativo','ficha']:['ficha','medicion'];
}
function campaignBrief(candidate,asOf,choice,status) {
  const canTrack=Boolean(candidate.program);
  return {
    title:(candidate.query?candidate.intent:'Captación desde la ficha')+' · '+candidate.title,
    action:candidate.action+(choice?' '+approachDetails[choice]:''),
    audience:'Personas que exploran '+(canTrack?candidate.title:'la oferta de posgrados')+'.',
    hypothesis:canTrack?'Una respuesta que resuelva la consulta y ofrezca orientación desde la ficha generará al menos una solicitud asociada al enlace identificado durante los primeros 28 días.':
      'Tras confirmar la relación de la consulta con una maestría se podrá definir un piloto y su indicador.',
    metric:canTrack?'Aspirantes únicos que solicitan este programa y llegan con el código de campaña.':'Consulta asignada a una ficha y validada por el equipo.',
    windowDays,
    nextReview:shift(asOf,windowDays).slice(0,10),
    verification:canTrack?'Registrar la pieza y su fecha de difusión. Comparar con la línea base del programa como contexto y revisar la cobertura de atribución.':
      'Comprobar qué ficha oficial responde a la intención y revisar si ya existe contenido.',
    modelReview:modelInfo(status)
  };
}
async function previewBrief(env,candidate,programs,operator) {
  const choices=approaches(candidate);
  let status=choices.length?'sin_configurar':'no_aplica',selected=choices[0];
  const date=now();
  let reviewId=null;
  if(choices.length && activeAI(env)) {
    const review=await reserveModelReview(env,'campaña',candidate.id,operator);
    status=review.status;
    if(review.id) {
      const facts={programa:candidate.title,intencion:candidate.intent,fuente:candidate.source,
        estadoContenido:candidate.content.status,demandaPortal:candidate.metrics.leads>=10?'diez_o_más':candidate.metrics.leads?'una_a_nueve':'sin_solicitudes',
        mejorasDisponibles:choices};
      try {
        const answer=JSON.parse(await aiText(env,'Ayuda al equipo de Posgrados UCG a elegir un enfoque para una prueba de captación. Usa únicamente el objeto de hechos. Devuelve solamente una clave JSON de mejorasDisponibles. No redactes texto libre ni supongas resultados.',JSON.stringify(facts),100));
        if(!choices.includes(answer))throw new Error('Opción inválida');
        status='aplicado';
        selected=answer;
      } catch {
        status='fallo';
      }
      if(status==='aplicado') {
        const current=(await boardEvidence(env,programs,now())).candidates.find(c=>c.id===candidate.id);
        if(!current || JSON.stringify(current)!==JSON.stringify(candidate)) {
          status='desactualizado';
          await finishModelReview(env,review.id,status);
          if(!current)throw new ServiceError('La evidencia cambió durante la revisión. Actualiza el tablero.',409);
          return {brief:campaignBrief(current,now(),approaches(current)[0],status),reviewId:null};
        }
      }
      await finishModelReview(env,review.id,status,status==='aplicado'?[selected,await digest(JSON.stringify(candidate))]:[]);
      if(status==='aplicado')reviewId=review.id;
    }
  }
  return {brief:campaignBrief(candidate,date,selected,status),reviewId};
}

const campaignSelect='SELECT * FROM intelligence_campaigns';
const campaignIdPattern='[a-f0-9-]{36}';
function campaignView(row,history) {
  const brief=JSON.parse(row.brief);
  const deadline=row.started_at?shift(row.started_at,brief.windowDays):null;
  const href=['aprobada','activa','cerrada'].includes(row.state)
    ?'/programas/'+encodeURIComponent(row.program)+'?'+new URLSearchParams({utm_source:'ucg',utm_medium:'campana',utm_campaign:row.id}):null;
  return {id:row.id,candidateId:row.candidate_id,program:row.program,title:row.title,state:row.state,revision:row.revision,launchUrl:href,
    createdAt:row.created_at,updatedAt:row.updated_at,startedAt:row.started_at,endedAt:row.ended_at,
    brief:{...brief,nextReview:deadline?.slice(0,10)||brief.nextReview},
    measurement:{leadCount:row.lead_count,requestCount:row.request_count,enrolledCount:row.enrolled_count,measuredAt:row.measured_at,
      baselineProgramLeads:row.baseline_program_leads,start:row.started_at,end:row.ended_at && deadline && row.ended_at<deadline?row.ended_at:deadline},
    history:history.filter(event=>event.campaign_id===row.id).map(({action,at,actor})=>({action,at,actor}))};
}
async function historyFor(db,id) {
  return all(db,'SELECT campaign_id,action,actor,at FROM intelligence_campaign_history WHERE campaign_id=? ORDER BY at DESC,id DESC',id);
}
async function currentCampaign(db,id) {
  const row=await select(db,campaignSelect+' WHERE id=?',id).first();
  return row?campaignView(row,await historyFor(db,id)):null;
}
async function board(env,programs) {
  const asOf=now();
  const [evidence,rows,audit]=await Promise.all([
    boardEvidence(env,programs,asOf),
    all(env.DB,campaignSelect+" ORDER BY CASE WHEN state IN ('activa','aprobada','propuesta') THEN 0 ELSE 1 END,updated_at DESC LIMIT 100"),
    all(env.DB,`SELECT h.campaign_id,h.action,h.actor,h.at FROM intelligence_campaign_history h JOIN
      (SELECT id FROM intelligence_campaigns ORDER BY CASE WHEN state IN ('activa','aprobada','propuesta') THEN 0 ELSE 1 END,updated_at DESC LIMIT 100) c
      ON c.id=h.campaign_id ORDER BY h.at DESC,h.id DESC`)
  ]);
  const campaigns=rows.map(row=>campaignView(row,audit));
  const candidates=evidence.candidates.map(item=>({...item,campaignId:campaigns.find(c=>c.candidateId===item.id)?.id||null}));
  return {...evidence,candidates,campaigns};
}
async function readInput(request) {
  const limit=1200;
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))throw new ServiceError('Envía los datos en formato JSON.',415);
  if(Number(request.headers.get('Content-Length'))>limit)throw new ServiceError('La solicitud supera el límite permitido.',413);
  const reader=request.body?.getReader();
  if(!reader)throw new ServiceError('Faltan los datos de la solicitud.',400);
  const decoder=new TextDecoder();
  let size=0,raw='';
  while(true) {
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>limit) {
      await reader.cancel();
      throw new ServiceError('La solicitud supera el límite permitido.',413);
    }
    raw+=decoder.decode(value,{stream:true});
  }
  try {
    const data=JSON.parse(raw+decoder.decode());
    if(data && typeof data==='object' && !Array.isArray(data))return data;
  }catch{/* Reuse the same validation response for malformed JSON. */}
  throw new ServiceError('Envía un objeto JSON válido.',400);
}
async function findCandidate(env,programs,candidateId) {
  if(typeof candidateId!=='string' || !/^(seo|programa):[a-zA-Z0-9_-]{1,160}$/.test(candidateId))
    throw new ServiceError('Selecciona una oportunidad del tablero.',400);
  const candidate=(await boardEvidence(env,programs,now())).candidates.find(row=>row.id===candidateId);
  if(!candidate)throw new ServiceError('No encontramos una oportunidad vigente. Actualiza el tablero.',404);
  return candidate;
}
async function createCampaign(env,programs,input,operator) {
  const db=env.DB,actor=String(operator).slice(0,180);
  const already=await select(db,campaignSelect+' WHERE candidate_id=?',typeof input.candidateId==='string'?input.candidateId.slice(0,172):'').first();
  if(already)return {campaign:campaignView(already,await historyFor(db,already.id)),message:'La oportunidad ya tiene una campaña registrada.'};
  const candidate=await findCandidate(env,programs,input.candidateId);
  if(!candidate.program)throw new ServiceError('Valida la correspondencia con una maestría antes de registrar una campaña.',422);
  const date=now(),id=crypto.randomUUID(),allowed=approaches(candidate);
  let status=activeAI(env)?'no_aplica':'sin_configurar',choice=allowed[0];
  if(input.reviewId) {
    if(typeof input.reviewId!=='string' || !new RegExp('^'+campaignIdPattern+'$').test(input.reviewId))
      throw new ServiceError('La revisión del modelo no es válida.',400);
    const review=await select(db,`SELECT chosen FROM intelligence_audit WHERE id=? AND scope='campaña' AND subject=?
      AND actor=? AND status='aplicado' AND created_at>=?`,input.reviewId,candidate.id,actor,shift(date,-1)).first();
    const [savedChoice,fingerprint]=JSON.parse(review?.chosen||'[]');
    if(!allowed.includes(savedChoice) || fingerprint!==await digest(JSON.stringify(candidate)))
      throw new ServiceError('La revisión cambió o caducó. Prepara un resumen actualizado.',409);
    status='aplicado';choice=savedChoice;
  }
  const brief=campaignBrief(candidate,date,choice,status);
  await db.batch([
    select(db,`INSERT INTO intelligence_campaigns(id,candidate_id,program,title,state,brief,created_at,updated_at)
      VALUES(?,?,?,?,'propuesta',?,?,?) ON CONFLICT(candidate_id) DO NOTHING`,id,candidate.id,candidate.program,brief.title,JSON.stringify(brief),date,date),
    select(db,`INSERT INTO intelligence_campaign_history(id,campaign_id,action,actor,at)
      SELECT ?,id,'proponer',?,? FROM intelligence_campaigns WHERE id=?`,crypto.randomUUID(),actor,date,id)
  ]);
  const created=await select(db,campaignSelect+' WHERE candidate_id=?',candidate.id).first();
  return {campaign:campaignView(created,await historyFor(db,created.id)),message:created.id===id?labels.propuesta:'La oportunidad ya tiene una campaña registrada.'};
}
async function measurement(db,campaign,asOf) {
  const deadline=shift(campaign.started_at,windowDays);
  const end=asOf<deadline?asOf:deadline;
  return select(db,`SELECT COUNT(*) AS request_count,COUNT(DISTINCT s.lead_id) AS lead_count,
    COUNT(DISTINCT CASE WHEN l.program=s.program AND l.stage='Matriculado' AND ac.enrollment_evidence_id IS NOT NULL THEN l.id END) AS enrolled_count
    FROM lead_submissions s JOIN leads l ON l.id=s.lead_id LEFT JOIN admissions_cases ac ON ac.lead_id=l.id
    WHERE s.program=? AND s.created_at>=? AND s.created_at<? AND ${trackedCampaign}=?`,campaign.program,campaign.started_at,end,campaign.id).first();
}
async function changeCampaign(env,id,input,operator,programs) {
  const db=env.DB,action=input.action,revision=input.revision;
  if(typeof action!=='string' || !Object.hasOwn(transitions,action) || !Number.isSafeInteger(revision) || revision<1)
    throw new ServiceError('Indica una decisión válida y la revisión vigente de la campaña.',422);
  const row=await select(db,campaignSelect+' WHERE id=?',id).first();
  if(!row)throw new ServiceError('No encontramos esta campaña.',404);
  if(row.revision!==revision)throw new ServiceError('La campaña cambió. Actualiza el tablero.',409);
  const transition=transitions[action];
  if(['aprobar','iniciar'].includes(action) && !programs.some(program=>program.slug===row.program))
    throw new ServiceError('Verifica que la ficha siga vigente antes de aprobar o iniciar la campaña.',409);
  if(!transition.from.includes(row.state))throw new ServiceError('La decisión no corresponde al estado actual de la campaña.',409);
  const date=now();
  const started=action==='iniciar'?date:row.started_at;
  const ended=action==='cerrar'?date:row.ended_at;
  const actor=String(operator).slice(0,180);
  let baseline=row.baseline_program_leads;
  let metrics={lead_count:row.lead_count,request_count:row.request_count,enrolled_count:row.enrolled_count};
  if(action==='iniciar') baseline=(await select(db,`SELECT COUNT(DISTINCT lead_id) AS n FROM lead_submissions
    WHERE program=? AND created_at>=? AND created_at<?`,row.program,shift(date,-windowDays),date).first()).n;
  if(action==='cerrar')metrics=await measurement(db,row,date);
  const reviewed=action==='cerrar'||action==='iniciar'?date:row.measured_at;
  const [,changed]=await db.batch([
    select(db,`INSERT INTO intelligence_campaign_history(id,campaign_id,action,actor,at)
      SELECT ?,id,?,?,? FROM intelligence_campaigns WHERE id=? AND revision=?`,crypto.randomUUID(),action,actor,date,id,revision),
    select(db,`UPDATE intelligence_campaigns SET state=?,updated_at=?,revision=revision+1,started_at=?,ended_at=?,measured_at=?,
      baseline_program_leads=?,lead_count=?,request_count=?,enrolled_count=? WHERE id=? AND revision=?`,
    transition.to,date,started,ended,reviewed,baseline,metrics.lead_count,metrics.request_count,metrics.enrolled_count,id,revision)
  ]);
  if(!changed.meta?.changes)throw new ServiceError('La campaña cambió. Actualiza el tablero.',409);
  return {campaign:await currentCampaign(db,id),message:labels[transition.to]};
}
export async function runIntelligenceCycle(env) {
  if(!env.DB)return {status:'sin_configurar',message:'Falta el registro de campañas.'};
  const asOf=now();
  const active=await all(env.DB,campaignSelect+" WHERE state='activa' ORDER BY measured_at,id LIMIT 20");
  let measured=0;
  for(const row of active) {
    const counts=await measurement(env.DB,row,asOf);
    const result=await select(env.DB,`UPDATE intelligence_campaigns SET measured_at=?,lead_count=?,request_count=?,enrolled_count=?
      WHERE id=? AND state='activa' AND revision=? AND (measured_at IS NULL OR measured_at<?)`,
    asOf,counts.lead_count,counts.request_count,counts.enrolled_count,row.id,row.revision,asOf).run();
    measured+=result.meta?.changes||0;
  }
  return {status:'completado',measured,message:measured+' campañas con medición actualizada. Las decisiones pendientes quedan en el tablero.'};
}
export async function handleIntelligence(request,env,url,programs,operator) {
  const base='/api/staff/intelligence',path=url.pathname.replace(/\/$/,'');
  const match=new RegExp('^'+base+'/campaigns/('+campaignIdPattern+')$').exec(path);
  if(![base,base+'/brief',base+'/campaigns'].includes(path) && !match)return null;
  if(!operator)return json({error:'Se requiere acceso al equipo de admisiones.'},403);
  if(request.method!==(path===base?'GET':'POST'))return json({error:'Método no habilitado para esta acción.'},405);
  if(!env.DB)return json({error:'El tablero de captación no está disponible en este momento.'},503);
  try {
    if(path===base)return json(await board(env,programs));
    const input=await readInput(request);
    if(path===base+'/brief')return json(await previewBrief(env,await findCandidate(env,programs,input.candidateId),programs,operator));
    if(path===base+'/campaigns')return json(await createCampaign(env,programs,input,operator));
    return json(await changeCampaign(env,match[1],input,operator,programs));
  }catch(error) {
    if(error instanceof ServiceError)return json({error:error.message},error.status);
    return json({error:'No se pudo completar la operación del tablero de captación.'},503);
  }
}
