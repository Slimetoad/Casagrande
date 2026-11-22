import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAdmissions } from '../src/admissions.js';

const programs = [{slug:'ejemplo',title:'Maestría de ejemplo'}];
const contact = {name:'Persona de prueba',email:'aspirante@example.org',phone:'0991234000',program:'ejemplo',source:'cita',consentEmail:true};
const operator = 'asesora@example.org';
const root = '/api/staff/workspace';
const origin = 'https://posgrados.example.org';

function testDatabase() {
  const raw = new DatabaseSync(':memory:');
  const schema = file => raw.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  schema('schema.sql');
  schema('growth.sql');
  class Statement {
    constructor(sql,values=[]) { this.query = raw.prepare(sql); this.values = values; this.sql = sql; }
    bind(...values) { return new Statement(this.sql,values); }
    first() { return this.query.get(...this.values) || null; }
    all() { return {results:this.query.all(...this.values)}; }
    run() { return this.execute(); }
    execute() {
      return this.query.columns().length ? this.all() : {results:[],meta:{changes:this.query.run(...this.values).changes}};
    }
  }
  return {
    raw,
    migrate() {schema('operations-v2.sql');},
    prepare(sql) {return new Statement(sql);},
    async batch(queries) {
      raw.exec('BEGIN');
      try { const r = queries.map(q=>q.execute()); raw.exec('COMMIT'); return r; }
      catch(error) {raw.exec('ROLLBACK'); throw error;}
    }
  };
}
function call(db,path,{input,auth=null,method=input===undefined?'GET':'POST',headers={}}={}) {
  const url = new URL(path,origin);
  const request = new Request(url,{
    method,headers:{'content-type':'application/json',...headers},
    body:input===undefined ? undefined : typeof input==='string' ? input : JSON.stringify(input)
  });
  return handleAdmissions(request,{DB:db},url,programs,auth);
}
const staff = (db,path,input,method) => call(db,path,{input,auth:operator,method});
const capture = (db,input={}) => call(db,'/api/leads',{input:{...contact,...input}});
const lead = db => db.raw.prepare('SELECT * FROM leads ORDER BY created_at,id').get();

test('la autorización separada, suprimida por número, no hereda llamadas ni se reactiva con reintentos', async()=>{
  const db=testDatabase();
  db.migrate();
  assert.equal((await capture(db,{consentVoice:true})).status,201);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM whatsapp_jobs').get().n,0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM whatsapp_consents').get().n,0);
  const wa={email:'whatsapp@example.org',phone:'(+593) 99 234 5000',consentWhatsapp:true,consentVoice:false};
  assert.equal((await capture(db,{...wa,phone:''})).status,422);
  for (let i=0;i<2;i++) assert.equal((await capture(db,wa)).status,201);
  const row=db.raw.prepare("SELECT * FROM leads WHERE email='whatsapp@example.org'").get();
  const c=db.raw.prepare('SELECT * FROM whatsapp_consents').get();
  assert.deepEqual([c.lead_id,c.phone,c.state],[row.id,'+593992345000','granted']);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM whatsapp_jobs WHERE status='pending'").get().n,2);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE lead_id=? AND channel='voice'").get(row.id).n,0);
  const before=await (await staff(db,root+'/'+row.id)).json();
  assert.equal(before.student.consentWhatsapp,true);
  assert.equal(before.jobs.filter(j=>j.channel==='whatsapp').length,2);

  const unsubscribe='/api/preferences/'+row.pref_token;
  assert.equal((await call(db,unsubscribe,{method:'POST'})).status,200);
  assert.equal(db.raw.prepare('SELECT state FROM whatsapp_consents').get().state,'granted');
  const prefs='/preferencias/'+row.pref_token;
  assert.match(await (await call(db,prefs)).text(),/name="whatsapp" value="1" checked/);
  assert.equal((await call(db,prefs,{method:'POST',input:'',headers:{'content-type':'application/x-www-form-urlencoded'}})).status,200);
  assert.equal(db.raw.prepare('SELECT state FROM whatsapp_consents').get().state,'revoked');
  assert.equal(db.raw.prepare('SELECT phone FROM whatsapp_suppressions').get().phone,'+593992345000');
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM whatsapp_jobs WHERE status='skipped'").get().n,2);
  assert.equal((await capture(db,{...wa,email:'nuevo@example.org'})).status,201);
  assert.equal((await capture(db,{...wa,source:'financiamiento'})).status,201);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM whatsapp_consents WHERE state='granted'").get().n,0);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM whatsapp_jobs WHERE status='pending'").get().n,0);
});

