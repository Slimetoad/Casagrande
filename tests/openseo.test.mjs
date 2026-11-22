import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {readOpenSeoMetrics,syncOpenSeo} from '../src/openseo.js';

const portal='https://portal.example.edu';
const query='maestría en ciencia de datos';
const slug='ciencia-de-datos',url=portal+'/programas/'+slug;
const programs=[
  {slug,title:'Maestría en Ciencia de Datos',shortTitle:'Ciencia de Datos',url},
  {slug:'auditoria',title:'Maestría en Contabilidad y Auditoría',shortTitle:'Contabilidad y Auditoría',url:portal+'/programas/auditoria'}
];
const names={
  list_projects:[],
  get_search_console_performance:['projectId','dimensions','startDate','endDate','filters','rowLimit','dataState','type'],
  list_saved_keywords:['projectId','limit'],
  get_rank_tracker:['projectId','trackerId','limit'],
  get_rank_history:['projectId','trackerId','device','runs','limit'],
  get_audit_pages:['projectId','page','limit','urlContains'],
  get_domain_overview:['projectId','domain','locationCode','languageCode'],
  research_keywords:['projectId','seedKeyword'],
  get_keyword_metrics:['projectId','keywords']
};
function schema(name,readOnly=true) {
  return {name,inputSchema:{type:'object',properties:Object.fromEntries(names[name].map(key=>[key,{}])),
    required:names[name].length?['projectId']:[]},annotations:{readOnlyHint:readOnly}};
}
const configured={PUBLIC_BASE_URL:portal,OPENSEO_API_KEY:'prueba-local',OPENSEO_DOMAIN:'portal.example.edu'};
function fixture(settings={}) {
  const raw=new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../openseo-v4.sql',import.meta.url),'utf8'));
  const prep=(sql,args=[])=>({
    bind:(...values)=>prep(sql,values),first:()=>raw.prepare(sql).get(...args)||null,
    all:()=>({results:raw.prepare(sql).all(...args)}),
    run(){const q=raw.prepare(sql);return q.columns().length?this.all():{meta:{changes:q.run(...args).changes}};}
  });
  const DB={prepare:prep,batch(statements) {
    raw.exec('BEGIN');
    try {const results=statements.map(statement=>statement.run());raw.exec('COMMIT');return results;}
    catch(error) {raw.exec('ROLLBACK');throw error;}
  }};
  return {raw,DB,env:{DB,...configured,...settings}};
}
const observations=[{program:slug,keyword:query,volume:720,difficulty:null,observedAt:'2026-11-22',market:'Ecuador',
  source:'OpenSEO · Keyword Generator',sourceUrl:'https://www.openseo.so/free-tools/keyword-generator'}];
const project={id:'prueba',name:'Proyecto Ecuador',domain:'portal.example.edu',locationCode:2218,languageCode:'es'};
const track={id:'a2d29c4c-6270-45f1-b32c-71f138af0001',domain:'portal.example.edu',locationCode:2218,languageCode:'es',
  lastCheckedAt:'2026-10-12T00:15:00Z'};
