const first = (db,sql,...values) => db.prepare(sql).bind(...values).first();
const stmt = (db,sql,...values) => db.prepare(sql).bind(...values);
const replyTask = 'Responder al correo del aspirante';
const providerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function replyDomain(env) {
  const value = typeof env.RESEND_REPLY_DOMAIN === 'string' ? env.RESEND_REPLY_DOMAIN.trim().toLowerCase() : '';
  return value.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) ? value : null;
}
export async function recruitmentReplyTo(env,lead) {
  const domain = replyDomain(env);
  if (!domain || !env.DB || !lead?.id) return undefined;
  const route = await first(env.DB,'SELECT token FROM admissions_reply_routes WHERE lead_id=?',lead.id);
  if (route) return 'adm-' + route.token + '@' + domain;
  const token = crypto.randomUUID().replaceAll('-','');
  const [,result] = await env.DB.batch([
    stmt(env.DB,'INSERT INTO admissions_reply_routes(lead_id,token) SELECT id,? FROM leads WHERE id=? ON CONFLICT(lead_id) DO NOTHING',token,lead.id),
    stmt(env.DB,'SELECT token FROM admissions_reply_routes WHERE lead_id=?',lead.id)
  ]);
  const found = result.results[0];
  return found ? 'adm-' + found.token + '@' + domain : undefined;
}
function mailbox(value) {
  if (typeof value !== 'string' || value.length>512 || /[\r\n]/.test(value)) return '';
  const text = value.trim().toLowerCase();
  const bracketed = text.match(/^[^<>@]*<([^<>]+)>$/);
  const address = bracketed ? bracketed[1] : text;
  return /^[^<>@\s,;]+@[^<>@\s,;]+\.[^<>@\s,;]+$/.test(address) ? address : '';
}
function plain(s,limit) {
  return typeof s==='string' ? s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit) : '';
}
function fromHtml(value) {
  return typeof value!=='string' ? '' : value.slice(0,90000)
    .replace(/<(script|style|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ').replace(/<(?:br\b[^>]*|\/(?:p|div|li))>/gi,'\n').replace(/<[^>]{0,1200}>/g,' ')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi,(_,key)=>({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'"}[key.toLowerCase()]));
}
function excerpt(email) {
  const raw = typeof email.text === 'string' && email.text.trim() ? email.text.slice(0,90000) : fromHtml(email.html);
  const current = [];
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*(?:>|-{2,}\s*(?:Original Message|Mensaje original|Forwarded message|Mensaje reenviado)|On .{1,400} wrote:\s*$|El .{1,400} escribi[oó]:\s*$|--\s*$)/i.test(line)) break;
    current.push(line);
    if (current.length>35) break;
  }
  return plain(current.join(' '),560);
}
function autoMessage(subject,headers = {}) {
  if (/^\s*(auto(?:matic)?[ -]?(?:reply|response)|out of office|respuesta autom[áa]tica|fuera de (?:la )?oficina|undeliverable|delivery status notification)\b/i.test(subject)) return true;
  const normalized = Object.fromEntries(Object.entries(headers||{}).map(([key,v])=>[key.toLowerCase(),String(v).toLowerCase()]));
  return Boolean((normalized['auto-submitted'] && normalized['auto-submitted'] !== 'no') || /bulk|list|junk/.test(normalized.precedence || '') || normalized['x-autoreply'] || normalized['x-autorespond']);
}
async function incomingBody(apiKey,id) {
  const response = await fetch('https://api.resend.com/emails/receiving/'+id,{
    headers:{authorization:'Bearer '+apiKey,accept:'application/json'},signal:AbortSignal.timeout(6500),redirect:'error'
  });
  if (!response.ok) {
    if (response.status===429 || response.status===404 || response.status>=500) throw new Error('Recepción de correo temporalmente no disponible');
    return {bodyStatus:'solo_asunto',excerpt:''};
  }
  const reader = response.body?.getReader();
  if (!reader) return {bodyStatus:'solo_asunto',excerpt:''};
  const chunks=[]; let size=0;
  while (true) {
    const {value,done}=await reader.read(); if (done) break;
    size+=value.byteLength;
    if (size>512*1024) { await reader.cancel();return {bodyStatus:'solo_asunto',excerpt:''}; }
    chunks.push(value);
  }
  const payload=JSON.parse(await new Blob(chunks).text());
  if (payload.id !== id) return {bodyStatus:'solo_asunto',excerpt:''};
  const content=excerpt(payload);
  return {bodyStatus:content?'extracto':'solo_asunto',excerpt:content,auto:autoMessage(payload.subject||'',payload.headers)};
}
const describe = (subject,text) => 'Respuesta por correo · ' + (subject || 'Sin asunto') + (text?' — '+text:'') + '.';
/** Accept only events already authenticated against the original signed webhook bytes. */
export async function captureInboundReply(env,event) {
  const domain = replyDomain(env);
  if (!domain || event?.type !== 'email.received') return {ok:true};
  const data=event.data||{}, sender=mailbox(data.from), id=data.email_id;
  if (!sender || !providerIdPattern.test(id||'') || autoMessage(data.subject||'')) return {ok:true};
  const recipients=Array.isArray(data.received_for) && data.received_for.length ? data.received_for : data.to;
  if (!Array.isArray(recipients) || recipients.length>50) return {ok:true};
  const tokens=new Set();
  for (const value of recipients) {
    const [address,host]=mailbox(value).split('@');
    const m=host===domain && /^adm-([a-f0-9]{32})$/.exec(address);
    if (m) tokens.add(m[1]);
  }
  if (tokens.size!==1) return {ok:true};
  const db=env.DB;
  const known=await first(db,'SELECT l.id FROM leads l JOIN admissions_reply_routes r ON r.lead_id=l.id WHERE r.token=? AND l.email=? COLLATE NOCASE',[...tokens][0],sender);
  if (!known) return {ok:true};
  const previous=await first(db,'SELECT body_status FROM admissions_replies WHERE provider_id=? AND lead_id=?',id,known.id);
  if (previous && previous.body_status!=='pendiente') return {ok:true};
  let body={bodyStatus:'solo_asunto',excerpt:''}, retry=false;
  const apiKey=env.RESEND_RECEIVING_API_KEY || env.RESEND_API_KEY;
  if (apiKey) {
    try { body=await incomingBody(apiKey,id); }
    catch { body={bodyStatus:'pendiente',excerpt:''}; retry=true; }
  }
  if (body.auto) {
    if (previous) await stmt(db,"UPDATE admissions_replies SET body_status='automática' WHERE provider_id=? AND lead_id=?",id,known.id).run();
    return {ok:true};
  }
  const subject=plain(fromHtml(data.subject||''),160),now=new Date().toISOString(), due=new Date(Date.now()+4*3600000).toISOString();
  const receipt=crypto.randomUUID(), desc=describe(subject,body.excerpt);
  const inserted=' EXISTS (SELECT 1 FROM admissions_replies WHERE receipt_id=? AND lead_id=?)';
  const active=" AND EXISTS (SELECT 1 FROM leads WHERE id=? AND stage NOT IN ('Cerrado','Matriculado'))";
  const sql=[
    stmt(db,'INSERT INTO admissions_replies(provider_id,receipt_id,lead_id,subject,excerpt,body_status,received_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO NOTHING',id,receipt,known.id,subject,body.excerpt,body.bodyStatus,now),
    stmt(db,"INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,?,'correo recibido',?,?,'Aspirante' WHERE"+inserted,receipt,known.id,desc,now,receipt,known.id),
    stmt(db,"INSERT INTO tasks(id,lead_id,title,status,due_at,created_at) SELECT ?,?,?,'pendiente',?,? WHERE"+inserted+active+" AND NOT EXISTS (SELECT 1 FROM tasks WHERE lead_id=? AND title=? AND status='pendiente')",crypto.randomUUID(),known.id,replyTask,due,now,receipt,known.id,known.id,known.id,replyTask),
    stmt(db,"UPDATE leads SET paused=1, next_action=?,due_at=COALESCE((SELECT MIN(due_at) FROM tasks WHERE lead_id=? AND title=? AND status='pendiente'),?),updated_at=?,revision=revision+1 WHERE id=? AND stage NOT IN ('Cerrado','Matriculado') AND"+inserted,replyTask,known.id,replyTask,due,now,known.id,receipt,known.id),
    stmt(db,"UPDATE jobs SET status='skipped',last_error='El aspirante respondió',updated_at=? WHERE lead_id=? AND status='pending' AND"+inserted,now,known.id,receipt,known.id)
  ];
  if (body.bodyStatus!=='pendiente') {
    sql.push(stmt(db,'UPDATE events SET description=? WHERE id=(SELECT receipt_id FROM admissions_replies WHERE provider_id=? AND lead_id=? AND body_status=\'pendiente\')',desc,id,known.id));
    sql.push(stmt(db,"UPDATE admissions_replies SET excerpt=?,body_status=? WHERE provider_id=? AND lead_id=? AND body_status='pendiente'",body.excerpt,body.bodyStatus,id,known.id));
  }
  await db.batch(sql);
  if (retry) throw new Error('Reintentar la lectura del correo recibido');
  return {ok:true};
}
