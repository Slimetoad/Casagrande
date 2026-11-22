import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {handleIntegrations, integrationDashboard, publicArticles, runDueJobs, runGrowthCycle} from '../src/integrations.js';
import {aiText} from '../src/providers.js';

const programs=[{slug:'educacion',title:'Maestría en Educación',area:'Educación',duration:'Un año',mode:'En línea',url:'https://www.casagrande.edu.ec/posgrados',summary:'Estudia metodologías de aprendizaje.',details:[]}];
const base='https://posgrados.example.org';
function database(){
  const raw=new DatabaseSync(':memory:');
  for(const sql of ['schema.sql','growth.sql','operations-v2.sql','channels.sql'])raw.exec(readFileSync(new URL('../'+sql,import.meta.url),'utf8'));
  class Statement {
    constructor(sql,args=[]){this.sql=sql;this.args=args;}
    bind(...args){return new Statement(this.sql,args);}
    first(){return raw.prepare(this.sql).get(...this.args)||null;}
    all(){return {results:raw.prepare(this.sql).all(...this.args)};}
    run(){return {meta:{changes:raw.prepare(this.sql).run(...this.args).changes}};}
  }
  return {raw,prepare:q=>new Statement(q),batch(rows){
    raw.exec('BEGIN');
    try{const values=rows.map(r=>r.sql.trim().startsWith('SELECT')?r.all():r.run());raw.exec('COMMIT');return values;}catch(e){raw.exec('ROLLBACK');throw e;}
  }};
}
function invoke(env,path,body,operator=null,headers={}){
  const url=new URL(path,base);
  const request=new Request(url,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),headers});
  return handleIntegrations(request,env,url,programs,operator);
}
function addLead(db,consent=true,channel='email'){
  const date=new Date().toISOString();
  db.raw.prepare('INSERT INTO leads(id,name,email,pref_token,source,created_at,updated_at,consent_email,consent_voice,phone,program) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('l1','Persona ficticia','prueba@example.org','preferencia-aleatoria','orientacion',date,date,Number(consent),Number(consent),'+593991234567','educacion');
  db.raw.prepare('INSERT INTO jobs(id,lead_id,channel,kind,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('j1','l1',channel,channel==='email'?'welcome':'callback','pending',date,date,date);
}
test('la orientación funciona con el catálogo local y los procesos pausados no realizan conexiones externas',async t=>{
  const env={DB:database()};
  t.mock.method(globalThis,'fetch',()=>{throw new Error('llamada externa inesperada');});
  const res=await invoke(env,'/api/chat',{message:'¿Cuánto dura Educación?',program:'educacion'});
  assert.equal(res.status,200);
  const body=await res.json();assert.equal(body.mode,'catalogo');assert.match(body.answer,/Un año/);
  assert.equal((await runDueJobs(env,programs)).status,'en_pausa');
  assert.equal((await runGrowthCycle(env,programs)).status,'sin_configurar');
  assert.equal((await invoke(env,'/api/staff/seo/draft',{opportunityId:'a'})).status,403);
  assert.equal((await invoke(env,'/api/staff/seo/sync',{},'asesor')).status,409);
});
test('cada proveedor de IA usa el modelo seleccionado con claves solo en cabeceras',async t=>{
  const bodies=[];
  t.mock.method(globalThis,'fetch',async (url,opts)=>{
    assert.ok(!url.includes('clave-de-prueba'));
    const body=JSON.parse(opts.body);bodies.push(body);
    if(url.includes('openai'))return Response.json({output:[{type:'message',content:[{type:'output_text',text:'Respuesta OpenAI'}]}]});
    if(url.includes('anthropic'))return Response.json({content:[{type:'text',text:'Respuesta Claude'}]});
    return Response.json({candidates:[{content:{parts:[{text:'Respuesta Gemini'}]}}]});
  });
  for(const [prefix,provider] of [['OPENAI','openai'],['ANTHROPIC','anthropic'],['GEMINI','google']]){
    const env={[prefix+'_API_KEY']:'clave-de-prueba',[prefix+'_MODEL']:'modelo-unitario',LLM_PROVIDER:provider};
    assert.match(await aiText(env,'Responde en español.','Pregunta'),/^Respuesta/);
  }
  assert.equal(bodies.length,3);assert.equal(bodies[0].store,false);
});
test('una consulta real de Search Console genera un borrador y solo un editor lo publica',async t=>{
  const env={DB:database(),GSC_SITE:'sc-domain:example.org',GSC_ACCESS_TOKEN:'prueba',OPENAI_API_KEY:'prueba',OPENAI_MODEL:'modelo-test'};
  const article={title:'Cómo elegir una maestría en educación',summary:'Una guía para seleccionar tu programa de posgrado.',body:'Revisa el enfoque académico del programa. Consulta la ficha del catálogo de la universidad, compara tu disponibilidad de horarios y solicita orientación de admisiones.'};
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    if(url.includes('googleapis.com'))return Response.json({rows:[
      {keys:['maestría en educación'],clicks:5,impressions:200,ctr:0.025,position:7.2},
      {keys:['maestría ayúdame al 099 987 6543'],clicks:1,impressions:10,ctr:0.1,position:8},
      {keys:['posgrado escribe a persona@example.org'],clicks:1,impressions:15,ctr:0.06,position:9}
    ]});
    const editorial=JSON.parse(JSON.parse(options.body).input);
    assert.deepEqual(Object.keys(editorial),['intencion','fichas']);
    assert.equal(editorial.intencion,'Elegir un programa de posgrado');
    return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(article)}]}]});
  });
  const sync=await invoke(env,'/api/staff/seo/sync',{},'editora');assert.equal(sync.status,200);
  const {opportunities}=await integrationDashboard(env);assert.equal(opportunities.length,1);assert.equal(opportunities[0].impressions,200);
  const draft=await (await invoke(env,'/api/staff/seo/draft',{opportunityId:opportunities[0].id},'editora')).json();
  assert.equal(draft.article.status,'draft');assert.equal((await publicArticles(env)).length,0);
  assert.equal((await invoke(env,'/api/staff/articles/'+draft.article.id,{action:'publish'},'editora')).status,200);
  const published=await publicArticles(env,draft.article.slug);
  assert.equal(published.title,article.title);
  assert.equal(published.sourceQuery,undefined);
  await invoke(env,'/api/staff/articles/'+draft.article.id,{action:'archive'},'editora');
  assert.equal((await invoke(env,'/api/articles/'+draft.article.slug)).status,404);
});
test('correo de Resend respeta consentimiento y distingue la aceptación de la entrega y el rebote',async t=>{
  const env={DB:database(),OUTREACH_ENABLED:'true',RESEND_API_KEY:'prueba',RESEND_FROM:'prueba@example.org',PUBLIC_BASE_URL:base,RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.from('unidad').toString('base64')};
  addLead(env.DB,false);let count=0;
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    assert.equal(url,'https://api.resend.com/emails');count++;
    const data=JSON.parse(opts.body);
    assert.match(data.text,/simulador|Admisiones/);assert.match(data.headers['List-Unsubscribe'],/api\/preferences/);
    return Response.json({id:'externo-1'});
  });
  assert.equal((await runDueJobs(env,programs)).skipped,1);assert.equal(count,0);
  env.DB.raw.exec("UPDATE leads SET consent_email=1; UPDATE jobs SET status='pending';");
  const [first,second]=await Promise.all([runDueJobs(env,programs),runDueJobs(env,programs)]);
  assert.equal(first.accepted+second.accepted,1);assert.equal(count,1);
  const event=JSON.stringify({type:'email.bounced',data:{email_id:'externo-1'}}),ts=Math.floor(Date.now()/1000)+'';
  const sig=createHmac('sha256','unidad').update('evento.'+ts+'.'+event).digest('base64');
  const headers={'svix-id':'evento','svix-timestamp':ts,'svix-signature':'v1,'+sig};
  assert.equal((await invoke(env,'/api/webhooks/resend',event,null,{...headers,'svix-signature':'v1,falsa'})).status,403);
  for(let i=0;i<2;i++)assert.equal((await invoke(env,'/api/webhooks/resend',event,null,headers)).status,200);
  assert.equal(env.DB.raw.prepare('SELECT consent_email FROM leads').get().consent_email,0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE type='correo'").get().n,1);
});
test('Twilio verifica la firma, crea una tarea de asesor y registra la baja por teclado',async()=>{
  const env={DB:database(),TWILIO_AUTH_TOKEN:'unidad',TWILIO_ACCOUNT_SID:'ACtest',PUBLIC_BASE_URL:base};
  addLead(env.DB,true,'voice');env.DB.raw.exec("UPDATE jobs SET status='sent',provider_id='CA-prueba';");
  const path='/api/webhooks/twilio/menu/j1';
  async function button(digit,sign=true,speech=''){
    const fields={AccountSid:'ACtest',CallSid:'CA-prueba',...(speech?{SpeechResult:speech}:{Digits:digit})};
    const signature=createHmac('sha1','unidad').update(base+path+Object.keys(fields).sort().map(k=>k+fields[k]).join('')).digest('base64');
    return invoke(env,path,new URLSearchParams(fields).toString(),null,{'X-Twilio-Signature':sign?signature:'falsa'});
  }
  assert.equal((await button('1',false)).status,403);assert.equal((await button('1')).status,200);
  assert.match(await (await button('2')).text(),/Un año/);
  assert.match(await (await button('',true,'¿Cuánto dura el programa?')).text(),/Un año/);
  assert.equal((await button('1')).status,200);assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM tasks').get().n,1);
  assert.equal((await button('',true,'Quiero darme de baja')).status,200);
  assert.equal((await button('9')).status,200);assert.equal(env.DB.raw.prepare('SELECT consent_voice FROM leads').get().consent_voice,0);
});

