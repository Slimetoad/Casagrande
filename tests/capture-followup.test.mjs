import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {followupOnCapture} from '../src/capture-followup.js';
import {programs} from '../src/catalog.js';
import {runDueJobs} from '../src/integrations.js';
import {serve} from '../src/portal.js';

const origin='https://admisiones.example.edu';
const emailOption={consentEmail:true};
function fixture(settings={}) {
  const raw=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())
    raw.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  class Query {
    constructor(sql,args=[]) {this.sql=sql;this.args=args;}
    bind(...args) {return new Query(this.sql,args);}
    first() {return raw.prepare(this.sql).get(...this.args)||null;}
    all() {return {results:raw.prepare(this.sql).all(...this.args)};}
    run() {const stmt=raw.prepare(this.sql);return stmt.columns().length?this.all():{meta:{changes:stmt.run(...this.args).changes}};}
  }
  const env={DB:{prepare:sql=>new Query(sql),batch(queries){
    raw.exec('BEGIN');
    try {const result=queries.map(q=>q.run());raw.exec('COMMIT');return result;}
    catch(error) {raw.exec('ROLLBACK');throw error;}
  }},PUBLIC_BASE_URL:origin,OUTREACH_ENABLED:'true',RESEND_API_KEY:'clave-local',RESEND_FROM:'Admisiones <posgrados@example.edu>',...settings};
  const waits=[],ctx={waitUntil(task){waits.push(task);}};
  const wake=followupOnCapture(env,ctx,programs);
  return {raw,env,ctx,wake,waits};
}
function capture(env,email,options={},wake) {
  return serve(new Request(origin+'/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    name:'Aspirante de prueba',email,program:programs[0].slug,source:'programa',...options
  })}),env,()=>'',wake);
}
test('responde al formulario mientras waitUntil tramita la primera bienvenida autorizada',async t=>{
  const {env,wake,waits,raw}=fixture();
  const reply=Promise.withResolvers(),started=Promise.withResolvers();
  let sent=0;
  t.mock.method(globalThis,'fetch',async(url,req)=>{
    assert.equal(url,'https://api.resend.com/emails');
    assert.deepEqual(JSON.parse(req.body).to,['nuevo@example.edu']);
    sent++;started.resolve();
    return reply.promise;
  });
  const submitted=await capture(env,'nuevo@example.edu',emailOption,wake);
  assert.equal(submitted.status,201);
  assert.equal(waits.length,1);
  await started.promise;
  assert.equal(raw.prepare("SELECT status FROM jobs WHERE kind='welcome'").get().status,'processing');
  assert.deepEqual(await submitted.json(),{ok:true,message:'Recibimos tu solicitud. El equipo de admisiones podrá revisar tu consulta.'});
  reply.resolve(Response.json({id:'bienvenida-test'}));
  await waits[0];
  assert.equal(sent,1);
  assert.equal(raw.prepare("SELECT status FROM jobs WHERE kind='welcome'").get().status,'sent');
  assert.equal(raw.prepare("SELECT status FROM jobs WHERE kind='guidance'").get().status,'pending');
  assert.equal(raw.prepare("SELECT state FROM background_runs WHERE kind='seguimiento_captura'").get().state,'completado');
});
test('la cola inmediata se mantiene pausada por configuración, duplicados y canales sin bienvenida habilitada',async t=>{
  const {env,ctx,wake,waits,raw}=fixture();
  t.mock.method(globalThis,'fetch',()=>assert.fail('El flujo no debe llamar al proveedor'));
  assert.equal(followupOnCapture({...env,OUTREACH_ENABLED:'false'},ctx,programs),undefined);
  assert.equal(followupOnCapture({...env,RESEND_API_KEY:''},ctx,programs),undefined);
  await capture(env,'existente@example.edu');
  assert.equal((await capture(env,'existente@example.edu',emailOption,wake)).status,201);
  assert.equal((await capture(env,'sin-permiso@example.edu',{},wake)).status,201);
  assert.equal((await capture(env,'solo-voz@example.edu',{phone:'0991234567',consentVoice:true},wake)).status,201);
  assert.equal(waits.length,0);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM jobs WHERE channel='voice' AND status='pending'").get().n,1);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM background_runs').get().n,0);
});
test('limita el lote concurrente y deja que el ciclo normal atienda el remanente',async t=>{
  const {env,wake,waits,raw}=fixture({OUTREACH_BATCH_SIZE:'30'});
  for(let i=0;i<4;i++)await capture(env,'cola'+i+'@example.edu',emailOption);
  const release=Promise.withResolvers(),started=Promise.withResolvers();
  let sent=0;
  t.mock.method(globalThis,'fetch',async()=>{
    const id=++sent;started.resolve();await release.promise;
    return Response.json({id:'bienvenida-'+id});
  });
  assert.equal((await capture(env,'nuevo-a@example.edu',emailOption,wake)).status,201);
  await started.promise;
  assert.equal((await capture(env,'nuevo-b@example.edu',emailOption,wake)).status,201);
  await waits[1];
  release.resolve();
  await waits[0];
  assert.equal(sent,3);
  assert.equal((await capture(env,'nuevo-c@example.edu',emailOption,wake)).status,201);
  await waits[2];
  assert.equal(sent,3);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM background_runs WHERE kind='seguimiento_captura'").get().n,1);
  assert.equal((await runDueJobs(env,programs)).accepted,4);
  assert.equal(sent,7);
});
test('el despachador vuelve a revisar los permisos antes de contactar al aspirante',async t=>{
  const {env,wake,waits,raw}=fixture();
  t.mock.method(globalThis,'fetch',()=>assert.fail('Se retiró la autorización antes del despacho'));
  const response=await capture(env,'revocado@example.edu',emailOption,channels=>{
    raw.prepare("UPDATE leads SET consent_email=0 WHERE email='revocado@example.edu'").run();
    wake(channels);
  });
  assert.equal(response.status,201);
  await waits[0];
  assert.equal(raw.prepare("SELECT status FROM jobs WHERE kind='welcome'").get().status,'skipped');
});
test('WhatsApp exige autorización y bienvenida habilitada por separado',async t=>{
  const {env,ctx,wake,waits,raw}=fixture({RESEND_API_KEY:'',OUTREACH_WHATSAPP_ENABLED:'true',
    WHATSAPP_APP_SECRET:'prueba',WHATSAPP_VERIFY_TOKEN:'prueba',WHATSAPP_PHONE_NUMBER_ID:'123',
    WHATSAPP_BUSINESS_ACCOUNT_ID:'456',WHATSAPP_ACCESS_TOKEN:'prueba',WHATSAPP_GRAPH_VERSION:'v27.0',
    WHATSAPP_TEMPLATE_WELCOME:'bienvenida_ucg',WHATSAPP_TEMPLATE_GUIDANCE:'orientacion_ucg'});
  assert.equal(followupOnCapture({...env,OUTREACH_WHATSAPP_ENABLED:'false'},ctx,programs),undefined);
  assert.equal(followupOnCapture({...env,WHATSAPP_TEMPLATE_WELCOME:''},ctx,programs),undefined);
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;
    assert.equal(url,'https://graph.facebook.com/v27.0/123/messages');
    assert.equal(JSON.parse(options.body).template.name,'bienvenida_ucg');
    return Response.json({messages:[{id:'wamid-prueba'}]});
  });
  assert.equal((await capture(env,'sin-whatsapp@example.edu',{phone:'0991122334'},wake)).status,201);
  assert.equal(waits.length,0);
  assert.equal((await capture(env,'con-whatsapp@example.edu',{consentWhatsapp:true,phone:'0991234567'},wake)).status,201);
  await waits[0];
  assert.equal(calls,1);
  assert.equal(raw.prepare("SELECT status FROM whatsapp_jobs WHERE kind='welcome'").get().status,'sent');
});
