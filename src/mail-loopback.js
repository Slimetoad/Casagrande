import {json,secretMatches} from './observability.js'
import {digest,mailReady,now,select,ServiceError} from './providers.js'

const subjectPrefix='Prueba técnica del correo de posgrados · '
const runKind='sonda_correo'
const requestKind='sonda_correo_payload'
const retryKind='sonda_correo_reintento'
const interval=10*60000
const retryWindow=12*60*60000
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const reasons={
  timeout:'La solicitud agotó el tiempo de espera.',
  transport_error:'La conexión terminó antes de recibir una respuesta HTTP.',
  http_error:'La solicitud recibió un error HTTP sin un código reconocido de Resend.',
  invalid_response:'La respuesta HTTP no confirmó el resultado de la operación.',
  unexpected_content:'El correo recuperado no coincide con la comprobación solicitada.',
  validation_error:'Resend rechazó la configuración de la solicitud.',
  missing_api_key:'Falta la clave de Resend.',
  restricted_api_key:'La clave de Resend no tiene el alcance requerido para esta operación.',
  invalid_permission:'Resend rechazó los permisos para esta operación.',
  suspended_api_key:'La clave de Resend está suspendida.',
  email_above_quota:'La cuota de Resend impide recuperar este correo.',
  rate_limit_exceeded:'Resend limitó la frecuencia de las solicitudes.',
  daily_quota_exceeded:'Se alcanzó la cuota diaria de Resend.',
  monthly_quota_exceeded:'Se alcanzó la cuota mensual de Resend.',
  not_found:'Resend aún no encuentra el recurso solicitado.',
  invalid_parameter:'Resend rechazó un parámetro de la solicitud.',
  missing_required_field:'Falta un campo requerido por Resend.',
  invalid_idempotency_key:'Resend rechazó la clave de idempotencia.',
  concurrent_idempotent_requests:'Resend está procesando una solicitud con la misma clave de idempotencia.',
  invalid_idempotent_request:'Resend recibió una solicitud incompatible con la clave de idempotencia.',
  application_error:'Resend informó un error interno de aplicación.',
  dns_lookup_failed:'Resend informó un error al comprobar DNS.',
  return_path_unavailable:'Resend no pudo utilizar el dominio de retorno.',
  service_unavailable:'Resend informó indisponibilidad temporal.'
}
const localCodes=new Set(['timeout','transport_error','http_error','invalid_response','unexpected_content'])
const httpStatus=value=>Number.isInteger(value)&&value>=100&&value<=599?value:null
function address(value) {
  const raw=String(value||'').trim().toLowerCase()
  const parsed=raw.match(/<([^<>\s]+)>$/)?.[1]||raw
  return /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/.test(parsed)?parsed:''
}
function probeAddress(env) {
  const mailbox=address(env.RESEND_ADMISSIONS_INBOUND_ADDRESS)
  return mailbox?mailbox.replace('@','+prueba@'):''
}
function safeIssue(raw) {
  let value
  try {value=JSON.parse(raw)} catch {return null}
  if(!['envio','lectura'].includes(value?.phase)||typeof value.code!=='string'||!Object.hasOwn(reasons,value.code))return null
  return {phase:value.phase,httpStatus:httpStatus(value.httpStatus),code:value.code,reason:reasons[value.code]}
}
function receipt(row) {
  const issue=safeIssue(row.diagnostic)
  return {id:row.id,state:row.state,requestedAt:row.requested_at,accepted:!!(row.outbound_id||row.received_at),read:!!row.received_at,
    receivedAt:row.received_at,issue:row.outbound_id && issue?.phase==='envio'?null:issue}
}

export async function latestMailProbe(db,id='') {
  if(!db)return null
  try {
    const result=await select(db,
      "SELECT p.*,r.result AS diagnostic FROM admissions_mail_probes p LEFT JOIN background_runs r ON r.kind=? AND r.slot=p.id WHERE (?='' OR p.id=?) ORDER BY p.requested_at DESC LIMIT 1",
      runKind,id,id).first()
    return result?receipt(result):null
  }catch(error) {
    if(/no such table.*admissions_mail_probes/i.test(error?.message||''))return null
    throw error
  }
}

