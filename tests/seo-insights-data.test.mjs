import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {loadSeoEvidence} from '../src/seo-insights-data.js';

const slug='mi-maestria';
const programs=[{slug,title:'Mi maestría',url:'https://casagrande.edu.ec/mi-maestria'}];
const day=offset=>new Date(Date.now()+offset*86400000).toISOString();
function fixture() {
  const raw=new DatabaseSync(':memory:');
  for(const name of ['schema.sql','growth.sql','acquisition.sql','article-performance-v4.sql','appointments.sql','operations-v2.sql','openseo-v4.sql']){
    raw.exec(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
  }
  const queries=[];
  const prepare=(sql,args=[])=>({
    bind:(...values)=>prepare(sql,values),
    all:()=>{queries.push(sql);return {results:raw.prepare(sql).all(...args)}}
  });
  const env={DB:{prepare},PUBLIC_BASE_URL:'https://portal.example.org'};
  raw.prepare(`INSERT INTO openseo_sources(key,project_id,state,detail,payload) VALUES('proyecto','p','disponible','',?)`).run(JSON.stringify({id:'p'}));
  for (const [status,id] of [['published','guia'],['draft','privada']]) {
    raw.prepare(`INSERT INTO seo_articles(id,slug,opportunity_id,program,title,summary,body,source_query,source_url,status,created_at,updated_at,published_at)
      VALUES(?,?,?,?,?,'','','tema','',?,?,?,?)`).run(id,id,id,slug,id,status,day(-50),day(-4),day(-45));
  }
  const keyword=(type,text,fields)=>raw.prepare('INSERT INTO openseo_keywords VALUES(?,?,?,?,?)')
    .run('p',type,slug,text+type+String(fields.url||''),JSON.stringify({sourceKey:type,keyword:text,...fields}));
  return {env,raw,queries,keyword};
}

test('publica las consultas con su fuente y fecha y nunca consulta tablas de aspirantes en la vista pública',async()=>{
  const {env,queries,keyword}=fixture();
  keyword('saved_keywords','tema',{volume:0,difficulty:0,cpc:null,competition:0.24,observedAt:'2026-11-21'});
  keyword('saved_keywords','mejor tema',{volume:600,difficulty:null,observedAt:'2026-11-21'});
  keyword('gsc','tema confidencial',{url:programs[0].url,clicks:9,periodStart:'2026-10-01',periodEnd:'2026-10-28'});
  const evidence=await loadSeoEvidence(env,programs,7);
  assert.deepEqual(evidence.rows.map(r=>r.id),['programa:'+slug,'guia:guia']);
  const [hub,guide]=evidence.rows;
  assert.equal(hub.url,'/programas/'+slug);assert.equal(guide.url,'/guias/guia');
  assert.equal(hub.metrics.searchVolume,600);
  assert.equal(guide.metrics.searchVolume,0);assert.equal(guide.metrics.cpc,null);
  assert.equal(guide.metrics.keywordDifficulty,0);assert.equal(guide.observedAt,'2026-11-21');
  assert.equal(hub.metrics.views,null);assert.equal(hub.metrics.appointments,null);
  assert.equal(hub.searchObservation,null);assert.equal(hub.previous,null);
  assert.ok(!JSON.stringify(evidence).includes('confidencial'));
  assert.ok(queries.every(sql=>!/(lead_submissions|admissions_appointments|seo_article_counts|admissions_hub_counts)/i.test(sql)));
});

test('medición interna cambia con los días y atribuye solo solicitudes identificadas por página y programa',async()=>{
  const {env,raw,keyword}=fixture();
  raw.prepare('INSERT INTO admissions_hub_counts VALUES(?,?,?,?,?)').run(day(-6).slice(0,10),slug,'hub_view','',3);
  raw.prepare('INSERT INTO admissions_hub_counts VALUES(?,?,?,?,?)').run(day(-8).slice(0,10),slug,'inquiry_click','B',1);
  raw.prepare('INSERT INTO seo_article_counts VALUES(?,?,?,?)').run(day(-8).slice(0,10),'guia','view',2);
  raw.prepare('INSERT INTO leads(id,name,email,program,source,stage,created_at,updated_at,pref_token) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('p','Persona privada','solo-interno@example.org',slug,'web','Nuevo',day(-4),day(-4),'secreto');
  const insert=raw.prepare(`INSERT INTO lead_submissions(id,request_key,lead_id,program,source,context,email_choice,voice_choice,consent_version,created_at) VALUES(?,?,'p',?,?,?,0,0,'1',?)`);
  const guideContext={utm_source:'guia',utm_medium:'editorial',utm_content:'guia'};
  for(const [id,program,source,context,ago] of [
    ['hub',slug,'programa',{hubVariant:'A'},-3],['repetido',slug,'programa',{hubVariant:'B'},-2],
    ['ajena','otro','guia',guideContext,-3],['guia',slug,'guia',guideContext,-8],
    ['espurio',slug,'directo',{hubVariant:'A'},-2],['mal',slug,'guia','{',-3],
  ])insert.run(id,id,program,source,typeof context==='string'?context:JSON.stringify(context),day(ago));
  keyword('gsc','consulta oficial',{url:programs[0].url,periodStart:'2026-10-01',periodEnd:'2026-10-28',impressions:100,clicks:10,ctr:.1});
  keyword('gsc','página incorrecta',{url:'https://externa.example.org',periodStart:'2026-10-01',periodEnd:'2026-10-28',impressions:300});
  const weekly=await loadSeoEvidence(env,programs,7,{team:true});
  const [hub,guide]=weekly.rows;
  assert.deepEqual([hub.metrics.views,hub.metrics.ctaClicks,hub.metrics.leads],[3,0,1]);
  assert.deepEqual([guide.metrics.views,guide.metrics.leads,guide.metrics.enrollments],[0,0,0]);
  assert.deepEqual([hub.previous.views,hub.previous.ctaClicks,guide.previous.views],[0,1,2]);
  assert.equal(hub.previous.start,day(-13).slice(0,10));assert.equal(hub.previous.end,day(-7).slice(0,10));
  assert.equal(hub.searchObservation.keyword,'consulta oficial');
  assert.equal(hub.metrics.clicks,null);assert.equal(guide.searchObservation,null);
  assert.ok(!JSON.stringify(weekly).includes('solo-interno'));
  const [monthlyHub,monthlyGuide]=(await loadSeoEvidence(env,programs,30,{team:true})).rows;
  assert.equal(monthlyHub.metrics.ctaClicks,1);assert.equal(monthlyHub.previous,null);
  assert.equal(monthlyGuide.metrics.views,2);assert.equal(monthlyGuide.metrics.leads,1);
});

test('un contador ausente queda sin dato y no invalida las mediciones disponibles',async()=>{
  const {raw,env}=fixture();
  raw.exec('DROP TABLE admissions_hub_counts; DROP TABLE admissions_appointments;');
  const [p,g]=(await loadSeoEvidence(env,programs,90,{team:true})).rows;
  assert.equal(p.metrics.views,null);assert.equal(g.metrics.views,0);
  assert.equal(p.metrics.appointments,null);assert.equal(g.metrics.appointments,null);
  assert.equal(p.metrics.leads,0);assert.equal(g.metrics.enrollments,0);
  assert.equal((await loadSeoEvidence({},programs,30,{team:true})).rows[0].metrics.leads,null);
  await assert.rejects(loadSeoEvidence(env,programs,14),RangeError);
});
