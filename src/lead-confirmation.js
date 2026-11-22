const encoder = new TextEncoder();
const domain = 'ucg-posgrados:lead-confirmation:v1';
const validity = 60 * 24 * 60 * 60;
const horizons = ['Próxima convocatoria', 'En seis a doce meses', 'Más adelante', 'Estoy explorando'];
const initialStages = new Set(['Nuevo', 'En orientación']);
const idPattern = /^[\w-]{1,80}$/;
const secretPattern = /^[a-f0-9]{64}$/i;
const escape = value => String(value ?? '').replace(/[&<>"']/g, key => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[key]));
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const hmacKey = secret => crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
const toHex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
const message = (id, expiry) => encoder.encode(domain + '\n' + id + '\n' + expiry);

export async function leadConfirmationUrl(origin, lead, issuedAt) {
  if (!idPattern.test(lead.id) || !secretPattern.test(lead.pref_token)) return '';
  const expiry = Math.floor(Date.parse(issuedAt) / 1000) + validity;
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() / 1000) return '';
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(lead.pref_token), message(lead.id, expiry));
  return origin + '/confirmar/' + [lead.id,expiry,toHex(signature)].join('.');
}

const leadById = (db, id) => stmt(db, 'SELECT id,program,context,pref_token,revision,stage FROM leads WHERE id=?', id).first();
async function authenticate(db, token) {
  const parts = token.match(/^([\w-]{1,80})\.(\d{1,12})\.([a-f0-9]{64})$/);
  if (!parts || Number(parts[2]) <= Date.now() / 1000) return null;
  const [,id,expiry,signature] = parts;
  const lead = await leadById(db,id);
  if (!lead || !secretPattern.test(lead.pref_token)) return null;
  const bytes = Uint8Array.from(signature.match(/../g), chunk => Number.parseInt(chunk,16));
  return await crypto.subtle.verify('HMAC',await hmacKey(lead.pref_token),bytes,message(id,expiry)) ? lead : null;
}

function contextFor(lead) {
  try {
    const context = JSON.parse(lead.context);
    if (context && typeof context === 'object' && !Array.isArray(context)) return context;
  } catch { /* Older records can omit structured context. */ }
  return {};
}

const privateHeaders = {
  'Content-Type':'text/html; charset=utf-8',
  'Cache-Control':'private, no-store',
  'Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow'
};
function page(title, content, status = 200) {
  return new Response(`<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} · Posgrados</title><link rel="stylesheet" href="/student.css"><link rel="stylesheet" href="/confirmacion.css"></head><body class="confirmation-page"><main class="confirm-wrap"><a class="confirm-brand" href="/"><img src="/media/ucg-logo.png" alt="Universidad Casa Grande" width="500" height="158"></a><p class="confirm-overline">Orientación de posgrados</p><h1>${escape(title)}</h1>${content}</main></body></html>`,{status,headers:privateHeaders});
}
function formPage(programs,lead,action,warning='',status=200) {
  const selected = programs.find(p=>p.slug===lead.program)?.slug ?? '';
  const saved = contextFor(lead);
  const horizon = saved.timeframe ?? saved.quizTimeline ?? saved.timeline;
  const option = (value,label,current) => `<option value="${escape(value)}"${current===value ? ' selected' : ''}>${escape(label)}</option>`;
  return page('Confirma tu interés', `<p>Revisa la maestría que te interesa y cuándo te gustaría empezar. Puedes corregir ambos datos antes de confirmar.</p>
    ${warning ? `<p class="confirm-notice" role="alert">${escape(warning)}</p>` : ''}
    <form action="${escape(action)}" method="post">
      <input type="hidden" name="revision" value="${escape(lead.revision)}">
      <label>Maestría de interés<select name="program">${option('','Quiero orientación para elegir',selected)}${programs.map(p=>option(p.slug,p.title,selected)).join('')}</select></label>
      <label>¿Cuándo te gustaría empezar?<select name="timeframe">${option('','Por definir',horizon ?? '')}${horizons.map(value=>option(value,value,horizon)).join('')}</select></label>
      <button type="submit" class="btn btn-primary">Confirmar mi interés</button>
    </form>`,status);
}
function assistance(title, description, href, label, status = 200) {
  return page(title,`<p>${escape(description)}</p><a class="btn btn-outline" href="${escape(href)}">${escape(label)}</a>`,status);
}
function success() {
  return assistance('Interés confirmado','El equipo de orientación podrá consultar lo que elegiste. Si quieres conversar, puedes solicitar una cita.','/cita','Ir a la agenda');
}