async function boundedJSON(response,limit) {
  if(Number(response.headers.get('Content-Length'))>limit) {
    await response.body?.cancel().catch(()=>{})
    return null
  }
  const reader=response.body?.getReader()
  if(!reader)return null
  const decoder=new TextDecoder('utf-8',{fatal:true})
  let size=0,text=''
  try {
    for(;;){
      const {value,done}=await reader.read()
      if(done)break
      size+=value.byteLength
      if(size>limit){await reader.cancel();return null}
      text+=decoder.decode(value,{stream:true})
    }
    return JSON.parse(text+decoder.decode())
  }catch {return null}
}
async function resendProbe(url,options,successLimit) {
  let response
  try {response=await fetch(url,options)} catch(error) {
    return {issue:{httpStatus:null,code:['AbortError','TimeoutError'].includes(error?.name)?'timeout':'transport_error'}}
  }
  const body=await boundedJSON(response,response.ok?successLimit:4096)
  const status=httpStatus(response.status)
  if(response.ok)return {body,status}
  const reported=[body?.name,body?.code,body?.error?.name].find(code=>typeof code==='string'&&Object.hasOwn(reasons,code)&&!localCodes.has(code))
  return {issue:{httpStatus:status,code:reported||'http_error'}}
}
async function recordIssue(db,id,phase,issue) {
  const when=now(),diagnostic=JSON.stringify({phase,httpStatus:issue.httpStatus,code:issue.code})
  await db.batch([
    select(db,"INSERT INTO background_runs(kind,slot,state,started_at,finished_at,result) SELECT ?,id,'error',requested_at,?,? FROM admissions_mail_probes WHERE id=? AND received_at IS NULL ON CONFLICT(kind,slot) DO UPDATE SET finished_at=excluded.finished_at,result=excluded.result",
      runKind,when,diagnostic,id),
    select(db,"UPDATE admissions_mail_probes SET state='por_conciliar' WHERE id=? AND received_at IS NULL",id)
  ])
}

function probePayload(env,to,id) {
  return JSON.stringify({from:env.RESEND_FROM,to:[to],subject:subjectPrefix+id,
    text:'Verificación interna de recepción de posgrados. Referencia '+id+'.',tags:[{name:'flujo',value:'prueba-tecnica-ucg'}]})
}
async function sendProbe(env,id,body) {
  const result=await resendProbe('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'ucg-prueba-'+id},
    body,signal:AbortSignal.timeout(10000),redirect:'manual'},8192)
  const messageId=result.body?.id
  if(result.issue || typeof messageId!=='string' || !uuid.test(messageId)){
    await recordIssue(env.DB,id,'envio',result.issue||{httpStatus:result.status,code:'invalid_response'})
    const probe=await latestMailProbe(env.DB,id)
    if(probe?.read)return json({probe},201)
    return json({id,probe,error:'Revisa el registro de Resend antes de repetir la prueba.'},502)
  }
  await select(env.DB,`UPDATE admissions_mail_probes SET outbound_id=?,state=CASE WHEN received_at IS NOT NULL THEN 'verificada'
    WHEN EXISTS (SELECT 1 FROM background_runs r WHERE r.kind=? AND r.slot=admissions_mail_probes.id
      AND CASE WHEN json_valid(r.result) THEN json_extract(r.result,'$.phase') END='lectura') THEN 'por_conciliar'
    ELSE 'aceptada' END WHERE id=? AND outbound_id IS NULL`,messageId,runKind,id).run()
  return json({probe:await latestMailProbe(env.DB,id)},201)
}

function eligibleRetry(probe,earliest,latest) {
  return probe?.state==='por_conciliar' && !probe.accepted && probe.requestedAt>earliest &&
    probe.requestedAt<=latest && probe.issue?.phase==='envio' &&
    probe.issue.code==='transport_error' && probe.issue.httpStatus===null
}

async function retryProbe(env,to,id) {
  const db=env.DB, time=Date.now(), stamp=new Date(time).toISOString()
  const earliest=new Date(time-retryWindow).toISOString()
  const cooldown=new Date(time-interval).toISOString()
  const probe=await latestMailProbe(db,id)
  if(!probe)return json({error:'No se encontró la sonda solicitada.'},404)
  if(probe.accepted)return json({probe})
  if(!eligibleRetry(probe,earliest,stamp))return json({probe,error:'La sonda no cumple las condiciones para reintentar el envío.'},409)
  const body=probePayload(env,to,id),fingerprint=await digest(body)
  const fingerprints=await select(db,'SELECT result FROM background_runs WHERE kind IN (?,?) AND slot=?',requestKind,retryKind,id).all()
  if(fingerprints.results.some(row=>row.result!==fingerprint))
    return json({probe,error:'La configuración actual ya no coincide con la solicitud original.'},409)
  const claim=await select(db,`INSERT INTO background_runs(kind,slot,state,started_at,finished_at,result)
    SELECT ?,p.id,'en_curso',?,NULL,? FROM admissions_mail_probes p
    JOIN background_runs d ON d.kind=? AND d.slot=p.id
    LEFT JOIN background_runs s ON s.kind=? AND s.slot=p.id
    WHERE p.id=? AND p.state='por_conciliar' AND p.outbound_id IS NULL AND p.received_at IS NULL
      AND p.requested_at>? AND p.requested_at<=? AND (s.slot IS NULL OR s.result=?)
      AND CASE WHEN json_valid(d.result) THEN json_extract(d.result,'$.phase') END='envio'
      AND CASE WHEN json_valid(d.result) THEN json_extract(d.result,'$.code') END='transport_error'
      AND CASE WHEN json_valid(d.result) THEN json_type(d.result,'$.httpStatus') END='null'
    ON CONFLICT(kind,slot) DO UPDATE SET state='en_curso',started_at=excluded.started_at,finished_at=NULL
      WHERE background_runs.started_at<=? AND background_runs.result=excluded.result RETURNING slot`,
    retryKind,stamp,fingerprint,runKind,requestKind,id,earliest,stamp,fingerprint,cooldown).first()
  const current=await latestMailProbe(db,id)
  if(!claim) {
    if(current?.accepted)return json({probe:current})
    if(!eligibleRetry(current,earliest,stamp))return json({probe:current,error:'Cambió el estado de la sonda. Consulta el resultado.'},409)
    return json({probe:current,error:'Ya hubo un reintento reciente. Espera diez minutos y consulta su resultado.'},429)
  }
  let result
  try {
    result=current?.accepted?json({probe:current}):eligibleRetry(current,earliest,stamp)?
      await sendProbe(env,id,body):json({probe:current,error:'Cambió el estado de la sonda. Consulta el resultado.'},409)
  }finally {
    await select(db,"UPDATE background_runs SET state=?,finished_at=? WHERE kind=? AND slot=? AND started_at=?",
      result?.ok?'completado':'error',now(),retryKind,id,stamp).run()
  }
  return result
}

