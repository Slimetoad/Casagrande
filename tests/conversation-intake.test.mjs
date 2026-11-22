import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { programs } from '../src/catalog.js';
import { extractConversationFacts, handleConversations, ingestConversation } from '../src/conversation-intake.js';
import { handleAdmissions } from '../src/admissions.js';

const origin='https://posgrados.example.org';
const root='/api/staff/conversations';
const operator='asesora@example.org';
const mba='maestria-en-administracion-de-empresas';
const email={provider:'resend',eventId:'email-1',kind:'email',direction:'inbound',email:'persona@example.org',
  allowCreate:true,subject:'Consulta MBA',text:'¿Cuánto cuesta el MBA? Me preocupa el presupuesto.'};
const call={provider:'retell',eventId:'call-1',kind:'call',direction:'inbound',phone:'0991234567',
  allowCreate:true,text:'User: ¿Puedo agendar una cita?\nAgent: Tu matrícula está confirmada.'};

function fixture() {
  const raw=new DatabaseSync(':memory:');
  for (const file of ['schema.sql','growth.sql','appointments.sql','operations-v2.sql','channels.sql','conversation-v3.sql','nurture-v3.sql']) {
    raw.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  }
  class Statement {
    constructor(sql,args=[]) { this.sql=sql; this.args=args; }
    bind(...args) { return new Statement(this.sql,args); }
    first() { return raw.prepare(this.sql).get(...this.args) || null; }
    all() { return {results:raw.prepare(this.sql).all(...this.args)}; }
    run() {
      const q=raw.prepare(this.sql);
      return q.columns().length ? this.all() : {meta:{changes:q.run(...this.args).changes},results:[]};
    }
  }
  const DB={prepare:sql=>new Statement(sql),batch(queries) {
    raw.exec('BEGIN');
    try {const result=queries.map(query=>query.run());raw.exec('COMMIT');return result;}
    catch(error) {raw.exec('ROLLBACK');throw error;}
  }};
  return {env:{DB,PUBLIC_BASE_URL:origin},raw};
}
async function staff(env,path,input,auth=operator) {
  const url=new URL(path,origin);
  const req=new Request(url,{method:input===undefined?'GET':'PATCH',body:input===undefined?undefined:JSON.stringify(input),
    headers:{'content-type':'application/json'}});
  return handleConversations(req,env,url,programs,auth);
}
async function admissions(env,path) {
  const url=new URL(path,origin);
  return (await handleAdmissions(new Request(url),env,url,programs,operator)).json();
}
function seedLead(raw,id,address,phone) {
  const now=new Date().toISOString();
  raw.prepare('INSERT INTO leads(id,name,email,phone,source,created_at,updated_at,pref_token) VALUES(?,?,?,?,?,?,?,?)')
    .run(id,'Aspirante '+id,address,phone,'Formulario',now,now,crypto.randomUUID());
}

test('la extracción conserva únicamente señales del aspirante, incluso cuando menciona referencias sensibles',()=>{
  const result=extractConversationFacts({text:[
    'Agente: Tu matrícula está lista. El costo es $5000 y la cédula es 1234567890.',
    'User: Quisiera conocer el costo del MBA. Me preocupa el presupuesto.',
    'Decidiré el próximo mes. Prefiero por correo electrónico.',
    'Mi correo es persona@example.org. Visita https://privado.example.org/referencia.',
    'Mi contraseña es clave-rápida.',
    'Mi hermana se llama Ana Pérez y necesito que le llamen.',
    'El lunes escribió:',
    '> La inscripción ya está pagada.'
  ].join('\n')},programs);
  assert.equal(result.program,mba);
  assert.equal(result.intent,'inversion');
  assert.equal(result.obstacle,'Presupuesto o financiamiento');
  assert.equal(result.timeframe,'el próximo mes');
  assert.equal(result.contactPreference,'email');
  assert.equal(result.confidence,'alta');
  assert.doesNotMatch(JSON.stringify(result),/5000|1234567890|persona@example|privado\.example|clave-rápida|Ana Pérez|pagada/);
  assert.equal(extractConversationFacts({text:'No quiero que me llamen.'},programs).optOutChannel,'voice');
  assert.equal(extractConversationFacts({text:'¿Cómo hago para darme de baja?'},programs).intent,'desconocido');
  const ask=extractConversationFacts({text:'¿Me pueden llamar mañana?'},programs);
  assert.equal(ask.intent,'solicitar_asesor');
  assert.equal(ask.contactPreference,null);
  assert.equal(extractConversationFacts({text:'No me interesa el MBA.'},programs).program,null);
  assert.equal(extractConversationFacts({text:'Me interesa MBA e inteligencia artificial.'},programs).needsReview,true);
});

