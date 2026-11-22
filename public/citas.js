(()=>{
  const form=document.getElementById('booking-form')
  if(!form)return
  const main=document.getElementById('booking-main'),out=document.getElementById('booking-confirm'),list=document.getElementById('slot-list'),error=document.getElementById('booking-status'),pref=document.getElementById('booking-preference')
  const submit=form.querySelector('button[type=submit]')
  const format=new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})
  const statuses={requested:'Solicitud recibida',booked:'Asesoría reservada',completed:'Asesoría realizada',no_show:'Asistencia pendiente de seguimiento',cancelled:'Solicitud cancelada'}
  let key=crypto.randomUUID(),sending=false,available=[],slotsReady=false
  const node=(tag,txt,cls='')=>{const e=document.createElement(tag);e.textContent=txt;if(cls)e.className=cls;return e}
  async function api(path,body,extra={}) {
    const r=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined,cache:'no-store'})
    const data=await r.json().catch(()=>({}))
    if(!r.ok)throw Object.assign(new Error(data.error||'No pudimos completar la solicitud. Inténtalo nuevamente.'),{status:r.status})
    return data
  }
  function bookingCampaign() {
    if (navigator.globalPrivacyControl || ['1','yes'].includes(navigator.doNotTrack) || window.doNotTrack === '1') return {}
    const query = new URLSearchParams(location.search)
    let saved = {}
    try { saved = JSON.parse(sessionStorage.getItem('ucg-campaign') || '{}') || {} } catch {}
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
    const current = keys.some(key => query.has(key))
    const campaign = {}
    for (const key of keys) {
      const raw = current ? query.get(key) : saved[key]
      if (typeof raw === 'string' && raw.trim()) campaign[key] = raw.trim().slice(0,100)
    }
    return campaign
  }
  function resetKey(){if(!sending)key=crypto.randomUUID()}
  function scheduleChoice(){
    const picked=form.querySelector('input[name=slotId]:checked')?.value
    pref.hidden=!!picked
    submit.textContent=picked?'Reservar asesoría':'Solicitar horario'
  }
  async function loadSlots(){
    submit.disabled=true;slotsReady=false
    try{
      const data=await api('/api/citas');available=data.slots;list.replaceChildren()
      if(!available.length)list.append(node('p','Aún no hay horarios publicados. Puedes pedir que el equipo te proponga uno.'))
      else {
        function choice(val,label,checked=false){const line=node('label','','slot-option'),radio=document.createElement('input');radio.type='radio';radio.name='slotId';radio.value=val;radio.checked=checked;radio.addEventListener('change',scheduleChoice);line.append(radio,node('span',label));list.append(line)}
        available.forEach(s=>choice(s.id,format.format(new Date(s.startAt))+' · '+s.minutes+' min · '+s.advisor))
        choice('','Quiero que me propongan otro horario',true)
      }
      scheduleChoice();slotsReady=true;submit.disabled=false
    }catch{list.replaceChildren(node('p','La agenda no pudo cargarse. Puedes volver a consultar la disponibilidad.'));const retry=node('button','Volver a consultar','booking-link');retry.type='button';retry.onclick=loadSlots;list.append(retry)}
  }
  function calendar(a){
    const ts=s=>new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
    const data=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Posgrados//Asesoria//ES','BEGIN:VEVENT','UID:'+a.calendarId+'@posgrados','DTSTAMP:'+ts(Date.now()),'DTSTART:'+ts(a.startAt),'DTEND:'+ts(a.endAt),'SUMMARY:Asesoría telefónica de posgrados','DESCRIPTION:Hora de Guayaquil. Consulta tu enlace privado para gestionar la reserva.','END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n'
    const url=URL.createObjectURL(new Blob([data],{type:'text/calendar;charset=utf-8'})),aTag=document.createElement('a');aTag.href=url;aTag.download='asesoria-posgrados.ics';aTag.click();setTimeout(()=>URL.revokeObjectURL(url),1200)
  }
  function show(a){
    main.hidden=true;out.hidden=false;out.replaceChildren(node('span','Tu agenda','booking-success'),node('h2',statuses[a.status]||'Tu solicitud'))
    if(a.status==='requested')out.append(node('p','El equipo revisará tu preferencia y podrá contactarte para acordar una fecha. Tu cita se confirma cuando tenga un horario asignado.'))
    if(a.startAt)out.append(node('p',format.format(new Date(a.startAt))+' · Hora de Guayaquil'+(a.advisor?' · '+a.advisor:'')))
    const actions=node('div','','booking-actions');out.append(actions)
    function button(label,fn,style='btn btn-outline'){const b=node('button',label,style);b.type='button';b.onclick=fn;actions.append(b);return b}
    if(a.status==='booked')button('Añadir a mi calendario',()=>calendar(a),'btn btn-primary')
    if(['requested','booked'].includes(a.status)){
      const management=location.origin+'/cita#gestion='+key
      button('Copiar enlace privado',async()=>{try{await navigator.clipboard.writeText(management);status.textContent='Enlace copiado.'}catch{status.textContent=management}})
      button('Cancelar solicitud',()=>{actions.hidden=true;const prompt=node('div');prompt.append(node('p','¿Quieres cancelar esta solicitud de asesoría?'));const yes=node('button','Sí, cancelar','btn btn-outline'),no=node('button','Conservar solicitud','booking-link');yes.onclick=async()=>{yes.disabled=true;try{const r=await api('/api/citas/gestionar',{key,action:'cancel'});show(r.appointment)}catch(e){status.textContent=e.message;yes.disabled=false}};no.onclick=()=>{prompt.remove();actions.hidden=false};prompt.append(yes,no);out.append(prompt)},'booking-link')
      out.append(node('p','Guarda el enlace privado para consultar o cancelar tu solicitud.','booking-caption'))
    }
    const status=node('p','','manage-url');status.setAttribute('role','status');out.append(status)
    const back=node('a','Explorar las maestrías','booking-link');back.href='/programas';out.append(back)
  }
  form.addEventListener('input',resetKey)
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(sending||!form.reportValidity())return;sending=true;submit.disabled=true;error.textContent=''
    const fd=new FormData(form),data=Object.fromEntries(fd);data.consentCita=fd.has('consentCita')
    if(data.slotId)data.preference='indiferente'
    data.campaign=bookingCampaign()
    try{const r=await api('/api/citas/solicitar',data,{'Idempotency-Key':key});history.replaceState(null,'','#gestion='+key);show(r.appointment);document.dispatchEvent(new CustomEvent('ucg:conversion',{detail:{event:r.status==='booked'?'appointment_booked':'appointment_requested'}}))}
    catch(e){error.textContent=e.message;if(e.status===409)await loadSlots()}
    finally{sending=false;submit.disabled=!slotsReady}
  })
  const token=new URLSearchParams(location.hash.slice(1)).get('gestion')
  if(token){key=token;main.hidden=true;api('/api/citas/gestionar',{key,action:'view'}).then(r=>show(r.appointment)).catch(e=>{out.hidden=false;out.replaceChildren(node('h2','Consultar mi solicitud'),node('p',e.message));const back=node('a','Volver a la agenda');back.href='/cita';out.append(back)})}
  else loadSlots()
})()
