import {json,secretMatches} from './observability.js'
import {mailReady,now,select,ServiceError} from './providers.js'

const subjectPrefix='Prueba técnica del correo de posgrados · '
const runKind='sonda_correo'
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
  return {id:row.id,state:row.state,requestedAt:row.requested_at,accepted:!!(row.outbound_id||row.received_at),read:!!row.received_at,
    receivedAt:row.received_at,issue:safeIssue(row.diagnostic)}
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

export async function handleMailCheck(request,env) {
  if(!await secretMatches(request.headers.get('X-UCG-Mantenimiento'),env.MAINTENANCE_TOKEN))return json({error:'Credencial de servicio requerida.'},403)
  if(request.method==='GET')return json({probe:await latestMailProbe(env.DB)})
  if(request.method!=='POST')return json({error:'Método no permitido.'},405)
  const to=probeAddress(env)
  if(!env.DB||!mailReady(env)||!to||!env.RESEND_WEBHOOK_SECRET)return json({error:'La prueba requiere conexión de datos, remitente, recepción y webhook configurados.'},409)
  const id=crypto.randomUUID(),stamp=now()
  const row=await select(env.DB,"INSERT INTO admissions_mail_probes(id,requested_at) SELECT ?,? WHERE NOT EXISTS (SELECT id FROM admissions_mail_probes WHERE requested_at>?) RETURNING id",id,stamp,new Date(Date.now()-600000).toISOString()).first()
  if(!row)return json({error:'Ya hay una prueba reciente. Consulta su resultado.'},429)
  const result=await resendProbe('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'ucg-prueba-'+id},
    body:JSON.stringify({from:env.RESEND_FROM,to:[to],subject:subjectPrefix+id,text:'Verificación interna de recepción de posgrados. Referencia '+id+'.',tags:[{name:'flujo',value:'prueba-tecnica-ucg'}]}),signal:AbortSignal.timeout(10000),redirect:'error'},8192)
  const messageId=result.body?.id
  if(result.issue || typeof messageId!=='string' || !uuid.test(messageId)){
    await recordIssue(env.DB,id,'envio',result.issue||{httpStatus:result.status,code:'invalid_response'})
    const probe=await latestMailProbe(env.DB,id)
    if(probe?.read)return json({probe},201)
    return json({id,probe,error:'Revisa el registro de Resend antes de repetir la prueba.'},502)
  }
  await select(env.DB,"UPDATE admissions_mail_probes SET outbound_id=?,state=CASE WHEN received_at IS NOT NULL THEN 'verificada' WHEN state='por_conciliar' THEN state ELSE 'aceptada' END WHERE id=?",messageId,id).run()
  return json({probe:await latestMailProbe(env.DB,id)},201)
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
  const check=key?await resendProbe('https://api.resend.com/emails/receiving/'+data.email_id,{headers:{'Authorization':'Bearer '+key},signal:AbortSignal.timeout(7000),redirect:'error'},128000):
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
