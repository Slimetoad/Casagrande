import {activeAI, aiText, digest, eligibleQuery, normalized, publicOrigin} from './providers.js';
import {InputError, tableExists} from './workspace.js';
import {checkEditorialSource, continuationProposal, continuationTopic, draftEditorialArticle, editorialProposal} from './editorial-draft.js';
import {cmsConfig, mirrorEditorial} from './editorial-cms.js';

const hour=3600000;
const weekSlots=3;
const gapHours=20;
const weights={demand:50,crm:25,gap:25};
const slotHours=[0,48,96];
const stmt=(db,sql,...args)=>args.length?db.prepare(sql).bind(...args):db.prepare(sql);
const first=(db,sql,...args)=>stmt(db,sql,...args).first();
const all=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
const parse=value=>{try{return JSON.parse(value)||{};}catch{return {};}};
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const error=(status,message)=>json({error:message},status);
const weekOf=date=>{
  const local=new Date(date.valueOf()-5*hour);
  local.setUTCDate(local.getUTCDate()-(local.getUTCDay()+6)%7);
  return local.toISOString().slice(0,10);
};
const catalogSource={label:'Catálogo institucional UCG',status:'verified',detail:'Ficha oficial y datos académicos verificados en el catálogo del portal.'};
const validWeek=week=>typeof week==='string' && /^\d{4}-\d{2}-\d{2}$/.test(week) && Number.isFinite(Date.parse(week)) && weekOf(new Date(week+'T17:00:00Z'))===week;
const dueIso=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const articleKey=plan=>'editorial:'+plan.id;
const cmsKey=(plan,version)=>articleKey(plan)+':'+version;
const scores=value=>Math.max(0,Number.isFinite(value)?value:0);
const capLog=(n,max)=>Math.min(1,Math.log1p(scores(n))/Math.log1p(max));

const planJoin=`SELECT p.*,a.id article_id,a.slug article_slug,a.title article_title,a.summary article_summary,
  a.body article_body,a.status article_status,a.updated_at article_updated_at,a.published_at article_published_at,
  j.status cms_status,j.official_url,j.receipt_id,j.last_error
  FROM seo_editorial_plan p LEFT JOIN seo_articles a ON a.opportunity_id='editorial:'||p.id
  LEFT JOIN seo_editorial_cms j ON j.plan_id=p.id AND j.version=p.published_revision`;

function weeklySchedule(items,existing,current) {
  const reserved=existing.map(item=>item.scheduled_at || item.article_published_at).filter(Boolean);
  const occupancy=reserved.map(date=>Date.parse(date)).filter(Number.isFinite);
  const assigned=new Map();
  const now=current.valueOf();
  const starting=Date.parse(weekOf(current)+'T15:00:00Z');
  const sameWeekLimit=iso=>occupancy.filter(date=>weekOf(new Date(date))===weekOf(new Date(iso))).length>=weekSlots;
  const open=date=>!sameWeekLimit(date) && !occupancy.some(other=>Math.abs(other-date)<gapHours*hour);
  function place(date) {
    let i=items.findIndex(item=>item.cluster!==last);
    if (i<0) i=0;
    const [chosen]=items.splice(i,1);
    occupancy.push(date);
    assigned.set(chosen.id,new Date(date).toISOString());
    last=chosen.cluster;
  }
  let last='';
  const anyPublished=existing.some(item=>item.article_published_at);
  if (items.length && !anyPublished && open(now)) place(now);
  for (let week=0;week<24 && items.length;week++) {
    for (const shift of slotHours) {
      if (!items.length) break;
      const slot=starting+hour*(week*168+shift);
      if (slot>now && open(slot)) place(slot);
    }
  }
  return assigned;
}

function safeSearch(row,program,source) {
  const keyword=row?.keyword || row?.query;
  if (!eligibleQuery(keyword,[program])) return null;
  const number=value=>typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
  const type=/Search Console/.test(source)?'measured':row.sourceKey==='rank'?'rank':'estimate';
  return {
    keyword,source,type,sourceKey:row.sourceKey || null,shareable:row.trustedEstimate===true && row.sourceKey==='keyword_generator',
    sourceUrl:row.sourceUrl==='https://openseo.so/keyword-generator'?row.sourceUrl:null,
    observedAt:row.observedAt || row.updated_at || null,
    periodStart:row.periodStart || row.period_start || null,periodEnd:row.periodEnd || row.period_end || null,
    volume:number(row.volume),difficulty:number(row.difficulty),impressions:number(row.impressions),clicks:number(row.clicks),
    position:number(row.position)
  };
}

function exactSearchMatch(query,program) {
  const n=value=>' '+normalized(value || '').replace(/[^a-z0-9]+/g,' ').trim()+' ';
  const aliases=[program.title?.split(':')[0].replace(/^Maestría en /i,''),program.shortTitle,program.degree];
  if (program.slug==='maestria-en-ia-y-ciencia-de-datos') aliases.push('inteligencia artificial','maestria en ia');
  if (program.slug==='maestria-en-administracion-de-empresas') aliases.push('mba');
  return aliases.some(alias=>alias?.length>=3 && n(query).includes(n(alias)));
}

function signalWeight(search) {
  if (!search) return 0;
  if (search.type==='measured') return capLog(search.impressions,1500)*0.85+capLog(search.clicks,150)*0.15;
  if (search.type==='rank') return search.position===null?0:Math.min(0.25,search.position/160);
  return capLog(search.volume,700);
}

async function seoEvidence(db) {
  try {
    const {readOpenSeoMetrics}=await import('./openseo.js');
    return readOpenSeoMetrics ? await readOpenSeoMetrics(db) : {programs:[],sources:[]};
  } catch { return {programs:[],sources:[]}; }
}

