import {json, secretMatches} from './observability.js'
import {runNurtureJobs} from './conversation-nurture.js'
import {runIntelligenceCycle} from './intelligence.js'
import {runDueJobs} from './integrations.js'
import {syncOpenSeo} from './openseo.js'
import {runEditorialCycle} from './editorial-engine.js'
import {outreachStartAt} from './providers.js'

const outcomeStates=new Set(['sin_configurar','en_pausa','completado','error'])
const summaryKeys=['accepted','skipped','retry','review','publishedPortal','publishedCms','verificationFailures','measured','removed']
const sourceStates=new Set(['disponible','sin_datos','sin_configurar','en_pausa','pendiente','no_disponible','bloqueado','error'])
const scopedKinds={
  editorial:['editorial_openseo','editorial_publicacion','editorial_captacion','editorial_limpieza'],
  nuevos:['nuevos_seguimiento','nuevos_conversaciones']
}

function readSummary(value) {
  try {
    const raw=JSON.parse(value)
    const summary={}
    for(const key of summaryKeys)if(Number.isSafeInteger(raw?.[key]) && raw[key]>=0)summary[key]=raw[key]
    for(const state of sourceStates)if(Number.isSafeInteger(raw?.sources?.[state]) && raw.sources[state]>=0){
      summary.sources??={}
      summary.sources[state]=raw.sources[state]
    }
    return Object.keys(summary).length?summary:null
  }catch{return null}
}

function summarize(outcome) {
  if(!outcome || typeof outcome!=='object')return null
  const aggregate={}
  for(const key of summaryKeys)if(Number.isSafeInteger(outcome[key]) && outcome[key]>=0)aggregate[key]=outcome[key]
  if(Array.isArray(outcome.sources)){
    const counts={}
    for(const row of outcome.sources)if(sourceStates.has(row?.state))counts[row.state]=(counts[row.state]||0)+1
    aggregate.sources=counts
  }
  return Object.keys(aggregate).length?aggregate:null
}

async function auditedRun(env,programs,action,startedAt) {
  const {kind,slot,run}=action
  const db=env.DB
  try {
    const claim=await db.prepare(`INSERT INTO background_runs(kind,slot,state,started_at) VALUES(?,?,'en_curso',?)
      ON CONFLICT(kind,slot) DO UPDATE SET started_at=excluded.started_at,state='en_curso',finished_at=NULL,result=NULL
      WHERE background_runs.state='error' OR (background_runs.state='en_curso' AND datetime(background_runs.started_at)<datetime('now','-20 minutes')) RETURNING kind`)
      .bind(kind,slot,startedAt).first()
    if(!claim)return {kind,estado:'ya_procesado'}
    let estado='error',resumen=null
    try {
      const outcome=await run(env,programs)
      estado=outcomeStates.has(outcome?.status)?outcome.status:'completado'
      resumen=summarize(outcome)
    }catch { /* Audit the failed action before continuing with independent work. */ }
    await db.prepare("UPDATE background_runs SET state=?,finished_at=?,result=? WHERE kind=? AND slot=? AND state='en_curso' AND started_at=?")
      .bind(estado,new Date().toISOString(),resumen?JSON.stringify(resumen):null,kind,slot,startedAt).run()
    return {kind,estado,...(resumen?{resumen}:{})}
  }catch { return {kind,estado:'error'} }
}

async function pruneMaintenance(db,now) {
  const writes=[
    db.prepare("DELETE FROM traffic_limits WHERE hour<?").bind(Math.floor(now.getTime()/3600000)-2),
    db.prepare("DELETE FROM growth_limits WHERE expires<?").bind(now.toISOString()),
    db.prepare("DELETE FROM background_runs WHERE datetime(started_at)<datetime(?,'-100 days')").bind(now.toISOString())
  ]
  const results=await db.batch(writes)
  return {status:'completado',removed:results.reduce((total,item)=>total+(item.meta?.changes||0),0)}
}

export async function handleScopedMaintenance(request,env,programs,scope) {
  if(!await secretMatches(request.headers.get('X-UCG-Mantenimiento'),env.MAINTENANCE_TOKEN))
    return json({error:'Credencial de servicio requerida.'},403)
  if(!Object.hasOwn(scopedKinds,scope))return json({error:'Proceso de mantenimiento no disponible.'},404)
  if(!['GET','POST'].includes(request.method))return json({error:'Método no permitido.'},405)
  if(!env.DB)return json({error:'El registro del mantenimiento no está disponible.'},503)
  const kinds=scopedKinds[scope],startsAt=scope==='nuevos'?outreachStartAt(env):null
  if(request.method==='GET'){
    const {results}=await env.DB.prepare(`SELECT kind,slot,state,started_at,finished_at,result FROM (
      SELECT *,row_number() OVER (PARTITION BY kind ORDER BY started_at DESC,slot DESC) AS position
      FROM background_runs WHERE kind IN (${kinds.map(()=>'?').join(',')})
    ) WHERE position<=3 ORDER BY started_at DESC,kind,slot`).bind(...kinds).all()
    const ejecuciones=results.map(({result,...run})=>({...run,resumen:readSummary(result)}))
    return json({ambito:scope,...(scope==='nuevos'?{inicio:startsAt||null}:{}),ejecuciones})
  }
  if(scope==='nuevos' && !startsAt)
    return json({error:'Configura OUTREACH_START_AT con fecha, hora y zona horaria para procesar trabajos nuevos.'},409)
  const now=new Date(),startedAt=now.toISOString(),slot=startedAt.slice(0,13)
  const runs=scope==='editorial'?
    [syncOpenSeo,(runtime,catalog)=>runEditorialCycle(runtime,catalog,{now}),runIntelligenceCycle,runtime=>pruneMaintenance(runtime.DB,now)]:
    [runDueJobs,runNurtureJobs]
  const procesos=[]
  for(const [index,kind] of kinds.entries()){
    const actionSlot=kind==='editorial_captacion'?startedAt.slice(0,10):slot
    procesos.push(await auditedRun(env,programs,{kind,slot:actionSlot,run:runs[index]},startedAt))
  }
  return json({ambito:scope,...(scope==='nuevos'?{inicio:startsAt}:{}),procesos},procesos.some(run=>run.estado==='error')?503:200)
}

export async function handleMaintenance(request,env) {
  if (!await secretMatches(request.headers.get('X-UCG-Mantenimiento'), env.MAINTENANCE_TOKEN)) {
    return json({error:'Credencial de servicio requerida.'},403)
  }
  if (request.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT kind,slot,state,started_at,finished_at FROM background_runs ORDER BY started_at DESC LIMIT 12').all()
    return json({ejecuciones:results})
  }
  if (request.method !== 'POST') return json({error:'Método no permitido.'},405)
  return json({error:'El mantenimiento se ejecuta por ámbito. Utiliza la ruta editorial o la de trabajos nuevos.',
    rutas:['/api/maintenance/editorial','/api/maintenance/nuevos']},410)
}
