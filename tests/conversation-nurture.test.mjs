import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {programs} from '../src/catalog.js';
import {handleNurture, previewNurturePlan, reconcileNurtureEmail, recordNurtureSignal, runNurtureJobs} from '../src/conversation-nurture.js';
import {serve} from '../src/portal.js';

const program=programs.find(item=>item.price>0) || programs[0];
const base='https://posgrados.example.edu';
const date=()=>new Date().toISOString();
function fixture(overrides={}) {
  const raw=new DatabaseSync(':memory:');
  for(const name of ['schema','operations-v2','appointments','conversation-v3','nurture-v3'])
    raw.exec(readFileSync(new URL('../'+name+'.sql',import.meta.url),'utf8'));
  const query=(sql,args=[])=>({
    bind:(...values)=>query(sql,values),
    first:()=>raw.prepare(sql).get(...args)||null,
    all:()=>({results:raw.prepare(sql).all(...args)}),
    run(){const stmt=raw.prepare(sql);return stmt.columns().length?this.all():{meta:{changes:stmt.run(...args).changes}};}
  });
  const env={PUBLIC_BASE_URL:base,OUTREACH_ENABLED:'true',RESEND_API_KEY:'prueba',RESEND_FROM:'Posgrados <origen@example.edu>',
    RESEND_REPLY_DOMAIN:'respuestas.example.edu',DB:{prepare:query,batch(items){
      raw.exec('BEGIN');
      try {const result=items.map(item=>item.run());raw.exec('COMMIT');return result;}
      catch(error) {raw.exec('ROLLBACK');throw error;}
    }},...overrides};
  function lead(id,settings={}) {
    raw.prepare(`INSERT INTO leads(id,name,email,program,source,stage,paused,consent_email,consent_voice,created_at,updated_at,pref_token)
      VALUES(?,'Nombre reservado',?,?,'correo directo',?,?,?,?,?,?,?)`).run(id,id+'@example.edu',settings.program??program.slug,settings.stage||'En orientación',
      settings.paused||0,settings.email??1,settings.voice??0,date(),date(),crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''));
  }
  function signal(id,leadId,extraction={},extra={}) {
    return recordNurtureSignal(env,{id,leadId,channel:'email',receivedAt:date(),extraction:{intent:'inversion',
      confidence:'alta',needsReview:false,...extraction},...extra});
  }
  function status(id) {return raw.prepare('SELECT status FROM conversation_nurture_jobs WHERE signal_id=?').get(id)?.status;}
  return {env,raw,lead,signal,status};
}
const positive={intent:'programa',confidence:'alta',needsReview:false};