test('el orientador reconoce MBA e IA, conserva el contexto y respeta las convocatorias cerradas',async()=>{
  const {programs:catalog}=await import('../src/catalog.js');
  const ask=async message=>{
    const url=new URL('/api/chat',base);
    return (await handleIntegrations(new Request(url,{method:'POST',body:JSON.stringify(typeof message==='string'?{message}:message)}),{},url,catalog,null)).json();
  };
  const mba=await ask('MBA'),ia=await ask('IA');
  assert.equal(mba.contextProgram,'maestria-en-administracion-de-empresas');
  assert.equal(ia.contextProgram,'maestria-en-ia-y-ciencia-de-datos');
  const closed=catalog.find(p=>p.admissionsStatus==='Inscripciones cerradas');
  const ans=await ask({message:'¿Sigue abierta?',program:closed.slug});
  assert.match(ans.answer,/cerradas/);assert.equal(ans.contextProgram,closed.slug);
  const syllabus=await ask({message:'¿Qué asignaturas veré?',program:ia.contextProgram});
  assert.ok(syllabus.answer.includes(catalog.find(p=>p.slug===ia.contextProgram).curriculum[0]));
});
test('los mensajes de postulación y matrícula requieren la etapa confirmada y nunca se adelantan',async t=>{
  const env={DB:database(),OUTREACH_ENABLED:'true',RESEND_API_KEY:'prueba',RESEND_FROM:'prueba@example.org',PUBLIC_BASE_URL:base};
  addLead(env.DB);
  const messages=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{messages.push(JSON.parse(opts.body));return Response.json({id:'correo-'+messages.length});});
  const raw=env.DB.raw;
  raw.exec("UPDATE jobs SET kind='admission';");
  await runDueJobs(env,programs);assert.equal(messages.length,0);
  for(const [stage,kind,title] of [['En postulación','application','Tu proceso de postulación'],['Admitido','admission','Próximos pasos de tu matrícula']]){
    raw.prepare('UPDATE leads SET stage=?').run(stage);raw.prepare("UPDATE jobs SET kind=?,status='pending',attempts=0").run(kind);
    if(kind==='admission'){
      assert.equal((await runDueJobs(env,programs)).accepted,0);
      assert.equal(raw.prepare('SELECT status FROM jobs').get().status,'pending');
      raw.prepare("INSERT INTO admissions_stage_evidence VALUES('proof','l1','Admitido','Registro interno confirmado',?,'admisiones')").run(new Date().toISOString());
      raw.exec("INSERT INTO admissions_cases(lead_id,admission_evidence_id) VALUES('l1','proof')");
    }
    assert.equal((await runDueJobs(env,programs)).accepted,1);
    assert.equal(messages.at(-1).subject,title);
  }
});
test('Semrush conserva volumen y posición sin fabricar impresiones o clics',async t=>{
  const env={DB:database(),SEMRUSH_API_KEY:'prueba',SEMRUSH_DOMAIN:'example.org',SEMRUSH_DATABASE:'ec'};
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);assert.equal(u.searchParams.get('database'),'ec');
    assert.equal(u.searchParams.get('type'),'domain_organic');
    return new Response('Keyword;Position;Search Volume\nmaestría en educación;8;1400');
  });
  const result=await runGrowthCycle(env,programs);assert.equal(result.status,'completado');
  const {opportunities}=await integrationDashboard(env);
  assert.equal(opportunities[0].volume,1400);assert.equal(opportunities[0].clicks,null);assert.equal(opportunities[0].impressions,null);
});
test('si no hay confirmación de entrega, la cola requiere conciliación y no duplica el envío',async t=>{
  const env={DB:database(),OUTREACH_ENABLED:'true',RESEND_API_KEY:'prueba',RESEND_FROM:'prueba@example.org',PUBLIC_BASE_URL:base};
  addLead(env.DB);let count=0;
  t.mock.method(globalThis,'fetch',async()=>{count++;return new Response('error',{status:503});});
  assert.equal((await runDueJobs(env,programs)).review,1);
  await runDueJobs(env,programs);assert.equal(count,1);
  assert.equal(env.DB.raw.prepare('SELECT status FROM jobs').get().status,'uncertain');
});

