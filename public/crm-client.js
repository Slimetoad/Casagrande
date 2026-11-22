(() => {
'use strict'
const viewNames = {resumen:'Resumen',aspirantes:'Aspirantes',conversaciones:'Conversaciones',agenda:'Agenda',contenidos:'Contenido SEO',agentes:'Agentes y canales'}
const stageNames = ['Nuevo','En orientación','En postulación','Admitido','Matriculado','Cerrado']
const signals = {page_view:'Vistas de página',cta_click:'Clics en llamados a la acción',quiz_complete:'Orientaciones completadas',calculator_use:'Usos del simulador',lead_created:'Solicitudes registradas',chat_open:'Aperturas del asistente'}
const sources = {direct:'Directo',directo:'Directo',organic:'Búsqueda orgánica',quiz:'Orientador',orientacion:'Orientador',calculator:'Simulador',financiamiento:'Simulador',form:'Formulario',web:'Web',chat:'Asistente',program:'Ficha de programa',programa:'Ficha de programa',portal:'Portal'}
const states = {pending:'En espera',queued:'En cola',ready:'Listo',running:'En curso',processing:'En curso',sent:'Enviado',completed:'Completado',done:'Completado',blocked:'Bloqueado',failed:'Fallido',error:'Error',paused:'Pausado',uncertain:'Requiere verificación',cancelled:'Cancelado',canceled:'Cancelado',skipped:'Omitido',delivered:'Entregado',read:'Leído',accepted:'Aceptado por proveedor',started:'Llamada conectada',ended:'Llamada finalizada',whatsapp:'WhatsApp',active:'Activo',draft:'Borrador',published:'Publicado',archived:'Archivado',configured:'Configurado',unconfigured:'Sin configurar',email:'Correo',voice:'Voz',llm:'Motor de IA',high:'Alta',medium:'Media',low:'Baja',system:'Sistema',staff:'Equipo',agent:'Agente',web:'Portal',lead:'Aspirante'}
const $ = s => document.querySelector(s)
const esc = x => String(x ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const norm = x => String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const iso = x => {const d=new Date(x);return x&&Number.isFinite(d.valueOf())?d:null}
const localMinute=v=>{const dt=iso(v);return dt?new Date(dt.getTime()-5*3600000).toISOString().slice(0,16):''}
const date = (v,time=false) => {const d=iso(v);return d?new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',day:'numeric',month:'short',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(d):'Sin fecha'}


const number = v => new Intl.NumberFormat('es-EC').format(Number(v)||0)
const arr = v => Array.isArray(v)?v:[]
const program = v => Object.hasOwn(state.programTitles,v)?state.programTitles[v]:String(v||'Programa por definir').replace(/-/g,' ')
const source = v => sources[v]||v||'Sin atribuir'
const word = v => states[v]||v||'Pendiente'
const badge = (v,cls='') => '<span class="badge '+cls+'">'+esc(v)+'</span>'
const stageBadge = s=>badge(s, s==='Matriculado'?'good':s==='En postulación'||s==='Admitido'?'warm':'')
const empty=(title,desc)=>'<div class="empty"><strong>'+esc(title)+'</strong>'+esc(desc||'')+'</div>'
const action=(label,id,cls='ghost small',extra='')=>'<button type="button" class="'+cls+'" data-act="'+id+'" '+extra+'>'+esc(label)+'</button>'
const item=(id)=>'data-id="'+esc(id)+'"'
const link=(text,view)=>'<a class="textbtn small" href="#'+view+'">'+esc(text)+'</a>'
const state = {view:'resumen',mode:'loading',data:{},analytics:null,token:'',blockedReason:'',query:'',stage:'',owner:'',layout:'lista',taskTab:'pendiente',contentTab:'inteligencia',leadResults:null,offset:0,hasNext:false,searchBusy:false,lookupFailed:false,searchSeq:0,loadSeq:0,detailSeq:0,currentDetail:null,programTitles:{},lastFocus:null,citas:null,citasError:'',workspace:null,queueKey:'today',caseDetail:null,caseError:'',intelligence:null,intelligenceError:'',campaignReviews:{},conversations:null,conversationError:'',conversationStatus:'all',nurture:null}
const publicDemo=['/crm','/motor-de-contenidos'].includes(location.pathname)
const getView=()=>{const v=location.hash.slice(1);return Object.hasOwn(viewNames,v)?v:(location.pathname==='/motor-de-contenidos'?'contenidos':'resumen')}

const isOpen=t=>t.status!=='hecha'&&t.status!=='done'&&t.status!=='completed'
const overdue=t=>isOpen(t)&&iso(t.dueAt)&&iso(t.dueAt).valueOf()<Date.now()
function notify(msg){$('#toast').textContent=msg;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').textContent='',4500)}
async function api(path,method='GET',body){
  const opts={method,credentials:'same-origin',headers:{Accept:'application/json'}}
  if(state.token)opts.headers.Authorization='Bearer '+state.token
  if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
  const response=await fetch(path,opts)
  let data
  try{data=await response.json()}catch{data={}}
  if(!response.ok){const err=Error(typeof data.error==='string'?data.error:response.status===401||response.status===403?'El acceso requiere una sesión de equipo autorizada.':'No se pudo completar la solicitud.');err.status=response.status;throw err}
  return data
}
async function load({message}={}){
  const seq=++state.loadSeq
  try{
    const data=await api('/api/staff/dashboard')
    if(seq!==state.loadSeq)return
    if(!Array.isArray(data.leads)||!Array.isArray(data.tasks)||!data.metrics)throw Error('La respuesta de la consola está incompleta. Vuelve a intentarlo.')
    state.data=data;state.mode='live';state.blockedReason='';state.leadResults=null;state.lookupFailed=false;state.searchSeq++;state.searchBusy=false;state.offset=0;state.analytics=null
    render();if(message)notify(message)
    if(state.view==='aspirantes')searchLeads()
    api('/api/staff/citas').then(c=>{if(state.loadSeq===seq){state.citas=c;state.citasError='';if(state.view==='agenda')render()}}).catch(e=>{if(state.loadSeq===seq){state.citas=null;state.citasError=e.message;if(state.view==='agenda')render()}})
    api('/api/staff/intelligence').then(i=>{if(state.loadSeq===seq){state.intelligence=i;state.intelligenceError='';if(state.view==='contenidos')render()}}).catch(e=>{if(state.loadSeq===seq){state.intelligence=null;state.intelligenceError=e.message;if(state.view==='contenidos')render()}})
    api('/api/staff/workspace?queue='+encodeURIComponent(state.queueKey)).then(w=>{if(state.loadSeq===seq){state.workspace=w;if(state.view==='resumen')render()}}).catch(()=>{if(state.loadSeq===seq)state.workspace=null})
    api('/api/staff/conversations?status=all').then(c=>{if(state.loadSeq===seq){state.conversations=c;state.conversationError='';if(state.view==='conversaciones')render()}}).catch(e=>{if(state.loadSeq===seq){state.conversations=null;state.conversationError=e.message;if(state.view==='conversaciones')render()}})
    api('/api/staff/analytics').then(a=>{if(state.loadSeq===seq){state.analytics=a;if(state.view==='resumen')render()}}).catch(()=>{})
  }catch(e){
    if(seq!==state.loadSeq)return
    state.mode=e.status===401||e.status===403?'locked':'error';state.blockedReason=e.message;state.data={};state.citas=null;state.workspace=null;state.currentDetail=null;state.analytics=null;state.leadResults=null;render()
  }
}
function accessPage(){
  const locked=state.mode==='locked'
  return '<section class="access-card"><div class="access-title"><p class="section-label">Consola de admisiones</p><h2>'+ (locked?'Accede al espacio del equipo.':'No se pudo cargar el espacio.')+'</h2><p>'+esc(locked?'Consulta solicitudes, coordina el seguimiento y acompaña a cada aspirante hasta su matrícula.':state.blockedReason||'Comprueba la conexión y vuelve a intentar.')+'</p></div><div class="access-body"><div class="actions">'+action(locked?'Acceder al CRM':'Reintentar',locked?'access':'reload','btn orange')+action('Explorar con datos de ejemplo','demo')+'</div><p class="fine top-margin">La demostración usa datos ficticios y no envía comunicaciones.</p></div></section>'
}
function heading(title,eyebrow,desc='',right=''){
  return '<header class="page-head"><div><p class="eyebrow">'+esc(eyebrow)+'</p><h1>'+esc(title)+'<span>.</span></h1>'+(desc?'<p class="sub">'+esc(desc)+'</p>':'')+'</div>'+right+'</header>'
}
function overview(){
  const d=state.data,m=d.metrics||{},leads=arr(d.leads),tasks=arr(d.tasks);const by=m.byStage||{}
  const counts=stageNames.map(s=>Number(by[s]??leads.filter(l=>l.stage===s).length));const max=Math.max(...counts,1)
  const metrics=[['Aspirantes',m.total??leads.length],['En postulación',counts[2]],['Matrículas',m.enrolled??counts[4]],['Tareas vencidas',m.overdueTasks??tasks.filter(overdue).length]]
  const urgent=tasks.filter(isOpen).sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')).slice(0,5)
  const recent=leads.slice().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).slice(0,4)
  const bySource=m.bySource||leads.reduce((acc,l)=>{const name=source(l.source);acc[name]=(acc[name]||0)+1;return acc},{})
  const origins=Object.entries(bySource).sort((a,b)=>b[1]-a[1])
  const sourceBlock='<section class="block"><div class="block-head"><div><p class="eyebrow">Adquisición</p><h2>Origen de los aspirantes</h2></div></div>'+ (origins.length?origins.map(([k,v])=>'<div class="list-row"><span class="list-detail">'+esc(source(k))+'</span><b>'+number(v)+'</b></div>').join(''):empty('Sin solicitudes atribuidas.','El origen se registrará al enviar el primer formulario.'))+'</section>'
  const a=state.analytics;const eventTotals={};arr(a?.rows).forEach(r=>eventTotals[r.event]=(eventTotals[r.event]||0)+Number(r.total||0))
  return heading('Hoy en admisiones','Mesa de trabajo','', '<span class="date">'+esc(new Intl.DateTimeFormat('es-EC',{dateStyle:'long',timeZone:'America/Guayaquil'}).format(new Date()))+'</span>')+
    (state.mode==='demo'?'<div class="demo-intro"><div><p class="eyebrow">Explora la plataforma</p><h2>De la primera conversación a la matrícula.</h2><p>Prueba el seguimiento con datos ficticios y descubre cómo el equipo convierte señales en próximos pasos.</p></div><div class="actions"><a class="btn orange" href="#conversaciones">Explorar conversaciones</a><a class="ghost" href="/motor-de-contenidos">Abrir motor de contenidos</a></div></div>':'')+queueSection()+ '<div class="stats">'+metrics.map(([label,v],i)=>'<div class="stat '+(i===3&&v>0?'accent':'')+'"><span class="stat-label">'+esc(label)+'</span><strong class="stat-value">'+number(v)+'</strong></div>').join('')+'</div>'+
    '<div class="layout"><div class="stack"><section class="block"><div class="block-head"><div><p class="eyebrow">Recorrido de admisión</p><h2>Aspirantes por etapa</h2></div>'+link('Abrir cartera','aspirantes')+'</div>'+stageNames.map((s,i)=>'<div class="bar-row"><span>'+esc(s)+'</span><div class="track"><div class="bar" style="width:'+Math.max(0,counts[i]/max*100)+'%"></div></div><b>'+number(counts[i])+'</b></div>').join('')+'</section>'+
    '<section class="block"><div class="block-head"><div><p class="eyebrow">Atención reciente</p><h2>Últimos aspirantes</h2></div></div><div class="list">'+(recent.map(leadRow).join('')||empty('Todavía no hay aspirantes.','Las solicitudes enviadas desde el portal aparecerán aquí.'))+'</div></section>'+sourceBlock+'</div>'+
    '<div class="stack"><section class="block"><div class="block-head"><div><p class="eyebrow">Siguiente acción</p><h2>Agenda prioritaria</h2></div>'+link('Ver agenda','agenda')+'</div><div class="list">'+(urgent.map(t=>taskRow(t,false)).join('')||empty('Agenda al día.','Asigna la siguiente acción desde la ficha de cada aspirante.'))+'</div></section>'+
    '<section class="block"><div class="block-head"><div><p class="eyebrow">Captación digital</p><h2>Interacciones del portal</h2></div></div>'+(a?'<p class="fine">Últimos '+number(a.windowDays||30)+' días · Eventos registrados, incluidos usos repetidos.</p>'+Object.entries(signals).map(([k,v])=>'<div class="list-row"><div class="list-detail">'+esc(v)+'</div><b>'+number(eventTotals[k])+'</b></div>').join(''):empty('Datos de interacción pendientes.','Se muestran al recibir los contadores del portal.'))+'</section></div></div>'
}
function queueSection(){
  const w=state.workspace;if(!w)return ''
  const rows=arr(w.queue),queues=arr(w.queues)
  return '<section class="block priority-block"><div class="block-head"><div><p class="eyebrow">Tu mesa de trabajo</p><h2>Casos que necesitan atención</h2><p class="fine">Abre cada expediente para resolver su siguiente paso y revisar bloqueos.</p></div>'+link('Ver cartera','aspirantes')+'</div><div class="queue-tabs" aria-label="Filtrar cola">'+queues.map(q=>action(q.label+' · '+number(q.count),'queue','tab','data-value="'+esc(q.key)+'" aria-pressed="'+(state.queueKey===q.key)+'"')).join('')+'</div><div class="queue-list">'+(rows.length?rows.map(r=>'<div class="queue-row"><div><button class="list-name" data-act="lead" '+item(r.case.id)+'>'+esc(r.student.name)+'</button><small>'+esc(program(r.case.program))+' · '+esc(r.case.owner||'Sin responsable')+'</small></div><div><strong>'+esc(r.nextStep?.title||'Definir siguiente paso')+'</strong><small>'+esc(r.nextStep?.dueAt?date(r.nextStep.dueAt,true)+' · Guayaquil':'Sin fecha acordada')+'</small></div><div>'+((r.nextStep?.dueAt&&iso(r.nextStep.dueAt)<new Date())?badge('Vencida','danger'):badge(r.case.stage))+(arr(r.blockers).length?'<small>'+esc(r.blockers.map(b=>b.label).join(' · '))+'</small>':'')+'</div>'+action('Abrir expediente','lead','ghost small',item(r.case.id))+'</div>').join(''):empty('No hay casos en esta cola.','Elige otra vista para continuar.'))+'</div></section>'
}
async function loadQueue(key){state.queueKey=key;if(state.mode==='demo'){state.workspace=demoWorkspace(key);render();return}try{state.workspace=await api('/api/staff/workspace?queue='+encodeURIComponent(key));render()}catch(e){notify(e.message)}}
function caseSection(c){
  if(!c)return ''
  const list=arr(c.checklist),blockers=arr(c.blockers),current=c.case
  return '<section class="panel-block"><p class="eyebrow">Avance del expediente</p><h3>Requisitos y cierre</h3>'+(blockers.length?'<div class="case-blockers"><strong>Pendiente para avanzar</strong><p>'+esc(blockers.map(x=>x.label).join(' · '))+'</p></div>':'<p class="fine">No hay bloqueos registrados.</p>')+'<form id="case-form" data-id="'+esc(current.id)+'"><div class="checklist">'+list.map(x=>'<label class="checkbox"><input type="checkbox" name="'+esc(x.key)+'" '+(x.done?'checked':'')+(x.key==='enrollmentVerified'?' disabled':'')+'>'+esc(x.label)+'</label>').join('')+'</div><label>Etapa<select name="stage">'+[...new Set([current.stage,...arr(c.availableActions)])].map(x=>'<option '+(x===current.stage?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label><label>Fecha prevista de decisión · Guayaquil<input type="date" name="decisionAt" value="'+esc(current.decisionAt?localMinute(current.decisionAt).slice(0,10):'')+'"></label><label>Bloqueo identificado<input name="blocker" maxlength="600" value="'+esc(blockers.find(x=>x.key==='reported')?.label||'')+'" placeholder="Ej. pendiente confirmar financiamiento"></label><label>Referencia de evidencia <span class="fine">para admisión o matrícula</span><input name="evidence" maxlength="300" placeholder="Ej. número de resolución o registro"></label><label>Resultado al cerrar<select name="outcome"><option value="">Seleccionar si se cierra</option>'+arr(c.outcomes).map(x=>'<option value="'+esc(x.key)+'">'+esc(x.label)+'</option>').join('')+'</select></label><label>Motivo <span class="fine">para cierre, reapertura o retroceso</span><input name="reason" maxlength="500" placeholder="Motivo del cambio"></label><div class="error form-error" role="alert"></div><button class="btn" type="submit">Guardar avance</button></form>'+(arr(c.evidence).length?'<p class="fine top-margin">Evidencia registrada: '+esc(c.evidence.map(x=>x.stage+' · '+x.reference).join(' / '))+'</p>':'')+'</section>'
}
function leadRow(l){return '<div class="list-row"><span class="avatar">'+esc((l.name||'?').split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase())+'</span><div class="list-detail"><button class="list-name" data-act="lead" '+item(l.id)+'>'+esc(l.name||'Sin nombre')+'</button><small>'+esc(program(l.program))+'</small></div>'+stageBadge(l.stage)+'</div>'}
function taskRow(t,full=true){
  const lead=arr(state.data.leads).find(l=>l.id===t.leadId)
  const label=lead?.name||'Ver aspirante'
  return '<div class="list-row"><div class="list-detail"><strong>'+esc(t.title||'Seguimiento')+'</strong>'+(t.leadId?action(label,'lead','textbtn small',item(t.leadId)):'')+'<small>'+esc(date(t.dueAt,true))+'</small></div>'+(overdue(t)?badge('Vencida','danger'):'')+(full?action(isOpen(t)?'Completar':'Reabrir','task','ghost small',item(t.id)):'')+'</div>'
}
function localLeads(){
  return arr(state.data.leads).filter(l=> (!state.stage||l.stage===state.stage)&&(!state.query||[l.name,l.email,l.phone,l.program,l.owner].some(v=>norm(v).includes(norm(state.query)))))
}
function leadTable(rows){
  if(!rows.length)return empty('Sin coincidencias.','Prueba otra búsqueda o cambia los filtros. Los nuevos registros llegan desde el portal del aspirante.')
  if(state.layout==='etapas')return '<div class="stages">'+stageNames.filter(s=>!state.stage||s===state.stage).map(s=>'<div class="stage-col"><h3>'+esc(s)+'</h3>'+(rows.filter(l=>l.stage===s).map(l=>'<button class="stage-btn" data-act="lead" '+item(l.id)+'><b>'+esc(l.name)+'</b><small>'+esc(program(l.program))+'</small><span class="stage-next">'+esc(l.nextAction||'Definir siguiente paso')+'</span><small>'+esc(l.dueAt?date(l.dueAt,true)+' · Guayaquil':'Sin fecha')+' · '+esc(l.owner||'Sin responsable')+'</small>'+(l.dueAt&&iso(l.dueAt)<new Date()?badge('Vencida','danger'):'')+'</button>').join('')||'<span class="fine">Sin registros</span>')+'</div>').join('')+'</div>'
  return '<div class="table-wrap"><table><thead><tr><th>Aspirante</th><th>Etapa</th><th>Programa</th><th>Responsable</th><th>Siguiente acción</th></tr></thead><tbody>'+rows.map(l=>'<tr><td><button class="list-name" data-act="lead" '+item(l.id)+'>'+esc(l.name)+'</button><small>'+esc(l.email||l.phone||'')+'</small></td><td>'+stageBadge(l.stage)+'</td><td>'+esc(program(l.program))+'</td><td>'+esc(l.owner||'Sin asignar')+'</td><td>'+esc(l.nextAction||'Por definir')+(l.dueAt?'<small>'+esc(date(l.dueAt))+'</small>':'')+'</td></tr>').join('')+'</tbody></table></div>'
}
function tableArea(){
  const rows=state.leadResults||localLeads()
  if(state.searchBusy)return '<p class="muted" role="status">Buscando en la cartera…</p>'
  if(state.lookupFailed)return empty('La búsqueda no está disponible.','Vuelve a intentarlo para consultar toda la cartera.')
  return leadTable(rows)+(state.mode==='live'&&(state.hasNext||state.offset)?'<div class="actions top-margin">'+(state.offset?action('Anterior','previous'):'')+(state.hasNext?action('Siguiente','next'):'')+'</div>':'')
}
function students(){
  return heading('Aspirantes','Cartera de admisiones','Consulta el historial, asigna un responsable y acuerda el siguiente paso.')+
  '<section class="block"><div class="filters"><label>Buscar aspirante<input id="lead-search" type="search" autocomplete="off" placeholder="Nombre, correo o responsable" value="'+esc(state.query)+'"></label><label>Etapa<select id="stage-filter"><option value="">Todas las etapas</option>'+stageNames.map(v=>'<option '+(v===state.stage?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label></div><div class="tabs" aria-label="Vista de cartera">'+[['lista','Lista'],['etapas','Por etapas']].map(([v,n])=>action(n,'layout','tab','aria-pressed="'+(state.layout===v)+'" data-value="'+v+'"')).join('')+'</div><div id="table-area">'+tableArea()+'</div></section>'
}
async function searchLeads(){
  const seq=++state.searchSeq
  if(state.mode!=='live'){state.leadResults=localLeads();state.searchBusy=false;if($('#table-area'))$('#table-area').innerHTML=tableArea();return}
  state.searchBusy=true;state.lookupFailed=false
  if($('#table-area'))$('#table-area').innerHTML=tableArea()
  try{
    const p=new URLSearchParams({q:state.query,stage:state.stage,offset:String(state.offset),limit:'50'})
    const response=await api('/api/staff/leads?'+p)
    if(seq!==state.searchSeq)return
    const rows=arr(response.leads||response.items||response)
    state.leadResults=rows;state.hasNext=Number.isFinite(response.total)?state.offset+rows.length<response.total:rows.length===50
  }catch(e){if(seq!==state.searchSeq)return;state.lookupFailed=true;notify(e.message)}
  if(seq===state.searchSeq){state.searchBusy=false;if($('#table-area'))$('#table-area').innerHTML=tableArea()}
}
function agenda(){
  const all=arr(state.data.tasks);const list=all.filter(t=>state.taskTab==='vencidas'?overdue(t):state.taskTab==='hecha'?!isOpen(t):isOpen(t)).sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999'))
  return heading('Agenda del equipo','Seguimiento y asesorías','Organiza compromisos y disponibilidad. Todas las horas corresponden a Guayaquil.')+appointmentsSection()+'<section class="block"><div class="block-head"><div><p class="eyebrow">Seguimiento</p><h2>Tareas del equipo</h2></div></div><div class="tabs">'+[['pendiente','Pendientes'],['vencidas','Vencidas'],['hecha','Completadas']].map(([v,n])=>action(n,'task-tab','tab','data-value="'+v+'" aria-pressed="'+(v===state.taskTab)+'"')).join('')+'</div><div class="list">'+(list.map(t=>taskRow(t)).join('')||empty('No hay tareas en esta vista.','Elige otra pestaña o añade una acción de seguimiento desde una ficha.'))+'</div></section>'
}
const channelName=x=>({email:'Correo',resend:'Correo',call:'Llamada',voice:'Llamada',twilio:'Llamada',whatsapp:'WhatsApp',retell:'Llamada · Retell',interno:'Gestión interna',all:'Todos los canales'})[x]||x||'Conversación'
const conversationIntents={
 programa:'Consultar el programa',inversion:'Consultar la inversión',cita:'Agendar una cita',requisitos:'Consultar requisitos',
 solicitar_asesor:'Hablar con un asesor',baja:'Cancelar el seguimiento',postergar:'Aplazar el seguimiento',desconocido:'Intención por confirmar'
}
const evidenceFields={program:'Programa de interés',intent:'Intención de la consulta',obstacle:'Obstáculo',timeframe:'Plazo',contactPreference:'Canal preferido',optOutChannel:'Canal de la baja',confianza:'Confianza',confidence:'Confianza','obstáculo':'Obstáculo'}
const conversationObstacles={financing:'Presupuesto o financiamiento',financiamiento:'Presupuesto o financiamiento',schedule:'Compatibilidad de horarios',horarios:'Compatibilidad de horarios',documents:'Documentación pendiente',documentacion:'Documentación pendiente',decision:'Decisión pendiente'}
const conversationDecisions={respuesta_programada:'Respuesta programada',revision_humana:'Revisión humana',sin_contacto:'Sin contacto',pausa_solicitada:'Pausa solicitada',baja:'Baja solicitada',superada:'Conversación anterior'}
function conversationLabel(labels,value,fallback){
 if(typeof value!=='string'||!value.trim())return ''
 if(Object.hasOwn(labels,value))return labels[value]
 return !/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(value)&&/[\sáéíóúñ]|^[A-Z]/.test(value)?value:fallback
}
function extractSummary(x){
 if(!x)return '<p class="fine">No hay información extraída para esta conversación.</p>'
 const items=[['Programa',x.programTitle||program(x.program)],['Intención',conversationLabel(conversationIntents,x.intent,'Intención por confirmar')],['Obstáculo',conversationLabel(conversationObstacles,x.obstacle,'Obstáculo por confirmar')],['Plazo',x.timeframe],['Contacto preferido',x.contactPreference?channelName(x.contactPreference):'']].filter(([,v])=>v&&v!=='Programa por definir')
 return '<div class="extraction-grid">'+items.map(([k,v])=>'<div><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+(arr(x.evidence).length?'<div class="evidence"><strong>Lo que dijo la persona</strong>'+x.evidence.map(e=>'<p>“'+esc(e.quote)+'” <small>· '+esc(Object.hasOwn(evidenceFields,e.field)?evidenceFields[e.field]:'Dato de la conversación')+'</small></p>').join('')+'</div>':'')+(x.needsReview?'<p class="fine">Requiere revisión del equipo antes de actuar.</p>':'')
}
function inbox(){
 const c=state.conversations,rows=arr(c?.conversations)
 const demo=state.mode==='demo'
 return heading('Conversaciones','Bandeja de admisiones','Revisa señales, contexto y seguimiento antes de acompañar a cada aspirante.')+(demo?'<section class="block conversation-simulator"><div class="block-head"><div><p class="eyebrow">Prueba interactiva · ejemplo ficticio</p><h2>Escucha una nueva conversación</h2><p class="fine">Edita el texto para probar la extracción y la propuesta de seguimiento. No se envían mensajes ni llamadas.</p><p class="fine">El ejemplo de correo parte de un permiso ficticio ya registrado. Probarlo no modifica permisos reales.</p></div></div><form id="conversation-form"><div class="conversation-input"><label>Canal<select name="channel"><option value="email">Correo electrónico</option><option value="call">Llamada</option></select></label><label>Mensaje o resumen de llamada<textarea name="text" required maxlength="2000" rows="4">Me interesa el MBA. ¿Cuál es la inversión y qué opciones de financiamiento hay? Me preocupa el costo. Quisiera comenzar el próximo mes y prefiero que me respondan por correo.</textarea></label><button class="btn orange" type="submit">Analizar conversación</button><div class="form-error error" role="alert"></div></div></form><div id="conversation-result" aria-live="polite"></div></section>':'')+'<section class="block"><div class="block-head"><div><p class="eyebrow">Actividad de canales</p><h2>Bandeja de entrada</h2><p class="fine">'+(demo?'Ejemplos ficticios para explorar un expediente completo.':'Mensajes y llamadas registrados por los canales conectados.')+'</p></div></div>'+(state.conversationError?'<p class="error">'+esc(state.conversationError)+'</p>':!c?'<p class="fine">Cargando conversaciones…</p>':rows.length?'<div class="conversation-list">'+rows.map(r=>'<button class="conversation-row" type="button" data-act="conversation" '+item(r.id)+'><span class="conversation-icon">'+(r.provider==='email'?'✉':'↗')+'</span><span class="conversation-main"><strong>'+esc(r.contact?.name||r.lead?.name||'Contacto sin asignar')+'</strong><small>'+esc(channelName(r.provider))+' · '+esc(date(r.occurredAt,true))+' · Guayaquil</small><span>'+esc(r.subject||r.excerpt||'Conversación registrada')+'</span></span><span class="conversation-side">'+badge(r.lead?'Con expediente':'Por vincular',r.lead?'good':'warm')+'<small>'+esc(conversationLabel(conversationIntents,r.extraction?.intent,'Intención por confirmar')||'Revisar señales')+'</small></span><span aria-hidden="true">→</span></button>').join('')+'</div>':empty('Aún no hay conversaciones.','Los canales configurados registrarán aquí su actividad.'))+'</section>'
}
function showConversationResult(node,data){
 const facts=data.facts||{},plan=data.plan||{}
 node.innerHTML='<div class="demo-result"><p class="eyebrow">Resultado del ejemplo · no se enviaron comunicaciones</p><h3>Señales identificadas</h3>'+extractSummary(facts)+'<h3>Propuesta para el equipo</h3><strong>'+esc(conversationLabel(conversationDecisions,plan.title,'Revisar con un asesor')||'Revisar con un asesor')+'</strong><p>'+esc(plan.reason||'')+'</p><div class="extraction-grid">'+[['Acción',conversationLabel(conversationDecisions,plan.action,'Revisar con el equipo')],['Canal',plan.channel?channelName(plan.channel):''],['Plazo',plan.dueMinutes===0?'De inmediato':plan.dueMinutes!=null?number(plan.dueMinutes)+' minutos':'']].filter(([,v])=>v).map(([k,v])=>'<div><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+(plan.draft?'<div class="evidence"><strong>Borrador ilustrativo · no enviado</strong><p>'+esc(plan.draft.subject||'')+'</p><p>'+esc(plan.draft.text||'')+'</p></div>':'')+'<p class="fine top-margin">La propuesta es ilustrativa y requiere revisión antes de actuar.</p></div>'
}
function conversationPanel(c){
 const lead=c.lead
 showPanel(c.subject||channelName(c.provider),'<div class="inline top-margin">'+badge(channelName(c.provider))+' '+badge(conversationLabel({linked:'Con expediente',unassigned:'Por vincular'},c.reviewStatus,'Por revisar')||'Por revisar','warm')+'</div><p class="fine top-margin">'+esc(c.contact?.name||'Contacto sin asignar')+' · '+esc(date(c.occurredAt,true))+' · Guayaquil</p>'+(c.excerpt?'<blockquote class="conversation-quote">'+esc(c.excerpt)+'</blockquote>':'<p class="fine">'+esc(conversationLabel({partial:'Contenido pendiente de verificación',complete:'Sin extracto disponible'},c.contentStatus,'Sin contenido disponible')||'Sin contenido disponible')+'</p>')+'<section class="panel-block"><p class="eyebrow">Extracción para revisión</p><h3>Contexto de la conversación</h3>'+extractSummary(c.extraction)+'</section><section class="panel-block"><h3>Siguiente paso</h3><p>'+esc(c.demoPlan||'Revisa el expediente y acuerda el siguiente paso con el aspirante.')+'</p>'+(lead?action('Abrir expediente','lead','btn',item(lead.id)):'<p class="fine">La conversación aún no está vinculada a un expediente.</p>')+'</section>','Bandeja de conversaciones')
}
async function openConversation(id){
 let c;if(state.mode==='demo')c=arr(state.conversations?.conversations).find(x=>x.id===id)
 else c=await api('/api/staff/conversations/'+encodeURIComponent(id))
 if(!c)throw Error('No se encontró la conversación.');conversationPanel(c)
}
function appointmentsSection(){
  const c=state.citas
  const form='<form id="slot-form" class="slot-form"><label>Fecha y hora · Guayaquil<input type="datetime-local" name="startAt" required></label><label>Duración<select name="minutes"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option></select></label><label>Asesor<input name="advisor" required maxlength="100" placeholder="Nombre del asesor"></label><button class="btn" type="submit">Publicar horario</button><div class="error form-error" role="alert"></div></form>'
  if(!c)return '<section class="block appointment-block"><div class="block-head"><div><p class="eyebrow">Asesorías · hora de Guayaquil</p><h2>Citas y disponibilidad</h2></div></div>'+empty(state.citasError?'No se pudo cargar la agenda de citas.':'Cargando agenda de citas.',state.citasError||'')+(state.citasError?action('Reintentar','reload-citas'):'')+'</section>'
  const appointments=arr(c.appointments).slice().sort((a,b)=>String(a.startAt).localeCompare(String(b.startAt)))
  const slots=arr(c.slots).filter(x=>x.status==='available').sort((a,b)=>String(a.startAt).localeCompare(String(b.startAt)))
  return '<section class="block appointment-block"><div class="block-head"><div><p class="eyebrow">Asesorías · hora de Guayaquil</p><h2>Citas y disponibilidad</h2><p class="fine">Publica horarios para que los aspirantes reserven una asesoría.</p></div></div>'+form+'<div class="appointment-columns"><div><h3>Citas reservadas y atendidas</h3>'+(appointments.length?appointments.map(a=>'<div class="appointment-row"><div><strong>'+esc(a.startAt?date(a.startAt,true):'Por asignar')+' · '+esc(a.name||'Aspirante')+'</strong><small>'+esc(program(a.program))+' · '+esc(a.advisor||'Sin asesor asignado')+(a.preference?' · '+esc(({manana:'Prefiere la mañana',tarde:'Prefiere la tarde',indiferente:'Sin preferencia'})[a.preference]||a.preference):'')+(a.phone?' · '+esc(a.phone):'')+'</small><small>'+esc(({requested:'Solicita horario',booked:'Reservada',completed:'Completada',cancelled:'Cancelada',no_show:'No asistió'})[a.status]||a.status)+'</small></div><div class="actions">'+(a.leadId?action('Abrir ficha','lead','textbtn small',item(a.leadId)):'')+(a.status==='requested'?'<form class="assign-form" data-id="'+esc(a.id)+'"><label>Asignar horario<select name="slotId" required><option value="">Seleccionar</option>'+slots.map(s=>'<option value="'+esc(s.id)+'">'+esc(date(s.startAt,true)+' · '+s.advisor)+'</option>').join('')+'</select></label><button class="ghost small" type="submit">Confirmar horario</button><div class="error form-error" role="alert"></div></form>':'')+(a.status==='booked'?((a.endAt&&iso(a.endAt)<=new Date()?action('Completar','appointment-action','ghost small',item(a.id)+' data-value="complete"')+action('No asistió','appointment-action','ghost small',item(a.id)+' data-value="no_show"'):'')+action('Cancelar','appointment-action','ghost small',item(a.id)+' data-value="cancel"')):a.status==='requested'?action('Cancelar','appointment-action','ghost small',item(a.id)+' data-value="cancel"'):'')+'</div></div>').join(''):empty('Sin citas registradas.','Las reservas aparecerán aquí.'))+'</div><div><h3>Horarios disponibles</h3>'+(slots.length?slots.map(s=>'<div class="appointment-row"><div><strong>'+esc(date(s.startAt,true))+'</strong><small>'+esc(s.advisor)+' · '+number(s.minutes)+' min</small></div>'+action('Retirar','slot-cancel','ghost small',item(s.id))+'</div>').join(''):empty('No hay horarios disponibles.','Publica un horario para recibir reservas.'))+'</div></div></section>'
}
async function loadCitas(){
  if(state.mode==='demo'){render();return}
  try{state.citas=await api('/api/staff/citas');state.citasError=''}catch(e){state.citas=null;state.citasError=e.message}render()
}
async function changeAppointment(id,act,slot=false){
  if(state.mode==='demo'){
    const target=arr(slot?state.citas.slots:state.citas.appointments).find(x=>x.id===id);if(!target)throw Error('No se encontró el registro.')
    target.status=slot?'cancelled':({complete:'completed',cancel:'cancelled',no_show:'no_show'})[act]
    if(!slot&&act==='cancel'){const associated=arr(state.citas.slots).find(x=>x.id===target.slotId);if(associated)associated.status='available'}
    render();notify('Cambio guardado en la demostración.');return
  }
  await api('/api/staff/citas/'+(slot?'slots/':'')+encodeURIComponent(id),'POST',{action:act});await loadCitas();notify('Agenda actualizada.')
}
function seo(){
  const opp=arr(state.data.opportunities),articles=arr(state.data.articles)
  return (state.mode==='demo'?'<section class="demo-intro motor-intro"><div><p class="eyebrow">Motor de contenidos · demostración</p><h2>De una pregunta real a una guía útil.</h2><p>Explora una oportunidad simulada, genera un borrador, edítalo y publica una vista previa. Nada se publica en el portal.</p></div><div class="actions">'+action('Ver oportunidad y crear borrador','demo-motor','btn orange')+'<a href="/crm" class="ghost">Explorar CRM</a></div></section>':'')+heading('Contenido SEO','Captación orgánica','Convierte búsquedas reales en guías de posgrados y revisa cada texto antes de publicarlo.',(state.mode==='live'?'<a class="ghost small" href="/equipo/conversion">Rendimiento de las fichas</a>':'')+action('Sincronizar búsquedas','sync','btn'))+
  '<section class="block"><div class="tabs">'+[['inteligencia','Inteligencia de captación'],['oportunidades','Oportunidades de búsqueda'],['articulos','Mesa editorial']].map(([v,n])=>action(n,'seo-tab','tab','data-value="'+v+'" aria-pressed="'+(state.contentTab===v)+'"')).join('')+'</div>'+
  (state.contentTab==='inteligencia'?intelligenceBoard():state.contentTab==='oportunidades'?(opp.length?'<div class="table-wrap"><table><thead><tr><th>Consulta y fuente</th><th>Impresiones</th><th>Clics</th><th>Volumen estimado</th><th>Posición</th><th>Actualización</th><th>Acción</th></tr></thead><tbody>'+opp.map(o=>'<tr><td><strong>'+esc(o.query)+'</strong><small>'+esc(o.source||'')+'</small></td><td>'+ (o.impressions==null?'—':number(o.impressions))+'</td><td>'+(o.clicks==null?'—':number(o.clicks))+'</td><td>'+(o.volume==null?'—':number(o.volume))+'</td><td>'+(o.position==null?'—':number(Number(o.position).toFixed(1)))+'</td><td>'+esc(date(o.updatedAt))+'</td><td>'+action('Preparar borrador','draft','ghost small',item(o.id))+'</td></tr>').join('')+'</tbody></table></div>':empty('Aún no hay consultas sincronizadas.','Conecta una fuente de búsquedas en Agentes y canales y ejecuta la sincronización.')):(articles.length?'<div class="list">'+articles.map(a=>'<div class="list-row"><div class="list-detail"><button data-act="article" class="list-name" '+item(a.id)+'>'+esc(a.title)+'</button><small>'+esc(a.sourceQuery||'')+'</small></div>'+badge(state.mode==='demo'&&a.status==='published'?'Vista previa publicada':word(a.status),a.status==='published'?'good':'warm')+'</div>').join('')+'</div>':empty('La mesa editorial está vacía.','Prepara un borrador a partir de una oportunidad de búsqueda.')))+'</section>'
}
function campaignLink(value){try{const u=new URL(value,location.origin);return u.origin===location.origin&&(u.pathname==='/programas'||u.pathname.startsWith('/programas/'))?u.href:''}catch{return ''}}
function campaignInfo(c){
 const m=c.measurement||{},url=campaignLink(c.launchUrl)
 return '<small>'+(m.measuredAt?'Medición: '+number(m.leadCount)+' aspirantes · '+number(m.enrolledCount)+' matrículas · actualizada '+esc(date(m.measuredAt,true))+' (Guayaquil)':'Medición pendiente')+'</small>'+(m.baselineProgramLeads!=null?'<small>Base del programa: '+number(m.baselineProgramLeads)+' aspirantes</small>':'')+((m.start||m.end)?'<small>Ventana: '+esc(m.start?date(m.start):'—')+' a '+esc(m.end?date(m.end):'—')+'</small>':'')+(c.brief?.nextReview?'<small>Próxima revisión: '+esc(date(c.brief.nextReview))+'</small>':'')+(arr(c.history).length?'<small>Historial: '+esc(c.history.slice(-3).map(h=>h.action+' · '+date(h.at)).join(' / '))+'</small>':'')+(url?'<label class="campaign-link">Enlace de campaña<input readonly value="'+esc(url)+'"></label>'+action('Copiar enlace','copy-campaign','ghost small',item(c.id)):'')
}
function intelligenceBoard(){
  const i=state.intelligence
  if(!i)return empty(state.intelligenceError?'Inteligencia no disponible.':'Cargando inteligencia de captación.',state.intelligenceError||'')+(state.intelligenceError?action('Reintentar','reload-intelligence'):'')
  const candidates=arr(i.candidates),campaigns=arr(i.campaigns),gaps=arr(i.gaps)
  return '<p class="fine">'+(state.mode==='demo'?'Datos ficticios de demostración':'Datos observados')+' · '+esc(i.window?.days||30)+' días. La atribución es indicativa; una solicitud puede tener varios puntos de contacto.</p>'+(gaps.length?'<div class="status-line"><strong>Alcance de los datos</strong><br>'+gaps.map(esc).join('<br>')+'</div>':'')+'<div class="intelligence-sources">'+arr(i.sources).map(x=>'<div>'+badge(word(x.status),['configured','vigente'].includes(x.status)?'good':'warm')+' <strong>'+esc(x.source)+'</strong><small>'+esc(x.detail||'')+'</small></div>').join('')+'</div><div class="block-head section-gap"><div><p class="eyebrow">Oportunidades detectadas</p><h2>Decisiones de captación</h2></div></div>'+(candidates.length?'<div class="intelligence-grid">'+candidates.map(c=>'<article class="insight-card"><p class="eyebrow">'+esc(c.intent||'Oportunidad')+'</p><h3>'+esc(c.query||c.title)+'</h3><p>'+esc(c.action||'Revisar oportunidad')+'</p><p class="fine">'+arr(c.reasons).map(esc).join(' · ')+'</p><div class="insight-metrics"><span><b>'+number(c.metrics?.leads)+'</b> aspirantes</span><span><b>'+number(c.metrics?.advanced)+'</b> avanzaron</span><span><b>'+number(c.metrics?.enrolled)+'</b> matriculados</span></div><p class="fine">'+(c.metrics?.impressions==null?'Sin impresiones registradas':number(c.metrics.impressions)+' impresiones')+' · '+(c.metrics?.clicks==null?'Sin clics registrados':number(c.metrics.clicks)+' clics')+' · '+(c.metrics?.ctr==null?'CTR no disponible':'CTR '+number((c.metrics.ctr*100).toFixed(1))+'%')+' · '+(c.metrics?.volume==null?'Volumen no disponible':'Volumen estimado '+number(c.metrics.volume))+' · Contenido: '+esc(({none:'Sin contenido',draft:'Borrador',published:'Publicado',archived:'Archivado'})[c.content?.status]||'Sin datos')+'</p><div class="actions">'+action('Preparar propuesta','campaign-brief','ghost small',item(c.id))+(c.campaignId||!c.program?'':action('Crear propuesta','campaign-create','btn small',item(c.id)))+(c.opportunityId&&c.program&&c.content?.status==='none'&&c.intent==='Selección de maestría'?action('Preparar borrador SEO','draft','textbtn small',item(c.opportunityId)):'')+'</div></article>').join('')+'</div>':empty('Sin oportunidades disponibles.','Se mostrarán cuando haya señales suficientes.'))+'<div class="block-head section-gap"><div><p class="eyebrow">Experimentos internos</p><h2>Propuestas y campañas</h2></div></div>'+(campaigns.length?campaigns.map(c=>'<div class="campaign-row"><div><strong>'+esc(c.title)+'</strong> '+badge(word(c.state))+'<small>'+esc(c.brief?.hypothesis||'')+'</small>'+campaignInfo(c)+'</div><div class="actions">'+({propuesta:action('Aprobar','campaign-action','ghost small',item(c.id)+' data-value="aprobar"')+action('Descartar','campaign-action','ghost small',item(c.id)+' data-value="descartar"'),aprobada:action('Iniciar','campaign-action','ghost small',item(c.id)+' data-value="iniciar"')+action('Descartar','campaign-action','ghost small',item(c.id)+' data-value="descartar"'),activa:action('Cerrar','campaign-action','ghost small',item(c.id)+' data-value="cerrar"')}[c.state]||'')+'</div></div>').join(''):empty('Aún no hay propuestas.','Crea una propuesta interna desde una oportunidad.'))
}
async function refreshIntelligence(){if(state.mode==='demo'){render();return}try{state.intelligence=await api('/api/staff/intelligence');state.intelligenceError='';render()}catch(e){state.intelligenceError=e.message;notify(e.message)}}
async function campaignBrief(id){
  let b
  if(state.mode==='demo')b={title:'Ejemplo: orientación para elegir maestría',audience:'Aspirantes que comparan opciones',hypothesis:'Una guía clara puede facilitar la conversación.',action:'Revisar una guía con admisiones.',metric:'Solicitudes registradas',windowDays:30,verification:'Revisar resultados junto al equipo.',modelReview:{status:'no_aplica',detail:'Ejemplo ficticio'}}
  else {const result=await api('/api/staff/intelligence/brief','POST',{candidateId:id});b=result.brief;if(result.reviewId)state.campaignReviews[id]=result.reviewId}
  showPanel('Propuesta de captación','<p class="fine top-margin">Preparación para revisión interna. No publica ni envía comunicaciones.</p><h3>'+esc(b.title)+'</h3><dl class="details-grid">'+definition('Audiencia',b.audience)+definition('Acción',b.action)+definition('Hipótesis',b.hypothesis)+definition('Medida',b.metric)+definition('Ventana',b.windowDays+' días')+definition('Verificación',b.verification)+'</dl><p class="fine">Revisión del modelo: '+esc(b.modelReview?.detail||b.modelReview?.status||'Sin revisión')+'</p>'+(arr(state.intelligence?.candidates).find(c=>c.id===id)?.program?action('Crear propuesta','campaign-create','btn',item(id)):'<p class="fine">La oportunidad necesita un programa asociado para crear una propuesta.</p>'))
}
async function campaignChange(id,act){
  if(state.mode==='demo'){const c=state.intelligence.campaigns.find(x=>x.id===id);if(!c)throw Error('No se encontró la propuesta.');c.state=({aprobar:'aprobada',iniciar:'activa',cerrar:'cerrada',descartar:'descartada'})[act];render();notify('Estado actualizado en la demostración.');return}
  const c=arr(state.intelligence?.campaigns).find(x=>x.id===id);if(!c)throw Error('Actualiza la mesa y vuelve a intentarlo.');await api('/api/staff/intelligence/campaigns/'+encodeURIComponent(id),'POST',{action:act,revision:c.revision});await refreshIntelligence();notify('Estado de la propuesta actualizado.')
}
async function campaignCreate(id){
  if(state.mode==='demo'){const candidate=state.intelligence.candidates.find(c=>c.id===id);if(candidate.campaignId)throw Error('Ya existe una propuesta para esta oportunidad.');candidate.campaignId='campaign-demo';state.intelligence.campaigns.push({id:'campaign-demo',title:candidate.title,state:'propuesta',brief:{hypothesis:'Una orientación clara puede facilitar la decisión.'},measurement:{leadCount:0,enrolledCount:0}});closePanel();render();notify('Propuesta creada en la demostración.');return}
  await api('/api/staff/intelligence/campaigns','POST',{candidateId:id,...(state.campaignReviews[id]?{reviewId:state.campaignReviews[id]}:{})});closePanel();await refreshIntelligence();notify('Propuesta interna creada.')
}
function agents(){
  const data=state.data,integrations=arr(data.integrations),jobs=arr(data.jobs)
  return heading('Agentes y canales','Operación','Revisa qué proveedores están configurados y el estado de cada contacto programado.',state.mode==='live'?'<a class="ghost small" href="/equipo/conexiones">Configurar recepción de correo y llamadas</a>':'')+
  '<section class="block"><div class="block-head"><h2>Conexiones</h2>'+action('Actualizar','refresh','ghost small')+'</div><div class="channels">'+(integrations.map(i=>'<div class="card">'+badge(i.status||(i.configured?'Configurado':'Pendiente de configuración'),i.configured&&i.status!=='Revisar conexión'?'good':'warm')+'<h3>'+esc(i.label||i.key)+'</h3><p>'+esc(i.detail||'')+'</p></div>').join('')||empty('Sin información de conexiones.','Actualiza el panel para consultar el estado del servidor.'))+'</div></section>'+
  '<section class="block"><div class="block-head"><div><p class="eyebrow">Seguimiento automatizado</p><h2>Cola de contacto</h2></div>'+action('Procesar cola','confirm-run','ghost small')+'</div>'+
  (jobs.length?'<div class="table-wrap"><table><thead><tr><th>Aspirante</th><th>Canal</th><th>Acción</th><th>Programación</th><th>Estado</th></tr></thead><tbody>'+jobs.map(j=>'<tr><td>'+(j.leadId?action(arr(data.leads).find(l=>l.id===j.leadId)?.name||'Abrir ficha','lead','textbtn small',item(j.leadId)):'—')+'</td><td>'+esc(word(j.channel))+'</td><td>'+esc(jobKind(j.kind))+'</td><td>'+esc(date(j.dueAt,true))+'</td><td>'+badge(word(j.status),['sent','delivered','completed'].includes(j.status)?'good':'')+(j.lastError?'<small>'+esc(j.lastError)+'</small>':'')+'</td></tr>').join('')+'</tbody></table></div>':empty('La cola está vacía.','Las solicitudes y sus permisos de contacto determinan los seguimientos disponibles.'))+'</section>'
}
function jobKind(kind){return ({welcome:'Bienvenida',welcome_email:'Correo de bienvenida',followup:'Seguimiento',follow_up:'Seguimiento',followup_email:'Correo de seguimiento',call:'Llamada',callback:'Devolución de llamada',voice_followup:'Seguimiento por voz',guidance:'Orientación',application:'Acompañamiento de postulación',admission:'Preparación de matrícula'})[kind]||String(kind||'Seguimiento').replaceAll('_',' ')}
function render(){
  state.view=getView()
  const v=state.view
  $('#crumb-title').textContent=viewNames[v];document.title=viewNames[v]+' · Admisiones UCG'
  document.querySelectorAll('[data-view]').forEach(a=>{if(a.dataset.view===v)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')})
  $('#auth-action').hidden=publicDemo;$('#auth-action').textContent=state.mode==='live'&&state.token?'Salir':state.mode==='live'?'Sesión':'Acceso'
  $('#mode-indicator').textContent=state.mode==='demo'?'Demostración':state.mode==='live'?'Equipo de admisiones':'Área de equipo'
  if(state.mode==='loading')return
  if(state.mode==='locked'||state.mode==='error'){$('#content').innerHTML=heading('Admisiones','Posgrados UCG')+accessPage();return}
  const notice=state.mode==='demo'?'<div class="notice"><p><strong>Demostración</strong> Datos ficticios. Los cambios solo duran mientras exploras esta sesión.</p>'+(publicDemo?'':action('Salir de la demo','exit-demo','textbtn small'))+'</div>':''
  $('#content').innerHTML=notice+({resumen:overview,aspirantes:students,conversaciones:inbox,agenda,contenidos:seo,agentes:agents}[v])()
}
function showPanel(title,body,kicker='Admisiones'){
  const dialog=$('#panel');if(!dialog.open)state.lastFocus=document.activeElement
  $('#panel-content').innerHTML='<div class="dialog-header"><div><p class="eyebrow">'+esc(kicker)+'</p><h2 id="panel-title">'+esc(title)+'</h2></div>'+action('×','close','icon-btn','aria-label="Cerrar"')+'</div>'+body
  if(!dialog.open)dialog.showModal()
}
function closePanel(){if($('#panel').open)$('#panel').close()}
function definition(label,value){return '<div><dt>'+esc(label)+'</dt><dd>'+esc(value||'—')+'</dd></div>'}
function contextText(ctx){
  if(typeof ctx==='string'){try{ctx=JSON.parse(ctx)}catch{return ''}}
  if(!ctx||typeof ctx!=='object')return ''
  const labels={quizArea:'Área elegida en orientación',quizResult:'Programa sugerido',timeframe:'Plazo para comenzar',investment:'Inversión simulada',comparedPrograms:'Programas comparados',quizGoal:'Objetivo de orientación',quizMode:'Modalidad preferida',quizTimeline:'Plazo para comenzar',calculatorMonths:'Cuotas simuladas',calculatorDeposit:'Entrada simulada',calculatorMonthly:'Cuota mensual simulada',tool:'Herramienta',herramienta:'Herramienta',origen:'Origen',program:'Programa consultado',interest:'Área de interés',area:'Área de interés',goal:'Objetivo',timeline:'Horizonte',utm_source:'Fuente de campaña',utm_medium:'Medio',utm_campaign:'Campaña',monthly:'Cuota estimada',payment:'Cuota estimada',term:'Plazo simulado',months:'Meses simulados',price:'Inversión simulada',deposit:'Entrada simulada',question:'Consulta',plan:'Plan',page:'Página de origen',origin:'Origen'}
  const rows=[]
  const walk=(val,depth)=>{if(depth>2||!val||typeof val!=='object')return;for(const [key,v] of Object.entries(val)){if(Array.isArray(v)&&labels[key])rows.push(definition(labels[key],v.filter(x=>typeof x==='string').map(x=>state.programTitles[x]||x).join(', ')));else if(v&&typeof v==='object')walk(v,depth+1);else if(labels[key]&&v!==null&&v!=='')rows.push(definition(labels[key],String(state.programTitles[v]||v).slice(0,350)))}}
  walk(ctx,0);return rows.length?'<div class="panel-block"><h3>Contexto de interés</h3><dl class="details-grid">'+rows.slice(0,12).join('')+'</dl></div>':''
}
async function openLead(id){
  const seq=++state.detailSeq
  showPanel('Ficha de aspirante','<p class="muted top-margin">Consultando expediente…</p>')
  try{
    const d=state.mode==='demo'?{lead:state.data.leads.find(l=>l.id===id),events:state.data.events.filter(e=>e.leadId===id),tasks:state.data.tasks.filter(t=>t.leadId===id),jobs:state.data.jobs.filter(j=>j.leadId===id)}:await api('/api/staff/leads/'+encodeURIComponent(id))
    if(seq!==state.detailSeq||!$('#panel').open)return
    if(!d.lead)throw Error('El registro no está disponible.')
    state.currentDetail=d;state.nurture=state.mode==='demo'?demoNurture(id):null;state.caseError='';state.caseDetail=state.mode==='demo'?demoCase(id):null;
    if(state.mode==='live'){let detail=null,error='';try{detail=await api('/api/staff/workspace/'+encodeURIComponent(id))}catch(e){error=e.message}if(seq!==state.detailSeq||!$('#panel').open)return;state.caseDetail=detail;state.caseError=error}
    if(seq!==state.detailSeq||!$('#panel').open)return;if(state.caseDetail){d.events=state.caseDetail.activity||d.events;d.jobs=state.caseDetail.jobs||d.jobs;d.tasks=state.caseDetail.tasks||d.tasks;d.submissions=state.caseDetail.submissions||d.submissions;d.lead.consentWhatsapp=state.caseDetail.student?.consentWhatsapp}leadPanel(d);if(state.mode==='live'){api('/api/staff/leads/'+encodeURIComponent(id)+'/nurture').then(n=>{if(seq===state.detailSeq&&$('#panel').open&&state.currentDetail?.lead?.id===id){state.nurture=n;leadPanel(d)}}).catch(()=>{})}
  }catch(e){if(seq===state.detailSeq&&$('#panel').open)showPanel('Ficha de aspirante','<p class="error top-margin">'+esc(e.message)+'</p>')}
}
function leadPanel(d){
  const l=d.lead
  const eventList=arr(d.events)
  const timeValue=localMinute(l.dueAt)
  const priority = {alta:'Alta',media:'Media',normal:'Normal',baja:'Baja',high:'Alta',medium:'Media',low:'Baja'}[norm(l.priority)]
  const form='<div class="panel-block"><h3>Plan de seguimiento</h3><form id="lead-form" data-id="'+esc(l.id)+'"><label>Responsable<input name="owner" maxlength="100" placeholder="Asignar asesor" value="'+esc(l.owner)+'"></label><label>Siguiente acción<input name="nextAction" maxlength="240" value="'+esc(l.nextAction)+'" placeholder="Acordar una llamada de orientación"></label><label>Fecha de seguimiento · Guayaquil<input type="datetime-local" name="dueAt" value="'+timeValue+'"></label><label>Añadir nota interna<textarea rows="2" name="note" maxlength="1500" placeholder="Registra el acuerdo o la pregunta pendiente"></textarea></label><label class="checkbox"><input type="checkbox" name="paused" '+(l.paused?'checked':'')+'>Pausar seguimiento automatizado para este aspirante</label><div class="error form-error" role="alert"></div><div><button class="btn" type="submit">Guardar seguimiento</button></div></form></div>'
  const tasks=arr(d.tasks)
  const jobs=arr(d.jobs)
  const outbound=jobs.length?'<div class="panel-block"><h3>Seguimiento automático</h3><div class="list">'+jobs.map(j=>'<div class="list-row"><div class="list-detail"><strong>'+esc(jobKind(j.kind))+'</strong><small>'+esc(word(j.channel))+' · '+esc(date(j.dueAt,true))+'</small>'+(j.lastError?'<small>'+esc(j.lastError)+'</small>':'')+'</div>'+badge(word(j.status),j.status==='failed'||j.status==='uncertain'?'danger':'')+'</div>').join('')+'</div></div>':''
  const submissions=arr(d.submissions)
  const interests=submissions.length>1?'<div class="panel-block"><h3>Solicitudes de información</h3><div class="timeline">'+submissions.map(s=>'<div>'+esc(program(s.program))+'<small>'+esc(source(s.source))+' · '+esc(date(s.createdAt,true))+'</small></div>').join('')+'</div></div>':''
  const timeline='<div class="panel-block"><h3>Actividad de todos los canales</h3>'+(eventList.length?'<div class="timeline">'+eventList.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,60).map(e=>'<div>'+esc(e.description||'Actualización de seguimiento')+'<small>'+esc(date(e.createdAt,true))+(e.actor?' · '+esc(word(e.actor)):'')+'</small></div>').join('')+'</div>':empty('Sin actividad registrada.','Los cambios de seguimiento aparecerán aquí.'))+'</div>'
  showPanel(l.name||'Aspirante','<div class="inline top-margin">'+stageBadge(l.stage)+(priority?badge('Prioridad '+priority.toLowerCase()):'')+(l.paused?badge('Seguimiento pausado','warm'):'')+'</div><dl class="details-grid">'+definition('Programa',program(l.program))+definition('Origen',source(l.source))+definition('Correo',l.email)+definition('Teléfono',l.phone)+definition('Seguimiento por correo',l.consentEmail?'Autorizado':'Sin autorización')+definition('Contacto por voz',l.consentVoice?'Autorizado':'Sin autorización')+definition('WhatsApp',l.consentWhatsapp?'Autorizado':'Sin autorización')+'</dl>'+contextText(submissions[0]?.context||l.context)+interests+(state.caseError?'<div class="error top-margin">No se pudo cargar el avance del expediente: '+esc(state.caseError)+' '+action('Reintentar','reload-lead','ghost small',item(l.id))+'</div>':caseSection(state.caseDetail))+'<section class="panel-block"><div class="block-head"><div><p class="eyebrow">Asistente de admisiones</p><h3>Preparación de asesoría</h3></div>'+action('Preparar asesoría','brief','ghost small',item(l.id))+'</div><div class="brief-output" id="brief-output" aria-live="polite"></div></section>'+form+'<div class="panel-block"><h3>Tareas del expediente</h3>'+(tasks.length?tasks.map(t=>taskRow(t)).join(''):empty('Sin tareas pendientes.','Guarda una siguiente acción y su fecha para organizar el seguimiento.'))+'</div>'+outbound+nurtureSection()+timeline,'Expediente de admisión')
}
function nurtureSection(){
 const rows=arr(state.nurture?.signals);if(!rows.length)return ''
 return '<section class="panel-block"><p class="eyebrow">Seguimiento informado</p><h3>Señales y decisiones</h3>'+rows.map(x=>'<div class="nurture-row"><div>'+badge(conversationLabel(conversationDecisions,x.decision,'Decisión por verificar')||'Decisión por verificar','warm')+' <small>'+esc(channelName(x.channel))+' · '+esc(date(x.receivedAt,true))+'</small><p>'+esc(x.reason||'')+'</p><strong>'+esc(conversationLabel(conversationDecisions,x.nextAction,'Revisar con el equipo'))+'</strong>'+(x.dueAt?'<small> · '+esc(date(x.dueAt,true))+' Guayaquil</small>':'')+(x.jobStatus?'<small>Estado: '+esc(conversationLabel(states,x.jobStatus,'Estado por confirmar'))+'</small>':'')+'</div></div>').join('')+'</section>'
}
async function prepareBrief(id){
  const l=state.currentDetail?.lead
  const panel=$('#brief-output')
  if(!l||l.id!==id||!panel)return
  panel.textContent='Preparando orientación…'
  try{
    const b=state.mode==='demo'?{summary:'El expediente de ejemplo está en la etapa '+l.stage.toLowerCase()+'.',signals:[l.consentEmail?'Acepta recibir orientación por correo.':'No autorizó seguimiento por correo.'],recommendedAction:l.nextAction||'Confirmar el objetivo del aspirante junto al equipo.',questions:['¿Qué objetivo profesional esperas alcanzar?','¿Qué información necesitas para decidir tu siguiente paso?'],draftEmail:l.consentEmail?'Hola, '+l.name.split(' ')[0]+'. Gracias por tu interés. ¿Qué aspecto del programa te gustaría que revisáramos juntos?':'',mode:'catalogo'}:await api('/api/staff/leads/'+encodeURIComponent(id)+'/brief','POST',{})
    if(!panel.isConnected)return
    const list=values=>'<ul>'+arr(values).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>'
    panel.innerHTML='<p class="fine">'+(state.mode==='demo'?'Ejemplo ficticio':b.mode==='modelo'?'Preparado con el modelo conectado':'Preparado con los datos del expediente')+'</p><p>'+esc(b.summary)+'</p>'+(arr(b.signals).length?'<h4>Señales observadas</h4>'+list(b.signals):'')+'<h4>Acción sugerida</h4><p>'+esc(b.recommendedAction)+'</p>'+(b.nextStep?'<p class="fine">'+esc([b.nextStep.label,b.nextStep.detail,b.nextStep.channel?'Canal: '+b.nextStep.channel:'',b.nextStep.successSignal?'Señal de avance: '+b.nextStep.successSignal:''].filter(Boolean).join(' · '))+'</p>':'')+(arr(b.blockers).length?'<h4>Bloqueos</h4>'+list(b.blockers.map(x=>[x.label,x.detail].filter(Boolean).join(' · '))):'')+(b.modelReview?.detail?'<p class="fine">'+esc(b.modelReview.detail)+'</p>':'')+(arr(b.questions).length?'<h4>Preguntas para la conversación</h4>'+list(b.questions):'')+(b.draftEmail?'<label class="label">Borrador de correo · revisión del asesor<textarea id="brief-email" rows="5">'+esc(b.draftEmail)+'</textarea></label>'+action('Copiar borrador','copy-brief','ghost small'):'')
  }catch(e){panel.textContent=e.message}
}
async function copyBrief(){
  const email=$('#brief-email');if(!email)return
  try{await navigator.clipboard.writeText(email.value);notify('Borrador copiado.')}catch{email.focus();email.select();notify('Texto seleccionado. Usa la opción de copiar de tu dispositivo.')}
}
function articlePanel(id){
  const a=arr(state.data.articles).find(x=>x.id===id);if(!a)return
  const editable=a.status!=='archived'
  let src=''
  try{const u=new URL(a.sourceUrl);if(u.protocol==='https:')src='<p class="fine">Fuente académica · <a href="'+esc(u.href)+'" target="_blank" rel="noopener">Consultar programa oficial</a></p>'}catch{}
  showPanel('Revisión editorial','<div class="inline top-margin">'+badge(state.mode==='demo'&&a.status==='published'?'Vista previa publicada':word(a.status),a.status==='published'?'good':'warm')+'</div><p class="fine top-margin">Consulta de origen · '+esc(a.sourceQuery||'Sin consulta vinculada')+'</p>'+src+
  (editable?'<form id="article-form" class="form-stack" data-id="'+esc(a.id)+'"><label>Título<input name="title" required minlength="5" maxlength="170" value="'+esc(a.title)+'"></label><label>Descripción<textarea name="summary" required minlength="10" rows="2" maxlength="400">'+esc(a.summary)+'</textarea></label><label>Contenido<textarea name="body" rows="11" required minlength="100" maxlength="12000">'+esc(a.body)+'</textarea></label><label class="checkbox"><input required type="checkbox">He revisado la información académica, la fuente y el texto.</label><div class="error form-error" role="alert"></div><div class="actions"><button type="submit" class="btn">'+(state.mode==='demo'?'Publicar vista previa':a.status==='published'?'Actualizar publicación':'Publicar contenido')+'</button>'+(a.status==='draft'?action('Guardar borrador','save-article','ghost',item(a.id)):'')+action('Archivar','confirm-archive','ghost',item(a.id))+'</div></form>':'<div class="panel-block"><h3>'+esc(a.title)+'</h3><p>'+esc(a.summary)+'</p><div class="article-body">'+esc(a.body)+'</div></div>'),'Mesa de contenidos')
}
function authPanel(){
  if(state.mode==='live'){showPanel('Sesión de equipo','<p class="top-margin">Tienes acceso al espacio de admisiones.</p><div class="actions">'+action('Explorar demostración','demo','ghost')+(state.token?action('Cerrar sesión','logout','btn'):'')+'</div>');return}
  showPanel('Acceso del equipo','<p class="auth-help top-margin">Usa la credencial de equipo que te proporcionó el administrador. La clave solo se conserva en esta pestaña durante la sesión.</p><form id="access-form" class="form-stack"><label>Clave de acceso<input required type="password" name="token" autocomplete="off" spellcheck="false"></label><div class="error form-error" role="alert"></div><div class="actions"><button class="btn" type="submit">Acceder</button>'+action('Explorar demostración','demo','ghost')+'</div></form>')
}
function demoData(){
  const now=new Date();const moment=(days,hour=15)=>{const d=new Date(now);d.setUTCDate(d.getUTCDate()+days);d.setUTCHours(hour,0,0,0);return d.toISOString()}
  const demoLeads=[['Lucía Andrade','Nuevo','Correo','Ayudar a comparar opciones',-1],['Mateo Vera','En orientación','Orientador','Compartir una ruta de estudio',0],['Inés León','En postulación','Ficha de programa','Revisar requisitos',1],['Daniel Navas','Admitido','Portal','Resolver dudas sobre matrícula',2],['Sara Mora','Matriculado','Orientador','',null],['Emilia Rojas','Nuevo','Simulador','Conversar sobre inversión',3]]
  const examplePrograms=Object.keys(state.programTitles)
  const leads=demoLeads.map(([name,stage,src,next,due],i)=>({id:'ej-'+i,name,email:'aspirante'+(i+1)+'@example.org',phone:'',program:examplePrograms.length?examplePrograms[i%examplePrograms.length]:'',source:src,stage,owner:i%2?'Equipo de orientación':'',nextAction:next,dueAt:due==null?'':moment(due),paused:false,consentEmail:i%3!==0,consentVoice:false,createdAt:moment(-6-i),updatedAt:moment(-i),priority:i===0?'Alta':'Media'}))
  const tasks=leads.filter(l=>l.nextAction).map((l,i)=>({id:'t-'+i,leadId:l.id,title:l.nextAction,dueAt:l.dueAt,status:'pendiente'}))
  const events=leads.map((l,i)=>({id:'ev-'+i,leadId:l.id,description:'Solicitud de información registrada en la demostración.',actor:'Portal',createdAt:l.createdAt}))
  const integrations=['OpenAI','Claude','Gemini','Resend','Voz','Google Search Console','Semrush'].map(label=>({label,configured:false,detail:'Conexión simulada. Sin credenciales ni envíos externos.'}))
  return {leads,tasks,events,metrics:{},jobs:[{id:'j-1',leadId:'ej-1',channel:'email',kind:'followup',status:'paused',dueAt:moment(1)}],articles:[],integrations,opportunities:[{id:'op-ej',query:'cómo elegir una maestría según tu objetivo profesional',clicks:12,impressions:160,position:7.3,source:'Ejemplo simulado',updatedAt:moment(0)}]}
}
function demoCase(id){
  const l=state.data.leads.find(x=>x.id===id);if(!l)return null
  const checks=[['contacted','Primer contacto realizado'],['programChosen','Programa definido'],['documentsReviewed','Documentos revisados'],['financingReviewed','Financiamiento revisado'],['enrollmentVerified','Matrícula verificada']].map(([key,label])=>({key,label,done:key==='enrollmentVerified'?l.stage==='Matriculado':Boolean(l.demoChecklist?.[key])}))
  return {case:{...l,revision:1},student:l,nextStep:{title:l.nextAction,dueAt:l.dueAt},blockers:l.stage==='Matriculado'?[]:checks.filter(x=>!x.done).slice(0,2).map(x=>({key:x.key,label:x.label+' pendiente'})),checklist:checks,availableActions:stageNames,outcomes:[{key:'no_interes',label:'Sin interés'},{key:'sin_respuesta',label:'Sin respuesta'},{key:'pospuesto',label:'Pospuesto'},{key:'no_elegible',label:'No elegible'},{key:'otro',label:'Otro'}],evidence:l.demoEvidence?[{stage:l.stage,reference:l.demoEvidence}]:[]}
}
function demoWorkspace(key){
  const all=state.data.leads.map(l=>demoCase(l.id));const filters={today:x=>x.nextStep.dueAt&&iso(x.nextStep.dueAt)<=new Date(),overdue:x=>x.nextStep.dueAt&&iso(x.nextStep.dueAt)<new Date(),blocked:x=>x.blockers.length,unassigned:x=>!x.case.owner,all:()=>true};const names={today:'Para atender',overdue:'Vencidos',blocked:'Con bloqueos',unassigned:'Sin asignar',all:'Todos'};return {queue:all.filter(filters[key]||filters.all),queues:Object.entries(names).map(([k,label])=>({key:k,label,count:all.filter(filters[k]).length}))}
}
function demoNurture(id){
 if(id==='ej-1')return {signals:[{channel:'email',decision:'revision_humana',reason:'El aspirante consulta por financiamiento; conviene confirmar información vigente.',nextAction:'El asesor revisa las opciones y prepara una respuesta por el canal autorizado.',receivedAt:new Date().toISOString()}]}
 if(id==='ej-2')return {signals:[{channel:'voice',decision:'revision_humana',reason:'Solicitó hablar con una persona para comparar horarios.',nextAction:'Asignar una llamada de orientación al asesor.',receivedAt:new Date().toISOString()}]}
 return {signals:[]}
}
function demoConversations(){
 const leads=state.data.leads,now=new Date().toISOString()
 return {conversations:[{id:'conv-demo-email',provider:'email',subject:'Opciones de financiamiento',excerpt:'Quiero empezar el próximo semestre y me gustaría conocer las opciones de financiamiento. Prefiero que me respondan por correo.',occurredAt:now,contact:{name:leads[1].name},lead:leads[1],reviewStatus:'Por revisar',extraction:{programTitle:program(leads[1].program),intent:'inversion',obstacle:'Presupuesto o financiamiento',timeframe:'Próximo semestre',contactPreference:'email',evidence:[{field:'intent',quote:'me gustaría conocer las opciones de financiamiento'},{field:'contactPreference',quote:'Prefiero que me respondan por correo.'}],needsReview:true},demoPlan:'Revisar las opciones vigentes y responder por correo, si el permiso de contacto lo permite.'},{id:'conv-demo-call',provider:'call',subject:'Consulta tras llamada de orientación',excerpt:'La aspirante quiere comparar horarios y necesita hablar con un asesor antes de decidir.',occurredAt:now,contact:{name:leads[2].name},lead:leads[2],reviewStatus:'Por revisar',extraction:{programTitle:program(leads[2].program),intent:'solicitar_asesor',evidence:[{field:'intent',quote:'necesita hablar con un asesor antes de decidir'}],needsReview:true},demoPlan:'Asignar una tarea al asesor para confirmar horarios y acompañar la decisión.'}]}
}
function enableDemo(){
  closePanel();state.loadSeq++;state.searchSeq++;state.detailSeq++;state.mode='demo';state.data=demoData();state.citas={slots:[{id:'slot-demo',startAt:new Date(Date.now()+86400000).toISOString(),endAt:new Date(Date.now()+88200000).toISOString(),minutes:30,advisor:'María Torres',status:'available'}],appointments:[{id:'cita-demo',leadId:'ej-1',name:'Mateo Vera',email:'aspirante2@example.org',program:state.data.leads[1].program,preference:'Prefiere una conversación por la tarde',status:'requested'}]};state.citasError='';state.conversationError='';state.conversations=demoConversations();state.queueKey='today';state.workspace=demoWorkspace('today');state.intelligence={window:{days:30},sources:[{source:'Ejemplo simulado',status:'configured',detail:'Datos ficticios para explorar la mesa.'}],gaps:[],candidates:[{id:'candidate-demo',program:state.data.leads[1].program||'ejemplo',title:'Orientación de posgrados',query:'Cómo elegir una maestría',intent:'Orientación',action:'Revisar una guía para aspirantes que comparan opciones.',reasons:['Consulta frecuente en la demostración'],metrics:{leads:3,advanced:1,enrolled:0,impressions:160,clicks:12},opportunityId:'op-ej'}],campaigns:[]};state.intelligenceError='';state.analytics=null;state.currentDetail=null;state.leadResults=null;state.offset=0;state.hasNext=false;state.searchBusy=false;state.lookupFailed=false;render()
}
function showMenu(){const open=$('.app').classList.toggle('menu-open');$('.mobile-toggle').setAttribute('aria-expanded',String(open));$('.nav-scrim').hidden=!open}
function hideMenu(){if($('.app').classList.contains('menu-open'))showMenu()}
function errorFor(form,e){
  const node=form?.querySelector('.form-error')
  if(!node){notify(e.message);return}
  node.textContent=e.message
  if(e.status===409&&form.dataset.id){
    const id=form.dataset.id
    const refresh=['lead-form','case-form'].includes(form.id)?'reload-lead':'reload-article'
    node.insertAdjacentHTML('beforeend','<div class="top-margin">'+action('Descartar esta edición y cargar la versión actual',refresh,'ghost small',item(id))+'</div>')
  }
}
function leadChanges(original,fd){
  const patch={}
  const text=k=>String(fd.get(k)||'').trim()
  for(const key of ['owner','nextAction'])if(text(key)!==String(original[key]||''))patch[key]=text(key)
  if(fd.has('paused')!==Boolean(original.paused))patch.paused=fd.has('paused')
  const due=text('dueAt')
  if(due!==localMinute(original.dueAt))patch.dueAt=due?new Date(due+'-05:00').toISOString():null
  if(text('note'))patch.note=text('note')
  if(Object.keys(patch).length&&original.revision!==undefined)patch.revision=original.revision
  return patch
}
function demoLead(id,patch){
  const l=state.data.leads.find(l=>l.id===id);if(!l)throw Error('El aspirante ya no está en la demostración.')
  Object.assign(l,patch,{updatedAt:new Date().toISOString()});state.data.events.unshift({id:crypto.randomUUID(),leadId:l.id,description:patch.note||'El equipo actualizó el plan de seguimiento.',actor:'Equipo',createdAt:l.updatedAt})
  if(l.nextAction&&l.dueAt){const existing=state.data.tasks.find(t=>t.leadId===id&&isOpen(t));if(existing){existing.title=l.nextAction;existing.dueAt=l.dueAt}else state.data.tasks.unshift({id:crypto.randomUUID(),leadId:id,title:l.nextAction,dueAt:l.dueAt,status:'pendiente'})}
}
async function toggleTask(id){
  const t=arr(state.currentDetail?.tasks).find(x=>x.id===id)||arr(state.data.tasks).find(x=>x.id===id);if(!t)return
  const status=isOpen(t)?'hecha':'pendiente';const opened=$('#panel').open&&state.currentDetail?.lead?.id
  if(state.mode==='demo'){t.status=status;render()}
  else{await api('/api/staff/tasks/'+encodeURIComponent(id),'POST',{status});await load()}
  if(opened)await openLead(opened);notify(status==='hecha'?'Tarea marcada como completada.':'Tarea reabierta.')
}
async function growth(kind,id){
  if(state.mode==='demo'){
    if(kind==='draft'){const existing=state.data.articles.find(a=>a.sourceQuery===state.data.opportunities[0].query);if(!existing)state.data.articles.push({id:'ar-ej',title:'Cómo elegir una maestría para tu siguiente paso profesional',summary:'Una guía de ejemplo para comparar tus prioridades.',body:'Empieza por definir qué te gustaría hacer al terminar la maestría.\n\nCompara los objetivos de cada programa y revisa su información oficial. Anota las preguntas que quieras conversar con admisiones.',sourceQuery:state.data.opportunities[0].query,status:'draft'});state.contentTab='articulos';notify('Borrador de ejemplo preparado.')}
    else if(kind==='sync')notify('La demostración conserva la consulta ficticia. No se consultaron fuentes externas.')
    else notify('La demostración no realiza llamadas ni envía correos.')
    render();return
  }
  const path={draft:'/api/staff/seo/draft',sync:'/api/staff/seo/sync',run:'/api/staff/jobs/run'}[kind]
  const result=await api(path,'POST',kind==='draft'?{opportunityId:id}:{})
  if(kind==='draft')state.contentTab='articulos'
  await load({message:result.message||'Operación registrada.'})
}
async function changeArticle(id,actionName,fields={}){
  if(state.mode==='demo'){const a=state.data.articles.find(x=>x.id===id);Object.assign(a,fields,{status:actionName==='save'?a.status:actionName==='publish'?'published':'archived'});closePanel();render();notify(actionName==='publish'?'Vista previa publicada solo en esta demostración.':'Revisión guardada en la demostración.');return}
  const article=arr(state.data.articles).find(x=>x.id===id);const r=await api('/api/staff/articles/'+encodeURIComponent(id),'POST',{action:actionName,...fields,updatedAt:article?.updatedAt});closePanel();await load({message:r.message||'Estado editorial actualizado.'})
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const key=b.dataset.act,id=b.dataset.id
  const lock=async fn=>{b.disabled=true;try{await fn()}finally{b.disabled=false}}
  try{
    if(key==='menu')showMenu()
    else if(key==='close')closePanel()
    else if(key==='access')authPanel()
    else if(key==='logout'){state.token='';closePanel();await load()}
    else if(key==='refresh'&&state.mode==='demo'){render();notify('Estado de la demostración actualizado.')}
    else if(key==='reload'||key==='refresh')await lock(()=>load())
    else if(key==='demo')enableDemo()
    else if(key==='exit-demo'){state.mode='loading';state.data={};$('#content').innerHTML='<p class="loading">Consultando el espacio de admisiones…</p>';await load()}
    else if(key==='conversation')await lock(()=>openConversation(id))
    else if(key==='lead'||key==='reload-lead')await openLead(id)
    else if(key==='reload-article'){await load();if(state.mode==='live')articlePanel(id)}
    else if(key==='task')await lock(()=>toggleTask(id))
    else if(key==='reload-citas')await lock(loadCitas)
    else if(key==='appointment-action')await lock(()=>changeAppointment(id,b.dataset.value))
    else if(key==='slot-cancel')await lock(()=>changeAppointment(id,'cancel',true))
    else if(key==='reload-intelligence')await lock(refreshIntelligence)
    else if(key==='copy-campaign'){const c=arr(state.intelligence?.campaigns).find(x=>x.id===id),url=campaignLink(c?.launchUrl);if(!url)throw Error('El enlace de campaña no está disponible.');try{await navigator.clipboard.writeText(url);notify('Enlace copiado.')}catch{const input=b.parentElement.querySelector('input');input?.focus();input?.select();notify('Enlace seleccionado. Usa la opción de copiar de tu dispositivo.')}}
    else if(key==='campaign-brief')await lock(()=>campaignBrief(id))
    else if(key==='campaign-create')await lock(()=>campaignCreate(id))
    else if(key==='campaign-action')await lock(()=>campaignChange(id,b.dataset.value))
    else if(key==='queue')await lock(()=>loadQueue(b.dataset.value))
    else if(key==='layout'){state.layout=b.dataset.value;render()}
    else if(key==='task-tab'){state.taskTab=b.dataset.value;render()}
    else if(key==='demo-motor'){state.contentTab='oportunidades';render()}
    else if(key==='seo-tab'){state.contentTab=b.dataset.value;render()}
    else if(key==='next'||key==='previous'){state.offset=Math.max(0,state.offset+(key==='next'?50:-50));await searchLeads()}
    else if(key==='brief')await lock(()=>prepareBrief(id))
    else if(key==='copy-brief')await copyBrief()
    else if(key==='save-article'){const form=$('#article-form');const f=new FormData(form);try{await lock(()=>changeArticle(id,'save',{title:f.get('title'),summary:f.get('summary'),body:f.get('body')}))}catch(e){errorFor(form,e)}}
    else if(key==='sync'||key==='draft')await lock(()=>growth(key,id))
    else if(key==='article')articlePanel(id)
    else if(key==='confirm-run'){showPanel('Procesar cola de contacto','<p class="top-margin">Se procesarán los contactos vencidos que tengan permiso y un canal habilitado.</p><div class="actions">'+action('Procesar ahora','run','btn')+action('Cancelar','close')+'</div>')}
    else if(key==='run'){await lock(()=>growth('run'));closePanel()}
    else if(key==='confirm-archive'){showPanel('Archivar contenido','<p class="top-margin">El artículo dejará de aparecer en las guías publicadas.</p><div class="actions">'+action('Archivar artículo','archive','btn',item(id))+action('Volver a la revisión','article','ghost',item(id))+'</div>')}
    else if(key==='archive')await lock(()=>changeArticle(id,'archive'))
  }catch(err){if(err.status===409&&['campaign-action','campaign-create'].includes(key)){await refreshIntelligence();notify('La propuesta cambió. Se cargó la versión actual; revisa antes de continuar.')}else notify(err.message)}
})
document.addEventListener('submit',async e=>{
  const f=e.target;if(!['access-form','lead-form','article-form','slot-form','case-form','conversation-form'].includes(f.id)&&!f.classList.contains('assign-form'))return;e.preventDefault()
  const button=f.querySelector('[type=submit]');button.disabled=true
  const err=f.querySelector('.form-error');if(err)err.textContent=''
  const fd=new FormData(f);const val=k=>String(fd.get(k)||'').trim()
  try{
    if(f.id==='conversation-form'){
      const result=$('#conversation-result');result.innerHTML='<p class="fine">Analizando el ejemplo…</p>';try{const data=await api('/api/demo/conversacion','POST',{channel:val('channel'),text:val('text')});showConversationResult(result,data)}catch(ex){result.innerHTML='<p class="error">No se pudo analizar el ejemplo: '+esc(ex.message)+'</p>'}
    }else if(f.classList.contains('assign-form')){
      if(state.mode==='demo'){const a=state.citas.appointments.find(x=>x.id===f.dataset.id),slot=state.citas.slots.find(x=>x.id===val('slotId')&&x.status==='available');if(!slot)throw Error('El horario ya no está disponible.');Object.assign(a,{slotId:slot.id,startAt:slot.startAt,endAt:slot.endAt,advisor:slot.advisor,status:'booked'});slot.status='booked';render();notify('Horario confirmado en la demostración.')}else{await api('/api/staff/citas/'+encodeURIComponent(f.dataset.id),'POST',{action:'assign',slotId:val('slotId')});await loadCitas();notify('Horario confirmado.')}
    }else if(f.id==='case-form'){
      const c=state.caseDetail;if(!c||c.case.id!==f.dataset.id)throw Error('Vuelve a abrir el expediente.');const checklist={};arr(c.checklist).filter(x=>x.key!=='enrollmentVerified').forEach(x=>{checklist[x.key]=fd.has(x.key)});const body={revision:c.case.revision,checklist,stage:val('stage'),evidence:val('evidence'),reason:val('reason'),outcome:val('outcome'),decisionAt:val('decisionAt')||null,blocker:val('blocker')};if(!body.evidence)delete body.evidence;if(!body.reason)delete body.reason;if(!body.outcome)delete body.outcome;if(state.mode==='demo'){const l=state.data.leads.find(x=>x.id===f.dataset.id);if(body.stage!==l.stage&&body.stage==='Matriculado'&&l.stage!=='Admitido')throw Error('La matrícula requiere admisión previa.');if(body.stage!==l.stage&&body.stage==='Admitido'&&l.stage!=='En postulación')throw Error('La admisión requiere una postulación previa.');if(body.stage!==l.stage&&['Admitido','Matriculado'].includes(body.stage)&&!body.evidence)throw Error('Registra una referencia de evidencia para este avance.');if(body.stage==='Cerrado'&&(!body.reason||!body.outcome))throw Error('Selecciona el resultado y registra el motivo del cierre.');l.stage=body.stage;l.demoChecklist=checklist;l.demoEvidence=body.evidence;state.workspace=demoWorkspace(state.queueKey);render()}else{await api('/api/staff/workspace/'+encodeURIComponent(f.dataset.id),'PATCH',body);await load();}await openLead(f.dataset.id);notify('Avance guardado.')
    }else if(f.id==='slot-form'){
      const startAt=new Date(val('startAt')+'-05:00').toISOString(),minutes=Number(val('minutes')),advisor=val('advisor')
      if(state.mode==='demo'){const start=Date.parse(startAt),end=start+minutes*60000;if(state.citas.slots.some(s=>s.status!=='cancelled'&&s.advisor.toLowerCase()===advisor.toLowerCase()&&start<Date.parse(s.endAt)&&end>Date.parse(s.startAt)))throw Error('El asesor ya tiene un horario en ese intervalo.');state.citas.slots.push({id:crypto.randomUUID(),startAt,endAt:new Date(end).toISOString(),minutes,advisor,status:'available'});render();notify('Horario publicado en la demostración.')}
      else{await api('/api/staff/citas/slots','POST',{startAt,minutes,advisor});await loadCitas();notify('Horario publicado.')}
    }else if(f.id==='access-form'){
      state.token=val('token');await load()
      if(state.mode!=='live'){state.token='';throw Error(state.blockedReason||'No se pudo iniciar la sesión.')}
      closePanel();notify('Sesión de admisiones iniciada.')
    }else if(f.id==='lead-form'){
      const original=state.currentDetail?.lead
      if(!original||original.id!==f.dataset.id)throw Error('Vuelve a abrir la ficha para actualizarla.')
      const patch=leadChanges(original,fd)
      if(!Object.keys(patch).length){notify('No hay cambios pendientes.');return}
      if(state.mode==='demo'){demoLead(f.dataset.id,patch);state.leadResults=null;render()}
      else{await api('/api/staff/leads/'+encodeURIComponent(f.dataset.id),'POST',patch);await load()}
      await openLead(f.dataset.id);notify('Seguimiento guardado.')
    }else if(f.id==='article-form')await changeArticle(f.dataset.id,'publish',{title:val('title'),summary:val('summary'),body:val('body')})
  }catch(ex){errorFor(f,ex)}finally{button.disabled=false}
})
let debounce
document.addEventListener('input',e=>{if(e.target.id==='lead-search'){state.query=e.target.value;state.offset=0;state.searchSeq++;clearTimeout(debounce);debounce=setTimeout(searchLeads,240)}})
document.addEventListener('change',e=>{if(e.target.id==='stage-filter'){state.stage=e.target.value;state.offset=0;clearTimeout(debounce);searchLeads()}})
window.addEventListener('hashchange',()=>{hideMenu();closePanel();render();if(state.view==='aspirantes'&&['live','demo'].includes(state.mode))searchLeads();window.scrollTo(0,0)})
$('#panel').addEventListener('close',()=>{state.detailSeq++;state.currentDetail=null;if(state.lastFocus?.isConnected)state.lastFocus.focus()})
$('#panel').addEventListener('click',e=>{if(e.target!==$('#panel'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel()})
try{state.programTitles=JSON.parse($('#catalog-map')?.textContent||'{}')}catch{}
if(publicDemo||$('.app').dataset.initialMode==='demo'||new URLSearchParams(location.search).get('demo')==='1')enableDemo()
else load()
})()