test('un mensaje directo crea un expediente auténtico y una sola marca transaccional persistente',async()=>{
  const {env,raw}=fixture();
  let wakes=0;
  env.onConversationRecorded=()=>{wakes++;};
  const a=await ingestConversation(env,{...email,trustedDirect:true});
  const b=await ingestConversation(env,email);
  const second=await ingestConversation(env,{...email,eventId:'email-2',trustedDirect:true});
  assert.equal(a.createdLead,true);
  assert.equal(a.trustedDirect,true);
  assert.equal(a.extraction.program,mba);
  assert.equal(a.id,b.id);
  assert.equal(a.leadId,second.leadId);
  assert.equal(b.duplicate,true);
  assert.equal(b.createdLead,true);
  assert.equal(b.trustedDirect,true);
  assert.equal(second.createdLead,false);
  assert.equal(wakes,3);
  const stored=raw.prepare('SELECT * FROM leads').all();
  assert.equal(stored.length,1);
  assert.equal(stored[0].email,'persona@example.org');
  assert.equal(stored[0].consent_email,0);
  assert.equal(stored[0].consent_voice,0);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM jobs').get().n,0);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM admissions_conversations WHERE created_lead=1').get().n,1);
  assert.ok(raw.prepare("SELECT COUNT(*) n FROM tasks WHERE lead_id=? AND status='pendiente'").get(a.leadId).n>=1);
  const list=await (await staff(env,root+'?leadId='+a.leadId)).json();
  assert.equal(list.total,2);
  assert.equal(list.conversations[0].contact.email,'persona@example.org');
  assert.equal((await staff(env,root,undefined,null)).status,403);
});

test('una llamada parcial se completa una sola vez y los identificadores internos nunca llegan al CRM',async()=>{
  const {env,raw}=fixture();
  const partial=await ingestConversation(env,{...call,text:'',complete:false});
  assert.equal(partial.contentStatus,'partial');
  assert.equal(partial.leadId,null);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,0);
  const complete=await ingestConversation(env,call), replay=await ingestConversation(env,{...call,text:'User: ¿Cuánto cuesta?'});
  assert.equal(complete.id,partial.id);
  assert.equal(complete.contentStatus,'complete');
  assert.equal(complete.extraction.intent,'cita');
  assert.equal(replay.id,complete.id);
  assert.equal(replay.extraction.intent,'cita');
  assert.equal(replay.duplicate,true);
  const {email:opaque,phone,consent_email:approved}=raw.prepare('SELECT email,phone,consent_email FROM leads WHERE id=?').get(complete.leadId);
  assert.doesNotMatch(opaque,/@/);
  assert.equal(phone,'+593991234567');
  assert.equal(approved,0);
  assert.equal(raw.prepare('SELECT phone FROM admissions_phone_identities').get().phone,phone);
  const ordinary=await admissions(env,'/api/staff/leads/'+complete.leadId);
  const workspace=await admissions(env,'/api/staff/workspace/'+complete.leadId);
  assert.equal(ordinary.lead.email,'');
  assert.equal(workspace.student.email,'');
  assert.equal((await admissions(env,'/api/staff/leads?q='+encodeURIComponent(opaque))).total,0);
  assert.equal((await admissions(env,'/api/staff/workspace?queue=all&q='+encodeURIComponent(opaque))).total,0);
  const matched=await ingestConversation(env,{...email,eventId:'later-contact',phone,email:'contacto@example.org'});
  assert.equal(matched.leadId,complete.leadId);
  assert.equal(matched.createdLead,false);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,1);
  assert.equal((await admissions(env,'/api/staff/leads/'+complete.leadId)).lead.email,'contacto@example.org');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM admissions_phone_identities').get().n,0);
});

