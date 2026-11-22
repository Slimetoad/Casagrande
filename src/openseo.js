import {brand,programs as catalog} from './catalog.js';
import {all, normalized, now, select} from './providers.js';
import {publicKeywordObservations} from './openseo-observations.js';

const endpointDefault='https://app.openseo.so/mcp';
const market=Object.freeze({country:'Ecuador',language:'es',locationCode:2218});
const reads=Object.freeze({
  project:{name:'list_projects',fields:[]},
  gsc:{name:'get_search_console_performance',fields:['projectId','dimensions','startDate','endDate','filters','rowLimit','dataState','type']},
  saved:{name:'list_saved_keywords',fields:['projectId','limit']},
  rank:{name:'get_rank_tracker',fields:['projectId','trackerId','limit']},
  history:{name:'get_rank_history',fields:['projectId','trackerId','device','runs','limit']},
  audit:{name:'get_audit_pages',fields:['projectId','page','limit','urlContains']}
});
const sourceLabels={
  proyecto:'Proyecto OpenSEO',
  gsc:'OpenSEO · Search Console',
  saved_keywords:'OpenSEO · Palabras guardadas',
  rank:'OpenSEO · Posiciones registradas',
  audit:'OpenSEO · Auditoría existente',
  domain:'OpenSEO · Propiedad observada',
  research:'OpenSEO · Investigación con créditos'
};
const documentedPolicy='Presupuesto de consultas con cargo: 0 créditos. Se consultan únicamente registros existentes y lecturas gratuitas del proyecto.';
const day=86400000;
const maxResponseBytes=2*1024*1024;
const maxToolCalls=12;
const latestProtocol='2025-11-25';
const supportedProtocols=new Set([latestProtocol,'2025-06-18','2025-03-26']);
const statuses={
  sin_configurar:'Configura el acceso de lectura a OpenSEO.',
  pendiente:'A la espera de la primera lectura.',
  disponible:'Lectura completada.',
  sin_datos:'La fuente no devolvió registros aplicables.',
  no_disponible:'La cuenta o el proyecto no ofrece esta fuente.',
  error:'OpenSEO no pudo completar la lectura.',
  bloqueado:documentedPolicy
};

class OpenSeoError extends Error {
  constructor(state,message) {super(message);this.state=state;}
}
const invalid=()=>new OpenSeoError('error','OpenSEO devolvió una respuesta con un formato distinto del esperado.');
const unknownTool=()=>new OpenSeoError('no_disponible','El catálogo MCP de la cuenta no anuncia una lectura compatible para esta fuente.');
const safeDate=value=>{
  const time=typeof value==='string'?Date.parse(value):NaN;
  return Number.isFinite(time)?new Date(time).toISOString():null;
};
const isoDay=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && safeDate(value)?.slice(0,10)===value?value:null;
const metric=(value,max=Infinity)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max?value:null;
const position=value=>metric(value)>=1?value:null;
const titleText=(value,max=160)=>typeof value==='string'?value.trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,max):'';
const term=value=>{
  const text=titleText(value);
  return text && /^[\p{L}\p{N} ¿?¡!.,()+:’'\-]+$/u.test(text) && !/(?:\d[\s().-]*){6,}|\b(?:http|https|www)\b/i.test(text)?text:null;
};
const projectId=value=>typeof value==='string' && /^[\w-]{1,128}$/.test(value);
const creditFreeRead=tool=>tool?.annotations?.readOnlyHint===true;

function httpsUrl(value) {
  try {
    const url=new URL(value);
    if(url.protocol==='https:'&&!url.username&&!url.password&&url.hostname.includes('.')&&
       !/^(?:\d+\.){3}\d+$|^\[|\.(?:localhost|local|internal)$/i.test(url.hostname))return url;
  }catch{/* Required fields are validated by the caller. */}
  return null;
}
function host(value) {
  if(typeof value!=='string'||!value)return null;
  const text=value.replace(/^sc-domain:/i,'');
  return httpsUrl(text.includes('://')?text:'https://'+text)?.hostname.replace(/^www\./i,'')||null;
}
function pageUrl(value) {
  const url=httpsUrl(value);
  if(!url)return null;
  if(url.hostname==='posgrados.casagrande.edu.ec' && /^\/maestrias\/?$/.test(url.pathname) &&
      url.searchParams.get('action')==='vermaestria' && /^[A-Z0-9]{4,64}$/.test(url.searchParams.get('id')||'')) {
    return url.origin+'/maestrias?'+new URLSearchParams({action:'vermaestria',id:url.searchParams.get('id')});
  }
  return url.origin+url.pathname;
}
function sameProperty(url,scope) {
  if(!scope || !httpsUrl(url))return false;
  const actual=host(url);
  return actual===scope || actual?.endsWith('.'+scope);
}
function config(env) {
  const key=env.OPENSEO_API_KEY||env.OPENSEO_ACCESS_TOKEN;
  if(!key)return null;
  const url=httpsUrl(env.OPENSEO_MCP_URL||endpointDefault);
  if(!url || url.search || url.hash || typeof key!=='string' || !/^\S{1,2048}$/.test(key))
    throw new OpenSeoError('error','Revisa el endpoint HTTPS y la credencial privada de OpenSEO.');
  const auth=String(env.OPENSEO_AUTH_HEADER||'bearer').toLowerCase();
  if(!['bearer','x-api-key'].includes(auth))throw new OpenSeoError('error','Selecciona una cabecera compatible para la credencial de OpenSEO.');
  return {url:url.href,headers:auth==='x-api-key'?{'x-api-key':key}:{Authorization:'Bearer '+key}};
}

function parseJson(raw) {
  try {return JSON.parse(raw);}
  catch {throw invalid();}
}
async function readEnvelope(response,id,eventStream) {
  if(!response.body)throw invalid();
  if(Number(response.headers.get('content-length'))>maxResponseBytes)throw invalid();
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let raw='',size=0;
  function matchingEvent(packet) {
    const content=packet.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
    if(!content)return null;
    const value=parseJson(content);
    return value?.jsonrpc==='2.0'&&value.id===id?value:null;
  }
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>maxResponseBytes)throw invalid();
      raw+=decoder.decode(value,{stream:true});
      if(!eventStream)continue;
      let separator;
      while((separator=raw.match(/\r?\n\r?\n/))) {
        const packet=raw.slice(0,separator.index);
        raw=raw.slice(separator.index+separator[0].length);
        const result=matchingEvent(packet);
        if(result)return result;
      }
    }
    raw+=decoder.decode();
    if(eventStream) {
      const result=matchingEvent(raw);
      if(result)return result;
      throw invalid();
    }
    return parseJson(raw);
  } finally {
    await reader.cancel().catch(()=>{});
  }
}