const whatsappEnv=DB=>({
  DB,PUBLIC_BASE_URL:base,OUTREACH_ENABLED:'true',OUTREACH_WHATSAPP_ENABLED:'true',
  WHATSAPP_APP_SECRET:'meta-sandbox',WHATSAPP_VERIFY_TOKEN:'verificacion-local',
  WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_BUSINESS_ACCOUNT_ID:'456',
  WHATSAPP_ACCESS_TOKEN:'token-local',WHATSAPP_GRAPH_VERSION:'v27.0',
  WHATSAPP_TEMPLATE_WELCOME:'orientacion_ucg'
});
const phone='+593991234567';
function whatsappJob(db,kind='welcome',state='granted'){
  addLead(db);
  db.raw.exec('DELETE FROM jobs');
  const date=new Date().toISOString();
  db.raw.prepare('INSERT INTO whatsapp_consents VALUES(?,?,?,?,?,?,?)').run('l1',phone,state,'portal','test-version',date,date);
  db.raw.prepare("INSERT INTO whatsapp_jobs(id,lead_id,phone,kind,status,due_at,created_at,updated_at) VALUES('w1','l1',?,?,'pending',?,?,?)").run(phone,kind,date,date,date);
}
function metaWebhook(env,{statuses=[],messages=[],account='456',sender='123',valid=true}={}){
  const body=JSON.stringify({object:'whatsapp_business_account',entry:[{id:account,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:sender},statuses,messages}}]}]},null,2);
  const hash=createHmac('sha256',env.WHATSAPP_APP_SECRET).update(valid?body:body+' ').digest('hex');
  return invoke(env,'/api/webhooks/whatsapp',body,null,{'X-Hub-Signature-256':'sha256='+hash});
}

