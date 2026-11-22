import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleIntelligence,runIntelligenceCycle} from '../src/intelligence.js';

const programs=[
  {slug:'datos',title:'Maestría en Ciencia de Datos',shortTitle:'Ciencia de Datos'},
  {slug:'sed',title:'Maestría en Seguridad Digital',shortTitle:'Seguridad Digital'}
];
const source='Google Search Console';
const earlier=days=>new Date(Date.now()-days*86400000).toISOString();
const modelAnswer=value=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

function fixture() {
  const raw=new DatabaseSync(':memory:');
  for(const name of ['schema','growth','operations-v2','intelligence'])raw.exec(readFileSync(new URL('../'+name+'.sql',import.meta.url),'utf8'));
  const bind=(sql,args)=>{
    const stmt=raw.prepare(sql);
    return {
      first:()=>stmt.get(...args),
      all:()=>({results:stmt.all(...args)}),
      execute:()=>{const rows=stmt.columns().length>0;return rows?{results:stmt.all(...args)}:{meta:{changes:stmt.run(...args).changes}};},
      run:()=>({meta:{changes:stmt.run(...args).changes}})
    };
  };
  const env={DB:{prepare(sql){return {bind(...args){return bind(sql,args);}};},
    async batch(items){raw.exec('BEGIN');try{const result=items.map(item=>item.execute());raw.exec('COMMIT');return result;}catch(error){raw.exec('ROLLBACK');throw error;}}}};
  const date=earlier(4);
  for(const s of [source,'Semrush'])raw.prepare("INSERT INTO growth_sync VALUES(?,?,'ok',2,'Completado')").run(s,date);
  const op=raw.prepare("INSERT INTO seo_opportunities VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  op.run('gsc','requisitos de maestría en ciencia de datos',source,5,2300,5/2300,9,null,88,earlier(31).slice(0,10),earlier(4).slice(0,10),date);
  op.run('usr','maestría recomendada por alguien desconocido','Semrush',null,null,null,76,300,15,null,date.slice(0,10),date);
  op.run('semrush','costo maestría en seguridad digital','Semrush',null,null,null,12,1200,25,null,date.slice(0,10),date);
  raw.prepare(`INSERT INTO seo_articles (id,slug,opportunity_id,program,title,summary,body,source_query,source_url,status,created_at,updated_at)
    VALUES('a','guia','other','datos','Título de guía','Resumen','Redacción','documentos de ciencia de datos','https://ucg.example','published',?,?)`).run(date,date);
  const insert=raw.prepare(`INSERT INTO leads (id,name,email,program,source,stage,created_at,updated_at,pref_token)
    VALUES(?,?,?,?,'programa',?,?,?,?)`);
  insert.run('lead-a','Nombre confidencial','secret@example.org','datos','Matriculado',date,date,'a');
  insert.run('lead-b','Nombre confidencial','other@example.org','sed','Matriculado',date,date,'b');
  raw.prepare("INSERT INTO admissions_stage_evidence VALUES('e','lead-a','Matriculado','Acta de prueba',?,'Equipo')").run(date);
  raw.exec("INSERT INTO admissions_cases (lead_id,enrollment_evidence_id) VALUES('lead-a','e')");
  insert.run('lead-c','Nombre confidencial','third@example.org','datos','Nuevo',date,date,'c');
  function receipt(id,lead,program,context={},created=earlier(2)) {
    raw.prepare(`INSERT INTO lead_submissions (id,request_key,lead_id,program,source,context,email_choice,voice_choice,consent_version,created_at)
      VALUES(?,?,?,?,'programa',?,0,0,'v',?)`).run(id,id,lead,program,JSON.stringify(context),created);
  }
  receipt('a1','lead-a','datos',{utm_source:'confidencial'});
  receipt('a2','lead-a','datos');
  receipt('a3','lead-a','sed');
  receipt('b1','lead-b','sed');
  receipt('c1','lead-c','datos',{},earlier(50));
  return {env,raw,receipt};
}
async function request(env,path='',input,operator='Equipo') {
  const url=new URL('https://posgrados.example/api/staff/intelligence'+path);
  return handleIntelligence(new Request(url,input?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}:undefined),env,url,programs,operator);
}

test('el tablero de personal distingue hechos medidos, estimaciones, borradores y atribución parcial',async()=>{
  const {env,raw}=fixture();
  assert.equal((await request(env,'',null,null)).status,403);
  assert.equal((await request(env,'/brief')).status,405);
  const response=await request(env);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const board=await response.json();
  assert.equal(board.window.days,28);
  const [gsc]=board.candidates;
  assert.equal(gsc.id,'seo:gsc');
  assert.equal(gsc.metrics.impressions,2300);
  assert.equal(gsc.metrics.volume,null);
  assert.equal(gsc.metrics.leads,1);
  assert.equal(gsc.metrics.requests,2);
  assert.equal(gsc.metrics.enrolled,1);
  assert.equal(gsc.metrics.attributed,1);
  assert.equal(gsc.content.status,'published');
  assert.equal(gsc.content.related,true);
  assert.match(gsc.action,/Revisar la guía publicada/);
  const estimated=board.candidates.find(c=>c.id==='seo:semrush');
  assert.equal(estimated.metrics.volume,1200);
  assert.equal(estimated.metrics.impressions,null);
  assert.equal(estimated.metrics.leads,2);
  assert.equal(estimated.metrics.enrolled,0);
  assert.equal(board.candidates.find(c=>c.id==='seo:usr').program,null);
  assert.equal((await request(env,'/campaigns',{candidateId:'seo:usr'})).status,422);
  assert.doesNotMatch(JSON.stringify(board),/secret@example|Nombre confidencial|utm_source/);
  raw.exec("UPDATE growth_sync SET status='error' WHERE source='Google Search Console'");
  const updated=await (await request(env)).json();
  assert.equal(updated.sources.find(s=>s.source===source).status,'error');
  assert.equal(updated.candidates.some(c=>c.id==='seo:gsc'),false);
});