test('WhatsApp cancela trabajos cuando cambia el contacto, se comparte su número o cambia la etapa', async()=>{
  const db=testDatabase();
  db.migrate();
  await capture(db,{consentWhatsapp:true});
  const record=lead(db), path=root+'/'+record.id;
  const upcoming=()=>db.raw.prepare("SELECT kind FROM whatsapp_jobs WHERE status='pending' ORDER BY kind").all().map(r=>r.kind);
  const save=async input=>{
    const rev=db.raw.prepare('SELECT revision FROM leads WHERE id=?').get(record.id).revision;
    return staff(db,path,{...input,revision:rev},'PATCH');
  };
  assert.deepEqual(upcoming(),['guidance','welcome']);
  assert.equal((await save({paused:true})).status,200);
  assert.deepEqual(upcoming(),[]);
  assert.equal((await save({paused:false})).status,200);
  assert.deepEqual(upcoming(),['guidance','welcome']);
  assert.equal((await save({stage:'En postulación'})).status,200);
  assert.deepEqual(upcoming(),['application']);
  assert.equal((await save({stage:'Admitido',evidence:'ACTA-133',paused:true})).status,200);
  assert.deepEqual(upcoming(),[]);
  assert.equal((await save({paused:false})).status,200);
  assert.deepEqual(upcoming(),['admission']);
  db.raw.prepare("UPDATE leads SET phone='+593992222222' WHERE id=?").run(record.id);
  assert.deepEqual(upcoming(),[]);
  assert.equal((await (await staff(db,path)).json()).student.consentWhatsapp,false);

  const other={email:'otro@example.org',phone:'0981111222',consentWhatsapp:true};
  await capture(db,other);
  assert.deepEqual(upcoming(),['guidance','welcome']);
  await capture(db,{...other,email:'tercero@example.org',consentWhatsapp:false});
  assert.deepEqual(upcoming(),[]);
});

