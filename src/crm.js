const navigation = [
  ['resumen', 'Resumen', 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  ['aspirantes', 'Aspirantes', 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 4a4 4 0 0 1 0 7 M20 21v-2a4 4 0 0 0-3-3.8'],
  ['agenda', 'Agenda', 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 11h16 M8 15h3'],
  ['contenidos', 'Contenido SEO', 'M4 4h11l5 5v11H4z M14 4v6h6 M8 14h8 M8 17h5'],
  ['agentes', 'Agentes y canales', 'M5 7h14 M5 17h14 M9 4v6 M15 14v6']
]
function icon(path) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'+path+'"/></svg>'
}
export function renderCRM(path, options={}) {
  return `<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#1e2324"><title>Admisiones · Posgrados UCG</title><meta name="description" content="Consola de seguimiento de aspirantes y admisiones de posgrados."><link rel="stylesheet" href="/crm.css"><link rel="icon" href="/favicon.svg"></head><body>
<a href="#main" class="skip">Saltar al contenido</a>
<div class="app" data-initial-mode="${options.demo ? 'demo' : 'equipo'}"><aside class="rail" id="rail" aria-label="Navegación principal">
  <a class="brand" href="/" aria-label="Posgrados de la Universidad Casa Grande"><img class="official-logo" src="/media/ucg-logo-light.png" width="166" height="53" alt="Universidad Casa Grande"></a>
  <div class="rail-rule"></div><p class="section-label rail-label">Admisiones</p>
  <nav>${navigation.map(([key,label,d])=>`<a href="#${key}" data-view="${key}" ${key==='resumen'?'aria-current="page"':''}>${icon(d)}<span>${label}</span></a>`).join('')}</nav>
  <div class="rail-bottom"><a href="/equipo/manual" class="portal-link">${icon('M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z M12 6v15')} Manual del equipo</a><a href="/" class="portal-link">${icon('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0')} Portal del aspirante</a><div class="identity"><span class="avatar">AD</span><div><strong>Equipo de admisiones</strong><small>Universidad Casa Grande</small></div></div></div>
</aside><button type="button" class="nav-scrim" aria-label="Cerrar menú" hidden data-act="menu"></button>
<div class="workspace"><header class="topbar"><button class="mobile-toggle ghost" type="button" data-act="menu" aria-controls="rail" aria-expanded="false">Menú</button><div class="crumb">Posgrados <span>/</span> <b id="crumb-title">Resumen</b></div><div class="top-actions"><span id="mode-indicator" class="mode-indicator">Área de equipo</span><button id="auth-action" data-act="access" class="ghost small" type="button">Acceso</button></div></header>
<main id="main" tabindex="-1"><div id="content"><header class="page-head"><div><p class="eyebrow">Equipo de admisiones</p><h1>Hoy en admisiones<span>.</span></h1></div></header><p class="loading">Consultando tu espacio de trabajo…</p></div></main>
</div></div><dialog id="panel" aria-labelledby="panel-title"><div id="panel-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div><noscript><p>Activa JavaScript para consultar la consola de admisiones.</p></noscript><script id="catalog-map" type="application/json">${JSON.stringify(Object.fromEntries((options.programs||[]).map(p=>[p.slug,p.shortTitle||p.title]))).replaceAll('<','\\u003c')}</script><script src="/crm-client.js" defer></script></body></html>`
}
