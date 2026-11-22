import {json} from './observability.js'
const variants=['A','B']
const actions=['hub_view','exposure','inquiry_click']
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export async function collectHub(request,env,programs) {
  if(request.method!=='POST')return json({error:'Método no disponible.'},405)
  if(request.headers.get('Sec-GPC')==='1'||request.headers.get('DNT')==='1')return new Response(null,{status:204})
  if(!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')||0)>1024)return json({error:'Interacción inválida.'},400)
  const input=await request.json().catch(()=>null)
  if(!input||!programs.some(p=>p.slug===input.program)||!actions.includes(input.event)||!(input.event==='hub_view'?input.variant==='':variants.includes(input.variant)))return json({error:'Interacción inválida.'},400)
  await env.DB.prepare("INSERT INTO admissions_hub_counts(day,program,event,variant,total) VALUES(date('now'),?,?,?,1) ON CONFLICT(day,program,event,variant) DO UPDATE SET total=total+1").bind(input.program,input.event,input.variant).run()
  return new Response(null,{status:204})
}
async function dashboard(db,programs) {
  const [count,res,citas,enroll,exp]=await db.batch([
    db.prepare("SELECT program,event,variant,SUM(total) n FROM admissions_hub_counts WHERE day>=date('now','-29 days') GROUP BY program,event,variant"),
    db.prepare("SELECT program,COUNT(DISTINCT lead_id) n FROM lead_submissions WHERE date(created_at)>=date('now','-29 days') GROUP BY program"),
    db.prepare("SELECT program,COUNT(*) n FROM admissions_appointments WHERE date(created_at)>=date('now','-29 days') AND status IN ('booked','completed','no_show') GROUP BY program"),
    db.prepare("SELECT l.program,COUNT(DISTINCT l.id) n FROM admissions_stage_evidence v JOIN leads l ON l.id=v.lead_id WHERE v.stage='Matriculado' AND l.stage='Matriculado' AND date(v.recorded_at)>=date('now','-29 days') GROUP BY l.program"),
    db.prepare("SELECT program,json_extract(context,'$.hubVariant') variant,COUNT(DISTINCT lead_id) n FROM lead_submissions WHERE json_valid(context) AND json_extract(context,'$.hubVariant') IN ('A','B') AND date(created_at)>=date('now','-29 days') GROUP BY program,variant")
  ])
  const rows=programs.map(p=>({program:p.slug,title:p.shortTitle||p.title,views:0,leads:0,appointments:0,enrolled:0})), by=new Map(rows.map(x=>[x.program,x]))
  const tests=Object.fromEntries(variants.map(v=>[v,{exposure:0,inquiry_click:0,leads:0}]))
  for(const r of count.results||[]){
    if(r.event==='hub_view'&&by.has(r.program))by.get(r.program).views+=r.n
    if(tests[r.variant] && ['exposure','inquiry_click'].includes(r.event))tests[r.variant][r.event]+=r.n
  }
  for(const [stats,key] of [[res,'leads'],[citas,'appointments'],[enroll,'enrolled']])for(const r of stats.results||[])if(by.has(r.program))by.get(r.program)[key]+=r.n
  for(const r of exp.results||[])if(tests[r.variant])tests[r.variant].leads+=r.n
  return {rows:rows.sort((a,b)=>b.leads-a.leads||b.views-a.views||a.title.localeCompare(b.title,'es')),tests}
}
export async function conversionPage(env,programs) {
  const {rows,tests}=await dashboard(env.DB,programs)
  const active=rows.filter(r=>r.views||r.leads||r.appointments||r.enrolled)
  const body=active.length?active.map(r=>`<tr><th><a href="/programas/${e(r.program)}">${e(r.title)}</a></th><td>${r.views}</td><td>${r.leads}</td><td>${r.appointments}</td><td>${r.enrolled}</td></tr>`).join(''):'<tr><td colspan="5">Aún no hay actividad atribuida a una ficha durante este período.</td></tr>'
  return `<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Rendimiento de las fichas · Admisiones</title><link rel="stylesheet" href="/conversion.css"></head><body><header><a href="/equipo">Volver a admisiones</a><img src="/media/ucg-logo.png" alt="Universidad Casa Grande"></header><main><div class="over">Captación · Últimos 30 días</div><h1>Rendimiento de las fichas<span>.</span></h1><p>¿Qué maestrías despiertan interés y cuáles avanzan a una conversación?</p><section><h2>De la ficha a la matrícula</h2><p>Las solicitudes se deduplican por aspirante y programa. Las citas incluyen reservas confirmadas durante el período y las matrículas requieren evidencia en el expediente. Cada columna muestra actividad del período y puede incluir personas de cohortes distintas.</p><div class="scroll"><table><thead><tr><th>Maestría</th><th>Vistas</th><th>Aspirantes</th><th>Citas</th><th>Matrículas</th></tr></thead><tbody>${body}</tbody></table></div></section><section><div class="over">Experimento de captación</div><h2>¿Cómo invitar a una consulta?</h2><p>Las fichas con convocatoria disponible o por confirmar alternan aleatoriamente entre dos textos. La versión se conserva en la pestaña. Una exposición cuenta cuando el enlace entra en pantalla y la medición respeta las preferencias de privacidad del navegador.</p><div class="variants">${variants.map(v=>`<article><small>Versión ${v}</small><h3>${v==='A'?'«Solicitar información»':'«Hablar sobre esta maestría»'}</h3><dl><div><dt>Exposiciones</dt><dd>${tests[v].exposure}</dd></div><div><dt>Clics</dt><dd>${tests[v].inquiry_click}</dd></div><div><dt>Aspirantes atribuidos por programa</dt><dd>${tests[v].leads}</dd></div></dl></article>`).join('')}</div><p>El conteo se atribuye cuando la consulta conserva la versión asignada a esa maestría. Evalúa los resultados por cohorte, junto con los datos de matrícula, antes de adoptar un texto.</p></section></main></body></html>`
}
