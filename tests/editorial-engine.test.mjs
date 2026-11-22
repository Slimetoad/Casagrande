import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync} from 'node:fs';
import {programs} from '../src/catalog.js';
import {handleEditorial,publicEditorial,runEditorialCycle} from '../src/editorial-engine.js';
import {handleIntegrations} from '../src/integrations.js';
import {serve} from '../src/portal.js';

const date=new Date('2026-11-23T15:00:00.000Z');
const campus='https://casagrande.edu.ec';
const portal='https://posgrados-portal.example.org';
const model='claude-haiku-5-5';
const path='/api/staff/editorial';

function fixture(extra={}) {
  const raw=new DatabaseSync(':memory:');
  const files=['schema.sql','growth.sql','operations-v2.sql','editorial-v4.sql','openseo-v4.sql'];
  for(const file of files) {
    const url=new URL('../'+file,import.meta.url);
    if(existsSync(url))raw.exec(readFileSync(url,'utf8'));
  }
  class Query {
    constructor(sql,args=[]) {this.sql=sql;this.args=args;}
    bind(...args) {return new Query(this.sql,args);}
    first() {return raw.prepare(this.sql).get(...this.args) || null;}
    all() {return {results:raw.prepare(this.sql).all(...this.args)};}
    run() {
      const q=raw.prepare(this.sql);
      return q.columns().length?this.all():{meta:{changes:q.run(...this.args).changes},results:[]};
    }
  }
  const DB={prepare:sql=>new Query(sql),batch(queries) {
    raw.exec('BEGIN');
    try {const results=queries.map(query=>query.run());raw.exec('COMMIT');return results;}
    catch(err) {raw.exec('ROLLBACK');throw err;}
  }};
  return {raw,env:{DB,PUBLIC_BASE_URL:portal,SEO_EDITORIAL_AUTOPUBLISH:'true',...extra}};
}
const cycle=(env,now=date)=>runEditorialCycle(env,programs,{now});
const afterward=h=>new Date(date.valueOf()+h*3600000);
async function request(env,input,operator='editor@example.org') {
  const url=new URL(path,portal),body=input===undefined?undefined:JSON.stringify(input);
  return handleEditorial(new Request(url,{method:body?'POST':'GET',body,headers:{'content-type':'application/json'}}),env,url,programs,operator);
}

