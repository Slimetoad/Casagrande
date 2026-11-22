import {json} from './observability.js';
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statement=(db,sql,...values)=>db.prepare(sql).bind(...values);
const privateRequest=req=>req.headers.get('Sec-GPC')==='1'||['1','yes'].includes((req.headers.get('DNT')||'').toLowerCase());
async function smallBody(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||'') || Number(req.headers.get('content-length')||0)>1024)return null;
 const reader=req.body?.getReader();if(!reader)return null;let n=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>1024){await reader.cancel();return null}chunks.push(value)}
 try{return JSON.parse(await new Blob(chunks).text())}catch{return null}
}
export async function collectArticle(request,env){
 if(request.method!=='POST')return json({error:'Método no disponible.'},405);
 if(privateRequest(request))return new Response(null,{status:204});
 const value=await smallBody(request);
 if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!['slug','event'].includes(k)) ||
    typeof value.slug!=='string' || value.slug.length>100 || !slugPattern.test(value.slug) || !['view','click'].includes(value.event))return json({error:'Interacción inválida.'},400);
 if(!env.DB)return json({error:'Medición no disponible.'},503);
 const result=await statement(env.DB,`INSERT INTO seo_article_counts(day,slug,event,total)
   SELECT date('now'),slug,?,1 FROM seo_articles WHERE slug=? AND status='published'
   ON CONFLICT(day,slug,event) DO UPDATE SET total=total+1`,value.event,value.slug).run();
 return result.meta?.changes?new Response(null,{status:204}):json({error:'Guía no disponible.'},404);
}
export async function articlePerformance(env){
 if(!env.DB)return {days:30,rows:[]};
 const sql=`SELECT a.slug,a.title,a.program,a.published_at AS publishedAt,
  COALESCE((SELECT SUM(total) FROM seo_article_counts c WHERE c.slug=a.slug AND c.event='view' AND c.day>=date('now','-29 days')),0) views,
  COALESCE((SELECT SUM(total) FROM seo_article_counts c WHERE c.slug=a.slug AND c.event='click' AND c.day>=date('now','-29 days')),0) ctaClicks,
  (SELECT COUNT(DISTINCT s.lead_id) FROM lead_submissions s WHERE s.program=a.program AND s.program<>''
   AND julianday(s.created_at)>=julianday(a.published_at) AND datetime(s.created_at)>=datetime('now','-30 days') AND json_valid(s.context)
   AND json_extract(s.context,'$.utm_source')='guia' AND json_extract(s.context,'$.utm_medium')='editorial' AND json_extract(s.context,'$.utm_content')=a.slug) leads,
  (SELECT COUNT(DISTINCT ap.lead_id) FROM admissions_appointments ap WHERE ap.program=a.program AND ap.status IN ('booked','completed','no_show')
   AND datetime(ap.created_at)>=datetime('now','-30 days') AND EXISTS(SELECT 1 FROM lead_submissions s WHERE s.lead_id=ap.lead_id AND s.program=ap.program AND julianday(s.created_at)>=julianday(a.published_at) AND julianday(s.created_at)<=julianday(ap.created_at) AND datetime(s.created_at)>=datetime('now','-30 days') AND json_valid(s.context) AND json_extract(s.context,'$.utm_source')='guia' AND json_extract(s.context,'$.utm_medium')='editorial' AND json_extract(s.context,'$.utm_content')=a.slug)) appointments,
  (SELECT COUNT(DISTINCT l.id) FROM leads l JOIN admissions_cases ac ON ac.lead_id=l.id JOIN admissions_stage_evidence ev ON ev.id=ac.enrollment_evidence_id
   WHERE l.program=a.program AND l.stage='Matriculado' AND ev.stage='Matriculado' AND datetime(ev.recorded_at)>=datetime('now','-30 days')
   AND EXISTS(SELECT 1 FROM lead_submissions s WHERE s.lead_id=l.id AND s.program=l.program AND julianday(s.created_at)>=julianday(a.published_at) AND julianday(s.created_at)<=julianday(ev.recorded_at) AND datetime(s.created_at)>=datetime('now','-30 days') AND json_valid(s.context) AND json_extract(s.context,'$.utm_source')='guia' AND json_extract(s.context,'$.utm_medium')='editorial' AND json_extract(s.context,'$.utm_content')=a.slug)) enrollments
  FROM seo_articles a WHERE a.status='published' ORDER BY a.published_at DESC,a.slug LIMIT 500`;
 const result=await env.DB.prepare(sql).all();
 return {days:30,rows:(result.results||[]).map(r=>({...r,attribution:'enlace_etiquetado'}))};
}
