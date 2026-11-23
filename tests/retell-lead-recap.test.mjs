import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openSqliteD1, applyMigrations } from '../server/d1-sqlite.mjs';
import { handleHttpRequest } from '../server/index.mjs';
import { makeCallRecapDraft, previewNurturePlan } from '../src/conversation-nurture.js';
import { programs } from '../src/catalog.js';

const RETELL_API_KEY = 'retell-test-signing-key';
const INBOUND_NUMBER = '+17875550199';
const AGENT_ID = 'agent_ucg_posgrados_ec';
const PUBLIC_BASE_URL = 'https://slimetoad.github.io/Casagrande';
const STAFF_TOKEN = 'test-staff-token-0123456789abcdefghijklmnop';

function staffRequest(url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${STAFF_TOKEN}`);
  return new Request(url, { ...init, headers });
}

function makeEnv(dbPath = ':memory:', overrides = {}) {
  const DB = openSqliteD1(dbPath);
  const waits = [];
  const ctx = {
    waitUntil(promise) {
      waits.push(Promise.resolve(promise));
    }
  };
  const env = {
    DB,
    PUBLIC_BASE_URL,
    OUTREACH_ENABLED: 'true',
    INSTITUTIONAL_LIVE: 'false',
    RETELL_API_KEY,
    RETELL_INBOUND_NUMBER: INBOUND_NUMBER,
    RETELL_INBOUND_AGENT_ID: AGENT_ID,
    RESEND_API_KEY: 'resend-test-key',
    RESEND_FROM: 'Posgrados UCG <posgrados@example.edu>',
    ADMISSIONS_STAFF_TOKEN: STAFF_TOKEN,
    ...overrides
  };
  return { env, DB, ctx, waits };
}

function signedRetellRequest(baseUrl, call, event = 'call_analyzed', key = RETELL_API_KEY) {
  const body = JSON.stringify({ event, call });
  const ts = String(Date.now());
  const sig = createHmac('sha256', key).update(body + ts).digest('hex');
  return new Request(baseUrl + '/api/webhooks/retell', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Retell-Signature': `v=${ts},d=${sig}`
    },
    body
  });
}

test('Retell inbound call_analyzed crea expediente rico en CRM, despacha resumen Resend y evita duplicados', async t => {
  const { env, DB, ctx, waits } = makeEnv(':memory:');
  t.after(() => DB.close());

  const sentEmails = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const payload = JSON.parse(options.body);
    sentEmails.push({ payload, idempotencyKey: options.headers['Idempotency-Key'] });
    return Response.json({ id: 'resend-recap-001' });
  });

  const call = {
    call_id: 'call_retell_ec_001',
    call_type: 'phone_call',
    direction: 'inbound',
    call_status: 'ended',
    agent_id: AGENT_ID,
    agent_version: 2,
    from_number: '+593987654321',
    to_number: INBOUND_NUMBER,
    end_timestamp: Date.now(),
    recording_url: 'https://internal.retell.example/no-guardar-esta-url.mp3',
    transcript_object: [
      { role: 'agent', content: 'Instrucción interna del sistema que no debe almacenarse.' },
      { role: 'user', content: 'Hola, soy María Fernanda Gómez. Me interesa la Maestría en Inteligencia Artificial y Analítica de Datos.' },
      { role: 'user', content: 'Mi correo es maria.gomez@example.org, sí está perfecto así deletreado.' }
    ],
    call_analysis: {
      in_voicemail: false,
      call_summary: 'Consulta sobre maestría en IA.',
      custom_analysis_data: {
        applicant_name: 'María Fernanda Gómez',
        applicant_email: 'Maria.Gomez@example.org',
        email_confirmed_by_spelling: true,
        applicant_phone: '0991234567',
        phone_confirmed_by_readback: true,
        program_slug: 'maestria-en-ia-y-ciencia-de-datos',
        program_interest: 'Maestría en Inteligencia Artificial y Analítica de Datos',
        city: 'Guayaquil',
        preferred_modality: 'En línea',
        start_horizon: 'Próxima cohorte',
        academic_background: 'Ingeniera en Sistemas',
        key_questions: 'Duración, modalidad en línea y malla curricular',
        obstacles: 'Compatibilidad con horario laboral',
        call_summary_es: 'María Fernanda Gómez llamó desde Guayaquil interesada en la Maestría en Inteligencia Artificial y Analítica de Datos en modalidad en línea para la próxima cohorte.',
        consent_email: true,
        human_callback: false,
        opt_out: false
      }
    }
  };

  const res1 = await handleHttpRequest(signedRetellRequest('https://crm.example.up.railway.app', call), env, ctx);
  assert.equal(res1.status, 204);
  assert.equal(waits.length, 1);
  await Promise.all(waits);

  // Retry same call_analyzed webhook -> must be idempotent and send zero additional emails
  const res2 = await handleHttpRequest(signedRetellRequest('https://crm.example.up.railway.app', call), env, ctx);
  assert.equal(res2.status, 204);
  await Promise.all(waits);

  assert.equal(sentEmails.length, 1);
  const sent = sentEmails[0].payload;
  assert.deepEqual(sent.to, ['maria.gomez@example.org']);
  assert.match(sent.subject, /Inteligencia Artificial/i);
  assert.match(sent.text, /Hola María Fernanda Gómez,/);
  assert.match(sent.text, /Universidad Casa Grande/);
  assert.match(sent.text, /Guayaquil/);
  assert.match(sent.text, /Consultar con Admisiones/);
  assert.match(sent.text, /FOLLETO-CIENCIA-DE-DATOS\.pdf/);
  assert.match(sent.text, /maria\.gomez@example\.org \(verificado letra por letra\)/);
  assert.match(sent.text, /\+593991234567 \(verificado por lectura\)/);
  assert.match(sent.text, /https:\/\/slimetoad\.github\.io\/Casagrande\/#cita/);
  assert.match(sent.text, /Fuente de la universidad:/);

  const lead = DB.raw.prepare('SELECT * FROM leads').get();
  assert.equal(lead.name, 'María Fernanda Gómez');
  assert.equal(lead.email, 'maria.gomez@example.org');
  assert.equal(lead.phone, '+593991234567');
  assert.equal(lead.program, 'maestria-en-ia-y-ciencia-de-datos');
  assert.equal(lead.source, 'Llamada Retell');
  assert.equal(lead.consent_email, 1);

  const leadCtx = JSON.parse(lead.context);
  assert.equal(leadCtx.city, 'Guayaquil');
  assert.equal(leadCtx.modality, 'En línea');
  assert.equal(leadCtx.horizon, 'Próxima cohorte');
  assert.equal(leadCtx.academicBackground, 'Ingeniera en Sistemas');
  assert.equal(leadCtx.emailConfirmed, true);
  assert.equal(leadCtx.phoneConfirmed, true);
  assert.match(leadCtx.callSummary, /Guayaquil/);

  const conv = DB.raw.prepare('SELECT * FROM admissions_conversations').get();
  assert.equal(conv.lead_id, lead.id);
  assert.doesNotMatch(JSON.stringify(conv), /no-guardar-esta-url|Instrucción interna/);
  const extraction = JSON.parse(conv.extraction);
  assert.equal(extraction.retellRecap, true);
  assert.equal(extraction.retellData.city, 'Guayaquil');
  assert.equal(extraction.retellData.confirmedEmail, 'maria.gomez@example.org');
  assert.equal(extraction.retellData.confirmedPhone, '+593991234567');

  const retellEvent = DB.raw.prepare("SELECT * FROM events WHERE type='llamada'").get();
  assert.ok(retellEvent);
  assert.equal(retellEvent.actor, 'Retell AI');
  assert.match(retellEvent.description, /correo deletreado y confirmado/);
  assert.match(retellEvent.description, /teléfono confirmado por lectura/);

  // Verify /api/health and /api/admin/crm responses
  const healthRes = await handleHttpRequest(new Request('https://crm.example.up.railway.app/api/health'), env, ctx);
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.deepEqual(health, {
    ok: true,
    service: 'casagrande-posgrados-crm',
    retellConfigured: true,
    mailConfigured: true,
    dbReady: true,
    inboundNumber: INBOUND_NUMBER
  });

  const crmRes = await handleHttpRequest(staffRequest('https://crm.example.up.railway.app/api/admin/crm'), env, ctx);
  assert.equal(crmRes.status, 200);
  const crm = await crmRes.json();
  assert.equal(crm.leads.length, 1);
  assert.equal(crm.leads[0].name, 'María Fernanda Gómez');
  assert.equal(crm.leads[0].context.city, 'Guayaquil');
  assert.equal(crm.conversations.length, 1);
  assert.equal(crm.nurtureJobs.length, 1);
  assert.equal(crm.nurtureJobs[0].status, 'accepted');
  assert.equal(crm.nurtureJobs[0].provider_id, 'resend-recap-001');
  assert.equal(crm.stats.totalLeads, 1);
  assert.equal(crm.stats.retellCalls, 1);
  assert.equal(crm.stats.verifiedEmails, 1);
  assert.equal(crm.stats.recapEmailsSent, 1);
});

test('actualiza expediente previo de solo teléfono, empareja programa difuso y atiende solicitud de asesor con recap', async t => {
  const { env, DB, ctx, waits } = makeEnv(':memory:');
  t.after(() => DB.close());

  const sent = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return Response.json({ id: 'resend-upgrade-' + sent.length });
  });

  // Call 1: phone-only without email
  const firstCall = {
    call_id: 'call_phone_only_1',
    call_type: 'phone_call',
    direction: 'inbound',
    call_status: 'ended',
    agent_id: AGENT_ID,
    from_number: '+593998887766',
    to_number: INBOUND_NUMBER,
    end_timestamp: Date.now(),
    transcript_object: [{ role: 'user', content: '¿Qué requisitos tiene la maestría?' }],
    call_analysis: { in_voicemail: false }
  };
  assert.equal((await handleHttpRequest(signedRetellRequest('https://crm.example.up.railway.app', firstCall), env, ctx)).status, 204);
  await Promise.all(waits);
  assert.equal(sent.length, 0);
  const initialLead = DB.raw.prepare('SELECT * FROM leads').get();
  assert.equal(initialLead.name, 'Aspirante por teléfono');
  assert.match(initialLead.email, /^intake:phone:/);

  // Call 2: same phone provides spelled email, name, fuzzy program_interest, and asks for human callback too
  const secondCall = {
    call_id: 'call_phone_upgrade_2',
    call_type: 'phone_call',
    direction: 'inbound',
    call_status: 'ended',
    agent_id: AGENT_ID,
    from_number: '+593998887766',
    to_number: INBOUND_NUMBER,
    end_timestamp: Date.now(),
    transcript_object: [{ role: 'user', content: 'Soy Carlos Mendoza, me interesa Comunicación Estratégica y quiero que un asesor me contacte.' }],
    call_analysis: {
      in_voicemail: false,
      custom_analysis_data: {
        applicant_name: 'Carlos Mendoza',
        applicant_email: 'carlos.mendoza@example.org',
        email_confirmed_by_spelling: true,
        applicant_phone: '+593998887766',
        phone_confirmed_by_readback: true,
        program_interest: 'Maestría en Comunicación Estratégica e Imagen Institucional',
        city: 'Quito',
        preferred_modality: 'En línea',
        start_horizon: 'En seis meses',
        call_summary_es: 'Carlos Mendoza consultó desde Quito por Comunicación Estratégica y pidió contacto con un asesor.',
        consent_email: true,
        human_callback: true,
        opt_out: false
      }
    }
  };
  assert.equal((await handleHttpRequest(signedRetellRequest('https://crm.example.up.railway.app', secondCall), env, ctx)).status, 204);
  await Promise.all(waits);

  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM leads').get().n, 1);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM admissions_phone_identities').get().n, 0);
  const upgraded = DB.raw.prepare('SELECT * FROM leads WHERE id=?').get(initialLead.id);
  assert.equal(upgraded.name, 'Carlos Mendoza');
  assert.equal(upgraded.email, 'carlos.mendoza@example.org');
  assert.equal(upgraded.program, 'comunicacion-estrategica-e-imagen-institucional');
  assert.equal(upgraded.consent_email, 1);
  assert.equal(upgraded.paused, 0);

  // Advisor callback task created AND recap email still dispatched
  const advisorTask = DB.raw.prepare("SELECT * FROM tasks WHERE lead_id=? AND title LIKE '%asesor%'").get(upgraded.id);
  assert.ok(advisorTask);
  assert.equal(advisorTask.status, 'pendiente');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['carlos.mendoza@example.org']);
  assert.match(sent[0].text, /2\.?800|2,800/);
  assert.match(sent[0].text, /Hola Carlos Mendoza,/);
});

test('respeta opt_out, consent_email false, migraciones idempotentes, CORS y catalog-lookup', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ucg-crm-test-'));
  const dbPath = join(dir, 'casagrande.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const { env, DB, ctx, waits } = makeEnv(dbPath);
  t.after(() => DB.close());

  // Re-running migrations on the same SQLite file must be idempotent
  applyMigrations(DB.raw);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM _migrations').get().n, 4);

  t.mock.method(globalThis, 'fetch', () => assert.fail('No debe enviar correos sin consentimiento o tras baja'));

  // consent_email = false creates lead without sending email
  const noConsentCall = {
    call_id: 'call_no_consent',
    call_type: 'phone_call',
    direction: 'inbound',
    call_status: 'ended',
    agent_id: AGENT_ID,
    from_number: '+593990001122',
    to_number: INBOUND_NUMBER,
    end_timestamp: Date.now(),
    transcript_object: [{ role: 'user', content: 'Solo quiero que registren mi consulta, no envíen correos.' }],
    call_analysis: {
      in_voicemail: false,
      custom_analysis_data: {
        applicant_name: 'Lucía Paredes',
        applicant_email: 'lucia.paredes@example.org',
        email_confirmed_by_spelling: true,
        applicant_phone: '+593990001122',
        phone_confirmed_by_readback: true,
        program_interest: 'Maestrías en general',
        call_summary_es: 'Lucía consultó por opciones generales sin autorizar correo.',
        consent_email: false,
        opt_out: false
      }
    }
  };
  assert.equal((await handleHttpRequest(signedRetellRequest('https://crm.example.up.railway.app', noConsentCall), env, ctx)).status, 204);
  await Promise.all(waits);
  const noConsentLead = DB.raw.prepare("SELECT * FROM leads WHERE email='lucia.paredes@example.org'").get();
  assert.equal(noConsentLead.consent_email, 0);

  // opt_out = true suppresses voice and creates no lead
  const optOutCall = {
    call_id: 'call_opt_out',
    call_type: 'phone_call',
    direction: 'inbound',
    call_status: 'ended',
    agent_id: AGENT_ID,
    from_number: '+593990009999',
    to_number: INBOUND_NUMBER,
    end_timestamp: Date.now(),
    transcript_object: [{ role: 'user', content: 'Por favor no me vuelvan a llamar.' }],
    call_analysis: {
      in_voicemail: false,
      custom_analysis_data: {
        applicant_email: 'alguien@example.org',
        opt_out: true
      }
    }
  };
  assert.equal((await handleHttpRequest(signedRetellRequest('https://crm.example.up.railway.app', optOutCall), env, ctx)).status, 204);
  assert.ok(DB.raw.prepare('SELECT 1 FROM voice_suppressions WHERE phone=?').get('+593990009999'));
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM leads WHERE email='alguien@example.org'").get().n, 0);

  // previewNurturePlan keeps requiring consent for voice calls without consentEmail
  const previewBlocked = previewNurturePlan(
    { intent: 'programa', confidence: 'alta', needsReview: false, retellRecap: true },
    { channel: 'call', consentEmail: false, programs, base: PUBLIC_BASE_URL }
  );
  assert.equal(previewBlocked.decision, 'revision_humana');
  assert.equal(previewBlocked.draft, null);

  const previewAllowed = previewNurturePlan(
    { intent: 'programa', confidence: 'alta', needsReview: false, retellRecap: true, retellData: { applicantName: 'Ana', summary: 'Resumen breve' } },
    { channel: 'voice', consentEmail: true, programs, base: PUBLIC_BASE_URL }
  );
  assert.equal(previewAllowed.decision, 'respuesta_programada');
  assert.match(previewAllowed.draft.text, /Hola Ana,/);
  assert.ok(makeCallRecapDraft({ base: PUBLIC_BASE_URL }).text.includes('/#cita'));

  // CORS preflight and cross-origin POST /api/leads + /api/chat from GitHub Pages
  const preflight = await handleHttpRequest(new Request('https://crm.example.up.railway.app/api/leads', {
    method: 'OPTIONS',
    headers: { Origin: 'https://slimetoad.github.io' }
  }), env, ctx);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://slimetoad.github.io');

  const leadRes = await handleHttpRequest(new Request('https://crm.example.up.railway.app/api/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://slimetoad.github.io',
      'Sec-Fetch-Site': 'cross-site'
    },
    body: JSON.stringify({
      name: 'Andrés Vera',
      email: 'andres.vera@example.org',
      phone: '0995554433',
      program: programs[0].slug,
      source: 'Portal GitHub Pages',
      consentEmail: false,
      consentVoice: false
    })
  }), env, ctx);
  assert.equal(leadRes.status, 201);
  assert.equal(leadRes.headers.get('Access-Control-Allow-Origin'), 'https://slimetoad.github.io');

  const chatRes = await handleHttpRequest(new Request('https://crm.example.up.railway.app/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://slimetoad.github.io',
      'Sec-Fetch-Site': 'cross-site'
    },
    body: JSON.stringify({ message: '¿Cuál es la duración del MBA?', program: programs[0].slug })
  }), env, ctx);
  assert.equal(chatRes.status, 200);
  assert.equal(chatRes.headers.get('Access-Control-Allow-Origin'), 'https://slimetoad.github.io');

  // Untrusted cross-origin must still be rejected with 403
  const evilRes = await handleHttpRequest(new Request('https://crm.example.up.railway.app/api/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example.org',
      'Sec-Fetch-Site': 'cross-site'
    },
    body: JSON.stringify({ name: 'Malicioso', email: 'evil@example.org' })
  }), env, ctx);
  assert.equal(evilRes.status, 403);
  assert.equal(evilRes.headers.get('Access-Control-Allow-Origin'), null);

  // /api/retell/catalog-lookup endpoint
  const lookupRes = await handleHttpRequest(new Request('https://crm.example.up.railway.app/api/retell/catalog-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: { query: 'ciberseguridad' } })
  }), env, ctx);
  assert.equal(lookupRes.status, 200);
  const lookup = await lookupRes.json();
  assert.equal(lookup.ok, true);
  assert.equal(lookup.programs[0].slug, 'maestria-en-ciberseguridad');
});

test('endpoints CRM de seguimiento, notas, tareas, borrador IA, correo Resend y borrado funcionan extremo a extremo', async t => {
  const { env, DB, ctx } = makeEnv(':memory:');
  t.after(() => DB.close());

  const origin = 'https://slimetoad.github.io';
  const baseUrl = 'https://crm.example.up.railway.app';

  // CORS preflight must advertise GET, POST, PATCH, DELETE, OPTIONS
  const corsRes = await handleHttpRequest(staffRequest(baseUrl + '/api/admin/crm/leads/abc', {
    method: 'OPTIONS',
    headers: { Origin: origin }
  }), env, ctx);
  assert.equal(corsRes.status, 204);
  assert.equal(corsRes.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(corsRes.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PATCH, DELETE, OPTIONS');

  // Create a lead via POST /api/leads
  const createRes = await handleHttpRequest(new Request(baseUrl + '/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify({
      name: 'Valeria Cedeño',
      email: 'valeria.cedeno@example.org',
      phone: '0994443322',
      program: 'maestria-en-ciberseguridad',
      source: 'Formulario web',
      consentEmail: false,
      consentVoice: false,
      context: { ciudad: 'Manta', horizonte: 'Próxima convocatoria' }
    })
  }), env, ctx);
  assert.equal(createRes.status, 201);

  const initialCrm = await (await handleHttpRequest(staffRequest(baseUrl + '/api/admin/crm', { headers: { Origin: origin } }), env, ctx)).json();
  assert.equal(initialCrm.leads.length, 1);
  const leadId = initialCrm.leads[0].id;
  assert.ok(Array.isArray(initialCrm.tasks));
  assert.equal(initialCrm.stats.stageCounts.Nuevo, 1);
  assert.equal(initialCrm.stats.openTasks, 1);

  // PATCH /api/admin/crm/leads/:id (stage, score, owner, note, due_at, paused, consents)
  const patchRes = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      stage: 'En orientación',
      score: 88,
      owner: 'Carolina Mendoza',
      next_action: 'Enviar ficha y coordinar llamada',
      due_at: '2026-12-01T15:00:00.000Z',
      paused: false,
      consent_email: true,
      consent_voice: true
    })
  }), env, ctx);
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.headers.get('Access-Control-Allow-Origin'), origin);
  const patched = await patchRes.json();
  assert.equal(patched.ok, true);
  assert.equal(patched.lead.stage, 'En orientación');
  assert.equal(patched.lead.score, 88);
  assert.equal(patched.lead.owner, 'Carolina Mendoza');
  assert.equal(patched.lead.consent_email, 1);
  assert.equal(patched.lead.consent_voice, 1);
  assert.equal(patched.lead.revision, 2);

  // Invalid stage / score must return 422
  const badPatch = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'Inventada' })
  }), env, ctx);
  assert.equal(badPatch.status, 422);

  // POST /api/admin/crm/leads/:id/notes
  const noteRes = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ text: 'Trabaja en seguridad bancaria y prefiere tutorías virtuales.', actor: 'Carolina' })
  }), env, ctx);
  assert.equal(noteRes.status, 201);
  const noteData = await noteRes.json();
  assert.equal(noteData.ok, true);
  assert.equal(noteData.event.type, 'nota');
  assert.equal(DB.raw.prepare('SELECT note FROM leads WHERE id=?').get(leadId).note, 'Trabaja en seguridad bancaria y prefiere tutorías virtuales.');

  // POST /api/admin/crm/leads/:id/tasks + PATCH /api/admin/crm/tasks/:taskId
  const taskRes = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ title: 'Validar título de tercer nivel', due_at: '2026-12-03T14:00:00.000Z' })
  }), env, ctx);
  assert.equal(taskRes.status, 201);
  const createdTask = (await taskRes.json()).task;
  assert.equal(createdTask.status, 'pendiente');

  const taskPatchRes = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/tasks/${createdTask.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ status: 'hecha', actor: 'Carolina' })
  }), env, ctx);
  assert.equal(taskPatchRes.status, 200);
  assert.equal((await taskPatchRes.json()).task.status, 'hecha');

  // POST /api/admin/crm/leads/:id/ai-draft (fallback template grounded in catalog)
  const draftFallbackRes = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}/ai-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ template: 'requisitos' })
  }), env, ctx);
  assert.equal(draftFallbackRes.status, 200);
  const fallbackDraft = await draftFallbackRes.json();
  assert.equal(fallbackDraft.ok, true);
  assert.equal(fallbackDraft.source, 'template');
  assert.match(fallbackDraft.subject, /Ciberseguridad/i);
  assert.match(fallbackDraft.body, /Hola Valeria Cedeño,/);
  assert.match(fallbackDraft.body, /Universidad Casa Grande/);
  assert.ok(fallbackDraft.recommendedAction);

  // POST /api/admin/crm/leads/:id/ai-draft (Anthropic mocked) + POST /nurture-email (Resend mocked)
  const sentEmails = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://api.anthropic.com/v1/messages') {
      return Response.json({
        content: [{
          type: 'text',
          text: JSON.stringify({
            subject: 'Seguimiento Maestría en Ciberseguridad · UCG',
            body: 'Hola Valeria,\n\nCon gusto le compartimos la ficha oficial de la Maestría en Ciberseguridad en modalidad en línea (2 semestres). La inversión y convocatoria vigente se confirman con Admisiones.\n\nCordialmente,\nAdmisiones Posgrados UCG',
            recommendedAction: 'Confirmar fecha de entrevista'
          })
        }]
      });
    }
    assert.equal(url, 'https://api.resend.com/emails');
    sentEmails.push(JSON.parse(options.body));
    return Response.json({ id: 'resend-manual-001' });
  });

  const aiEnv = { ...env, ANTHROPIC_API_KEY: 'test-anthropic-key', ANTHROPIC_MODEL: 'claude-haiku-5-5' };
  const draftAiRes = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}/ai-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ template: 'ficha' })
  }), aiEnv, ctx);
  assert.equal(draftAiRes.status, 200);
  const aiDraft = await draftAiRes.json();
  assert.equal(aiDraft.source, 'anthropic');
  assert.match(aiDraft.subject, /Ciberseguridad/);

  const sendEmailRes = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}/nurture-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      subject: aiDraft.subject,
      body: aiDraft.body,
      template: 'ficha',
      actor: 'Carolina'
    })
  }), env, ctx);
  assert.equal(sendEmailRes.status, 200);
  const emailOut = await sendEmailRes.json();
  assert.equal(emailOut.ok, true);
  assert.equal(emailOut.providerId, 'resend-manual-001');
  assert.equal(emailOut.job.status, 'accepted');
  assert.equal(sentEmails.length, 1);
  assert.deepEqual(sentEmails[0].to, ['valeria.cedeno@example.org']);

  // Phone-only lead cannot receive nurture-email (422)
  const phoneLeadId = 'phone-only-crm-test';
  const nowIso = new Date().toISOString();
  DB.raw.prepare("INSERT INTO leads(id,name,email,phone,program,source,created_at,updated_at,pref_token) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(phoneLeadId, 'Aspirante por teléfono', 'intake:phone:' + phoneLeadId, '+593991111111', '', 'Llamada entrante', nowIso, nowIso, 'a'.repeat(64));
  const rejectPhoneEmail = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${phoneLeadId}/nurture-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: 'Hola', body: 'Mensaje' })
  }), env, ctx);
  assert.equal(rejectPhoneEmail.status, 422);

  // Verify GET /api/admin/crm enriched stats, tasks, nurtureJobs
  const enrichedCrm = await (await handleHttpRequest(staffRequest(baseUrl + '/api/admin/crm'), env, ctx)).json();
  assert.equal(enrichedCrm.stats.totalLeads, 2);
  assert.equal(enrichedCrm.stats.stageCounts['En orientación'], 1);
  assert.equal(enrichedCrm.stats.stageCounts.Nuevo, 1);
  assert.equal(enrichedCrm.stats.recapEmailsSent, 1);
  assert.equal(enrichedCrm.stats.avgScore, 44);
  assert.ok(enrichedCrm.nurtureJobs.some(j => j.provider_id === 'resend-manual-001' && j.subject === aiDraft.subject));

  // DELETE /api/admin/crm/leads/:id deletes lead and dependent rows cleanly
  const delRes = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}`, {
    method: 'DELETE',
    headers: { Origin: origin }
  }), env, ctx);
  assert.equal(delRes.status, 200);
  assert.equal(delRes.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await delRes.json()).deleted, leadId);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM leads WHERE id=?').get(leadId).n, 0);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM tasks WHERE lead_id=?').get(leadId).n, 0);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM conversation_nurture_jobs WHERE lead_id=?').get(leadId).n, 0);

  // Deleting unknown lead returns 404
  const delMissing = await handleHttpRequest(staffRequest(baseUrl + `/api/admin/crm/leads/${leadId}`, {
    method: 'DELETE'
  }), env, ctx);
  assert.equal(delMissing.status, 404);
});