test('el embudo exige referencias, registra el resultado real y mantiene el historial al reabrir', async()=>{
  const db=testDatabase();
  db.migrate();
  await capture(db);
  const record=lead(db), path=root+'/'+record.id;
  const detail=async()=> (await staff(db,path)).json();
  const save=async input=> staff(db,path,{revision:(await detail()).case.revision,...input},'PATCH');
  assert.equal((await call(db,root)).status,403);
  assert.equal((await save({stage:'Admitido',evidence:'ACTA-133'})).status,422);
  assert.equal((await staff(db,'/api/staff/leads/'+record.id,{stage:'Matriculado'})).status,422);
  const due=new Date(Date.now()-86400000).toISOString();
  const edited=await save({owner:'Asesora',nextAction:'Enviar los horarios por correo',dueAt:due,blocker:'Horario sin definir',decisionAt:due,checklist:{contacted:true}});
  assert.equal(edited.status,200,JSON.stringify(await edited.clone().json()));
  const b=await (await staff(db,root+'?queue=blocked')).json();
  assert.equal(b.total,1);
  assert.equal(b.queue[0].blockers[0].label,'Horario sin definir');
  assert.equal(b.queue[0].checklist.find(c=>c.key==='contacted').done,true);
  assert.equal(b.metrics.overdue,1);
  assert.equal(b.metrics.needsDecision,1);
  assert.equal(b.queue[0].case.owner,'Asesora');
  const old=(await detail()).case.revision;
  assert.equal((await save({stage:'En postulación',checklist:{programChosen:true}})).status,200);
  assert.equal((await staff(db,path,{revision:old,checklist:{contacted:false}},'PATCH')).status,409);
  assert.equal((await save({stage:'Admitido'})).status,422);
  assert.equal((await save({stage:'Admitido',evidence:'ACTA-133'})).status,200);
  assert.equal((await save({stage:'Matriculado',checklist:{enrollmentVerified:true}})).status,422);
  assert.equal((await save({stage:'Matriculado',evidence:'REG-8810'})).status,200);
  let view=await detail();
  assert.equal(view.case.outcome,'matriculado');
  assert.equal(view.case.decisionAt,null);
  assert.equal(view.nextStep.dueAt,null);
  assert.deepEqual(view.blockers,[]);
  assert.equal(view.checklist.find(c=>c.key==='enrollmentVerified').done,true);
  assert.equal(view.tasks.filter(task=>task.status==='pendiente').length,0);
  assert.equal(view.evidence.length,2);
  assert.equal(view.evidence.filter(e=>e.current).length,2);
  assert.equal((await (await staff(db,root+'?queue=closed')).json()).metrics.verifiedEnrolled,1);

  assert.equal((await save({stage:'Admitido'})).status,422);
  assert.equal((await save({stage:'Admitido',reason:'Registro institucional corregido'})).status,200);
  view=await detail();
  assert.equal(view.case.outcome,null);
  assert.equal(view.checklist.find(c=>c.key==='enrollmentVerified').done,false);
  assert.ok(view.nextStep.dueAt);
  assert.equal(view.evidence.some(e=>e.stage==='Matriculado'&&!e.current),true);
  assert.equal((await save({stage:'Cerrado',reason:'La aspirante reprogramó sus planes'})).status,422);
  assert.equal((await save({stage:'Cerrado',outcome:'pospuesto',reason:'La aspirante reprogramó sus planes'})).status,200);
  assert.equal((await detail()).case.outcome,'pospuesto');
  assert.equal((await save({stage:'En orientación',reason:'El aspirante retomó su proceso'})).status,200);
  view=await detail();
  assert.equal(view.case.outcome,null);
  assert.equal(view.case.stage,'En orientación');
  assert.equal(view.evidence.filter(e=>e.current).length,0);
  assert.ok(view.nextStep.dueAt);
});

test('la migración aditiva conserva expedientes históricos sin contarlos como matrículas verificadas', async()=>{
  const db=testDatabase();
  await capture(db,{consentVoice:true});
  const record=lead(db), path=root+'/'+record.id;
  db.raw.prepare("UPDATE leads SET stage='Matriculado' WHERE id=?").run(record.id);
  db.migrate();
  db.migrate();
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM leads').get().n,1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM jobs').get().n,3);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM whatsapp_consents').get().n,0);
  const data=await (await staff(db,root+'?queue=blocked')).json();
  assert.equal(data.metrics.recordedEnrolled,1);
  assert.equal(data.metrics.verifiedEnrolled,0);
  assert.ok(data.queue[0].blockers.some(b=>b.key==='unverified-enrollment'));
  const current=await (await staff(db,path)).json();
  assert.equal(current.student.consentVoice,true);
  assert.equal(current.student.consentWhatsapp,false);
  assert.equal((await staff(db,path,{revision:current.case.revision,evidence:'REG-HISTORICO-4'},'PATCH')).status,200);
  const result=await (await staff(db,root+'?queue=closed')).json();
  assert.equal(result.metrics.verifiedEnrolled,1);
  assert.equal(result.queue[0].case.outcome,'matriculado');
});

test('las tareas completadas no siguen apareciendo como próximas acciones y el cierre impide reabrirlas', async()=>{
  const db=testDatabase();
  db.migrate();
  await capture(db);
  const {id}=lead(db);
  const t=db.raw.prepare('SELECT id FROM tasks WHERE lead_id=?').get(id);
  assert.equal((await staff(db,'/api/staff/tasks/'+t.id,{status:'hecha'})).status,200);
  const d=await (await staff(db,root+'/'+id)).json();
  assert.equal(d.nextStep.title,'');
  assert.ok(d.blockers.some(b=>b.key==='next-step'));
  assert.equal((await staff(db,root+'/'+id,{revision:d.case.revision,stage:'Cerrado',outcome:'sin_respuesta',reason:'No respondió al contacto'},'PATCH')).status,200);
  assert.equal((await staff(db,'/api/staff/tasks/'+t.id,{status:'pendiente'})).status,422);
});

