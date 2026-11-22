import {prepareCapture} from './admissions.js'
import {json} from './observability.js'
const lengths = new Set([15,20,30,45,60])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const clean = (x,len) => typeof x==='string' ? x.trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,len) : ''
const stmt = (db,sql,...values) => db.prepare(sql).bind(...values)
const nowISO = () => new Date().toISOString()
const earliest = () => new Date(Date.now()+15*60000).toISOString()
const bad = (message,status) => json({error:message},status)
const byId = 'SELECT a.id,a.slot_id AS slotId,a.status,a.program,a.preference,s.start_at AS startAt,s.end_at AS endAt,s.advisor FROM admissions_appointments a LEFT JOIN admissions_slots s ON a.slot_id=s.id'
const free = "s.cancelled_at IS NULL AND s.start_at>=? AND NOT EXISTS (SELECT 1 FROM admissions_appointments a WHERE a.slot_id=s.id AND a.status IN ('booked','completed','no_show'))"
function campaignContext(input, headers) {
  if (headers.get('Sec-GPC') === '1' || ['1','yes'].includes(headers.get('DNT')) ||
    !input || typeof input !== 'object' || Array.isArray(input)) return {}
  const campaign = {}
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
    const value = clean(input[key],100).trim()
    if (value) campaign[key] = value
  }
  return campaign
}
function publicSummary(a) {
  return {calendarId:a.id,status:a.status,startAt:a.startAt,endAt:a.endAt,advisor:a.advisor,program:a.program,preference:a.preference}
}
async function hash(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||'')) throw new BookingError('Utiliza un formulario válido.',415)
  const reader=req.body?.getReader()
  if(!reader) throw new BookingError('Faltan los datos de la solicitud.',400)
  let bytes=0,parts=[]
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8192){await reader.cancel();throw new BookingError('La solicitud es demasiado extensa.',413)}parts.push(value)}
  let input
  try {input=JSON.parse(await new Blob(parts).text())} catch {}
  if(!input || typeof input!=='object' || Array.isArray(input))throw new BookingError('Revisa los campos del formulario.',400)
  return input
}
class BookingError extends Error { constructor(message,status){super(message);this.status=status} }
async function slots(db) {
  return (await stmt(db,`SELECT s.id,s.start_at AS startAt,s.end_at AS endAt,s.minutes,s.advisor FROM admissions_slots s WHERE ${free} ORDER BY s.start_at,s.advisor LIMIT 120`,earliest()).all()).results
}
async function lookup(db,hashValue) {
  return stmt(db,byId+' WHERE a.manage_hash=?',hashValue).first()
}
function confirmation(appointment,key,status=200) {
  return json({ok:true,status:appointment.status,appointment:publicSummary(appointment),key},status)
}
async function book(req,env,programs) {
  const input=await body(req),key=req.headers.get('idempotency-key')||''
  if(!uuid.test(key)||input.consentCita!==true)return bad('Confirma el permiso para gestionar esta cita y vuelve a intentarlo.',422)
  const name=clean(input.name,120),email=clean(input.email,255).toLowerCase(),rawPhone=clean(input.phone,32)
  const validLocal=/^0[2-9]\d{7,8}$/
  let phone=rawPhone.replace(/[ .()-]/g,'')
  if(validLocal.test(phone))phone='+593'+phone.slice(1)
  if(!/^\+[1-9]\d{7,14}$/.test(phone) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length<2)return bad('Revisa tu nombre, correo y teléfono con código de país.',422)
  const program=clean(input.program,180),slotId=clean(input.slotId,64),preference=input.preference||'indiferente'
  if ((program && !programs.some(p=>p.slug===program)) || (slotId && !uuid.test(slotId)) || !['indiferente','manana','tarde'].includes(preference))return bad('Selecciona una maestría y un horario válidos.',422)
  const db=env.DB,manageHash=await hash(key),intentHash=await hash(JSON.stringify([name,email,phone,program,slotId,preference]))
  async function existing() {
    const saved=await stmt(db,'SELECT intent_hash FROM admissions_appointments WHERE manage_hash=?',manageHash).first()
    if (!saved)return null
    if(saved.intent_hash!==intentHash)return bad('Esta referencia ya se utilizó para otra solicitud.',409)
    return confirmation(await lookup(db,manageHash),key)
  }
  const prior=await existing();if(prior)return prior
  if(slotId && !await stmt(db,'SELECT s.id FROM admissions_slots s WHERE s.id=? AND '+free,slotId,earliest()).first())return bad('Este horario ya no está disponible. Elige otro o solicita que te propongamos uno.',409)
  const context={tool:'cita',origen:'agenda',preferencia:preference,...campaignContext(input.campaign,req.headers)}
  const captureReq=new Request(new URL('/api/leads',req.url),{method:'POST',headers:{'content-type':'application/json','idempotency-key':'cita-'+key},body:JSON.stringify({name,email,phone,program,source:'cita',context})})
  const capture=await prepareCapture(captureReq,db,programs)
  const stamp=nowISO(),id=crypto.randomUUID(),state=slotId?'booked':'requested'
  const create=stmt(db,`INSERT INTO admissions_appointments
    (id,lead_id,slot_id,program,contact_name,contact_phone,preference,status,manage_hash,intent_hash,consent_version,created_at,updated_at,changed_by)
    VALUES(?,(SELECT id FROM leads WHERE email=?),CASE WHEN ?='' THEN NULL ELSE
      (SELECT s.id FROM admissions_slots s WHERE s.id=? AND ${free}) END,?,?,?,?,?,?,?,?,?,?,?)`,
    id,email,slotId,slotId,earliest(),program,name,phone,preference,state,manageHash,intentHash,'cita-telefonica-v1',stamp,stamp,'Aspirante')
  const event=stmt(db,`INSERT INTO events(id,lead_id,type,description,created_at,actor)
    SELECT ?,lead_id,'cita',?,?,? FROM admissions_appointments WHERE id=?`,crypto.randomUUID(),slotId?'Reservó una asesoría telefónica.':'Pidió una propuesta de horario para asesoría.',stamp,'Aspirante',id)
  try {await db.batch([...capture.statements,create,event])}
  catch(e){
    const replay=await existing();if(replay)return replay
    if(/unique|constraint|check constraint/i.test(String(e?.cause?.message||e?.message)))return bad('No pudimos reservar esta opción. Revisa si ya tienes una solicitud abierta o elige otro horario.',409)
    throw e
  }
  return confirmation(await lookup(db,manageHash),key,201)
}
async function manage(req,env) {
  const {key,action}=await body(req)
  if(!uuid.test(key)||!['view','cancel'].includes(action))return bad('Referencia no válida.',400)
  const db=env.DB,h=await hash(key)
  const old=await lookup(db,h)
  if(!old)return bad('No encontramos la solicitud.',404)
  if(action==='cancel' && ['booked','requested'].includes(old.status)){
    const r=await changeStatus(db,old.id,'cancel','Aspirante')
    if(r.status!==200)return r
  }
  return json({ok:true,appointment:publicSummary(await lookup(db,h))})
}
async function changeStatus(db,id,action,operator,slotId) {
  const previous=await stmt(db,byId+' WHERE a.id=?',id).first()
  if(!previous)return bad('No encontramos esta cita.',404)
  const targets={cancel:'cancelled',complete:'completed',no_show:'no_show',assign:'booked'}
  const target=targets[action]
  if(!target)return bad('Acción desconocida.',422)
  if(previous.status===target && (action!=='assign' || previous.slotId===slotId))return json({ok:true,message:'La cita ya tiene este estado.'})
  if(!['booked','requested'].includes(previous.status) || (action==='assign' && previous.status!=='requested'))return bad('La cita cambió de estado. Actualiza la agenda.',409)
  if(['complete','no_show'].includes(action) && (previous.status!=='booked'||Date.parse(previous.startAt)>Date.now()))return bad('Solo se registran resultados de citas cuyo horario ya comenzó.',409)
  const stamp=nowISO(),desc={cancel:'Canceló la cita.',complete:'Registró la asesoría como realizada.',no_show:'Registró que el aspirante no asistió.',assign:'Confirmó con el aspirante un horario de asesoría.'}
  const update=action==='assign' ? stmt(db,`UPDATE admissions_appointments SET status='booked',slot_id=(SELECT s.id FROM admissions_slots s WHERE s.id=? AND ${free}),updated_at=?,changed_by=? WHERE id=? AND status='requested'`,slotId||'',earliest(),stamp,operator,id):
    stmt(db,'UPDATE admissions_appointments SET status=?,updated_at=?,changed_by=? WHERE id=? AND status=?',target,stamp,operator,id,previous.status)
  try {
    const [result]=await db.batch([update,stmt(db,"INSERT INTO events(id,lead_id,type,description,created_at,actor) SELECT ?,lead_id,'cita',?,?,? FROM admissions_appointments WHERE id=? AND changes()=1",crypto.randomUUID(),desc[action],stamp,operator,id)])
    if(!result.meta.changes)return bad('La cita fue actualizada por otra persona.',409)
  }catch(e){if(/constraint|unique/i.test(String(e?.cause?.message||e?.message)))return bad('El horario ya no está disponible.',409);throw e}
  return json({ok:true,message:'Agenda actualizada.'})
}
async function staffSchedule(db) {
  const cutoff=new Date(Date.now()-90*86400000).toISOString()
  const [s,a]=await db.batch([
    stmt(db,`SELECT s.id,s.start_at AS startAt,s.end_at AS endAt,s.minutes,s.advisor,
      CASE WHEN s.cancelled_at IS NOT NULL THEN 'cancelled' WHEN EXISTS(SELECT 1 FROM admissions_appointments a WHERE a.slot_id=s.id AND a.status<>'cancelled') THEN 'booked' ELSE 'available' END AS status
      FROM admissions_slots s WHERE s.start_at>=? ORDER BY s.start_at LIMIT 1000`,cutoff),
    stmt(db,`SELECT a.id,a.lead_id AS leadId,a.slot_id AS slotId,a.contact_name AS name,l.email,a.contact_phone AS phone,a.preference,a.program,a.status,a.created_at AS createdAt,s.start_at AS startAt,s.end_at AS endAt,s.advisor
      FROM admissions_appointments a JOIN leads l ON l.id=a.lead_id LEFT JOIN admissions_slots s ON s.id=a.slot_id
      WHERE a.status IN ('requested','booked') OR a.updated_at>=? ORDER BY CASE WHEN a.status IN ('requested','booked') THEN 0 ELSE 1 END,COALESCE(s.start_at,a.created_at) LIMIT 1000`,cutoff)
  ])
  return json({slots:s.results,appointments:a.results})
}
async function createSlot(req,db) {
  const {startAt,advisor:raw,minutes}=await body(req),advisor=clean(raw,80)
  const start=typeof startAt==='string' && /(?:Z|[+-]\d\d:\d\d)$/.test(startAt) ? Date.parse(startAt) : NaN
  if(advisor.length<2 || !lengths.has(minutes)||!Number.isFinite(start)||start<Date.now()+15*60000||start>Date.now()+180*86400000)return bad('Elige asesor, duración y un horario entre 15 minutos y 180 días a partir de ahora.',422)
  const begin=new Date(start).toISOString(),end=new Date(start+minutes*60000).toISOString(),advisorKey=advisor.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ')
  const id=crypto.randomUUID(),created=await stmt(db,`INSERT INTO admissions_slots(id,start_at,end_at,minutes,advisor,advisor_key,created_at)
     SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM admissions_slots WHERE advisor_key=? AND cancelled_at IS NULL AND start_at<? AND end_at>?)`,id,begin,end,minutes,advisor,advisorKey,nowISO(),advisorKey,end,begin).run()
  return created.meta.changes ? json({ok:true,id,message:'Horario disponible para los aspirantes.'},201) : bad('Este asesor ya tiene un horario que se cruza con el seleccionado.',409)
}
export async function handleAppointments(req,env,url,programs,operator) {
  const p=url.pathname.replace(/\/$/,'')
  if(!/^\/api\/(?:staff\/)?citas(?:\/|$)/.test(p))return null
  if(p.startsWith('/api/staff/')&&!operator)return bad('Acceso exclusivo para admisiones.',403)
  if(!env.DB)return bad('Agenda no disponible temporalmente.',503)
  try {
    if(p==='/api/citas' && req.method==='GET')return json({slots:await slots(env.DB),timezone:'America/Guayaquil'})
    if(p==='/api/citas/solicitar' && req.method==='POST')return await book(req,env,programs)
    if(p==='/api/citas/gestionar' && req.method==='POST')return await manage(req,env)
    if(p==='/api/staff/citas' && req.method==='GET')return await staffSchedule(env.DB)
    if(p==='/api/staff/citas/slots' && req.method==='POST')return await createSlot(req,env.DB)
    const slot=p.match(/^\/api\/staff\/citas\/slots\/([\w-]+)$/)
    if(slot && req.method==='POST'){
      const input=await body(req)
      if(input.action!=='cancel')return bad('Acción desconocida.',422)
      const r=await stmt(env.DB,`UPDATE admissions_slots SET cancelled_at=? WHERE id=? AND cancelled_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM admissions_appointments WHERE slot_id=? AND status='booked')`,nowISO(),slot[1],slot[1]).run()
      return r.meta.changes?json({ok:true,message:'Horario retirado.'}):bad('El horario ya fue retirado o tiene una cita reservada.',409)
    }
    const a=p.match(/^\/api\/staff\/citas\/([\w-]+)$/)
    if(a && req.method==='POST'){const input=await body(req);return await changeStatus(env.DB,a[1],input.action,operator,input.slotId)}
    return bad('Método o ruta no disponible.',405)
  }catch(e){if(e.status)return bad(e.message,e.status);throw e}
}
