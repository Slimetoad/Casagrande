const navigation = [
  ['resumen', 'Resumen', 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  ['aspirantes', 'Aspirantes', 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 4a4 4 0 0 1 0 7 M20 21v-2a4 4 0 0 0-3-3.8'],
  ['conversaciones', 'Conversaciones', 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5'],
  ['agenda', 'Agenda', 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 11h16 M8 15h3'],
  ['contenidos', 'Contenido SEO', 'M4 4h11l5 5v11H4z M14 4v6h6 M8 14h8 M8 17h5'],
  ['agentes', 'Agentes y canales', 'M5 7h14 M5 17h14 M9 4v6 M15 14v6']
]
function icon(path) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'+path+'"/></svg>'
}
function editorialPage() {
  return `<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motor de contenidos · Posgrados UCG</title><meta name="description" content="Consulta el plan editorial y las guías publicadas de posgrados de la Universidad Casa Grande."><link rel="stylesheet" href="/crm.css"><link rel="stylesheet" href="/seo-insights.css"><link rel="icon" href="/favicon.svg"></head><body class="editorial-public">
<a href="#main" class="skip">Saltar al contenido</a>
<header class="editorial-masthead"><div class="editorial-wrap">
  <a href="/" aria-label="Universidad Casa Grande · Inicio de posgrados"><img src="/media/ucg-logo.png" alt="Universidad Casa Grande" width="500" height="158"></a>
  <nav aria-label="Explorar la plataforma"><a href="/plataforma">Ver la plataforma</a><a href="/">Portal del aspirante</a><a href="/crm">CRM de muestra</a><a href="/equipo#contenidos">Acceso del equipo</a></nav>
</div></header>
<main id="main" tabindex="-1">
  <section class="editorial-hero"><div class="editorial-wrap"><div>
    <p class="eyebrow">Posgrados · Universidad Casa Grande</p><h1>Motor de <span>contenidos.</span></h1>
    <p>Consulta qué temas prepara el equipo editorial para cada maestría y lee las guías que ya están disponibles.</p>
  </div><figure><img src="/media/campus-building.webp" alt="Fachada de la Universidad Casa Grande" width="575" height="800" fetchpriority="high"></figure></div></section>
  <div class="editorial-wrap editorial-public-content">
    <nav class="editorial-jumps" aria-label="Secciones del motor"><a class="btn orange" href="#plan-editorial">Plan editorial</a><a class="ghost" href="#hallazgos-seo">Hallazgos SEO</a><a class="ghost" href="#guias-editoriales">Guías publicadas</a><a class="ghost" href="#fuentes-editoriales">Fuentes de búsqueda</a><a class="ghost" href="#demostracion-editorial">Probar demostración</a></nav>
    <div id="hallazgos-seo" data-seo-insights="public"><h2>Hallazgos SEO</h2><p>Activa JavaScript para explorar las cifras por página.</p></div>
    <div id="editorial-public-data"><section id="plan-editorial"><h2>Plan editorial</h2><p class="loading" role="status">Consultando el plan vigente…</p></section><section id="guias-editoriales"><h2>Guías publicadas</h2><a href="/guias">Consultar todas las guías</a></section><section id="fuentes-editoriales"><h2>Fuentes de búsqueda</h2></section></div>
    <section class="editorial-demo block" id="demostracion-editorial">
      <p class="eyebrow">Ejemplo ficticio</p><h2>Prueba la revisión de una guía</h2><p>Prepara una muestra, edita el texto y revisa cómo se vería. Los cambios quedan en esta página.</p>
      <button type="button" class="ghost" id="editorial-demo-start">Preparar muestra</button><div id="editorial-demo-content"></div>
      <noscript><p>Activa JavaScript para hacer la demostración en esta página.</p></noscript>
    </section>
  </div>
</main>
<footer class="editorial-public-footer"><div class="editorial-wrap"><a href="/plataforma">Ver la plataforma</a><span>Posgrados · Guayaquil, Ecuador</span></div></footer>
<script src="/crm-client.js" defer></script><script src="/seo-insights.js" defer></script></body></html>`;
}
export function renderCRM(path, options={}) {
  if (path === '/motor-de-contenidos') return editorialPage();
  return `<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#1e2324"><title>Admisiones · Posgrados UCG</title><meta name="description" content="Consola de seguimiento de aspirantes y admisiones de posgrados."><link rel="stylesheet" href="/crm.css"><link rel="stylesheet" href="/seo-insights.css"><link rel="icon" href="/favicon.svg"></head><body>
<a href="#main" class="skip">Saltar al contenido</a>
<div class="app" data-initial-mode="${options.demo ? 'demo' : 'equipo'}"><aside class="rail" id="rail" aria-label="Navegación principal">
  <a class="brand" href="/" aria-label="Posgrados de la Universidad Casa Grande"><img class="official-logo" src="/media/ucg-logo-light.png" width="166" height="53" alt="Universidad Casa Grande"></a>
  <div class="rail-rule"></div><p class="section-label rail-label">Admisiones</p>
  <nav>${navigation.map(([key,label,d])=>`<a href="#${key}" data-view="${key}" ${key==='resumen'?'aria-current="page"':''}>${icon(d)}<span>${label}</span></a>`).join('')}</nav>
  <div class="rail-bottom"><a href="/plataforma" class="portal-link">← Ver la plataforma</a><a href="/crm" class="portal-link">CRM · demostración</a><a href="/motor-de-contenidos" class="portal-link">Motor de contenidos</a><a href="/equipo/manual" class="portal-link">${icon('M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z M12 6v15')} Manual del equipo</a><a href="/" class="portal-link">${icon('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0')} Portal del aspirante</a><div class="identity"><span class="avatar">AD</span><div><strong>Equipo de admisiones</strong><small>Universidad Casa Grande</small></div></div></div>
</aside><button type="button" class="nav-scrim" aria-label="Cerrar menú" hidden data-act="menu"></button>
<div class="workspace"><div class="product-tabs" aria-label="Explorar la plataforma"><a href="/">Portal</a><a href="/crm">CRM</a><a href="/motor-de-contenidos">Motor de contenidos</a><a href="/plataforma">Ver la plataforma</a><a href="/equipo">Acceso interno</a></div><header class="topbar"><button class="mobile-toggle ghost" type="button" data-act="menu" aria-controls="rail" aria-expanded="false">Menú</button><div class="crumb">Posgrados <span>/</span> <b id="crumb-title">Resumen</b></div><div class="top-actions"><span id="mode-indicator" class="mode-indicator">Área de equipo</span><button id="auth-action" data-act="access" class="ghost small" type="button">Acceso</button></div></header>
<main id="main" tabindex="-1"><div id="content"><header class="page-head"><div><p class="eyebrow">Equipo de admisiones</p><h1>Hoy en admisiones<span>.</span></h1></div></header><p class="loading">Consultando tu espacio de trabajo…</p></div></main>
</div></div><dialog id="panel" aria-labelledby="panel-title"><div id="panel-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div><noscript><p>Activa JavaScript para consultar la consola de admisiones.</p></noscript><script id="catalog-map" type="application/json">${JSON.stringify(Object.fromEntries((options.programs||[]).map(p=>[p.slug,p.shortTitle||p.title]))).replaceAll('<','\\u003c')}</script><script src="/crm-client.js" defer></script><script src="/seo-insights.js" defer></script></body></html>`
}