test('WhatsApp envía solo plantillas aprobadas del canal y concilia el estado firmado sin duplicar envíos',async t=>{
  const env=whatsappEnv(database());
  whatsappJob(env.DB);
  const handshake=await invoke(env,'/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=verificacion-local');
  assert.equal(await handshake.text(),'12345');
  assert.equal((await invoke(env,'/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=no')).status,403);
  let requests=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    requests++;
    assert.equal(url,'https://graph.facebook.com/v27.0/123/messages');
    assert.equal(options.headers.Authorization,'Bearer token-local');
    assert.deepEqual(JSON.parse(options.body),{
      messaging_product:'whatsapp',recipient_type:'individual',to:'593991234567',type:'template',
      template:{name:'orientacion_ucg',language:{code:'es'}},biz_opaque_callback_data:'posgrados-ucg:w1'
    });
    throw new Error('Proveedor con respuesta incierta');
  });
  const results=await Promise.all([runDueJobs(env,programs),runDueJobs(env,programs)]);
  assert.equal(results[0].review+results[1].review,1);
  await runDueJobs(env,programs);assert.equal(requests,1);
  const remote='wamid.ABC123=';
  const delivery={id:remote,status:'delivered',recipient_id:phone.slice(1),biz_opaque_callback_data:'posgrados-ucg:w1'};
  assert.equal((await metaWebhook(env,{statuses:[delivery],valid:false})).status,403);
  await metaWebhook(env,{statuses:[delivery],sender:'999'});
  await metaWebhook(env,{statuses:[delivery],account:'999'});
  await metaWebhook(env,{statuses:[{...delivery,recipient_id:'593999999999'}]});
  assert.equal(env.DB.raw.prepare("SELECT status FROM whatsapp_jobs WHERE id='w1'").get().status,'uncertain');
  for(let i=0;i<2;i++)assert.ok((await metaWebhook(env,{statuses:[delivery]})).ok);
  await metaWebhook(env,{statuses:[{...delivery,status:'failed'},{...delivery,status:'sent'}]});
  const sent=env.DB.raw.prepare("SELECT provider_id,status FROM whatsapp_jobs WHERE id='w1'").get();
  assert.equal(sent.provider_id,remote);
  assert.equal(sent.status,'sent');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE id LIKE 'whatsapp:%'").get().n,1);
});

