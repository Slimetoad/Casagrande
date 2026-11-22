import {json,secretMatches} from './observability.js'
import {mailReady,select} from './providers.js'

const subjectPrefix='Prueba técnica del correo de posgrados · '
function address(value) {
  const raw=String(value||'').trim().toLowerCase()
  const parsed=raw.match(/<([^<>\s]+)>$/)?.[1]||raw
  return /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/.test(parsed)?parsed:''
}
function probeAddress(env) {
  const mailbox=address(env.RESEND_ADMISSIONS_INBOUND_ADDRESS)
  return mailbox?mailbox.replace('@','+prueba@'):''
}
function receipt(row) {
  return {id:row.id,state:row.state,requestedAt:row.requested_at,accepted:!!row.outbound_id,read:!!row.received_at,receivedAt:row.received_at}
}
export async function handleMailCheck(request,env) {
  if(!await secretMatches(request.headers.get('X-UCG-Mantenimiento'),env.MAINTENANCE_TOKEN))return json({error:'Credencial de servicio requerida.'},403)
  if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT * FROM admissions_mail_probes ORDER BY requested_at DESC LIMIT 1').first()
    return json({probe:row?receipt(row):null})
  }
  if(request.method!=='POST')return json({error:'Método no permitido.'},405)
  const to=probeAddress(env)
  if(!mailReady(env)||!to||!env.RESEND_WEBHOOK_SECRET)return json({error:'La prueba requiere remitente, recepción y webhook configurados.'},409)
  const id=crypto.randomUUID(),stamp=new Date().toISOString()
  const row=await select(env.DB,`INSERT INTO admissions_mail_probes(id,requested_at) SELECT ?,? WHERE NOT EXISTS
    (SELECT id FROM admissions_mail_probes WHERE requested_at>?) RETURNING id`,id,stamp,new Date(Date.now()-600000).toISOString()).first()
  if(!row)return json({error:'Ya hay una prueba reciente. Consulta su resultado.'},429)
  try{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'ucg-prueba-'+id},
      body:JSON.stringify({from:env.RESEND_FROM,to:[to],subject:subjectPrefix+id,text:'Verificación interna de recepción de posgrados. Referencia '+id+'.',tags:[{name:'flujo',value:'prueba-tecnica-ucg'}]}),signal:AbortSignal.timeout(10000),redirect:'error'})
    const result=await r.json().catch(()=>({}))
    if(!r.ok||!result.id)throw Error('Proveedor no confirmó la prueba')
    await select(env.DB,"UPDATE admissions_mail_probes SET outbound_id=?,state=CASE WHEN received_at IS NULL THEN 'aceptada' ELSE 'verificada' END WHERE id=?",result.id,id).run()
  }catch{
    await select(env.DB,"UPDATE admissions_mail_probes SET state='por_conciliar' WHERE id=? AND received_at IS NULL",id).run()
    return json({id,error:'Revisa el registro de Resend antes de repetir la prueba.'},502)
  }
  return json({probe:receipt(await select(env.DB,'SELECT * FROM admissions_mail_probes WHERE id=?',id).first())},201)
}
// Authenticated incoming webhooks only. A challenge must match a recent request,
// our sender, the technical recipient and the body retrieved from the provider.
export async function recordMailLoopback(env,event) {
  const to=probeAddress(env),data=event?.data
  const recipients=[data?.received_for,data?.to].flatMap(value=>Array.isArray(value)?value:typeof value==='string'?[value]:[])
  if(!to||!recipients.some(value=>address(value)===to))return false
  const subject=String(data.subject||''),id=subject.startsWith(subjectPrefix)?subject.slice(subjectPrefix.length):''
  if(!/^[a-f0-9-]{36}$/.test(id)||address(data.from)!==address(env.RESEND_FROM)||!/^[a-f0-9-]{36}$/i.test(data.email_id||''))return true
  const match=await select(env.DB,'SELECT id,received_at FROM admissions_mail_probes WHERE id=? AND requested_at>=?',id,new Date(Date.now()-86400000).toISOString()).first()
  if(!match||match.received_at)return true
  const check=await fetch('https://api.resend.com/emails/receiving/'+data.email_id,{headers:{'Authorization':'Bearer '+(env.RESEND_RECEIVING_API_KEY||env.RESEND_API_KEY)},signal:AbortSignal.timeout(7000),redirect:'error'})
  if(!check.ok)throw Error('No se pudo comprobar el correo de prueba')
  const mail=await check.json()
  if(mail.id!==data.email_id||mail.subject!==subject||!String(mail.text||'').includes(id))return true
  await select(env.DB,"UPDATE admissions_mail_probes SET inbound_id=?,received_at=?,state='verificada' WHERE id=? AND received_at IS NULL",data.email_id,new Date().toISOString(),id).run()
  return true
}
