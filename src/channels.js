import { all, channelPhone, clean, digest, e164, inHours, normalized, now, publicOrigin, requestRemote, select,
  ServiceError, templateLanguage, whatsappTemplate, whatsappWebhookReady } from './providers.js';

const encoder = new TextEncoder();
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const received = () => json({received:true});
const retellAck = () => new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
const scope = 'posgrados-ucg';
const whatsappTask = 'Responder por WhatsApp al aspirante';
const advisorTask = 'Llamar al aspirante que solicitó hablar con un asesor';
const knownId = value => typeof value==='string' && /^[\w.+=/-]{1,240}$/.test(value);
const list = value => Array.isArray(value)?value:[];

export const jobTable = channel => channel==='whatsapp'?'whatsapp_jobs':'jobs';
export const contactEvent = (db,id,lead,type,description,date,actor) =>
  select(db,'INSERT OR IGNORE INTO events(id,lead_id,type,description,created_at,actor) VALUES(?,?,?,?,?,?)',id,lead,type,description,date,actor);

export const admissionProof = "(j.kind<>'admission' OR EXISTS (SELECT 1 FROM admissions_cases c JOIN admissions_stage_evidence e ON e.id=c.admission_evidence_id WHERE c.lead_id=j.lead_id AND e.lead_id=j.lead_id AND e.stage='Admitido'))";
const currentJob = "j.id=? AND j.kind=? AND j.status='processing' AND l.paused=0 AND ((j.kind='application' AND l.stage='En postulación') OR (j.kind='admission' AND l.stage='Admitido') OR (j.kind IN ('welcome','guidance','callback') AND l.stage IN ('Nuevo','En orientación'))) AND "+admissionProof;
const activeWhatsapp = " AND c.state='granted' AND c.phone=l.phone AND j.phone=l.phone AND NOT EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.phone=l.phone)";
const singlePhone = ' AND NOT EXISTS(SELECT 1 FROM leads other WHERE other.phone=l.phone AND other.id<>l.id)';

async function recordDispatch(db,provider,job,lead,phone,account,sender,version) {
  const whatsapp = provider==='whatsapp';
  const joins = whatsapp?' JOIN whatsapp_consents c ON c.lead_id=l.id AND c.phone=j.phone':'';
  const permitted = whatsapp?activeWhatsapp:" AND j.channel='voice' AND l.consent_voice=1 AND NOT EXISTS(SELECT 1 FROM voice_suppressions s WHERE s.phone=?)";
  const criteria = currentJob+' AND l.phone=?'+permitted+singlePhone;
  const keys = [job.id,job.kind,lead.phone,...(whatsapp?[]:[phone])];
  const from = ' FROM '+jobTable(job.channel)+' j JOIN leads l ON l.id=j.lead_id'+joins;
  const statements = [
    select(db,'INSERT INTO channel_dispatches(provider,job_id,phone,account,sender,version) SELECT ?,j.id,?,?,?,?'+from+' WHERE '+criteria+' ON CONFLICT(provider,job_id) DO NOTHING',
      provider,phone,account,sender,version,...keys),
    select(db,'SELECT d.job_id'+from+' JOIN channel_dispatches d ON d.job_id=j.id AND d.provider=? WHERE '+criteria+' AND d.phone=? AND d.account=? AND d.sender=? AND d.version=? AND d.state_rank=0',
      provider,...keys,phone,account,sender,version)
  ];
  // The dispatch snapshot and final permission read share a transaction.
  const results = await db.batch(statements);
  return !!results[1].results?.length;
}

