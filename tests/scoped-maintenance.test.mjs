import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {programs as catalog} from '../src/catalog.js';
import {handleMaintenance,handleScopedMaintenance} from '../src/maintenance.js';
import {recordNurtureSignal} from '../src/conversation-nurture.js';

const programs=catalog.slice(0,3);
const origin='https://prueba.example.edu';
const token='servicio-pruebas-local';
const diagnostics='detalle privado del proveedor';

function fixture(overrides={}){
  const raw=new DatabaseSync(':memory:');
  const dir=new URL('../drizzle/',import.meta.url);
  for(const file of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)).sort())
    raw.exec(readFileSync(new URL(file,dir),'utf8'));
  class Statement {
    constructor(sql,args=[]){this.sql=sql;this.args=args;}
    bind(...args){return new Statement(this.sql,args);}
    first(){return raw.prepare(this.sql).get(...this.args)||null;}
    all(){return {results:raw.prepare(this.sql).all(...this.args)};}
    run(){const stmt=raw.prepare(this.sql);return stmt.columns().length?this.all():{meta:{changes:stmt.run(...this.args).changes}};}
  }
  const DB={prepare:sql=>new Statement(sql),batch(queries){
    raw.exec('BEGIN');
    try{const result=queries.map(query=>query.run());raw.exec('COMMIT');return result;}
    catch(error){raw.exec('ROLLBACK');throw error;}
  }};
  return {raw,env:{DB,MAINTENANCE_TOKEN:token,PUBLIC_BASE_URL:origin,...overrides}};
}

const call=(env,scope,method='POST',authorized=true)=>handleScopedMaintenance(
  new Request(origin+'/api/maintenance/'+scope,{method,headers:authorized?{'X-UCG-Mantenimiento':token}:{}}),env,programs,scope
);

test('mantenimiento editorial prepara el plan sin OpenSEO, conserva captación y consulta solo su historial',async t=>{
  const {env,raw}=fixture({OUTREACH_ENABLED:'true',RESEND_API_KEY:'local',RESEND_FROM:'respuestas@example.edu'});
  const expired='2001-01-01T00:00:00.000Z';
  const now=new Date().toISOString();
  raw.prepare('INSERT INTO traffic_limits(id,hour,hits) VALUES(?,0,1)').run('expirado');
  raw.prepare('INSERT INTO growth_limits(bucket,count,expires) VALUES(?,1,?)').run('expirado',expired);
  raw.prepare("INSERT INTO background_runs(kind,slot,state,started_at) VALUES('nuevos_seguimiento','prueba','completado',?)").run(now);
  t.mock.method(globalThis,'fetch',()=>assert.fail('La planificación local no debe contactar a un proveedor'));
  assert.equal((await call(env,'editorial','GET',false)).status,403);
  assert.equal((await call(env,'editorial','POST',false)).status,403);
  const response=await call(env,'editorial');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.procesos.map(row=>[row.kind,row.estado]),[
    ['editorial_openseo','sin_configurar'],['editorial_publicacion','completado'],
    ['editorial_captacion','completado'],['editorial_limpieza','completado']
  ]);
  assert.equal(body.procesos[2].resumen.measured,0);
  assert.equal(body.procesos[3].resumen.removed,2);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM seo_editorial_plan').get().n,programs.length);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM seo_articles').get().n,0);
  const repeated=await (await call(env,'editorial')).json();
  assert.ok(repeated.procesos.every(run=>run.estado==='ya_procesado'));
  const before=raw.prepare('SELECT total_changes() n').get().n;
  const view=await (await call(env,'editorial','GET')).json();
  assert.equal(view.ejecuciones.length,4);
  assert.ok(view.ejecuciones.every(run=>run.kind.startsWith('editorial_')));
  assert.equal(raw.prepare('SELECT total_changes() n').get().n,before);
});

test('un fallo en la tarea OpenSEO se registra por separado y el motor editorial completa el plan',async t=>{
  const {env,raw}=fixture({OPENSEO_API_KEY:'simulada-local'});
  const prepare=env.DB.prepare;
  env.DB.prepare=sql=>{
    if(sql.startsWith('INSERT INTO openseo_runtime'))throw new Error(diagnostics);
    return prepare(sql);
  };
  t.mock.method(globalThis,'fetch',()=>assert.fail('La simulación falla antes de usar la red'));
  const response=await call(env,'editorial');
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.procesos.find(run=>run.kind==='editorial_openseo').estado,'error');
  assert.equal(body.procesos.find(run=>run.kind==='editorial_publicacion').estado,'completado');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM seo_editorial_plan').get().n,programs.length);
  assert.doesNotMatch(JSON.stringify(body),/detalle privado/);
  assert.doesNotMatch(JSON.stringify(raw.prepare('SELECT * FROM background_runs').all()),/detalle privado/);
});