test('la simulación usa hechos del catálogo y la voz conserva un paso humano sin permiso explícito de correo',()=>{
  const plan=previewNurturePlan({...positive,program:program.slug},{channel:'email',consentEmail:true,programs,stage:'Nuevo',base});
  assert.equal(plan.decision,'respuesta_programada');
  assert.equal(plan.sourceUrl,program.url);
  assert.match(plan.draft.text,/Fuente de la universidad/);
  assert.match(plan.draft.text,/Equipo de orientación · Portal piloto de posgrados$/);
  const live=previewNurturePlan({...positive,program:program.slug},{channel:'email',consentEmail:true,programs,stage:'Nuevo',base,institutional:true});
  assert.match(live.draft.text,/Equipo de Admisiones de Posgrados\nUniversidad Casa Grande$/);
  const call=previewNurturePlan(positive,{channel:'call',consentEmail:false,program,programs,base});
  assert.equal(call.draft,null);
  assert.equal(call.decision,'revision_humana');
});
test('el correo autorizado responde a la intención y reintentos no duplican tareas o comunicaciones',async t=>{
  const {env,raw,lead,signal,status}=fixture();
  lead('interes');
  const [a,b]=await Promise.all([signal('s1','interes'),signal('s1','interes')]);
  assert.equal(a.decision,'respuesta_programada');
  assert.equal(b.id,a.id);
  assert.equal(raw.prepare('SELECT count(*) n FROM events').get().n,1);
  assert.equal(raw.prepare('SELECT count(*) n FROM conversation_nurture_jobs').get().n,1);
  const urls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    urls.push(url);
    const body=JSON.parse(options.body);
    assert.deepEqual(body.to,['interes@example.edu']);
    assert.equal(body.from,'Equipo de orientación · Portal piloto de posgrados <origen@example.edu>');
    assert.match(body.subject,/Inversión y orientación/);
    assert.match(body.text,/financiamiento/);
    assert.match(body.text,/Fuente de la universidad/);
    assert.match(body.reply_to,/^adm-[a-f0-9]+@respuestas\.example\.edu$/);
    assert.match(options.headers['Idempotency-Key'],/^posgrados-conversacion-/);
    return Response.json({id:'proveedor-test'});
  });
  assert.equal((await runNurtureJobs(env,programs)).accepted,1);
  assert.equal(status('s1'),'accepted');
  const recent=await signal('s2','interes',{intent:'cita'});
  assert.equal(recent.decision,'revision_humana');
  assert.match(recent.reason,/seguimiento reciente/);
  assert.equal((await runNurtureJobs(env,programs)).accepted,0);
  assert.deepEqual(urls,['https://api.resend.com/emails']);
  const url=new URL(base+'/api/staff/leads/interes/nurture');
  assert.equal((await handleNurture(new Request(url),env,url,programs,null)).status,403);
  const authorized=await handleNurture(new Request(url),env,url,programs,'equipo');
  assert.match(authorized.headers.get('cache-control'),/no-store/);
  assert.doesNotMatch(await authorized.text(),/Nombre reservado|interes@example/);
});
test('baja, ausencia de permisos, consulta ambigua y cierre detienen la cadencia',async t=>{
  const {env,raw,lead,signal,status}=fixture();
  lead('baja',{voice:1});lead('sin',{email:0});lead('ambiguo');lead('cerrado',{stage:'Cerrado'});lead('pausa',{paused:1});
  const reply=await signal('p1','baja');
  assert.equal(reply.jobStatus,'pending');
  const opt=await signal('p2','baja',{intent:'baja',optOutChannel:'email'});
  assert.equal(opt.decision,'baja');
  assert.equal(status('p1'),'skipped');
  assert.deepEqual({...raw.prepare("SELECT consent_email,consent_voice FROM leads WHERE id='baja'").get()},{consent_email:0,consent_voice:1});
  for(const [id,context,expected] of [['sin',{},'revision_humana'],['ambiguo',{confidence:'media',needsReview:true},'revision_humana'],
    ['cerrado',{},'sin_contacto'],['pausa',{},'revision_humana']])assert.equal((await signal('p-'+id,id,context)).decision,expected,id);
  t.mock.method(globalThis,'fetch',()=>assert.fail('No debe contactar'));
  assert.equal((await runNurtureJobs(env,programs)).accepted,0);
  assert.equal(raw.prepare("SELECT count(*) n FROM tasks WHERE lead_id='cerrado'").get().n,0);
});
test('se conserva la respuesta más reciente y se revalida la baja antes del despacho',async t=>{
  const {env,raw,lead,signal,status}=fixture();
  lead('cambio');
  const first=new Date(Date.now()-8000).toISOString();
  const second=new Date(Date.now()-4000).toISOString();
  await signal('vieja','cambio',{}, {receivedAt:first});
  await signal('nueva','cambio',{intent:'requisitos'},{receivedAt:second});
  assert.equal(status('vieja'),'skipped');
  assert.equal(status('nueva'),'pending');
  assert.equal((await signal('demorada','cambio',{intent:'cita'},{receivedAt:first})).decision,'superada');
  raw.exec("UPDATE leads SET consent_email=0, revision=revision+1 WHERE id='cambio'");
  t.mock.method(globalThis,'fetch',()=>assert.fail('No debe enviar después de perder el permiso'));
  assert.equal((await runNurtureJobs(env,programs)).skipped,1);
  assert.equal(status('nueva'),'skipped');
});
test('la consulta directa verificada admite una sola respuesta transaccional sin modificar permisos',async t=>{
  const {env,raw,lead,signal,status}=fixture();
  lead('directo',{email:0,program:'',stage:'Nuevo'});lead('existente',{email:0});lead('no-verificado',{email:0});
  const verified={trustedDirect:true,createdLead:true};
  raw.prepare(`INSERT INTO admissions_conversations(id,provider,event_id,lead_id,direction,kind,contact_email,
    review_status,content_status,trusted_direct,created_lead,occurred_at,created_at,updated_at)
    VALUES('f1','resend','ev1','directo','inbound','email','directo@example.edu',
      'linked','complete',1,1,?,?,?)`).run(date(),date(),date());
  assert.equal((await signal('f1','directo',positive,verified)).decision,'respuesta_programada');
  assert.equal((await signal('f2','existente',positive,{trustedDirect:true,createdLead:false})).decision,'revision_humana');
  assert.equal((await signal('f3','no-verificado',positive,{trustedDirect:false,createdLead:true})).decision,'revision_humana');
  let sends=0;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    sends++;
    const message=JSON.parse(options.body);
    assert.deepEqual(message.to,['directo@example.edu']);
    assert.match(message.text,/Respondemos una vez/);
    assert.match(message.text,/Si deseas autorizar/);
    assert.match(message.text,/\/confirmar\/directo\.[0-9]+\.[a-f0-9]{64}/);
    return Response.json({id:'transaccional-test'});
  });
  assert.equal((await runNurtureJobs(env,programs)).accepted,1);
  assert.equal((await signal('f4','directo',positive,verified)).decision,'revision_humana');
  assert.equal((await runNurtureJobs(env,programs)).accepted,0);
  assert.equal(status('f1'),'accepted');
  assert.equal(sends,1);
  assert.equal(raw.prepare("SELECT consent_email FROM leads WHERE id='directo'").get().consent_email,0);
  assert.equal(raw.prepare("SELECT count(*) n FROM jobs WHERE lead_id='directo'").get().n,0);
});
test('Resend conciliado registra aceptación o incidencia y elimina futuros seguimientos ante el rebote',async t=>{
  const {env,raw,lead,signal,status}=fixture();
  lead('rebota');
  await signal('b1','rebota',{intent:'cita'});
  t.mock.method(globalThis,'fetch',async()=>Response.json({id:'reconciliado'}));
  await runNurtureJobs(env,programs);
  assert.equal(await reconcileNurtureEmail(env,{type:'email.delivered',data:{email_id:'reconciliado'}},'e1'),true);
  assert.equal(status('b1'),'accepted');
  assert.equal(await reconcileNurtureEmail(env,{type:'email.bounced',data:{email_id:'reconciliado'}},'e2'),true);
  assert.equal(status('b1'),'failed');
  assert.equal(raw.prepare("SELECT consent_email FROM leads WHERE id='rebota'").get().consent_email,0);
  assert.equal(raw.prepare("SELECT title FROM tasks WHERE lead_id='rebota' AND status='pendiente'").get().title,'Conciliar la respuesta por correo');
  assert.doesNotMatch(raw.prepare('SELECT group_concat(description) AS text FROM events').get().text,/entregad|recibió el correo/i);
});