export async function submitWhatsapp(env,job,lead) {
  const phone = job.phone;
  const template = whatsappTemplate(env,job.kind);
  if(!template || !e164(phone) || !await recordDispatch(env.DB,'whatsapp',job,lead,phone,env.WHATSAPP_BUSINESS_ACCOUNT_ID,env.WHATSAPP_PHONE_NUMBER_ID,''))return null;
  const endpoint = 'https://graph.facebook.com/'+env.WHATSAPP_GRAPH_VERSION+'/'+env.WHATSAPP_PHONE_NUMBER_ID+'/messages';
  const body = {
    messaging_product:'whatsapp',recipient_type:'individual',to:phone.slice(1),type:'template',
    template:{name:template,language:{code:templateLanguage(env)}},
    biz_opaque_callback_data:scope+':'+job.id
  };
  const res = await requestRemote(endpoint,{method:'POST',headers:{Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body)},'WhatsApp');
  const id = (await res.json()).messages?.[0]?.id;
  if(!knownId(id))throw new ServiceError('WhatsApp no devolvió un identificador de mensaje.');
  return id;
}

export async function submitRetell(env,job,lead,program) {
  const phone = channelPhone(lead.phone);
  if(!phone)throw new ServiceError('Revisa el teléfono antes de llamar.',422,422);
  const version = String(env.RETELL_AGENT_VERSION||'latest_published');
  if(!await recordDispatch(env.DB,'retell',job,lead,phone,env.RETELL_AGENT_ID,env.RETELL_FROM,version))return null;
  const variables = {institucion:'Universidad Casa Grande'};
  if(program) {
    variables.programa=program.title;
    variables.modalidad=program.mode||'Confirmar con Admisiones';
    variables.duracion=program.duration||'Confirmar con Admisiones';
    variables.estado_convocatoria=program.admissionsStatus||'Confirmar con Admisiones';
  }
  const body = {
    from_number:env.RETELL_FROM,to_number:phone,override_agent_id:env.RETELL_AGENT_ID,
    override_agent_version:/^\d+$/.test(version)?Number(version):version,
    idempotency_key:scope+'-'+job.id,honor_internal_dnc:true,
    agent_override:{agent:{
      webhook_url:publicOrigin(env)+'/api/webhooks/retell',
      webhook_events:['call_started','call_ended','call_analyzed'],
      enable_dnc_detection:true, max_call_duration_ms:120000,
      data_storage_setting:'basic_attributes_only',opt_in_signed_url:true,
      contact_memory_config:{enable_update:false,enable_read:false}
    }},
    metadata:{ucg_source:scope,ucg_job_id:job.id},
    retell_llm_dynamic_variables:variables
  };
  const res = await requestRemote('https://api.retellai.com/v2/create-phone-call',{method:'POST',headers:{Authorization:'Bearer '+env.RETELL_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)},'Retell AI');
  const id = (await res.json()).call_id;
  if(!knownId(id))throw new ServiceError('Retell no devolvió un identificador de llamada.');
  return id;
}

async function bodyBytes(request,max=262144) {
  if(Number(request.headers.get('content-length'))>max)throw new ServiceError('El evento supera el límite permitido.',413);
  const reader=request.body?.getReader();
  if(!reader)throw new ServiceError('Falta el contenido del evento.',400);
  const chunks=[];
  let size=0;
  for(;;) {
    const {value,done}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>max) {
      await reader.cancel();
      throw new ServiceError('El evento supera el límite permitido.',413);
    }
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks) {
    bytes.set(chunk,offset);
    offset+=chunk.byteLength;
  }
  return bytes;
}

async function signed(bytes,secret,signature,suffix='') {
  if(!signature)return false;
  const extra=encoder.encode(suffix), message=new Uint8Array(bytes.byteLength+extra.byteLength);
  message.set(bytes);
  message.set(extra,bytes.byteLength);
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),byte=>parseInt(byte,16)),message);
}

function parseEvent(bytes) {
  try {
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(body && typeof body==='object' && !Array.isArray(body))return body;
  } catch { /* Respond with a controlled parse error below. */ }
  throw new ServiceError('Evento no válido.',400);
}