async function buildPlans(db,programs,current) {
  const from=new Date(current.valueOf()-90*24*hour).toISOString();
  const searchEvidence=await seoEvidence(db);
  const admissions=await tableExists(db,'admissions_cases');
  const [traffic,coverage,queries]=await db.batch([
    stmt(db,`WITH recent AS (
      SELECT program,id lead_id FROM leads WHERE created_at>=? AND program<>''
      UNION SELECT program,lead_id FROM lead_submissions WHERE created_at>=? AND program<>''
    )
    SELECT r.program,COUNT(DISTINCT r.lead_id) leads,
      COUNT(DISTINCT CASE WHEN l.stage IN ('En postulación','Admitido','Matriculado') THEN r.lead_id END) applications,
      ${admissions?"COUNT(DISTINCT CASE WHEN l.stage='Matriculado' AND c.enrollment_evidence_id IS NOT NULL THEN r.lead_id END)":"NULL"} enrolled
    FROM recent r JOIN leads l ON l.id=r.lead_id ${admissions?'LEFT JOIN admissions_cases c ON c.lead_id=l.id':''} GROUP BY r.program`,from,from),
    stmt(db,"SELECT program,COUNT(*) n FROM seo_articles WHERE status='published' GROUP BY program"),
    stmt(db,`SELECT o.* FROM seo_opportunities o JOIN growth_sync s ON s.source=o.source AND s.synced_at=o.updated_at
      WHERE s.status='ok' AND o.updated_at>=? ORDER BY o.priority DESC LIMIT 240`,from)
  ]);
  const crmMap=new Map(traffic.results.map(row=>[row.program,row]));
  const coverageMap=new Map(coverage.results.map(row=>[row.program,row.n]));
  const externalMap=new Map((searchEvidence.programs || []).map(row=>[row.program,row.keywords || []]));
  const proposals=programs.map(program=>{
    const organic=queries.results.filter(row=>exactSearchMatch(row.query,program))
      .map(row=>safeSearch(row,program,row.source));
    const external=(externalMap.get(program.slug) || []).map(row=>safeSearch(row,program,
      typeof row.source==='string' && row.source.startsWith('OpenSEO')?row.source:'OpenSEO'));
    const search=[...organic,...external].filter(Boolean).filter(item=>item.volume!==null||item.impressions!==null||item.clicks!==null||item.position!==null)
      .sort((a,b)=>signalWeight(b)-signalWeight(a)||a.keyword.localeCompare(b.keyword,'es'))[0] || null;
    const proposal=editorialProposal(program,search);
    const crm=crmMap.get(program.slug) || {leads:0,applications:0,enrolled:admissions?0:null};
    const guideCount=coverageMap.get(program.slug) || 0;
    const parts={
      demand:Math.round(weights.demand*signalWeight(search)),
      crm:Math.round(weights.crm*(capLog(crm.leads,35)*0.75+capLog(crm.applications,12)*0.25)),
      gap:guideCount===0?weights.gap:Math.round(weights.gap/(guideCount+2))
    };
    const reason=[
      search?search.type==='measured'?'Consultas observadas para el programa':search.type==='rank'?'Posición de búsqueda observada':'Demanda estimada para una consulta del programa':'Propuesta basada en la ficha institucional',
      guideCount===0?'Sin guía publicada para el programa':'Cobertura existente considerada',
      crm.leads? 'Interés reciente registrado en el CRM':''
    ].filter(Boolean).join(' · ');
    return {...proposal,priority:parts.demand+parts.crm+parts.gap,reason,evidence:{
      search,crm:{windowDays:90,leads:crm.leads,applications:crm.applications,verifiedEnrollments:crm.enrolled},coverage:{guideCount},parts,
      editorial:{angle:proposal.angle,question:proposal.searchQuestion}
    }};
  });
  return {proposals,externalMap,sources:searchEvidence.sources || []};
}

function replenish(programs,evidence,existing,current) {
  const week=weekOf(current);
  const newThisWeek=existing.filter(row=>row.kind==='signal' && weekOf(new Date(row.created_at))===week);
  const remaining=weekSlots-newThisWeek.length;
  if (remaining<=0) return [];
  const available=new Set(evidence.sources.filter(source=>source.state==='disponible').map(source=>source.key));
  const ideas=evidence.proposals.flatMap(primary=>{
    const initial=existing.find(row=>row.id===primary.id && row.article_status==='published' && row.status!=='paused');
    if (!initial || newThisWeek.some(row=>row.program===primary.program)) return [];
    const program=programs.find(row=>row.slug===primary.program);
    const earlier=existing.filter(row=>row.program===primary.program && row.kind==='signal');
    const watermark=earlier.map(row=>String(parse(row.evidence).search?.observedAt || '').slice(0,10)).sort().at(-1) || '';
    const cutoff=new Date(current.valueOf()-35*24*hour).toISOString().slice(0,10);
    const sourceValues=(evidence.externalMap.get(primary.program) || [])
      .filter(row=>['gsc','saved_keywords'].includes(row.sourceKey) && available.has(row.sourceKey))
      .map(row=>safeSearch(row,program,row.source?.startsWith('OpenSEO')?row.source:'OpenSEO'))
      .filter(Boolean)
      .filter(row=> typeof row.observedAt==='string' && /^\d{4}-\d{2}-\d{2}/.test(row.observedAt) &&
        row.observedAt.slice(0,10)>watermark && row.observedAt.slice(0,10)>=cutoff && row.observedAt.slice(0,10)<=current.toISOString().slice(0,10) &&
        signalWeight(row)>0)
      .sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||signalWeight(b)-signalWeight(a)||a.keyword.localeCompare(b.keyword,'es'));
    const candidate=sourceValues.map(search=>({search,topic:continuationTopic(search.keyword)}))
      .find(({topic})=>topic && topic!==continuationTopic(initial.search_question) && !earlier.some(row=>row.signal_key===topic));
    if (!candidate) return [];
    const next=continuationProposal(program,candidate.topic,candidate.search.keyword);
    if (!next?.sourceUrl) return [];
    const parts={demand:Math.round(weights.demand*signalWeight(candidate.search)),crm:primary.evidence.parts.crm,gap:weights.gap};
    return [{...next,priority:parts.demand+parts.crm+parts.gap,
      reason:'Tema distinto detectado en una señal nueva del proyecto OpenSEO · Guía inicial publicada',evidence:{
        ...primary.evidence,search:candidate.search,parts,editorial:{angle:next.angle,question:next.searchQuestion,topic:candidate.topic}
      }}];
  });
  return ideas.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).slice(0,remaining);
}