test('el ciclo publica una sola guía con varias vencidas y mide campañas una vez al día',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-23T17:30:00Z')});
  const {env,raw}=fixture();
  t.mock.method(globalThis,'fetch',()=>assert.fail('La prueba usa el catálogo local aprobado'));
  assert.equal((await call(env,'editorial')).status,200);
  const due=new Date(Date.now()-60000).toISOString();
  raw.prepare('UPDATE seo_editorial_plan SET scheduled_at=?').run(due);
  env.SEO_EDITORIAL_AUTOPUBLISH='true';
  t.mock.timers.tick(60*60*1000);
  const response=await call(env,'editorial');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.procesos.find(row=>row.kind==='editorial_publicacion').resumen.publishedPortal,1);
  assert.equal(result.procesos.find(row=>row.kind==='editorial_captacion').estado,'ya_procesado');
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM seo_articles WHERE status='published'").get().n,1);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM seo_editorial_plan WHERE status='planned'").get().n,programs.length-1);
});

test('trabajos nuevos exige inicio con zona horaria y solo procesa las dos colas posteriores al corte',async t=>{
  const {env,raw}=fixture({OUTREACH_ENABLED:'true',RESEND_API_KEY:'local',RESEND_FROM:'respuestas@example.edu'});
  const point=Date.now(),past=new Date(point-7200000).toISOString(),start=new Date(point-3600000).toISOString(),due=new Date(point-1000).toISOString();
  for(const id of ['correo-anterior','correo-nuevo','conversacion-anterior','conversacion-nueva']){
    raw.prepare("INSERT INTO leads(id,name,email,program,source,created_at,updated_at,pref_token,consent_email) VALUES(?,'Nombre de prueba',?,?,'portal',?,?,?,1)").run(id,id+'@example.edu',programs[0].slug,past,due,id);
  }
  const add=raw.prepare("INSERT INTO jobs(id,lead_id,channel,kind,status,due_at,created_at,updated_at) VALUES(?,?,'email','welcome','pending',?,?,?)");
  add.run('job-anterior','correo-anterior',due,past,due);
  add.run('job-nuevo','correo-nuevo',due,start,due);
  for(const id of ['conversacion-anterior','conversacion-nueva'])
    await recordNurtureSignal(env,{id,leadId:id,channel:'email',receivedAt:due,extraction:{intent:'inversion',confidence:'alta',needsReview:false,program:programs[0].slug}});
  raw.prepare("UPDATE conversation_nurture_signals SET recorded_at=? WHERE id='conversacion-anterior'").run(past);
  raw.prepare("UPDATE conversation_nurture_signals SET recorded_at=? WHERE id='conversacion-nueva'").run(start);
  const sent=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'https://api.resend.com/emails');
    sent.push(...JSON.parse(options.body).to);
    return Response.json({id:'resend-local-'+sent.length});
  });
  assert.equal((await call(env,'nuevos')).status,409);
  env.OUTREACH_START_AT='2026-02-30T14:00:00Z';
  assert.equal((await call(env,'nuevos')).status,409);
  assert.equal(sent.length,0);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM background_runs').get().n,0);
  env.OUTREACH_START_AT=start;
  const response=await call(env,'nuevos');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.inicio,start);
  assert.deepEqual(result.procesos.map(run=>[run.kind,run.resumen.accepted]),[['nuevos_seguimiento',1],['nuevos_conversaciones',1]]);
  assert.deepEqual(sent.sort(),['conversacion-nueva@example.edu','correo-nuevo@example.edu']);
  const pending=raw.prepare("SELECT status,attempts FROM jobs WHERE id='job-anterior' UNION ALL SELECT status,attempts FROM conversation_nurture_jobs WHERE signal_id='conversacion-anterior'").all();
  assert.ok(pending.every(row=>row.status==='pending'&&row.attempts===0));
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM background_runs WHERE kind LIKE 'editorial_%'").get().n,0);
  const previous=await handleMaintenance(new Request(origin+'/api/maintenance',{method:'POST',headers:{'X-UCG-Mantenimiento':token}}),env);
  assert.equal(previous.status,410);
  assert.deepEqual((await previous.json()).rutas,['/api/maintenance/editorial','/api/maintenance/nuevos']);
  assert.equal(sent.length,2);
});
