import { json, allowPublicAction } from './observability.js'
import { loadSeoEvidence } from './seo-insights-data.js'
import { buildSeoInsights } from './seo-insights.js'

const periods = new Set([7, 30, 90])
const defaultQuestion = '¿Qué hallazgos merecen atención y qué páginas conviene investigar primero?'
const maxBodyBytes = 24000

async function readSelection(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null
  const reader = request.body?.getReader()
  if (!reader) return null
  let size = 0
  const chunks = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBodyBytes) { await reader.cancel(); return null }
    chunks.push(value)
  }
  try { return JSON.parse(await new Blob(chunks).text()) } catch { return null }
}

export async function handleSeoInsights(request, env, programs, team) {
  if (!['GET','POST'].includes(request.method)) return json({error:'Método no permitido.'},405)
  const interpret = request.method === 'POST'
  const selection = interpret ? await readSelection(request) : {}
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return json({error:'Envía una selección válida.'},400)
  const days = interpret ? selection.days ?? 30 : Number(new URL(request.url).searchParams.get('days') ?? 30)
  if (!periods.has(days)) return json({error:'Elige un período de 7, 30 o 90 días.'},400)
  const ids = selection.ids ?? []
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id=>typeof id !== 'string' || !id.length || id.length > 225))
    return json({error:'Selecciona hasta 100 páginas del explorador.'},400)
  if (selection.question != null && (typeof selection.question !== 'string' || selection.question.length > 600))
    return json({error:'Escribe una pregunta de hasta 600 caracteres.'},400)
  if (interpret && !await allowPublicAction(request,env,team?'insights_equipo':'insights_publico',team?45:12))
    return json({error:'Alcanzaste el límite de interpretaciones por hora. Puedes seguir explorando las cifras.'},429)

  const evidence = await loadSeoEvidence(env, programs, days, {team})
  if (!interpret) return json(evidence)
  const selectedIds = new Set(ids)
  const rows = selectedIds.size ? evidence.rows.filter(row=>selectedIds.has(row.id)) : evidence.rows
  if (selectedIds.size && rows.length !== selectedIds.size)
    return json({error:'La selección cambió. Actualiza las páginas e inténtalo de nuevo.'},422)
  return json(await buildSeoInsights(env,{days, start:evidence.start, end:evidence.end, rows},selection.question?.trim() || defaultQuestion))
}
