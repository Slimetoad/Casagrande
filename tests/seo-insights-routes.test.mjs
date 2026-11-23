import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { programs } from '../src/catalog.js'
import { serve } from '../src/portal.js'

const site = 'https://posgrados.example.edu'
const publicApi = '/api/editorial/insights'
const staffApi = '/api/staff/editorial/insights'
const staff = {Authorization:'Bearer sesion-de-prueba-local'}
const source = programs[0].slug
const migrations = new URL('../drizzle/', import.meta.url)

function fixture(t) {
  const db = new DatabaseSync(':memory:')
  t.after(()=>db.close())
  for (const name of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort())
    db.exec(readFileSync(new URL(name,migrations),'utf8'))
  db.prepare("INSERT INTO admissions_hub_counts VALUES (date('now'),?,'hub_view','',11),(date('now','-9 days'),?,'hub_view','',100)").run(source,source)
  const article = db.prepare(`INSERT INTO seo_articles(id,slug,opportunity_id,program,title,summary,body,source_query,source_url,status,created_at,updated_at,published_at)
     VALUES(?,?,?,?,'Guía QA','Descripción','Documento interno canario','','',?,date('now'),date('now'),date('now'))`)
  for (const status of ['draft','published','archived']) article.run(status,'prueba-'+status,status,source,status)
  function statement(sql, args=[]) {
    return {
      bind:(...values)=>statement(sql,values),
      first:()=>db.prepare(sql).get(...args),
      all:()=>({results:db.prepare(sql).all(...args)}),
      run:()=>({meta:{changes:db.prepare(sql).run(...args).changes}})
    }
  }
  const env = {DB:{prepare:sql=>statement(sql)},ADMISSIONS_STAFF_TOKEN:'sesion-de-prueba-local',PUBLIC_BASE_URL:site}
  return (path,method='GET',body,headers={})=>serve(new Request(site+path,{
    method, headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)
  }),env,()=> '')
}

test('public explorer exposes published pages and research only, even with staff credentials on the public URL',async t=>{
  const visit=fixture(t)
  for (const headers of [{},staff]) {
    const res=await visit(publicApi+'?days=7&team=true','GET',undefined,headers)
    assert.equal(res.status,200)
    const data=await res.json()
    assert.equal(data.days,7)
    assert.ok(data.rows.some(r=>r.id==='guia:prueba-published'))
    const serialized=JSON.stringify(data)
    assert.doesNotMatch(serialized,/prueba-(?:draft|archived)|Documento interno canario/)
    for (const row of data.rows) for(const key of ['views','ctaClicks','leads','appointments','enrollments'])
      assert.equal(row.metrics[key],null,key)
  }
})

test('team access and period boundaries are enforced by the route',async t=>{
  const visit=fixture(t)
  for (const method of ['GET','POST']) assert.equal((await visit(staffApi,method)).status,403)
  for(const [days,views] of [[7,11],[30,111],[90,111]]) {
    const res=await visit(staffApi+'?days='+days,'GET',undefined,staff)
    assert.equal(res.status,200)
    const {rows}=await res.json()
    assert.equal(rows.find(row=>row.id==='programa:'+source).metrics.views,views)
  }
  assert.equal((await visit(publicApi,'POST',{}, {Origin:'https://fuera.example'})).status,403)
  assert.equal((await visit(publicApi,'PUT')).status,405)
  assert.equal((await visit(publicApi+'?days=8')).status,400)
  assert.equal((await visit(publicApi,'POST',[],{})).status,400)
  assert.equal((await visit(publicApi,'POST',{days:30,ids:'*'})).status,400)
  assert.equal((await visit(publicApi,'POST',{question:'q'.repeat(601)})).status,400)
  assert.equal((await visit(publicApi,'POST',{ids:['guia:prueba-draft']})).status,422)
})

test('analysis stays within selected rows and reports missing performance honestly',async t=>{
  const visit=fixture(t)
  const ids=['programa:'+source]
  const query={days:7,ids,question:'¿Cuántas vistas tiene esta página?'}
  const pub=await (await visit(publicApi,'POST',query)).json()
  assert.equal(pub.mode,'descriptivo')
  assert.equal(pub.reason,'sin_datos')
  assert.equal(pub.findings.length,0)
  const team=await (await visit(staffApi,'POST',query,staff)).json()
  assert.equal(team.mode,'descriptivo')
  assert.equal(team.reason,'sin_modelo')
  assert.ok(team.findings.length)
  assert.ok(team.findings.every(f=>f.evidenceIds.length && f.evidenceIds.every(id=>ids.includes(id))))
  assert.match(team.findings[0].interpretation,/11/)
})

test('public and team screens load the explorer, without granting private route access',async t=>{
  const visit=fixture(t)
  const motor=await (await visit('/motor-de-contenidos')).text()
  assert.match(motor,/href="#hallazgos-seo"/)
  assert.match(motor,/id="hallazgos-seo" data-seo-insights="public"/)
  for (const html of [motor,await (await visit('/equipo','GET',undefined,staff)).text()]) {
    assert.match(html,/src="\/seo-insights\.js"/)
    assert.match(html,/href="\/seo-insights\.css"/)
  }
})
