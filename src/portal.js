import {demoConversation} from './conversation-demo.js'
import {handleConversations} from './conversation-intake.js'
import {handleNurture} from './conversation-nurture.js'
import {handleMailCheck} from './mail-loopback.js'
import {handleLeadConfirmation} from './lead-confirmation.js'
import {connectionPage} from './connections.js'
import { handleAppointments } from './appointments.js'
import { appointmentForm } from './appointment-view.js'
import { collectHub,conversionPage } from './conversion.js'
import { handleIntelligence } from './intelligence.js'
import { programs } from './catalog.js'
import { renderStudent } from './student.js'
import { renderCRM } from './crm.js'
import { handleAdvisor } from './advisor.js'
import { handleAdmissions } from './admissions.js'
import { handleIntegrations, publicArticles } from './integrations.js'
import { handleMetrics, json, allowPublicAction, secretMatches } from './observability.js'
import { handleMaintenance, handleScopedMaintenance } from './maintenance.js'
import { handleEditorial, publicEditorial, ensurePlan } from './editorial-engine.js'
import { readOpenSeoMetrics, importProjectKeywords } from './openseo.js'
import {marketSnapshot,researchSource} from './openseo-ecuador.js'
import { publicKeywordObservations } from './openseo-observations.js'
import { institutionalUrl } from './editorial-draft.js'
import { tableExists } from './workspace.js'
import { collectArticle, articlePerformance } from './article-performance.js'