test('identidad ambigua, contradictoria y sin verificar va a revisión y se vincula con control de versión',async()=>{
  const {env,raw}=fixture();
  seedLead(raw,'l-1','una@example.org','+593991234567');
  seedLead(raw,'l-2','otra@example.org','+593991234567');
  const a=await ingestConversation(env,call);
  assert.equal(a.leadId,null);
  assert.equal(a.reviewReason,'ambiguous_identity');
  const b=await ingestConversation(env,{...email,leadId:'l-1',email:'otra@example.org'});
  assert.equal(b.leadId,null);
  assert.equal(b.reviewReason,'identity_conflict');
  const c=await ingestConversation(env,{...email,eventId:'anonymous-3',name:'Tercera Persona',forceReview:true,trustedDirect:true});
  assert.equal(c.reviewReason,'identity_unverified');
  assert.equal(c.createdLead,false);
  assert.equal(c.trustedDirect,false);
  const l=await (await staff(env,root+'?status=unassigned')).json();
  assert.equal(l.unassigned,3);
  const forced=l.conversations.find(row=>row.id===c.id);
  assert.deepEqual(forced.contact,{email:'',name:'',phone:''});
  assert.equal(forced.subject,'Remitente sin verificar');
  assert.equal(forced.excerpt,'');
  assert.deepEqual(forced.extraction.evidence,[]);
  const current=l.conversations.find(row=>row.id===a.id);
  const linked=await staff(env,root+'/'+a.id,{leadId:'l-1',revision:current.revision});
  assert.equal(linked.status,200);
  assert.equal((await linked.json()).leadId,'l-1');
  assert.equal((await staff(env,root+'/'+a.id,{leadId:'l-2',revision:current.revision})).status,409);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,2);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM tasks').get().n,0);
});

test('el correo de baja de una persona desconocida queda en revisión sin crear contacto',async()=>{
  const {env,raw}=fixture();
  const result=await ingestConversation(env,{...email,text:'No quiero recibir más correos.'});
  assert.equal(result.extraction.intent,'baja');
  assert.equal(result.extraction.optOutChannel,'email');
  assert.equal(result.leadId,null);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,0);
});

test('dos llamadas concurrentes del mismo número abren un solo expediente',async()=>{
  const {env,raw}=fixture();
  const [a,b]=await Promise.all([
    ingestConversation(env,call),
    ingestConversation(env,{...call,eventId:'call-concurrente'})
  ]);
  assert.equal(a.leadId,b.leadId);
  assert.equal([a.createdLead,b.createdLead].filter(Boolean).length,1);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM leads').get().n,1);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM admissions_phone_identities').get().n,1);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM admissions_conversations').get().n,2);
});

test('el expediente y el ingreso sobreviven un fallo de seguimiento y el reintento recupera el plan',async()=>{
  const {env,raw}=fixture();
  const prepare=env.DB.prepare;
  env.DB.prepare=sql=>{
    if (sql.includes('conversation_nurture_signals')) throw new Error('Fallo temporal simulado');
    return prepare(sql);
  };
  await assert.rejects(ingestConversation(env,{...email,trustedDirect:true}),/Fallo temporal simulado/);
  const saved=raw.prepare('SELECT id,lead_id,created_lead,trusted_direct FROM admissions_conversations').get();
  assert.equal(saved.created_lead,1);
  assert.equal(saved.trusted_direct,1);
  assert.ok(saved.lead_id);
  env.DB.prepare=prepare;
  const replay=await ingestConversation(env,email);
  assert.equal(replay.id,saved.id);
  assert.equal(replay.duplicate,true);
  assert.equal(replay.nurture.handled,true);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM conversation_nurture_signals').get().n,1);
});
