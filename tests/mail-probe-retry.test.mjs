import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleMailCheck} from '../src/mail-loopback.js';

const origin='https://pruebas.example.edu';
const path='/api/maintenance/correo/prueba';
const token='credencial-sintetica';
const sender='Orientación <posgrados@example.edu>';
const inbox='posgrados@example.edu';
const expectedDiagnostic={phase:'envio',httpStatus:null,code:'transport_error'};
const minute=60000;

function fixture(){
  const raw=new DatabaseSync(':memory:');
  for(const name of ['operations.sql','mail-probe-v3.sql'])raw.exec(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
  class Query {
    constructor(sql,values=[]){this.sql=sql;this.values=values;}
    bind(...values){return new Query(this.sql,values);}
    first(){return raw.prepare(this.sql).get(...this.values)||null;}
    all(){return {results:raw.prepare(this.sql).all(...this.values)};}
    run(){const stmt=raw.prepare(this.sql);return stmt.columns().length?this.all():{meta:{changes:stmt.run(...this.values).changes}};}
  }
  const DB={
    prepare:q=>new Query(q),
    batch(items){
      raw.exec('BEGIN');
      try{const results=items.map(item=>item.run());raw.exec('COMMIT');return results;}
      catch(error){raw.exec('ROLLBACK');throw error;}
    }
  };
  return {raw,env:{DB,PUBLIC_BASE_URL:origin,MAINTENANCE_TOKEN:token,RESEND_FROM:sender,
    RESEND_ADMISSIONS_INBOUND_ADDRESS:inbox,RESEND_API_KEY:'prueba',RESEND_WEBHOOK_SECRET:'simulada'}};
}

function post(env,params='',authorized=true){
  return handleMailCheck(new Request(origin+path+params,{
    method:'POST',headers:authorized?{'X-UCG-Mantenimiento':token}:{}
  }),env);
}

function seed(raw,{age=minute,diagnostic=expectedDiagnostic,state='por_conciliar',outboundId=null,read=false}={}){
  const id=crypto.randomUUID(),created=new Date(Date.now()-age).toISOString();
  raw.prepare('INSERT INTO admissions_mail_probes(id,requested_at,state,outbound_id,received_at) VALUES(?,?,?,?,?)')
    .run(id,created,state,outboundId,read?created:null);
  raw.prepare("INSERT INTO background_runs(kind,slot,state,started_at,result) VALUES('sonda_correo',?,'error',?,?)")
    .run(id,created,JSON.stringify(diagnostic));
  return id;
}

test('la sonda histórica reserva un solo reintento y conserva destinatario, contenido y clave',async t=>{
  const {env,raw}=fixture(), id=seed(raw), query='?reintentar='+id;
  let resolveStarted,resolveFetch;
  const started=new Promise(resolve=>{resolveStarted=resolve;});
  const waitFetch=new Promise(resolve=>{resolveFetch=resolve;});
  const calls=[];
  const outboundId=crypto.randomUUID();
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    calls.push({url,opts});
    resolveStarted();
    await waitFetch;
    return Response.json({id:outboundId});
  });
  assert.equal((await post(env,query,false)).status,403);
  const first=post(env,query);
  await started;
  try {
    const duplicate=await post(env,query);
    assert.equal(duplicate.status,429);
  } finally { resolveFetch(); }
  const confirmation=await first;
  assert.equal(confirmation.status,201);
  const {probe}=await confirmation.json();
  assert.equal(probe.id,id);
  assert.equal(probe.state,'aceptada');
  assert.equal(probe.issue,null);
  const repeated=await post(env,query);
  assert.equal(repeated.status,200);
  assert.deepEqual((await repeated.json()).probe,probe);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.resend.com/emails');
  assert.equal(calls[0].opts.redirect,'manual');
  assert.equal(calls[0].opts.headers['Idempotency-Key'],'ucg-prueba-'+id);
  assert.deepEqual(JSON.parse(calls[0].opts.body),{
    from:sender,to:['posgrados+prueba@example.edu'],subject:'Prueba técnica del correo de posgrados · '+id,
    text:'Verificación interna de recepción de posgrados. Referencia '+id+'.',tags:[{name:'flujo',value:'prueba-tecnica-ucg'}]
  });
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM admissions_mail_probes').get().n,1);
  const claim=raw.prepare("SELECT state,result FROM background_runs WHERE kind='sonda_correo_reintento' AND slot=?").get(id);
  assert.equal(claim.state,'completado');
  assert.match(claim.result,/^[a-f0-9]{64}$/);
  assert.equal(raw.prepare("SELECT result FROM background_runs WHERE kind='sonda_correo' AND slot=?").get(id).result,JSON.stringify(expectedDiagnostic));
});