function audit(db,plan,marker,action,actor,detail,date) {
  return stmt(db,`INSERT INTO seo_editorial_history(id,plan_id,action,actor,detail,occurred_at)
    SELECT ?,id,?,?,?,? FROM seo_editorial_plan WHERE id=? AND mutation_id=?`,crypto.randomUUID(),action,actor,detail,date,plan,marker);
}

async function ensurePlan(db,programs,current,actor='Motor editorial',force=false) {
  let settings=await first(db,'SELECT * FROM seo_editorial_settings WHERE id=1');
  if (!settings) {
    const [,read]=await db.batch([
      stmt(db,'INSERT INTO seo_editorial_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING'),
      stmt(db,'SELECT * FROM seo_editorial_settings WHERE id=1')
    ]);
    settings=read.results[0];
  }
  const week=weekOf(current), date=current.toISOString();
  if (!settings) return;
  const [evidence,existing]=await Promise.all([buildPlans(db,programs,current),all(db,planJoin)]);
  const added=settings.paused===1?[]:replenish(programs,evidence,existing,current);
  if (!force && settings.last_plan_week===week && added.length===0) return;
  const locked=existing.filter(item=>item.schedule_locked===1 || item.status!=='planned' ||
    item.scheduled_at && item.scheduled_at<=date && weekOf(new Date(item.scheduled_at))===week);
  const keep=new Set(locked.map(item=>item.id));
  const candidates=[...evidence.proposals,...added,...existing.filter(row=>row.kind==='signal' && !keep.has(row.id)).map(row=>({
    id:row.id,kind:row.kind,signalKey:row.signal_key,program:row.program,title:row.title,cluster:row.cluster,intent:row.intent,
    searchQuestion:row.search_question,priority:row.priority,reason:row.reason,evidence:parse(row.evidence),sourceUrl:row.source_url,
    sourceVerifiedAt:row.source_verified_at
  }))].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  const eligible=candidates.filter(item=>!keep.has(item.id) && item.sourceUrl);
  const schedule=weeklySchedule(eligible,locked,current);
  const marker=crypto.randomUUID();
  const writes=[
    stmt(db,`UPDATE seo_editorial_settings SET last_plan_week=?,planned_at=?,plan_marker=?
      WHERE id=1 AND COALESCE(plan_marker,'')=?`,week,date,marker,settings.plan_marker || '')
  ];
  for (const idea of candidates.filter(item=>!keep.has(item.id))) {
    writes.push(stmt(db,`INSERT INTO seo_editorial_plan(id,program,kind,signal_key,title,cluster,intent,search_question,priority,reason,evidence,source_url,source_verified_at,scheduled_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM seo_editorial_settings WHERE id=1 AND plan_marker=?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,cluster=excluded.cluster,intent=excluded.intent,search_question=excluded.search_question,
        priority=excluded.priority,reason=excluded.reason,evidence=excluded.evidence,source_url=excluded.source_url,source_verified_at=excluded.source_verified_at,
        scheduled_at=excluded.scheduled_at,updated_at=excluded.updated_at,revision=seo_editorial_plan.revision+1
        WHERE seo_editorial_plan.status='planned' AND seo_editorial_plan.schedule_locked=0`,
    idea.id,idea.program,idea.kind || 'catalogo',idea.signalKey || '',idea.title,idea.cluster,idea.intent,idea.searchQuestion,idea.priority,idea.reason,JSON.stringify(idea.evidence),
    idea.sourceUrl,idea.sourceVerifiedAt,schedule.get(idea.id) || null,date,date,marker));
  }
  writes.push(stmt(db,`INSERT INTO seo_editorial_history(id,action,actor,detail,occurred_at)
    SELECT ?,'plan',?,?,? FROM seo_editorial_settings WHERE id=1 AND plan_marker=?`,
  crypto.randomUUID(),actor,'Plan editorial calculado para '+week+'.',date,marker));
  await db.batch(writes);
}