test('el plan cubre los 34 programas, publica con cadencia y distingue el portal del CMS',async()=>{
  const {env,raw}=fixture();
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM seo_editorial_settings').get().n,0);
  const preview=await publicEditorial(env,programs);
  assert.equal(preview.plan.length,34);
  assert.equal(preview.metrics.publishedPortal,0);
  assert.equal(preview.plan.some(item=>item.evidence?.crm),false);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM seo_editorial_settings').get().n,0);
  const initial=await cycle(env);
  assert.equal(initial.publishedPortal,1);
  assert.equal(initial.publishedCms,0);
  const first=raw.prepare("SELECT * FROM seo_articles WHERE status='published'").get();
  assert.ok(first.body.split(/\s+/).length>190);
  assert.equal(first.program,'maestria-en-ia-y-ciencia-de-datos');
  assert.match(first.body,/720 búsquedas mensuales/);
  assert.match(first.source_url,/^https:\/\/([a-z]+\.)?casagrande\.edu\.ec\//);
  assert.equal((await cycle(env,afterward(2))).publishedPortal,0);
  assert.equal((await cycle(env,afterward(48))).publishedPortal,1);
  const snapshot=await publicEditorial(env,programs);
  assert.equal(snapshot.plan.length,34);
  assert.equal(snapshot.guides.length,2);
  assert.equal(snapshot.metrics.publishedPortal,2);
  assert.equal(snapshot.metrics.publishedOfficial,0);
  assert.equal(snapshot.metrics.awaitingCms,2);
  assert.ok(snapshot.guides.every(guide=>guide.stats===null));
  assert.ok(snapshot.plan.every(item=>!item.evidence.crm));
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM seo_editorial_cms WHERE status='pending'").get().n,2);
});

test('el artículo de IA y su evidencia pública se leen en el portal sin revelar mediciones privadas',async()=>{
  const {env,raw}=fixture();
  await cycle(env);
  const item=raw.prepare("SELECT id,slug FROM seo_articles WHERE status='published'").get();
  const publicApi=await serve(new Request(portal+'/api/editorial/publico'),env);
  assert.equal(publicApi.status,200);
  const out=await publicApi.json();
  const ai=out.plan.find(proposal=>proposal.program==='maestria-en-ia-y-ciencia-de-datos');
  assert.equal(ai.articleSlug,item.slug);
  assert.equal(ai.evidence.search.keyword,'maestría en inteligencia artificial');
  assert.equal(ai.evidence.search.volume,720);
  assert.equal(ai.evidence.search.difficulty,0);
  assert.equal(ai.evidence.search.type,'estimate');
  assert.equal(ai.evidence.search.sourceUrl,'https://openseo.so/keyword-generator');
  assert.equal(ai.evidence.crm,undefined);
  const article=await serve(new Request(portal+'/guias/'+item.slug),env);
  assert.equal(article.status,200);
  const html=await article.text();
  assert.match(html,/Cómo elegir una maestría en inteligencia artificial en Ecuador/);
  assert.match(html,/720 búsquedas mensuales/);
  assert.match(html,/\/programas\/maestria-en-ia-y-ciencia-de-datos/);
  const legacy=new URL(portal+'/api/staff/articles/'+item.id);
  const change=new Request(legacy,{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"archive"}'});
  assert.equal((await handleIntegrations(change,env,legacy,programs,'editor@example.org')).status,409);
});

test('Haiku ordena solo bloques admitidos y la simulación concurrente no repite la generación',async t=>{
  const {env,raw}=fixture({LLM_PROVIDER:'anthropic',ANTHROPIC_API_KEY:'simulada',ANTHROPIC_MODEL:model});
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.anthropic.com/v1/messages');
    const payload=JSON.parse(options.body);
    assert.equal(payload.model,model);
    const info=JSON.parse(payload.messages[0].content);
    assert.ok(info.fuente.includes('casagrande.edu.ec'));
    assert.ok(info.bloques.length>=3);
    assert.doesNotMatch(payload.messages[0].content,/example\.org|leads|matriculados/);
    await new Promise(resolve=>setTimeout(resolve,10));
    return Response.json({content:[{type:'text',text:JSON.stringify({orden:info.bloques.map(block=>block.id).reverse(),
      preguntas:['¿Cómo evaluarías un proyecto de inteligencia artificial con los datos de tu organización?']})}]});
  });
  const results=await Promise.all([cycle(env),cycle(env)]);
  assert.equal(results.reduce((sum,result)=>sum+result.publishedPortal,0),1);
  assert.equal(calls,1);
  const copied=raw.prepare("SELECT generation,draft_body FROM seo_editorial_plan WHERE status='published'").get();
  assert.equal(JSON.parse(copied.generation).provider,'Anthropic');
  assert.equal(JSON.parse(copied.generation).model,model);
  assert.equal(JSON.parse(copied.generation).scope,'orden_y_preguntas');
  assert.match(copied.draft_body,/Cómo evaluarías un proyecto de inteligencia artificial con los datos de tu organización/);
  assert.equal((await cycle(env)).publishedPortal,0);
  assert.equal(calls,1);
});

