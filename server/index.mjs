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
import { contactEmail, isPhoneIdentity } from '../src/contact-identity.js';
import { clean, matches, normalized, programFact } from '../src/providers.js';
import { loadSeoEvidence } from '../src/seo-insights-data.js';
import { buildSeoInsights } from '../src/seo-insights.js';
import { marketSnapshot } from '../src/openseo-ecuador.js';
import { ensurePlan, publicEditorial } from '../src/editorial-engine.js';
import { draftEditorialArticle, editorialProposal, institutionalUrl } from '../src/editorial-draft.js';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_DIR = resolve(ROOT_DIR, 'public');
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ALLOWED_DEFAULT_ORIGINS = ['https://slimetoad.github.io', 'http://localhost:3000'];
const CROSS_ORIGIN_PUBLIC_PATHS = new Set([
  '/api/leads',
  '/api/chat',
  '/api/analytics',
  '/api/hubs',
  '/api/citas/solicitar',
  '/api/citas/gestionar',
  '/api/editorial/insights'
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
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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

const CRM_STAGES = ['Nuevo', 'En orientación', 'En postulación', 'Admitido', 'Matriculado', 'Cerrado'];
const VALID_SIGNAL_INTENTS = new Set(['programa', 'inversion', 'cita', 'requisitos', 'solicitar_asesor', 'baja', 'postergar', 'desconocido']);
const EMAIL_RE = /^[^<>@\s,;]+@[^<>@\s,;]+\.[^<>@\s,;]+$/;

function crmJson(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function formatPublicLead(row) {
  return {
    id: row.id,
    name: row.name,
    email: contactEmail(row.email),
    phone: row.phone,
    program: row.program,
    stage: row.stage,
    owner: row.owner || '',
    note: row.note || '',
    next_action: row.next_action || '',
    due_at: row.due_at || null,
    paused: row.paused ?? 0,
    score: row.score ?? 0,
    consent_email: row.consent_email ?? 0,
    consent_voice: row.consent_voice ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    context: safeJson(row.context, {}),
    revision: row.revision ?? 1
  };
}

function cleanEmailBody(value, max = 8000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

async function readJsonBody(request) {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseBoolBit(value) {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  return null;
}

function parseIsoOrNull(value) {
  if (value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  const ts = Date.parse(trimmed);
  if (!Number.isFinite(ts)) return { ok: false };
  return { ok: true, value: new Date(ts).toISOString() };
}

function mapTemplateToIntent(template) {
  const t = normalized(template || '');
  if (VALID_SIGNAL_INTENTS.has(t)) return t;
  if (/inversion|financ|precio|beca|costo/.test(t)) return 'inversion';
  if (/cita|agenda|reunion/.test(t)) return 'cita';
  if (/requisito|document|postul|admision/.test(t)) return 'requisitos';
  if (/asesor|llamada/.test(t)) return 'solicitar_asesor';
  return 'programa';
}

async function handlePublicCrm(env) {
  if (!env.DB) {
    return crmJson({ error: 'Base de datos no disponible.' }, 503);
  }
  const [leadsRes, tasksRes, convRes, eventsRes, jobsRes, stageRes, statsRes] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, email, phone, program, stage, owner, note, next_action, due_at, paused, score, consent_email, consent_voice, created_at, updated_at, context, revision FROM leads ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 100'),
    env.DB.prepare("SELECT id, lead_id, title, status, due_at, created_at FROM tasks ORDER BY (status='pendiente') DESC, due_at IS NULL, due_at ASC, created_at DESC LIMIT 100"),
    env.DB.prepare('SELECT id, lead_id, provider, kind, direction, excerpt, extraction, contact_name, contact_email, contact_phone, occurred_at FROM admissions_conversations ORDER BY occurred_at DESC, created_at DESC, id DESC LIMIT 50'),
    env.DB.prepare('SELECT id, lead_id, type, description, created_at, actor FROM events ORDER BY created_at DESC, rowid DESC LIMIT 80'),
    env.DB.prepare(`SELECT j.id, j.signal_id, j.lead_id, j.status, j.due_at, j.attempts, j.updated_at, j.provider_id,
      s.channel, s.intent, s.decision, s.program, s.next_action AS subject, s.reason
      FROM conversation_nurture_jobs j
      LEFT JOIN conversation_nurture_signals s ON s.id = j.signal_id
      ORDER BY j.updated_at DESC, j.rowid DESC LIMIT 60`),
    env.DB.prepare('SELECT stage, COUNT(*) AS n FROM leads GROUP BY stage'),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM leads) AS total_leads,
      (SELECT COUNT(*) FROM admissions_conversations WHERE provider='retell') AS retell_calls,
      (SELECT COUNT(*) FROM leads WHERE email NOT LIKE 'intake:phone:%' AND email <> '' AND (json_extract(context, '$.emailConfirmed') = 1 OR consent_email = 1)) AS verified_emails,
      (SELECT COUNT(*) FROM conversation_nurture_jobs WHERE status='accepted') AS recap_emails_sent,
      (SELECT COUNT(*) FROM conversation_nurture_jobs WHERE status IN ('pending','processing')) AS pending_nurture_jobs,
      (SELECT COUNT(*) FROM tasks WHERE status='pendiente') AS open_tasks,
      (SELECT COALESCE(ROUND(AVG(score)), 0) FROM leads) AS avg_score`)
  ]);

  const leads = (leadsRes.results || []).map(formatPublicLead);
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
  const nurtureJobs = (jobsRes.results || []).map(row => ({
    id: row.id,
    signal_id: row.signal_id,
    lead_id: row.lead_id,
    status: row.status,
    due_at: row.due_at,
    attempts: row.attempts,
    updated_at: row.updated_at,
    provider_id: row.provider_id,
    channel: row.channel || 'email',
    intent: row.intent || 'programa',
    decision: row.decision || 'respuesta_programada',
    program: row.program || '',
    subject: row.subject || null,
    reason: row.reason || null
  }));
  const stageCounts = Object.fromEntries(CRM_STAGES.map(stage => [stage, 0]));
  for (const row of stageRes.results || []) {
    if (Object.hasOwn(stageCounts, row.stage)) stageCounts[row.stage] = row.n;
  }

  const s = statsRes.results?.[0] || {};
  return crmJson({
    leads,
    tasks: tasksRes.results || [],
    conversations,
    events: eventsRes.results || [],
    nurtureJobs,
    stats: {
      totalLeads: s.total_leads || 0,
      retellCalls: s.retell_calls || 0,
      verifiedEmails: s.verified_emails || 0,
      recapEmailsSent: s.recap_emails_sent || 0,
      pendingNurtureJobs: s.pending_nurture_jobs || 0,
      openTasks: s.open_tasks || 0,
      avgScore: s.avg_score || 0,
      stageCounts
    }
  });
}

async function handlePatchCrmLead(request, env, id) {
  const existing = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
  if (!existing) return crmJson({ error: 'No encontramos ese expediente.' }, 404);
  const body = await readJsonBody(request);
  if (!body) return crmJson({ error: 'Envía un objeto JSON válido.' }, 400);

  const updates = {};
  const changes = [];

  if (Object.hasOwn(body, 'stage')) {
    if (!CRM_STAGES.includes(body.stage)) return crmJson({ error: 'Selecciona una etapa válida.' }, 422);
    updates.stage = body.stage;
    if (body.stage !== existing.stage) changes.push(`Etapa: ${existing.stage} → ${body.stage}`);
  }
  if (Object.hasOwn(body, 'owner')) {
    if (typeof body.owner !== 'string') return crmJson({ error: 'Revisa el campo responsable.' }, 422);
    updates.owner = clean(body.owner, 80);
    if (updates.owner !== existing.owner) changes.push(updates.owner ? `Responsable: ${updates.owner}` : 'Responsable retirado');
  }
  if (Object.hasOwn(body, 'program')) {
    if (typeof body.program !== 'string') return crmJson({ error: 'Selecciona un programa válido.' }, 422);
    const slug = clean(body.program, 160);
    if (slug && !programs.some(p => p.slug === slug)) return crmJson({ error: 'Programa fuera del catálogo oficial.' }, 422);
    updates.program = slug;
    if (slug !== existing.program) {
      const title = programs.find(p => p.slug === slug)?.shortTitle || slug || 'Sin programa específico';
      changes.push(`Programa: ${title}`);
    }
  }
  if (Object.hasOwn(body, 'next_action')) {
    if (typeof body.next_action !== 'string') return crmJson({ error: 'Revisa la próxima acción.' }, 422);
    updates.next_action = clean(body.next_action, 200);
    if (updates.next_action !== existing.next_action) changes.push(updates.next_action ? `Próxima acción: ${updates.next_action}` : 'Próxima acción retirada');
  }
  if (Object.hasOwn(body, 'due_at')) {
    const parsedDate = parseIsoOrNull(body.due_at);
    if (!parsedDate.ok) return crmJson({ error: 'Ingresa una fecha válida para due_at.' }, 422);
    updates.due_at = parsedDate.value;
    if (updates.due_at !== (existing.due_at || null)) changes.push(updates.due_at ? `Fecha límite: ${updates.due_at.slice(0, 10)}` : 'Fecha límite retirada');
  }
  if (Object.hasOwn(body, 'note')) {
    if (typeof body.note !== 'string') return crmJson({ error: 'Revisa la nota.' }, 422);
    updates.note = cleanEmailBody(body.note, 2000);
    if (updates.note !== existing.note) changes.push('Nota actualizada');
  }
  if (Object.hasOwn(body, 'paused')) {
    const bit = parseBoolBit(body.paused);
    if (bit === null) return crmJson({ error: 'Valor de pausa no válido.' }, 422);
    updates.paused = bit;
    if (bit !== existing.paused) changes.push(bit ? 'Seguimiento pausado' : 'Seguimiento reanudado');
  }
  if (Object.hasOwn(body, 'score')) {
    const n = Number(body.score);
    if (!Number.isInteger(n) || n < 0 || n > 100 || body.score === '' || body.score === null || typeof body.score === 'boolean') {
      return crmJson({ error: 'El puntaje debe ser un entero entre 0 y 100.' }, 422);
    }
    updates.score = n;
    if (n !== existing.score) changes.push(`Puntaje: ${n}/100`);
  }
  if (Object.hasOwn(body, 'consent_email')) {
    const bit = parseBoolBit(body.consent_email);
    if (bit === null) return crmJson({ error: 'Valor de consentimiento de correo no válido.' }, 422);
    updates.consent_email = bit;
    if (bit !== existing.consent_email) changes.push(bit ? 'Correo autorizado' : 'Correo desactivado');
  }
  if (Object.hasOwn(body, 'consent_voice')) {
    const bit = parseBoolBit(body.consent_voice);
    if (bit === null) return crmJson({ error: 'Valor de consentimiento de voz no válido.' }, 422);
    updates.consent_voice = bit;
    if (bit !== existing.consent_voice) changes.push(bit ? 'Llamadas autorizadas' : 'Llamadas desactivadas');
  }

  const keys = Object.keys(updates);
  if (!keys.length) return crmJson({ error: 'Indica al menos un campo para actualizar.' }, 422);

  const nowIso = new Date().toISOString();
  const actor = clean(body.actor, 80) || 'Admisiones';
  const setClauses = keys.map(k => `${k} = ?`);
  setClauses.push('updated_at = ?', 'revision = revision + 1');
  const values = [...keys.map(k => updates[k]), nowIso, id];

  const batch = [
    env.DB.prepare(`UPDATE leads SET ${setClauses.join(', ')} WHERE id = ?`).bind(...values)
  ];
  if (changes.length) {
    const eventType = Object.hasOwn(updates, 'stage') && updates.stage !== existing.stage ? 'etapa' : 'actualización';
    batch.push(
      env.DB.prepare('INSERT INTO events(id, lead_id, type, description, created_at, actor) VALUES(?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, eventType, changes.join(' · ') + '.', nowIso, actor)
    );
  }
  batch.push(env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id));
  const results = await env.DB.batch(batch);
  const updated = results.at(-1)?.results?.[0];
  return crmJson({ ok: true, lead: formatPublicLead(updated) });
}

async function handleCreateCrmNote(request, env, id) {
  const existing = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first();
  if (!existing) return crmJson({ error: 'No encontramos ese expediente.' }, 404);
  const body = await readJsonBody(request);
  if (!body) return crmJson({ error: 'Envía un objeto JSON válido.' }, 400);
  const text = cleanEmailBody(body.text, 2000);
  if (!text) return crmJson({ error: 'Escribe el contenido de la nota.' }, 422);
  const actor = clean(body.actor, 80) || 'Admisiones';
  const pinToLead = body.pinToLead !== false;
  const nowIso = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const batch = [
    env.DB.prepare('INSERT INTO events(id, lead_id, type, description, created_at, actor) VALUES(?, ?, ?, ?, ?, ?)')
      .bind(eventId, id, 'nota', text, nowIso, actor)
  ];
  if (pinToLead) {
    batch.push(env.DB.prepare('UPDATE leads SET note = ?, updated_at = ? WHERE id = ?').bind(text, nowIso, id));
  } else {
    batch.push(env.DB.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(nowIso, id));
  }
  await env.DB.batch(batch);
  return crmJson({
    ok: true,
    event: { id: eventId, lead_id: id, type: 'nota', description: text, created_at: nowIso, actor }
  }, 201);
}

async function handleCreateCrmTask(request, env, id) {
  const lead = await env.DB.prepare('SELECT id, next_action, due_at FROM leads WHERE id = ?').bind(id).first();
  if (!lead) return crmJson({ error: 'No encontramos ese expediente.' }, 404);
  const body = await readJsonBody(request);
  if (!body) return crmJson({ error: 'Envía un objeto JSON válido.' }, 400);
  const title = clean(body.title, 200);
  if (!title) return crmJson({ error: 'Indica el título de la tarea.' }, 422);
  let dueAt;
  if (Object.hasOwn(body, 'due_at') && body.due_at !== null && body.due_at !== '') {
    const parsedDate = parseIsoOrNull(body.due_at);
    if (!parsedDate.ok) return crmJson({ error: 'Ingresa una fecha válida para la tarea.' }, 422);
    dueAt = parsedDate.value;
  } else {
    dueAt = new Date(Date.now() + 24 * 3600000).toISOString();
  }
  const actor = clean(body.actor, 80) || 'Admisiones';
  const nowIso = new Date().toISOString();
  const taskId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tasks(id, lead_id, title, status, due_at, created_at) VALUES(?, ?, ?, 'pendiente', ?, ?)")
      .bind(taskId, id, title, dueAt, nowIso),
    env.DB.prepare(`UPDATE leads SET
      next_action = CASE WHEN trim(next_action) = '' THEN ? ELSE next_action END,
      due_at = CASE WHEN trim(next_action) = '' THEN ? ELSE due_at END,
      updated_at = ?
      WHERE id = ?`).bind(title, dueAt, nowIso, id),
    env.DB.prepare('INSERT INTO events(id, lead_id, type, description, created_at, actor) VALUES(?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, 'tarea', `Nueva tarea: ${title}`, nowIso, actor)
  ]);
  return crmJson({
    ok: true,
    task: { id: taskId, lead_id: id, title, status: 'pendiente', due_at: dueAt, created_at: nowIso }
  }, 201);
}

async function handlePatchCrmTask(request, env, taskId) {
  const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first();
  if (!existing) return crmJson({ error: 'No encontramos esa tarea.' }, 404);
  const body = await readJsonBody(request);
  if (!body) return crmJson({ error: 'Envía un objeto JSON válido.' }, 400);
  if (!['pendiente', 'hecha'].includes(body.status)) return crmJson({ error: 'El estado de la tarea debe ser pendiente o hecha.' }, 422);
  const actor = clean(body.actor, 80) || 'Admisiones';
  const nowIso = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE tasks SET status = ? WHERE id = ?').bind(body.status, taskId),
    env.DB.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(nowIso, existing.lead_id),
    env.DB.prepare('INSERT INTO events(id, lead_id, type, description, created_at, actor) VALUES(?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), existing.lead_id, 'tarea', `${body.status === 'hecha' ? 'Tarea completada' : 'Tarea reabierta'}: ${existing.title}`, nowIso, actor)
  ]);
  return crmJson({ ok: true, task: { ...existing, status: body.status } });
}

async function handleSendNurtureEmail(request, env, id) {
  const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
  if (!lead) return crmJson({ error: 'No encontramos ese expediente.' }, 404);
  const realEmail = contactEmail(lead.email);
  if (!realEmail || isPhoneIdentity(lead.email) || !EMAIL_RE.test(realEmail)) {
    return crmJson({ error: 'El expediente no cuenta con un correo electrónico válido.' }, 422);
  }
  const body = await readJsonBody(request);
  if (!body) return crmJson({ error: 'Envía un objeto JSON válido.' }, 400);
  const subject = clean(body.subject, 200);
  const emailBody = cleanEmailBody(body.body, 8000);
  if (!subject || !emailBody) return crmJson({ error: 'Ingresa un asunto y un mensaje válidos.' }, 422);
  const template = clean(body.template, 80);
  const actor = clean(body.actor, 80) || 'Admisiones';

  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    return crmJson({ error: 'El servicio de correo Resend no está configurado.' }, 503);
  }

  let resendRes;
  try {
    resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [realEmail],
        subject,
        text: emailBody,
        tags: [{ name: 'flujo', value: 'crm-nurture' }, { name: 'lead', value: lead.id }]
      }),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return crmJson({ error: 'No fue posible conectar con Resend para enviar el correo.' }, 502);
  }

  if (!resendRes.ok) {
    return crmJson({ error: `Resend devolvió el código ${resendRes.status} al enviar el correo.` }, 502);
  }

  const resendData = await resendRes.json().catch(() => null);
  const providerId = typeof resendData?.id === 'string' && resendData.id.trim() ? resendData.id.trim().slice(0, 160) : '';
  if (!providerId) {
    return crmJson({ error: 'Resend no devolvió un identificador de envío válido.' }, 502);
  }

  const nowIso = new Date().toISOString();
  const signalId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const intent = mapTemplateToIntent(template);
  const programObj = programs.find(p => p.slug === lead.program) || null;
  const reason = template ? `Correo manual desde CRM (${template})` : 'Correo manual enviado desde CRM';

  await env.DB.batch([
    env.DB.prepare('INSERT INTO events(id, lead_id, type, description, created_at, actor) VALUES(?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), lead.id, 'correo', `Correo enviado · ${subject}${template ? ` (${template})` : ''}`, nowIso, actor),
    env.DB.prepare(`INSERT INTO conversation_nurture_signals
      (id, lead_id, channel, intent, confidence, received_at, recorded_at, decision, reason, next_action, program, source_url, stage, lead_program, transactional, lead_revision, write_token)
      VALUES(?, ?, 'email', ?, 'alta', ?, ?, 'respuesta_programada', ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(signalId, lead.id, intent, nowIso, nowIso, reason, subject, lead.program || null, programObj?.url || null, lead.stage, lead.program || '', lead.revision, crypto.randomUUID()),
    env.DB.prepare(`INSERT INTO conversation_nurture_jobs(id, signal_id, lead_id, status, due_at, attempts, updated_at, provider_id)
      VALUES(?, ?, ?, 'accepted', ?, 1, ?, ?)`)
      .bind(jobId, signalId, lead.id, nowIso, nowIso, providerId),
    env.DB.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(nowIso, lead.id)
  ]);

  return crmJson({
    ok: true,
    providerId,
    job: {
      id: jobId,
      signal_id: signalId,
      lead_id: lead.id,
      status: 'accepted',
      due_at: nowIso,
      attempts: 1,
      updated_at: nowIso,
      provider_id: providerId,
      channel: 'email',
      intent,
      subject,
      reason
    }
  });
}

function buildFallbackAiDraft({ lead, program, context, retellData, goal, publicBase }) {
  const firstName = clean(lead.name, 80).replace(/^(?:Aspirante por teléfono|Aspirante por correo)$/i, '').trim();
  const greeting = firstName ? `Hola ${firstName},` : 'Estimado/a aspirante,';
  const base = (publicBase || 'https://slimetoad.github.io/Casagrande').replace(/\/+$/, '');
  const title = program?.title || context.programInterest || retellData.programInterest || 'Posgrados de Universidad Casa Grande';
  const tuition = program
    ? (Number.isFinite(program.price) && program.price > 0
      ? new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(program.price) + ' USD (inversión publicada)'
      : 'Consultar con Admisiones')
    : 'Consultar con Admisiones según el programa elegido';
  const summaryNote = retellData.summary || context.callSummary || context.consulta || '';
  const questionNote = retellData.keyQuestions || context.keyQuestions || '';
  const obstacleNote = retellData.obstacles || context.obstacles || '';
  const g = normalized(goal || '');

  let subject = program ? `Orientación sobre ${program.shortTitle || program.title} · Posgrados UCG` : 'Seguimiento de orientación · Posgrados UCG';
  let bodyFocus = '';
  let recommendedAction = 'Enviar correo de seguimiento y coordinar cita de orientación';

  if (/financ|inversion|costo|precio|beca/.test(g)) {
    subject = `Inversión y opciones sobre ${program?.shortTitle || 'Posgrados UCG'}`;
    bodyFocus = `Con respecto a la inversión del programa, el valor publicado es ${tuition}. Si desea revisar formas de pago o confirmar condiciones de la convocatoria vigente, con gusto le orientamos.`;
    recommendedAction = 'Confirmar opciones de pago y financiamiento vigente con el aspirante';
  } else if (/requisit|postul|document/.test(g)) {
    subject = `Requisitos y postulación · ${program?.shortTitle || 'Posgrados UCG'}`;
    bodyFocus = `Para avanzar con su postulación, puede revisar la ficha oficial y preparar su título de tercer nivel y documentación básica. Nuestro equipo puede verificar con usted cada paso de la convocatoria vigente.`;
    recommendedAction = 'Verificar documentación de postulación y requisitos de admisión';
  } else if (/cita|agenda/.test(g)) {
    subject = `Agendemos su asesoría · ${program?.shortTitle || 'Posgrados UCG'}`;
    bodyFocus = `Nos encantaría conversar con usted en una breve asesoría personalizada para resolver sus inquietudes sobre horarios, malla y admisión. Puede agendar directamente en ${base}/#cita.`;
    recommendedAction = 'Confirmar fecha y hora de entrevista de orientación';
  } else if (lead.stage === 'En postulación') {
    subject = `Acompañamiento en su postulación · ${program?.shortTitle || 'Posgrados UCG'}`;
    bodyFocus = 'Vemos que su proceso de postulación está en curso. Si tiene algún documento pendiente o requiere confirmar fechas de la cohorte, respóndanos por este medio para acompañarle.';
    recommendedAction = 'Revisar hitos pendientes de postulación';
  } else if (lead.stage === 'Admitido') {
    subject = `Próximos pasos para su matrícula · ${program?.shortTitle || 'Posgrados UCG'}`;
    bodyFocus = 'Felicitaciones por su avance en el proceso de admisión. Nuestro equipo está disponible para confirmar los pasos administrativos y fechas de matrícula.';
    recommendedAction = 'Guiar al aspirante admitido hacia la matrícula';
  } else {
    bodyFocus = program
      ? `Le compartimos los datos verificados de ${program.title}: modalidad ${program.mode || 'consultar con Admisiones'}, duración ${program.duration || 'consultar con Admisiones'}, estado de convocatoria "${program.admissionsStatus || 'Consultar convocatoria'}" e inversión ${tuition}.`
      : 'En Universidad Casa Grande contamos con 34 maestrías en áreas de Negocios, Tecnología, Comunicación, Derecho, Educación, Salud y Arquitectura.';
  }

  const contextNotes = [
    summaryNote ? `Tomamos nota de nuestra conversación previa: ${summaryNote}` : '',
    questionNote ? `Sobre sus consultas (${questionNote}), con todo gusto podemos profundizar cada punto.` : '',
    obstacleNote ? `Respecto a lo que nos comentó (${obstacleNote}), podemos revisar alternativas de horario o planificación junto con Admisiones.` : '',
    context.city || retellData.city ? `Registro de ciudad/horizonte: ${[context.city || retellData.city, context.horizon || retellData.horizon].filter(Boolean).join(' · ')}.` : ''
  ].filter(Boolean);

  const links = [
    program?.url ? `Ficha oficial UCG: ${program.url}` : `Catálogo oficial UCG: ${brand.catalogUrl}`,
    program?.brochure ? `Folleto oficial (PDF): ${program.brochure}` : '',
    `Agendar orientación: ${base}/#cita`
  ].filter(Boolean).join('\n');

  const body = [
    greeting,
    `Le saludamos cordialmente desde el equipo de Admisiones de Posgrados de la Universidad Casa Grande (Guayaquil, Ecuador). Gracias por su interés en ${title}.`,
    bodyFocus,
    contextNotes.join('\n'),
    links,
    `Quedamos atentos a su respuesta o si prefiere conversar directamente puede llamar al ${brand.admissionsPhone}.\n\nCordialmente,\nEquipo de Admisiones de Posgrados\nUniversidad Casa Grande`
  ].filter(Boolean).join('\n\n');

  return { subject, body, recommendedAction };
}

async function handleAiDraft(request, env, id) {
  const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
  if (!lead) return crmJson({ error: 'No encontramos ese expediente.' }, 404);
  const body = (await readJsonBody(request)) || {};
  const goal = clean(body.template || body.goal, 80);
  const instructions = clean(body.instructions, 300);

  const [convRes, eventsRes] = await env.DB.batch([
    env.DB.prepare('SELECT excerpt, extraction, occurred_at FROM admissions_conversations WHERE lead_id = ? ORDER BY occurred_at DESC LIMIT 3').bind(id),
    env.DB.prepare('SELECT type, description, created_at, actor FROM events WHERE lead_id = ? ORDER BY created_at DESC LIMIT 8').bind(id)
  ]);

  const context = safeJson(lead.context, {});
  const latestConv = convRes.results?.[0];
  const latestExtraction = safeJson(latestConv?.extraction, {});
  const retellData = safeJson(latestExtraction.retellData, {});
  const program = programs.find(p => p.slug === lead.program) || null;
  const publicBase = typeof env.PUBLIC_BASE_URL === 'string' && env.PUBLIC_BASE_URL.trim()
    ? env.PUBLIC_BASE_URL.trim().replace(/\/+$/, '')
    : 'https://slimetoad.github.io/Casagrande';

  const fallback = buildFallbackAiDraft({ lead, program, context, retellData, goal, publicBase });

  if (!env.ANTHROPIC_API_KEY) {
    return crmJson({ ok: true, source: 'template', ...fallback });
  }

  try {
    const firstName = clean(lead.name, 80).replace(/^(?:Aspirante por teléfono|Aspirante por correo)$/i, '').trim() || 'Aspirante';
    const promptData = {
      aspirante: {
        nombre: firstName,
        etapa: lead.stage,
        ciudad: context.city || retellData.city || null,
        modalidadPreferida: context.modality || retellData.modality || null,
        horizonteInicio: context.horizon || retellData.horizon || null,
        formacion: context.academicBackground || retellData.academicBackground || null,
        preguntas: context.keyQuestions || retellData.keyQuestions || null,
        obstaculos: context.obstacles || retellData.obstacles || null,
        resumenLlamada: context.callSummary || retellData.summary || latestConv?.excerpt || null,
        notaEquipo: lead.note || null
      },
      eventosRecientes: (eventsRes.results || []).slice(0, 5).map(e => `${e.type}: ${e.description}`),
      objetivoPlantilla: goal || 'seguimiento personalizado',
      instruccionAsesor: instructions || null,
      programaCatalogo: program ? programFact(program) : {
        ofertaGeneral: '34 maestrías en Negocios, Tecnología, Comunicación, Derecho, Educación, Salud y Arquitectura',
        fuente: brand.catalogUrl
      },
      enlaces: {
        portalCita: publicBase + '/#cita',
        telefonoAdmisiones: brand.admissionsPhone
      }
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 900,
        system: 'Eres Oficial de Admisiones de Posgrados de la Universidad Casa Grande (Guayaquil, Ecuador). Redacta en español ecuatoriano cálido, profesional y respetuoso usando "usted". Usa ÚNICAMENTE los datos verificados de programaCatalogo y aspirante: NUNCA inventes precios, becas ni fechas de inicio (si inversion es null, indica "consultar con Admisiones"). Responde EXCLUSIVAMENTE con un objeto JSON válido con las claves exactas: "subject" (string), "body" (string), "recommendedAction" (string).',
        messages: [{ role: 'user', content: JSON.stringify(promptData) }]
      }),
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
      return crmJson({ ok: true, source: 'template', ...fallback });
    }
    const aiRes = await res.json();
    const rawText = (aiRes?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    const cleanedJson = rawText.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleanedJson);
    const subject = clean(parsed?.subject, 200);
    const bodyText = cleanEmailBody(parsed?.body, 8000);
    const recommendedAction = clean(parsed?.recommendedAction, 200);
    if (!subject || !bodyText || !recommendedAction) {
      return crmJson({ ok: true, source: 'template', ...fallback });
    }
    return crmJson({ ok: true, source: 'anthropic', subject, body: bodyText, recommendedAction });
  } catch {
    return crmJson({ ok: true, source: 'template', ...fallback });
  }
}

async function handleDeleteCrmLead(env, id) {
  const existing = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first();
  if (!existing) return crmJson({ error: 'No encontramos ese expediente.' }, 404);

  const tablesRes = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const existingTables = new Set((tablesRes.results || []).map(r => r.name));
  const dependentTables = [
    'tasks',
    'events',
    'jobs',
    'whatsapp_jobs',
    'whatsapp_consents',
    'lead_submissions',
    'admissions_replies',
    'admissions_reply_routes',
    'admissions_phone_identities',
    'admissions_appointments',
    'conversation_nurture_jobs',
    'conversation_nurture_signals',
    'admissions_conversations',
    'admissions_cases',
    'admissions_stage_evidence'
  ];

  const batch = [];
  for (const table of dependentTables) {
    if (existingTables.has(table)) {
      batch.push(env.DB.prepare(`DELETE FROM ${table} WHERE lead_id = ?`).bind(id));
    }
  }
  batch.push(env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id));
  await env.DB.batch(batch);
  return crmJson({ ok: true, deleted: id });
}

async function routePublicCrm(request, env, path) {
  if (!env.DB) return crmJson({ error: 'Base de datos no disponible.' }, 503);

  if (path === '/api/public/crm') {
    if (['GET', 'HEAD'].includes(request.method)) {
      const res = await handlePublicCrm(env);
      return request.method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res;
    }
    return crmJson({ error: 'Método no permitido.' }, 405);
  }

  let match;
  if ((match = path.match(/^\/api\/public\/crm\/leads\/([\w.-]{1,120})$/))) {
    if (request.method === 'PATCH') return handlePatchCrmLead(request, env, match[1]);
    if (request.method === 'DELETE') return handleDeleteCrmLead(env, match[1]);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if ((match = path.match(/^\/api\/public\/crm\/leads\/([\w.-]{1,120})\/notes$/))) {
    if (request.method === 'POST') return handleCreateCrmNote(request, env, match[1]);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if ((match = path.match(/^\/api\/public\/crm\/leads\/([\w.-]{1,120})\/tasks$/))) {
    if (request.method === 'POST') return handleCreateCrmTask(request, env, match[1]);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if ((match = path.match(/^\/api\/public\/crm\/tasks\/([\w.-]{1,120})$/))) {
    if (request.method === 'PATCH') return handlePatchCrmTask(request, env, match[1]);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if ((match = path.match(/^\/api\/public\/crm\/leads\/([\w.-]{1,120})\/nurture-email$/))) {
    if (request.method === 'POST') return handleSendNurtureEmail(request, env, match[1]);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if ((match = path.match(/^\/api\/public\/crm\/leads\/([\w.-]{1,120})\/ai-draft$/))) {
    if (request.method === 'POST') return handleAiDraft(request, env, match[1]);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  return crmJson({ error: 'Ruta de CRM no encontrada.' }, 404);
}

const SEO_PERIODS = new Set([7, 30, 90]);
const DEFAULT_SEO_QUESTION = '¿Qué hallazgos merecen atención y qué páginas conviene investigar primero?';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PORTAL_DEFAULT_URL = 'https://slimetoad.github.io/Casagrande';

function publicGuideUrl(requestUrl, slug) {
  return `${requestUrl.origin}/guias/${encodeURIComponent(slug)}`;
}

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function safeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function trimMetaDesc(value, max = 160) {
  const plain = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

function headingSlug(value, index, used) {
  const base = normalized(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || `seccion-${index + 1}`;
  let candidate = `sec-${base}`;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `sec-${base}-${suffix++}`;
  }
  used.add(candidate);
  return candidate;
}

function renderInlineMarkdown(text) {
  return escHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdownAndToc(rawBody) {
  const lines = String(rawBody ?? '').replace(/\r\n/g, '\n').split('\n');
  const toc = [];
  const usedIds = new Set();
  const html = [];
  let listType = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    if (paragraph.length >= 2 && !/^#{1,6}\s/.test(paragraph[0]) && paragraph[0].length <= 95 && !/[.!?]$/.test(paragraph[0].trim())) {
      const headingText = paragraph[0].trim();
      const id = headingSlug(headingText, toc.length, usedIds);
      toc.push({ id, text: headingText });
      html.push(`<h2 id="${escHtml(id)}">${renderInlineMarkdown(headingText)}</h2>`);
      const rest = paragraph.slice(1).join(' ').trim();
      if (rest) html.push(`<p>${renderInlineMarkdown(rest)}</p>`);
    } else {
      html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    }
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    html.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flushParagraph();
      closeList();
      const text = h2[1].trim();
      const id = headingSlug(text, toc.length, usedIds);
      toc.push({ id, text });
      html.push(`<h2 id="${escHtml(id)}">${renderInlineMarkdown(text)}</h2>`);
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      flushParagraph();
      closeList();
      html.push(`<h3>${renderInlineMarkdown(h3[1].trim())}</h3>`);
      continue;
    }
    const ul = line.match(/^[-*•]\s+(.+)$/);
    if (ul) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${renderInlineMarkdown(ul[1].trim())}</li>`);
      continue;
    }
    const ol = line.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${renderInlineMarkdown(ol[1].trim())}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  flushParagraph();
  closeList();
  return { html: html.join('\n'), toc };
}

function buildSeoChecklist(article, program) {
  const title = String(article?.title || '');
  const summary = String(article?.summary || '');
  const body = String(article?.body || '');
  const plainBody = body.replace(/^#{1,6}\s+/gm, '').replace(/[*_`]/g, ' ');
  const wordCount = plainBody.trim() ? plainBody.trim().split(/\s+/).length : 0;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));
  const { toc } = renderMarkdownAndToc(body);
  const subHeadings = (body.match(/^###\s+/gm) || []).length;
  const headingsCount = toc.length + subHeadings;
  const keyword = String(article?.sourceQuery || article?.source_query || program?.shortTitle || '').trim();
  const fullText = normalized(`${title} ${summary} ${body}`);
  const normKw = normalized(keyword);
  const kwTokens = normKw.split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const hasKeyword = Boolean(
    normKw && (fullText.includes(normKw) || (kwTokens.length > 0 && kwTokens.every(w => fullText.includes(w))))
  );
  return {
    titleLength: title.length,
    summaryLength: summary.length,
    wordCount,
    readingMinutes,
    headingsCount,
    hasKeyword,
    indexable: article?.status === 'published',
    hasCanonical: true,
    hasStructuredData: true,
    hasOpenGraph: true
  };
}

async function handleAdminSeoGet(env, url) {
  const daysRaw = url.searchParams.get('days');
  const days = daysRaw === null ? 30 : Number(daysRaw);
  if (!SEO_PERIODS.has(days)) {
    return crmJson({ error: 'Elige un período válido de 7, 30 o 90 días.' }, 400);
  }
  const evidence = await loadSeoEvidence(env, programs, days, { team: true });
  const programRows = evidence.rows.filter(r => r.kind === 'programa');
  const guideRows = evidence.rows.filter(r => r.kind === 'guia');
  const cpcValues = programRows.map(r => r.metrics?.cpc).filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const avgCpcUsd = cpcValues.length
    ? Math.round((cpcValues.reduce((a, b) => a + b, 0) / cpcValues.length) * 100) / 100
    : 0;
  const totalMonthlyVolume = programRows.reduce((sum, r) => sum + (Number.isFinite(r.metrics?.searchVolume) ? r.metrics.searchVolume : 0), 0);
  const programsWithVolume = programRows.filter(r => (r.metrics?.searchVolume ?? 0) > 0).length;

  return crmJson({
    ok: true,
    days,
    start: evidence.start,
    end: evidence.end,
    rows: evidence.rows,
    marketResearch: marketSnapshot,
    summary: {
      totalPages: evidence.rows.length,
      programsWithVolume,
      totalMonthlyVolume,
      avgCpcUsd,
      publishedGuides: guideRows.length
    }
  });
}

async function handleAdminSeoAnalyze(request, env) {
  const body = await readJsonBody(request);
  if (!body) return crmJson({ error: 'Envía una selección válida en formato JSON.' }, 400);
  const days = body.days === undefined ? 30 : Number(body.days);
  if (!SEO_PERIODS.has(days)) return crmJson({ error: 'Elige un período válido de 7, 30 o 90 días.' }, 400);
  const ids = body.ids === undefined ? [] : body.ids;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id.length || id.length > 225)) {
    return crmJson({ error: 'Selecciona hasta 100 páginas para analizar.' }, 400);
  }
  if (body.question !== undefined && body.question !== null && (typeof body.question !== 'string' || body.question.length > 600)) {
    return crmJson({ error: 'Escribe una pregunta de hasta 600 caracteres.' }, 400);
  }
  const question = typeof body.question === 'string' && body.question.trim() ? body.question.trim() : DEFAULT_SEO_QUESTION;
  const evidence = await loadSeoEvidence(env, programs, days, { team: true });
  const selectedIds = new Set(ids);
  const rows = selectedIds.size ? evidence.rows.filter(row => selectedIds.has(row.id)) : evidence.rows;
  if (selectedIds.size && !rows.length) {
    return crmJson({ error: 'Las páginas seleccionadas no coinciden con el tablero actual.' }, 422);
  }
  const insights = await buildSeoInsights(env, { days, start: evidence.start, end: evidence.end, rows }, question);
  return crmJson({ ok: true, days, start: evidence.start, end: evidence.end, ...insights });
}

async function ensureEditorialSeeded(env) {
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM seo_editorial_plan').first();
  const force = !countRow || countRow.n === 0;
  await ensurePlan(env.DB, programs, new Date(), 'Admin', force);
}

async function handleAdminContentGet(env, requestUrl) {
  await ensureEditorialSeeded(env);
  const [editorial, articlesRes, planRes] = await Promise.all([
    publicEditorial(env, programs),
    env.DB.prepare(`SELECT id, slug, opportunity_id, program, title, summary, body,
      source_query AS sourceQuery, source_url AS sourceUrl, status,
      created_at AS createdAt, updated_at AS updatedAt, published_at AS publishedAt, editor
      FROM seo_articles ORDER BY updated_at DESC, slug ASC`).all(),
    env.DB.prepare(`SELECT id, program, kind, signal_key, title, cluster, intent, search_question, priority, reason,
      evidence, source_url, source_verified_at, scheduled_at, status,
      draft_title, draft_summary, draft_body, content_revision, published_revision, updated_at
      FROM seo_editorial_plan ORDER BY priority DESC, id ASC`).all()
  ]);

  const programMap = new Map(programs.map(p => [p.slug, p]));
  const articles = (articlesRes.results || []).map(a => {
    const prog = programMap.get(a.program) || null;
    const publishedUrl = a.status === 'published' ? publicGuideUrl(requestUrl, a.slug) : null;
    const seoChecklist = buildSeoChecklist(a, prog);
    return { ...a, publishedUrl, seoChecklist };
  });
  const planRows = planRes.results || [];
  const articleByOpp = new Map(articles.map(a => [a.opportunity_id, a]));
  const articleByProgram = new Map();
  for (const a of articles) {
    if (!articleByProgram.has(a.program)) articleByProgram.set(a.program, a);
  }
  const marketByProgram = new Map(marketSnapshot.map(m => [m.program, m]));

  const plan = planRows.map(row => {
    const prog = programMap.get(row.program);
    const market = marketByProgram.get(row.program);
    const ev = safeJson(row.evidence, {});
    const article = articleByOpp.get('editorial:' + row.id) || articleByProgram.get(row.program) || null;
    const effectiveStatus = article?.status || row.status || 'planned';
    const articleSlug = article?.slug || (prog ? 'guia-' + prog.slug : row.id);
    const publishedUrl = effectiveStatus === 'published' && articleSlug ? publicGuideUrl(requestUrl, articleSlug) : null;
    return {
      id: row.id,
      program: row.program,
      programTitle: prog?.title || row.program,
      shortTitle: prog?.shortTitle || prog?.title || row.program,
      area: prog?.area || row.cluster,
      kind: row.kind,
      cluster: row.cluster,
      intent: row.intent,
      priority: row.priority,
      reason: row.reason,
      searchQuestion: row.search_question,
      keyword: market?.keyword || ev.search?.keyword || row.search_question,
      volume: market?.volume ?? ev.search?.volume ?? null,
      cpc: market?.cpc ?? null,
      difficulty: market?.difficulty ?? ev.search?.difficulty ?? null,
      status: effectiveStatus,
      scheduledAt: row.scheduled_at,
      sourceUrl: row.source_url || prog?.url || brand.catalogUrl,
      articleId: article?.id || null,
      articleSlug,
      publishedUrl,
      seoChecklist: article?.seoChecklist || null,
      title: article?.title || row.draft_title || row.title,
      summary: article?.summary || row.draft_summary || '',
      body: article?.body || row.draft_body || '',
      publishedAt: article?.publishedAt || null,
      updatedAt: article?.updatedAt || row.updated_at || null
    };
  });

  const publishedPrograms = new Set(articles.filter(a => a.status === 'published').map(a => a.program));
  const draftPrograms = new Set([
    ...articles.filter(a => a.status === 'draft').map(a => a.program),
    ...plan.filter(p => p.status === 'draft').map(p => p.program)
  ]);
  const coveredPrograms = new Set([...publishedPrograms, ...draftPrograms]);
  const coveredVolume = [...coveredPrograms].reduce((sum, slug) => sum + (marketByProgram.get(slug)?.volume || 0), 0);

  return crmJson({
    ok: true,
    week: editorial.week,
    plan,
    articles,
    marketResearch: marketSnapshot,
    stats: {
      plannedPrograms: plan.length,
      publishedGuides: publishedPrograms.size,
      draftGuides: draftPrograms.size,
      coveredVolume
    }
  });
}

async function handleAdminContentDraft(request, env) {
  const body = await readJsonBody(request);
  if (!body) return crmJson({ error: 'Envía un objeto JSON válido.' }, 400);
  const programSlug = clean(body.programSlug, 160);
  const program = programs.find(p => p.slug === programSlug);
  if (!program) return crmJson({ error: 'Selecciona una maestría válida del catálogo.' }, 422);

  await ensureEditorialSeeded(env);
  const planId = 'guia-' + programSlug;
  let planRow = await env.DB.prepare('SELECT * FROM seo_editorial_plan WHERE id = ?').bind(planId).first();
  if (!planRow) {
    await ensurePlan(env.DB, programs, new Date(), 'Admin', true);
    planRow = await env.DB.prepare('SELECT * FROM seo_editorial_plan WHERE id = ?').bind(planId).first();
  }

  const market = marketSnapshot.find(m => m.program === programSlug) || null;
  const keyword = clean(body.keyword, 200) || market?.keyword || planRow?.search_question || program.title;
  const customAngle = cleanEmailBody(body.customAngle, 400);
  const proposal = editorialProposal(program, market ? {
    keyword: market.keyword,
    source: market.source,
    volume: market.volume,
    observedAt: market.observedAt,
    shareable: true
  } : null);

  const planForDraft = {
    ...(planRow || {}),
    id: planRow?.id || planId,
    program: programSlug,
    kind: planRow?.kind || 'catalogo',
    intent: planRow?.intent || proposal.intent,
    title: planRow?.title || proposal.title,
    search_question: keyword,
    source_url: proposal.sourceUrl || institutionalUrl(program.url),
    source_verified_at: proposal.sourceVerifiedAt
  };
  const evidenceObj = planRow ? safeJson(planRow.evidence, {}) : {};
  const shell = draftEditorialArticle(planForDraft, program, {
    ...evidenceObj,
    search: evidenceObj.search || (market ? {
      keyword: market.keyword,
      source: market.source,
      volume: market.volume,
      observedAt: market.observedAt,
      shareable: true
    } : null)
  });

  const fallbackTitle = clean(shell?.title || proposal.title, 180);
  const fallbackSummary = cleanEmailBody(shell?.summary || proposal.angle, 400);
  const fallbackBody = cleanEmailBody(
    shell
      ? [shell.intro, ...shell.blocks, shell.closing, shell.reference].filter(Boolean).join('\n\n')
      : `${proposal.angle}\n\n${program.summary}\n\nModalidad: ${program.mode || 'Confirmar con Admisiones'}. Duración: ${program.duration || 'Confirmar con Admisiones'}.\n\nFuente oficial: ${program.url}`,
    12000
  );

  let title = fallbackTitle;
  let summary = fallbackSummary;
  let articleBody = fallbackBody;
  let source = 'template';

  if (env.ANTHROPIC_API_KEY) {
    try {
      const promptInput = {
        programa: programFact(program),
        palabraClaveObjetivo: keyword,
        volumenMensualEcuador: market?.volume ?? null,
        enfoquePersonalizado: customAngle || null,
        borradorBase: { title: fallbackTitle, summary: fallbackSummary, body: fallbackBody }
      };
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
          max_tokens: 1400,
          system: 'Eres editor académico de Posgrados de la Universidad Casa Grande (Guayaquil, Ecuador). Redacta una guía SEO útil y clara en español ecuatoriano (usted) para aspirantes de posgrado. Usa EXCLUSIVAMENTE los hechos verificados de programa y borradorBase: NUNCA inventes aranceles, becas, fechas de cohorte ni requisitos no publicados. Responde EXCLUSIVAMENTE con JSON válido con las claves exactas: "title" (máximo 160 caracteres), "summary" (máximo 340 caracteres) y "body" (entre 250 y 700 palabras en texto plano con párrafos separados por doble salto de línea).',
          messages: [{ role: 'user', content: JSON.stringify(promptInput) }]
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (aiRes.ok) {
        const data = await aiRes.json();
        const rawText = (data?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
        const parsed = JSON.parse(rawText.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim());
        const aiTitle = clean(parsed?.title, 180);
        const aiSummary = cleanEmailBody(parsed?.summary, 400);
        const aiBody = cleanEmailBody(parsed?.body, 12000);
        if (aiTitle.length >= 8 && aiSummary.length >= 20 && aiBody.length >= 120) {
          title = aiTitle;
          summary = aiSummary;
          articleBody = aiBody;
          source = 'anthropic';
        }
      }
    } catch {
      // Fall back cleanly to the deterministic catalog-grounded editorial draft.
    }
  }

  const nowIso = new Date().toISOString();
  const oppId = 'editorial:' + planId;
  const existingArticle = await env.DB.prepare('SELECT * FROM seo_articles WHERE opportunity_id = ?').bind(oppId).first();
  let slug = existingArticle?.slug || planId;
  if (!existingArticle) {
    const slugConflict = await env.DB.prepare('SELECT id FROM seo_articles WHERE slug = ?').bind(slug).first();
    if (slugConflict) slug = `${planId}-${crypto.randomUUID().slice(0, 6)}`;
  }
  const articleId = existingArticle?.id || crypto.randomUUID();
  const nextStatus = existingArticle?.status === 'published' ? 'published' : 'draft';
  const sourceUrl = planRow?.source_url || program.url || brand.catalogUrl;

  const batch = [
    env.DB.prepare(`INSERT INTO seo_articles
      (id, slug, opportunity_id, program, title, summary, body, source_query, source_url, status, created_at, updated_at, published_at, editor)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin Content Engine')
      ON CONFLICT(opportunity_id) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        body = excluded.body,
        source_query = excluded.source_query,
        source_url = excluded.source_url,
        updated_at = excluded.updated_at,
        editor = excluded.editor`)
      .bind(articleId, slug, oppId, programSlug, title, summary, articleBody, keyword, sourceUrl, nextStatus, nowIso, nowIso, existingArticle?.published_at || null)
  ];
  if (planRow) {
    batch.push(
      env.DB.prepare(`UPDATE seo_editorial_plan SET
        draft_title = ?, draft_summary = ?, draft_body = ?,
        status = CASE WHEN status = 'planned' THEN 'draft' ELSE status END,
        content_revision = content_revision + 1,
        updated_at = ?,
        revision = revision + 1
        WHERE id = ?`).bind(title, summary, articleBody, nowIso, planId)
    );
  }
  batch.push(
    env.DB.prepare(`SELECT id, slug, opportunity_id, program, title, summary, body,
      source_query AS sourceQuery, source_url AS sourceUrl, status,
      created_at AS createdAt, updated_at AS updatedAt, published_at AS publishedAt, editor
      FROM seo_articles WHERE opportunity_id = ?`).bind(oppId)
  );
  const results = await env.DB.batch(batch);
  const savedArticle = results.at(-1)?.results?.[0];
  return crmJson({ ok: true, source, article: savedArticle });
}

async function handleAdminContentPublish(request, env, requestUrl) {
  const body = await readJsonBody(request);
  if (!body) return crmJson({ error: 'Envía un objeto JSON válido.' }, 400);
  const programSlug = clean(body.programSlug, 160);
  const program = programs.find(p => p.slug === programSlug);
  if (!program) return crmJson({ error: 'Selecciona una maestría válida del catálogo.' }, 422);
  const status = body.status === undefined ? 'published' : body.status;
  if (!['draft', 'published'].includes(status)) return crmJson({ error: 'El estado debe ser draft o published.' }, 422);

  const title = clean(body.title, 180);
  const summary = cleanEmailBody(body.summary, 400);
  const articleBody = cleanEmailBody(body.body, 12000);
  if (title.length < 5 || summary.length < 10 || articleBody.length < 40) {
    return crmJson({ error: 'Completa el título, resumen y contenido antes de guardar o publicar.' }, 422);
  }

  const rawSlug = clean(body.slug, 120).toLowerCase();
  const targetSlug = rawSlug || ('guia-' + programSlug);
  if (!SLUG_RE.test(targetSlug)) {
    return crmJson({ error: 'El slug debe contener solo letras minúsculas, números y guiones.' }, 422);
  }

  await ensureEditorialSeeded(env);
  const planId = 'guia-' + programSlug;
  const oppId = 'editorial:' + planId;
  const planRow = await env.DB.prepare('SELECT * FROM seo_editorial_plan WHERE id = ?').bind(planId).first();
  const requestedId = clean(body.id, 160);
  const existingById = requestedId ? await env.DB.prepare('SELECT * FROM seo_articles WHERE id = ?').bind(requestedId).first() : null;
  const existingByOpp = existingById || await env.DB.prepare('SELECT * FROM seo_articles WHERE opportunity_id = ?').bind(oppId).first();
  const slugOwner = await env.DB.prepare('SELECT id, opportunity_id FROM seo_articles WHERE slug = ?').bind(targetSlug).first();
  if (slugOwner && slugOwner.id !== existingByOpp?.id) {
    return crmJson({ error: 'Ese slug ya está en uso por otra guía.' }, 409);
  }

  const nowIso = new Date().toISOString();
  const articleId = existingByOpp?.id || crypto.randomUUID();
  const effectiveOpp = existingByOpp?.opportunity_id || oppId;
  const market = marketSnapshot.find(m => m.program === programSlug);
  const sourceQuery = existingByOpp?.source_query || market?.keyword || planRow?.search_question || program.title;
  const sourceUrl = existingByOpp?.source_url || planRow?.source_url || program.url || brand.catalogUrl;
  const publishedAt = status === 'published' ? (existingByOpp?.published_at || nowIso) : null;

  const batch = [
    env.DB.prepare(`INSERT INTO seo_articles
      (id, slug, opportunity_id, program, title, summary, body, source_query, source_url, status, created_at, updated_at, published_at, editor)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin Content Engine')
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        summary = excluded.summary,
        body = excluded.body,
        status = excluded.status,
        updated_at = excluded.updated_at,
        published_at = excluded.published_at,
        editor = excluded.editor`)
      .bind(articleId, targetSlug, effectiveOpp, programSlug, title, summary, articleBody, sourceQuery, sourceUrl, status, existingByOpp?.created_at || nowIso, nowIso, publishedAt)
  ];
  if (planRow) {
    batch.push(
      env.DB.prepare(`UPDATE seo_editorial_plan SET
        status = ?,
        draft_title = ?,
        draft_summary = ?,
        draft_body = ?,
        content_revision = content_revision + 1,
        published_revision = CASE WHEN ? = 'published' THEN content_revision + 1 ELSE published_revision END,
        updated_at = ?,
        revision = revision + 1
        WHERE id = ?`).bind(status, title, summary, articleBody, status, nowIso, planId)
    );
  }
  batch.push(
    env.DB.prepare(`SELECT id, slug, opportunity_id, program, title, summary, body,
      source_query AS sourceQuery, source_url AS sourceUrl, status,
      created_at AS createdAt, updated_at AS updatedAt, published_at AS publishedAt, editor
      FROM seo_articles WHERE id = ?`).bind(articleId)
  );
  const results = await env.DB.batch(batch);
  const saved = results.at(-1)?.results?.[0];
  const publishedUrl = saved?.status === 'published' ? publicGuideUrl(requestUrl, saved.slug) : null;
  const seoChecklist = buildSeoChecklist(saved, program);
  return crmJson({
    ok: true,
    publishedUrl,
    seoChecklist,
    article: { ...saved, publishedUrl, seoChecklist }
  });
}

async function routePublicAdmin(request, env, url, path) {
  if (!env.DB) return crmJson({ error: 'Base de datos no disponible.' }, 503);
  if (path === '/api/public/admin/seo') {
    if (['GET', 'HEAD'].includes(request.method)) {
      const res = await handleAdminSeoGet(env, url);
      return request.method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res;
    }
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if (path === '/api/public/admin/seo/analyze') {
    if (request.method === 'POST') return handleAdminSeoAnalyze(request, env);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if (path === '/api/public/admin/content') {
    if (['GET', 'HEAD'].includes(request.method)) {
      const res = await handleAdminContentGet(env, url);
      return request.method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res;
    }
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if (path === '/api/public/admin/content/draft') {
    if (request.method === 'POST') return handleAdminContentDraft(request, env);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  if (path === '/api/public/admin/content/publish') {
    if (request.method === 'POST') return handleAdminContentPublish(request, env, url);
    return crmJson({ error: 'Método no permitido.' }, 405);
  }
  return crmJson({ error: 'Ruta de Admin no encontrada.' }, 404);
}

function portalBaseFromEnv(env) {
  const raw = typeof env?.PUBLIC_BASE_URL === 'string' ? env.PUBLIC_BASE_URL.trim().replace(/\/+$/, '') : '';
  return raw || PORTAL_DEFAULT_URL;
}

function formatDisplayPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw || '+1 (912) 491-5544';
}

function formatEcDate(iso) {
  const ts = Date.parse(iso || '');
  if (!Number.isFinite(ts)) return '';
  try {
    return new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeZone: 'America/Guayaquil' }).format(new Date(ts));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function seoPageShell({ title, headTags, headerHtml, mainHtml, footerHtml }) {
  return `<!doctype html>
<html lang="es-EC">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
${headTags}
<style>
  :root{--bg:#f7f8fa;--surface:#ffffff;--ink:#141920;--muted:#4d5866;--border:#e2e6ec;--accent:#ff8300;--accent-dark:#d96e00;--slate:#141920}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.68}
  a{color:var(--accent-dark);text-decoration-thickness:1px;text-underline-offset:3px}
  a:hover{color:var(--accent)}
  .topbar{background:var(--slate);color:#fff;border-bottom:3px solid var(--accent)}
  .wrap{max-width:70rem;margin:0 auto;padding:0 1.25rem}
  .topbar-inner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;padding:.9rem 0}
  .brand{display:flex;align-items:center;gap:.75rem;color:#fff;text-decoration:none;font-weight:700;letter-spacing:-.01em}
  .brand img{height:34px;width:auto}
  .nav-links{display:flex;flex-wrap:wrap;align-items:center;gap:1rem;font-size:.94rem}
  .nav-links a{color:#e6ebf2;text-decoration:none;font-weight:500}
  .nav-links a:hover{color:var(--accent)}
  .phone-pill{background:rgba(255,131,0,.16);border:1px solid rgba(255,131,0,.45);color:#ffd2a1 !important;padding:.38rem .78rem;border-radius:999px;font-weight:600 !important;white-space:nowrap}
  .breadcrumbs{padding:1.1rem 0 .2rem;font-size:.9rem;color:var(--muted)}
  .breadcrumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:.45rem;margin:0;padding:0}
  .breadcrumbs li+li::before{content:"/";margin-right:.45rem;color:#9aa5b4}
  .layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:2rem;padding:1.25rem 0 3.5rem;align-items:start}
  @media(max-width:920px){.layout{grid-template-columns:1fr}}
  .article-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:2rem;box-shadow:0 8px 28px rgba(20,25,32,.04)}
  @media(max-width:600px){.article-card{padding:1.25rem}}
  .kicker{display:inline-block;background:#fff4e8;color:#9e4f00;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:.28rem .65rem;border-radius:999px;margin-bottom:.75rem}
  h1{font-size:clamp(1.75rem,3.3vw,2.5rem);line-height:1.16;letter-spacing:-.025em;margin:.25rem 0 .9rem}
  .lead{font-size:1.12rem;color:#2f3a47;margin:0 0 1.15rem}
  .meta-bar{display:flex;flex-wrap:wrap;gap:.85rem 1.25rem;font-size:.88rem;color:var(--muted);padding-bottom:1.15rem;border-bottom:1px solid var(--border);margin-bottom:1.4rem}
  .hero-media{margin:0 0 1.6rem;border-radius:12px;overflow:hidden;border:1px solid var(--border);background:#eef1f5;aspect-ratio:16/9}
  .hero-media img{width:100%;height:100%;object-fit:cover;object-position:50% 15%;display:block}
  .toc{background:#f9fafb;border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.75rem}
  .toc-title{font-size:.88rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink);margin:0 0 .5rem}
  .toc ul{margin:0;padding-left:1.15rem}
  .toc li{margin:.28rem 0;font-size:.95rem}
  .prose h2{font-size:1.42rem;line-height:1.25;margin:1.9rem 0 .7rem;color:var(--ink);scroll-margin-top:1.5rem}
  .prose h3{font-size:1.14rem;margin:1.35rem 0 .5rem;color:var(--ink)}
  .prose p{margin:0 0 1rem;color:#26303c}
  .prose ul,.prose ol{margin:0 0 1.15rem;padding-left:1.35rem;color:#26303c}
  .prose li{margin:.35rem 0}
  .sidebar{display:grid;gap:1.25rem;position:sticky;top:1.25rem}
  .side-box{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1.35rem;box-shadow:0 6px 20px rgba(20,25,32,.04)}
  .side-box h2{font-size:1.05rem;margin:0 0 .85rem}
  .facts{margin:0;display:grid;gap:.65rem}
  .facts div{border-bottom:1px dashed var(--border);padding-bottom:.55rem}
  .facts dt{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600}
  .facts dd{margin:.12rem 0 0;font-size:.95rem;font-weight:600;color:var(--ink)}
  .cta-box{background:linear-gradient(135deg,#141920 0%,#1f2937 100%);color:#fff;border-radius:14px;padding:1.45rem;border-top:4px solid var(--accent)}
  .cta-box h2{margin:0 0 .5rem;font-size:1.12rem;color:#fff}
  .cta-box p{margin:0 0 1rem;font-size:.92rem;color:#d6dde6}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;width:100%;padding:.72rem 1rem;border-radius:10px;font-weight:700;text-decoration:none;font-size:.95rem;margin-bottom:.55rem;box-sizing:border-box}
  .btn-primary{background:var(--accent);color:#141920 !important}
  .btn-primary:hover{background:#ff9729}
  .btn-ghost{background:rgba(255,255,255,.1);color:#fff !important;border:1px solid rgba(255,255,255,.22)}
  .related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.1rem;margin-top:1rem}
  .guide-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1.25rem;display:flex;flex-direction:column;justify-content:space-between;gap:.65rem}
  .guide-card h3{font-size:1.05rem;margin:0;line-height:1.3}
  .guide-card p{font-size:.9rem;color:var(--muted);margin:0}
  .footer{background:#fff;border-top:1px solid var(--border);padding:1.75rem 0;color:var(--muted);font-size:.88rem}
  .footer-inner{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem}
</style>
</head>
<body>
${headerHtml}
<main class="wrap">
${mainHtml}
</main>
${footerHtml}
</body>
</html>`;
}

function renderSeoChrome(env, requestUrl) {
  const portalBase = portalBaseFromEnv(env);
  const rawPhone = voicePhoneFromEnv(env);
  const displayPhone = formatDisplayPhone(rawPhone);
  const headerHtml = `<header class="topbar"><div class="wrap topbar-inner">
    <a class="brand" href="${escHtml(portalBase + '/')}">
      <img src="${escHtml(requestUrl.origin)}/media/ucg-logo-light.png" alt="Universidad Casa Grande">
      <span>Posgrados · Guías de Admisión</span>
    </a>
    <nav class="nav-links" aria-label="Navegación principal">
      <a href="${escHtml(portalBase + '/')}">Portal de Maestrías</a>
      <a href="${escHtml(requestUrl.origin)}/guias">Todas las guías</a>
      <a class="phone-pill" href="tel:${escHtml(rawPhone)}">Oficial IA: ${escHtml(displayPhone)}</a>
    </nav>
  </div></header>`;
  const footerHtml = `<footer class="footer"><div class="wrap footer-inner">
    <div><strong>Universidad Casa Grande · Posgrados</strong> · Guayaquil, Ecuador · Admisiones ${escHtml(brand.admissionsPhone)}</div>
    <div><a href="${escHtml(portalBase + '/')}">Explorar 34 maestrías</a> · <a href="${escHtml(requestUrl.origin)}/guias">Índice de guías</a></div>
  </div></footer>`;
  return { portalBase, rawPhone, displayPhone, headerHtml, footerHtml };
}

function voicePhoneFromEnv(env) {
  return env.RETELL_INBOUND_NUMBER || '+19124915544';
}

function notFoundGuideResponse(env, requestUrl) {
  const { portalBase, headerHtml, footerHtml } = renderSeoChrome(env, requestUrl);
  const html = seoPageShell({
    title: 'Guía no disponible | Posgrados Universidad Casa Grande',
    headTags: '<meta name="robots" content="noindex, nofollow">',
    headerHtml,
    mainHtml: `<section style="padding:3rem 0"><div class="article-card" style="max-width:44rem;margin:0 auto">
      <span class="kicker">Contenido no disponible</span>
      <h1>No encontramos esa guía publicada</h1>
      <p class="lead">Es posible que la guía aún esté en borrador o haya cambiado de dirección.</p>
      <p><a href="${escHtml(requestUrl.origin)}/guias">Ver todas las guías publicadas</a> · <a href="${escHtml(portalBase + '/')}">Ir al portal de Posgrados UCG</a></p>
    </div></section>`,
    footerHtml
  });
  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

async function handlePublicGuidePage(env, requestUrl, rawSlug) {
  let slug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return notFoundGuideResponse(env, requestUrl);
  }
  let article = null;
  let related = [];
  if (env.DB) {
    try {
      article = await env.DB.prepare("SELECT * FROM seo_articles WHERE slug = ? AND status = 'published'").bind(slug).first();
      if (article) {
        const relRes = await env.DB.prepare(
          "SELECT slug, program, title, summary, published_at FROM seo_articles WHERE status = 'published' AND slug <> ? ORDER BY (program = ?) DESC, published_at DESC LIMIT 3"
        ).bind(slug, article.program || '').all();
        related = relRes.results || [];
      }
    } catch (err) {
      if (!/no such table/i.test(String(err?.message))) throw err;
    }
  }
  if (!article) return notFoundGuideResponse(env, requestUrl);

  const program = programs.find(p => p.slug === article.program) || null;
  const { portalBase, rawPhone, displayPhone, headerHtml, footerHtml } = renderSeoChrome(env, requestUrl);
  const checklist = buildSeoChecklist(article, program);
  const canonicalUrl = publicGuideUrl(requestUrl, article.slug);
  const metaDesc = trimMetaDesc(article.summary || program?.summary || article.title, 160);
  const keywordsMeta = [article.source_query, program?.title, 'maestría Ecuador', 'Universidad Casa Grande', 'posgrados Ecuador']
    .filter(Boolean).join(', ');
  const imageUrl = `${requestUrl.origin}${program?.image || '/media/campus-hero.webp'}`;
  const publishedIso = article.published_at || article.created_at || new Date().toISOString();
  const modifiedIso = article.updated_at || publishedIso;
  const { html: bodyHtml, toc } = renderMarkdownAndToc(article.body);

  const graph = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: article.title,
      description: metaDesc,
      inLanguage: 'es-EC',
      datePublished: publishedIso,
      dateModified: modifiedIso,
      mainEntityOfPage: canonicalUrl,
      image: imageUrl,
      keywords: keywordsMeta,
      publisher: {
        '@type': 'CollegeOrUniversity',
        name: 'Universidad Casa Grande',
        url: brand.url
      },
      citation: article.source_url || program?.url || brand.catalogUrl
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Posgrados', item: `${portalBase}/` },
        { '@type': 'ListItem', position: 2, name: 'Guías', item: `${requestUrl.origin}/guias` },
        { '@type': 'ListItem', position: 3, name: article.title, item: canonicalUrl }
      ]
    }
  ];
  if (program) {
    graph.push({
      '@type': 'Course',
      name: program.title,
      description: program.summary,
      provider: {
        '@type': 'CollegeOrUniversity',
        name: 'Universidad Casa Grande',
        url: brand.url
      },
      sameAs: program.url,
      ...(program.degree ? { educationalCredentialAwarded: program.degree } : {}),
      ...(program.duration ? { timeRequired: program.duration } : {}),
      hasCourseInstance: {
        '@type': 'CourseInstance',
        courseMode: program.mode || 'En línea'
      }
    });
  }

  const headTags = [
    '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">',
    `<meta name="description" content="${escHtml(metaDesc)}">`,
    `<meta name="keywords" content="${escHtml(keywordsMeta)}">`,
    `<link rel="canonical" href="${escHtml(canonicalUrl)}">`,
    '<meta property="og:type" content="article">',
    '<meta property="og:locale" content="es_EC">',
    '<meta property="og:site_name" content="Posgrados · Universidad Casa Grande">',
    `<meta property="og:title" content="${escHtml(article.title)}">`,
    `<meta property="og:description" content="${escHtml(metaDesc)}">`,
    `<meta property="og:url" content="${escHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escHtml(imageUrl)}">`,
    `<meta property="article:published_time" content="${escHtml(publishedIso)}">`,
    `<meta property="article:modified_time" content="${escHtml(modifiedIso)}">`,
    `<meta property="article:section" content="${escHtml(program?.area || 'Posgrados')}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escHtml(article.title)}">`,
    `<meta name="twitter:description" content="${escHtml(metaDesc)}">`,
    `<meta name="twitter:image" content="${escHtml(imageUrl)}">`,
    `<script type="application/ld+json">${safeJsonLd({ '@context': 'https://schema.org', '@graph': graph })}</script>`
  ].join('\n');

  const tocHtml = toc.length
    ? `<nav class="toc" aria-label="Tabla de contenido"><p class="toc-title">Contenido de esta guía</p><ul>${toc.map(item => `<li><a href="#${escHtml(item.id)}">${escHtml(item.text)}</a></li>`).join('')}</ul></nav>`
    : '';

  const tuitionDisplay = program && Number.isFinite(program.price) && program.price > 0
    ? `${new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(program.price)} USD`
    : 'Consultar con Admisiones';

  const programBox = program ? `<aside class="side-box" aria-label="Ficha verificada del programa">
    <h2>Ficha verificada UCG</h2>
    <dl class="facts">
      <div><dt>Programa</dt><dd>${escHtml(program.title)}</dd></div>
      <div><dt>Modalidad</dt><dd>${escHtml(program.mode || 'Confirmar con Admisiones')}</dd></div>
      <div><dt>Duración publicada</dt><dd>${escHtml(program.duration || 'Confirmar con Admisiones')}</dd></div>
      <div><dt>Inversión publicada</dt><dd>${escHtml(tuitionDisplay)}</dd></div>
      <div><dt>Estado</dt><dd>${escHtml(program.admissionsStatus || 'Consultar convocatoria')}</dd></div>
    </dl>
    <p style="margin:1rem 0 0;font-size:.9rem">
      <a href="${escHtml(program.url)}" target="_blank" rel="noopener noreferrer">Ficha oficial en casagrande.edu.ec ↗</a>
      ${program.brochure ? `<br><a href="${escHtml(program.brochure)}" target="_blank" rel="noopener noreferrer">Descargar folleto PDF ↗</a>` : ''}
    </p>
  </aside>` : '';

  const relatedHtml = related.length ? `<section style="margin-top:2.2rem">
    <h2 style="font-size:1.35rem;margin-bottom:.75rem">Más guías de Posgrados UCG</h2>
    <div class="related-grid">${related.map(r => `<article class="guide-card">
      <div><h3><a href="${escHtml(publicGuideUrl(requestUrl, r.slug))}">${escHtml(r.title)}</a></h3><p>${escHtml(trimMetaDesc(r.summary, 130))}</p></div>
      <a href="${escHtml(publicGuideUrl(requestUrl, r.slug))}">Leer guía →</a>
    </article>`).join('')}</div>
  </section>` : '';

  const mainHtml = `
    <nav class="breadcrumbs" aria-label="Ruta de navegación">
      <ol>
        <li><a href="${escHtml(portalBase + '/')}">Posgrados</a></li>
        <li><a href="${escHtml(requestUrl.origin)}/guias">Guías</a></li>
        <li aria-current="page">${escHtml(article.title)}</li>
      </ol>
    </nav>
    <div class="layout">
      <div>
        <article class="article-card">
          <span class="kicker">${escHtml(program?.area || 'Posgrados UCG')}${article.source_query ? ` · ${escHtml(article.source_query)}` : ''}</span>
          <h1>${escHtml(article.title)}</h1>
          <p class="lead">${escHtml(article.summary)}</p>
          <div class="meta-bar">
            <span>Universidad Casa Grande · Guayaquil</span>
            <time datetime="${escHtml(publishedIso)}">Publicado: ${escHtml(formatEcDate(publishedIso))}</time>
            <span>~${checklist.readingMinutes} min de lectura</span>
          </div>
          <figure class="hero-media">
            <img src="${escHtml(imageUrl)}" alt="${escHtml(program?.title || article.title)}">
          </figure>
          ${tocHtml}
          <div class="prose">${bodyHtml}</div>
        </article>
        ${relatedHtml}
      </div>
      <aside class="sidebar">
        <div class="cta-box">
          <h2>Habla con nuestra Oficial de Admisiones IA</h2>
          <p>Resuelve dudas sobre mallas, modalidades y recibe un resumen completo por correo tras tu llamada.</p>
          <a class="btn btn-primary" href="tel:${escHtml(rawPhone)}">Llamar al ${escHtml(displayPhone)}</a>
          <a class="btn btn-ghost" href="${escHtml(portalBase + '/#solicitar')}">Solicitar información en línea</a>
        </div>
        ${programBox}
      </aside>
    </div>`;

  const html = seoPageShell({
    title: `${article.title} | Posgrados Universidad Casa Grande`,
    headTags,
    headerHtml,
    mainHtml,
    footerHtml
  });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
  });
}

async function handlePublicGuidesIndex(env, requestUrl) {
  let guides = [];
  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        "SELECT slug, program, title, summary, source_query, published_at, updated_at FROM seo_articles WHERE status = 'published' ORDER BY published_at DESC, updated_at DESC, slug ASC"
      ).all();
      guides = res.results || [];
    } catch (err) {
      if (!/no such table/i.test(String(err?.message))) throw err;
    }
  }
  const { portalBase, rawPhone, displayPhone, headerHtml, footerHtml } = renderSeoChrome(env, requestUrl);
  const canonicalUrl = `${requestUrl.origin}/guias`;
  const desc = 'Guías académicas verificadas sobre maestrías, modalidades, requisitos e inversión en Posgrados de la Universidad Casa Grande (Guayaquil, Ecuador).';
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${canonicalUrl}#collection`,
      name: 'Guías de Posgrados · Universidad Casa Grande',
      description: desc,
      url: canonicalUrl,
      inLanguage: 'es-EC',
      publisher: { '@type': 'CollegeOrUniversity', name: 'Universidad Casa Grande', url: brand.url }
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Posgrados', item: `${portalBase}/` },
        { '@type': 'ListItem', position: 2, name: 'Guías', item: canonicalUrl }
      ]
    }
  ];
  const headTags = [
    '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">',
    `<meta name="description" content="${escHtml(desc)}">`,
    `<link rel="canonical" href="${escHtml(canonicalUrl)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="es_EC">',
    '<meta property="og:title" content="Guías de Posgrados · Universidad Casa Grande">',
    `<meta property="og:description" content="${escHtml(desc)}">`,
    `<meta property="og:url" content="${escHtml(canonicalUrl)}">`,
    `<script type="application/ld+json">${safeJsonLd({ '@context': 'https://schema.org', '@graph': graph })}</script>`
  ].join('\n');

  const cardsHtml = guides.length
    ? `<div class="related-grid">${guides.map(g => {
        const prog = programs.find(p => p.slug === g.program);
        return `<article class="guide-card">
          <div>
            <span class="kicker">${escHtml(prog?.area || 'Posgrados UCG')}</span>
            <h3><a href="${escHtml(publicGuideUrl(requestUrl, g.slug))}">${escHtml(g.title)}</a></h3>
            <p>${escHtml(trimMetaDesc(g.summary, 150))}</p>
          </div>
          <a href="${escHtml(publicGuideUrl(requestUrl, g.slug))}">Leer guía completa →</a>
        </article>`;
      }).join('')}</div>`
    : `<div class="article-card"><p>Aún no hay guías publicadas. Explora nuestras <a href="${escHtml(portalBase + '/#catalogo')}">34 maestrías en el portal</a> o llama a nuestra Oficial IA al <a href="tel:${escHtml(rawPhone)}">${escHtml(displayPhone)}</a>.</p></div>`;

  const mainHtml = `<section style="padding:1.5rem 0 3.5rem">
    <nav class="breadcrumbs" aria-label="Ruta de navegación">
      <ol>
        <li><a href="${escHtml(portalBase + '/')}">Posgrados</a></li>
        <li aria-current="page">Guías</li>
      </ol>
    </nav>
    <span class="kicker">Universidad Casa Grande · Ecuador</span>
    <h1>Guías de orientación para posgrados</h1>
    <p class="lead">${escHtml(desc)}</p>
    ${cardsHtml}
  </section>`;

  const html = seoPageShell({
    title: 'Guías de Posgrados | Universidad Casa Grande',
    headTags,
    headerHtml,
    mainHtml,
    footerHtml
  });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
  });
}

async function handlePublicSitemap(env, requestUrl) {
  let guides = [];
  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        "SELECT slug, published_at, updated_at FROM seo_articles WHERE status = 'published' ORDER BY published_at DESC, slug ASC"
      ).all();
      guides = res.results || [];
    } catch (err) {
      if (!/no such table/i.test(String(err?.message))) throw err;
    }
  }
  const urls = [
    `<url><loc>${escHtml(requestUrl.origin + '/guias')}</loc></url>`,
    ...guides.map(g => {
      const lastmod = String(g.updated_at || g.published_at || '').slice(0, 10);
      return `<url><loc>${escHtml(publicGuideUrl(requestUrl, g.slug))}</loc>${lastmod ? `<lastmod>${escHtml(lastmod)}</lastmod>` : ''}</url>`;
    })
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
  });
}

function handlePublicRobots(requestUrl) {
  const txt = `User-agent: *\nAllow: /guias\nDisallow: /api/\nSitemap: ${requestUrl.origin}/sitemap.xml\n`;
  return new Response(txt, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
  } else if (path === '/api/public/crm' || path.startsWith('/api/public/crm/')) {
    if (!['GET', 'HEAD'].includes(request.method) && originHeader && !isAllowedOrigin(originHeader, env, url.origin)) {
      return crmJson({ error: 'Origen no permitido.' }, 403);
    }
    response = await routePublicCrm(request, env, path);
  } else if (path.startsWith('/api/public/admin/')) {
    if (!['GET', 'HEAD'].includes(request.method) && originHeader && !isAllowedOrigin(originHeader, env, url.origin)) {
      return crmJson({ error: 'Origen no permitido.' }, 403);
    }
    response = await routePublicAdmin(request, env, url, path);
  } else if (path === '/robots.txt' && ['GET', 'HEAD'].includes(request.method)) {
    response = handlePublicRobots(url);
    if (request.method === 'HEAD') {
      response = new Response(null, { status: response.status, headers: response.headers });
    }
  } else if (path === '/sitemap.xml' && ['GET', 'HEAD'].includes(request.method)) {
    response = await handlePublicSitemap(env, url);
    if (request.method === 'HEAD') {
      response = new Response(null, { status: response.status, headers: response.headers });
    }
  } else if (path === '/guias' && ['GET', 'HEAD'].includes(request.method)) {
    response = await handlePublicGuidesIndex(env, url);
    if (request.method === 'HEAD') {
      response = new Response(null, { status: response.status, headers: response.headers });
    }
  } else if (path.startsWith('/guias/') && ['GET', 'HEAD'].includes(request.method)) {
    const slugMatch = path.match(/^\/guias\/([^/]+)$/);
    response = slugMatch ? await handlePublicGuidePage(env, url, slugMatch[1]) : notFoundGuideResponse(env, url);
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
      if (path === '/api/webhooks/retell') {
        console.log('retell webhook:', response.status, 'bytes:', request.headers.get('content-length') || 'stream');
      }
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
