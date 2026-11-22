import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {serve} from '../src/portal.js';

const origin='https://prueba.example.org';
const mailbox='admisiones@recibir.example.org';
const receiver='+59343726250';
const caller='+593991234567';
const signedEmailPath='/api/webhooks/resend';
const retellPath='/api/webhooks/retell';
const twilioPath='/api/webhooks/twilio/inbound';

function fixture(){
  const raw=new DatabaseSync(':memory:');
  for(const name of ['schema.sql','growth.sql','operations-v2.sql','channels.sql','conversation-v3.sql'])
    raw.exec(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
  class Statement {
    constructor(sql,values=[]){this.sql=sql;this.values=values;}
    bind(...values){return new Statement(this.sql,values);}
    first(){return raw.prepare(this.sql).get(...this.values)||null;}
    all(){return {results:raw.prepare(this.sql).all(...this.values)};}
    run(){const query=raw.prepare(this.sql);return query.columns().length?this.all():{meta:{changes:query.run(...this.values).changes}};}
  }
  const DB={
    prepare:sql=>new Statement(sql),
    batch(statements){
      raw.exec('BEGIN');
      try{const results=statements.map(statement=>statement.run());raw.exec('COMMIT');return results;}
      catch(error){raw.exec('ROLLBACK');throw error;}
    }
  };
  const env={
    DB,PUBLIC_BASE_URL:origin,RESEND_REPLY_DOMAIN:'recibir.example.org',
    RESEND_ADMISSIONS_INBOUND_ADDRESS:mailbox,RESEND_RECEIVING_API_KEY:'resend-read',
    RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.from('resend-signing').toString('base64'),
    RETELL_WEBHOOK_KEY:'retell-signing',RETELL_INBOUND_NUMBER:receiver,RETELL_INBOUND_AGENT_ID:'agente_local',
    RETELL_INBOUND_AGENT_VERSION:'4',TWILIO_AUTH_TOKEN:'twilio-signing',TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_INBOUND_NUMBER:receiver
  };
  return {raw,env};
}
function send(env,path,body,headers={}){
  return serve(new Request(origin+path,{method:'POST',body,headers}),env,()=>'<html>Manual</html>');
}
function resend(env,data,valid=true){
  const raw=JSON.stringify({type:'email.received',data}),id=crypto.randomUUID(),ts=String(Math.floor(Date.now()/1000));
  const sig=createHmac('sha256','resend-signing').update(id+'.'+ts+'.'+raw+(valid?'':' ')).digest('base64');
  return send(env,signedEmailPath,raw,{'Content-Type':'application/json','svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+sig});
}
function retell(env,call,event='call_analyzed',valid=true){
  const raw=JSON.stringify({event,call}),ts=String(Date.now());
  const sig=createHmac('sha256','retell-signing').update(raw+ts+(valid?'':' ')).digest('hex');
  return send(env,retellPath,raw,{'Content-Type':'application/json','X-Retell-Signature':'v='+ts+',d='+sig});
}
function twilio(env,path,fields,valid=true){
  const full={AccountSid:env.TWILIO_ACCOUNT_SID,CallSid:'CA'+'2'.repeat(32),From:caller,To:receiver,Direction:'inbound',...fields};
  const signature=createHmac('sha1','twilio-signing').update(origin+path+Object.keys(full).sort().map(key=>key+full[key]).join('')+(valid?'':' ')).digest('base64');
  return send(env,path,new URLSearchParams(full),{'X-Twilio-Signature':signature});
}

test('Resend acepta la consulta directa autenticada y separa en revisión el remitente sin verificar',async t=>{
  const {env,raw}=fixture(),goodId=crypto.randomUUID(),badId=crypto.randomUUID(),unknownId=crypto.randomUUID();
  const good={email_id:goodId,from:'aspirante@example.org',to:[mailbox],subject:'Consulta sobre requisitos de maestría'};
  const failed={...good,email_id:badId,from:'suplantacion@example.org',subject:'Asunto privado'};
  const uncertain={...good,email_id:unknownId,from:'revision@example.org'};
  let hits=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    hits++;
    const id=new URL(url).pathname.split('/').at(-1);
    assert.equal(new URL(url).searchParams.get('html_format'),'cid');
    assert.equal(options.headers.authorization,'Bearer resend-read');
    const data=id===goodId?good:id===badId?failed:uncertain;
    return Response.json({id,from:data.from,to:[mailbox],
      headers:{from:'Nombre ficticio <'+data.from+'>'},
      authentication:id===unknownId?null:{dmarc:id===goodId?'PASS':'fail'},
      text:'¿Qué requisitos tiene la maestría? Mi contacto alterno es privado@example.org.\nMi contraseña es TextoSecreto123\n-- \nTexto de firma'});
  });
  assert.equal((await resend(env,good,false)).status,403);
  assert.equal((await resend(env,{...good,to:['otra@recibir.example.org'],cc:[mailbox]})).status,200);
  assert.equal((await resend(env,{...good,to:[mailbox],subject:'Respuesta automática: vacaciones'})).status,200);
  assert.equal(hits,0);
  for(let i=0;i<2;i++)assert.equal((await resend(env,good)).status,200);
  assert.equal((await resend(env,failed)).status,200);
  assert.equal((await resend(env,uncertain)).status,200);
  const leads=raw.prepare('SELECT email,consent_email,consent_voice FROM leads').all();
  assert.equal(leads.length,1);
  assert.equal(leads[0].email,good.from);
  assert.equal(leads[0].consent_email,0);
  assert.equal(leads[0].consent_voice,0);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM jobs').get().n,0);
  const reviewed=raw.prepare("SELECT subject,excerpt,lead_id,review_reason,contact_email FROM admissions_conversations WHERE lead_id IS NULL ORDER BY event_id").all();
  assert.equal(reviewed.length,2);
  assert.ok(reviewed.every(row=>row.review_reason==='identity_unverified' && row.subject==='Remitente sin verificar' && !row.contact_email));
  assert.doesNotMatch(JSON.stringify(reviewed),/Asunto privado|suplantacion|privado@example/);
  const rows=[...raw.prepare('SELECT subject,excerpt FROM admissions_replies').all(),...raw.prepare('SELECT subject,excerpt FROM admissions_conversations').all()];
  assert.doesNotMatch(JSON.stringify(rows),/privado@example|TextoSecreto123|Texto de firma/);
});

test('Retell espera el análisis final de la llamada entrante y verifica el agente, número y firma',async()=>{
  const {env,raw}=fixture();
  const call={call_type:'phone_call',call_id:'call-inbound-1',direction:'inbound',call_status:'ended',agent_id:env.RETELL_INBOUND_AGENT_ID,
    agent_version:4,from_number:caller,to_number:receiver,end_timestamp:Date.now(),recording_url:'https://example.org/no-descargar',
    transcript_object:[{role:'agent',content:'Detalles internos de la aplicación.'},{role:'user',content:'¿Qué requisitos tiene la maestría? Quisiera conocer los documentos.'}]};
  assert.equal((await retell(env,call,'call_analyzed',false)).status,403);
  assert.equal((await retell(env,{...call,agent_id:'otro_agente'})).status,204);
  assert.equal((await retell(env,{...call,agent_version:2})).status,204);
  assert.equal((await retell(env,{...call,to_number:'+593999999999'})).status,204);
  assert.equal((await retell(env,call,'call_ended')).status,204);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,0);
  for(let i=0;i<2;i++)assert.equal((await retell(env,call)).status,204);
  const person=raw.prepare('SELECT phone,consent_voice,consent_email FROM leads').get();
  assert.equal(person.phone,caller);
  assert.equal(person.consent_voice,0);
  assert.equal(person.consent_email,0);
  const conversations=raw.prepare('SELECT * FROM admissions_conversations').all();
  assert.equal(conversations.length,1);
  assert.equal(conversations[0].direction,'inbound');
  assert.match(conversations[0].excerpt,/requisitos/);
  assert.doesNotMatch(JSON.stringify(conversations),/no-descargar|Detalles internos/);
  const stop={...call,call_id:'call-stop',from_number:'+593989876544',
    transcript_object:[{role:'user',content:'No me vuelvan a llamar.'}]};
  assert.equal((await retell(env,stop)).status,204);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,1);
  assert.ok(raw.prepare('SELECT 1 FROM voice_suppressions WHERE phone=?').get(stop.from_number));
});