export async function handleMailCheck(request,env) {
  if(!await secretMatches(request.headers.get('X-UCG-Mantenimiento'),env.MAINTENANCE_TOKEN))return json({error:'Credencial de servicio requerida.'},403)
  if(request.method==='GET')return json({probe:await latestMailProbe(env.DB)})
  if(request.method!=='POST')return json({error:'Método no permitido.'},405)
  const to=probeAddress(env)
  if(!env.DB||!mailReady(env)||!to||!env.RESEND_WEBHOOK_SECRET)return json({error:'La prueba requiere conexión de datos, remitente, recepción y webhook configurados.'},409)
  const retries=new URL(request.url).searchParams.getAll('reintentar')
  if(retries.length){
    if(retries.length!==1||!uuid.test(retries[0]))return json({error:'Indica un identificador de sonda válido.'},400)
    return retryProbe(env,to,retries[0])
  }
  const id=crypto.randomUUID(),stamp=now(),body=probePayload(env,to,id)
  const fingerprint=await digest(body)
  const [write]=await env.DB.batch([
    select(env.DB,"INSERT INTO admissions_mail_probes(id,requested_at) SELECT ?,? WHERE NOT EXISTS (SELECT id FROM admissions_mail_probes WHERE requested_at>?)",
      id,stamp,new Date(Date.parse(stamp)-interval).toISOString()),
    select(env.DB,"INSERT INTO background_runs(kind,slot,state,started_at,result) SELECT ?,id,'registrada',requested_at,? FROM admissions_mail_probes WHERE id=?",
      requestKind,fingerprint,id)
  ])
  if(!write.meta.changes)return json({error:'Ya hay una prueba reciente. Consulta su resultado.'},429)
  return sendProbe(env,id,body)
}

// Authenticated incoming webhooks only. A challenge must match a recent request,
// our sender, the technical recipient and the body retrieved from the provider.
export async function recordMailLoopback(env,event) {
  const to=probeAddress(env),data=event?.data
  const recipients=[data?.received_for,data?.to].flatMap(value=>Array.isArray(value)?value:typeof value==='string'?[value]:[])
  if(!to||!recipients.some(value=>address(value)===to))return false
  const subject=String(data.subject||''),id=subject.startsWith(subjectPrefix)?subject.slice(subjectPrefix.length):''
  if(!uuid.test(id)||address(data.from)!==address(env.RESEND_FROM)||!uuid.test(data.email_id||''))return true
  const match=await select(env.DB,'SELECT id,received_at FROM admissions_mail_probes WHERE id=? AND requested_at>=?',id,new Date(Date.now()-86400000).toISOString()).first()
  if(!match||match.received_at)return true
  const key=env.RESEND_RECEIVING_API_KEY||env.RESEND_API_KEY
  const check=key?await resendProbe('https://api.resend.com/emails/receiving/'+data.email_id,{headers:{'Authorization':'Bearer '+key},signal:AbortSignal.timeout(7000),redirect:'manual'},128000):
    {issue:{httpStatus:null,code:'missing_api_key'}}
  if(check.issue || !check.body) {
    await recordIssue(env.DB,id,'lectura',check.issue||{httpStatus:check.status,code:'invalid_response'})
    throw new ServiceError('La lectura de la sonda no está confirmada. Resend puede volver a entregar el webhook.',503)
  }
  const mail=check.body
  if(mail.id!==data.email_id||mail.subject!==subject||typeof mail.text!=='string'||!mail.text.includes(id)){
    await recordIssue(env.DB,id,'lectura',{httpStatus:check.status,code:'unexpected_content'})
    return true
  }
  await select(env.DB,"UPDATE admissions_mail_probes SET inbound_id=?,received_at=?,state='verificada' WHERE id=? AND received_at IS NULL",data.email_id,now(),id).run()
  return true
}
