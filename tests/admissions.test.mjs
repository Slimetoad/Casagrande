import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAdmissions } from '../src/admissions.js';

function testDatabase() {
  const raw = new DatabaseSync(':memory:');
  for (const file of ['schema.sql','growth.sql']) raw.exec(readFileSync(new URL('../' + file,import.meta.url),'utf8'));
  class Statement {
    constructor(sql,values = []) { this.q = raw.prepare(sql); this.values = values; this.sql = sql; }
    bind(...values) { return new Statement(this.sql,values); }
    first() { return this.q.get(...this.values) || null; }
    all() { return {results:this.q.all(...this.values)}; }
    run() { return this.execute(); }
    execute() {
      if (this.q.columns().length) return this.all();
      return {results:[],meta:{changes:this.q.run(...this.values).changes}};
    }
  }
  return {raw, prepare(sql) {return new Statement(sql);}, batch(queries) {
    raw.exec('BEGIN');
    try { const r = queries.map(q=>q.execute()); raw.exec('COMMIT'); return r; }
    catch(error) {raw.exec('ROLLBACK'); throw error;}
  }};
}
const programs = [{slug:'ejemplo',title:'Maestría de ejemplo'}];
const contact = {name:'Persona de prueba',email:'ASPIRANTE@example.org',phone:'0991234000',program:'ejemplo',source:'financiamiento',consentEmail:true,consentVoice:true,context:{utm_campaign:'prueba'}};
function call(db,path,input,operator=null,headers={}) {
  const url = new URL(path,'https://posgrados.example.org');
  const req = input instanceof Request ? input : new Request(url,{method:input===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:input===undefined?undefined:JSON.stringify(input)});
  return handleAdmissions(req,{DB:db},url,programs,operator);
}
test('la captura conserva atribución, consentimientos y una sola secuencia frente a reintentos', async()=>{
  const db=testDatabase(), headers={'idempotency-key':'clave-001'};
  for(let i=0;i<2;i++) assert.equal((await call(db,'/api/leads',contact,null,headers)).status,201);
  const counts = db.raw.prepare('SELECT (SELECT count(*) FROM leads) leads,(SELECT count(*) FROM lead_submissions) receipts,(SELECT count(*) FROM tasks) tasks,(SELECT count(*) FROM jobs) jobs').get();
  assert.deepEqual({...counts},{leads:1,receipts:1,tasks:1,jobs:3});
  const lead=db.raw.prepare('SELECT * FROM leads').get();
  assert.equal(lead.phone,'+593991234000'); assert.equal(lead.email,'aspirante@example.org'); assert.equal(lead.score,80);
  assert.equal(JSON.parse(lead.context).utm_campaign,'prueba');
  assert.ok(!('id' in await (await call(db,'/api/leads',contact,null,headers)).json()));
  const dash=await (await call(db,'/api/staff/dashboard',undefined,'operadora')).json();
  assert.equal(dash.metrics.total,1);assert.equal(dash.leads[0].pref_token,undefined);
  assert.equal((await call(db,'/api/staff/dashboard')).status,403);
  assert.equal((await call(db,'/api/leads',{...contact,program:'inexistente'})).status,422);
  assert.equal((await call(db,'/api/leads',{...contact,phone:''})).status,422);
});
test('la captura respeta DNT y GPC y conserva el contexto de orientación', async()=>{
  const context = {utm_campaign:'interno',utm_source:'ucg',hubVariant:'B',tool:'simulador',
    plan:{UTM_content:'prueba',hubVariant:'A',investment:5000}};
  for(const headers of [{'DNT':'1'},{'Sec-GPC':'1'}]){
    const db=testDatabase();
    const r=await call(db,'/api/leads',{...contact,context},null,headers);
    assert.equal(r.status,201);
    for(const table of ['leads','lead_submissions']){
      const saved=JSON.parse(db.raw.prepare(`SELECT context FROM ${table}`).get().context);
      assert.deepEqual(saved,{tool:'simulador',plan:{investment:5000}});
    }
  }
});
test('la baja cancela tareas de envío y un formulario anónimo no puede reactivar canales ni cambiar teléfonos', async()=>{
  const db=testDatabase();
  await call(db,'/api/leads',contact);
  const initial=db.raw.prepare('SELECT * FROM leads').get();
  const url='/preferencias/'+initial.pref_token;
  assert.equal((await call(db,url)).status,200);
  const form=new Request('https://posgrados.example.org'+url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:''});
  assert.equal((await call(db,url,form)).status,200);
  await call(db,'/api/leads',{...contact,phone:'0987654321',name:'Otra persona',source:'quiz'});
  const row=db.raw.prepare('SELECT * FROM leads').get();
  assert.equal(row.phone,initial.phone);assert.equal(row.name,initial.name);assert.equal(row.consent_email,0);assert.equal(row.consent_voice,0);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE status='pending'").get().n,0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM lead_submissions').get().n,2);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM events WHERE type='preferencias'").get().n,2);
});
test('la cola comercial respeta las pausas, las revisiones y el cierre humano', async()=>{
  const db=testDatabase();
  await call(db,'/api/leads',contact);
  const lead=db.raw.prepare('SELECT * FROM leads').get(),path='/api/staff/leads/'+lead.id;
  let result=await call(db,path,{stage:'En orientación',owner:'Asesora',note:'Pidió información',paused:true,revision:lead.revision},'Asesora');
  assert.equal(result.status,200);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE status='pending'").get().n,0);
  assert.equal((await call(db,path,{stage:'Admitido',revision:1},'Asesora')).status,409);
  result=await call(db,path,{paused:false},'Asesora'); assert.equal(result.status,200);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE status='pending'").get().n,3);
  const t=db.raw.prepare("SELECT * FROM tasks WHERE status='pendiente'").get();
  assert.equal((await call(db,'/api/staff/tasks/'+t.id,{status:'hecha'},'Asesora')).status,200);
  await call(db,'/api/staff/tasks/'+t.id,{status:'hecha'},'Asesora');
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM events WHERE type='tarea'").get().n,1);
  result=await call(db,path,{stage:'Matriculado'},'Asesora'); assert.equal(result.status,200);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE status='pending'").get().n,0);
  const dash=await (await call(db,'/api/staff/dashboard',undefined,'Asesora')).json();
  assert.equal(dash.metrics.enrolled,1);assert.equal(dash.metrics.openTasks,0);
  const detail=await (await call(db,path,undefined,'Asesora')).json();assert.ok(detail.events.some(e=>e.description.includes('Pidió información')));
  const search=await (await call(db,'/api/staff/leads?q=aspirante&stage=Matriculado',undefined,'Asesora')).json();
  assert.equal(search.total,1);
});
test('sin autorización no se preparan envíos; las solicitudes de otro origen se rechazan', async()=>{
  const db=testDatabase();
  assert.equal((await call(db,'/api/leads',{...contact,consentEmail:false,consentVoice:false},null,{origin:'https://externo.example.org'})).status,403);
  await call(db,'/api/leads',{...contact,consentEmail:false,consentVoice:false});
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM jobs').get().n,0);
  const row=db.raw.prepare('SELECT * FROM leads').get();
  assert.equal((await call(db,'/api/staff/leads/'+row.id,{stage:'Matriculado'})).status,403);
  assert.equal(row.stage,'Nuevo');
});