test('WhatsApp vuelve a comprobar consentimiento y etapa, y deriva respuestas sin guardar el mensaje',async t=>{
  const env=whatsappEnv(database());
  whatsappJob(env.DB,'welcome','revoked');
  t.mock.method(globalThis,'fetch',()=>assert.fail('No debe enviar mensajes sin consentimiento vigente'));
  assert.equal((await runDueJobs(env,programs)).skipped,1);
  env.DB.raw.exec("UPDATE whatsapp_consents SET state='granted'; UPDATE whatsapp_jobs SET kind='admission',status='pending'");
  assert.equal((await runDueJobs(env,programs)).accepted,0);
  assert.equal(env.DB.raw.prepare('SELECT attempts FROM whatsapp_jobs').get().attempts,1);
  const reply={from:phone.slice(1),id:'wamid.message',type:'text',text:{body:'Quiero hablar con una asesora. texto privado'}};
  for(let i=0;i<2;i++)assert.ok((await metaWebhook(env,{messages:[reply]})).ok);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM tasks').get().n,1);
  assert.equal(env.DB.raw.prepare('SELECT title FROM tasks').get().title,'Responder por WhatsApp al aspirante');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE description LIKE '%texto privado%'").get().n,0);
  assert.equal(env.DB.raw.prepare('SELECT paused FROM leads').get().paused,1);
  const unsubscribe={...reply,id:'wamid.baja',type:'button',text:undefined,button:{payload:'baja'}};
  await metaWebhook(env,{messages:[unsubscribe,{...unsubscribe,from:'593999999998',id:'wamid.nuevo'}]});
  assert.equal(env.DB.raw.prepare('SELECT state FROM whatsapp_consents').get().state,'revoked');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM whatsapp_suppressions').get().n,2);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE type='preferencias'").get().n,1);
  assert.equal(env.DB.raw.prepare('SELECT consent_voice FROM leads').get().consent_voice,1);
});

function retellWebhook(env,call,event='call_analyzed',ageMs=0){
  const raw=JSON.stringify({event,call},null,2);
  const ts=String(Date.now()-ageMs);
  const signature=createHmac('sha256',env.RETELL_WEBHOOK_KEY).update(raw+ts).digest('hex');
  return invoke(env,'/api/webhooks/retell',raw,null,{'X-Retell-Signature':'v='+ts+',d='+signature});
}