async function preparedDraft(db,env,row,program,current) {
  const evidence=parse(row.evidence);
  const shell=draftEditorialArticle(row,program,evidence);
  if (!shell) throw new InputError(422,'La guía necesita una ficha institucional verificada antes de prepararse.');
  const configuredModel=activeAI(env)==='anthropic' && env.ANTHROPIC_API_KEY ? String(env.ANTHROPIC_MODEL || '') : '';
  const date=current.toISOString();
  const fingerprint=await digest(JSON.stringify(['editorial-copy-v2',row.id,shell,configuredModel,evidence.search]));
  const ready=()=>first(db,"SELECT draft FROM seo_editorial_copy_cache WHERE fingerprint=? AND status='ready'",fingerprint);
  const prior=await ready();
  if (prior) return parse(prior.draft);
  const lease=crypto.randomUUID();
  const stale=new Date(current.valueOf()-25*60000).toISOString();
  const claim=await stmt(db,`INSERT INTO seo_editorial_copy_cache(fingerprint,status,lease_token,updated_at) VALUES(?,'reserved',?,?)
    ON CONFLICT(fingerprint) DO UPDATE SET lease_token=excluded.lease_token,updated_at=excluded.updated_at
      WHERE seo_editorial_copy_cache.status='reserved' AND seo_editorial_copy_cache.updated_at<?
    RETURNING fingerprint`,fingerprint,lease,date,stale).first();
  if (!claim) {
    const fresh=await ready();
    if (fresh) return parse(fresh.draft);
    throw new InputError(409,'El borrador de esta guía se está preparando.');
  }
  const indices=shell.blocks.map((_,index)=>index+1);
  let order=indices;
  let questions=['¿Qué tema del plan de estudios se relaciona con el reto que quieres resolver y cómo evaluarías esa relación?'];
  let generation={source:'catalogo',scope:'material_curado',provider:null,model:null,checkedAt:date};
  if (configuredModel) {
    try {
      const search=evidence.search && eligibleQuery(evidence.search.keyword,[program])
        ? {consulta:evidence.search.keyword,fuente:evidence.search.source,datos:evidence.search.type,volumen:evidence.search.volume,impresiones:evidence.search.impressions}
        : null;
      const result=await aiText(env,
        'Ordena bloques de una guía de posgrado en español. Usa la intención del lector, la ficha oficial y las señales agregadas para escoger una secuencia. Añade una o dos preguntas prácticas originales que ayuden a la persona a aplicar un tema de la ficha a su propia decisión. Cada una debe mencionar un tema académico de los bloques y usar ¿...? sin afirmaciones, promesas, datos personales, precios, fechas, números, enlaces, cupos o condiciones de inscripción. Devuelve exclusivamente JSON {"orden":[números],"preguntas":["¿...?"]} con todos los identificadores de bloque una sola vez.',
        JSON.stringify({programa:program.title,intencion:row.intent,pregunta:row.search_question,fuente:shell.sourceUrl,
          evidenciaBusqueda:search,bloques:shell.blocks.map((texto,index)=>({id:index+1,texto}))}),280);
      const parsed=JSON.parse(result.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''));
      if (Object.keys(parsed).every(key=>['orden','preguntas'].includes(key)) && Array.isArray(parsed.orden) && parsed.orden.length===indices.length &&
        new Set(parsed.orden).size===indices.length && parsed.orden.every(index=>Number.isInteger(index) && indices.includes(index))) {
        order=parsed.orden;
        const original=editorialQuestions(parsed.preguntas,program);
        if (original.length) questions=original;
        generation={source:'modelo',scope:original.length?'orden_y_preguntas':'orden',provider:'Anthropic',model:configuredModel,checkedAt:date};
      }
    } catch { /* Use the approved catalog copy when provider output cannot be verified. */ }
  }
  const {title,summary,sourceUrl,searchQuestion}=shell;
  const draft={title,summary,sourceUrl,searchQuestion,generation,
    body:[shell.intro,...order.map(id=>shell.blocks[id-1]),'Preguntas para tu decisión\n'+questions.join(' '),shell.closing,shell.reference].filter(Boolean).join('\n\n')};
  await stmt(db,`UPDATE seo_editorial_copy_cache SET status='ready',draft=?,updated_at=?
    WHERE fingerprint=? AND lease_token=?`,JSON.stringify(draft),date,fingerprint,lease).run();
  return draft;
}

function editorialQuestions(values,program) {
  if (!Array.isArray(values) || values.length<1 || values.length>2) return [];
  const themes=new Set(normalized([program.title,...(program.curriculum || []).slice(0,3)].join(' '))
    .split(/[^a-z]+/).filter(word=>word.length>=5 && !['maestria','estudios','estudio','introduccion','aplicada','aplicado'].includes(word)));
  const forbidden=/\b(?:precio|precios|costo|costos|cuota|cuotas|beca|becas|cupo|cupos|arancel|aranceles|matricula|matriculas|convocatoria|convocatorias|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|garantiz\w*|asegura\w*|obtendras|certeza|enlace|http|www|cedula|correo|direccion|telefono|identifica(?:cion|dor)|documento personal|ingresos|salario)\b/;
  const clean=values.map(value=>typeof value==='string'?value.trim():'');
  if (new Set(clean).size!==clean.length) return [];
  return clean.every(value=>{
    const n=normalized(value);
    return value.length>=35 && value.length<=180 && /^¿(?:Cómo|Qué|Cuál|Cuáles|De qué forma|De qué manera) [\p{L}\p{M} ,;()–-]+\?$/u.test(value) &&
      !forbidden.test(n) && n.split(/[^a-z]+/).some(word=>themes.has(word));
  })?clean:[];
}

const currentPlan=(db,id)=>first(db,planJoin+' WHERE p.id=?',id);
const cleanText=(s,max)=>typeof s==='string'?s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max):'';
const editedCopy=input=>{
  const title=cleanText(input.title,180),summary=cleanText(input.summary,400),body=cleanText(input.body,12000);
  if (title.length<8 || summary.length<35 || body.length<150) throw new InputError(422,'Completa el título, el resumen y el cuerpo antes de guardar.');
  return {title,summary,body};
};