test('las respuestas reconocidas se asocian por alias y remitente; las repeticiones no duplican el trabajo', async()=>{
  const { recruitmentReplyTo,captureInboundReply } = await import('../src/replies.js');
  const db=testDatabase(); const env={DB:db,RESEND_REPLY_DOMAIN:'respuestas.example.org'};
  await call(db,'/api/leads',contact);
  const lead=db.raw.prepare('SELECT * FROM leads').get();
  const address=await recruitmentReplyTo(env,lead);
  assert.match(address,/^adm-[a-f0-9]{32}@respuestas\.example\.org$/);
  assert.equal(address,await recruitmentReplyTo(env,lead));
  const event={type:'email.received',data:{email_id:crypto.randomUUID(),from:'Persona <aspirante@example.org>',to:[address],subject:'Una pregunta sobre mi maestría'}};
  const oldFetch=globalThis.fetch;
  let hits=0;
  try {
    globalThis.fetch=async () => {
      hits++;
      return Response.json({id:event.data.email_id,text:'¿Me ayudan con los horarios?\n\nEl viernes, Admisiones escribió:\n> Texto anterior',subject:event.data.subject});
    };
    env.RESEND_RECEIVING_API_KEY='credencial-simulada';
    await captureInboundReply(env,{...event,data:{...event.data,from:'ajeno@example.org'}});
    await captureInboundReply(env,{...event,data:{...event.data,to:['adm-'+'0'.repeat(32)+'@respuestas.example.org']}});
    assert.equal(hits,0);assert.equal(db.raw.prepare('SELECT count(*) n FROM admissions_replies').get().n,0);
    await captureInboundReply(env,event);
    await captureInboundReply(env,event);
    assert.equal(hits,1);
    assert.equal(db.raw.prepare("SELECT count(*) n FROM tasks WHERE title='Responder al correo del aspirante'").get().n,1);
    assert.equal(db.raw.prepare("SELECT count(*) n FROM jobs WHERE status='pending'").get().n,0);
    assert.equal(db.raw.prepare('SELECT paused FROM leads').get().paused,1);
    const reply=db.raw.prepare("SELECT * FROM events WHERE type='correo recibido'").get();
    assert.ok(reply.description.includes('¿Me ayudan con los horarios?'));assert.ok(!reply.description.includes('Texto anterior'));
  } finally { globalThis.fetch=oldFetch; }
});
test('un fallo temporal de lectura pausa las secuencias y el reintento añade el extracto una sola vez', async()=>{
  const { recruitmentReplyTo,captureInboundReply } = await import('../src/replies.js');
  const db=testDatabase(),env={DB:db,RESEND_REPLY_DOMAIN:'respuestas.example.org',RESEND_RECEIVING_API_KEY:'simulada'};
  await call(db,'/api/leads',contact);
  const lead=db.raw.prepare('SELECT * FROM leads').get(), address=await recruitmentReplyTo(env,lead);
  const event={type:'email.received',data:{email_id:crypto.randomUUID(),from:lead.email,to:[address],subject:'Re: solicitud'}};
  const oldFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('Temporal',{status:503});
    await assert.rejects(()=>captureInboundReply(env,event));
    assert.equal(db.raw.prepare('SELECT paused FROM leads').get().paused,1);
    globalThis.fetch=async()=>Response.json({id:event.data.email_id,html:'<p>Gracias por la ayuda.</p><script>contenido descartado</script><blockquote>mensaje anterior</blockquote>'});
    await captureInboundReply(env,event);
    const rows=db.raw.prepare("SELECT * FROM events WHERE type='correo recibido'").all();
    assert.equal(rows.length,1);assert.ok(rows[0].description.includes('Gracias por la ayuda.'));
    assert.ok(!rows[0].description.includes('descartado'));assert.ok(!rows[0].description.includes('mensaje anterior'));
    await captureInboundReply(env,{...event,data:{...event.data,email_id:crypto.randomUUID(),subject:'Respuesta automática: de viaje'}});
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM admissions_replies').get().n,1);
  } finally {globalThis.fetch=oldFetch;}
});

