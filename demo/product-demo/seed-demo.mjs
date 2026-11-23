// Seeds a LOCAL server with fictitious applicants for recording the film.
// Calls arrive as signed Retell `call_analyzed` webhooks (as tests/retell-lead-recap.test.mjs does),
// web leads through POST /api/leads. Never point this at production.
//
//   RETELL_API_KEY=local-demo-key RETELL_INBOUND_NUMBER=+19124915544 RETELL_INBOUND_AGENT_ID=agent_local_demo \
//     SQLITE_PATH=/tmp/demo.sqlite PORT=3000 node server/index.mjs
//   node demo/product-demo/seed-demo.mjs
import { createHmac, randomUUID } from 'node:crypto';

const API = process.env.API || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(API)) throw new Error('seed-demo only runs against a local server');
const KEY = process.env.RETELL_API_KEY || 'local-demo-key';
const NUMBER = process.env.RETELL_INBOUND_NUMBER || '+19124915544';
const AGENT = process.env.RETELL_INBOUND_AGENT_ID || 'agent_local_demo';
const ORIGIN = 'http://localhost:8080';

const calls = [
  ['Camila Ortega Vélez', 'camila.ortega@example.com', '0990000101', 'maestria-en-administracion-de-empresas', 'MBA · Administración de Empresas', 'Guayaquil', 'Ingeniera Comercial', 'Horario compatible con su trabajo y formas de pago', 'Presupuesto', true],
  ['Diego Salazar Andrade', 'diego.salazar@example.com', '0990000102', 'maestria-en-ia-y-ciencia-de-datos', 'Inteligencia Artificial y Analítica de Datos', 'Quito', 'Ingeniero en Sistemas', 'Malla curricular y proyectos aplicados', 'Ninguno', false],
  ['Andrés Molina Cárdenas', 'andres.molina@example.com', '0990000103', 'maestria-en-ciberseguridad', 'Ciberseguridad', 'Cuenca', 'Ingeniero en Telecomunicaciones', 'Requisitos de admisión y duración', 'Tiempo disponible', false],
  ['Lucía Herrera Paz', 'lucia.herrera@example.com', '0990000104', 'maestria-en-marketing-estrategico', 'Marketing Estratégico', 'Manta', 'Licenciada en Publicidad', 'Modalidad en línea y próxima convocatoria', 'Ninguno', false],
  ['Gabriela Torres Rivas', 'gabriela.torres@example.com', '0990000105', 'educacion-inclusiva', 'Educación Inclusiva', 'Ambato', 'Licenciada en Educación Básica', 'Financiamiento y fechas de inicio', 'Presupuesto', true],
  ['Mateo Vásquez León', 'mateo.vasquez@example.com', '0990000106', 'maestria-en-derecho-digital', 'Derecho Digital', 'Loja', 'Abogado', 'Contenido de la malla y titulación', 'Ninguno', false],
];

async function sendCall([name, email, phone, slug, program, city, background, questions, obstacles, callback], i) {
  const call = {
    call_id: `call_local_demo_${i + 1}`, call_type: 'phone_call', direction: 'inbound', call_status: 'ended',
    agent_id: AGENT, agent_version: 1, from_number: '+5939' + phone.slice(2), to_number: NUMBER, end_timestamp: Date.now() - (6 - i) * 3600e3,
    transcript_object: [],
    call_analysis: { in_voicemail: false, call_summary: '', custom_analysis_data: {
      applicant_name: name, applicant_email: email, email_confirmed_by_spelling: true,
      applicant_phone: phone, phone_confirmed_by_readback: true, program_slug: slug, program_interest: program,
      city, preferred_modality: 'En línea', start_horizon: 'Próxima cohorte', academic_background: background,
      key_questions: questions, obstacles,
      call_summary_es: `${name} llamó desde ${city} interesado/a en ${program}. Consultó: ${questions.toLowerCase()}.`,
      consent_email: true, human_callback: callback, opt_out: false } } };
  const body = JSON.stringify({ event: 'call_analyzed', call });
  const ts = String(Date.now());
  const sig = createHmac('sha256', KEY).update(body + ts).digest('hex');
  const res = await fetch(API + '/api/webhooks/retell', { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'X-Retell-Signature': `v=${ts},d=${sig}` } });
  console.log('call', name, res.status);
}

const forms = [
  ['Paula Jiménez Castro', 'paula.jimenez@example.com', '0990000107', 'gestion-de-proyectos', 'Guayaquil', 'Este año'],
  ['Sebastián Ruiz Mora', 'sebastian.ruiz@example.com', '0990000108', 'gerencia-en-servicios-de-la-salud', 'Quito', 'Próximo semestre'],
];

for (const [i, c] of calls.entries()) await sendCall(c, i);
for (const [name, email, phone, program, ciudad, horizonte] of forms) {
  const res = await fetch(API + '/api/leads', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), Origin: ORIGIN },
    body: JSON.stringify({ name, email, phone, program, source: 'Formulario web', consentEmail: true, consentVoice: true,
      context: { origen: 'portal-github-pages', ciudad, horizonte, consulta: 'Quisiera conocer requisitos y costos.' } }) });
  console.log('form', name, res.status);
}

await new Promise(r => setTimeout(r, 1500));
const crm = await (await fetch(API + '/api/public/crm', { headers: { Origin: ORIGIN } })).json();
const byName = Object.fromEntries((crm.leads || []).map(l => [l.name, l]));
const moves = { 'Diego Salazar Andrade': 'En orientación', 'Andrés Molina Cárdenas': 'En orientación', 'Lucía Herrera Paz': 'En postulación', 'Paula Jiménez Castro': 'En orientación' };
for (const [name, stage] of Object.entries(moves)) {
  const lead = byName[name];
  if (!lead) { console.log('missing', name); continue; }
  const res = await fetch(`${API}/api/public/crm/leads/${lead.id}`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ stage }) });
  console.log('stage', name, stage, res.status);
}
console.log('leads', (crm.leads || []).length, 'tasks', (crm.tasks || []).length);