function response(body,result,sse=false,headers={}) {
  const env={jsonrpc:'2.0',id:body.id,result};
  if(sse)return new Response('event: message\r\ndata: '+JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{}})+'\r\n\r\nevent: message\r\ndata: '+JSON.stringify(env)+'\r\n\r\n',
    {headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8'}});
  return Response.json(env,{headers});
}
function setupMock(t,{badTracker=false,market=project,omit=null,pageRows=null,property='sc-domain:portal.example.edu'}={}) {
  const calls=[],filters=[];
  let study=0;
  t.mock.method(globalThis,'fetch',async(address,options)=>{
    assert.equal(address,'https://app.openseo.so/mcp');
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Authorization,'Bearer prueba-local');
    if(options.method==='DELETE') {
      calls.push('DELETE');
      assert.equal(options.headers['Mcp-Session-Id'],'sesion');
      return new Response(null,{status:204});
    }
    const body=JSON.parse(options.body);
    if(body.method==='initialize') {
      calls.push('initialize');assert.match(options.headers.Accept,/text\/event-stream/);
      return response(body,{protocolVersion:'2025-06-18',capabilities:{tools:{}}},true,{'Mcp-Session-Id':'sesion'});
    }
    assert.equal(options.headers['MCP-Protocol-Version'],'2025-06-18');
    assert.equal(options.headers['Mcp-Session-Id'],'sesion');
    if(body.method==='notifications/initialized') {
      calls.push('initialized');
      assert.equal('id' in body,false);
      return new Response(null,{status:202});
    }
    if(body.method==='tools/list') {
      calls.push('tools/list');
      return response(body,{tools:Object.keys(names).filter(name=>name!==omit).map(name=>schema(name,
        !['get_domain_overview','research_keywords','get_keyword_metrics'].includes(name) && !(badTracker && name==='get_rank_tracker')))});
    }
    assert.equal(body.method,'tools/call');
    const {name,arguments:args}=body.params;
    calls.push(name);
    let data;
    if(name==='list_projects')data={projects:[market]};
    else if(name==='get_search_console_performance') {
      filters.push(args.filters);
      const {startDate,endDate,dimensions}=args;
      const r=(keys,clicks,impressions,ctr,position)=>({keys,clicks,impressions,ctr,position});
      const dateRows=[r([startDate],5,70,0.0714,9),r([endDate],0,47,0,7)];
      const keywordRows=pageRows||[
        r([query,url],study?10:18,study?300:450,.04,study?9:7),
        r(['maestría en ciberseguridad',portal+'/programas/una-maestria-inexistente'],40,800,.05,5),
        r(['persona@example.edu',url],1,20,.05,100),
        r(['dato de otra página','https://otra.example.edu/programas/'+slug],1,20,.05,100)
      ];
      if(dimensions[0]==='query')study++;
      data={ok:true,siteUrl:property,dimensions,startDate,endDate,rows:dimensions[0]==='date'?dateRows:keywordRows,hasMore:false};
    } else if(name==='list_saved_keywords')data={rows:[{keyword:query,searchVolume:710,keywordDifficulty:12,cpc:null},{keyword:'maestría contabilidad y auditoría',searchVolume:null,cpc:0},{keyword:'guayaquil',searchVolume:7000}],totalCount:3};
    else if(name==='get_rank_tracker')data=args.trackerId?{config:track,results:{rows:[{keyword:query,mobile:{position:4,rankingUrl:url,lastCheckedAt:track.lastCheckedAt}}],run:{lastCheckedAt:track.lastCheckedAt}}}:{configs:[track,{...track,id:'usa',locationCode:2840}]};
    else if(name==='get_rank_history')data={trackerId:track.id,device:args.device,rows:[{keyword:query,history:[
      {checkedAt:'2026-10-05T00:12:00Z',checked:true,position:9},
      {checkedAt:track.lastCheckedAt,checked:true,position:4},
      {checkedAt:'2026-09-16T00:00:00Z',checked:false,position:null}
    ]}]};
    else if(name==='get_audit_pages')data={pages:[{url,statusCode:200,isIndexable:true,wordCount:1200,crawledAt:'2026-10-12T12:00:00Z'}],total:1};
    else assert.fail('La política de 0 créditos prohíbe esta lectura: '+name);
    return response(body,name==='list_saved_keywords'?{content:[{type:'text',text:JSON.stringify(data)}]}:{structuredContent:data},name==='get_rank_history');
  });
  return {calls,filters};
}

