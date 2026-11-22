import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { serve } from '../src/portal.js';
import { programs } from '../src/catalog.js';
const origin='https://offline.example.org';
function fixture(){
 const raw=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>/^\d+.*\.sql$/.test(n)).sort())raw.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 class Q{constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Q(this.sql,args)}first(){return raw.prepare(this.sql).get(...this.args)||null}all(){return {results:raw.prepare(this.sql).all(...this.args)}}run(){const q=raw.prepare(this.sql);return q.columns().length?this.all():{meta:{changes:q.run(...this.args).changes}}}}
 return {raw,env:{PUBLIC_BASE_URL:origin,ADMISSIONS_STAFF_EMAILS:'staff@example.org',DB:{prepare:s=>new Q(s),batch(qs){raw.exec('BEGIN');try{const out=qs.map(q=>q.run());raw.exec('COMMIT');return out}catch(e){raw.exec('ROLLBACK');throw e}}}}};
}
const staff={'oai-authenticated-user-id':'test','oai-authenticated-user-email':'staff@example.org'};
function call(env,path,body,headers={}){return serve(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env,()=>'<html></html>')}
const applicant={name:'Persona ficticia',email:'cita@example.org',phone:'0991234567',program:programs[0].slug,consentCita:true};
const future=hours=>new Date(Date.now()+hours*3600000).toISOString();
test('cita: consentimiento, reserva única, repetición y cancelación privada',async()=>{
 const {env}=fixture();const startAt=future(96);
 assert.equal((await call(env,'/api/staff/citas/slots',{startAt,minutes:30,advisor:'Asesora'},{})).status,403);
 assert.ok((await call(env,'/api/staff/citas/slots',{startAt,minutes:30,advisor:'Asesora'},staff)).ok);
 const slots=(await (await call(env,'/api/citas')).json()).slots;assert.equal(slots.length,1);
 const key=crypto.randomUUID(),head={'idempotency-key':key};
 assert.equal((await call(env,'/api/citas/solicitar',{...applicant,slotId:slots[0].id,consentCita:false},head)).status,422);
 const first=await call(env,'/api/citas/solicitar',{...applicant,slotId:slots[0].id},head);assert.ok(first.ok);const booked=await first.json();assert.equal(booked.status,'booked');
 const retry=await call(env,'/api/citas/solicitar',{...applicant,slotId:slots[0].id},head);assert.ok(retry.ok);const repeated=await retry.json();assert.equal(repeated.key,booked.key);
 assert.equal((await call(env,'/api/citas/solicitar',{...applicant,email:'otra@example.org',slotId:slots[0].id},{'idempotency-key':crypto.randomUUID()})).status,409);
 assert.equal((await call(env,'/api/citas/gestionar',{key:crypto.randomUUID(),action:'view'})).status,404);
 const view=await (await call(env,'/api/citas/gestionar',{key:booked.key,action:'view'})).json();assert.ok(!JSON.stringify(view).includes(applicant.email));
 assert.ok((await call(env,'/api/citas/gestionar',{key:booked.key,action:'cancel'})).ok);
});
test('cita: rechaza intervalo vencido y solapamiento de asesor',async()=>{
 const {env}=fixture();assert.equal((await call(env,'/api/staff/citas/slots',{startAt:future(-1),minutes:30,advisor:'Asesora'},staff)).status,422);
 const startAt=future(120);assert.ok((await call(env,'/api/staff/citas/slots',{startAt,minutes:30,advisor:'Asesora'},staff)).ok);
 const overlap=new Date(Date.parse(startAt)+15*60000).toISOString();assert.equal((await call(env,'/api/staff/citas/slots',{startAt:overlap,minutes:30,advisor:'Asesora'},staff)).status,409);
});
test('cita: dos personas compiten por una sola franja',async()=>{
 const {env}=fixture();assert.ok((await call(env,'/api/staff/citas/slots',{startAt:future(150),minutes:30,advisor:'Asesora'},staff)).ok);
 const [{id}]=(await (await call(env,'/api/citas')).json()).slots;
 const results=await Promise.all(['uno@example.org','dos@example.org'].map(email=>call(env,'/api/citas/solicitar',{...applicant,email,slotId:id},{'idempotency-key':crypto.randomUUID()})));
 assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);
});
test('cita: solicitud sin franja, reintento, asignación y baja privada',async()=>{
 const {env}=fixture(),token=crypto.randomUUID(),headers={'idempotency-key':token};
 const first=await call(env,'/api/citas/solicitar',applicant,headers);assert.equal(first.status,201);const initial=await first.json();assert.equal(initial.status,'requested');
 const retry=await (await call(env,'/api/citas/solicitar',applicant,headers)).json();assert.equal(retry.key,initial.key);
 assert.ok((await call(env,'/api/staff/citas/slots',{startAt:future(170),minutes:30,advisor:'Asesora'},staff)).ok);
 const schedule=await (await call(env,'/api/staff/citas',undefined,staff)).json();
 assert.equal(schedule.appointments.length,1);assert.ok((await call(env,'/api/staff/citas/'+schedule.appointments[0].id,{action:'assign',slotId:schedule.slots[0].id},staff)).ok);
 const view=await (await call(env,'/api/citas/gestionar',{key:initial.key,action:'view'})).json();assert.equal(view.appointment.status,'booked');
 for(let i=0;i<2;i++){const cancelled=await call(env,'/api/citas/gestionar',{key:initial.key,action:'cancel'});assert.ok(cancelled.ok);assert.equal((await cancelled.json()).appointment.status,'cancelled')}
});
test('cita: conserva solo UTM válidos en el expediente y respeta preferencias de privacidad', async () => {
 const {raw,env}=fixture();
 const campaign={utm_source:'ucg',utm_campaign:'programa-2026',utm_content:'a'.repeat(120),utm_term:{nested:'invalid'},preferencia:'tarde',contactId:'extra'};
 const key={'idempotency-key':crypto.randomUUID()};
 const first=await call(env,'/api/citas/solicitar',{...applicant,campaign},key);
 assert.equal(first.status,201);
 assert.doesNotMatch(await first.text(),/utm_|programa-2026/);
 assert.equal((await call(env,'/api/citas/solicitar',{...applicant,campaign:{utm_source:'other'}},key)).status,200);
 const contextFor=email=>JSON.parse(raw.prepare('SELECT s.context FROM lead_submissions s JOIN leads l ON l.id=s.lead_id WHERE l.email=?').get(email).context);
 assert.deepEqual(contextFor(applicant.email),{tool:'cita',origen:'agenda',preferencia:'indiferente',utm_source:'ucg',utm_campaign:'programa-2026',utm_content:'a'.repeat(100)});
 for(const signal of ['DNT','Sec-GPC']){
  const email=signal+'@example.org';
  assert.equal((await call(env,'/api/citas/solicitar',{...applicant,email,campaign},{'idempotency-key':crypto.randomUUID(),[signal]:'1'})).status,201);
  assert.deepEqual(contextFor(email.toLowerCase()),{tool:'cita',origen:'agenda',preferencia:'indiferente'});
 }
});