function transport(connection) {
  let id=0,session=null,version=null;
  async function send(method,params,notification=false) {
    const body={jsonrpc:'2.0',method,...(params?{params}:{}),...(!notification?{id:++id}:{})};
    const headers={...connection.headers,Accept:'application/json, text/event-stream','Content-Type':'application/json'};
    if(version)headers['MCP-Protocol-Version']=version;
    if(session)headers['Mcp-Session-Id']=session;
    let response;
    try {
      response=await fetch(connection.url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(9000)});
    }catch {throw new OpenSeoError('error','OpenSEO no respondió dentro de la ventana de conexión.');}
    if(!response.ok) {
      await response.body?.cancel().catch(()=>{});
      if([401,403].includes(response.status))throw new OpenSeoError('no_disponible','OpenSEO no autorizó esta credencial o el acceso al proyecto.');
      if(response.status===429)throw new OpenSeoError('bloqueado','OpenSEO limitó temporalmente las consultas.');
      throw new OpenSeoError('error','OpenSEO respondió con HTTP '+response.status+'.');
    }
    if(notification) {
      await response.body?.cancel().catch(()=>{});
      return null;
    }
    const type=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
    if(!['application/json','text/event-stream'].includes(type))throw invalid();
    const envelope=await readEnvelope(response,body.id,type==='text/event-stream');
    if(envelope?.jsonrpc!=='2.0'||envelope.id!==body.id)throw invalid();
    if(envelope.error)throw new OpenSeoError(envelope.error.code===-32601?'no_disponible':'error','El servidor MCP rechazó la lectura solicitada.');
    if(method==='initialize')session=response.headers.get('Mcp-Session-Id');
    return envelope.result;
  }
  async function connect() {
    const hello=await send('initialize',{protocolVersion:latestProtocol,capabilities:{},clientInfo:{name:'Posgrados UCG SEO',version:'1.0.0'}});
    if(!supportedProtocols.has(hello?.protocolVersion))throw new OpenSeoError('no_disponible','El servidor anunció una versión de MCP incompatible.');
    version=hello.protocolVersion;
    await send('notifications/initialized',null,true);
    const tools=new Map(),cursors=new Set();
    let cursor;
    for(let page=0;page<4;page++) {
      const result=await send('tools/list',cursor?{cursor}:{});
      if(!Array.isArray(result?.tools))throw invalid();
      for(const item of result.tools.slice(0,301))if(typeof item?.name==='string'&&!tools.has(item.name))tools.set(item.name,item);
      cursor=result.nextCursor;
      if(!cursor)break;
      if(typeof cursor!=='string'||cursors.has(cursor)||page===3)throw invalid();
      cursors.add(cursor);
    }
    let calls=0;
    async function call(semantic,args={}) {
      const spec=reads[semantic],tool=spec && tools.get(spec.name);
      const schema=tool?.inputSchema;
      const required=schema?.required||[];
      if(!schema||schema.type!=='object'||!creditFreeRead(tool)||!Array.isArray(required)||
        !spec.fields.every(field=>Object.hasOwn(schema.properties||{},field))||
        required.some(field=>!Object.hasOwn(args,field)))throw unknownTool();
      if(++calls>maxToolCalls)throw new OpenSeoError('bloqueado','Se alcanzó el límite de lecturas gratuitas de la sincronización.');
      const result=await send('tools/call',{name:spec.name,arguments:args});
      if(result?.isError)throw new OpenSeoError('no_disponible','La fuente solicitada no está disponible en el proyecto de OpenSEO.');
      if(result?.structuredContent && typeof result.structuredContent==='object')return result.structuredContent;
      for(const entry of result?.content||[]) {
        if(entry?.type!=='text'||typeof entry.text!=='string'||!/^\s*\{/.test(entry.text))continue;
        const value=parseJson(entry.text);
        if(value && typeof value==='object' && !Array.isArray(value))return value;
      }
      throw invalid();
    }
    return {call};
  }
  async function close() {
    if(!session||!version)return;
    try {
      const response=await fetch(connection.url,{method:'DELETE',headers:{...connection.headers,'Mcp-Session-Id':session,'MCP-Protocol-Version':version},
        redirect:'error',signal:AbortSignal.timeout(1500)});
      await response.body?.cancel();
    }catch{/* Expired sessions are also retired by the provider. */}
  }
  return {connect,close};
}