async function publish(env,programs,plan,current,actor,automatic=false) {
  const db=env.DB,date=current.toISOString(),marker=crypto.randomUUID();
  if (plan.status==='paused') throw new InputError(409,'Reanuda la guía antes de publicarla.');
  if (automatic && (!plan.auto_ready || plan.article_status==='published' || !plan.scheduled_at || plan.scheduled_at>date)) return null;
  if (plan.article_status==='published' && plan.published_revision===plan.content_revision) return plan;
  const program=programs.find(item=>item.slug===plan.program);
  if (!program || !draftEditorialArticle(plan,program,parse(plan.evidence)) || !await checkEditorialSource(env,plan.source_url)) {
    throw new InputError(422,'La ficha institucional de esta guía no se pudo verificar.');
  }
  const draft=plan.draft_body ? {title:plan.draft_title,summary:plan.draft_summary,body:plan.draft_body,generation:parse(plan.generation)}
    : await preparedDraft(db,env,plan,program,current);
  const version=plan.content_revision || 1;
  const articleId=plan.article_id || plan.id;
  const slug=plan.article_slug || plan.id;
  const key=cmsKey(plan,version), portalBase=publicOrigin(env);
  const payload={
    type:'ucg.postgrados.guide.publish.v1',idempotencyKey:key,version,
    article:{id:articleId,slug,program:plan.program,title:draft.title,summary:draft.summary,body:draft.body,sourceUrl:plan.source_url,
      portalUrl:portalBase?portalBase+'/guias/'+encodeURIComponent(slug):null,publishedAt:plan.article_published_at || date,updatedAt:date}
  };
  const weekStart=weekOf(current)+'T05:00:00.000Z';
  const scope=" AND EXISTS(SELECT 1 FROM seo_editorial_settings WHERE id=1 AND paused=0) "+
    " AND NOT EXISTS(SELECT 1 FROM seo_editorial_history WHERE actor='Motor editorial' AND action='publish' AND occurred_at>?)"+
    " AND (SELECT COUNT(*) FROM seo_editorial_history WHERE actor='Motor editorial' AND action='publish' AND occurred_at>=?)<?";
  const updates=[
    stmt(db,`UPDATE seo_editorial_plan SET status='published',draft_title=?,draft_summary=?,draft_body=?,generation=?,
      content_revision=?,published_revision=?,auto_ready=0,revision=revision+1,updated_at=?,mutation_id=?
      WHERE id=? AND revision=? AND status<>'paused'`+(automatic?scope:''),
    draft.title,draft.summary,draft.body,JSON.stringify(draft.generation),version,version,date,marker,plan.id,plan.revision,
    ...(automatic?[new Date(current.valueOf()-gapHours*hour).toISOString(),weekStart,weekSlots]:[])),
    stmt(db,`INSERT INTO seo_articles(id,slug,opportunity_id,program,title,summary,body,source_query,source_url,status,created_at,updated_at,published_at,editor)
      SELECT ?,?,?,?,?,?,?,?,?,'published',?,?,?,? FROM seo_editorial_plan WHERE id=? AND mutation_id=?
      ON CONFLICT(opportunity_id) DO UPDATE SET title=excluded.title,summary=excluded.summary,body=excluded.body,
        source_query=excluded.source_query,source_url=excluded.source_url,status='published',updated_at=excluded.updated_at,
        published_at=COALESCE(seo_articles.published_at,excluded.published_at),editor=excluded.editor`,
    articleId,slug,articleKey(plan),plan.program,draft.title,draft.summary,draft.body,plan.search_question,plan.source_url,
    date,date,date,actor,plan.id,marker),
    stmt(db,`UPDATE seo_editorial_cms SET status='superseded',updated_at=? WHERE plan_id=? AND version<?
      AND status IN ('pending','retry','failed','uncertain')
      AND EXISTS(SELECT 1 FROM seo_editorial_plan WHERE id=? AND mutation_id=?)`,date,plan.id,version,plan.id,marker),
    stmt(db,`INSERT INTO seo_editorial_cms(id,plan_id,version,payload,status,due_at,updated_at)
      SELECT ?,id,?,?,'pending',?,? FROM seo_editorial_plan WHERE id=? AND mutation_id=?
      ON CONFLICT(plan_id,version) DO NOTHING`,key,version,JSON.stringify(payload),date,date,plan.id,marker),
    audit(db,plan.id,marker,'publish',actor,'Publicación en el portal. Versión '+version+'.',date)
  ];
  const [updated]=await db.batch(updates);
  if (!updated.meta.changes) {
    if (automatic) return null;
    throw new InputError(409,'Otra persona modificó la guía. Vuelve a abrirla antes de publicar.');
  }
  return currentPlan(db,plan.id);
}

async function saveDraft(env,programs,row,input,current,operator,manual) {
  const db=env.DB,date=current.toISOString(),marker=crypto.randomUUID();
  if (row.status==='paused') throw new InputError(409,'Reanuda la guía antes de editarla.');
  if (!manual && row.draft_body) return row;
  const program=programs.find(item=>item.slug===row.program);
  if (!program || !row.source_url) throw new InputError(422,'Falta la fuente institucional de esta guía.');
  const draft=manual ? {...editedCopy(input),generation:{source:'edicion_privada',scope:'redaccion_humana',provider:null,model:null,checkedAt:date}}
    : await preparedDraft(db,env,row,program,current);
  const [saved]=await db.batch([
    stmt(db,`UPDATE seo_editorial_plan SET draft_title=?,draft_summary=?,draft_body=?,generation=?,
      content_revision=content_revision+1,status=CASE WHEN status='planned' THEN 'draft' ELSE status END,
      auto_ready=0,revision=revision+1,updated_at=?,mutation_id=? WHERE id=? AND revision=?`,
    draft.title,draft.summary,draft.body,JSON.stringify(draft.generation),date,marker,row.id,row.revision),
    audit(db,row.id,marker,manual?'save':'draft',operator,'Borrador privado guardado.',date)
  ]);
  if (!saved.meta.changes) throw new InputError(409,'Otra persona modificó la guía. Vuelve a abrirla.');
  return currentPlan(db,row.id);
}

