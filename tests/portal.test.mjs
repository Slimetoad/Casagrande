import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { programs } from '../src/catalog.js'
import { serve } from '../src/portal.js'

const origin = 'https://admisiones.example.edu'
const staff = {'oai-authenticated-user-email':'asesor@example.edu','oai-authenticated-user-id':'local-identidad-verificada'}
function envFor() {
  const database = new DatabaseSync(':memory:')
  for (const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) database.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'))
  class Query {
    constructor(sql,args=[]) { this.sql=sql;this.args=args }
    bind(...args) { return new Query(this.sql,args) }
    first() { return database.prepare(this.sql).get(...this.args) || null }
    all() { return {results:database.prepare(this.sql).all(...this.args)} }
    run() { const statement=database.prepare(this.sql);return statement.columns().length?this.all():{meta:{changes:statement.run(...this.args).changes}} }
  }
  const DB = {prepare:sql=>new Query(sql), batch(items) {
    database.exec('BEGIN')
    try { const result=items.map(x=>x.run());database.exec('COMMIT');return result }
    catch(e){ database.exec('ROLLBACK');throw e }
  }}
  return {DB,ADMISSIONS_STAFF_EMAILS:'asesor@example.edu',PUBLIC_BASE_URL:origin,MAINTENANCE_TOKEN:'prueba-soporte-solo-local'}
}
function invoke(env,path,method='GET',data,headers={}) {
  return serve(new Request(origin+path,{method,headers:{'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)}),env,()=>'<html lang="es">Manual de admisiones</html>')
}
test('el portal permite explorar el catálogo, el mapa SEO y todas las fichas desde su URL',async()=>{
  const env=envFor()
  for(const path of ['/','/programas','/orientacion','/financiamiento','/solicitar','/guias',...programs.map(x=>'/programas/'+x.slug)]) {
    const r=await invoke(env,path)
    assert.equal(r.status,200,path)
    const html=await r.text();assert.match(html,/lang="es/);assert.match(html,/<h1/);assert.match(html,/name="description"/)
    assert.match(html,/noindex/)
  }
  for(const program of programs)assert.ok(existsSync(new URL('../public'+program.image,import.meta.url)),program.slug)
  const map=await (await invoke(env,'/sitemap.xml')).text()
  for(const program of programs) assert.ok(map.includes('/programas/'+program.slug))
  assert.equal((await invoke(env,'/programas/no-existe')).status,404)
  assert.match(await (await invoke(env,'/robots.txt')).text(),/Disallow: \/\n/)
  assert.match(await (await invoke({...env,SEO_INDEXABLE:'true'},'/')).text(),/index,follow/)
})
test('una solicitud optativa llega al CRM y el asistente solo prepara asesoría para el equipo',async()=>{
  const env=envFor()
  assert.equal((await invoke(env,'/equipo')).status,403)
  assert.equal((await invoke(env,'/equipo?demo=1')).status,200)
  assert.equal((await invoke(env,'/api/staff/dashboard')).status,403)
  const data={name:'Prueba local',email:'prueba@example.org',program:programs[0].slug,source:'simulador',consentEmail:false,consentVoice:false,context:{origen:'simulador'}}
  assert.equal((await invoke(env,'/api/leads','POST',data,{'Sec-Fetch-Site':'cross-site'})).status,403)
  assert.equal((await invoke(env,'/api/leads','POST',data)).status,201)
  const staffDashboard=await (await invoke(env,'/api/staff/dashboard','GET',undefined,staff)).json()
  assert.equal(staffDashboard.leads.length,1);assert.equal(staffDashboard.jobs.length,0);assert.ok(staffDashboard.tasks.length)
  const id=staffDashboard.leads[0].id
  const copilot=await invoke(env,'/api/staff/leads/'+id+'/brief','POST',{},staff)
  assert.equal(copilot.status,200);const brief=await copilot.json()
  assert.ok(brief.recommendedAction);assert.equal(brief.draftEmail,'')
  assert.equal((await invoke(env,'/api/staff/leads/'+id+'/brief','POST',{})).status,403)
  const chat=await (await invoke(env,'/api/chat','POST',{message:'¿Cuál es la modalidad?',program:programs[0].slug})).json()
  assert.equal(chat.mode,'catalogo');assert.ok(chat.answer)
})
test('las métricas se agregan y la ejecución del programador respeta la configuración',async()=>{
  const env=envFor(), h={'X-UCG-Mantenimiento':env.MAINTENANCE_TOKEN}
  assert.equal((await invoke(env,'/api/maintenance','POST',{})).status,403)
  assert.equal((await invoke(env,'/api/analytics','POST',{event:'quiz_complete',source:'directo'})).status,204)
  const rows=(await (await invoke(env,'/api/staff/analytics','GET',undefined,staff)).json()).rows
  assert.equal(rows[0].total,1)
  const jobs=await (await invoke(env,'/api/maintenance','POST',{},h)).json()
  assert.ok(jobs.procesos.every(x=>['sin_configurar','en_pausa','completado'].includes(x.estado)),JSON.stringify(jobs))
  const repeat=await (await invoke(env,'/api/maintenance','POST',{},h)).json()
  assert.ok(repeat.procesos.every(x=>x.estado==='ya_procesado'))
  const log=await (await invoke(env,'/api/maintenance','GET',undefined,h)).json()
  assert.equal(log.ejecuciones.length,4)
})

test('la medición de fichas respeta GPC y DNT y el tablero de conversión requiere identidad',async()=>{
  const env=envFor(), program=programs[0].slug
  const snapshot=()=>env.DB.prepare("SELECT COALESCE(SUM(total),0) n FROM admissions_hub_counts").first().n
  for(const flag of [{'Sec-GPC':'1'},{DNT:'1'}]){
    assert.equal((await invoke(env,'/api/hubs','POST',{program,event:'exposure',variant:'A'},flag)).status,204)
    assert.equal(snapshot(),0)
  }
  assert.equal((await invoke(env,'/api/hubs','POST',{program,event:'exposure',variant:'A'})).status,204)
  assert.equal((await invoke(env,'/api/hubs','POST',{program,event:'exposure',variant:'C'})).status,400)
  assert.equal(snapshot(),1)
  for(const path of ['/equipo/conversion','/equipo/verificacion']){
    assert.equal((await invoke(env,path)).status,403)
    const r=await invoke(env,path,'GET',undefined,staff);assert.equal(r.status,200)
    assert.match(r.headers.get('X-Robots-Tag'),/noindex/)
  }
  const dashboard=await (await invoke(env,'/equipo/conversion','GET',undefined,staff)).text()
  assert.match(dashboard,/«Solicitar información»[\s\S]*?Exposiciones<\/dt><dd>1</)
  const map=await (await invoke({...env,SEO_INDEXABLE:'true'},'/sitemap.xml')).text()
  assert.match(map,/\/cita<\/loc>/);assert.doesNotMatch(map,/\/equipo/)
})

test('la exportación al calendario utiliza un identificador estable distinto del enlace privado',async()=>{
  const env=envFor(), key=crypto.randomUUID()
  const payload={name:'Prueba Agenda',email:'agenda@example.org',phone:'+593999000001',program:programs[0].slug,consentCita:true}
  const result=await invoke(env,'/api/citas/solicitar','POST',payload,{'Idempotency-Key':key})
  assert.equal(result.status,201)
  const {appointment}=await result.json()
  assert.ok(appointment.calendarId);assert.notEqual(appointment.calendarId,key)
  const response=await invoke(env,'/api/citas/gestionar','POST',{key:appointment.calendarId,action:'view'})
  assert.equal(response.status,404)
  const client=readFileSync(new URL('../public/citas.js',import.meta.url),'utf8')
  assert.match(client,/'UID:'\+a\.calendarId\+/);assert.doesNotMatch(client,/'UID:'\+key/)
})

test('la sonda técnica de correo requiere acceso de servicio y solo escribe su propia verificación', async t=>{
  const env={...envFor(),RESEND_FROM:'Orientación <posgrados@example.org>',RESEND_ADMISSIONS_INBOUND_ADDRESS:'posgrados@example.org',RESEND_API_KEY:'test-service',RESEND_WEBHOOK_SECRET:'whsec_simulado'};
  assert.equal((await invoke(env,'/api/maintenance/correo/prueba','POST',{})).status,403);
  const headers={'X-UCG-Mantenimiento':env.MAINTENANCE_TOKEN};
  const originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch});
  let requestBody;
  globalThis.fetch=async(url,options)=>{
    if(options?.method==='POST'){
      requestBody=JSON.parse(options.body);assert.deepEqual(requestBody.to,['posgrados+prueba@example.org']);
      return Response.json({id:crypto.randomUUID()});
    }
    return Response.json({id:url.split('/').at(-1),text:requestBody.text,subject:requestBody.subject});
  };
  const check=await invoke(env,'/api/maintenance/correo/prueba','POST',{},headers);assert.equal(check.status,201);
  const sent=await check.json();assert.equal(sent.probe.accepted,true);assert.equal(sent.probe.read,false);
  assert.equal((await invoke(env,'/api/maintenance/correo/prueba','POST',{},headers)).status,429);
  const {recordMailLoopback}=await import('../src/mail-loopback.js');
  assert.equal(await recordMailLoopback(env,{type:'email.received',data:{to:['ajeno@example.org']}}),false);
  const data={to:requestBody.to,subject:requestBody.subject,from:requestBody.from,email_id:crypto.randomUUID()};
  assert.equal(await recordMailLoopback(env,{type:'email.received',data}),true);
  assert.equal(await recordMailLoopback(env,{type:'email.received',data}),true);
  const state=await (await invoke(env,'/api/maintenance/correo/prueba','GET',undefined,headers)).json();
  assert.equal(state.probe.state,'verificada');assert.ok(state.probe.receivedAt);
  assert.equal(env.DB.prepare('SELECT COUNT(*) n FROM leads').first().n,0);
});
