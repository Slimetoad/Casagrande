(() => {
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return
  let source = 'directo'
  try {
    const params = new URLSearchParams(location.search)
    const ref = document.referrer && new URL(document.referrer)
    if (params.has('utm_source') || params.has('utm_campaign') || params.has('gclid')) source = 'campana'
    else if (ref?.origin === location.origin) source = 'interno'
    else if (ref && /(^|\.)(google\.[\w.]+|bing\.com|duckduckgo\.com)$/.test(ref.hostname)) source = 'busqueda'
    else if (ref && /(^|\.)(instagram|facebook|tiktok|linkedin)\.com$/.test(ref.hostname)) source = 'social'
    else if (ref) source = 'referencia'
  } catch { /* Referencia vacía. */ }
  const once = new Set()
  function log(event, unique = false) {
    if (unique && once.has(event)) return
    if (unique) once.add(event)
    fetch('/api/analytics', {method:'POST', credentials:'same-origin', keepalive:true, headers:{'Content-Type':'application/json'}, body:JSON.stringify({event,source})}).catch(()=>{})
  }
  log('page_view')
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]')
    if (a && a.origin === location.origin && ['/solicitar','/cita'].includes(a.pathname)) log('cta_click')
  })
  document.addEventListener('ucg:conversion', e=>{
    if (['quiz_complete','calculator_use','lead_created','chat_open','appointment_booked','appointment_requested'].includes(e.detail?.event)) log(e.detail.event,true)
  })
})()

;(()=>{
  if(navigator.globalPrivacyControl||navigator.doNotTrack==='1')return
  const match=location.pathname.match(/^\/programas\/([a-z0-9-]+)\/?$/)
  if(!match)return
  const program=match[1]
  function tally(event,variant=''){
    fetch('/api/hubs',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({program,event,variant})}).catch(()=>{})
  }
  tally('hub_view')
  const link=document.querySelector('[data-hub-inquiry]'),label=link?.querySelector('[data-hub-copy]')
  if(!label)return
  try{
    const prefix='ucg-hub-experiment-'+program
    let variant=sessionStorage.getItem(prefix)
    if(!['A','B'].includes(variant)){variant=crypto.getRandomValues(new Uint8Array(1))[0]<128?'A':'B';sessionStorage.setItem(prefix,variant)}
    label.textContent=variant==='A'?'Solicitar información':'Hablar sobre esta maestría'
    const record=event=>{const k=prefix+':'+event;if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');tally(event,variant)}
    const observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting)){record('exposure');observer.disconnect()}},{threshold:.5})
    observer.observe(link)
    link.addEventListener('click',()=>{record('exposure');record('inquiry_click');sessionStorage.setItem('ucg-last-hub-click',program)})
  }catch{}
})()