async function itemControl(db,row,input,current,operator) {
  const date=current.toISOString(),marker=crypto.randomUUID();
  let sql;
  if (input.action==='schedule') {
    if (row.article_status==='published' || row.status==='paused') throw new InputError(409,'Solo se puede programar una guía activa sin publicación.');
    const at=input.scheduledAt===null?null:dueIso(input.scheduledAt);
    if (input.scheduledAt!==null && (!at || at<date)) throw new InputError(422,'Selecciona una fecha futura de publicación.');
    const start=at?weekOf(new Date(at))+'T05:00:00.000Z':null;
    const end=start?new Date(Date.parse(start)+7*24*hour).toISOString():null;
    sql=stmt(db,`UPDATE seo_editorial_plan SET scheduled_at=?,schedule_locked=1,auto_ready=?,revision=revision+1,updated_at=?,mutation_id=?
      WHERE id=? AND revision=? AND (? IS NULL OR (
        NOT EXISTS(SELECT 1 FROM seo_editorial_plan other WHERE other.id<>? AND other.status<>'paused' AND
          abs((julianday(other.scheduled_at)-julianday(?))*24)<?)
        AND (SELECT COUNT(*) FROM seo_editorial_plan other WHERE other.id<>? AND other.status<>'paused'
          AND other.scheduled_at>=? AND other.scheduled_at<?)<?))`,
    at,Number(!!at && (!row.draft_body || input.autoPublish===true)),date,marker,row.id,row.revision,
    at,row.id,at,gapHours,row.id,start,end,weekSlots);
  } else {
    const pause=input.action==='pause';
    if (pause===(row.status==='paused')) return row;
    sql=stmt(db,`UPDATE seo_editorial_plan SET status=?,paused_from=?,
      revision=revision+1,updated_at=?,mutation_id=? WHERE id=? AND revision=?`,
    pause?'paused':row.paused_from || 'planned',pause?row.status:null,date,marker,row.id,row.revision);
  }
  const [updated]=await db.batch([sql,audit(db,row.id,marker,input.action,operator,
    input.action==='schedule'?(input.scheduledAt?'Fecha de publicación actualizada.':'Fecha retirada del calendario.'):'Se actualizó la pausa de la guía.',date),
  stmt(db,`UPDATE seo_editorial_settings SET plan_marker=? WHERE id=1 AND EXISTS(
    SELECT 1 FROM seo_editorial_plan WHERE id=? AND mutation_id=?)`,marker,row.id,marker)]);
  if (!updated.meta.changes) throw new InputError(409,input.action==='schedule'?'El espacio no respeta la cadencia o cambió el calendario. Actualiza la guía.':'Otra persona modificó la guía. Vuelve a abrirla.');
  return currentPlan(db,row.id);
}

function sourceRows(external=[]) {
  const states={disponible:'available',sin_configurar:'unconfigured',sin_datos:'no_data',pendiente:'pending',no_disponible:'unavailable',error:'unavailable',bloqueado:'unavailable'};
  const out=external.map(source=>({
    label:cleanText(source.label || source.source || 'OpenSEO',100),
    status:states[source.state] || 'unavailable',
    detail:source.state==='disponible'?'Datos observados en la fuente indicada. Las estimaciones se distinguen de las observaciones del portal.':'La fuente aún no aportó datos utilizables al plan.'
  }));
  return [catalogSource,...out];
}
const minimalPublicSearch=evidence=>{
  const search=evidence?.search;
  if (!search || !search.shareable || search.type!=='estimate') return null;
  return {keyword:search.keyword,source:search.source,sourceUrl:search.sourceUrl,type:search.type,volume:search.volume,difficulty:search.difficulty,observedAt:search.observedAt};
};
const publicArticle=row=>({slug:row.slug,title:row.title,summary:row.summary,publishedAt:row.published_at,stats:null});
function outline(row,programs,cms) {
  const article=row.article_id || row.draft_body ? {
    id:row.article_id || null,slug:row.article_slug || null,
    title:row.draft_title || row.article_title,summary:row.draft_summary || row.article_summary,body:row.draft_body || row.article_body,
    updatedAt:row.updated_at,status:row.draft_body && row.content_revision>row.published_revision?'draft':row.article_status || 'draft'
  } : null;
  const cmsStatus=row.cms_status==='published'?'published':cms.status==='configured' ? row.cms_status || 'pending' : cms.status;
  return {
    id:row.id,program:row.program,kind:row.kind,signalKey:row.signal_key || null,programTitle:programs.find(p=>p.slug===row.program)?.title || row.program,
    title:row.title,cluster:row.cluster,intent:row.intent,searchQuestion:row.search_question,reason:row.reason,priority:row.priority,
    scheduledAt:row.scheduled_at,status:row.status,revision:row.revision,autoReady:row.auto_ready===1,
    articleId:row.article_id || null,articleSlug:row.article_status==='published'?row.article_slug:null,article,
    hasPrivateDraft:row.content_revision>row.published_revision,
    officialUrl:row.cms_status==='published'?row.official_url:null,sourceUrl:row.source_url,
    sourceStatus:row.source_url && row.source_verified_at?'verified':'unavailable',
    sourceVerifiedAt:row.source_verified_at,
    cms:{status:row.article_status==='published'?cmsStatus:'unpublished',url:row.official_url || null,lastError:row.last_error || null},
    evidence:parse(row.evidence),generation:parse(row.generation)
  };
}
const orderPlan=" ORDER BY p.scheduled_at IS NULL,p.scheduled_at,p.priority DESC,p.id";
function metricsFor(plan,week) {
  const published=plan.filter(row=>row.articleSlug);
  const official=published.filter(row=>row.cms?.status==='published' || row.officialUrl);
  return {
    planned:plan.length,scheduled:plan.filter(row=>row.scheduledAt && weekOf(new Date(row.scheduledAt))===week).length,
    drafted:plan.filter(row=>row.hasPrivateDraft || row.status==='draft').length,paused:plan.filter(row=>row.status==='paused').length,
    publishedPortal:published.length,publishedCms:official.length,publishedOfficial:official.length,
    awaitingCms:published.length-official.length,failedCms:published.filter(row=>['failed','uncertain'].includes(row.cms?.status)).length
  };
}

