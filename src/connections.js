import {latestMailProbe} from './mail-loopback.js'
import {publicOrigin,enabled,mailReady,outreachStartAt,select} from './providers.js'

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const date=new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',dateStyle:'short',timeStyle:'short'})
const shownDate=value=>esc(date.format(new Date(value)))

function mailProbeStatus(probe) {
  if(!probe)return '<p class="last">Aún pendiente de la primera comprobación técnica de correo.</p>'
  const intro='<p class="last"><b>Última comprobación técnica</b><br>'+shownDate(probe.requestedAt)+' · '
  if(probe.read)return intro+'Lectura verificada el '+shownDate(probe.receivedAt)+'.</p>'
  if(probe.issue){
    const issue=probe.issue,phase=issue.phase==='envio'?'Envío':'Lectura'
    return intro+phase+' por conciliar. '+esc(issue.reason)+'<br><code>'+esc(issue.httpStatus?'HTTP '+issue.httpStatus+' · '+issue.code:issue.code)+'</code></p>'
  }
  return intro+(probe.accepted?'Resend aceptó la solicitud. La lectura sigue pendiente.':'Confirmación pendiente. Revisa el registro de Resend.')+'</p>'
}

async function earlierJobs(db,start) {
  if(!start)return 0
  const row=await select(db,`SELECT
    (SELECT count(*) FROM jobs WHERE status='pending' AND created_at<?) +
    (SELECT count(*) FROM whatsapp_jobs WHERE status='pending' AND created_at<?) +
    (SELECT count(*) FROM conversation_nurture_jobs j JOIN conversation_nurture_signals s ON s.id=j.signal_id
      WHERE j.status='pending' AND s.recorded_at<?) AS total`,start,start,start).first()
  return Number(row?.total||0)
}

export async function connectionPage(env) {
  const origin=publicOrigin(env)
  const startsAt=outreachStartAt(env)
  const channels=[
    {key:'resend',name:'Resend',kind:'Correo',path:'/api/webhooks/resend',fields:['RESEND_ADMISSIONS_INBOUND_ADDRESS','RESEND_WEBHOOK_SECRET'],credential:env.RESEND_RECEIVING_API_KEY||env.RESEND_API_KEY,need:'RESEND_RECEIVING_API_KEY o RESEND_API_KEY',note:'Configura la recepción de la dirección de admisiones y las notificaciones de entrega. Las respuestas con referencia se asocian al expediente del remitente.'},
    {key:'retell',name:'Retell',kind:'Llamada conversacional',path:'/api/webhooks/retell',fields:['RETELL_INBOUND_NUMBER','RETELL_INBOUND_AGENT_ID'],credential:env.RETELL_WEBHOOK_KEY||env.RETELL_API_KEY,need:'RETELL_WEBHOOK_KEY o RETELL_API_KEY',note:'Vincula el agente en español y el número receptor. El evento de análisis de la llamada aporta las palabras del aspirante.'},
    {key:'twilio',name:'Twilio',kind:'Recepción telefónica',path:'/api/webhooks/twilio/inbound',fields:['TWILIO_INBOUND_NUMBER','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN'],note:'Usa POST para la llamada entrante. El menú solicita la consulta por voz y remite la respuesta reconocida a la bandeja.'}
  ]
  const [latest,last,probe,earlier]=await Promise.all([
    env.DB.prepare('SELECT provider,max(created_at) AS last_at,count(*) AS volume FROM admissions_conversations GROUP BY provider').all(),
    env.DB.prepare("SELECT state,finished_at FROM background_runs WHERE kind IN ('nuevos_conversaciones','conversaciones') ORDER BY started_at DESC LIMIT 1").first(),
    latestMailProbe(env.DB),earlierJobs(env.DB,startsAt)
  ])
  const cards=channels.map(c=>{
    const missing=c.fields.filter(k=>!env[k]);if(c.need&&!c.credential)missing.push(c.need)
    const seen=latest.results?.find(x=>x.provider===c.key)
    return '<article><span class="label">'+esc(c.kind)+'</span><h2>'+esc(c.name)+'</h2><strong>'+ (missing.length?'Falta configurar el canal':'Configuración registrada')+'</strong><p>'+esc(c.note)+'</p><p><b>URL de recepción</b><br><code>'+esc(origin+c.path)+'</code></p>'+(missing.length?'<p class="keys"><b>Configuración pendiente</b><br>'+missing.map(esc).join('<br>')+'</p>':'')+'<p class="last">'+(seen?'Última conversación el '+shownDate(seen.last_at)+' · '+Number(seen.volume)+' registradas.':'Aún no se ha registrado una conversación por este canal.')+'</p>'+(c.key==='resend'?mailProbeStatus(probe):'')+'</article>'
  }).join('')
  const status=startsAt===null?'El envío está pausado hasta corregir la fecha de inicio.':enabled(env.OUTREACH_ENABLED)&&mailReady(env)?'El envío por correo está habilitado.':'El envío por correo está pendiente de activación.'
  const schedule=startsAt?'<p>Fecha de inicio del envío automático <time datetime="'+esc(startsAt)+'">'+shownDate(startsAt)+'</time>. '+earlier+' '+(earlier===1?'seguimiento anterior queda':'seguimientos anteriores quedan')+' para revisión del equipo.</p>':''
  return '<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Conexiones de admisiones</title><link rel="stylesheet" href="/conversion.css"><link rel="stylesheet" href="/conexiones.css"></head><body><header><a href="/equipo#agentes">Volver a admisiones</a><img src="/media/ucg-logo.png" alt="Universidad Casa Grande"></header><main><div class="over">Configuración del equipo</div><h1>Correo y llamadas<span>.</span></h1><p>Comprueba qué canales están configurados y cuándo llegó la última conversación. Las fechas se muestran en hora de Guayaquil.</p><div class="channels">'+cards+'</div><section><h2>Seguimiento en español</h2><p>'+status+' La confirmación de datos, las respuestas a consultas y el acompañamiento se registran en cada expediente. Las dudas que necesitan intervención aparecen como tareas.</p>'+schedule+'<p>Último ciclo de conversaciones: '+(last?.finished_at?shownDate(last.finished_at)+' · '+esc(last.state):'Pendiente de la primera ejecución.')+'</p><a href="/equipo#conversaciones">Abrir bandeja de conversaciones</a></section></main></body></html>'
}
