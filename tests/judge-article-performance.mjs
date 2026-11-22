import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {collectArticle,articlePerformance} from '../src/article-performance.js';
function fixture(){
 const raw=new DatabaseSync(':memory:');for(const file of ['schema.sql','growth.sql','operations-v2.sql','appointments.sql','article-performance-v4.sql'])raw.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 class Q{constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Q(this.sql,args)}first(){return raw.prepare(this.sql).get(...this.args)||null}all(){return {results:raw.prepare(this.sql).all(...this.args)}}run(){const q=raw.prepare(this.sql);return q.columns().length?this.all():{meta:{changes:q.run(...this.args).changes}}}}
 const DB={prepare:s=>new Q(s)};return {raw,env:{DB}};
}
const date=days=>new Date(Date.now()+days*86400000).toISOString();
function article(raw,slug,status='published',program='curso'){
 raw.prepare('INSERT INTO seo_articles(id,slug,opportunity_id,program,title,summary,body,source_query,source_url,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(slug,slug,'op-'+slug,program,'Título','Resumen','Contenido','Consulta','https://www.casagrande.edu.ec',status,date(-3),date(-3),date(-3));
}
function req(body,headers={}){return new Request('https://local.example.org/api/editorial/medir',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)})}
test('medición respeta privacidad, tamaño y artículos publicados',async()=>{
 const {env,raw}=fixture();article(raw,'guia');article(raw,'borrador','draft');
 for(const h of [{'Sec-GPC':'1'},{DNT:'1'},{DNT:'yes'}])assert.equal((await collectArticle(req({slug:'guia',event:'view'},h),env)).status,204);
 assert.equal(raw.prepare('SELECT count(*) n FROM seo_article_counts').get().n,0);
 for(const event of ['view','click','click'])assert.equal((await collectArticle(req({slug:'guia',event}),env)).status,204);
 assert.equal((await collectArticle(req({slug:'borrador',event:'view'}),env)).status,404);
 assert.equal((await collectArticle(req({slug:'a'.repeat(101),event:'view'}),env)).status,400);
 assert.equal((await collectArticle(req({slug:'guia',event:'click',email:'privado@example.org'}),env)).status,400);
 const r=(await articlePerformance(env)).rows[0];assert.equal(r.views,1);assert.equal(r.ctaClicks,2);assert.equal(r.attribution,'enlace_etiquetado');
});
test('atribución deduplica personas, exige programa y solicitud anterior a cita y matrícula',async()=>{
 const {env,raw}=fixture();article(raw,'guia');
 const d0=date(-2),d1=date(-1),d2=date(0),context=JSON.stringify({utm_source:'guia',utm_medium:'editorial',utm_content:'guia'});
 for(const id of ['a','b','c'])raw.prepare('INSERT INTO leads(id,name,email,program,source,stage,created_at,updated_at,pref_token) VALUES(?,?,?,?,?,?,?,?,?)').run(id,id,id+'@example.org','curso','test','Matriculado',d0,d0,'pref-'+id);
 for(const [id,lead,created,program] of [['s1','a',d0,'curso'],['s2','a',d0,'curso'],['s3','b',d2,'curso'],['s4','c',d0,'otro']])raw.prepare('INSERT INTO lead_submissions(id,request_key,lead_id,program,source,context,email_choice,voice_choice,consent_version,created_at) VALUES(?,?,?,?,?,?,0,0,?,?)').run(id,id,lead,program,'guia',context,'test',created);
 for(const id of ['a','b']){
  raw.prepare('INSERT INTO admissions_slots(id,start_at,end_at,minutes,advisor,advisor_key,created_at) VALUES(?,?,?,?,?,?,?)').run('slot'+id,d1,d2,30,'Asesor','asesor'+id,d1);
  raw.prepare('INSERT INTO admissions_appointments(id,lead_id,slot_id,program,contact_name,contact_phone,preference,status,manage_hash,intent_hash,consent_version,created_at,updated_at,changed_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('ap'+id,id,'slot'+id,'curso',id,'+593991234567','indiferente','booked','hash'+id,'intent'+id,'test',d1,d1,'test');
  raw.prepare('INSERT INTO admissions_stage_evidence(id,lead_id,stage,reference,recorded_at,recorded_by) VALUES(?,?,?,?,?,?)').run('ev'+id,id,'Matriculado','REF-'+id,d1,'test');
  raw.prepare('INSERT INTO admissions_cases(lead_id,enrollment_evidence_id) VALUES(?,?)').run(id,'ev'+id);
 }
 raw.prepare('INSERT INTO lead_submissions(id,request_key,lead_id,program,source,context,email_choice,voice_choice,consent_version,created_at) VALUES(?,?,?,?,?,?,0,0,?,?)').run('invalido','invalido','a','curso','guia','{mal','test',d0);
 const row=(await articlePerformance(env)).rows[0];assert.equal(row.leads,2);assert.equal(row.appointments,1);assert.equal(row.enrollments,1);
});
test('cliente agrega etiquetas solo con privacidad permitida y nunca corta slug largo',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/articulos.js',import.meta.url),'utf8');
 function simulate({privacy=false,slug='guia-prueba'}={}){
  const calls=[],handlers={};const links=[{href:'https://sitio.example.org/programas/curso',getAttribute:()=>''},{href:'https://sitio.example.org/solicitar?programa=curso',getAttribute:()=>''}];
  const article={getAttribute:()=>slug,querySelectorAll:()=>links,addEventListener:(type,cb)=>handlers[type]=cb,contains:x=>links.includes(x)};
  const location=new URL('https://sitio.example.org/guias/'+slug);
  runInNewContext(source,{document:{querySelector:()=>article},navigator:{globalPrivacyControl:privacy},window:{},location,URL,JSON,fetch:(...args)=>{calls.push(args);return Promise.resolve({})}});
  if(handlers.click)handlers.click({target:{closest:()=>links[0]}});
  return {calls,links};
 }
 const a=simulate();assert.equal(a.calls.length,2);for(const l of a.links){const url=new URL(l.href);assert.equal(url.searchParams.get('utm_content'),'guia-prueba');assert.equal(url.searchParams.get('utm_source'),'guia');assert.equal(url.searchParams.get('utm_medium'),'editorial')}
 for(const options of [{privacy:true},{slug:'a'.repeat(101)}]){const b=simulate(options);assert.equal(b.calls.length,0);assert.ok(b.links.every(x=>!x.href.includes('utm_')))}
});
test('router y migraciones entregan guía y restringen el rendimiento al equipo',async()=>{
 const {readdirSync}=await import('node:fs'),{serve}=await import('../src/portal.js'),raw=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>/^\d+.*\.sql$/.test(n)).sort())raw.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 class Q{constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Q(this.sql,args)}first(){return raw.prepare(this.sql).get(...this.args)||null}all(){return {results:raw.prepare(this.sql).all(...this.args)}}run(){const q=raw.prepare(this.sql);return q.columns().length?this.all():{meta:{changes:q.run(...this.args).changes}}}}
 const DB={prepare:s=>new Q(s),batch(qs){raw.exec('BEGIN');try{const out=qs.map(q=>q.run());raw.exec('COMMIT');return out}catch(e){raw.exec('ROLLBACK');throw e}}};
 const env={DB,PUBLIC_BASE_URL:'https://sitio.example.org',ADMISSIONS_STAFF_EMAILS:'staff@example.org'};article(raw,'guia');
 const invoke=(path,opts={})=>serve(new Request('https://sitio.example.org'+path,opts),env,()=>'<html></html>');
 const page=await invoke('/guias/guia');assert.equal(page.status,200);assert.match(await page.text(),/src="\/articulos.js"/);
 assert.equal((await invoke('/api/editorial/medir',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug:'guia',event:'view'})})).status,204);
 assert.equal((await invoke('/api/staff/editorial/rendimiento')).status,403);
 const authorized=await invoke('/api/staff/editorial/rendimiento',{headers:{'oai-authenticated-user-id':'prueba','oai-authenticated-user-email':'staff@example.org'}});
 assert.equal(authorized.status,200);const data=await authorized.json();assert.equal(data.rows[0].views,1);
});