async function staffPanel(env,programs,week,current) {
  const db=env.DB,cms=cmsConfig(env);
  const [items,settings,history,external]=await Promise.all([
    all(db,planJoin+orderPlan),
    first(db,'SELECT * FROM seo_editorial_settings WHERE id=1'),
    all(db,'SELECT id,plan_id,action,actor,detail,occurred_at FROM seo_editorial_history ORDER BY occurred_at DESC,rowid DESC LIMIT 60'),
    seoEvidence(db)
  ]);
  const plan=items.map(row=>outline(row,programs,cms));
  return {
    week,calculatedAt:settings?.planned_at || null,
    enabled:settings?.paused!==1 && env.SEO_EDITORIAL_AUTOPUBLISH==='true',
    config:{paused:settings?.paused===1,autoPublish:env.SEO_EDITORIAL_AUTOPUBLISH==='true',revision:settings?.revision || 1,
      weeklyLimit:weekSlots,minHoursBetween:gapHours,weights,lastPlannedWeek:settings?.last_plan_week || weekOf(current)},
    plan,metrics:metricsFor(plan,week),cms:{status:cms.status},sources:sourceRows(external.sources),
    history:history.map(row=>({id:row.id,planId:row.plan_id,action:row.action,actor:row.actor,detail:row.detail,occurredAt:row.occurred_at}))
  };
}

const publicProjection=(row,programs)=>({
  id:row.id,program:row.program,kind:row.kind,programTitle:programs.find(p=>p.slug===row.program)?.title || row.program,
  title:row.title,cluster:row.cluster,intent:row.intent,scheduledAt:row.scheduled_at,status:row.status,
  articleSlug:row.article_status==='published'?row.article_slug:null,officialUrl:row.cms_status==='published'?row.official_url:null,
  sourceUrl:row.source_url || null,evidence:{search:minimalPublicSearch(parse(row.evidence))},generation:parse(row.generation)
});

export async function publicEditorial(env,programs) {
  const current=new Date(),week=weekOf(current),db=env.DB;
  const editorial=db && await tableExists(db,'seo_editorial_plan');
  const external=db ? await seoEvidence(db) : {programs:[],sources:[]};
  const [rows,guides]=await Promise.all([
    editorial?all(db,planJoin+orderPlan):[],
    db ? all(db,"SELECT slug,title,summary,published_at FROM seo_articles WHERE status='published' ORDER BY published_at DESC,slug LIMIT 60"):[]
  ]);
  const plan=rows.length ? rows.map(row=>publicProjection(row,programs)) : programs.map(program=>{
    const material=external.programs?.find(row=>row.program===program.slug)?.keywords || [];
    const best=material.map(row=>safeSearch(row,program,row.source?.startsWith('OpenSEO')?row.source:'OpenSEO')).filter(Boolean)
      .sort((a,b)=>signalWeight(b)-signalWeight(a))[0] || null;
    const proposal=editorialProposal(program,best);
    return {
      id:proposal.id,program:program.slug,kind:'catalogo',programTitle:program.title,title:proposal.title,cluster:proposal.cluster,intent:proposal.intent,
      scheduledAt:null,status:'planned',articleSlug:null,officialUrl:null,sourceUrl:proposal.sourceUrl || null,
      evidence:{search:minimalPublicSearch({search:best})}
    };
  });
  return {week,programCount:programs.length,plan,guides:guides.map(publicArticle),metrics:metricsFor(plan,week),sources:sourceRows(external.sources)};
}

export async function runEditorialCycle(env,programs,{now=new Date()}={}) {
  const db=env.DB;
  if (!db || !await tableExists(db,'seo_editorial_plan')) return {status:'sin_configurar',publishedPortal:0,publishedCms:0};
  await ensurePlan(db,programs,now);
  const settings=await first(db,'SELECT paused FROM seo_editorial_settings WHERE id=1');
  if (settings?.paused===1) return {status:'en_pausa',publishedPortal:0,publishedCms:0};
  let portal=0,verificationFailures=0;
  if (env.SEO_EDITORIAL_AUTOPUBLISH==='true') {
    const date=now.toISOString(),since=new Date(now.valueOf()-gapHours*hour).toISOString();
    const recent=await first(db,"SELECT 1 recent FROM seo_editorial_history WHERE actor='Motor editorial' AND action='publish' AND occurred_at>? LIMIT 1",since);
    if (!recent) {
      const due=await all(db,planJoin+` WHERE p.status IN ('planned','draft') AND p.auto_ready=1 AND p.source_url<>'' AND p.source_verified_at IS NOT NULL
        AND p.scheduled_at<=? ORDER BY p.scheduled_at,p.priority DESC,p.id LIMIT 3`,date);
      for (const row of due) {
        try {
          const result=await publish(env,programs,row,now,'Motor editorial',true);
          if (result?.article_status==='published') { portal=1;break; }
        } catch (err) {
          if (!(err instanceof InputError) || ![409,422].includes(err.status)) throw err;
          if (err.status===422) {
            verificationFailures++;
            await stmt(db,`INSERT INTO seo_editorial_history(id,plan_id,action,actor,detail,occurred_at)
              VALUES(?,?,'source_unavailable','Motor editorial','La ficha institucional no se pudo verificar.',?)`,crypto.randomUUID(),row.id,date).run();
          }
        }
      }
    }
  }
  const cms=await mirrorEditorial(env,now);
  return {status:'completado',publishedPortal:portal,publishedCms:cms.confirmed,cms:cms.status,verificationFailures};
}