test('una respuesta de modelo que añade hechos se reemplaza por el contenido editorial institucional',async t=>{
  const {env,raw}=fixture({LLM_PROVIDER:'anthropic',ANTHROPIC_API_KEY:'simulada',ANTHROPIC_MODEL:model});
  t.mock.method(globalThis,'fetch',async()=>Response.json({content:[{type:'text',text:'{"orden":[1],"oferta":"Beca inventada y matrícula garantizada"}'}]}));
  assert.equal((await cycle(env)).publishedPortal,1);
  const row=raw.prepare("SELECT generation,draft_body FROM seo_editorial_plan WHERE status='published'").get();
  assert.equal(JSON.parse(row.generation).source,'catalogo');
  assert.doesNotMatch(row.draft_body,/Beca inventada|matrícula garantizada/);
});

test('editar una publicación guarda el borrador privado y publicar una nueva versión requiere revisión vigente',async()=>{
  const {env,raw}=fixture();
  await cycle(env);
  assert.equal((await request(env,undefined,null)).status,403);
  const initial=await (await request(env)).json();
  assert.equal(initial.plan.length,34);
  const item=initial.plan.find(row=>row.articleSlug);
  const privateDraft='Texto para edición privada. '.repeat(15);
  const save=await request(env,{action:'save',id:item.id,revision:item.revision,title:'Material editorial revisado',
    summary:'Resumen revisado del contenido editorial para la orientación.',body:privateDraft});
  assert.equal(save.status,200,JSON.stringify(await save.clone().json()));
  const edited=(await save.json()).item;
  assert.equal(edited.article.body,privateDraft.trim());
  assert.equal(edited.hasPrivateDraft,true);
  assert.doesNotMatch(raw.prepare('SELECT body FROM seo_articles WHERE id=?').get(item.articleId).body,/Texto para edición privada/);
  assert.equal((await request(env,{action:'publish',id:item.id,revision:item.revision})).status,409);
  const publish=await request(env,{action:'publish',id:item.id,revision:edited.revision});
  assert.equal(publish.status,200,JSON.stringify(await publish.clone().json()));
  assert.equal(raw.prepare('SELECT body FROM seo_articles WHERE id=?').get(item.articleId).body,privateDraft.trim());
  assert.deepEqual(raw.prepare('SELECT version,status FROM seo_editorial_cms WHERE plan_id=? ORDER BY version').all(item.id).map(r=>[r.version,r.status]),
    [[1,'superseded'],[2,'pending']]);
  await request(env,{action:'pause'});
  assert.equal((await cycle(env,afterward(48))).status,'en_pausa');
});

test('el CMS recibe la versión publicada y conserva una sola clave incluso al reintentar un 429',async t=>{
  const {env,raw}=fixture({SEO_INSTITUTIONAL_CMS_URL:campus+'/api/guias/v1',SEO_INSTITUTIONAL_CMS_TOKEN:'token-local'});
  const keys=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,campus+'/api/guias/v1');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.authorization,'Bearer token-local');
    const key=options.headers['idempotency-key'],payload=JSON.parse(options.body);
    keys.push(key);
    assert.equal(payload.idempotencyKey,key);
    assert.equal(payload.version,1);
    assert.ok(payload.article.portalUrl.startsWith(portal+'/guias/'));
    return keys.length===1?new Response('',{status:429}):Response.json({status:'published',idempotencyKey:key,version:1,receiptId:'recibo-001',url:campus+'/guias/'+payload.article.slug});
  });
  assert.equal((await cycle(env)).cms,'retry');
  assert.equal((await cycle(env,afterward(0.2))).publishedCms,0);
  assert.equal((await cycle(env,afterward(1))).publishedCms,1);
  assert.equal((await cycle(env,afterward(2))).publishedCms,0);
  assert.equal(keys.length,2);
  assert.equal(keys[0],keys[1]);
  const job=raw.prepare('SELECT * FROM seo_editorial_cms').get();
  assert.equal(job.status,'published');
  assert.equal(job.attempts,2);
  assert.equal(job.receipt_id,'recibo-001');
  assert.equal((await publicEditorial(env,programs)).metrics.publishedOfficial,1);
});