test('una admisión histórica obtiene seguimiento al confirmar su referencia y no repite envíos ya aceptados', async()=>{
  const db=testDatabase();
  db.migrate();
  await capture(db,{consentWhatsapp:true});
  const record=lead(db), path=root+'/'+record.id;
  db.raw.prepare("UPDATE leads SET stage='Admitido' WHERE id=?").run(record.id);
  let d=await (await staff(db,path)).json();
  assert.ok(d.blockers.some(b=>b.key==='unverified-admission'));
  assert.equal(d.case.admissionVerified,false);
  assert.equal((await staff(db,path,{revision:d.case.revision,evidence:'ACTA-HISTÓRICA-141'},'PATCH')).status,200);
  d=await (await staff(db,path)).json();
  assert.equal(d.case.admissionVerified,true);
  assert.equal(d.evidence.filter(e=>e.current).length,1);
  const pending=d.jobs.filter(j=>j.status==='pending');
  assert.deepEqual(pending.map(j=>j.kind),['admission','admission']);
  assert.deepEqual(pending.map(j=>j.channel).sort(),['email','whatsapp']);

  db.raw.exec("UPDATE jobs SET status='sent',attempts=1 WHERE kind='admission'; UPDATE whatsapp_jobs SET status='sent',attempts=1 WHERE kind='admission';");
  assert.equal((await staff(db,path,{revision:d.case.revision,evidence:'ACTA-HISTÓRICA-142'},'PATCH')).status,200);
  d=await (await staff(db,path)).json();
  assert.equal(d.jobs.filter(j=>j.kind==='admission'&&j.status==='sent').length,2);
  assert.equal(d.jobs.filter(j=>j.kind==='admission'&&j.status==='pending').length,0);
  assert.equal(d.evidence.find(e=>e.current).reference,'ACTA-HISTÓRICA-142');
});

test('dos asesores editando la misma revisión no sobrescriben los campos ni la actividad del otro', async()=>{
  const db=testDatabase();
  db.migrate();
  await capture(db);
  const {id,revision}=lead(db), path=root+'/'+id;
  const [first,second]=await Promise.all([
    staff(db,path,{revision,blocker:'Revisar disponibilidad en horario nocturno'},'PATCH'),
    staff(db,path,{revision,checklist:{contacted:true}},'PATCH')
  ]);
  assert.deepEqual([first.status,second.status].sort(),[200,409]);
  const detail=await (await staff(db,path)).json();
  assert.equal(detail.case.revision,revision+1);
  const savedSecond=second.status===200;
  assert.equal(detail.checklist.find(c=>c.key==='contacted').done,savedSecond);
  assert.equal(detail.blockers.some(b=>b.key==='reported'),!savedSecond);
  assert.equal(detail.activity.filter(e=>e.type==='bloqueo'||e.type==='verificación').length,1);
});

test('reabrir un expediente cerrado no reactiva la secuencia de orientación anterior', async()=>{
  const db=testDatabase();
  db.migrate();
  await capture(db,{consentWhatsapp:true,consentVoice:true});
  const {id}=lead(db), path=root+'/'+id;
  const save=async input=>{
    const {revision}=db.raw.prepare('SELECT revision FROM leads WHERE id=?').get(id);
    return staff(db,path,{revision,...input},'PATCH');
  };
  assert.equal((await save({paused:true})).status,200);
  assert.equal((await save({stage:'Cerrado',outcome:'pospuesto',reason:'Pospuso sus planes de estudio'})).status,200);
  assert.equal((await save({stage:'En orientación',reason:'Confirmó su interés',paused:false})).status,200);
  const detail=await (await staff(db,path)).json();
  assert.equal(detail.jobs.filter(j=>j.status==='pending').length,0);
  assert.ok(detail.nextStep.title);
  assert.equal((await save({stage:'En postulación'})).status,200);
  const now=await (await staff(db,path)).json();
  assert.deepEqual(now.jobs.filter(j=>j.status==='pending').map(j=>j.kind),['application','application']);
});
