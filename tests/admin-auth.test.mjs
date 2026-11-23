import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteD1 } from '../server/d1-sqlite.mjs';
import { handleHttpRequest, MIN_STAFF_TOKEN_LENGTH } from '../server/index.mjs';

const BASE = 'https://casagrande-posgrados-production.up.railway.app';
const ORIGIN = 'https://slimetoad.github.io';
const STAFF_TOKEN = 'admin-auth-test-token-0123456789abcdefXYZ';
const LEAD = {
  name: 'Aspirante Privada Prueba',
  email: 'aspirante.privada@example.org',
  phone: '0991112233'
};

function makeEnv(overrides = {}) {
  const DB = openSqliteD1(':memory:');
  const env = {
    DB,
    PUBLIC_BASE_URL: 'https://slimetoad.github.io/Casagrande',
    INSTITUTIONAL_LIVE: 'false',
    RESEND_API_KEY: 'resend-test-key',
    RESEND_FROM: 'Posgrados UCG <posgrados@example.edu>',
    ADMISSIONS_STAFF_TOKEN: STAFF_TOKEN,
    ...overrides
  };
  const ctx = { waitUntil(p) { Promise.resolve(p).catch(() => {}); } };
  return { env, DB, ctx };
}

function req(method, path, { token, headers = {}, body } = {}) {
  const h = new Headers({ Origin: ORIGIN, ...headers });
  if (token) h.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new Request(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function seedLead(env, ctx) {
  const res = await handleHttpRequest(req('POST', '/api/leads', {
    headers: { 'Sec-Fetch-Site': 'cross-site' },
    body: { ...LEAD, program: 'maestria-en-ciberseguridad', source: 'Formulario web', consentEmail: true, consentVoice: false }
  }), env, ctx);
  assert.equal(res.status, 201, 'public lead capture must stay open');
  const row = await env.DB.prepare('SELECT id FROM leads WHERE email = ?').bind(LEAD.email).first();
  assert.ok(row?.id);
  const task = await env.DB.prepare('SELECT id FROM tasks WHERE lead_id = ? LIMIT 1').bind(row.id).first();
  return { leadId: row.id, taskId: task?.id || 'missing-task' };
}

// Every Admin route the workspace calls, plus the session probe.
function adminRoutes(leadId, taskId) {
  return [
    ['GET', '/api/admin/session'],
    ['GET', '/api/admin/crm'],
    ['HEAD', '/api/admin/crm'],
    ['PATCH', `/api/admin/crm/leads/${leadId}`, { stage: 'En orientación' }],
    ['POST', `/api/admin/crm/leads/${leadId}/notes`, { text: 'Nota de prueba' }],
    ['POST', `/api/admin/crm/leads/${leadId}/tasks`, { title: 'Llamar', dueAt: new Date(Date.now() + 86400000).toISOString() }],
    ['PATCH', `/api/admin/crm/tasks/${taskId}`, { status: 'hecha' }],
    ['POST', `/api/admin/crm/leads/${leadId}/ai-draft`, { goal: 'seguimiento' }],
    ['POST', `/api/admin/crm/leads/${leadId}/nurture-email`, { subject: 'Hola', body: 'Mensaje de prueba' }],
    ['GET', '/api/admin/seo?days=30'],
    ['POST', '/api/admin/seo/analyze', { days: 30, question: '¿Qué priorizar?' }],
    ['GET', '/api/admin/content'],
    ['POST', '/api/admin/content/draft', { programSlug: 'maestria-en-ciberseguridad' }],
    ['POST', '/api/admin/content/publish', { id: 'no-existe' }],
    ['DELETE', `/api/admin/crm/leads/${leadId}`]
  ];
}

const LEGACY_ROUTES = [
  ['GET', '/api/public/crm'],
  ['HEAD', '/api/public/crm'],
  ['PATCH', '/api/public/crm/leads/x', { stage: 'Cerrado' }],
  ['DELETE', '/api/public/crm/leads/x'],
  ['POST', '/api/public/crm/leads/x/notes', { text: 'x' }],
  ['POST', '/api/public/crm/leads/x/tasks', { title: 'x' }],
  ['POST', '/api/public/crm/leads/x/ai-draft', {}],
  ['POST', '/api/public/crm/leads/x/nurture-email', { subject: 'x', body: 'x' }],
  ['PATCH', '/api/public/crm/tasks/x', { status: 'hecha' }],
  ['GET', '/api/public/admin/seo'],
  ['POST', '/api/public/admin/seo/analyze', {}],
  ['GET', '/api/public/admin/content'],
  ['POST', '/api/public/admin/content/draft', {}],
  ['POST', '/api/public/admin/content/publish', {}]
];

async function assertRejectedWithoutData(res, label) {
  assert.equal(res.status, 401, `${label} must answer 401`);
  assert.match(res.headers.get('www-authenticate') || '', /^Bearer/, `${label} must advertise bearer auth`);
  const text = await res.text();
  assert.ok(!text.includes(LEAD.email), `${label} leaked an email`);
  assert.ok(!text.includes(LEAD.name), `${label} leaked a name`);
  assert.ok(!/"leads"|"tasks"|"events"|"rows"|"articles"/.test(text), `${label} returned data fields`);
}

function mockOutbound(t) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return Response.json({ id: 'mocked-' + calls.length });
  });
  return calls;
}

