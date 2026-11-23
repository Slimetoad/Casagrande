import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openSqliteD1 } from './d1-sqlite.mjs';
import { serve } from '../src/portal.js';
import { brand, programs } from '../src/catalog.js';
import { followupOnCapture } from '../src/capture-followup.js';
import { withConversationWake } from '../src/conversation-wake.js';
import { contactEmail } from '../src/contact-identity.js';
import { clean, matches, normalized, programFact } from '../src/providers.js';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_DIR = resolve(ROOT_DIR, 'public');
const MAX_BODY_BYTES = 512 * 1024;
const ALLOWED_DEFAULT_ORIGINS = ['https://slimetoad.github.io', 'http://localhost:3000'];
const CROSS_ORIGIN_PUBLIC_PATHS = new Set([
  '/api/leads',
  '/api/chat',
  '/api/analytics',
  '/api/hubs',
  '/api/citas/solicitar',
  '/api/citas/gestionar'
]);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function loadManualRenderer() {
  let designDoc = '';
  let verificationDoc = '';
  try { designDoc = readFileSync(resolve(ROOT_DIR, 'docs/diseno-operativo.md'), 'utf8'); } catch { /* optional */ }
  try { verificationDoc = readFileSync(resolve(ROOT_DIR, 'docs/verificacion-v2.md'), 'utf8'); } catch { /* optional */ }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return scope => {
    const content = scope === 'verificacion' ? verificationDoc : designDoc;
    const title = scope === 'verificacion' ? 'Verificación del sistema' : 'Manual del equipo';
    return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${title} · UCG</title><main style="max-width:52rem;margin:2rem auto;font:1rem/1.6 system-ui;padding:0 1rem"><h1>${title}</h1><pre style="white-space:pre-wrap">${esc(content)}</pre></main></html>`;
  };
}

const renderManual = loadManualRenderer();

function parseOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const u = new URL(value.trim());
    return ['http:', 'https:'].includes(u.protocol) ? u.origin : '';
  } catch {
    return '';
  }
}

export function isAllowedOrigin(origin, env = process.env, requestOrigin = '') {
  if (!origin) return false;
  if (requestOrigin && origin === requestOrigin) return true;
  if (ALLOWED_DEFAULT_ORIGINS.includes(origin)) return true;
  const pubOrigin = parseOrigin(env.PUBLIC_BASE_URL);
  if (pubOrigin && origin === pubOrigin) return true;
  if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin)) return true;
  return false;
}

function applyCorsHeaders(response, origin, env, requestOrigin) {
  if (!origin || !isAllowedOrigin(origin, env, requestOrigin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
  const vary = headers.get('Vary');
  headers.set('Vary', vary ? (vary.includes('Origin') ? vary : vary + ', Origin') : 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function safeJson(text, fallback = {}) {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function handleHealth(env) {
  let dbReady = false;
  try {
    const row = await env.DB?.prepare('SELECT 1 AS ok').first();
    dbReady = row?.ok === 1;
  } catch {
    dbReady = false;
  }
  return Response.json({
    ok: dbReady,
    service: 'casagrande-posgrados-crm',
    retellConfigured: Boolean(env.RETELL_API_KEY && env.RETELL_INBOUND_AGENT_ID && env.RETELL_INBOUND_NUMBER),
    mailConfigured: Boolean(env.RESEND_API_KEY && env.RESEND_FROM),
    dbReady,
    inboundNumber: env.RETELL_INBOUND_NUMBER || null
  }, {
    status: dbReady ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' }
  });
}

async function handlePublicCrm(env) {
  if (!env.DB) {
    return Response.json({ error: 'Base de datos no disponible.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const [leadsRes, convRes, eventsRes, jobsRes, statsRes] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, email, phone, program, stage, source, consent_email, created_at, updated_at, context FROM leads ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 30'),
    env.DB.prepare('SELECT id, lead_id, provider, kind, direction, excerpt, extraction, contact_name, contact_email, contact_phone, occurred_at FROM admissions_conversations ORDER BY occurred_at DESC, created_at DESC, id DESC LIMIT 30'),
    env.DB.prepare('SELECT id, lead_id, type, description, created_at, actor FROM events ORDER BY created_at DESC, rowid DESC LIMIT 40'),
    env.DB.prepare(`SELECT j.id, j.signal_id, j.lead_id, j.status, j.due_at, j.attempts, j.updated_at, j.provider_id,
      s.channel, s.intent, s.decision, s.program
      FROM conversation_nurture_jobs j
      LEFT JOIN conversation_nurture_signals s ON s.id = j.signal_id
      ORDER BY j.updated_at DESC, j.rowid DESC LIMIT 30`),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM leads) AS total_leads,
      (SELECT COUNT(*) FROM admissions_conversations WHERE provider='retell') AS retell_calls,
      (SELECT COUNT(*) FROM leads WHERE email NOT LIKE 'intake:phone:%' AND email <> '' AND (json_extract(context, '$.emailConfirmed') = 1 OR consent_email = 1)) AS verified_emails,
      (SELECT COUNT(*) FROM conversation_nurture_jobs WHERE status='accepted') AS recap_emails_sent,
      (SELECT COUNT(*) FROM conversation_nurture_jobs WHERE status IN ('pending','processing')) AS pending_nurture_jobs`)
  ]);

  const leads = (leadsRes.results || []).map(row => ({
    id: row.id,
    name: row.name,
    email: contactEmail(row.email),
    phone: row.phone,
    program: row.program,
    stage: row.stage,
    source: row.source,
    consent_email: row.consent_email,
    created_at: row.created_at,
    updated_at: row.updated_at,
    context: safeJson(row.context, {})
  }));

  const conversations = (convRes.results || []).map(row => ({
    id: row.id,
    lead_id: row.lead_id,
    provider: row.provider,
    kind: row.kind,
    direction: row.direction,
    excerpt: row.excerpt,
    extraction: safeJson(row.extraction, {}),
    contact_name: row.contact_name,
    contact_email: contactEmail(row.contact_email),
    contact_phone: row.contact_phone,
    occurred_at: row.occurred_at
  }));

  const s = statsRes.results?.[0] || {};
  return Response.json({
    leads,
    conversations,
    events: eventsRes.results || [],
    nurtureJobs: jobsRes.results || [],
    stats: {
      totalLeads: s.total_leads || 0,
      retellCalls: s.retell_calls || 0,
      verifiedEmails: s.verified_emails || 0,
      recapEmailsSent: s.recap_emails_sent || 0,
      pendingNurtureJobs: s.pending_nurture_jobs || 0
    }
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

async function handleCatalogLookup(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Envía un objeto JSON válido.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const args = payload && typeof payload.args === 'object' && payload.args && !Array.isArray(payload.args)
    ? payload.args
    : (payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {});
  const slug = clean(args.slug, 120).toLowerCase();
  const area = clean(args.area, 80);
  const query = clean(args.query || args.q || args.program, 300);

  let matched = [];
  if (slug) {
    const exact = programs.find(p => p.slug === slug);
    if (exact) matched = [exact];
  }
  if (!matched.length && query) {
    matched = matches(query, programs);
  }
  if (!matched.length && area) {
    const targetArea = normalized(area);
    matched = programs.filter(p => normalized(p.area).includes(targetArea));
  }
  if (!matched.length && !slug && !query && !area) {
    matched = programs.slice(0, 6);
  }

  return Response.json({
    ok: true,
    total: matched.length,
    programs: matched.slice(0, 6).map(p => ({ slug: p.slug, shortTitle: p.shortTitle, ...programFact(p) })),
    catalogUrl: brand.catalogUrl,
    admissionsPhone: brand.admissionsPhone
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

async function tryStaticAsset(pathname, method) {
  if (!['GET', 'HEAD'].includes(method)) return null;
  if (!pathname.startsWith('/media/') && !/\.(?:css|js|svg|png|webp|jpg|jpeg|ico)$/i.test(pathname)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const target = resolve(PUBLIC_DIR, '.' + decoded);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + sep)) return null;
  try {
    const info = await stat(target);
    if (!info.isFile()) return null;
    const type = MIME_TYPES[extname(target).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'public, max-age=300' };
    if (method === 'HEAD') return new Response(null, { status: 200, headers });
    const data = await readFile(target);
    return new Response(data, { status: 200, headers });
  } catch {
    return null;
  }
}

export const defaultCtx = {
  waitUntil(p) {
    Promise.resolve(p).catch(err => console.error('waitUntil error:', err));
  }
};

export async function handleHttpRequest(request, env, ctx = defaultCtx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const originHeader = request.headers.get('origin') || '';

  if (request.method === 'OPTIONS') {
    if (originHeader && !isAllowedOrigin(originHeader, env, url.origin)) {
      return Response.json({ error: 'Origen no permitido.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    const headers = new Headers({
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store'
    });
    if (originHeader) {
      headers.set('Access-Control-Allow-Origin', originHeader);
      headers.set('Vary', 'Origin');
    }
    return new Response(null, { status: 204, headers });
  }

  let response;
  if (path === '/api/health' && ['GET', 'HEAD'].includes(request.method)) {
    response = await handleHealth(env);
    if (request.method === 'HEAD') {
      response = new Response(null, { status: response.status, headers: response.headers });
    }
  } else if (path === '/api/public/crm' && ['GET', 'HEAD'].includes(request.method)) {
    response = await handlePublicCrm(env);
    if (request.method === 'HEAD') {
      response = new Response(null, { status: response.status, headers: response.headers });
    }
  } else if (path === '/api/retell/catalog-lookup' && request.method === 'POST') {
    response = await handleCatalogLookup(request);
  } else {
    const asset = await tryStaticAsset(url.pathname, request.method);
    if (asset) {
      response = asset;
    } else {
      let forwarded = request;
      if (!['GET', 'HEAD'].includes(request.method) && CROSS_ORIGIN_PUBLIC_PATHS.has(path) && originHeader && originHeader !== url.origin) {
        if (isAllowedOrigin(originHeader, env, url.origin)) {
          const headers = new Headers(request.headers);
          headers.set('origin', url.origin);
          headers.delete('sec-fetch-site');
          const rawBody = await request.arrayBuffer();
          forwarded = new Request(request.url, { method: request.method, headers, body: rawBody });
        }
      }
      const onLeadCreated = request.method === 'POST' && /^\/api\/leads\/?$/.test(path)
        ? followupOnCapture(env, ctx, programs)
        : undefined;
      const runtime = request.method === 'POST' && path.startsWith('/api/webhooks/')
        ? withConversationWake(env, ctx, programs)
        : env;
      response = await serve(forwarded, runtime, renderManual, onLeadCreated);
    }
  }

  return applyCorsHeaders(response, originHeader, env, url.origin);
}

function toWebRequest(req, port) {
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:' + port;
  const fullUrl = `${proto}://${host}${req.url || '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
  if (!headers.has('cf-connecting-ip') && typeof req.headers['x-forwarded-for'] === 'string') {
    const ip = req.headers['x-forwarded-for'].split(',')[0]?.trim();
    if (ip) headers.set('cf-connecting-ip', ip);
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    return Promise.resolve(new Request(fullUrl, { method: req.method, headers }));
  }
  return new Promise((resolveReq, rejectReq) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        req.destroy();
        rejectReq(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      resolveReq(new Request(fullUrl, { method: req.method, headers, body }));
    });
    req.on('error', err => {
      if (!rejected) rejectReq(err);
    });
  });
}

export function startServer(customEnv = null) {
  const db = customEnv?.DB || openSqliteD1();
  const env = customEnv ? { ...customEnv, DB: db } : { ...process.env, DB: db };
  const port = Number(env.PORT || 3000);
  const server = http.createServer(async (req, res) => {
    try {
      const request = await toWebRequest(req, port);
      const response = await handleHttpRequest(request, env, defaultCtx);
      const outHeaders = {};
      for (const [key, value] of response.headers.entries()) {
        outHeaders[key] = value;
      }
      res.writeHead(response.status, outHeaders);
      if (req.method === 'HEAD' || !response.body) {
        res.end();
      } else {
        const buffer = Buffer.from(await response.arrayBuffer());
        res.end(buffer);
      }
    } catch (err) {
      const status = err?.status === 413 ? 413 : 500;
      console.error('server error:', status, err?.message || 'unknown');
      if (!res.headersSent) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      }
      res.end(JSON.stringify({ error: status === 413 ? 'La solicitud supera el límite permitido.' : 'Error interno del servidor.' }));
    }
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`casagrande-posgrados-crm listening on http://0.0.0.0:${port} (db: ${db.path || 'custom'})`);
  });
  return { server, db, env, port };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const { server, db } = startServer();
  const shutdown = () => {
    server.close(() => {
      try { db.close?.(); } catch { /* ignore */ }
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
