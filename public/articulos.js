(() => {
  'use strict';
  const article=document.querySelector('[data-editorial-article]');
  const slug=article?.getAttribute('data-editorial-article');
  const allowed=()=>!navigator.globalPrivacyControl && !['1','yes'].includes(navigator.doNotTrack) && !['1','yes'].includes(window.doNotTrack);
  if(!article || !slug || slug.length>100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return;
  if(allowed()) for(const link of article.querySelectorAll('[data-editorial-cta]')) {
    const target=new URL(link.href,location.href);
    if(target.origin!==location.origin || !['/solicitar'].includes(target.pathname) && !target.pathname.startsWith('/programas/'))continue;
    target.searchParams.set('utm_source','guia');target.searchParams.set('utm_medium','editorial');target.searchParams.set('utm_content',slug);link.href=target.href;
  }
  const send=event=>{if(allowed())fetch('/api/editorial/medir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,event}),keepalive:true}).catch(()=>{});};
  send('view');
  article.addEventListener('click',event=>{const link=event.target.closest?.('[data-editorial-cta]');if(link && article.contains(link))send('click');});
})();