test('la firma de Resend y DMARC pass permiten la primera respuesta de una consulta directa verificada',async t=>{
  const inbox='admisiones@respuestas.example.edu',secret='clave-de-firma-local';
  const {env,raw}=fixture({RESEND_ADMISSIONS_INBOUND_ADDRESS:inbox,RESEND_RECEIVING_API_KEY:'lectura-de-prueba',
    RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.from(secret).toString('base64')});
  const messages=new Map();
  let accepted=0;
  t.mock.method(globalThis,'fetch',async(address,options)=>{
    const url=new URL(address);
    if(url.pathname.startsWith('/emails/receiving/'))return Response.json(messages.get(url.pathname.split('/').at(-1)));
    assert.equal(url.href,'https://api.resend.com/emails');
    const message=JSON.parse(options.body);
    assert.deepEqual(message.to,['consulta@example.edu']);
    assert.match(message.text,/Fuente de la universidad/);
    assert.match(message.text,/https:\/\/posgrados\.example\.edu\/confirmar\//);
    assert.doesNotMatch(message.text,/direccion-ajena|copia-privada/);
    accepted++;
    return Response.json({id:'test-signed-outbound'});
  });
  async function signedInbound(address,auth,correct=true) {
    const provider=crypto.randomUUID();
    const data={email_id:provider,from:address,to:[inbox],subject:'Consulta sobre maestría'};
    messages.set(provider,{id:provider,from:address,to:[inbox],authentication:auth,
      text:'Quisiera conocer la modalidad y duración de la maestría en Neuropsicología.\n-- \nFirma copia-privada direccion-ajena@example.org'});
    const body=JSON.stringify({type:'email.received',data}),event=crypto.randomUUID(),stamp=String(Math.floor(Date.now()/1000));
    const signature=createHmac('sha256',secret).update(event+'.'+stamp+'.'+body+(correct?'':' ')).digest('base64');
    return serve(new Request(base+'/api/webhooks/resend',{method:'POST',body,headers:{'content-type':'application/json',
      'svix-id':event,'svix-timestamp':stamp,'svix-signature':'v1,'+signature}}),env,()=>'<html></html>');
  }
  assert.equal((await signedInbound('suplantado@example.edu',{dmarc:'pass'},false)).status,403);
  assert.equal((await signedInbound('sin-dmarc@example.edu',{dmarc:'gray',dkim:'pass'})).status,200);
  assert.equal((await signedInbound('consulta@example.edu',{dmarc:'pass'})).status,200);
  assert.equal((await runNurtureJobs(env,programs)).accepted,1);
  assert.equal(accepted,1);
  const one=raw.prepare(`SELECT s.transactional,j.status,l.consent_email FROM conversation_nurture_signals s
    JOIN conversation_nurture_jobs j ON j.signal_id=s.id JOIN leads l ON l.id=s.lead_id`).get();
  assert.deepEqual({...one},{transactional:1,status:'accepted',consent_email:0});
});
