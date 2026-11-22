const encoder = new TextEncoder();
export const now = () => new Date().toISOString();
export const inHours = hours => new Date(Date.now() + hours * 3600000).toISOString();
export const select = (db, sql, ...args) => db.prepare(sql).bind(...args);
export const all = async (db, sql, ...args) => (await select(db, sql, ...args).all()).results || [];
export const clean = (value, length = 400) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,length) : '';
export const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export class ServiceError extends Error {
  constructor(message, status=503, remoteStatus=0) { super(message); this.status = status; this.remoteStatus = remoteStatus; }
}
export async function requestRemote(url, options, label) {
  let response;
  try { response = await fetch(url,{...options,signal:AbortSignal.timeout(16000)}); }
  catch { throw new ServiceError(label+' no confirmó la solicitud. Comprueba el estado del proveedor.'); }
  if (!response.ok) throw new ServiceError(label+' devolvió el código '+response.status+'. Revisa la configuración del servicio.',503,response.status);
  return response;
}
const aiProviders = {
  openai:{label:'OpenAI',key:'OPENAI_API_KEY',model:'OPENAI_MODEL'},
  anthropic:{label:'Claude · Anthropic',key:'ANTHROPIC_API_KEY',model:'ANTHROPIC_MODEL'},
  google:{label:'Gemini · Google',key:'GEMINI_API_KEY',model:'GEMINI_MODEL'}
};
export function activeAI(env) {
  const raw=String(env.LLM_PROVIDER||'').toLowerCase();
  const provider=({gemini:'google',claude:'anthropic'})[raw]||raw;
  const key=provider || Object.keys(aiProviders).find(p => env[aiProviders[p].key] && env[aiProviders[p].model]);
  return key && aiProviders[key] && env[aiProviders[key].key] && env[aiProviders[key].model] ? key : null;
}
export function publicOrigin(env) {
  try {
    const u=new URL(env.PUBLIC_BASE_URL);
    return u.protocol==='https:' && !u.username && !u.password ? u.origin : '';
  } catch {return '';}
}
export const gscReady=env=>!!(env.GSC_SITE && (env.GSC_ACCESS_TOKEN || (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN)));
export const semrushReady=env=>!!(env.SEMRUSH_API_KEY && env.SEMRUSH_DOMAIN && env.SEMRUSH_DATABASE);
export const mailReady=env=>!!(env.RESEND_API_KEY && env.RESEND_FROM && publicOrigin(env));
export const voiceReady=env=>!!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM && publicOrigin(env));
export const enabled=v=>String(v).toLowerCase()==='true';
export const e164=value=>typeof value==='string' && /^\+[1-9]\d{7,14}$/.test(value);
export function channelPhone(value) {
  const number=String(value||'').trim();
  if(!/^[+\d\s().-]+$/.test(number))return '';
  const digits=number.replace(/\D/g,'');
  const canonical=number.startsWith('+')?number.replace(/[^+\d]/g,''):
    /^0[2-9]\d{7,8}$/.test(digits)?'+593'+digits.slice(1):'+'+digits.replace(/^00/,'');
  return e164(canonical)?canonical:'';
}
export const templateLanguage=env=>env.WHATSAPP_TEMPLATE_LANGUAGE||'es';
const templateKeys={welcome:'WHATSAPP_TEMPLATE_WELCOME',guidance:'WHATSAPP_TEMPLATE_GUIDANCE',application:'WHATSAPP_TEMPLATE_APPLICATION',admission:'WHATSAPP_TEMPLATE_ADMISSION'};
export function whatsappTemplate(env,kind) {
  const name=Object.hasOwn(templateKeys,kind)?env[templateKeys[kind]]:null;
  return /^[a-z0-9_]{1,128}$/.test(name||'')?name:'';
}
export const whatsappKinds=env=>Object.keys(templateKeys).filter(kind=>whatsappTemplate(env,kind));
export const whatsappWebhookReady=env=>!!(env.WHATSAPP_APP_SECRET && /^\d{1,32}$/.test(env.WHATSAPP_BUSINESS_ACCOUNT_ID||'') && /^\d{1,32}$/.test(env.WHATSAPP_PHONE_NUMBER_ID||''));
export const whatsappReady=env=>!!(whatsappWebhookReady(env) && publicOrigin(env) && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_VERIFY_TOKEN && /^v\d{1,3}\.\d{1,2}$/.test(env.WHATSAPP_GRAPH_VERSION||'') && /^es(?:_[A-Z]{2})?$/.test(templateLanguage(env)) && whatsappKinds(env).length);
export const selectedVoice=env=>String(env.OUTREACH_VOICE_PROVIDER||'twilio').trim().toLowerCase();
export const retellReady=env=>!!(publicOrigin(env) && env.RETELL_API_KEY && e164(env.RETELL_FROM) && /^[A-Za-z0-9_-]{1,100}$/.test(env.RETELL_AGENT_ID||'') && (!env.RETELL_AGENT_VERSION || /^(?:latest_published|\d{1,9})$/.test(env.RETELL_AGENT_VERSION)));
export function configRows(env) {
  function row(key,label,ok,detail,paused=false) {
    return {key,label,configured:!!ok,status:!ok?'Pendiente de configuración':paused?'Preparado · envío pausado':'Configurado',detail};
  }
  return [
    ...Object.entries(aiProviders).map(([key,p])=>row(key,p.label,env[p.key] && env[p.model],activeAI(env)===key?'Proveedor seleccionado para orientación y borradores.':'Requiere una clave y un identificador de modelo disponible en la cuenta.')),
    row('resend','Resend',mailReady(env),'Correo de seguimiento con remitente verificado y enlace de preferencias.',!enabled(env.OUTREACH_ENABLED)),
    row('twilio','Twilio Voice',voiceReady(env),selectedVoice(env)==='twilio'?'Voz interactiva con consentimiento y horario de Guayaquil.':'Selecciona Twilio como proveedor de voz para activar las llamadas.',!enabled(env.OUTREACH_ENABLED)||selectedVoice(env)!=='twilio'),
    row('whatsapp','WhatsApp Cloud API',whatsappReady(env),'Registra el webhook de Meta y aprueba en español las plantillas de etapas que quieras enviar.',!enabled(env.OUTREACH_ENABLED)||!enabled(env.OUTREACH_WHATSAPP_ENABLED)),
    row('retell','Retell AI',retellReady(env),'Usa un número importado con salida a Ecuador, un agente publicado en español y el webhook de eventos. Prueba la ruta +593 antes de activar.',!enabled(env.OUTREACH_ENABLED)||selectedVoice(env)!=='retell'),
    row('search-console','Google Search Console',gscReady(env),'Consultas, clics, impresiones y posición de una propiedad verificada.'),
    row('semrush','Semrush',semrushReady(env),'Palabras clave, posición y volumen estimado del mercado configurado.')
  ];
}
export async function aiText(env,system,user,maxTokens=600) {
  const vendor=activeAI(env);
  if (!vendor) throw new ServiceError('Configura un proveedor y un modelo de IA para generar contenido.',409);
  const p=aiProviders[vendor], model=env[p.model], secret=env[p.key];
  let endpoint,body,headers={'Content-Type':'application/json'};
  if(vendor==='anthropic'){
    endpoint='https://api.anthropic.com/v1/messages';
    headers['x-api-key']=secret;headers['anthropic-version']='2023-06-01';
    body={model,max_tokens:maxTokens,system,messages:[{role:'user',content:user}]};
  } else if(vendor==='google'){
    endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
    headers['x-goog-api-key']=secret;
    body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{maxOutputTokens:maxTokens}};
  } else {
    endpoint='https://api.openai.com/v1/responses';
    headers.Authorization='Bearer '+secret;
    body={model,instructions:system,input:user,max_output_tokens:maxTokens,store:false};
  }
  const res=await requestRemote(endpoint,{method:'POST',headers,body:JSON.stringify(body)},p.label);
  const data=await res.json();
  const result=vendor==='anthropic'?data.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n'):
    vendor==='google'?data.candidates?.[0]?.content?.parts?.filter(c=>c.text && !c.thought).map(c=>c.text).join('\n'):
    data.output?.filter(c=>c.type==='message').flatMap(c=>c.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n');
  if(!result?.trim())throw new ServiceError('El proveedor de IA no devolvió texto utilizable.',502);
  return result.trim();
}
export async function digest(value) {
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyMac(bytes, algorithm, value, signature) {
  if(!signature)return false;
  try{
    const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:algorithm},false,['verify']);
    return await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),encoder.encode(value));
  }catch{return false;}
}
export async function incrementLimit(db,bucket,limit,expires){
  const row=await select(db,'INSERT INTO growth_limits(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',bucket,expires,limit).first();
  return !!row;
}
// Never send contact details that an applicant volunteers to a model provider.
export const redact=value=>String(value).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[correo omitido]').replace(/(?:\+?\d[\s().-]*){7,}/g,'[número omitido]');
const stopWords=new Set('para como con del que una por los las quiero saber tengo casa grande universidad maestria maestrias posgrado posgrados sobre es en de mi un y el la'.split(' '));
export function matches(message,programs) {
  const query=normalized(message),words=query.split(/[^a-z0-9]+/).filter(w=>(w.length>2 || w==='ia') && !stopWords.has(w));
  return programs.map(p=>{
    const title=normalized(p.title),short=normalized(p.shortTitle),area=normalized(p.area);
    const score=words.reduce((sum,w)=>{
      if(w==='ia')return sum+(short.startsWith('inteligencia artificial')?12:/\b(inteligencia artificial|ia)\b/.test(short+' '+title)?5:0);
      return sum+(short.includes(w)?7:title.includes(w)?4:area.includes(w)?2:0);
    },0);
    return {program:p,score};
  }).filter(r=>r.score).sort((a,b)=>b.score-a.score).map(r=>r.program);
}
export function programFact(p) {
  return {programa:p.title,area:p.area,modalidad:p.mode||null,duracion:p.duration||null,
    inversion:p.price ?? null,descripcion:p.summary,detalles:p.details||[],tituloOtorgado:p.degree||null,
    asignaturas:(p.curriculum||[]).slice(0,8),notaMalla:p.curriculumNote||null,estadoConvocatoria:p.admissionsStatus||'Consultar convocatoria',
    inscripcion:p.applicationUrl||null,fuente:p.url};
}
export function splitCSV(line) {
  const cells=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){if(quoted && line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(line[i]===';' && !quoted){cells.push(value);value='';}else value+=line[i];
  }
  cells.push(value);return cells;
}
export function eligibleQuery(q,programs){
  return typeof q==='string' && q.trim().length>2 && q.length<240 &&
    !/[@<>/]|\b(?:https?|www\.|cedula|c[eé]dula|pasaporte|mi nombre|contactame|cont[aá]ctame|ll[aá]mame|correo personal)\b/i.test(q) &&
    !/(?:\d[\s().-]*){5,}/.test(q) &&
    (/maestr[ií]a|posgrado|postgrado|master|cuarto nivel/i.test(q) || matches(q,programs).length);
}
export async function getSearchConsole(env,programs){
  let access=env.GSC_ACCESS_TOKEN;
  if(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN) {
    const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
    const res=await requestRemote('https://oauth2.googleapis.com/token',{method:'POST',body},'Google OAuth');
    access=(await res.json()).access_token;
    if(!access)throw new ServiceError('Google no devolvió un token de acceso.');
  }
  const start=inHours(-31*24).slice(0,10),end=inHours(-4*24).slice(0,10);
  const endpoint='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(env.GSC_SITE)+'/searchAnalytics/query';
  const res=await requestRemote(endpoint,{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({startDate:start,endDate:end,dimensions:['query'],type:'web',rowLimit:250})},'Google Search Console');
  const data=await res.json();
  return (data.rows||[]).filter(r=>eligibleQuery(r.keys?.[0],programs)).map(r=>({query:r.keys[0].trim(),clicks:r.clicks,impressions:r.impressions,ctr:r.ctr,position:r.position,volume:null,start,end,priority:Math.log1p(r.impressions)*(1-r.ctr)*(r.position>=3 && r.position<=25?2:1)})).sort((a,b)=>b.priority-a.priority).slice(0,40);
}
export async function getSemrush(env,programs) {
  const params=new URLSearchParams({type:'domain_organic',display_limit:'40',export_columns:'Ph,Po,Nq',domain:env.SEMRUSH_DOMAIN,database:env.SEMRUSH_DATABASE,display_sort:'tr_desc',key:env.SEMRUSH_API_KEY});
  const res=await requestRemote('https://api.semrush.com/?'+params,{},'Semrush');
  const csv=(await res.text()).trim();
  if(/^ERROR 50\b/.test(csv))return [];
  if(!/^Keyword;Position;Search Volume/i.test(csv))throw new ServiceError('Semrush no devolvió un informe válido. Revisa el mercado, el plan y las unidades disponibles.');
  return csv.split(/\r?\n/).slice(1).map(splitCSV).filter(([q,p,v])=>eligibleQuery(q,programs) && Number.isFinite(+p) && Number.isFinite(+v)).map(([q,p,v])=>({query:q,position:+p,volume:+v,clicks:null,impressions:null,ctr:null,start:null,end:now().slice(0,10),priority:Math.log1p(+v)*(+p>=3 && +p<=25?1.8:0.8)}));
}