const escape = s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const staffPaths = new Set(['/equipo','/equipo/manual','/equipo/conversion','/equipo/verificacion','/equipo/conexiones'])
const publicWorkspaces = new Set(['/crm','/motor-de-contenidos'])
const publicPages = new Set(['/plataforma','/','/programas','/orientacion','/financiamiento','/solicitar','/guias','/cita'])
export async function resolveOperator(request,env) {
  const address = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase()
  const id = request.headers.get('oai-authenticated-user-id')
  const allowed = (env.ADMISSIONS_STAFF_EMAILS || '').toLowerCase().split(/[,;\s]+/).filter(Boolean)
  if (id && address && allowed.includes(address)) return address
  if (await secretMatches(request.headers.get('Authorization')?.replace(/^Bearer /,''),env.ADMISSIONS_STAFF_TOKEN)) return 'Servicio de admisiones'
  return null
}
function html(body,status = 200,privatePage=false) {
  return new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':privatePage?'no-store':'private, max-age=0, must-revalidate'}})
}
function notice(title,copy,href,label,status) {
  return html(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · UCG</title><style>body{font:1.05rem/1.65 system-ui;color:#171a1c;margin:0;border-top:8px solid #ff8300}main{max-width:46rem;margin:12vh auto;padding:2rem}h1{font-size:clamp(2.3rem,6vw,4.5rem);letter-spacing:-.05em;line-height:1.05}a{color:inherit;text-underline-offset:.3em;font-weight:650}img{width:170px}</style><main><img src="/media/ucg-logo.png" alt="Universidad Casa Grande"><h1>${escape(title)}</h1><p>${escape(copy)}</p><a href="${escape(href)}" target="_top">${escape(label)}</a></main></html>`,status,true)
}
function originFor(env,url) {
  try {return new URL(env.PUBLIC_BASE_URL || url.origin).origin} catch {return url.origin}
}
function secured(response,privateSite=true) {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options','nosniff')
  if (!headers.has('Referrer-Policy')) headers.set('Referrer-Policy','strict-origin-when-cross-origin')
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()')
  if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
  if (privateSite) headers.set('X-Robots-Tag','noindex, nofollow')
  return new Response(response.body,{status:response.status,headers})
}
async function officialGuides(db,slug=null) {
  if(!db || !await tableExists(db,'seo_editorial_cms')) return new Map()
  const query=db.prepare(`SELECT a.slug,c.official_url FROM seo_editorial_cms c
    JOIN seo_editorial_plan p ON p.id=c.plan_id AND p.published_revision=c.version
    JOIN seo_articles a ON a.opportunity_id='editorial:'||p.id
    WHERE a.status='published' AND c.status='published' AND c.receipt_id IS NOT NULL
    AND (? IS NULL OR a.slug=?)`)
  const {results}=await query.bind(slug,slug).all()
  return new Map(results.map(r=>[r.slug,institutionalUrl(r.official_url)]).filter(([,url])=>url))
}
async function route(request,env,url,manual,onLeadCreated) {
  const path = url.pathname.replace(/\/+$/,'') || '/'
  const method = request.method
  const origin = originFor(env,url)
  const indexable = env.SEO_INDEXABLE === 'true' && url.origin === origin
  if (method === 'HEAD') {
    const res=await route(new Request(request.url,{method:'GET',headers:request.headers}),env,url,manual)
    return new Response(null,{status:res.status,headers:res.headers})
  }
  if (path === '/api/maintenance/openseo/importar') {
    if (!await secretMatches(request.headers.get('X-UCG-Mantenimiento'),env.MAINTENANCE_TOKEN)) return json({error:'Credencial de servicio requerida.'},403)
    if (method!=='POST') return json({error:'Método no permitido.'},405)
    const length=Number(request.headers.get('content-length'))
    if(!length || length>96000) return json({error:'Tamaño de importación no admitido.'},413)
    const data=await request.json().catch(()=>null)
    const receipt=await importProjectKeywords(env,data,programs)
    if(!receipt)return json({error:'Comprueba el proyecto, mercado y formato de las estimaciones.'},422)
    await ensurePlan(env.DB,programs,new Date(),'OpenSEO',true)
    return json(receipt)
  }
  if (path === '/api/maintenance/correo/prueba') return handleMailCheck(request,env)
  if (['/api/maintenance/editorial','/api/maintenance/nuevos'].includes(path)) return handleScopedMaintenance(request,env,programs,path.split('/').at(-1))
  if (path === '/api/maintenance') return handleMaintenance(request,env,programs)
  if (!['GET','HEAD'].includes(method)) {
    const from = request.headers.get('origin')
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (from && from !== url.origin && from !== origin)) return json({error:'Origen no permitido.'},403)
    const size = Number(request.headers.get('content-length') || 0)
    if (size > 128000) return json({error:'La solicitud es demasiado grande.'},413)
  }
  if (path.startsWith('/confirmar/')) return handleLeadConfirmation(request,env,url,programs)
  if (path === '/robots.txt') {
    return new Response(indexable ? `User-agent: *\nAllow: /\nDisallow: /equipo\nDisallow: /crm\nDisallow: /motor-de-contenidos\nDisallow: /api/\nDisallow: /preferencias/\nDisallow: /confirmar/\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}})
  }
  if (path === '/sitemap.xml') {
    const [articles,official]=await Promise.all([publicArticles(env),officialGuides(env.DB)])
    const urls = [...publicPages,...programs.map(p=>'/programas/'+p.slug),...(articles||[]).filter(p=>!official.has(p.slug)).map(p=>'/guias/'+p.slug)]
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(p=>`<url><loc>${escape(origin+p)}</loc></url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8'}})
  }
  if(path==='/api/demo/conversacion')return demoConversation(request,programs,origin)
  const isStaff = path.startsWith('/api/staff/') || staffPaths.has(path)
  const operator = isStaff ? await resolveOperator(request,env) : null
  if (path.startsWith('/api/staff/') && !operator) return json({error:'Esta sección requiere acceso del equipo de admisiones.'},403)
  if (path.startsWith('/api/') || path.startsWith('/preferencias/')) {
    if (path==='/api/editorial/publico' && method==='GET') {
      const overview=await publicEditorial(env,programs)
      const publicSources=new Set(['Catálogo institucional UCG','OpenSEO · Keyword Generator',researchSource])
      const sources=overview.sources.filter(row=>publicSources.has(row.label))
      const plan=overview.plan.map(row=>({...row,evidence:{
        search:publicSources.has(row.evidence?.search?.source)?row.evidence.search:null
      }}))
      return json({...overview,plan,sources,marketResearch:[...marketSnapshot,...publicKeywordObservations.filter(row=>!marketSnapshot.some(m=>m.program===row.program && m.keyword===row.keyword))]})
    }
    if (path==='/api/staff/editorial/rendimiento' && method==='GET') return json(await articlePerformance(env))
    if (path==='/api/staff/openseo' && method==='GET') {
      const slug=url.searchParams.get('programa') || undefined
      if(slug && !programs.some(p=>p.slug===slug)) return json({error:'Programa desconocido.'},404)
      return json(await readOpenSeoMetrics(env.DB,slug,{programs,configured:!!(env.OPENSEO_API_KEY||env.OPENSEO_ACCESS_TOKEN)}))
    }
    if (method === 'POST' && ['/api/editorial/medir','/api/chat','/api/leads','/api/analytics','/api/hubs','/api/citas/solicitar','/api/citas/gestionar'].includes(path)) {
      const limit = ['/api/analytics','/api/hubs','/api/editorial/medir'].includes(path)?400:path === '/api/chat'?35:path.startsWith('/api/citas/')?30:120
      if (!await allowPublicAction(request,env,path,limit)) return json({error:'Has realizado varias solicitudes. Inténtalo más tarde.'},429)
    }
    if(path==='/api/editorial/medir' && method==='POST') return collectArticle(request,env)
    if(path==='/api/staff/editorial') return handleEditorial(request,env,url,programs,operator)
    if(path==='/api/hubs')return collectHub(request,env,programs)
    const next = await handleConversations(request,env,url,programs,operator) || await handleNurture(request,env,url,programs,operator) || await handleAppointments(request,env,url,programs,operator) || await handleIntelligence(request,env,url,programs,operator)
    if(next)return next
    const res = await handleMetrics(request,env,path,operator) || await handleAdvisor(request,env,url,programs,operator) || await handleAdmissions(request,env,url,programs,operator,onLeadCreated) || await handleIntegrations(request,env,url,programs,operator)
    return res || json({error:'Ruta no disponible.'},404)
  }
  if (method !== 'GET') return json({error:'Método no permitido.'},405)
  if (publicWorkspaces.has(path)) return html(renderCRM(path,{demo:true,programs}),200,true)
  if (staffPaths.has(path)) {
    if (!operator && path === '/equipo' && url.searchParams.get('demo') === '1') return html(renderCRM(path,{demo:true,programs}),200,true)
    if (!operator) return notice('Acceso a admisiones','Ingresa con una cuenta autorizada por el equipo de admisiones.','/signin-with-chatgpt?return_to='+encodeURIComponent(path),'Iniciar sesión con ChatGPT',403)
    if (path === '/equipo/conexiones') return html(await connectionPage(env),200,true)
    if (path === '/equipo/conversion') return html(await conversionPage(env,programs),200,true)
    if (path === '/equipo/manual' || path === '/equipo/verificacion') return html(manual(path.split('/').at(-1)),200,true)
    return html(renderCRM(path,{operator,programs}),200,true)
  }
  const program = path.startsWith('/programas/') && programs.find(p=>'/programas/'+p.slug===path)
  const guidesPage = path === '/guias' || path.startsWith('/guias/')
  let articles = []
  if (guidesPage) {
    const items = path === '/guias' ? await publicArticles(env) : [await publicArticles(env,path.slice(7))]
    const official=path==='/guias'?new Map():await officialGuides(env.DB,path.slice(7))
    articles = items.filter(Boolean).map(a=>({...a,description:a.summary,published_at:a.publishedAt,officialUrl:official.get(a.slug)}))
  }
  const guide = path.startsWith('/guias/') && articles.some(a=>'/guias/'+a.slug===path)
  if (!publicPages.has(path) && !program && !guide) return notice('Esta página no está disponible','Puedes explorar la oferta de posgrados o volver a orientación.','/programas','Explorar maestrías',404)
  const page = renderStudent(path+url.search,programs,{origin,indexable,articles,institutionalLive:env.INSTITUTIONAL_LIVE==='true',appointmentHtml:path==='/cita'?appointmentForm(programs,url.searchParams.get('programa'),env.INSTITUTIONAL_LIVE!=='true'):'',query:url.searchParams,searchParams:url.searchParams})
  return html(page.replace('</body>','<script defer src="/embudo.js"></script>'+(guide?'<script defer src="/articulos.js"></script>':'')+'</body>'))
}
export async function serve(request,env,manual,onLeadCreated) {
  const url = new URL(request.url)
  const privatePage = env.SEO_INDEXABLE !== 'true' || url.origin !== originFor(env,url) || publicWorkspaces.has(url.pathname.replace(/\/+$/,'')) || /^\/(equipo|api|preferencias|confirmar)(\/|$)/.test(url.pathname)
  try {
    return secured(await route(request,env,url,manual,onLeadCreated),privatePage)
  } catch (e) {
    const category=url.pathname.split('/').slice(0,2).join('/')
    console.error('Error de servicio',category,e?.name)
    return secured(url.pathname.startsWith('/api/') ? json({error:'El servicio no está disponible temporalmente. Vuelve a intentarlo.'},503) : notice('No pudimos cargar esta página','Vuelve a intentarlo en unos momentos.','/','Volver a posgrados',503),true)
  }
}