test('Twilio separa el saludo y el estado de una consulta por voz firmada e idempotente',async()=>{
  const {env,raw}=fixture();
  const greeting=await twilio(env,twilioPath,{});
  assert.equal(greeting.status,200);
  assert.match(await greeting.text(),/<Gather[^>]+language="es-MX"[^>]+\/api\/webhooks\/twilio\/inbound\/speech/);
  const speech={SpeechResult:'Quiero hablar con un asesor sobre los requisitos de maestría.'};
  assert.equal((await twilio(env,twilioPath+'/speech',speech,false)).status,403);
  assert.equal((await twilio(env,twilioPath+'/speech',{...speech,AccountSid:'AC'+'9'.repeat(32)})).status,403);
  assert.equal((await twilio(env,twilioPath+'/speech',{...speech,To:'+593998765432'})).status,403);
  assert.equal((await twilio(env,twilioPath+'/status',{CallStatus:'completed'})).status,200);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,0);
  for(let i=0;i<2;i++)assert.equal((await twilio(env,twilioPath+'/speech',speech)).status,200);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM admissions_conversations').get().n,1);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads WHERE consent_voice=0 AND consent_email=0').get().n,1);
  for(let i=0;i<2;i++)assert.equal((await twilio(env,twilioPath+'/status',{CallStatus:'completed'})).status,200);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM events WHERE description='Finalizó la llamada recibida.'").get().n,1);
  const stop={CallSid:'CA'+'3'.repeat(32),From:'+593999999998',Digits:'9'};
  assert.equal((await twilio(env,twilioPath+'/speech',stop)).status,200);
  assert.ok(raw.prepare('SELECT 1 FROM voice_suppressions WHERE phone=?').get(stop.From));
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,1);
});

