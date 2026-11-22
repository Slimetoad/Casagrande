import {json, secretMatches} from './observability.js'
import {runNurtureJobs} from './conversation-nurture.js'
import {runIntelligenceCycle} from './intelligence.js'
import {runDueJobs,runGrowthCycle} from './integrations.js'

export async function handleMaintenance(request,env,programs) {
  if (!await secretMatches(request.headers.get('X-UCG-Mantenimiento'), env.MAINTENANCE_TOKEN)) {
    return json({error:'Credencial de servicio requerida.'},403)
  }
  if (request.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT kind,slot,state,started_at,finished_at FROM background_runs ORDER BY started_at DESC LIMIT 12').all()
    return json({ejecuciones:results})
  }
  if (request.method !== 'POST') return json({error:'Método no permitido.'},405)
  const now = new Date()
  const utcMonday = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()))
  utcMonday.setUTCDate(utcMonday.getUTCDate() - (utcMonday.getUTCDay() + 6) % 7)
  const actions = [
    {kind:'seguimiento',slot:now.toISOString().slice(0,13),run:runDueJobs},
    {kind:'conversaciones',slot:now.toISOString().slice(0,13),run:runNurtureJobs},
    {kind:'contenido',slot:utcMonday.toISOString().slice(0,10),run:runGrowthCycle},
    {kind:'captacion',slot:now.toISOString().slice(0,10),run:runIntelligenceCycle}
  ]
  const results = []
  for (const {kind,slot,run} of actions) {
    const claim = await env.DB.prepare(`INSERT INTO background_runs(kind,slot,state,started_at) VALUES(?,?,'en_curso',?)
      ON CONFLICT(kind,slot) DO UPDATE SET started_at=excluded.started_at,state='en_curso',finished_at=NULL
      WHERE background_runs.state='error' OR (background_runs.state='en_curso' AND datetime(background_runs.started_at)<datetime('now','-20 minutes')) RETURNING kind`).bind(kind,slot,now.toISOString()).first()
    if (!claim) { results.push({kind,estado:'ya_procesado'}); continue }
    try {
      const outcome = await run(env,programs)
      const state = ['sin_configurar','en_pausa','completado'].includes(outcome?.status) ? outcome.status : 'completado'
      await env.DB.prepare('UPDATE background_runs SET state=?, finished_at=? WHERE kind=? AND slot=?').bind(state,new Date().toISOString(),kind,slot).run()
      results.push({kind,estado:state})
    } catch {
      await env.DB.prepare("UPDATE background_runs SET state='error', finished_at=? WHERE kind=? AND slot=?").bind(new Date().toISOString(),kind,slot).run()
      results.push({kind,estado:'error'})
    }
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM traffic_limits WHERE hour < ?").bind(Math.floor(now.getTime()/3600000)-2),
    env.DB.prepare("DELETE FROM background_runs WHERE datetime(started_at)<datetime('now','-100 days')")
  ])
  return json({procesos:results},results.some(r=>r.estado==='error')?503:200)
}