test('una sonda nueva fija los mismos bytes y limita los reintentos fallidos a uno cada diez minutos',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-23T15:00:00Z')});
  const {env,raw}=fixture(),calls=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    calls.push([url,opts.body,opts.headers['Idempotency-Key']]);
    if(calls.length<3)throw new TypeError('Mensaje privado de la conexión');
    return Response.json({id:crypto.randomUUID()});
  });
  const original=await post(env);
  assert.equal(original.status,502);
  const {id}=await original.json(),query='?reintentar='+id;
  const changed={...env,RESEND_ADMISSIONS_INBOUND_ADDRESS:'otro@example.edu'};
  assert.equal((await post(changed,query)).status,409);
  assert.equal(calls.length,1);
  assert.equal((await post(env,query)).status,502);
  assert.equal((await post(env,query)).status,429);
  t.mock.timers.tick(10*minute-1);
  assert.equal((await post(env,query)).status,429);
  t.mock.timers.tick(1);
  assert.equal((await post(env,query)).status,201);
  assert.equal(calls.length,3);
  assert.ok(calls.every(call=>JSON.stringify(call)===JSON.stringify(calls[0])));
  const originalFingerprint=raw.prepare("SELECT result FROM background_runs WHERE kind='sonda_correo_payload' AND slot=?").get(id);
  const retryFingerprint=raw.prepare("SELECT result FROM background_runs WHERE kind='sonda_correo_reintento' AND slot=?").get(id);
  assert.equal(originalFingerprint.result,retryFingerprint.result);
  assert.doesNotMatch(JSON.stringify(raw.prepare('SELECT * FROM background_runs').all()),/example\.edu|Mensaje privado/);
});

test('rechaza reintentos que no corresponden al mismo fallo y evita llamadas para sondas verificadas',async t=>{
  const {env,raw}=fixture();
  t.mock.method(globalThis,'fetch',()=>assert.fail('Una sonda no elegible no debe llamar a Resend'));
  const disallowed=[
    seed(raw,{age:12*60*minute}),
    seed(raw,{diagnostic:{phase:'lectura',httpStatus:null,code:'transport_error'}}),
    seed(raw,{diagnostic:{phase:'envio',httpStatus:502,code:'http_error'}}),
    seed(raw,{diagnostic:{phase:'envio',httpStatus:null,code:'timeout'}}),
    seed(raw,{state:'preparada'})
  ];
  for(const id of disallowed)assert.equal((await post(env,'?reintentar='+id)).status,409);
  const verified=seed(raw,{state:'verificada',read:true}),accepted=seed(raw,{state:'aceptada',outboundId:crypto.randomUUID()});
  for(const id of [verified,accepted]){
    const response=await post(env,'?reintentar='+id);
    assert.equal(response.status,200);
    assert.equal((await response.json()).probe.accepted,true);
  }
  assert.equal((await post(env,'?reintentar=')).status,400);
  assert.equal((await post(env,'?reintentar='+verified+'&reintentar='+accepted)).status,400);
  assert.equal((await post(env,'?reintentar='+crypto.randomUUID())).status,404);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM background_runs WHERE kind='sonda_correo_reintento'").get().n,0);
});
