import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSeoInsights} from '../src/seo-insights.js';

const env = {ANTHROPIC_API_KEY:'test-key',ANTHROPIC_MODEL:'claude-haiku-5-5',LLM_PROVIDER:'anthropic'};
const evidence = {days:30, rows:[
  {id:'g:datos',kind:'guia',title:'Elegir una maestría en datos',metrics:{views:15,ctaClicks:0,leads:null,searchVolume:30,unknown:'personal privado'},sensitive:'no enviar'},
  {id:'p:edu',kind:'programa',title:'Educación',keyword:'maestría en educación',observedAt:'2026-11-22',metrics:{searchVolume:40,views:null}}
]};
const finding = {title:'Revisar la invitación a consultar',hypothesis:'La llamada a la acción podría quedar lejos de las dudas del lector.',nextStep:'Contrasta la ubicación del enlace con la pregunta principal de la guía.',
  references:[{id:'g:datos',metric:'views'},{id:'g:datos',metric:'ctaClicks'}]};

function response(findings) {
  return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({findings})}]});
}

test('usa Claude con agregados permitidos, anonimiza la pregunta y compone hechos desde las filas',async t=>{
  let sent;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'https://api.anthropic.com/v1/messages');
    sent=JSON.parse(options.body);
    return response([finding]);
  });
  const result=await buildSeoInsights(env,evidence,'¿Qué ocurre con las vistas? Escribe a privado@example.org.');
  assert.equal(sent.model,env.ANTHROPIC_MODEL);
  assert.doesNotMatch(sent.messages[0].content,/no enviar|privado@example|personal privado/);
  assert.equal(result.mode,'modelo');
  assert.deepEqual(result.findings[0].evidenceIds,['g:datos']);
  assert.match(result.findings[0].interpretation,/vistas registradas: 15/);
  assert.match(result.findings[0].interpretation,/llamadas a la acción: 0/);
});

test('descarta fuentes fuera del filtro, campos no medidos, enlaces y cifras inventadas',async t=>{
  const invalid=[
    {...finding,references:[{id:'fuera',metric:'views'}]},
    {...finding,references:[{id:'g:datos',metric:'leads'}]},
    {...finding,hypothesis:'La posición mejoró un 45 por ciento.'},
    {...finding,nextStep:'Comprueba https://example.org.'},
    {...finding,references:[{id:'g:datos',metric:'constructor'}]}
  ];
  t.mock.method(globalThis,'fetch',async()=>response(invalid));
  const result=await buildSeoInsights(env,evidence,'vistas');
  assert.equal(result.mode,'descriptivo');
  assert.equal(result.reason,'no_disponible');
  assert.equal(result.findings.length,1);
  assert.doesNotMatch(JSON.stringify(result),/fuera|example.org|45/);
});

test('ausencia del modelo conserva demanda de mercado y su fecha, al margen del período de vistas',async()=>{
  const result=await buildSeoInsights({},evidence,'volumen de búsqueda');
  assert.equal(result.reason,'sin_modelo');
  assert.deepEqual(result.findings[0].evidenceIds,['p:edu']);
  assert.match(result.findings[0].interpretation,/40, observación del 2026-11-22/);
  assert.doesNotMatch(result.findings[0].interpretation,/últimos 30 días/);
});
test('distingue cero del indicador ausente; evita llamadas sin evidencia para la pregunta',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async()=>{throw new Error('sin conectividad')});
  const missing=await buildSeoInsights(env,evidence,'¿Qué matrículas se atribuyen?');
  assert.deepEqual(missing,{mode:'descriptivo',reason:'sin_datos',findings:[]});
  assert.equal(fetch.mock.callCount(),0);
  const zero=await buildSeoInsights(env,evidence,'CTA');
  assert.equal(fetch.mock.callCount(),1);
  assert.equal(zero.reason,'no_disponible');
  assert.match(zero.findings[0].interpretation,/acción: 0/);
});

test('Search Console conserva la pareja consulta y URL y su período real; no adopta los días del selector',async()=>{
  const row = {...evidence.rows[0],searchObservation:{keyword:'maestría en datos',periodStart:'2026-06-01',periodEnd:'2026-06-07',ctr:0.12,impressions:100,clicks:12}};
  const result = await buildSeoInsights({}, {days:90,rows:[row]},'¿Cuál es el CTR?');
  assert.match(result.findings[0].interpretation,/«maestría en datos».+CTR de búsqueda: 12 %.+2026-06-01 a 2026-06-07/);
  assert.doesNotMatch(result.findings[0].interpretation,/90 días/);
});

