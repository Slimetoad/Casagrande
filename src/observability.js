const events = ['page_view', 'cta_click', 'quiz_complete', 'calculator_use', 'lead_created', 'chat_open', 'appointment_booked', 'appointment_requested']
const sources = ['directo', 'busqueda', 'social', 'campana', 'referencia', 'interno']
export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}
export async function handleMetrics(request, env, path, operator) {
  if (path === '/api/analytics' && request.method === 'POST') {
    const input = await request.json().catch(() => null)
    if (!events.includes(input?.event) || !sources.includes(input?.source)) return json({error:'Interacción desconocida.'},400)
    if (request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1') return new Response(null, {status:204})
    const day = new Date().toISOString().slice(0,10)
    await env.DB.prepare('INSERT INTO funnel_counts(day,event,source,total) VALUES(?,?,?,1) ON CONFLICT(day,event,source) DO UPDATE SET total=total+1').bind(day,input.event,input.source).run()
    return new Response(null, {status:204})
  }
  if (path === '/api/staff/analytics' && request.method === 'GET') {
    if (!operator) return json({error:'Acceso restringido a admisiones.'},403)
    const [rows,daily] = await env.DB.batch([
      env.DB.prepare("SELECT event,source,SUM(total) AS total FROM funnel_counts WHERE day>=date('now','-29 days') GROUP BY event,source ORDER BY total DESC"),
      env.DB.prepare("SELECT day,event,SUM(total) AS total FROM funnel_counts WHERE day>=date('now','-29 days') GROUP BY day,event ORDER BY day")
    ])
    return json({windowDays:30,rows:rows.results,daily:daily.results})
  }
  return null
}
async function fingerprint(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('')
}
// No raw network identifiers are retained. The short-lived bucket protects paid APIs.
export async function allowPublicAction(request, env, action, limit) {
  const network = request.headers.get('CF-Connecting-IP')
  if (!network) return true
  const hour = Math.floor(Date.now() / 3600000)
  const id = await fingerprint([env.RATE_LIMIT_SALT || env.MAINTENANCE_TOKEN || 'ucg', hour, network, action].join('\n'))
  const row = await env.DB.prepare('INSERT INTO traffic_limits(id,hour,hits) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(id, hour).first()
  return row.hits <= limit
}
export async function secretMatches(provided, expected) {
  if (!provided || !expected || provided.length > 1024) return false
  const [a,b] = await Promise.all([fingerprint(provided), fingerprint(expected)])
  let diff = 0
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
