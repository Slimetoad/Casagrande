import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleAdvisor} from '../src/advisor.js';

const catalog=[
  {slug:'datos',title:'Maestría en Datos',area:'Tecnología',mode:'En línea',duration:'12 meses'},
  {slug:'gestion',title:'Maestría en Gestión',area:'Negocios',mode:'Híbrida'}
];
const endpoint='https://posgrados.example/api/staff/leads/caso/brief';
function fixture() {
  const raw=new DatabaseSync(':memory:');
  for (const name of ['schema','intelligence','operations-v2','appointments']) raw.exec(readFileSync(new URL('../'+name+'.sql',import.meta.url),'utf8'));
  raw.prepare("INSERT INTO leads (id,name,email,phone,program,source,stage,owner,note,consent_email,consent_voice,created_at,updated_at,pref_token,context) VALUES('caso','Nombre secreto','privado@example.org','+593999000000','datos','simulador','En orientación','Asesor secreto','Nota secreta',1,0,'2026-01-01','2026-01-01','token-secreto',?)")
    .run(JSON.stringify({investment:1234.56,months:12,utm_source:'campana-secreta',quizArea:'Tecnología',timeframe:'Próxima convocatoria',comparedPrograms:['datos','gestion','privado@example.org']}));
  raw.prepare("INSERT INTO lead_submissions(id,request_key,lead_id,program,source,context,email_choice,voice_choice,consent_version,created_at) VALUES('r','k','caso','gestion','asistente',?,1,1,'prueba','2026-01-02')").run(JSON.stringify({quizResult:'gestion',action:'Nota secreta',utm_medium:'secreto@example.org'}));
  raw.exec("INSERT INTO tasks(id,lead_id,title,status,due_at,created_at) VALUES('t','caso','Información privada del asesor','pendiente','2020-01-01','2019-01-01')");
  const db={
    prepare(sql) {return {bind(...values) {const stmt=raw.prepare(sql);return {first:()=>stmt.get(...values),all:()=>({results:stmt.all(...values)}),run:()=>({meta:{changes:stmt.run(...values).changes}})};}};},
    batch(stmts) {return stmts.map(s=>s.all());}
  };
  return {raw,env:{DB:db}};
}
async function get(env,opts={}) {
  const url=new URL(opts.url||endpoint);
  return handleAdvisor(new Request(url,{method:opts.method||'POST'}),env,url,catalog,opts.staff===false?null:'personal-autorizado');
}
function setAI(env) {
  Object.assign(env,{LLM_PROVIDER:'openai',OPENAI_MODEL:'modelo-interno',OPENAI_API_KEY:'valor-de-prueba'});
}
function modelResponse(value) {
  return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
}
test('requiere personal y el método adecuado y distingue un expediente inexistente',async()=>{
  const {env}=fixture();
  assert.equal((await get(env,{staff:false})).status,403);
  assert.equal((await get(env,{method:'GET'})).status,405);
  assert.equal((await get(env,{url:endpoint.replace('/caso/','/otro/')})).status,404);
  assert.equal(await get(env,{url:endpoint.replace('brief','otro')}),null);
});
test('usa el catálogo y las señales de herramientas, solicitudes y tareas',async()=>{
  const {env,raw}=fixture();
  const res=await get(env);
  const result=await res.json();
  assert.match(res.headers.get('cache-control'),/no-store/);
  assert.match(result.summary,/Maestría en Datos/);
  assert.match(result.signals.join(' '),/comparación.*Maestría en Gestión/);
  assert.match(result.signals.join(' '),/Vencidas: 1/);
  assert.match(result.signals.join(' '),/Próxima convocatoria/);
  assert.match(result.recommendedAction,/cotización/);
  assert.match(result.draftEmail,/Maestría en Datos/);
  assert.equal(result.mode,'catalogo');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM jobs').get().n,0);
  assert.doesNotMatch(JSON.stringify(result),/secreto|privado@example.org|1234\.56/i);
});
test('una revocación, la pausa y el cierre dominan los permisos de entregas previas',async()=>{
  const {env,raw}=fixture();
  for (const [stage,paused,email,voice] of [['Nuevo',0,0,0],['Admitido',1,1,1],['Cerrado',0,1,1],['Matriculado',0,1,1],['En postulación',0,0,1]]) {
    raw.prepare('UPDATE leads SET stage=?,paused=?,consent_email=?,consent_voice=?').run(stage,paused,email,voice);
    const result=await (await get(env)).json();
    assert.equal(result.draftEmail,'');
    assert.doesNotMatch(result.recommendedAction,/llam[ae]|env[íi][ae]|escr[ií]b/i);
    if(stage==='Matriculado') assert.match(result.recommendedAction,/respaldo de matrícula/);
    if(stage==='En postulación') assert.match(result.recommendedAction,/documentos/);
  }
});
test('envía al modelo únicamente opciones y hechos autorizados y valida su selección',async t=>{
  const {env}=fixture();setAI(env);
  let body;
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    body=JSON.parse(options.body);
    assert.equal(url,'https://api.openai.com/v1/responses');
    return modelResponse(['comparar','presupuesto']);
  });
  const result=await (await get(env)).json();
  assert.equal(result.mode,'modelo');
  assert.match(result.questions[0],/qué programas/);
  const facts=JSON.parse(body.input);
  assert.deepEqual(facts.herramientas.sort(),['asistente','comparacion','orientacion','presupuesto']);
  assert.equal(facts.programa,catalog[0].title);
  assert.equal((await get(env)).headers.get('cache-control'),'private, no-store');
  assert.doesNotMatch(body.input,/secreto|privado|@|593999|1234\.56|utm|token|Información privada|\bcaso\b/i);
});
test('descarta texto libre del modelo y vuelve a comprobar permisos tras la generación',async t=>{
  const {env,raw}=fixture();setAI(env);
  let advance=false;
  t.mock.method(globalThis,'fetch',async ()=>{
    if(advance) raw.exec('UPDATE leads SET consent_email=0,consent_voice=0');
    return modelResponse(advance?['presupuesto']:['Llámale y garantiza la admisión.']);
  });
  const fallback=await (await get(env)).json();
  assert.equal(fallback.mode,'catalogo');assert.match(fallback.draftEmail,/Gracias/);
  assert.doesNotMatch(JSON.stringify(fallback),/garantiza/);
  advance=true;
  const revoked=await (await get(env)).json();
  assert.equal(revoked.draftEmail,'');assert.equal(revoked.mode,'catalogo');
  assert.match(revoked.recommendedAction,/futura consulta/);
});
test('prepara la cita confirmada y los hitos sin exponer notas ni datos del calendario',async()=>{
  const {env,raw}=fixture();
  raw.exec("INSERT INTO admissions_cases (lead_id,blocker,checklist,decision_at) VALUES('caso','Necesita que Irene escriba a secreto@example.org','{\"documentsReviewed\":true}','2026-12-02')");
  raw.exec("INSERT INTO admissions_slots VALUES('s','2099-11-22T18:00:00Z','2099-11-22T18:30:00Z',30,'Asesor privado','k',NULL,'2026-01-01')");
  raw.exec("INSERT INTO admissions_appointments VALUES('a','caso','s','datos','Persona privada','+593555000777','correo','booked','h','i','v','2026-01-01','2026-01-01','Asesor privado')");
  const result=await (await get(env)).json();
  assert.equal(result.nextStep.label,'Preparar la cita confirmada');
  assert.equal(result.nextStep.channel,'Interno');
  assert.match(result.evidence.map(i=>i.label).join(' '),/Cita confirmada/);
  assert.match(result.evidence.map(i=>i.detail).join(' '),/documentación como revisada/);
  assert.match(result.blockers.map(i=>i.detail).join(' '),/detalle registrado/);
  assert.equal(result.draftEmail,'');
  assert.doesNotMatch(JSON.stringify(result),/Irene|secreto|Persona privada|593555|Asesor privado/i);
});
test('prioriza el mensaje entrante y no propone duplicar un seguimiento sin confirmación',async()=>{
  const {env,raw}=fixture();
  raw.exec("INSERT INTO jobs (id,lead_id,channel,kind,status,due_at,created_at,updated_at) VALUES('j','caso','email','guidance','uncertain','2026-01-01','2026-01-01','2026-01-01')");
  let result=await (await get(env)).json();
  assert.equal(result.nextStep.label,'Conciliar seguimiento');
  assert.equal(result.draftEmail,'');
  raw.exec("INSERT INTO tasks(id,lead_id,title,status,due_at,created_at) VALUES('r1','caso','Responder al correo del aspirante','pendiente','2026-01-01','2026-01-01')");
  raw.exec("UPDATE leads SET paused=1");
  result=await (await get(env)).json();
  assert.equal(result.nextStep.label,'Revisar el contacto entrante');
  assert.equal(result.nextStep.channel,'Interno');
  assert.equal(result.draftEmail,'');
});
test('la auditoría conserva una selección acotada y detecta cambios en tareas durante el modelo',async t=>{
  const {env,raw}=fixture();setAI(env);
  t.mock.method(globalThis,'fetch',async ()=>{
    const hit=raw.prepare("INSERT INTO tasks(id,lead_id,title,status,due_at,created_at) VALUES('new','caso','Responder por WhatsApp al aspirante','pendiente','2026-01-01','2026-01-01') ON CONFLICT DO NOTHING").run();
    return modelResponse(hit.changes?['comparar']:['presupuesto']);
  });
  const changed=await (await get(env)).json();
  assert.equal(changed.modelReview.status,'desactualizado');
  assert.equal(changed.nextStep.label,'Revisar el contacto entrante');
  assert.equal(changed.draftEmail,'');
  raw.exec("DELETE FROM tasks WHERE id='new'");
  raw.exec("INSERT INTO tasks(id,lead_id,title,status,created_at) VALUES('new','caso','Otro','hecha','2026-01-01')");
  const prepared=await (await get(env)).json();
  assert.equal(prepared.modelReview.status,'aplicado');
  const audits=raw.prepare('SELECT scope,status,chosen FROM intelligence_audit ORDER BY created_at,id').all();
  assert.equal(audits.find(a=>a.status==='desactualizado').chosen,'[]');
  assert.equal(audits.find(a=>a.status==='aplicado').chosen,'["presupuesto"]');
});