test('Retell verifica la firma y concilia la llamada; el análisis deriva y respeta la baja de voz',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-23T15:30:00Z')});
  const env={DB:database(),PUBLIC_BASE_URL:base,OUTREACH_ENABLED:'true',OUTREACH_VOICE_PROVIDER:'retell',
    RETELL_FROM:'+12025550123',RETELL_AGENT_ID:'advisor_test',RETELL_AGENT_VERSION:'4',RETELL_API_KEY:'key-api',RETELL_WEBHOOK_KEY:'key-webhook'};
  addLead(env.DB,true,'voice');
  const call={call_type:'phone_call',direction:'outbound',from_number:env.RETELL_FROM,to_number:phone,agent_id:env.RETELL_AGENT_ID,agent_version:4,
    call_id:'call_test',call_status:'ended',metadata:{ucg_source:'posgrados-ucg',ucg_job_id:'j1'},
    call_analysis:{custom_analysis_data:{human_callback:true},call_summary:'contenido privado'}};
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.retellai.com/v2/create-phone-call');
    assert.equal(options.headers.Authorization,'Bearer key-api');
    const sent=JSON.parse(options.body);
    assert.equal(sent.from_number,env.RETELL_FROM);
    assert.equal(sent.to_number,phone);
    assert.equal(sent.override_agent_version,4);
    assert.equal(sent.idempotency_key,'posgrados-ucg-j1');
    assert.equal(sent.honor_internal_dnc,true);
    assert.equal(sent.retell_llm_dynamic_variables.programa,programs[0].title);
    assert.ok(!options.body.includes('prueba@example.org'));
    throw new Error('No se sabe si se creó la llamada');
  });
  assert.equal((await runDueJobs(env,programs)).review,1);
  await runDueJobs(env,programs);assert.equal(calls,1);
  assert.equal((await retellWebhook(env,call,'call_analyzed',301000)).status,403);
  await retellWebhook(env,{...call,to_number:'+593999999999'});
  await retellWebhook(env,{...call,agent_version:3});
  assert.equal(env.DB.raw.prepare('SELECT status FROM jobs').get().status,'uncertain');
  for(let i=0;i<2;i++)assert.ok((await retellWebhook(env,call)).ok);
  await retellWebhook(env,{...call,call_status:'ongoing'},'call_started');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM tasks').get().n,1);
  assert.equal(env.DB.raw.prepare('SELECT status FROM jobs').get().status,'sent');
  assert.equal(env.DB.raw.prepare('SELECT provider_id FROM jobs').get().provider_id,'call_test');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE description LIKE '%contenido privado%'").get().n,0);
  const retained={...call,transcript_object:[{role:'agent',content:'No me vuelvan a llamar'},{role:'user',content:'No quiero darme de baja.'}]};
  assert.ok((await retellWebhook(env,retained,'call_ended')).ok);
  assert.equal(env.DB.raw.prepare('SELECT consent_voice FROM leads').get().consent_voice,1);
  const optedOut={...call,transcript_object:[{role:'agent',content:'¿Prefiere que sigamos llamando?'},{role:'user',content:'Por favor, no me vuelvan a llamar.'}]};
  assert.ok((await retellWebhook(env,optedOut,'call_ended')).ok);
  assert.ok((await retellWebhook(env,{...call,disconnection_reason:'user_requested_dnc'},'call_ended')).ok);
  assert.equal(env.DB.raw.prepare('SELECT consent_voice FROM leads').get().consent_voice,0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM voice_suppressions').get().n,1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE type='preferencias'").get().n,1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM tasks WHERE status='pendiente'").get().n,0);
});

test('Resend vuelve a leer el consentimiento si cambia mientras prepara la ruta de respuesta',async t=>{
  const env={DB:database(),OUTREACH_ENABLED:'true',PUBLIC_BASE_URL:base,RESEND_API_KEY:'prueba',RESEND_FROM:'prueba@example.org',RESEND_REPLY_DOMAIN:'reply.example.org'};
  addLead(env.DB);
  const prepare=env.DB.prepare;
  env.DB.prepare=sql=>{
    if(sql.startsWith('SELECT token FROM admissions_reply_routes'))env.DB.raw.exec('UPDATE leads SET consent_email=0');
    return prepare(sql);
  };
  t.mock.method(globalThis,'fetch',()=>assert.fail('El consentimiento se retiró antes de enviar'));
  assert.equal((await runDueJobs(env,programs)).skipped,1);
  assert.equal(env.DB.raw.prepare('SELECT status FROM jobs').get().status,'skipped');
});

test('Resend conserva recibos de expedientes cerrados y matriculados sin reabrir la atención',async()=>{
  const {captureInboundReply,recruitmentReplyTo}=await import('../src/replies.js');
  for(const stage of ['Cerrado','Matriculado']){
    const env={DB:database(),RESEND_REPLY_DOMAIN:'reply.example.org'};
    addLead(env.DB);
    const db=env.DB.raw;
    db.prepare("UPDATE leads SET stage=?,next_action='Expediente finalizado' WHERE id='l1'").run(stage);
    const read=()=>db.prepare("SELECT * FROM leads WHERE id='l1'").get();
    const before=read();
    const recipient=await recruitmentReplyTo(env,before);
    const data={email_id:crypto.randomUUID(),from:before.email,to:[recipient],subject:'Consulta posterior'};
    for(let i=0;i<2;i++)await captureInboundReply(env,{type:'email.received',data});
    assert.deepEqual(read(),before);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM admissions_replies').get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM events WHERE type='correo recibido'").get().n,1);
  }
});