async function submittedForm(request) {
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type') || '') ||
    Number(request.headers.get('content-length')) > 4096) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value,{stream:true});
  }
  const params = new URLSearchParams(text + decoder.decode());
  for (const name of ['program','timeframe','revision']) if (params.getAll(name).length !== 1) return null;
  return params;
}

export async function handleLeadConfirmation(request, env, url, programs) {
  const token = url.pathname.match(/^\/confirmar\/([\w.-]+)\/?$/)?.[1] ?? '';
  const unavailable = () => assistance('Enlace no disponible','Puedes pedir orientación para revisar el programa que te interesa.','/solicitar','Solicitar información',404);
  if (!['GET','POST'].includes(request.method)) return new Response(null,{status:405,headers:{...privateHeaders,Allow:'GET, POST'}});
  if (!env.DB) return assistance('Servicio temporalmente no disponible','Vuelve a abrir tu enlace en unos minutos.','/','Ir a posgrados',503);
  const db = env.DB;
  const lead = await authenticate(db,token);
  if (!lead) return unavailable();
  const action = '/confirmar/' + token;
  const eventId = 'confirmacion-' + lead.id;
  const confirmed = () => stmt(db,"SELECT id FROM events WHERE id=? AND lead_id=? AND type='confirmacion_interes'",eventId,lead.id).first();
  if (await confirmed()) return success();
  const advanced = () => assistance('Tu consulta está en seguimiento','Puedes conversar con el equipo de orientación para actualizar tu interés.','/cita','Ir a la agenda');
  if (!initialStages.has(lead.stage)) return advanced();
  if (request.method === 'GET') return formPage(programs,lead,action);
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== url.origin)) {
    return assistance('Origen no permitido','Abre de nuevo el enlace privado que recibiste.','/','Ir a posgrados',403);
  }
  const form = await submittedForm(request);
  if (!form) return formPage(programs,lead,action,'Revisa el formulario y vuelve a confirmar.',400);
  const program = form.get('program');
  const timeframe = form.get('timeframe');
  if ((program && !programs.some(p=>p.slug===program)) || (timeframe && !horizons.includes(timeframe))) {
    return formPage(programs,lead,action,'Selecciona una maestría y un horizonte del formulario.',422);
  }
  const conflict = 'El equipo actualizó tu caso mientras revisabas el formulario. Confirma los datos vigentes.';
  if (form.get('revision') !== String(lead.revision)) return formPage(programs,lead,action,conflict,409);
  const context = {...contextFor(lead),timeframe};
  const title = slug => programs.find(p=>p.slug===slug)?.title || 'Programa por definir';
  const audit = program === lead.program
    ? 'Confirmó su interés en ' + title(program) + '.'
    : 'Corrigió el programa de «' + title(lead.program) + '» a «' + title(program) + '».';
  const description = audit + (timeframe ? ' Indicó que quiere comenzar en el horizonte «' + timeframe + '».' : ' Dejó por definir su fecha de inicio.');
  const time = new Date().toISOString();
  const mutation = crypto.randomUUID();
  await db.batch([
    stmt(db,`UPDATE leads SET program=?,context=?,revision=revision+1,mutation_id=?,updated_at=?
      WHERE id=? AND pref_token=? AND revision=? AND stage IN ('Nuevo','En orientación') AND NOT EXISTS (SELECT 1 FROM events WHERE id=?)`,
      program,JSON.stringify(context),mutation,time,lead.id,lead.pref_token,lead.revision,eventId),
    stmt(db,`INSERT INTO events(id,lead_id,type,description,created_at,actor)
      SELECT ?,id,'confirmacion_interes',?,?,'Aspirante' FROM leads WHERE id=? AND mutation_id=?`,
      eventId,description,time,lead.id,mutation)
  ]);
  if (await confirmed()) return success();
  const latest = await leadById(db,lead.id);
  if (!latest || latest.pref_token !== lead.pref_token) return unavailable();
  return initialStages.has(latest.stage) ? formPage(programs,latest,action,conflict,409) : advanced();
}