test('la voz saliente registra solo la intervención ligada a una llamada conciliada',async()=>{
  const {env,raw}=fixture(),date=new Date().toISOString();
  raw.prepare("INSERT INTO leads(id,name,email,phone,source,created_at,updated_at,pref_token,consent_voice) VALUES('l1','Persona ficticia','lead@example.org',?,'portal',?,?,'preferencia',1)").run(caller,date,date);
  const add=raw.prepare("INSERT INTO jobs(id,lead_id,channel,kind,status,due_at,created_at,updated_at,provider_id) VALUES(?,'l1','voice',?,'sent',?,?,?,?)");
  add.run('r1','callback',date,date,date,'call_outbound');
  const callId='CA'+'4'.repeat(32);
  add.run('t1','guidance',date,date,date,callId);
  raw.prepare("INSERT INTO channel_dispatches(provider,job_id,phone,account,sender,version) VALUES('retell','r1',?,'agent_outbound',?,'4')").run(caller,receiver);
  const query='¿Cuáles son los requisitos para la maestría?';
  const call={call_type:'phone_call',call_id:'call_outbound',direction:'outbound',call_status:'ended',agent_id:'agent_outbound',
    agent_version:4,from_number:receiver,to_number:caller,transcript:'Agent: mi mensaje interno\nUser: '+query};
  assert.equal((await retell(env,{...call,from_number:'+593999999999'})).status,204);
  assert.equal((await twilio(env,'/api/webhooks/twilio/menu/t1',{CallSid:callId,From:receiver,To:'+593999999999',Direction:'outbound-api',SpeechResult:query})).status,200);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM admissions_conversations').get().n,0);
  for(let i=0;i<2;i++){
    assert.equal((await retell(env,call)).status,204);
    assert.equal((await twilio(env,'/api/webhooks/twilio/menu/t1',{CallSid:callId,From:receiver,To:caller,Direction:'outbound-api',SpeechResult:query})).status,200);
  }
  const captured=raw.prepare('SELECT provider,direction,lead_id,excerpt,extraction FROM admissions_conversations ORDER BY provider').all();
  assert.deepEqual(captured.map(row=>row.provider),['retell','twilio']);
  assert.ok(captured.every(row=>row.lead_id==='l1' && row.direction==='outbound' && JSON.parse(row.extraction).intent==='requisitos'));
  assert.doesNotMatch(JSON.stringify(captured),/mi mensaje interno/);
});
