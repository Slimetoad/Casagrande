import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {serve} from '../src/portal.js';
import {programs} from '../src/catalog.js';
import {recruitmentReplyTo} from '../src/replies.js';
const origin='https://prueba.example.org';
function fixture(){
 const raw=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>/^\d+.*\.sql$/.test(n)).sort())raw.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 class Q{constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Q(this.sql,args)}first(){return raw.prepare(this.sql).get(...this.args)||null}all(){return {results:raw.prepare(this.sql).all(...this.args)}}run(){const q=raw.prepare(this.sql);return q.columns().length?this.all():{meta:{changes:q.run(...this.args).changes}}}}
 const DB={prepare:s=>new Q(s),batch(qs){raw.exec('BEGIN');try{const out=qs.map(q=>q.run());raw.exec('COMMIT');return out}catch(e){raw.exec('ROLLBACK');throw e}}};
 const env={DB,PUBLIC_BASE_URL:origin,ADMISSIONS_STAFF_EMAILS:'staff@example.org',RESEND_REPLY_DOMAIN:'reply.example.org',RESEND_API_KEY:'simulada',RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.from('prueba-local').toString('base64')};
 return {raw,env};
}
const staff={'oai-authenticated-user-id':'proxy-simulado','oai-authenticated-user-email':'staff@example.org'};
async function request(env,path,{method='GET',body,headers={}}={}){
 const req=new Request(origin+path,{method,headers,body});return serve(req,env,()=>'<html>Manual</html>');
}
const json=(x)=>({method:'POST',body:JSON.stringify(x),headers:{'Content-Type':'application/json'}});
function signedResend(data,id=crypto.randomUUID(),valid=true){
 const body=JSON.stringify(data),ts=String(Math.floor(Date.now()/1000));
 const sig=createHmac('sha256','prueba-local').update(id+'.'+ts+'.'+body+(valid?'':' ')).digest('base64');
 return {method:'POST',body,headers:{'content-type':'application/json','svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+sig}};
}
async function lead(env,email='persona@example.org'){
 const form={name:'Persona ficticia',email,phone:'0991234567',program:programs[0].slug,source:'orientacion',consentEmail:true,consentVoice:false};
 assert.equal((await request(env,'/api/leads',json(form))).status,201);
 return env.DB.prepare('SELECT * FROM leads WHERE email=?').bind(email).first();
}
test('correo firmado: destinatario, remitente, firma y repetición protegen expediente y cola',async t=>{
 const {env,raw}=fixture(),person=await lead(env),alias=await recruitmentReplyTo(env,person),id=crypto.randomUUID();
 const event={type:'email.received',data:{email_id:id,from:person.email,to:[alias],subject:'Horarios de la maestría'}};
 let requests=0;
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'https://api.resend.com/emails/receiving/'+id+'?html_format=cid');requests++;return Response.json({id,text:'Quiero estudiar por las tardes.\n\nEl viernes escribió:\n> texto anterior privado',subject:event.data.subject})});
 assert.equal((await request(env,'/api/webhooks/resend',signedResend(event,'firma-invalida',false))).status,403);
 for(const data of [{...event.data,to:[]},{...event.data,to:['otra@reply.example.org']},{...event.data,from:'otra@example.org'}])
  assert.equal((await request(env,'/api/webhooks/resend',signedResend({...event,data}))).status,200);
 assert.equal(requests,0);assert.equal(raw.prepare('SELECT count(*) n FROM admissions_replies').get().n,0);
 const signed=signedResend(event,'entrega-duplicada');
 for(let i=0;i<2;i++)assert.equal((await request(env,'/api/webhooks/resend',signed)).status,200);
 assert.equal(requests,1);assert.equal(raw.prepare('SELECT count(*) n FROM admissions_replies').get().n,1);
 assert.ok(raw.prepare("SELECT count(*) n FROM tasks WHERE lead_id=? AND status='pendiente'").get(person.id).n>=1);
 assert.ok(!raw.prepare('SELECT excerpt FROM admissions_replies').get().excerpt.includes('texto anterior privado'));
 assert.equal((await request(env,'/api/staff/workspace/'+person.id)).status,403);
 assert.equal((await request(env,'/api/staff/workspace/'+person.id,{headers:staff})).status,200);
});
test('correo de captación: dirección exacta, extracción en CRM y seguimiento sin permisos inventados',async t=>{
 const {env,raw}=fixture();env.RESEND_ADMISSIONS_INBOUND_ADDRESS='admision@reply.example.org';
 const id=crypto.randomUUID(),subject='Consulta de maestría',message=`Me interesa ${programs[0].title}. ¿Me pueden llamar? Tengo dudas por el horario. Mi correo es secreto@example.org.`;
 let hits=0;
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'https://api.resend.com/emails/receiving/'+id+'?html_format=cid');hits++;return Response.json({id,text:message,subject,from:'nuevo@example.org',to:['admision@reply.example.org'],authentication:{dmarc:'pass'}})});
 const event={type:'email.received',data:{email_id:id,from:'nuevo@example.org',to:['admision@reply.example.org'],subject}};
 const payload=signedResend(event,'captacion-directa');
 for(let i=0;i<2;i++)assert.equal((await request(env,'/api/webhooks/resend',payload)).status,200);
 assert.equal(raw.prepare('SELECT count(*) n FROM leads WHERE email=?').get('nuevo@example.org').n,1);
 const p=raw.prepare('SELECT * FROM leads WHERE email=?').get('nuevo@example.org');
 assert.equal(p.consent_email,0);assert.equal(p.consent_voice,0);
 assert.equal(raw.prepare('SELECT count(*) n FROM jobs WHERE lead_id=?').get(p.id).n,0);
 assert.ok(raw.prepare("SELECT count(*) n FROM tasks WHERE lead_id=? AND status='pendiente'").get(p.id).n>=1);
 assert.equal((await request(env,'/api/staff/conversations?status=all')).status,403);
 const res=await request(env,'/api/staff/conversations?status=all',{headers:staff});assert.equal(res.status,200);
 const body=await res.json(),row=body.conversations.find(c=>c.leadId===p.id);
 assert.ok(row);assert.equal(row.provider,'resend');assert.equal(row.kind,'email');
 assert.equal(row.extraction.program,programs[0].slug);assert.equal(row.extraction.intent,'solicitar_asesor');
 assert.doesNotMatch(JSON.stringify({excerpt:row.excerpt,extraction:row.extraction}),/secreto@example\.org/);
 assert.doesNotMatch(JSON.stringify(raw.prepare('SELECT excerpt FROM admissions_replies WHERE lead_id=?').all(p.id)),/secreto@example\.org/);
 assert.doesNotMatch(JSON.stringify(raw.prepare('SELECT description FROM events WHERE lead_id=?').all(p.id)),/secreto@example\.org/);
 assert.equal(body.conversations.filter(c=>c.leadId===p.id).length,1);
 assert.ok(hits>=1 && hits<=2);
});
test('las demostraciones públicas muestran modo ficticio sin escribir datos reales',async()=>{
 const {env,raw}=fixture();await lead(env);
 const before=raw.prepare('SELECT total_changes() n').get().n;
 for(const path of ['/crm','/motor-de-contenidos','/equipo?demo=1']){
  const response=await request(env,path);assert.equal(response.status,200,path);
  const html=await response.text();if(path==='/motor-de-contenidos')assert.match(html,/id="editorial-demo-start"/);else assert.match(html,/data-initial-mode="demo"/);assert.match(html,/\/crm-client\.js/);
  assert.doesNotMatch(html,/persona@example\.org/);
 }
 assert.equal(raw.prepare('SELECT total_changes() n').get().n,before);
 assert.equal((await request(env,'/api/staff/conversations?status=all')).status,403);
});
function signedRetell(call,event='call_analyzed',valid=true){
 const body=JSON.stringify({event,call}),ts=String(Date.now());
 const digest=createHmac('sha256','retell-local').update(body+ts+(valid?'':'x')).digest('hex');
 return {method:'POST',body,headers:{'content-type':'application/json','X-Retell-Signature':`v=${ts},d=${digest}`}};
}
test('llamada entrante firmada: solo el aspirante, reordenación, duplicados y sin permisos',async()=>{
 const {env,raw}=fixture();Object.assign(env,{RETELL_WEBHOOK_KEY:'retell-local',RETELL_INBOUND_NUMBER:'+12025550100',RETELL_INBOUND_AGENT_ID:'agente_local',RETELL_INBOUND_AGENT_VERSION:'4'});
 const call={call_id:'call_prueba_1',call_type:'phone_call',direction:'inbound',from_number:'+593991234567',to_number:env.RETELL_INBOUND_NUMBER,agent_id:env.RETELL_INBOUND_AGENT_ID,agent_version:4,call_status:'ended',transcript_object:[{role:'agent',content:'¿Quieres matricularte hoy? Mi clave privada es 12345678.'},{role:'user',content:'Me pueden llamar, tengo dudas sobre los requisitos.'}],call_analysis:{in_voicemail:false}};
 assert.equal((await request(env,'/api/webhooks/retell',signedRetell(call,'call_analyzed',false))).status,403);
 assert.ok((await request(env,'/api/webhooks/retell',signedRetell({...call,agent_id:'otro'}))).ok);
 assert.equal(raw.prepare('SELECT count(*) n FROM admissions_conversations').get().n,0);
 assert.ok((await request(env,'/api/webhooks/retell',signedRetell({...call,call_status:'ongoing'},'call_started'))).ok);
 for(let i=0;i<2;i++)assert.ok((await request(env,'/api/webhooks/retell',signedRetell(call))).ok);
 const list=await (await request(env,'/api/staff/conversations?status=all',{headers:staff})).json();
 assert.equal(list.conversations.length,1);const row=list.conversations[0];
 assert.equal(row.provider,'retell');assert.equal(row.kind,'call');assert.equal(row.extraction.intent,'solicitar_asesor');
 assert.doesNotMatch(JSON.stringify(row.extraction),/matricularte|12345678/);
 const p=raw.prepare('SELECT * FROM leads WHERE id=?').get(row.leadId);assert.ok(p);assert.equal(p.consent_email,0);assert.equal(p.consent_voice,0);
 assert.equal(raw.prepare('SELECT count(*) n FROM jobs WHERE lead_id=?').get(p.id).n,0);
});
test('llamada sin teléfono: queda para revisión sin crear identidad ni seguimiento',async()=>{
 const {env,raw}=fixture();Object.assign(env,{RETELL_WEBHOOK_KEY:'retell-local',RETELL_INBOUND_NUMBER:'+12025550100',RETELL_INBOUND_AGENT_ID:'agente_local'});
 const call={call_id:'sin_numero',call_type:'phone_call',direction:'inbound',to_number:env.RETELL_INBOUND_NUMBER,agent_id:env.RETELL_INBOUND_AGENT_ID,call_status:'ended',transcript_object:[{role:'user',content:'Quiero saber los requisitos de una maestría.'}],call_analysis:{in_voicemail:false}};
 assert.ok((await request(env,'/api/webhooks/retell',signedRetell(call))).ok);
 const data=await (await request(env,'/api/staff/conversations?status=all',{headers:staff})).json();
 assert.equal(data.conversations.length,1);assert.equal(data.conversations[0].leadId,null);assert.equal(data.conversations[0].reviewStatus,'unassigned');
 assert.equal(raw.prepare('SELECT count(*) n FROM leads').get().n,0);
 assert.equal(raw.prepare('SELECT count(*) n FROM conversation_nurture_jobs').get().n,0);
});
test('simulador de conversación es útil y no escribe en D1 ni envía tráfico externo',async t=>{
 const {env,raw}=fixture();Object.assign(env,{ANTHROPIC_API_KEY:'ficticia',ANTHROPIC_MODEL:'claude-haiku-5-5'});await lead(env);const before=raw.prepare('SELECT total_changes() n').get().n;
 t.mock.method(globalThis,'fetch',()=>assert.fail('No debe contactar proveedores'));
 for(const channel of ['email','call']){
  const response=await request(env,'/api/demo/conversacion',json({channel,text:`Me interesa ${programs[0].title}. ¿Cuánto cuesta?`}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.facts.program,programs[0].slug);assert.ok(data.plan.decision);
 }
 assert.equal(raw.prepare('SELECT total_changes() n').get().n,before);
});
for(const revoke of [false,true])test(`respuesta directa simulada: ${revoke?'baja antes del despacho cancela':'envío único pese a reintentos'}`,async t=>{
 const {env,raw}=fixture();Object.assign(env,{OUTREACH_ENABLED:'true',RESEND_FROM:'admisiones@example.org',RESEND_ADMISSIONS_INBOUND_ADDRESS:'admision@reply.example.org'});
 const firstId=crypto.randomUUID(),stopId=crypto.randomUUID(),email='nueva@example.org',inbox=env.RESEND_ADMISSIONS_INBOUND_ADDRESS;
 const bodies=new Map([[firstId,`¿Cuánto cuesta ${programs[0].title}?`],[stopId,'No quiero recibir más correos.']]);let sent=0;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  if(String(url).includes('/emails/receiving/')){const id=new URL(url).pathname.split('/').at(-1);return Response.json({id,text:bodies.get(id),subject:'Consulta de maestría',from:email,to:[inbox],authentication:{dmarc:'pass'}})}
  assert.equal(url,'https://api.resend.com/emails');sent++;assert.equal(JSON.parse(opts.body).to[0],email);return Response.json({id:'simulado-aceptado'});
 });
 const evt=id=>({type:'email.received',data:{email_id:id,from:email,to:[inbox],subject:'Consulta de maestría'}});
 assert.equal((await request(env,'/api/webhooks/resend',signedResend(evt(firstId)))).status,200);
 assert.equal(raw.prepare("SELECT count(*) n FROM conversation_nurture_jobs WHERE status='pending'").get().n,1);
 if(revoke)assert.equal((await request(env,'/api/webhooks/resend',signedResend(evt(stopId)))).status,200);
 const {runNurtureJobs}=await import('../src/conversation-nurture.js');
 await Promise.all([runNurtureJobs(env),runNurtureJobs(env)]);await runNurtureJobs(env);
 assert.equal(sent,revoke?0:1);
 const row=raw.prepare('SELECT status FROM conversation_nurture_jobs').get();assert.equal(row.status,revoke?'skipped':'accepted');
 const p=raw.prepare('SELECT consent_email FROM leads WHERE email=?').get(email);assert.equal(p.consent_email,0);
});
test('correo sin autenticación verificada o destinatario directo no crea prospectos',async t=>{
 const {env,raw}=fixture();env.RESEND_ADMISSIONS_INBOUND_ADDRESS='admision@reply.example.org';const email='riesgo@example.org',inbox=env.RESEND_ADMISSIONS_INBOUND_ADDRESS;
 const first=crypto.randomUUID(),second=crypto.randomUUID();let fetches=0;
 t.mock.method(globalThis,'fetch',async url=>{fetches++;const id=new URL(url).pathname.split('/').at(-1);return Response.json({id,from:email,to:[inbox],authentication:{dmarc:'fail'},subject:'Consulta posgrado',text:'Quiero hablar sobre una maestría.'})});
 const data={from:email,subject:'Consulta posgrado'};
 assert.equal((await request(env,'/api/webhooks/resend',signedResend({type:'email.received',data:{...data,email_id:first,to:['otra@example.org'],received_for:[inbox]}}))).status,200);
 assert.equal(fetches,0);
 assert.equal((await request(env,'/api/webhooks/resend',signedResend({type:'email.received',data:{...data,email_id:second,to:[inbox]}}))).status,200);
 assert.equal(fetches,1);assert.equal(raw.prepare('SELECT count(*) n FROM leads').get().n,0);
 assert.equal(raw.prepare('SELECT count(*) n FROM conversation_nurture_jobs').get().n,0);
 const dataOut=await (await request(env,'/api/staff/conversations?status=all',{headers:staff})).json();
 assert.equal(dataOut.conversations.length,1);assert.equal(dataOut.conversations[0].reviewStatus,'unassigned');
 assert.doesNotMatch(JSON.stringify(dataOut.conversations[0]),/riesgo@example\.org/);
});
test('correo fuera de orden conserva la consulta más reciente y no duplica seguimiento',async t=>{
 const {env,raw}=fixture(),p=await lead(env);Object.assign(env,{OUTREACH_ENABLED:'true',RESEND_FROM:'admisiones@example.org',RESEND_ADMISSIONS_INBOUND_ADDRESS:'admision@reply.example.org'});
 const ids=[crypto.randomUUID(),crypto.randomUUID()],inbox=env.RESEND_ADMISSIONS_INBOUND_ADDRESS;
 const payloads=new Map([[ids[0],`¿Cuánto cuesta ${programs[0].title}?`],[ids[1],`¿Qué requisitos tiene ${programs[0].title}?`]]);
 t.mock.method(globalThis,'fetch',async url=>{const id=new URL(url).pathname.split('/').at(-1);return Response.json({id,text:payloads.get(id),subject:'Consulta maestría',from:p.email,to:[inbox],authentication:{dmarc:'pass'}})});
 const evt=(id,age)=>({type:'email.received',created_at:new Date(Date.now()-age).toISOString(),data:{email_id:id,from:p.email,to:[inbox],subject:'Consulta maestría'}});
 assert.equal((await request(env,'/api/webhooks/resend',signedResend(evt(ids[0],60000)))).status,200);
 assert.equal((await request(env,'/api/webhooks/resend',signedResend(evt(ids[1],120000)))).status,200);
 const signals=raw.prepare('SELECT intent,decision FROM conversation_nurture_signals ORDER BY recorded_at,rowid').all();
 assert.equal(signals.length,2);assert.equal(signals[0].intent,'inversion');assert.equal(signals[1].decision,'superada');
 assert.equal(raw.prepare("SELECT count(*) n FROM conversation_nurture_jobs WHERE status='pending'").get().n,1);
});
test('Twilio entrante valida firma y correlaciona discurso repetido una sola vez',async()=>{
 const {env,raw}=fixture();Object.assign(env,{TWILIO_ACCOUNT_SID:'ACprueba',TWILIO_AUTH_TOKEN:'firma-local',TWILIO_INBOUND_NUMBER:'+12025550100'});
 const path='/api/webhooks/twilio/inbound/speech';
 const fields={AccountSid:'ACprueba',CallSid:'CA'+'1'.repeat(32),To:env.TWILIO_INBOUND_NUMBER,From:'+593991234567',Direction:'inbound',SpeechResult:'Necesito hablar con una asesora sobre una maestría.'};
 function send(valid=true){const sig=createHmac('sha1',env.TWILIO_AUTH_TOKEN).update(origin+path+Object.keys(fields).sort().map(k=>k+fields[k]).join('')+(valid?'':'x')).digest('base64');return request(env,path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':sig},body:new URLSearchParams(fields)})}
 assert.equal((await send(false)).status,403);assert.equal(raw.prepare('SELECT count(*) n FROM admissions_conversations').get().n,0);
 for(let i=0;i<2;i++)assert.ok((await send()).ok);
 const list=await (await request(env,'/api/staff/conversations?status=all',{headers:staff})).json();assert.equal(list.conversations.length,1);
 const row=list.conversations[0];assert.equal(row.provider,'twilio');assert.equal(row.extraction.intent,'solicitar_asesor');
 const p=raw.prepare('SELECT consent_email,consent_voice FROM leads WHERE id=?').get(row.leadId);assert.deepEqual({...p},{consent_email:0,consent_voice:0});
 assert.equal(raw.prepare('SELECT count(*) n FROM jobs').get().n,0);
});
test('Haiku recibe solo categorías permitidas y el reintento no repite la consulta',async t=>{
 const {env,raw}=fixture();Object.assign(env,{ANTHROPIC_API_KEY:'clave-ficticia',ANTHROPIC_MODEL:'claude-haiku-5-5'});let hits=0;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{hits++;assert.equal(url,'https://api.anthropic.com/v1/messages');const payload=JSON.parse(opts.body);
  assert.equal(payload.model,'claude-haiku-5-5');const input=JSON.stringify(payload.messages);
  for(const privateValue of ['Nombre Privado','privado@example.org','0991234567','secreto confidencial'])assert.ok(!input.includes(privateValue),privateValue);
  assert.deepEqual(Object.keys(JSON.parse(payload.messages[0].content)).sort(),['intencion','opciones','programa','revision']);
  return Response.json({content:[{type:'text',text:'{"opcion":"ficha"}'}]});});
 const {ingestConversation}=await import('../src/conversation-intake.js');
 const input={provider:'resend',eventId:'reason-001',email:'privado@example.org',name:'Nombre Privado',direction:'inbound',kind:'email',allowCreate:true,text:`Quiero información sobre ${programs[0].title}. Teléfono 0991234567. secreto confidencial.`};
 const [a,b]=await Promise.all([ingestConversation(env,input),ingestConversation(env,input)]);
 await ingestConversation(env,input);assert.equal(hits,1);assert.equal(a.id,b.id);
 const row=raw.prepare('SELECT extraction FROM admissions_conversations WHERE id=?').get(a.id),facts=JSON.parse(row.extraction);
 assert.deepEqual(facts.modelAnalysis,{status:'completed',provider:'anthropic',model:'claude-haiku-5-5',reason:'La señal identifica un programa; contrastar su ficha oficial.'});
 assert.equal(facts.program,programs[0].slug);assert.equal(raw.prepare('SELECT consent_email FROM leads').get().consent_email,0);
});
test('Haiku falla de forma segura y no procesa bajas ni modelos distintos',async t=>{
 const {reasonConversation}=await import('../src/conversation-model.js');let hits=0;
 t.mock.method(globalThis,'fetch',async()=>{hits++;return Response.json({content:[{type:'text',text:'{"opcion":"autorizar_envio"}'}]})});
 const env={ANTHROPIC_API_KEY:'ficticia',ANTHROPIC_MODEL:'claude-haiku-5-5'};
 assert.equal(await reasonConversation(env,{intent:'baja'}),null);
 assert.equal(await reasonConversation({...env,ANTHROPIC_MODEL:'otro'},{intent:'programa'}),null);assert.equal(hits,0);
 assert.equal(await reasonConversation(env,{intent:'programa',needsReview:true}),null);assert.equal(hits,1);
});
test('un fallo del modelo conserva reglas locales y no se repite en el mismo evento',async t=>{
 const {env,raw}=fixture();Object.assign(env,{ANTHROPIC_API_KEY:'clave-ficticia',ANTHROPIC_MODEL:'claude-haiku-5-5'});let hits=0;
 t.mock.method(globalThis,'fetch',async()=>{hits++;throw new Error('proveedor no disponible')});
 const {ingestConversation}=await import('../src/conversation-intake.js');
 const input={provider:'resend',eventId:'fallo-modelo',email:'fallo@example.org',direction:'inbound',kind:'email',allowCreate:true,text:`¿Cuánto cuesta ${programs[0].title}?`};
 const first=await ingestConversation(env,input);await ingestConversation(env,input);assert.equal(hits,1);
 const facts=JSON.parse(raw.prepare('SELECT extraction FROM admissions_conversations WHERE id=?').get(first.id).extraction);
 assert.equal(facts.intent,'inversion');assert.equal(facts.modelAnalysis.status,'unavailable');
 assert.equal(raw.prepare('SELECT consent_email FROM leads').get().consent_email,0);
});
