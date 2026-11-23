import {programs as catalog} from './catalog.js';
import {readOpenSeoMetrics} from './openseo.js';

const dayMs = 86400000;
const validSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const metric = value => Number.isFinite(value) && value >= 0 ? value : null;
const termKey = value => value.normalize('NFKC').toLocaleLowerCase('es').trim();
const researchSources = new Map([
  ['saved_keywords', 'OpenSEO · Términos guardados'],
  ['project_snapshot', 'OpenSEO · Estudio de Ecuador'],
  ['keyword_generator', 'OpenSEO · Keyword Generator']
]);

// A failed or uninstalled source differs from a working counter with no recorded events.
async function readRows(db, sql, ...args) {
  if (!db) return null;
  try {
    const stmt = db.prepare(sql);
    const result = await (args.length ? stmt.bind(...args) : stmt).all();
    if (result.success === false || !Array.isArray(result.results)) throw new Error('Lectura SEO incompleta.');
    return result.results;
  } catch (error) {
    if (/no such table|no such column/i.test(String(error?.message))) return null;
    throw error;
  }
}

function researchTerms(observations) {
  const byTerm = new Map();
  for (const [sourceKey, source] of researchSources) {
    for (const item of observations) {
      if (item.sourceKey !== sourceKey || typeof item.keyword !== 'string' || !item.keyword.trim()) continue;
      const key = termKey(item.keyword);
      if (byTerm.has(key)) continue;
      byTerm.set(key, {
        keyword:item.keyword, source, observedAt:item.observedAt || null,
        searchVolume:metric(item.volume), keywordDifficulty:metric(item.difficulty),
        cpc:metric(item.cpc), competition:metric(item.competition)
      });
    }
  }
  return [...byTerm.values()].sort((a,b) =>
    (b.searchVolume ?? -1) - (a.searchVolume ?? -1) || a.keyword.localeCompare(b.keyword,'es'));
}

function verifiedSearchObservation(observations, canonicalUrls) {
  const exact = observations.filter(item => item.sourceKey === 'gsc' && item.url &&
    canonicalUrls.includes(item.url) && typeof item.keyword === 'string' && item.periodStart && item.periodEnd);
  exact.sort((a,b) => b.periodEnd.localeCompare(a.periodEnd) ||
    (b.impressions ?? -1) - (a.impressions ?? -1));
  if (!exact.length) return null;
  const {keyword, url, periodStart, periodEnd, clicks, impressions, ctr, position} = exact[0];
  return {keyword, url, periodStart, periodEnd, clicks:metric(clicks), impressions:metric(impressions),
    ctr:metric(ctr), position:metric(position)};
}

const eventsFor = (table, keyColumn, kind, viewEvent, clickEvent) => `
  SELECT '${kind}:' || ${keyColumn} AS id,
    SUM(CASE WHEN event='${viewEvent}' THEN total ELSE 0 END) AS views,
    SUM(CASE WHEN event='${clickEvent}' THEN total ELSE 0 END) AS ctaClicks
  FROM ${table} WHERE day BETWEEN ?1 AND ?2 GROUP BY ${keyColumn}`;

// Only aggregates leave SQL. A subsequent appointment or enrollment must belong to the
// same person and program and follow the tagged submission within the reporting window.
const attribution = `WITH submissions AS (
  SELECT lead_id,program,source,CASE WHEN json_valid(context) THEN context ELSE '{}' END AS context,created_at
  FROM lead_submissions WHERE date(created_at) BETWEEN ?1 AND ?2
), attributed AS (
  SELECT 'programa:' || program AS id, lead_id,program,created_at FROM submissions
    WHERE source='programa' AND json_extract(context,'$.hubVariant') IN ('A','B')
  UNION ALL
  SELECT 'guia:' || a.slug,s.lead_id,s.program,s.created_at FROM submissions s
    JOIN seo_articles a ON a.slug=json_extract(s.context,'$.utm_content') AND a.program=s.program
    WHERE a.status='published' AND a.program<>'' AND julianday(s.created_at)>=julianday(a.published_at)
      AND json_extract(s.context,'$.utm_source')='guia' AND json_extract(s.context,'$.utm_medium')='editorial'
) `;