test('una campaña requiere decisiones humanas, cuenta personas únicas en la ventana y conserva historia',async()=>{
  const {env,raw,receipt}=fixture();
  const first=await (await request(env,'/campaigns',{candidateId:'seo:gsc'})).json();
  const {id}=first.campaign;
  assert.equal(first.campaign.state,'propuesta');
  assert.equal(first.campaign.launchUrl,null);
  assert.equal((await request(env,'/campaigns/'+id,{action:'iniciar',revision:1})).status,409);
  const duplicate=await (await request(env,'/campaigns',{candidateId:'seo:gsc'})).json();
  assert.equal(duplicate.campaign.id,id);
  const approved=await (await request(env,'/campaigns/'+id,{action:'aprobar',revision:1})).json();
  assert.equal(approved.campaign.state,'aprobada');
  assert.equal(new URL(approved.campaign.launchUrl,'https://posgrados.example').searchParams.get('utm_campaign'),id);
  assert.equal((await request(env,'/campaigns/'+id,{action:'iniciar',revision:1})).status,409);
  const started=await (await request(env,'/campaigns/'+id,{action:'iniciar',revision:2})).json();
  assert.equal(started.campaign.state,'activa');
  assert.equal(started.campaign.measurement.baselineProgramLeads,1);
  raw.prepare('UPDATE intelligence_campaigns SET started_at=?,measured_at=? WHERE id=?').run(earlier(1),earlier(1),id);
  receipt('campaign1','lead-a','datos',{utm_campaign:id},earlier(.5));
  receipt('campaign2','lead-a','datos',{utm_campaign:id},earlier(.25));
  receipt('wrong-program','lead-b','sed',{utm_campaign:id},earlier(.5));
  receipt('too-early','lead-c','datos',{utm_campaign:id},earlier(2));
  receipt('wrong-marker','lead-c','datos',{utm_source:id},earlier(.5));
  assert.equal((await runIntelligenceCycle(env)).measured,1);
  const measured=(await (await request(env)).json()).campaigns.find(c=>c.id===id);
  assert.equal(measured.measurement.leadCount,1);
  assert.equal(measured.measurement.requestCount,2);
  assert.equal(measured.measurement.enrolledCount,1);
  const closed=await (await request(env,'/campaigns/'+id,{action:'cerrar',revision:3})).json();
  assert.equal(closed.campaign.state,'cerrada');
  assert.deepEqual(new Set(closed.campaign.history.map(h=>h.action)),new Set(['proponer','aprobar','iniciar','cerrar']));
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM seo_articles').get().n,1);
});

test('el modelo recibe solo evidencia permitida y conserva una propuesta revisada con trazabilidad',async t=>{
  const {env,raw}=fixture();
  raw.exec("UPDATE seo_opportunities SET query='documentos de ciencia de datos de Persona Nombre' WHERE id='gsc'");
  Object.assign(env,{LLM_PROVIDER:'openai',OPENAI_API_KEY:'prueba',OPENAI_MODEL:'prueba'});
  let prompt;
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    prompt=JSON.parse(options.body).input;
    return modelAnswer('medicion');
  });
  const reviewed=await (await request(env,'/brief',{candidateId:'seo:gsc'})).json();
  assert.equal(reviewed.brief.modelReview.status,'aplicado');
  assert.match(reviewed.brief.action,/enlace identificado/);
  assert.match(prompt,/Ciencia de Datos/);
  assert.doesNotMatch(prompt,/Persona Nombre|59312345678|secret|documentos de ciencia de datos/);
  assert.equal((await request(env,'/campaigns',{candidateId:'seo:gsc',reviewId:reviewed.reviewId},'Otro equipo')).status,409);
  const accepted=await (await request(env,'/campaigns',{candidateId:'seo:gsc',reviewId:reviewed.reviewId})).json();
  assert.equal(accepted.campaign.brief.modelReview.status,'aplicado');
  const audit=raw.prepare('SELECT actor,subject,provider,status,chosen FROM intelligence_audit').get();
  assert.equal(audit.actor,'Equipo');
  assert.equal(audit.provider,'openai');
  assert.equal(audit.status,'aplicado');
  assert.equal(JSON.parse(audit.chosen)[0],'medicion');
});
