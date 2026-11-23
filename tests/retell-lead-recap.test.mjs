import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSqliteD1, applyMigrations } from '../server/d1-sqlite.mjs';
import { handleHttpRequest } from '../server/index.mjs';
import { makeCallRecapDraft, previewNurturePlan } from '../src/conversation-nurture.js';
import { programs } from '../src/catalog.js';

const RETELL_API_KEY = 'retell-test-signing-key';
const INBOUND_NUMBER = '+17875550199';
const AGENT_ID = 'agent_ucg_posgrados_ec';
const PUBLIC_BASE_URL = 'https://slimetoad.github.io/Casagrande';

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

  // Verify /api/health and /api/public/crm responses
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

  const crmRes = await handleHttpRequest(new Request('https://crm.example.up.railway.app/api/public/crm'), env, ctx);
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