async function counts(env,start,end,previousStart,previousEnd) {
  const query = sql => readRows(env.DB,sql,start,end);
  const hubEvents = eventsFor('admissions_hub_counts','program','programa','hub_view','inquiry_click');
  const guideEvents = eventsFor('seo_article_counts','slug','guia','view','click');
  const [program,guide,priorProgram,priorGuide,leads,appointments,enrollments] = await Promise.all([
    query(hubEvents), query(guideEvents),
    readRows(env.DB,hubEvents,previousStart,previousEnd), readRows(env.DB,guideEvents,previousStart,previousEnd),
    query(attribution + 'SELECT id,COUNT(DISTINCT lead_id) AS total FROM attributed GROUP BY id'),
    query(attribution + `SELECT a.id,COUNT(DISTINCT a.lead_id) AS total FROM attributed a
      JOIN admissions_appointments p ON p.lead_id=a.lead_id AND p.program=a.program
      WHERE p.status IN ('booked','completed','no_show') AND date(p.created_at) BETWEEN ?1 AND ?2
        AND julianday(p.created_at)>=julianday(a.created_at) GROUP BY a.id`),
    query(attribution + `SELECT a.id,COUNT(DISTINCT a.lead_id) AS total FROM attributed a
      JOIN leads l ON l.id=a.lead_id AND l.program=a.program AND l.stage='Matriculado'
      JOIN admissions_cases c ON c.lead_id=l.id JOIN admissions_stage_evidence e ON e.id=c.enrollment_evidence_id
      WHERE e.lead_id=l.id AND e.stage='Matriculado' AND date(e.recorded_at) BETWEEN ?1 AND ?2
        AND julianday(e.recorded_at)>=julianday(a.created_at) GROUP BY a.id`)
  ]);
  const map = rows => rows && new Map(rows.map(row=>[row.id,row]));
  const previousMap = rows => rows?.some(row=>row.views > 0 || row.ctaClicks > 0) ? map(rows) : null;
  return {programa:map(program),guia:map(guide),leads:map(leads),appointments:map(appointments),enrollments:map(enrollments),
    previous:{programa:previousMap(priorProgram),guia:previousMap(priorGuide)}};
}

export async function loadSeoEvidence(env, programs=catalog, days=30, {team=false}={}) {
  if (![7,30,90].includes(days)) throw new RangeError('Periodo de medición inválido.');
  const now = Date.now();
  const start = new Date(now-(days-1)*dayMs).toISOString().slice(0,10);
  const end = new Date(now).toISOString().slice(0,10);
  const previousStart = new Date(now-(2*days-1)*dayMs).toISOString().slice(0,10);
  const previousEnd = new Date(now-days*dayMs).toISOString().slice(0,10);
  const [seo,articles,stats] = await Promise.all([
    readOpenSeoMetrics(env.DB,null,{programs}),
    readRows(env.DB,`SELECT slug,title,program,published_at AS publishedAt,source_query AS sourceQuery
      FROM seo_articles WHERE status='published' ORDER BY published_at DESC,slug`),
    team ? counts(env,start,end,previousStart,previousEnd) : null
  ]);
  const catalogBySlug = new Map(programs.map(p=>[p.slug,p]));
  const byProgram = new Map(seo.programs.map(p=>[p.program,p.keywords]));
  let origin = '';
  try { origin = new URL(env.PUBLIC_BASE_URL).origin; } catch { /* Site origin is optional in development. */ }
  const rows = [];
  function page(kind,slug,title,program,research,extra={}) {
    const id = kind+':'+slug;
    const url = (kind==='programa'?'/programas/':'/guias/')+slug;
    const canonicalUrls = [origin+url];
    if (kind==='programa') canonicalUrls.push(catalogBySlug.get(slug).url);
    const source = byProgram.get(program) || [];
    const primary = research[0];
    const count = (key,field) => stats?.[key] ? stats[key].get(id)?.[field] ?? 0 : null;
    const history = stats?.previous[kind];
    const existed = kind === 'programa' || (extra.publishedAt && extra.publishedAt.slice(0,10) <= previousStart);
    const prior = history?.get(id);
    rows.push({
      previous:history && existed ? {start:previousStart,end:previousEnd,views:prior?.views ?? 0,ctaClicks:prior?.ctaClicks ?? 0} : null,
      id,kind,title,url,program,...extra,keyword:primary?.keyword ?? null,
      observedAt:primary?.observedAt ?? null,source:primary?.source ?? null,keywords:research,
      searchObservation:team ? verifiedSearchObservation(source,canonicalUrls) : null,
      metrics:{
        views:count(kind,'views'),ctaClicks:count(kind,'ctaClicks'),leads:count('leads','total'),
        appointments:count('appointments','total'),enrollments:count('enrollments','total'),
        searchVolume:primary?.searchVolume ?? null,keywordDifficulty:primary?.keywordDifficulty ?? null,
        cpc:primary?.cpc ?? null,competition:primary?.competition ?? null,
        // Stored GSC observations describe a query + URL, not page totals for this period.
        clicks:null,impressions:null,ctr:null,position:null
      }
    });
  }
  const termsByProgram = new Map();
  for (const program of programs) {
    if (!validSlug(program.slug)) continue;
    const terms = researchTerms(byProgram.get(program.slug) || []);
    termsByProgram.set(program.slug,terms);
    page('programa',program.slug,program.title,program.slug,terms);
  }
  for (const article of articles || []) {
    if (!validSlug(article.slug)) continue;
    const topic = termKey(article.sourceQuery || '');
    const matchingTerms = (termsByProgram.get(article.program) || []).filter(k=>termKey(k.keyword)===topic);
    page('guia',article.slug,article.title,article.program,matchingTerms,{publishedAt:article.publishedAt});
  }
  return {days,start,end,rows};
}