test('cada ruta Admin rechaza peticiones anónimas, con token erróneo o con esquema distinto, sin devolver datos ni mutar', async t => {
  const { env, DB, ctx } = makeEnv();
  t.after(() => DB.close());
  const { leadId, taskId } = await seedLead(env, ctx);
  const outbound = mockOutbound(t);
  const eventsBefore = (await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n;

  const variants = [
    ['anónima', {}],
    ['token erróneo', { token: 'x'.repeat(STAFF_TOKEN.length) }],
    ['token con sufijo', { token: STAFF_TOKEN + 'a' }],
    ['Basic auth', { headers: { Authorization: 'Basic ' + Buffer.from('admin:' + STAFF_TOKEN).toString('base64') } }],
    ['token sin Bearer', { headers: { Authorization: STAFF_TOKEN } }],
    ['sin Origin (curl)', { headers: { Origin: '' } }]
  ];
  for (const [method, path, body] of adminRoutes(leadId, taskId)) {
    for (const [name, opts] of variants) {
      const r = req(method, path, { ...opts, body });
      if (opts.headers?.Origin === '') {
        const h = new Headers(r.headers); h.delete('origin');
        const res = await handleHttpRequest(new Request(r, { headers: h }), env, ctx);
        await assertRejectedWithoutData(res, `${method} ${path} (${name})`);
        continue;
      }
      const res = await handleHttpRequest(r, env, ctx);
      await assertRejectedWithoutData(res, `${method} ${path} (${name})`);
    }
  }

  // Nothing changed and nothing was sent.
  const lead = await DB.prepare('SELECT stage FROM leads WHERE id = ?').bind(leadId).first();
  assert.equal(lead.stage, 'Nuevo', 'anonymous PATCH/DELETE must not touch the lead');
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n, eventsBefore);
  assert.deepEqual(outbound, [], 'no email or LLM call may be triggered anonymously');
});

