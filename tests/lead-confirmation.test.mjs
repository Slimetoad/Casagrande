import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { handleLeadConfirmation, leadConfirmationUrl } from '../src/lead-confirmation.js';

const origin = 'https://posgrados.example.invalid';
const programs = [{slug:'gestion',title:'Maestría en Gestión'},{slug:'derecho',title:'Maestría en Derecho'}];
const lead = {
  id:crypto.randomUUID(),
  name:'Nombre Privado',
  email:'persona@example.invalid',
  phone:'+593999000001',
  pref_token:'aacd'.repeat(16),
  context:JSON.stringify({timeframe:'Estoy explorando',quizArea:'Negocios'}),
  program:'gestion'
};
function createDatabase() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../schema.sql', import.meta.url),'utf8'));
  raw.prepare(`INSERT INTO leads(id,name,email,phone,program,source,stage,paused,consent_email,consent_voice,context,pref_token,created_at,updated_at)
    VALUES(?,?,?,?,?,'programa','En orientación',1,0,1,?,?,?,?)`).run(lead.id,lead.name,lead.email,lead.phone,lead.program,lead.context,lead.pref_token,new Date().toISOString(),new Date().toISOString());
  const DB = {
    prepare(sql) {
      return {bind(...args) {
        const statement = raw.prepare(sql);
        return {first:()=>statement.get(...args),run:()=>statement.run(...args)};
      }};
    },
    async batch(queries) {
      raw.exec('BEGIN');
      try {
        const changes = queries.map(query=>query.run());
        raw.exec('COMMIT');
        return changes;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const env = {DB};
  const call = (url, values, headers) => {
    const request = values ? new Request(url,{method:'POST',body:new URLSearchParams(values),headers}) : new Request(url);
    return handleLeadConfirmation(request,env,new URL(request.url),programs);
  };
  return {call,raw};
}
const link = () => leadConfirmationUrl(origin,lead,new Date().toISOString());

test('el enlace privado no cambia nada al abrirse y solo muestra el programa y el horizonte',async()=>{
  const {call,raw}=createDatabase();
  const url=await link();
  assert.doesNotMatch(url,new RegExp(lead.pref_token));
  const response=await call(url);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.match(response.headers.get('Cache-Control'),/no-store/);
  assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  const page=await response.text();
  assert.match(page,/<form[^>]*method="post"/);
  assert.match(page,/value="gestion" selected/);
  assert.match(page,/value="Estoy explorando" selected/);
  for (const privateValue of [lead.name,lead.email,lead.phone,lead.pref_token]) assert.ok(!page.includes(privateValue));
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM events').get().n,0);
});

test('confirmar corrige el expediente una sola vez y conserva pausas, etapa y permisos',async()=>{
  const {call,raw}=createDatabase();
  const url=await link();
  const data={program:'derecho',timeframe:'Próxima convocatoria',revision:'1'};
  for(let i=0;i<2;i++) assert.equal((await call(url,data)).status,200);
  const stored=raw.prepare('SELECT program,context,stage,paused,consent_email,consent_voice,revision FROM leads').get();
  assert.equal(stored.program,'derecho');
  assert.deepEqual(JSON.parse(stored.context),{timeframe:'Próxima convocatoria',quizArea:'Negocios'});
  assert.deepEqual([stored.stage,stored.paused,stored.consent_email,stored.consent_voice,stored.revision],['En orientación',1,0,1,2]);
  const events=raw.prepare('SELECT type,actor,description FROM events').all();
  assert.equal(events.length,1);
  assert.equal(events[0].type,'confirmacion_interes');
  assert.equal(events[0].actor,'Aspirante');
  assert.match(events[0].description,/Maestría en Gestión.*Maestría en Derecho.*Próxima convocatoria/);
});

test('se rechazan firmas, solicitudes cruzadas, datos inválidos y revisiones obsoletas',async()=>{
  const {call,raw}=createDatabase();
  const url=await link();
  const data={program:'derecho',timeframe:'Próxima convocatoria',revision:'1'};
  const last=url.at(-1);
  assert.equal((await call(url.slice(0,-1)+(last==='a'?'b':'a'))).status,404);
  assert.equal(await leadConfirmationUrl(origin,lead,'1999-01-01T00:00:00.000Z'),'');
  assert.equal((await call(url,data,{origin:'https://otro.example.invalid','sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await call(url,{...data,program:'no-existe'})).status,422);
  raw.prepare('UPDATE leads SET revision=2').run();
  assert.equal((await call(url,data)).status,409);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM events').get().n,0);
  raw.prepare("UPDATE leads SET stage='Matriculado'").run();
  const advanced=await call(url,{...data,revision:'2'});
  assert.match(await advanced.text(),/Tu consulta está en seguimiento/);
  assert.equal(raw.prepare('SELECT program FROM leads').get().program,'gestion');
});