test('endpoints Admin SEO Analysis y Content Engine funcionan con CORS y persistencia en SQLite', async t => {
  // Explicitly verify against schema.sql + growth.sql + drizzle/0003_contenido_openseo.sql
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  raw.exec(readFileSync(new URL('../growth.sql', import.meta.url), 'utf8'));
  raw.exec(readFileSync(new URL('../drizzle/0003_contenido_openseo.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const bindValues = (values) => ({
        bind: (...args) => bindValues(args),
        first: () => raw.prepare(sql).get(...values) || null,
        all: () => ({ results: raw.prepare(sql).all(...values) }),
        run: () => {
          const q = raw.prepare(sql);
          return q.columns().length
            ? { results: q.all(...values), meta: { changes: q.all(...values).length } }
            : { results: [], meta: { changes: q.run(...values).changes } };
        }
      });
      return bindValues([]);
    },
    batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const res = statements.map(s => s.run());
        raw.exec('COMMIT');
        return res;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => raw.close()
  };
  t.after(() => DB.close());

  const env = {
    DB,
    PUBLIC_BASE_URL: PUBLIC_BASE_URL,
    ADMISSIONS_STAFF_TOKEN: STAFF_TOKEN
  };
  const ctx = { waitUntil(p) { Promise.resolve(p); } };
  const origin = 'https://slimetoad.github.io';
  const baseUrl = 'https://crm.example.up.railway.app';

  // 1. GET /api/admin/seo?days=30
  const seoRes = await handleHttpRequest(staffRequest(baseUrl + '/api/admin/seo?days=30', {
    headers: { Origin: origin }
  }), env, ctx);
  assert.equal(seoRes.status, 200);
  assert.equal(seoRes.headers.get('Access-Control-Allow-Origin'), origin);
  const seoData = await seoRes.json();
  assert.equal(seoData.ok, true);
  assert.equal(seoData.days, 30);
  assert.ok(seoData.rows.length >= programs.length);
  assert.ok(seoData.marketResearch.length >= programs.length);
  assert.ok(seoData.summary.totalMonthlyVolume > 0);
  assert.ok(seoData.summary.programsWithVolume > 0);
  assert.ok(seoData.summary.avgCpcUsd > 0);

  // Invalid days -> 400
  const badDays = await handleHttpRequest(staffRequest(baseUrl + '/api/admin/seo?days=15'), env, ctx);
  assert.equal(badDays.status, 400);

  // 2. POST /api/admin/seo/analyze
  const iaId = 'programa:maestria-en-ia-y-ciencia-de-datos';
  const analyzeRes = await handleHttpRequest(staffRequest(baseUrl + '/api/admin/seo/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ days: 30, ids: [iaId], question: '¿Qué demanda tiene la maestría en inteligencia artificial?' })
  }), env, ctx);
  assert.equal(analyzeRes.status, 200);
  assert.equal(analyzeRes.headers.get('Access-Control-Allow-Origin'), origin);
  const analyzed = await analyzeRes.json();
  assert.equal(analyzed.ok, true);
  assert.ok(Array.isArray(analyzed.findings) && analyzed.findings.length >= 1);
  assert.ok(analyzed.findings[0].references.some(r => r.id === iaId));

  // 3. Cross-origin POST /api/editorial/insights
  const insightsCorsRes = await handleHttpRequest(new Request(baseUrl + '/api/editorial/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify({ days: 30, ids: [iaId], question: '¿Cuál es el volumen de búsqueda?' })
  }), env, ctx);
  assert.equal(insightsCorsRes.status, 200);
  assert.equal(insightsCorsRes.headers.get('Access-Control-Allow-Origin'), origin);

  // 4. GET /api/admin/content
  const contentRes = await handleHttpRequest(staffRequest(baseUrl + '/api/admin/content', {
    headers: { Origin: origin }
  }), env, ctx);
  assert.equal(contentRes.status, 200);
  assert.equal(contentRes.headers.get('Access-Control-Allow-Origin'), origin);
  const contentData = await contentRes.json();
  assert.equal(contentData.ok, true);
  assert.equal(contentData.plan.length, programs.length);
  assert.equal(contentData.stats.plannedPrograms, programs.length);
  assert.equal(contentData.stats.publishedGuides, 0);

  // 5. POST /api/admin/content/draft (template fallback)
  const draftRes = await handleHttpRequest(staffRequest(baseUrl + '/api/admin/content/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      programSlug: 'maestria-en-ia-y-ciencia-de-datos',
      keyword: 'maestría en inteligencia artificial',
      customAngle: 'Enfoque práctico para profesionales en Ecuador'
    })
  }), env, ctx);
  assert.equal(draftRes.status, 200);
  assert.equal(draftRes.headers.get('Access-Control-Allow-Origin'), origin);
  const draftJson = await draftRes.json();
  assert.equal(draftJson.ok, true);
  assert.equal(draftJson.source, 'template');
  assert.equal(draftJson.article.status, 'draft');
  assert.equal(draftJson.article.program, 'maestria-en-ia-y-ciencia-de-datos');
  assert.ok(draftJson.article.body.length > 100);

  // Unpublished draft slug must return 404 on /guias/:slug
  const draftGuideRes = await handleHttpRequest(new Request(baseUrl + `/guias/${draftJson.article.slug}`), env, ctx);
  assert.equal(draftGuideRes.status, 404);

  // 6. POST /api/admin/content/publish
  const publishRes = await handleHttpRequest(staffRequest(baseUrl + '/api/admin/content/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      id: draftJson.article.id,
      programSlug: 'maestria-en-ia-y-ciencia-de-datos',
      slug: draftJson.article.slug,
      title: 'Guía oficial: Maestría en IA y Ciencia de Datos UCG',
      summary: 'Conoce la modalidad en línea, duración y enfoque de la Maestría en IA de la Universidad Casa Grande.',
      body: draftJson.article.body + '\n\n## Conclusión\n\nActualizado desde Content Engine.',
      status: 'published'
    })
  }), env, ctx);
  assert.equal(publishRes.status, 200);
  assert.equal(publishRes.headers.get('Access-Control-Allow-Origin'), origin);
  const pubJson = await publishRes.json();
  assert.equal(pubJson.ok, true);
  assert.equal(pubJson.article.status, 'published');
  assert.ok(pubJson.article.publishedAt);
  const expectedGuideUrl = `${baseUrl}/guias/${draftJson.article.slug}`;
  assert.equal(pubJson.publishedUrl, expectedGuideUrl);
  assert.equal(pubJson.article.publishedUrl, expectedGuideUrl);
  assert.equal(pubJson.seoChecklist.indexable, true);
  assert.equal(pubJson.seoChecklist.hasCanonical, true);
  assert.equal(pubJson.seoChecklist.hasStructuredData, true);
  assert.equal(pubJson.seoChecklist.hasOpenGraph, true);
  assert.ok(pubJson.seoChecklist.wordCount > 0);
  assert.ok(pubJson.seoChecklist.headingsCount >= 1);

  // 7. Re-read GET /api/admin/content & GET /api/admin/seo to confirm publishedUrl & published guide
  const contentAfter = await (await handleHttpRequest(staffRequest(baseUrl + '/api/admin/content'), env, ctx)).json();
  assert.equal(contentAfter.stats.publishedGuides, 1);
  assert.ok(contentAfter.stats.coveredVolume >= 720);
  const iaPlan = contentAfter.plan.find(p => p.program === 'maestria-en-ia-y-ciencia-de-datos');
  assert.equal(iaPlan.status, 'published');
  assert.equal(iaPlan.title, 'Guía oficial: Maestría en IA y Ciencia de Datos UCG');
  assert.equal(iaPlan.publishedUrl, expectedGuideUrl);
  assert.equal(contentAfter.articles.find(a => a.id === draftJson.article.id)?.publishedUrl, expectedGuideUrl);

  // 7b. Verify SEO-optimized public /guias/:slug, /guias, /sitemap.xml, and /robots.txt
  const guideRes = await handleHttpRequest(new Request(expectedGuideUrl), env, ctx);
  assert.equal(guideRes.status, 200);
  assert.equal(guideRes.headers.get('X-Robots-Tag'), null);
  const guideHtml = await guideRes.text();
  assert.match(guideHtml, /<meta name="robots" content="index, follow/);
  assert.match(guideHtml, new RegExp(`<link rel="canonical" href="${expectedGuideUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  assert.match(guideHtml, /<meta property="og:type" content="article">/);
  assert.match(guideHtml, /"@type":"Article"/);
  assert.match(guideHtml, /"@type":"BreadcrumbList"/);
  assert.match(guideHtml, /"@type":"Course"/);
  assert.match(guideHtml, /<h1[^>]*>Guía oficial: Maestría en IA y Ciencia de Datos UCG<\/h1>/);
  assert.match(guideHtml, /<h2 id="sec-/);

  const indexRes = await handleHttpRequest(new Request(baseUrl + '/guias'), env, ctx);
  assert.equal(indexRes.status, 200);
  assert.equal(indexRes.headers.get('X-Robots-Tag'), null);
  const indexHtml = await indexRes.text();
  assert.match(indexHtml, /<meta name="robots" content="index, follow/);
  assert.ok(indexHtml.includes(expectedGuideUrl));

  const sitemapRes = await handleHttpRequest(new Request(baseUrl + '/sitemap.xml'), env, ctx);
  assert.equal(sitemapRes.status, 200);
  const sitemapXml = await sitemapRes.text();
  assert.ok(sitemapXml.includes(`<loc>${baseUrl}/guias</loc>`));
  assert.ok(sitemapXml.includes(`<loc>${expectedGuideUrl}</loc>`));

  const robotsRes = await handleHttpRequest(new Request(baseUrl + '/robots.txt'), env, ctx);
  assert.equal(robotsRes.status, 200);
  const robotsTxt = await robotsRes.text();
  assert.match(robotsTxt, /Allow: \/guias/);
  assert.ok(robotsTxt.includes(`Sitemap: ${baseUrl}/sitemap.xml`));

  const seoAfter = await (await handleHttpRequest(staffRequest(baseUrl + '/api/admin/seo?days=30'), env, ctx)).json();
  assert.equal(seoAfter.summary.publishedGuides, 1);
  assert.ok(seoAfter.rows.some(r => r.kind === 'guia' && r.program === 'maestria-en-ia-y-ciencia-de-datos'));

  // 8. POST /api/admin/content/draft with Anthropic mocked
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    return Response.json({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: 'Maestría en Ciberseguridad UCG: Plan y Modalidad',
          summary: 'Explora la modalidad en línea y duración de 2 semestres de la Maestría en Ciberseguridad de Universidad Casa Grande.',
          body: 'La Maestría en Ciberseguridad de la Universidad Casa Grande prepara profesionales en Ecuador para gestionar riesgos digitales, defensa de redes y análisis forense en modalidad en línea durante dos semestres.\n\nRevisa la ficha institucional para conocer el detalle de asignaturas y confirma con Admisiones la convocatoria vigente.'
        })
      }]
    });
  });
  const aiDraftRes = await handleHttpRequest(staffRequest(baseUrl + '/api/admin/content/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ programSlug: 'maestria-en-ciberseguridad' })
  }), { ...env, ANTHROPIC_API_KEY: 'test-anthropic-key', ANTHROPIC_MODEL: 'claude-haiku-5-5' }, ctx);
  assert.equal(aiDraftRes.status, 200);
  const aiDraftJson = await aiDraftRes.json();
  assert.equal(aiDraftJson.source, 'anthropic');
  assert.match(aiDraftJson.article.title, /Ciberseguridad/);
});

test('webhook de Retell acepta payloads >140 KB (llamadas largas) y despacha expediente y recap', async t => {
  const { env, DB, ctx, waits } = makeEnv(':memory:');
  t.after(() => DB.close());

  const sentEmails = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    sentEmails.push(JSON.parse(options.body));
    return Response.json({ id: 'resend-long-call-001' });
  });

  // Pad transcript_object well beyond 140 KB (exceeding the previous 128 KB portal cap)
  const filler = 'Conversación detallada sobre malla curricular, horarios de tutorías y proceso de admisión en Ecuador. '.repeat(15);
  const longTurns = Array.from({ length: 100 }, (_, i) => ({
    role: i % 2 === 0 ? 'agent' : 'user',
    content: `Turno ${i + 1}: ${filler}`
  }));

  const call = {
    call_id: 'call_long_retell_140kb',
    call_type: 'phone_call',
    direction: 'inbound',
    call_status: 'ended',
    agent_id: AGENT_ID,
    from_number: '+13017925323',
    to_number: INBOUND_NUMBER,
    end_timestamp: Date.now(),
    transcript_object: longTurns,
    call_analysis: {
      in_voicemail: false,
      custom_analysis_data: {
        applicant_name: 'Guillermo Moncayo',
        applicant_email: 'guille.test@example.org',
        email_confirmed_by_spelling: true,
        applicant_phone: '+13017925323',
        phone_confirmed_by_readback: true,
        program_slug: 'maestria-en-administracion-publica',
        program_interest: 'Maestría en Administración Pública',
        city: 'Quito',
        preferred_modality: 'En línea',
        start_horizon: 'Próxima cohorte',
        call_summary_es: 'Guillermo Moncayo llamó interesado en la Maestría en Administración Pública en modalidad en línea.',
        consent_email: true,
        human_callback: false,
        opt_out: false
      }
    }
  };

  const body = JSON.stringify({ event: 'call_analyzed', call });
  const byteLength = Buffer.byteLength(body, 'utf8');
  assert.ok(byteLength > 140000, `Expected payload > 140 KB, got ${byteLength}`);

  const ts = String(Date.now());
  const sig = createHmac('sha256', RETELL_API_KEY).update(body + ts).digest('hex');
  const req = new Request('https://crm.example.up.railway.app/api/webhooks/retell', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(byteLength),
      'X-Retell-Signature': `v=${ts},d=${sig}`
    },
    body
  });

  const res = await handleHttpRequest(req, env, ctx);
  assert.equal(res.status, 204);
  assert.equal(waits.length, 1);
  await Promise.all(waits);

  const lead = DB.raw.prepare("SELECT * FROM leads WHERE email='guille.test@example.org'").get();
  assert.ok(lead);
  assert.equal(lead.name, 'Guillermo Moncayo');
  assert.equal(lead.program, 'maestria-en-administracion-publica');
  assert.equal(lead.consent_email, 1);

  const job = DB.raw.prepare('SELECT status, provider_id FROM conversation_nurture_jobs WHERE lead_id=?').get(lead.id);
  assert.equal(job.status, 'accepted');
  assert.equal(job.provider_id, 'resend-long-call-001');
  assert.equal(sentEmails.length, 1);
  assert.match(sentEmails[0].text, /Hola Guillermo Moncayo,/);
});