test('las rutas retiradas /api/public/* responden 401 sin datos y 410 al personal autenticado', async t => {
  const { env, DB, ctx } = makeEnv();
  t.after(() => DB.close());
  await seedLead(env, ctx);
  mockOutbound(t);

  for (const [method, path, body] of LEGACY_ROUTES) {
    const anon = await handleHttpRequest(req(method, path, { body }), env, ctx);
    await assertRejectedWithoutData(anon, `${method} ${path}`);

    const authed = await handleHttpRequest(req(method, path, { body, token: STAFF_TOKEN }), env, ctx);
    assert.equal(authed.status, 410, `${method} ${path} authed`);
    if (method !== 'HEAD') {
      const text = await authed.text();
      assert.ok(!text.includes(LEAD.email));
      assert.match(JSON.parse(text).movedTo, /^\/api\/admin\//);
    }
  }
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM leads').first()).n, 1);
});

test('el personal autorizado con ADMISSIONS_STAFF_TOKEN puede usar cada ruta Admin', async t => {
  const { env, DB, ctx } = makeEnv();
  t.after(() => DB.close());
  const { leadId, taskId } = await seedLead(env, ctx);
  const outbound = mockOutbound(t);

  for (const [method, path, body] of adminRoutes(leadId, taskId)) {
    const res = await handleHttpRequest(req(method, path, { body, token: STAFF_TOKEN }), env, ctx);
    assert.ok(![401, 403].includes(res.status), `${method} ${path} rejected an authorized request (${res.status})`);
    assert.ok(res.status < 500, `${method} ${path} failed with ${res.status}`);
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }

  // Spot-check real payloads.
  const { env: env2, DB: DB2, ctx: ctx2 } = makeEnv();
  t.after(() => DB2.close());
  await seedLead(env2, ctx2);
  const session = await handleHttpRequest(req('GET', '/api/admin/session', { token: STAFF_TOKEN }), env2, ctx2);
  assert.deepEqual(await session.json(), { ok: true, operator: 'Servicio de admisiones' });
  const crm = await handleHttpRequest(req('GET', '/api/admin/crm', { token: STAFF_TOKEN }), env2, ctx2);
  assert.equal(crm.status, 200);
  const data = await crm.json();
  assert.equal(data.leads.length, 1);
  assert.equal(data.leads[0].email, LEAD.email);
  // Whitespace around the configured secret (a common copy/paste slip in Railway variables) is tolerated.
  const padded = await handleHttpRequest(req('GET', '/api/admin/session', { token: STAFF_TOKEN }), { ...env2, ADMISSIONS_STAFF_TOKEN: `  ${STAFF_TOKEN}\n` }, ctx2);
  assert.equal(padded.status, 200);
  assert.ok(outbound.every(u => u === 'https://api.resend.com/emails'), 'only the explicit nurture-email call reaches Resend');
});

test('sin token configurado o con token débil, ninguna credencial abre el Admin', async t => {
  for (const [label, token] of [['sin token', undefined], ['vacío', ''], ['débil', 'a'.repeat(MIN_STAFF_TOKEN_LENGTH - 1)]]) {
    const { env, DB, ctx } = makeEnv({ ADMISSIONS_STAFF_TOKEN: token });
    t.after(() => DB.close());
    for (const presented of [undefined, '', token, 'undefined', 'null']) {
      const res = await handleHttpRequest(req('GET', '/api/admin/crm', { token: presented || undefined }), env, ctx);
      await assertRejectedWithoutData(res, `${label} / presented=${JSON.stringify(presented)}`);
    }
  }
});

test('las cabeceras de identidad del proxy se ignoran salvo con TRUSTED_IDENTITY_PROXY=true', async t => {
  const spoof = { 'oai-authenticated-user-email': 'jefa@casagrande.edu.ec', 'oai-authenticated-user-id': 'u-1' };

  const { env, DB, ctx } = makeEnv({ ADMISSIONS_STAFF_EMAILS: 'jefa@casagrande.edu.ec' });
  t.after(() => DB.close());
  await seedLead(env, ctx);
  await assertRejectedWithoutData(await handleHttpRequest(req('GET', '/api/admin/crm', { headers: spoof }), env, ctx), 'spoofed admin');
  // Same applies to the legacy portal /api/staff/* routes served through src/portal.js.
  const staff = await handleHttpRequest(req('GET', '/api/staff/analytics', { headers: spoof }), env, ctx);
  assert.equal(staff.status, 403);

  const trusted = makeEnv({ ADMISSIONS_STAFF_EMAILS: 'jefa@casagrande.edu.ec', TRUSTED_IDENTITY_PROXY: 'true' });
  t.after(() => trusted.DB.close());
  const ok = await handleHttpRequest(req('GET', '/api/admin/session', { headers: spoof }), trusted.env, trusted.ctx);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).operator, 'jefa@casagrande.edu.ec');
  const notListed = await handleHttpRequest(req('GET', '/api/admin/session', { headers: { ...spoof, 'oai-authenticated-user-email': 'otra@example.org' } }), trusted.env, trusted.ctx);
  assert.equal(notListed.status, 401);
});

test('las rutas públicas del portal siguen abiertas y el preflight admite Authorization', async t => {
  const { env, DB, ctx } = makeEnv();
  t.after(() => DB.close());
  await seedLead(env, ctx);

  const health = await handleHttpRequest(req('GET', '/api/health'), env, ctx);
  assert.equal(health.status, 200);
  const healthText = await health.text();
  assert.ok(!healthText.includes(LEAD.email));

  const lookup = await handleHttpRequest(req('POST', '/api/retell/catalog-lookup', { body: { args: { query: 'ciberseguridad' } } }), env, ctx);
  assert.equal(lookup.status, 200);

  const unsignedWebhook = await handleHttpRequest(new Request(BASE + '/api/webhooks/retell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'call_analyzed', call: {} })
  }), { ...env, RETELL_API_KEY: 'retell-signing-key' }, ctx);
  assert.equal(unsignedWebhook.status, 403, 'Retell webhook keeps requiring its HMAC signature');

  const preflight = await handleHttpRequest(new Request(BASE + '/api/admin/crm', {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }
  }), env, ctx);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);

  const evil = await handleHttpRequest(new Request(BASE + '/api/admin/crm', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' }
  }), env, ctx);
  assert.equal(evil.status, 403);
});