test('el CMS solo acepta recibos institucionales y no repite un resultado ambiguo',async t=>{
  const {env,raw}=fixture({SEO_INSTITUTIONAL_CMS_URL:campus+'/api/guias/v1',SEO_INSTITUTIONAL_CMS_TOKEN:'token-local'});
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;
    return Response.json({status:'published',idempotencyKey:options.headers['idempotency-key'],version:1,receiptId:'recibo-001',url:campus+'.otra.org/guias/uno'});
  });
  assert.equal((await cycle(env)).cms,'uncertain');
  assert.equal((await cycle(env,afterward(1))).publishedCms,0);
  assert.equal(calls,1);
  assert.equal(raw.prepare('SELECT official_url FROM seo_editorial_cms').get().official_url,null);
  const foreign=fixture({SEO_INSTITUTIONAL_CMS_URL:'https://casagrande.edu.ec.otra.org/api/guias',SEO_INSTITUTIONAL_CMS_TOKEN:'token-local'});
  assert.equal((await cycle(foreign.env)).cms,'invalid');
  assert.equal(calls,1);
});

test('las nuevas señales privadas comprobadas suman temas distintos y quedan congeladas sin otra observación',async()=>{
  const {env,raw}=fixture();
  const ai='maestria-en-ia-y-ciencia-de-datos';
  const project='proyecto-ucg';
  const source='saved_keywords';
  await cycle(env);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM seo_editorial_plan WHERE kind='signal'").get().n,0);
  const open=raw.prepare('INSERT INTO openseo_sources(key,project_id,state,detail,payload) VALUES(?,?,?,?,?)');
  open.run('proyecto',project,'disponible','Proyecto autenticado',JSON.stringify({id:project,name:'UCG'}));
  open.run(source,project,'disponible','Palabras guardadas',null);
  const saved=raw.prepare('INSERT INTO openseo_keywords(project_id,source,program,keyword_key,payload) VALUES(?,?,?,?,?)');
  function add(query,day,volume) {
    saved.run(project,source,ai,query,JSON.stringify({keyword:query,sourceKey:source,source:'OpenSEO · Palabras guardadas',volume,observedAt:day}));
  }
  const cost='precio de la maestría en inteligencia artificial';
  add(cost,'2026-11-24',1000);
  add('costo maestría en inteligencia artificial', '2026-11-24',650);
  add('horarios maestría en inteligencia artificial', '2026-11-24',350);
  await Promise.all([cycle(env,afterward(30)),cycle(env,afterward(30))]);
  const follow=raw.prepare("SELECT * FROM seo_editorial_plan WHERE kind='signal'").all();
  assert.equal(follow.length,1);
  assert.equal(follow[0].signal_key,'inversion');
  assert.equal(follow[0].search_question,cost);
  assert.match(follow[0].title,/presupuesto/);
  assert.ok(follow[0].scheduled_at);
  const publishAt=new Date(follow[0].scheduled_at);
  await cycle(env,publishAt);
  const publicApi=await publicEditorial(env,programs);
  const displayed=publicApi.plan.find(row=>row.id===follow[0].id);
  assert.ok(displayed.articleSlug);
  assert.equal(displayed.evidence.search,null);
  const body=raw.prepare('SELECT body FROM seo_articles WHERE slug=?').get(displayed.articleSlug).body;
  assert.match(body,/Separa la inversión académica/);
  assert.doesNotMatch(body,/1000 búsquedas mensuales/);
  await cycle(env,afterward(7*24+2));
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM seo_editorial_plan WHERE kind='signal'").get().n,1);
  add('modalidad maestría en inteligencia artificial nueva', '2026-11-30',400);
  await cycle(env,afterward(7*24+3));
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM seo_editorial_plan WHERE kind='signal'").get().n,2);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM seo_editorial_plan WHERE kind='signal' AND signal_key='horarios'").get().n,1);
});