test('los hitos humanos sustituyen la secuencia inicial con mensajes específicos y respetan cada consentimiento', async()=>{
  const db=testDatabase();
  await call(db,'/api/leads',contact);
  const row=db.raw.prepare('SELECT * FROM leads').get(), path='/api/staff/leads/'+row.id;
  const pending=()=>db.raw.prepare("SELECT kind FROM jobs WHERE status='pending'").all().map(r=>r.kind);
  await call(db,path,{stage:'En postulación'},'Asesora');
  assert.deepEqual(pending(),['application']);
  await call(db,path,{stage:'Admitido',paused:true},'Asesora');assert.deepEqual(pending(),[]);
  await call(db,path,{paused:false},'Asesora');assert.deepEqual(pending(),['admission']);
  db.raw.prepare("UPDATE jobs SET status='sent',attempts=1 WHERE kind='admission'").run();
  await call(db,path,{stage:'En postulación'},'Asesora');assert.deepEqual(pending(),['application']);
  await call(db,path,{stage:'Admitido'},'Asesora');assert.deepEqual(pending(),[]);
  await call(db,'/api/leads',{...contact,email:'solo-registro@example.org',consentEmail:false,consentVoice:false});
  const other=db.raw.prepare("SELECT id FROM leads WHERE email='solo-registro@example.org'").get();
  await call(db,'/api/staff/leads/'+other.id,{stage:'Admitido'},'Asesora');
  assert.equal(db.raw.prepare('SELECT count(*) n FROM jobs WHERE lead_id=?').get(other.id).n,0);
});