test('una instalación sin clave conserva observaciones públicas documentadas y no consulta al proveedor',async t=>{
  const {DB,env}=fixture({OPENSEO_API_KEY:null});
  t.mock.method(globalThis,'fetch',()=>assert.fail('La conexión está sin configurar'));
  assert.equal((await syncOpenSeo(env,programs)).status,'sin_configurar');
  const value=await readOpenSeoMetrics(DB,undefined,{programs,observations});
  const [one,two]=value.programs;
  assert.deepEqual(value.market,{country:'Ecuador',language:'es',locationCode:2218});
  assert.equal(value.project,null);
  assert.equal(one.keywords[0].observedAt,'2026-11-22T00:00:00.000Z');
  assert.equal(one.keywords[0].volume,720);
  assert.equal(one.keywords[0].impressions,null);
  assert.equal(one.keywords[0].sourceKey,'keyword_generator');
  assert.equal(two.keywords.length,0);
  assert.equal(value.sources.find(s=>s.key==='research').state,'bloqueado');
});
test('las observaciones públicas versionadas aparecen con su fecha y permanecen separadas del tráfico',async()=>{
  const result=await readOpenSeoMetrics(null);
  const ia=result.programs.find(item=>item.program==='maestria-en-ia-y-ciencia-de-datos');
  assert.equal(result.programs.length,34);
  assert.ok(result.generalKeywords.every(row=>row.program===null && row.impressions===null));
  const query=ia.keywords.find(item=>item.keyword==='maestría en inteligencia artificial');
  assert.deepEqual([query.volume,query.difficulty,query.impressions,query.observedAt],[720,0,null,'2026-11-22T00:00:00.000Z']);
});
test('descubre los esquemas antes de leer, geofiltra, guarda observaciones y conserva series verificables',async t=>{
  const {DB,env}=fixture();
  const {calls,filters}=setupMock(t);
  const result=await syncOpenSeo(env,programs);
  assert.equal(result.status,'completado');
  assert.deepEqual(calls.slice(0,4),['initialize','initialized','tools/list','list_projects']);
  assert.deepEqual(calls.filter(c=>['get_domain_overview','research_keywords','get_keyword_metrics'].includes(c)),[]);
  assert.equal(filters.length,3);
  assert.ok(filters.every(row=>row[0].dimension==='country'&&row[0].expression==='ecu'));
  assert.equal(filters.filter(row=>row[1]?.expression==='/programas/').length,2);
  const value=await readOpenSeoMetrics(DB,slug,{programs,observations});
  assert.equal(value.programs.length,1);
  const [one]=value.programs;
  assert.equal(one.keywords.length,3);
  assert.equal(one.keywords.some(v=>v.sourceKey==='keyword_generator'),false);
  assert.equal(one.keywords.find(v=>v.sourceKey==='saved_keywords').volume,710);
  const gsc=one.keywords.find(v=>v.sourceKey==='gsc');
  assert.equal(gsc.clicks,18);
  assert.equal(gsc.impressions,450);
  assert.equal(gsc.volume,null);
  assert.equal(gsc.trend.length,2);
  const rank=one.keywords.find(v=>v.sourceKey==='rank');
  assert.deepEqual(rank.trend.map(v=>v.position),[9,4]);
  assert.equal(rank.device,'mobile');
  assert.equal(one.audit.statusCode,200);
  assert.equal(value.domain.clicks,5);
  assert.equal(value.domain.impressions,117);
  assert.equal(value.domain.daysWithRows,2);
  assert.equal(value.domain.estimatedTraffic,null);
  const count=calls.length;
  assert.equal((await syncOpenSeo(env,programs)).status,'en_pausa');
  assert.equal(calls.length,count);
});
test('bloquea cambios del esquema de un proveedor y mantiene disponibles las otras fuentes',async t=>{
  const {DB,env}=fixture();
  const {calls}=setupMock(t,{badTracker:true,omit:'get_audit_pages',market:{...project,languageCode:'en'}});
  const result=await syncOpenSeo(env,programs);
  assert.equal(result.status,'completado');
  const sources=(await readOpenSeoMetrics(DB,slug,{programs,observations})).sources;
  assert.equal(sources.find(s=>s.key==='rank').state,'no_disponible');
  assert.equal(sources.find(s=>s.key==='saved_keywords').state,'no_disponible');
  assert.equal(sources.find(s=>s.key==='audit').state,'no_disponible');
  assert.equal(sources.find(s=>s.key==='gsc').state,'disponible');
  assert.equal(calls.includes('get_rank_tracker'),false);
  assert.equal(calls.includes('list_saved_keywords'),false);
});
test('los errores de autorización conservan un mensaje seguro y no siguen redirecciones',async t=>{
  const {env,DB}=fixture({OPENSEO_AUTH_HEADER:'x-api-key'});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'https://app.openseo.so/mcp');
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers['x-api-key'],'prueba-local');
    assert.equal(options.headers.Authorization,undefined);
    return Response.json({secret:'No exponer la clave prueba-local'},{status:401});
  });
  assert.equal((await syncOpenSeo(env,programs)).status,'error');
  const data=await readOpenSeoMetrics(DB,slug,{programs,observations});
  assert.equal(data.sources.find(s=>s.key==='proyecto').state,'no_disponible');
  assert.doesNotMatch(JSON.stringify(data),/prueba-local|No exponer/);
});
test('las fichas flex se distinguen por su identificador institucional, sin atribuirles la página compartida',async t=>{
  const {env,DB}=fixture({OPENSEO_DOMAIN:'casagrande.edu.ec'});
  const a='https://posgrados.casagrande.edu.ec/maestrias?action=vermaestria&id=ABCD';
  const b='https://posgrados.casagrande.edu.ec/maestrias?action=vermaestria&id=WXYZ';
  const targets=[{...programs[0],url:a},{...programs[1],url:b}];
  setupMock(t,{market:{...project,domain:'casagrande.edu.ec'},property:'sc-domain:casagrande.edu.ec',pageRows:[
    {keys:['consulta para primera maestría',a+'&utm_source=fuente-no-retener'],clicks:1,impressions:100,position:7},
    {keys:['consulta para segunda maestría',b],clicks:9,impressions:900,position:5},
    {keys:['página compartida','https://posgrados.casagrande.edu.ec/maestrias'],clicks:400,impressions:4000,position:8}
  ]});
  assert.equal((await syncOpenSeo(env,targets)).status,'completado');
  const result=await readOpenSeoMetrics(DB,undefined,{programs:targets,observations:[]});
  assert.deepEqual(result.programs.map(item=>item.keywords.find(keyword=>keyword.sourceKey==='gsc')?.impressions),[100,900]);
  assert.doesNotMatch(JSON.stringify(result),/fuente-no-retener|página compartida/);
});