function canonicalPath(value) {
  const url=httpsUrl(pageUrl(value));
  if(!url)return null;
  return url.hostname.replace(/^www\./i,'')+url.pathname.replace(/\/+$/,'')+url.search;
}
const generic=new Set('maestria maestrias posgrado posgrados master en para de y la el los con del mencion innovacion ecuador guayaquil educacion universidad universidad casa grande 2026 online precio costos costo modalidad requisitos dura virtual curso especializacion'.split(' '));
const words=value=>normalized(value).split(/[^a-z0-9]+/).filter(word=>word.length>=2&&!generic.has(word));
function programMatcher(programs,portalOrigin) {
  const canonical=new Map(),knownUrls=new Set(),labels=programs.map(p=>{
    const urls=[p.url,portalOrigin?portalOrigin+'/programas/'+p.slug:null];
    for(const url of urls) {
      const key=canonicalPath(url);
      if(key)canonical.set(key,canonical.has(key) && canonical.get(key)!==p.slug?null:p.slug);
      if(key)knownUrls.add(pageUrl(url));
    }
    return {program:p.slug,phrases:[p.shortTitle,p.title,p.slug].filter(Boolean).map(words).filter(x=>x.length)};
  });
  const byPage=value=>canonical.get(canonicalPath(value))||null;
  const byTerm=value=>{
    const tokens=words(value).join(' ');
    const scores=labels.map(({program,phrases})=>({program,score:Math.max(0,...phrases
      .filter(label=>(' '+tokens+' ').includes(' '+label.join(' ')+' ')).map(label=>label.length))})).sort((a,b)=>b.score-a.score);
    return scores[0]?.score && scores[0].score>(scores[1]?.score||0)?scores[0].program:null;
  };
  function sharedPrefix(scope) {
    const found=[...knownUrls].filter(url=>sameProperty(url,scope));
    const prefixes=new Map();
    for(const value of found) {
      const url=new URL(value);
      const path=url.pathname.replace(/\/+$/,'');
      const prefix=url.search?path:path.slice(0,path.lastIndexOf('/')+1);
      if(prefix.length>2)prefixes.set(prefix,(prefixes.get(prefix)||0)+1);
    }
    const top=[...prefixes].sort((a,b)=>b[1]-a[1])[0];
    return top && top[1]===found.length?top[0]:null;
  }
  return {byPage,byTerm,sharedPrefix};
}
function selectProject(projects,env) {
  if(!Array.isArray(projects))throw invalid();
  const records=projects.filter(row=>projectId(row?.id));
  const domain=host(env.OPENSEO_DOMAIN),portal=host(env.PUBLIC_BASE_URL),school=host(brand.url);
  const targets=[domain,portal,school].filter(Boolean);
  function matching(row) {
    const current=host(row.domain);
    if(!current)return false;
    if(domain)return current===domain;
    return targets.some(target=>current===target||current.endsWith('.'+target));
  }
  const explicit=env.OPENSEO_PROJECT_ID;
  if(explicit) {
    const row=records.find(item=>item.id===explicit);
    if(!row || !matching(row))throw new OpenSeoError('no_disponible','El proyecto indicado no está accesible o su dominio queda fuera de la configuración.');
    return row;
  }
  const related=records.filter(matching);
  const regional=related.filter(row=>row.locationCode===market.locationCode&&row.languageCode==='es');
  const candidates=regional.length?regional:related;
  if(candidates.length!==1)throw new OpenSeoError('pendiente',candidates.length
    ?'Hay varios proyectos compatibles. Indica OPENSEO_PROJECT_ID.':'Asocia un proyecto de OpenSEO al dominio del piloto o al dominio institucional.');
  return candidates[0];
}