async function verifyWhatsapp(env,url) {
  if(!env.WHATSAPP_VERIFY_TOKEN)return json({error:'Verificación de WhatsApp pendiente de configuración.'},503);
  const query=url.searchParams;
  const challenge=query.get('hub.challenge'), token=query.get('hub.verify_token');
  if(query.get('hub.mode')!=='subscribe' || !/^\d{1,120}$/.test(challenge||'') || !token || token.length>512)
    return json({error:'Verificación de WhatsApp no válida.'},403);
  const [a,b]=await Promise.all([digest(token),digest(env.WHATSAPP_VERIFY_TOKEN)]);
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  if(diff)return json({error:'Verificación de WhatsApp no válida.'},403);
  return new Response(challenge,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}

async function boundJob(db,provider,remoteId,jobId,phone,account,sender) {
  const table=provider==='whatsapp'?'whatsapp_jobs':'jobs';
  const channel=provider==='retell'?" AND j.channel='voice'":'';
  return select(db,'SELECT j.id,j.lead_id,j.provider_id,d.version FROM channel_dispatches d JOIN '+table+" j ON j.id=d.job_id WHERE d.provider=? AND d.phone=? AND d.account=? AND d.sender=? AND (j.provider_id=? OR (j.provider_id IS NULL AND d.job_id=? AND j.status IN ('processing','uncertain')))"+channel,
    provider,phone,account,sender,remoteId,jobId||'').first();
}

async function confirmState(db,provider,job,id,state,rank,description,failed,date) {
  const table=provider==='whatsapp'?'whatsapp_jobs':'jobs';
  const actor=provider==='whatsapp'?'WhatsApp':'Retell AI';
  const stateChanged='EXISTS(SELECT 1 FROM channel_dispatches d WHERE d.provider=? AND d.job_id=? AND d.state_rank<?)';
  const eventId=provider+':'+await digest(id)+':'+state;
  await db.batch([
    select(db,'UPDATE '+table+' SET provider_id=?,status=?,last_error=?,updated_at=? WHERE id=? AND (provider_id IS NULL OR provider_id=?) AND '+stateChanged,
      id,failed?'failed':'sent',failed?description:null,date,job.id,id,provider,job.id,rank),
    select(db,"INSERT OR IGNORE INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,lead_id,?,?,?,? FROM "+table+' WHERE id=? AND provider_id=? AND '+stateChanged,
      eventId,'seguimiento',description,date,actor,job.id,id,provider,job.id,rank),
    select(db,'UPDATE channel_dispatches SET state_rank=? WHERE provider=? AND job_id=? AND state_rank<? AND EXISTS(SELECT 1 FROM '+table+' WHERE id=? AND provider_id=?)',
      rank,provider,job.id,rank,job.id,id)
  ]);
}

const whatsappStatuses = {
  sent:[1,'WhatsApp confirmó el envío del mensaje.'],
  failed:[2,'WhatsApp informó un fallo de entrega. Revisa el destinatario y el estado de la plantilla.'],
  delivered:[3,'WhatsApp confirmó la entrega del mensaje.'],
  read:[4,'WhatsApp confirmó la lectura del mensaje.']
};

async function whatsappStatus(db,entry,value,status) {
  if(!Object.hasOwn(whatsappStatuses,status?.status) || !knownId(status.id))return;
  const phone=providerPhone(status.recipient_id);
  if(!phone)return;
  const opaque=typeof status.biz_opaque_callback_data==='string' && status.biz_opaque_callback_data.startsWith(scope+':')?status.biz_opaque_callback_data.slice(scope.length+1):'';
  const job=await boundJob(db,'whatsapp',status.id,knownId(opaque)?opaque:'',phone,entry.id,value.metadata.phone_number_id);
  if(!job)return;
  const [rank,description]=whatsappStatuses[status.status];
  await confirmState(db,'whatsapp',job,status.id,status.status,rank,description,status.status==='failed',now());
}

function providerPhone(number) {
  if(typeof number!=='string')return '';
  const phone=number.startsWith('+')?number:'+'+number;
  return e164(phone)?phone:'';
}

export function explicitOptOut(value) {
  const phrase=normalized(clean(value,500)).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const command=phrase.replace(/^(?:(?:por favor|hola|gracias|pero|si|ya) )+/,'');
  return /^(?:stop|unsubscribe|baja|salir|darme de baja|darse de baja|cancelar (?:la )?(?:suscripcion|llamadas)|opt out)(?: por favor)?$/.test(command) ||
    /^(?:(?:me )?(?:quiero|deseo) (?:darme |dar |que me den )de baja|denme de baja|please stop calling me|take me off your list|do not call me)\b/.test(command) ||
    /^(?:no me (?:escriba[ns]?|contacte[ns]?|llame[ns]?|vuelva[ns]? a llamar)|deje[ns]? de (?:escribirme|contactarme|llamarme))\b/.test(command) ||
    /^no (?:quiero|deseo) (?:que me (?:llame[ns]?|contacte[ns]?|escriba[ns]?)|(?:recibir |que me envie[ns]? )?(?:mas |ningun(?:a|os|as)? )?(?:mensajes|contactos|llamadas|avisos|notificaciones|whatsapps?))\b/.test(command);
}

async function whatsappStop(db,phone,date) {
  await db.batch([
    select(db,"INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT lower(hex(randomblob(16))),lead_id,'preferencias','Se retiró el consentimiento para WhatsApp.',?,'Aspirante' FROM whatsapp_consents WHERE phone=? AND state='granted'",date,phone),
    select(db,"UPDATE tasks SET status='hecha',title=title||' (anulada por retiro de autorización)' WHERE title=? AND status='pendiente' AND lead_id IN (SELECT id FROM leads WHERE phone=?)",whatsappTask,phone),
    select(db,"UPDATE leads SET updated_at=?,revision=revision+1,next_action=CASE WHEN next_action=? THEN '' ELSE next_action END,due_at=CASE WHEN next_action=? THEN NULL ELSE due_at END WHERE phone=? AND (next_action=? OR id IN (SELECT lead_id FROM whatsapp_consents WHERE phone=? AND state='granted'))",date,whatsappTask,whatsappTask,phone,whatsappTask,phone),
    select(db,'INSERT OR IGNORE INTO whatsapp_suppressions(phone,created_at) VALUES(?,?)',phone,date)
  ]);
}

export async function stopVoice(db,phone,date,reason,leadId=null) {
  if(!e164(phone) && !leadId)return;
  const keys=[phone||null,leadId];
  const writes=[
    select(db,"INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT lower(hex(randomblob(16))),id,'preferencias','Se retiró el consentimiento para llamadas.',?,'Aspirante' FROM leads WHERE (phone=? OR id=?) AND consent_voice=1",date,...keys),
    select(db,"UPDATE tasks SET status='hecha',title=title||' (anulada por retiro de autorización)' WHERE title=? AND status='pendiente' AND lead_id IN (SELECT id FROM leads WHERE phone=? OR id=?)",advisorTask,...keys),
    select(db,"UPDATE leads SET consent_voice=0,updated_at=?,revision=revision+1,next_action=CASE WHEN next_action=? THEN '' ELSE next_action END,due_at=CASE WHEN next_action=? THEN NULL ELSE due_at END WHERE (phone=? OR id=?) AND (consent_voice=1 OR next_action=?)",date,advisorTask,advisorTask,...keys,advisorTask),
    select(db,"UPDATE jobs SET status='skipped',last_error=?,updated_at=? WHERE channel='voice' AND status='pending' AND lead_id IN (SELECT id FROM leads WHERE phone=? OR id=?)",reason,date,...keys)
  ];
  if(e164(phone))writes.unshift(select(db,'INSERT OR IGNORE INTO voice_suppressions(phone,created_at) VALUES(?,?)',phone,date));
  await db.batch(writes);
}

async function moveToHuman(db,leadId,phone,eventId,title,description,date,scopeCheck) {
  const due=inHours(4);
  const eligible=" EXISTS(SELECT 1 FROM leads l WHERE l.id=? AND l.phone=? AND l.stage NOT IN ('Cerrado','Matriculado')"+scopeCheck+')';
  const unseen=' AND NOT EXISTS(SELECT 1 FROM events WHERE id=?)';
  const gate=eligible+unseen;
  const keys=[leadId,phone,eventId];
  await db.batch([
    select(db,"INSERT INTO tasks(id,lead_id,title,status,due_at,created_at) SELECT ?,?,?,'pendiente',?,? WHERE"+gate+" AND NOT EXISTS(SELECT 1 FROM tasks WHERE lead_id=? AND title=? AND status='pendiente')",eventId,leadId,title,due,date,...keys,leadId,title),
    select(db,"UPDATE leads SET paused=1,next_action=?,due_at=COALESCE((SELECT MIN(due_at) FROM tasks WHERE lead_id=? AND title=? AND status='pendiente'),?),updated_at=?,revision=revision+1 WHERE id=? AND"+gate,title,leadId,title,due,date,leadId,...keys),
    select(db,"UPDATE jobs SET status='skipped',last_error='Admisiones debe responder al aspirante.',updated_at=? WHERE lead_id=? AND status='pending' AND"+gate,date,leadId,...keys),
    select(db,"UPDATE whatsapp_jobs SET status='skipped',last_error='Admisiones debe responder al aspirante.',updated_at=? WHERE lead_id=? AND status='pending' AND"+gate,date,leadId,...keys),
    select(db,"INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,?,'solicitud',?,?,'Aspirante' WHERE"+gate,eventId,leadId,description,date,...keys)
  ]);
}

async function whatsappIncoming(db,message) {
  const phone=providerPhone(message?.from);
  if(!phone || !knownId(message.id) || message.group_id || ['reaction','unsupported','system'].includes(message.type))return;
  const texts=[message.text?.body,message.button?.text,message.button?.payload,message.interactive?.button_reply?.title,message.interactive?.button_reply?.id];
  const date=now();
  if(texts.some(explicitOptOut))return whatsappStop(db,phone,date);
  const rows=await all(db,'SELECT id FROM leads WHERE phone=? LIMIT 2',phone);
  if(rows.length!==1)return;
  const id='whatsapp-inbound:'+await digest(message.id);
  // The staff member can consult the authenticated channel inbox without copying message content into the CRM.
  await moveToHuman(db,rows[0].id,phone,id,whatsappTask,'El aspirante escribió al canal de WhatsApp. Consulta la conversación y responde desde el buzón de Admisiones.',date,
    ' AND NOT EXISTS(SELECT 1 FROM leads other WHERE other.phone=l.phone AND other.id<>l.id) AND NOT EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.phone=l.phone)');
}

async function whatsappWebhook(request,env,url) {
  if(request.method==='GET')return verifyWhatsapp(env,url);
  if(request.method!=='POST')return json({error:'Utiliza GET o POST para este webhook.'},405);
  if(!env.DB || !whatsappWebhookReady(env))return json({error:'Webhook de WhatsApp pendiente de configuración.'},503);
  const signature=request.headers.get('X-Hub-Signature-256')?.match(/^sha256=([\da-f]{64})$/i);
  if(!signature)return json({error:'Firma de Meta no válida.'},403);
  const bytes=await bodyBytes(request,524288);
  if(!await signed(bytes,env.WHATSAPP_APP_SECRET,signature[1]))return json({error:'Firma de Meta no válida.'},403);
  const event=parseEvent(bytes);
  if(event.object!=='whatsapp_business_account')return received();
  for(const entry of list(event.entry)) {
    if(entry?.id!==env.WHATSAPP_BUSINESS_ACCOUNT_ID)continue;
    for(const change of list(entry.changes)) {
      const value=change?.value;
      if(change?.field!=='messages' || value?.messaging_product!=='whatsapp' || value?.metadata?.phone_number_id!==env.WHATSAPP_PHONE_NUMBER_ID)continue;
      for(const message of list(value.messages))await whatsappIncoming(env.DB,message);
      for(const status of list(value.statuses))await whatsappStatus(env.DB,entry,value,status);
    }
  }
  return received();
}

async function retellWebhook(request,env) {
  if(request.method!=='POST')return json({error:'Utiliza POST para este webhook.'},405);
  const secret=env.RETELL_WEBHOOK_KEY||env.RETELL_API_KEY;
  if(!env.DB || !secret)return json({error:'Webhook de Retell pendiente de configuración.'},503);
  const signature=request.headers.get('X-Retell-Signature')?.match(/^v=(\d{13}),d=([\da-f]{64})$/i);
  if(!signature || Math.abs(Date.now()-Number(signature[1]))>300000)return json({error:'Firma de Retell no válida o caducada.'},403);
  const bytes=await bodyBytes(request,524288);
  if(!await signed(bytes,secret,signature[2],signature[1]))return json({error:'Firma de Retell no válida.'},403);
  const body=parseEvent(bytes), call=body.call;
  if(!['call_started','call_ended','call_analyzed'].includes(body.event) || !knownId(call?.call_id) || call.direction!=='outbound' || call.call_type!=='phone_call')return retellAck();
  const phone=providerPhone(call.to_number), sender=providerPhone(call.from_number);
  if(!phone || !sender || !knownId(call.agent_id))return retellAck();
  const jobId=call.metadata?.ucg_source===scope && knownId(call.metadata?.ucg_job_id)?call.metadata.ucg_job_id:'';
  const job=await boundJob(env.DB,'retell',call.call_id,jobId,phone,call.agent_id,sender);
  if(!job || (/^\d+$/.test(job.version) && Number(job.version)!==call.agent_version))return retellAck();

  const date=now(), id=await digest(call.call_id);
  const analysis=call.call_analysis?.custom_analysis_data;
  const declined=call.disconnection_reason==='user_requested_dnc' || (body.event==='call_analyzed' && analysis?.opt_out===true) ||
    list(call.transcript_object).some(turn=>turn?.role==='user' && explicitOptOut(turn.content));
  if(declined)await stopVoice(env.DB,phone,date,'Baja solicitada durante una llamada.');
  if(body.event==='call_started') {
    await confirmState(env.DB,'retell',job,call.call_id,'started',1,'Retell confirmó que la llamada se conectó.',false,date);
  } else if(['error','not_connected','ended'].includes(call.call_status)) {
    const failed=call.call_status!=='ended';
    const description=call.call_status==='not_connected'?'Retell confirmó que la llamada no se conectó.':
      failed?'Retell informó un error en la llamada.':'Retell confirmó el fin de la llamada.';
    await confirmState(env.DB,'retell',job,call.call_id,call.call_status,failed?2:3,description,failed,date);
  }
  const wantsAdvisor=call.disconnection_reason==='user_requested_callback' || (body.event==='call_analyzed' && analysis?.human_callback===true);
  if(!declined && wantsAdvisor && call.call_status==='ended' && call.disconnection_reason!=='voicemail_reached' && call.call_analysis?.in_voicemail!==true)
    await moveToHuman(env.DB,job.lead_id,phone,'retell-callback:'+id,advisorTask,'El aspirante solicitó conversar con un asesor durante la llamada de orientación.',date,
      ' AND l.consent_voice=1 AND NOT EXISTS(SELECT 1 FROM voice_suppressions s WHERE s.phone=l.phone)');
  return retellAck();
}

export function channelWebhook(request,env,url) {
  if(url.pathname==='/api/webhooks/whatsapp')return whatsappWebhook(request,env,url);
  if(url.pathname==='/api/webhooks/retell')return retellWebhook(request,env);
  return null;
}
