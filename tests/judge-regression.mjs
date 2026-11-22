import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { serve } from '../src/portal.js';
import { programs } from '../src/catalog.js';

const base='https://offline.example.org';
function fixture(){
  const raw=new DatabaseSync(':memory:');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>/^\d+.*\.sql$/.test(x)).sort()) raw.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  class Query {
    constructor(sql,args=[]){this.sql=sql;this.args=args}
    bind(...args){return new Query(this.sql,args)}
    first(){return raw.prepare(this.sql).get(...this.args)||null}
    all(){return {results:raw.prepare(this.sql).all(...this.args)}}
    run(){const q=raw.prepare(this.sql);return q.columns().length?this.all():{meta:{changes:q.run(...this.args).changes}}}
  }
  return {raw,env:{PUBLIC_BASE_URL:base,ADMISSIONS_STAFF_EMAILS:'staff@example.org',DB:{prepare:s=>new Query(s),batch(qs){raw.exec('BEGIN');try{const r=qs.map(q=>q.run());raw.exec('COMMIT');return r}catch(e){raw.exec('ROLLBACK');throw e}}}}};
}
function call(env,path,method='GET',body,headers={}){
  return serve(new Request(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env,()=>'<html>Manual</html>');
}
const auth={'oai-authenticated-user-id':'trusted-proxy-test-id','oai-authenticated-user-email':'staff@example.org'};
const person={name:'Prueba local',email:'prueba@example.org',program:programs[0].slug,consentEmail:true,consentVoice:false};
test('consentimiento solo acepta booleanos explícitos y no programa mensajes por cadenas',async()=>{
  const {raw,env}=fixture();
  assert.equal((await call(env,'/api/leads','POST',{...person,consentEmail:'true',consentVoice:'true'})).status,201);
  assert.deepEqual({...raw.prepare('SELECT consent_email,consent_voice FROM leads').get()},{consent_email:0,consent_voice:0});
  assert.equal(raw.prepare('SELECT count(*) n FROM jobs').get().n,0);
});
test('baja antes de hitos humanos no genera correos y repetición del formulario no reactiva consentimiento',async()=>{
  const {raw,env}=fixture();
  assert.equal((await call(env,'/api/leads','POST',person)).status,201);
  const lead=raw.prepare('SELECT * FROM leads').get();
  const req=new Request(base+'/preferencias/'+lead.pref_token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:''});
  assert.equal((await serve(req,env,()=>'' )).status,200);
  assert.equal((await call(env,'/api/leads','POST',{...person,source:'segunda-consulta'})).status,201);
  for(const stage of ['En orientación','En postulación','Admitido']) {
    const revision=raw.prepare('SELECT revision FROM leads WHERE id=?').get(lead.id).revision;
    const payload={stage,revision,...(stage==='Admitido'?{evidence:'ACTA-PRUEBA'}:{})};
    assert.equal((await call(env,'/api/staff/workspace/'+lead.id,'PATCH',payload,auth)).status,200);
  }
  assert.equal(raw.prepare('SELECT consent_email FROM leads').get().consent_email,0);
  assert.equal(raw.prepare("SELECT count(*) n FROM jobs WHERE status='pending'").get().n,0);
});
test('rutas de personal exigen identidad y lista de acceso',async()=>{
  const {env}=fixture();
  for(const path of ['/api/staff/dashboard','/api/staff/leads','/api/staff/analytics','/equipo/manual']){
    assert.equal((await call(env,path)).status,403,path);
    assert.equal((await call(env,path,'GET',undefined,{'oai-authenticated-user-id':'x','oai-authenticated-user-email':'extra@example.org'})).status,403,path);
    assert.equal((await call(env,path,'GET',undefined,{'oai-authenticated-user-email':'staff@example.org'})).status,403,path);
    assert.equal((await call(env,path,'GET',undefined,auth)).status,200,path);
  }
});