async function inputJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new InputError(415,'Envía la acción como JSON.');
  if (Number(request.headers.get('content-length'))>18000) throw new InputError(413,'La edición es demasiado extensa.');
  const text=await request.text();
  if (text.length>18000) throw new InputError(413,'La edición es demasiado extensa.');
  try {
    const data=JSON.parse(text);
    if (data && typeof data==='object' && !Array.isArray(data)) return data;
  } catch { /* JSON validation follows. */ }
  throw new InputError(400,'La acción editorial no es válida.');
}

async function globalPause(db,input,current,operator) {
  const date=current.toISOString(),paused=Number(input.action==='pause');
  await stmt(db,'INSERT INTO seo_editorial_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING').run();
  const settings=await first(db,'SELECT revision,paused FROM seo_editorial_settings WHERE id=1');
  if (!settings || input.revision!==undefined && settings.revision!==input.revision) throw new InputError(409,'La configuración editorial cambió. Actualiza el panel.');
  if (settings.paused===paused) return;
  const [result]=await db.batch([
    stmt(db,'UPDATE seo_editorial_settings SET paused=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND revision=?',
      paused,date,operator,settings.revision),
    stmt(db,`INSERT INTO seo_editorial_history(id,action,actor,detail,occurred_at)
      SELECT ?,?,?,?,? WHERE changes()=1`,crypto.randomUUID(),input.action,operator,paused?'Se pausó el ciclo editorial.':'Se reanudó el ciclo editorial.',date)
  ]);
  if (!result.meta.changes) throw new InputError(409,'La configuración editorial cambió. Actualiza el panel.');
}

async function retryCms(db,row,current,operator) {
  if (!['failed','uncertain','retry'].includes(row.cms_status)) throw new InputError(409,'La publicación institucional todavía no admite reintento.');
  const date=current.toISOString(),marker=crypto.randomUUID();
  const [updated]=await db.batch([
    stmt(db,'UPDATE seo_editorial_plan SET revision=revision+1,updated_at=?,mutation_id=? WHERE id=? AND revision=?',date,marker,row.id,row.revision),
    stmt(db,`UPDATE seo_editorial_cms SET status='pending',due_at=?,attempts=0,last_error=NULL,updated_at=?
      WHERE plan_id=? AND version=? AND status IN ('failed','uncertain','retry') AND EXISTS(
        SELECT 1 FROM seo_editorial_plan WHERE id=? AND mutation_id=?)`,date,date,row.id,row.published_revision,row.id,marker),
    audit(db,row.id,marker,'retry_cms',operator,'Se autorizó volver a consultar la misma clave de publicación institucional.',date)
  ]);
  if (!updated.meta.changes) throw new InputError(409,'Otra persona modificó la guía. Vuelve a abrirla.');
  return currentPlan(db,row.id);
}

export async function handleEditorial(request,env,url,programs,operator) {
  if (url.pathname.replace(/\/$/,'')!=='/api/staff/editorial') return null;
  if (!operator) return error(403,'Esta sección requiere acceso del equipo de admisiones.');
  const db=env.DB,current=new Date();
  if (!db || !await tableExists(db,'seo_editorial_plan')) return error(503,'La bandeja editorial aún no está disponible.');
  const week=url.searchParams.get('week') || weekOf(current);
  if (!validWeek(week)) return error(422,'Selecciona el lunes de una semana válida.');
  try {
    if (request.method==='GET') {
      await ensurePlan(db,programs,current);
      return json(await staffPanel(env,programs,week,current));
    }
    if (request.method!=='POST') return error(405,'Método no permitido.');
    if (request.headers.has('origin') && request.headers.get('origin')!==url.origin) return error(403,'Origen no permitido.');
    const input=await inputJson(request);
    if (input.action==='plan') {
      await ensurePlan(db,programs,current,operator,true);
      return json(await staffPanel(env,programs,week,current));
    }
    if (['pause','resume'].includes(input.action) && !input.id) {
      await globalPause(db,input,current,operator);
      return json(await staffPanel(env,programs,week,current));
    }
    if (typeof input.id!=='string' || !/^guia-[a-z0-9-]+$/.test(input.id) || !Number.isInteger(input.revision)) {
      return error(422,'Indica la guía y su revisión.');
    }
    const row=await currentPlan(db,input.id);
    if (!row) return error(404,'No encontramos la propuesta editorial.');
    if (row.revision!==input.revision) return error(409,'Otra persona modificó la guía. Vuelve a abrirla.');
    let item;
    if (input.action==='publish') item=await publish(env,programs,row,current,operator);
    else if (input.action==='save' || input.action==='draft') item=await saveDraft(env,programs,row,input,current,operator,input.action==='save');
    else if (['pause','resume','schedule'].includes(input.action)) item=await itemControl(db,row,input,current,operator);
    else if (input.action==='retryCms') item=await retryCms(db,row,current,operator);
    else return error(422,'Acción editorial no disponible.');
    return json({item:outline(item,programs,cmsConfig(env)),...await staffPanel(env,programs,week,current)});
  } catch (err) {
    if (err instanceof InputError) return error(err.status,err.message);
    throw err;
  }
}