test('interpreta cambios absolutos en ventanas consecutivas y no divide por una base cero',async t=>{
  const row = {...evidence.rows[0],previous:{start:'2026-10-01',end:'2026-10-07',views:0,ctaClicks:4}};
  const range = {days:7,start:'2026-10-08',end:'2026-10-14',rows:[row]};
  const mocked = t.mock.method(globalThis,'fetch',async(url, options)=>{
    const prompt = JSON.parse(JSON.parse(options.body).messages[0].content);
    assert.equal(prompt.filas[0].metrics.viewsChange,15);
    return response([{...finding,references:[{id:row.id,metric:'viewsChange'}]}]);
  });
  const result=await buildSeoInsights(env,range,'¿Cómo cambiaron las visitas?');
  assert.equal(result.mode,'modelo');
  assert.deepEqual(result.findings[0].evidenceIds,[row.id]);
  assert.match(result.findings[0].interpretation,/0 \(2026-10-01 a 2026-10-07\) → 15 \(2026-10-08 a 2026-10-14\). Cambio absoluto: \+15/);
  assert.doesNotMatch(result.findings[0].interpretation,/%/);
  const decline=await buildSeoInsights({},range,'Variación de clics de CTA');
  assert.match(decline.findings[0].interpretation,/Cambio absoluto: -4/);
  assert.equal(mocked.mock.callCount(),1);
  for (const previous of [undefined,{...row.previous,end:'2026-10-03'},{...row.previous,views:null}]) {
    const gap=await buildSeoInsights({}, {...range,rows:[{...row,previous}]},'variación de visitas');
    assert.equal(gap.reason,'sin_datos');
  }
});

test('una pregunta mixta conserva vistas disponibles cuando faltan matrículas',async t=>{
  t.mock.method(globalThis,'fetch',async()=>response([finding]));
  const result=await buildSeoInsights(env,evidence,'¿Qué matrículas y vistas hay?');
  assert.equal(result.mode,'modelo');
  assert.match(result.findings[0].interpretation,/vistas registradas: 15/);
  const plain=await buildSeoInsights({},evidence,'¿Qué matrículas y vistas hay?');
  assert.equal(plain.reason,'sin_modelo');
  assert.match(plain.findings[0].interpretation,/vistas registradas: 15/);
});

test('una referencia de término secundario usa su propio volumen y fecha incluso al comparar términos de una misma página',async t=>{
  const primary='maestría en inteligencia artificial', secondary=primary+' precio';
  const row = {...evidence.rows[1],keyword:primary,keywords:[
    {keyword:primary,searchVolume:720,observedAt:'2026-10-01'},
    {keyword:secondary,searchVolume:10,observedAt:'2026-11-22'}],metrics:{searchVolume:720}};
  const data={days:7, rows:[row]};
  let keywords=[secondary];
  const fetch=t.mock.method(globalThis,'fetch',async(_url,opts)=>{
    const rows=JSON.parse(JSON.parse(opts.body).messages[0].content).filas;
    assert.ok(rows[0].keywords.some(k=>k.keyword===secondary && k.metrics.searchVolume===10));
    return response([{...finding,references:keywords.map(keyword=>({id:row.id,metric:'searchVolume',keyword}))}]);
  });
  const ask='¿Qué volumen tiene «'+secondary+'»?';
  for (const provider of [{},env]) {
    const result=await buildSeoInsights(provider,data,ask);
    assert.equal(result.mode,provider===env?'modelo':'descriptivo');
    assert.match(result.findings[0].interpretation,/precio».+estimadas: 10, observación del 2026-11-22/);
    assert.doesNotMatch(result.findings[0].interpretation,/720|2026-10-01/);
  }
  keywords=[primary,secondary];
  const compare='Compara el volumen de «'+primary+'» y «'+secondary+'»';
  const result=await buildSeoInsights(env,data,compare);
  assert.equal(result.mode,'modelo');
  assert.match(result.findings[0].interpretation,/estimadas: 720, observación del 2026-10-01.+precio».+estimadas: 10, observación del 2026-11-22/);
  keywords=[primary];
  const invalid=await buildSeoInsights(env,data,ask);
  assert.equal(invalid.mode,'descriptivo');
  assert.doesNotMatch(invalid.findings[0].interpretation,/720/);
  assert.equal(fetch.mock.callCount(),3);
});