const countryFilter=[{dimension:'country',operator:'equals',expression:'ecu'}];
function season(date,offset=0) {
  const end=Date.parse(date)-(4+offset*28)*day;
  return {startDate:new Date(end-27*day).toISOString().slice(0,10),endDate:new Date(end).toISOString().slice(0,10)};
}
function metricEntry(source,program,keyword,fields={}) {
  return {program,keyword,source:sourceLabels[source],sourceKey:source,periodStart:null,periodEnd:null,observedAt:null,checkedAt:null,
    clicks:null,impressions:null,ctr:null,position:null,volume:null,difficulty:null,cpc:null,url:null,trend:[],...fields};
}
function gscResult(result,dimensions,scope) {
  if(result?.ok===false)throw new OpenSeoError('no_disponible','El proyecto no tiene una propiedad de Search Console disponible para esta lectura.');
  if(!Array.isArray(result?.rows)||!Array.isArray(result.dimensions)||
    dimensions.some((dimension,index)=>result.dimensions[index]!==dimension)||
    !isoDay(result.startDate)||!isoDay(result.endDate))throw invalid();
  const propertyHost=host(result.siteUrl);
  if(!propertyHost || !(propertyHost===scope || propertyHost.endsWith('.'+scope)||scope.endsWith('.'+propertyHost)))
    throw new OpenSeoError('no_disponible','La propiedad de Search Console queda fuera del dominio asociado al proyecto.');
  return result;
}
function gscMetrics(row) {
  return {clicks:metric(row.clicks),impressions:metric(row.impressions),ctr:metric(row.ctr,1),position:position(row.position)};
}
function keywordPageRows(result,matcher,scope) {
  const values=[];
  for(const row of result.rows) {
    const keyword=term(row?.keys?.[0]),url=pageUrl(row?.keys?.[1]);
    if(!keyword||!url||!sameProperty(url,scope))continue;
    const program=matcher.byPage(url);
    const metrics=gscMetrics(row);
    if(!program||Object.values(metrics).every(value=>value===null))continue;
    values.push(metricEntry('gsc',program,keyword,{...metrics,url,observedAt:result.endDate,periodStart:result.startDate,periodEnd:result.endDate}));
  }
  return values;
}
const trendPoint=(date,fields)=>({date,position:null,volume:null,clicks:null,impressions:null,...fields});
function keywordKey(row) {
  return [normalized(row.keyword),row.url||'',row.device||'',row.trackerId||''].join('|');
}
async function searchConsole(client,project,matcher,scope,date) {
  const prefix=matcher.sharedPrefix(scope);
  const filters=prefix?[...countryFilter,{dimension:'page',operator:'contains',expression:prefix}]:countryFilter;
  const extract=async window=>gscResult(await client.call('gsc',{projectId:project.id,dimensions:['query','page'],...window,
    filters,rowLimit:250,dataState:'final',type:'web'}),['query','page'],scope);
  const current=await extract(season(date));
  let prior;
  try {prior=await extract(season(date,1));}catch{/* Keep the current observation when the comparison is unavailable. */}
  const older=new Map(prior?keywordPageRows(prior,matcher,scope).map(row=>[keywordKey(row),row]):[]);
  const rows=keywordPageRows(current,matcher,scope).map(row=>{
    const before=older.get(keywordKey(row));
    return {...row,checkedAt:date,trend:before?[
      trendPoint(before.periodEnd,{position:before.position,clicks:before.clicks,impressions:before.impressions}),
      trendPoint(row.periodEnd,{position:row.position,clicks:row.clicks,impressions:row.impressions})
    ]:[]};
  });
  return {rows,observedAt:current.endDate,detail:'Search Console: consultas y páginas de Ecuador. '+(current.hasMore?'La muestra contiene las primeras 250 filas del proveedor.':'Solo se asignan consultas a fichas identificadas por URL.')};
}
async function domainMetrics(client,project,scope,date) {
  const result=gscResult(await client.call('gsc',{projectId:project.id,dimensions:['date'],...season(date),filters:countryFilter,
    rowLimit:50,dataState:'final',type:'web'}),['date'],scope);
  const points=result.rows.flatMap(row=>{
    const observation=isoDay(row?.keys?.[0]);
    if(!observation || observation<result.startDate || observation>result.endDate)return [];
    const fields=gscMetrics(row);
    return Object.values(fields).some(value=>value!==null)?[trendPoint(observation,fields)]:[];
  });
  const trend=[...new Map(points.map(point=>[point.date,point])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  const total=key=>trend.length && trend.every(row=>row[key]!==null)?trend.reduce((sum,row)=>sum+row[key],0):null;
  const clicks=total('clicks'),impressions=total('impressions');
  const measured=trend.length?{host:host(result.siteUrl),property:result.siteUrl,source:sourceLabels.domain,observedAt:result.endDate,checkedAt:date,
    periodStart:result.startDate,periodEnd:result.endDate,daysWithRows:trend.length,clicks,impressions,ctr:impressions>0 && clicks!==null?clicks/impressions:null,
    estimatedTraffic:null,estimatedKeywords:null,trend}:null;
  return {data:measured,observedAt:result.endDate,detail:'Métricas observadas por Search Console para la propiedad y el país Ecuador. Se suman '+trend.length+' días con filas del proveedor.'};
}
async function savedKeywords(client,project,matcher,date) {
  if(project.locationCode!==market.locationCode || project.languageCode!=='es')
    throw new OpenSeoError('no_disponible','El proyecto tiene otro mercado predeterminado. Selecciona Ecuador y español para las palabras guardadas.');
  const result=await client.call('saved',{projectId:project.id,limit:250});
  if(!Array.isArray(result?.rows))throw invalid();
  const rows=result.rows.flatMap(row=>{
    const keyword=term(row?.keyword),program=keyword&&matcher.byTerm(keyword);
    return program?[metricEntry('saved_keywords',program,keyword,{
      checkedAt:date,volume:metric(row.searchVolume),difficulty:metric(row.keywordDifficulty,100),cpc:metric(row.cpc)
    })]:[];
  });
  return {rows,detail:'Palabras guardadas en el proyecto de Ecuador y español. El proveedor no indica la fecha de esas estimaciones.'+
    (result.totalCount>result.rows.length?' Se importó una muestra de las primeras filas.':'')};
}
function rankDeviceRows(result,tracker,matcher,scope,date) {
  if(!Array.isArray(result?.results?.rows))throw invalid();
  const entries=[];
  for(const row of result.results.rows) {
    const keyword=term(row?.keyword);
    if(!keyword)continue;
    for(const device of ['mobile','desktop']) {
      const detail=row[device];
      if(!detail || typeof detail!=='object')continue;
      const raw=pageUrl(detail.rankingUrl);
      const url=raw&&sameProperty(raw,scope)?raw:null;
      const program=url&&matcher.byPage(url)||matcher.byTerm(keyword);
      const observedAt=safeDate(detail.lastCheckedAt)||safeDate(result.results.run?.lastCheckedAt);
      const current=position(detail.position);
      if(!program || (current===null && !observedAt))continue;
      entries.push(metricEntry('rank',program,keyword,{position:current,observedAt,checkedAt:date,url,
        device,trackerId:tracker.id,location:titleText(tracker.locationName)||'Ecuador',rankingFound:current!==null}));
    }
  }
  return entries;
}
async function rankKeywords(client,project,matcher,scope,date) {
  const list=await client.call('rank',{projectId:project.id});
  if(!Array.isArray(list?.configs))throw invalid();
  const compatible=list.configs.filter(item=>projectId(item?.id)&&item.locationCode===market.locationCode&&item.languageCode==='es'&&
    (host(item.domain)===scope || host(item.domain)?.endsWith('.'+scope)));
  if(!compatible.length)return {rows:[],detail:'El proyecto carece de un seguimiento existente para Ecuador en español.'};
  const latest=compatible.sort((a,b)=>String(b.lastCheckedAt||'').localeCompare(String(a.lastCheckedAt||'')))[0];
  const recorded=await client.call('rank',{projectId:project.id,trackerId:latest.id,limit:150});
  const rows=rankDeviceRows(recorded,latest,matcher,scope,date);
  const byDevice=new Map();
  if(rows.length)await Promise.all([...new Set(rows.map(row=>row.device))].map(async device=>{
    try {
      const result=await client.call('history',{projectId:project.id,trackerId:latest.id,device,runs:8,limit:150});
      if(!Array.isArray(result?.rows)||result.device!==device||result.trackerId!==latest.id)return;
      const history=new Map(result.rows.flatMap(row=>typeof row?.keyword==='string' && Array.isArray(row.history)?[[normalized(row.keyword),row.history]]:[]));
      byDevice.set(device,history);
    }catch{/* Latest verified positions remain usable when history is unavailable. */}
  }));
  for(const row of rows) {
    const history=byDevice.get(row.device)?.get(normalized(row.keyword))||[];
    row.trend=history.flatMap(point=>{
      const at=safeDate(point?.checkedAt);
      return at && point.checked===true?[trendPoint(at,{position:position(point.position)})]:[];
    }).sort((a,b)=>a.date.localeCompare(b.date));
  }
  return {rows,observedAt:rows.map(row=>row.observedAt).filter(Boolean).sort().at(-1)||null,
    detail:'Último seguimiento configurado para Ecuador en español. Se muestran posiciones de comprobaciones existentes por dispositivo.'+
      (compatible.length>1?' Se seleccionó el seguimiento más reciente.':'')};
}
async function siteAudit(client,project,matcher,scope,date) {
  const prefix=matcher.sharedPrefix(scope);
  const result=await client.call('audit',{projectId:project.id,page:1,limit:150,...(prefix?{urlContains:prefix}:{})});
  if(!Array.isArray(result?.pages))throw invalid();
  const rows=result.pages.flatMap(item=>{
    const url=pageUrl(item?.url),program=url&&sameProperty(url,scope)&&matcher.byPage(url);
    if(!program)return [];
    return [{program,source:sourceLabels.audit,url,title:titleText(item.title,250)||null,description:titleText(item.metaDescription,280)||null,
      statusCode:metric(item.statusCode,599),indexable:typeof item.isIndexable==='boolean'?item.isIndexable:null,
      wordCount:metric(item.wordCount),inSitemap:typeof item.inSitemap==='boolean'?item.inSitemap:null,
      responseTimeMs:metric(item.responseTimeMs),observedAt:safeDate(item.crawledAt),checkedAt:date}];
  });
  return {rows,observedAt:rows.map(row=>row.observedAt).filter(Boolean).sort().at(-1)||null,
    detail:'Datos de la auditoría previamente guardada. '+(result.total>result.pages.length?'Se revisó la primera página del reporte.':'Los resultados se asignan por URL de ficha.')};
}

async function lease(db,date) {
  const stale=new Date(Date.parse(date)-3*60000).toISOString();
  const retry=new Date(Date.parse(date)-15*60000).toISOString();
  const next=new Date(Date.parse(date)-day).toISOString();
  const token=crypto.randomUUID();
  const row=await select(db,`INSERT INTO openseo_runtime(id,token,started_at,state) VALUES(1,?,?,'en_curso')
    ON CONFLICT(id) DO UPDATE SET token=excluded.token,started_at=excluded.started_at,finished_at=NULL,state='en_curso'
    WHERE (openseo_runtime.state='en_curso' AND openseo_runtime.started_at<=?)
      OR (openseo_runtime.state='error' AND openseo_runtime.started_at<=?)
      OR (openseo_runtime.state NOT IN ('en_curso','error') AND openseo_runtime.started_at<=?) RETURNING token`,
    token,date,stale,retry,next).first();
  return row?.token;
}
function sourceWrite(db,key,project,state,checkedAt,observedAt,detail,payload,replace=false) {
  return select(db,`INSERT INTO openseo_sources(key,project_id,state,checked_at,observed_at,detail,payload) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET project_id=COALESCE(excluded.project_id,openseo_sources.project_id),
      state=excluded.state,checked_at=excluded.checked_at,detail=excluded.detail,
      observed_at=CASE WHEN ? OR excluded.observed_at IS NOT NULL THEN excluded.observed_at ELSE openseo_sources.observed_at END,
      payload=CASE WHEN ? OR excluded.payload IS NOT NULL THEN excluded.payload ELSE openseo_sources.payload END`,
  key,project,state,checkedAt,observedAt,detail,payload===undefined?null:JSON.stringify(payload),Number(replace),Number(replace));
}
function compactKeywords(rows) {
  const kept=[],counts=new Map(),seen=new Set();
  const priority=row=>row.impressions??row.volume??(row.position===null?0:100-row.position);
  for(const row of rows.sort((a,b)=>priority(b)-priority(a))) {
    const key=row.program+'|'+keywordKey(row),n=counts.get(row.program)||0;
    if(n>=12||seen.has(key))continue;
    seen.add(key);counts.set(row.program,n+1);kept.push({program:row.program,key,payload:row});
  }
  return kept;
}
async function sourceRefresh(env,project,key,date,reader,group) {
  const db=env.DB;
  try {
    const evidence=await reader();
    const state=(evidence.rows?.length||evidence.data)?'disponible':'sin_datos';
    const writes=[sourceWrite(db,key,project.id,state,date,evidence.observedAt||null,evidence.detail,evidence.data,true)];
    if(group==='keywords') {
      writes.push(select(db,'DELETE FROM openseo_keywords WHERE project_id=? AND source=?',project.id,key));
      const rows=compactKeywords(evidence.rows);
      if(rows.length)writes.push(select(db,`INSERT INTO openseo_keywords(project_id,source,program,keyword_key,payload)
        SELECT ?,?,json_extract(value,'$.program'),json_extract(value,'$.key'),json_extract(value,'$.payload') FROM json_each(?)`,
        project.id,key,JSON.stringify(rows)));
    }
    if(group==='audit') {
      writes.push(select(db,'DELETE FROM openseo_program_audit WHERE project_id=?',project.id));
      const byProgram=[...new Map(evidence.rows.map(row=>[row.program,row])).values()];
      if(byProgram.length)writes.push(select(db,`INSERT INTO openseo_program_audit(project_id,program,payload)
        SELECT ?,json_extract(value,'$.program'),value FROM json_each(?)`,project.id,JSON.stringify(byProgram)));
    }
    await db.batch(writes);
    return {key,state};
  }catch(error) {
    const state=error instanceof OpenSeoError?error.state:'error';
    await sourceWrite(db,key,project.id,state,date,null,error instanceof OpenSeoError?error.message:statuses.error).run();
    return {key,state};
  }
}
const migrationMissing=error=>/no such table.*openseo_/i.test(error?.message||'');
export async function syncOpenSeo(env,programs=catalog) {
  if(!env?.DB)return {status:'sin_configurar',message:'Está pendiente el registro de evidencias OpenSEO.'};
  let connection;
  const db=env.DB,date=now();
  try {connection=config(env);}
  catch(error) {
    await sourceWrite(db,'proyecto',null,'error',date,null,error.message).run().catch(()=>{});
    return {status:'error',message:error.message};
  }
  if(!connection)return {status:'sin_configurar',message:statuses.sin_configurar};
  let token;
  try {token=await lease(db,date);}
  catch(error) {
    if(migrationMissing(error))return {status:'sin_configurar',message:'Está pendiente la migración de evidencias OpenSEO.'};
    throw error;
  }
  if(!token)return {status:'en_pausa',message:'La sincronización reciente sigue vigente. El máximo es una lectura diaria por instalación.'};
  const mcp=transport(connection);
  let state='error';
  try {
    const client=await mcp.connect();
    const project=selectProject((await client.call('project')).projects,env);
    const scope=host(project.domain);
    const projectData={id:project.id,name:titleText(project.name)||'Proyecto de posgrados',domain:scope,locationCode:project.locationCode??null,
      languageCode:titleText(project.languageCode,16)||null};
    await sourceWrite(db,'proyecto',project.id,'disponible',date,null,'Proyecto de lectura autorizado.',projectData,true).run();
    const portal=httpsUrl(env.PUBLIC_BASE_URL)?.origin||null;
    const matcher=programMatcher(programs,portal);
    const sourceTasks=[
      ['gsc',()=>searchConsole(client,project,matcher,scope,date),'keywords'],
      ['domain',()=>domainMetrics(client,project,scope,date)],
      ['saved_keywords',()=>savedKeywords(client,project,matcher,date),'keywords'],
      ['rank',()=>rankKeywords(client,project,matcher,scope,date),'keywords'],
      ['audit',()=>siteAudit(client,project,matcher,scope,date),'audit']
    ];
    const results=await Promise.all(sourceTasks.map(([key,read,group])=>sourceRefresh(env,project,key,date,read,group)));
    state=results.every(row=>row.state==='error')?'error':'completado';
    return {status:state,checkedAt:date,project:projectData,sources:results,message:documentedPolicy};
  }catch(error) {
    const failed=error instanceof OpenSeoError?error.state:'error';
    const message=error instanceof OpenSeoError?error.message:statuses.error;
    await sourceWrite(db,'proyecto',null,failed,date,null,message).run();
    return {status:'error',checkedAt:date,message};
  }finally {
    await mcp.close();
    await select(db,'UPDATE openseo_runtime SET finished_at=?,state=? WHERE id=1 AND token=?',now(),state,token).run();
  }
}

function decode(raw) {try {return JSON.parse(raw);} catch {return null;}}
function publicExamples(observations) {
  return observations.flatMap(item=>{
    const keyword=term(item.keyword),observedAt=safeDate(item.observedAt);
    if(!keyword||!observedAt||!(item.program===null || projectId(item.program))||item.market!=='Ecuador')return [];
    return [{...metricEntry('keyword_generator',item.program,keyword,{volume:metric(item.volume),difficulty:metric(item.difficulty,100),observedAt}),
      source:'OpenSEO · Keyword Generator',sourceUrl:httpsUrl(item.sourceUrl)?.href||null,trustedEstimate:true}];
  });
}
export async function readOpenSeoMetrics(db,program,options={}) {
  const selected=typeof program==='string'&&program?program:null;
  const list=(options.programs||catalog).filter(item=>!selected||selected===item.slug);
  const examples=publicExamples(options.observations||publicKeywordObservations);
  let statusRows=[],keywordRows=[],auditRows=[];
  if(db) {
    try {
      statusRows=await all(db,'SELECT * FROM openseo_sources');
      const project=statusRows.find(row=>row.key==='proyecto')?.project_id;
      if(project) {
        const filter=selected?' AND program=?':'';
        const args=selected?[project,selected]:[project];
        [keywordRows,auditRows]=await Promise.all([
          all(db,'SELECT program,source,payload FROM openseo_keywords WHERE project_id=?'+filter,...args),
          all(db,'SELECT program,payload FROM openseo_program_audit WHERE project_id=?'+filter,...args)
        ]);
      }
    }catch(error) {
      if(!migrationMissing(error))throw error;
    }
  }
  const projectRow=statusRows.find(row=>row.key==='proyecto');
  const project=decode(projectRow?.payload);
  const stateDefault=options.configured?'pendiente':'sin_configurar';
  const statusesPassthrough=Object.entries(sourceLabels).map(([key,label])=>{
    const item=statusRows.find(row=>row.key===key&&(key==='proyecto'||!project||row.project_id===project.id));
    const state=key==='research'?'bloqueado':item?.state||stateDefault;
    const stale=!!item?.checked_at && Date.now()-Date.parse(item.checked_at)>7*day;
    return {key,label,state,stale,checkedAt:item?.checked_at||null,observedAt:item?.observed_at||null,
      detail:(item?.detail||statuses[state])+(stale?' La última consulta al proveedor fue hace más de siete días.':'')};
  });
  statusesPassthrough.push({key:'keyword_generator',label:'OpenSEO · Keyword Generator',state:examples.length?'disponible':'sin_datos',
    checkedAt:null,observedAt:examples.map(row=>row.observedAt).sort().at(-1)||null,
    detail:'Estimaciones para palabras exactas, observadas en el generador de OpenSEO para Ecuador.'});
  const cards=list.map(info=>{
    const keywords=keywordRows.filter(row=>row.program===info.slug).map(row=>decode(row.payload)).filter(Boolean);
    const covered=new Set(keywords.filter(item=>item.sourceKey==='saved_keywords' && item.volume!==null).map(item=>normalized(item.keyword)));
    const observed=examples.filter(item=>item.program===info.slug && !covered.has(normalized(item.keyword)));
    const combined=[...keywords,...observed];
    const audit=decode(auditRows.find(row=>row.program===info.slug)?.payload);
    const sources=statusesPassthrough.filter(row=>['gsc','saved_keywords','rank','audit','keyword_generator'].includes(row.key)).map(row=>{
      const evidence=combined.filter(item=>item.sourceKey===row.key);
      const hasData=evidence.length>0 || (row.key==='audit' && audit);
      return {...row,state:hasData?row.state:row.state==='disponible'?'sin_datos':row.state,
        observedAt:hasData?(row.key==='audit'?audit.observedAt:evidence.map(item=>item.observedAt).filter(Boolean).sort().at(-1)||null):null};
    });
    return {program:info.slug,title:info.title,sources,keywords:combined,audit};
  });
  const domainRow=statusRows.find(row=>row.key==='domain'&&row.project_id===project?.id);
  return {market,project:project||null,sources:statusesPassthrough,programs:cards,generalKeywords:examples.filter(item=>item.program===null),
    domain:decode(domainRow?.payload),policy:documentedPolicy};
}
