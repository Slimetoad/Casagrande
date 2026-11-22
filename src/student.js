const privacy = "https://www.casagrande.edu.ec/politica-de-privacidad";
const official = "https://www.casagrande.edu.ec/posgrados";
const pilotCopy = "Portal piloto de orientación. Las postulaciones oficiales se realizan en Universidad Casa Grande.";
const hero = "/media/campus-hero.webp";
const campus = "/media/campus-building.webp";
const logo = "/media/ucg-logo.png";

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const json = value => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
const urlFor = p => "/programas/" + encodeURIComponent(p.slug);
const enquiry = (slug = "", source = "programa") => "/solicitar?" + new URLSearchParams({ ...(slug ? { programa: slug } : {}), origen: source }).toString();
const appointment = (slug = "") => slug ? "/cita?" + new URLSearchParams({ programa: slug }).toString() : "/cita";
const areaUrl = area => "/programas?" + new URLSearchParams({ area }).toString();
const areasOf = ps => [...new Set(ps.map(p => p.area).filter(Boolean))];
const option = (value, label = value) => `<option value="${escape(value)}">${escape(label)}</option>`;
const imageOf = p => p.image || hero;
const amount = value => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const safeUrl = value => { try { const u = new URL(value); return u.protocol === "https:" ? u.href : official; } catch { return official; } };
const icons = {
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16.5 7.5-2.8 6.2-6.2 2.8 2.8-6.2Z"/>',
  chat:'<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.3a2.5 2.5 0 0 1-1-2Z"/><path d="M8 9h8m-8 3h5"/>',
  calc:'<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 7h8m-8 4h1m3 0h1m3 0h.1m-8 4h1m3 0h1m3 0h.1"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  menu:'<path d="M3 7h18M3 12h18M3 17h18"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  book:'<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1Z"/><path d="M12 6v14"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 6 8 6 8-6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5m-18 5 9 4 9-4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  scale:'<path d="M5 21V8m7 13V3m7 18v-9M3 8h4m3-5h4m3 9h4"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  external:'<path d="M8 16 18 6M9 6h9v9"/>',
  down:'<path d="M12 4v15m-6-6 6 6 6-6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h3"/>',
  bookmark:'<path d="M6 4h12v17l-6-4-6 4z"/>',
  educators:'<path d="m2 9 10-6 10 6-10 6zm4 3v5c3 3 9 3 12 0v-5m4-3v7"/>',
  tech:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4m-12-3h4"/>',
  building:'<path d="M3 21h18M5 21V8l10-5v18m0-12h4v12M8 10h3m-3 4h3m-3 4h3"/>',
  health:'<path d="M12 20 4.8 13A4.5 4.5 0 0 1 12 7.7 4.5 4.5 0 0 1 19.2 13Z"/><path d="M7 12h3l1-2 2 4 1-2h3"/>',
  shield:'<path d="M12 22c5-3 8-6 8-11V6l-8-4-8 4v5c0 5 3 8 8 11z"/><path d="m8 12 3 3 5-6"/>'
};
const disciplines = {
  Negocios: ["business", "scale"],
  Tecnología: ["technology", "tech"],
  Comunicación: ["communication", "chat"],
  Educación: ["education", "educators"],
  Derecho: ["law", "shield"],
  Salud: ["health", "health"],
  Arquitectura: ["architecture", "building"]
};
function icon(name, size = 20) { return `<svg aria-hidden="true" height="${size}" width="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ""}</svg>`; }
function link(href, text, style="primary", glyph="") { return `<a class="btn btn-${style}" href="${escape(href)}">${glyph ? icon(glyph,18) : ""}${escape(text)}</a>`; }
const kicker = text => `<div class="kicker"><span aria-hidden="true"></span>${escape(text)}</div>`;
const heading = (over,title,body="") => `<div class="section-heading">${kicker(over)}<h2>${escape(title)}</h2>${body ? `<p>${escape(body)}</p>` : ""}</div>`;
function crumbs(items) {
  return `<nav class="crumbs" aria-label="Ruta de navegación"><a href="/">Posgrados</a>${items.map(([label,url])=>`<span aria-hidden="true">/</span>${url ? `<a href="${escape(url)}">${escape(label)}</a>` : `<span aria-current="page">${escape(label)}</span>`}`).join("")}</nav>`;
}
function header(path) {
  const nav = [["/programas","Maestrías"],["/orientacion","Orientación"],["/financiamiento","Simulador"],["/guias","Guías"]];
  return `<a class="skip-link" href="#contenido">Saltar al contenido</a><header class="masthead"><div class="nav-wrap"><a class="brand-lock" aria-label="Universidad Casa Grande, inicio de Posgrados" href="/"><img src="${logo}" alt="Universidad Casa Grande" width="500" height="158"><span>Posgrados</span></a><button id="menu-toggle" type="button" class="icon-button menu-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="site-nav">${icon("menu")}</button><nav id="site-nav" aria-label="Navegación principal">${nav.map(([href,title])=>`<a ${path.startsWith(href)?'aria-current="page"':''} href="${href}">${title}</a>`).join("")}<a class="button-nav" href="/solicitar?origen=navegacion">Solicitar información ${icon("external",16)}</a></nav></div></header>`;
}
function footer(institutionalLive) {
  return `<footer class="footer"><div class="wrap"><div class="footer-grid"><div><a class="footer-brand" href="/"><img src="/media/ucg-logo-light.png" alt="Universidad Casa Grande"></a><p>Posgrados · Guayaquil, Ecuador</p></div><div><strong>Explora</strong><a href="/programas">Maestrías</a><a href="/orientacion">Orientación</a><a href="/guias">Guías de posgrado</a></div><div><strong>Admisiones</strong><a href="/solicitar?origen=pie">Solicitar información</a><a href="/cita">Agendar una cita</a><a href="/financiamiento">Simulador de inversión</a><a href="tel:+59343726250">+593 4 372 6250</a></div></div>${institutionalLive?"":`<p class="pilot-footer">${pilotCopy}</p>`}<div class="footer-base"><a href="${official}" rel="external noreferrer">Sitio institucional de UCG</a><a href="${privacy}" rel="external noreferrer">Privacidad</a><a href="/equipo">Acceso del equipo</a></div></div></footer>`;
}
function assistantWidget() {
  return `<button class="chat-launch" id="chat-launch" type="button" aria-label="Abrir asistente de posgrados" aria-expanded="false" aria-controls="chat-panel">${icon("chat",22)}<span>¿Te orientamos?</span></button><aside class="chat-panel" id="chat-panel" aria-label="Asistente de posgrados" hidden><div class="chat-head"><div><small>Posgrados UCG</small><strong>Asistente de orientación</strong></div><button type="button" class="icon-button" id="chat-close" aria-label="Cerrar asistente">${icon("close")}</button></div><div class="chat-log" id="chat-log" role="log" aria-live="polite"><p class="chat-answer">Hola. Puedo ayudarte a explorar las maestrías y encontrar dónde consultar requisitos o inversión.</p></div><div id="chat-options" class="chat-options"><button type="button">¿Qué maestrías hay?</button><button type="button">¿Cómo consulto el costo?</button></div><form id="chat-form"><label class="sr-only" for="chat-msg">Tu pregunta</label><input id="chat-msg" name="message" placeholder="Escribe tu pregunta" maxlength="800" required autocomplete="off"><button type="submit">Enviar</button></form><div class="chat-fine">Asistente virtual · <a href="/solicitar?origen=asistente">Hablar con admisiones</a></div></aside>`;
}
function card(p, compare=false, hidden=false) {
  const [discipline] = disciplines[p.area] || ["business"];
  return `<article${hidden?" hidden":""} class="p-card discipline-${discipline}" data-card data-area="${escape(p.area)}" data-family="${escape(p.family)}" data-title="${escape(p.title)}" data-slug="${escape(p.slug)}">
    <a class="p-photo" href="${urlFor(p)}" tabindex="-1" aria-hidden="true"><img src="${escape(imageOf(p))}" alt="" loading="lazy" decoding="async"><span>${escape(p.family || "Maestría")}</span></a>
    <div class="p-info"><div class="p-area">${escape(p.area || "Posgrados")}</div><h3><a href="${urlFor(p)}">${escape(p.shortTitle || p.title)} ${icon("external",19)}</a></h3><div class="p-meta">${p.mode ? `<span>${icon("layers",15)}${escape(p.mode)}</span>` : ""}${p.duration ? `<span>${icon("clock",15)}${escape(p.duration)}</span>` : ""}</div>
    ${compare ? `<div class="card-controls" data-enhanced hidden><label class="compare-check"><input type="checkbox" value="${escape(p.slug)}" data-compare aria-label="Comparar ${escape(p.title)}"> Comparar</label><button type="button" class="bookmark-button" data-save="${escape(p.slug)}" data-name="${escape(p.title)}" aria-label="Guardar ${escape(p.title)}" aria-pressed="false">${icon("bookmark",18)}</button></div>` : ""}</div></article>`;
}
function featured(ps) {
  const list = [];
  for (const p of ps) if (!list.some(x => x.area === p.area)) list.push(p);
  return [...list, ...ps.filter(p => !list.includes(p))].slice(0,3);
}
function home(ps) {
  const selected = featured(ps);
  const areas = areasOf(ps);
  const shortcuts = [
    ["compass", "Test de orientación", "Encuentra programas afines", "/orientacion"],
    ["calc", "Simulador de inversión", "Estima tu cuota mensual", "/financiamiento"],
    ["calendar", "Agenda una cita", "Conversa con admisiones", appointment()]
  ];
  return `<section class="home-hero"><div class="wrap home-stage">
    <div class="hero-copy">${kicker("Universidad Casa Grande · Posgrados")}
      <h1>Estudia en <em>grande.</em></h1>
      <p>Profundiza en lo que te mueve. Encuentra una maestría para aplicar lo que aprendes a los retos de tu profesión.</p>
      <div class="hero-actions">${link("/programas","Explorar maestrías","primary","arrow")}${link("/orientacion","Orientarme para elegir","quiet","compass")}</div>
      <dl class="hero-facts"><div><dt>Maestrías</dt><dd>${ps.length}</dd></div><div><dt>Áreas de estudio</dt><dd>${areas.length}</dd></div></dl>
    </div>
    <figure class="hero-image"><img src="${hero}" width="1210" height="1550" fetchpriority="high" alt="Una mujer sonríe en un aula"><figcaption class="hero-campus"><img src="${campus}" width="575" height="800" alt="Fachada de la Universidad Casa Grande"><span><strong>Campus UCG</strong><small>Guayaquil, Ecuador</small></span></figcaption></figure>
  </div></section>
  <section class="home-tools" aria-label="Herramientas para aspirantes"><div class="wrap utility-grid">${shortcuts.map(([glyph,title,copy,href])=>`<a href="${href}"><span class="tool-icon">${icon(glyph,25)}</span><span><strong>${title}</strong><small>${copy}</small></span><span class="utility-arrow">${icon("external",20)}</span></a>`).join("")}</div></section>
  <section class="wrap content-section home-offer"><div class="section-row">${heading("Oferta académica","Explora las maestrías")}<a href="/programas" id="area-catalog-link" class="text-link icon-link">Ver todos los programas ${icon("arrow",19)}</a></div>
    <nav class="area-links" aria-label="Filtrar maestrías por área"><a href="/programas" data-home-area="" aria-current="true">Todas</a>${areas.map(area=>`<a href="${escape(areaUrl(area))}" data-home-area="${escape(area)}">${escape(area)}</a>`).join("")}</nav>
    <p id="home-area-status" class="sr-only" role="status"></p><div class="card-grid" data-home-list="">${selected.map(p=>card(p)).join("")}</div>
    ${areas.map(area=>`<div class="card-grid" data-home-list="${escape(area)}" hidden>${ps.filter(p=>p.area===area).slice(0,3).map(p=>card(p)).join("")}</div>`).join("")}
  </section>
  <section class="learning-band"><div class="wrap learning-grid">
    <div>${kicker("El modelo Casa Grande")}<h2>Aprende <em>haciendo.</em></h2><p>Trabaja en proyectos que parten de problemas reales y aplica lo que estudias en tu práctica profesional.</p>${link("/orientacion","Descubrir mi ruta","light","compass")}</div>
    <figure><img src="${campus}" width="575" height="800" alt="Fachada del campus de la Universidad Casa Grande en Guayaquil" loading="lazy"><span aria-hidden="true"></span></figure>
  </div></section>
  <section class="wrap content-section faq-grid">${heading("Admisiones","Antes de elegir")}<div>${faqList()}</div></section>`;
}
function faqList() {
  const faqs = [
    ["¿Cómo elijo una maestría?","Compara las fichas por área y modalidad. Si estás explorando opciones, el test de orientación te muestra programas que coinciden con tus intereses.","/orientacion","Hacer el test"],
    ["¿Dónde puedo consultar el valor y las formas de pago?","La ficha de cada programa enlaza a la información institucional. Puedes pedir a admisiones una cotización vigente y usar el simulador para organizar tu presupuesto.","/financiamiento","Abrir el simulador"],
    ["¿Qué necesito para postular?","Los requisitos dependen del programa. Revisa su página institucional y solicita a admisiones la lista de documentos y las fechas de la convocatoria que te interesa.","/solicitar?origen=preguntas","Consultar requisitos"]
  ];
  return faqs.map(([q,a,url,t])=>`<details><summary>${q}</summary><p>${a} <a href="${url}">${t}</a>.</p></details>`).join("");
}
function catalog(ps, query) {
  const areas = areasOf(ps);
  const families = [...new Set(ps.map(p=>p.family).filter(Boolean))];
  const area = areas.includes(query.get("area")) ? query.get("area") : "";
  const localCount = area ? ps.filter(p => p.area === area).length : ps.length;
  return `<div class="wrap">${crumbs([["Maestrías"]])}<section class="page-intro">${kicker("Oferta académica")}<h1>Encuentra tu <em>maestría.</em></h1><p>Busca por nombre o filtra por área y formato. Guarda tus favoritas y compara hasta tres programas.</p></section>
  <div class="filters" data-enhanced hidden><label class="search-wrap">${icon("search")}<span class="sr-only">Buscar una maestría</span><input id="program-search" type="search" placeholder="Busca una maestría"></label><label><span class="sr-only">Área de estudio</span><select id="area-filter">${option("","Todas las áreas")}${areas.map(x=>`<option value="${escape(x)}"${area===x?" selected":""}>${escape(x)}</option>`).join("")}</select></label>${families.length > 1 ? `<label><span class="sr-only">Formato</span><select id="family-filter">${option("","Todos los formatos")}${families.map(x=>option(x)).join("")}</select></label>` : ""}</div>
  <noscript><nav class="area-links" aria-label="Áreas de estudio">${[["","Todas"],...areas.map(x=>[x,x])].map(([x,label])=>`<a href="${x?escape(areaUrl(x)):"/programas"}"${area===x?' aria-current="true"':""}>${escape(label)}</a>`).join("")}</nav></noscript>
  <div class="catalog-tools"><p id="result-count" role="status">${localCount} ${localCount===1?"programa":"programas"}</p><button id="saved-filter" type="button" class="small-button" aria-pressed="false" data-enhanced hidden>${icon("bookmark",17)} Guardadas <span id="saved-count"></span></button></div>
  <div class="card-grid catalog-grid">${ps.map(p=>card(p,true,Boolean(area && p.area!==area))).join("")}</div>
  <div id="no-results" class="empty-box" hidden><h2>Sin coincidencias</h2><p id="empty-catalog-copy">Prueba otra búsqueda o consulta todas las áreas.</p><button type="button" class="btn btn-primary" id="reset-filters">Limpiar filtros</button></div></div>
  <aside id="compare-tray" class="compare-tray" aria-label="Programas para comparar" hidden><div><p id="compare-status" aria-live="polite"></p><button type="button" id="compare-clear">Quitar selección</button></div><button id="compare-open" type="button" class="btn btn-primary" disabled>Comparar (0/3)</button></aside>
  <dialog id="compare-dialog" class="compare-dialog" aria-labelledby="compare-title"><div class="dialog-head"><h2 id="compare-title">Compara maestrías</h2><button type="button" class="icon-button" id="compare-close" aria-label="Cerrar comparación">${icon("close")}</button></div><div id="compare-body" class="table-scroll" tabindex="0" aria-label="Tabla de programas"></div><div class="compare-share"><button type="button" class="btn btn-outline" id="compare-share">Copiar enlace</button><label id="compare-link-label" hidden>Enlace a esta comparación<input id="compare-link" type="url" readonly></label><p id="share-status" class="fine" role="status"></p></div></dialog>`;
}
function program(p, ps) {
  const canEnroll = p.admissionsStatus !== "Inscripciones cerradas";
  const inquiryLabel = !canEnroll ? "Consultar próxima convocatoria" : "Solicitar información";
  const price = typeof p.price === "number" && p.price > 0 ? amount(p.price) : null;
  const [discipline,glyph] = disciplines[p.area] || ["business","book"];
  const facts = [["layers","Modalidad",p.mode],["clock","Duración",p.duration],["book","Formato",p.family]].filter(([, , value])=>value);
  const more = (Array.isArray(p.details) ? p.details : [p.details]).filter(x=>typeof x==="string" && x!==p.summary && !x.startsWith("Asignatura del plan:"));
  const modules = Array.isArray(p.curriculum) ? p.curriculum.filter(x=>typeof x==="string" && x.trim()) : [];
  const teaching = p.family === "Flexible" ? more : [];
  const topics = p.family === "Flexible" && modules.length ? modules.filter((_, index)=>[0,Math.floor(modules.length/3),Math.floor(2*modules.length/3)].includes(index)) : more.slice(0,3);
  const related = ps.filter(i => i.slug !== p.slug && i.area === p.area).slice(0,3);
  const compareLink = "/programas?" + new URLSearchParams({ comparar:p.slug, ...(p.area?{area:p.area}:{}) }).toString();
  const checklist = [
    ["curriculum","Revisé la malla y elegí las asignaturas que quiero consultar."],
    ["requirements","Confirmé los requisitos y las fechas de mi convocatoria."],
    ["schedule","Revisé si los horarios y la modalidad se ajustan a mi agenda."],
    ["investment","Consulté el valor vigente y organicé mi presupuesto."]
  ];
  return `<div class="program-hub discipline-${discipline}" data-program-hub="${escape(p.slug)}">
  <section class="program-cover"><div class="wrap">
    ${crumbs([["Maestrías","/programas"],[p.area||"Programa"]])}
    <div class="program-hero"><div class="program-copy">${kicker(p.area || "Posgrados UCG")}<h1>${escape(p.title)}</h1><p>${escape(p.summary || "Explora el programa y conversa con admisiones para conocer la próxima convocatoria.")}</p>
    <div class="program-actions"><a class="btn btn-primary" href="${escape(enquiry(p.slug)+(canEnroll?"&cta=principal":""))}"${canEnroll?" data-hub-inquiry":""}><span data-hub-copy>${escape(inquiryLabel)}</span>${icon("arrow",18)}</a>${link("#malla","Explorar la malla","outline","down")}</div>
    <div class="program-quick"><a href="${escape(appointment(p.slug))}">${icon("calendar",17)} Agendar una cita</a><button type="button" class="bookmark-button" data-save="${escape(p.slug)}" data-name="${escape(p.title)}" aria-pressed="false" data-enhanced hidden>${icon("bookmark",17)} <span data-save-label>Guardar programa</span></button><a href="${escape(compareLink)}">${icon("scale",17)} Comparar</a></div>
    </div><div class="program-photo"><img src="${escape(imageOf(p))}" alt="" fetchpriority="high"><span class="program-photo-icon" aria-hidden="true">${icon(glyph,38)}</span></div></div>
    ${facts.length ? `<dl class="program-facts">${facts.map(([glyph,label,value])=>`<div><span aria-hidden="true">${icon(glyph,22)}</span><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>` : ""}
  </div></section>
  <nav class="program-subnav" aria-label="En esta maestría"><div class="wrap"><a href="#malla">Malla académica</a><a href="#admision">Admisiones</a><a href="#plan">Mi plan de estudio</a>${related.length ? '<a href="#relacionadas">Programas relacionados</a>' : ""}</div></nav>
  <section id="malla" class="wrap content-section hub-malla">
    <div class="hub-topics">${heading("Plan de estudios","Qué estudiarás")}
    ${topics.length ? `<ul class="topic-list">${topics.map(x=>`<li>${icon("check",18)}<span>${escape(x)}</span></li>`).join("")}</ul>` : ""}
    ${teaching.length ? `<ul class="teaching-list">${teaching.map(x=>`<li>${escape(x)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="malla-panel"><h3>Asignaturas publicadas</h3>
    ${modules.length ? `<label class="search-wrap malla-search" data-enhanced hidden>${icon("search",19)}<span class="sr-only">Buscar una asignatura</span><input id="malla-search" type="search" placeholder="Busca en la malla"></label>
    <p id="malla-count" class="fine" role="status" data-enhanced hidden>${modules.length} asignaturas</p>
    <ol class="malla-list" id="malla-list">${modules.map(x=>`<li><span>${escape(x)}</span></li>`).join("")}</ol><p id="malla-empty" hidden>Sin resultados. Prueba con otro término.</p>` : "<p>Consulta el plan de estudios en la ficha del programa.</p>"}
    ${p.curriculumNote ? `<p class="fine malla-note">${escape(p.curriculumNote)}</p>` : ""}
    </div>
  </section>
  <section class="hub-admission" id="admision"><div class="wrap content-section admission-grid">
    <div>${heading("Convocatoria","Prepara tu postulación")}
      <dl class="admission-facts">
        ${p.degree ? `<div><dt>Título que otorga</dt><dd>${escape(p.degree)}</dd></div>` : ""}
        ${p.admissionsStatus ? `<div><dt>Estado publicado</dt><dd>${escape(p.admissionsStatus)}</dd></div>` : ""}
        <div><dt>Inversión publicada</dt><dd>${price ? escape(price) : "Consultar con admisiones"}</dd></div>
      </dl>
    </div>
    <div class="admission-source"><span class="source-mark" aria-hidden="true">${icon("book",23)}</span>
    <h3>Información oficial</h3><p>Revisa la ficha de Universidad Casa Grande y confirma con admisiones los requisitos, fechas y condiciones de tu convocatoria.</p>
    <div class="source-links"><a href="${escape(safeUrl(p.url))}" rel="external noreferrer">Ver ficha oficial del programa ${icon("external",19)}</a>
    ${p.brochure ? `<a href="${escape(safeUrl(p.brochure))}" rel="external noreferrer">Folleto académico (PDF) ${icon("external",19)}</a>` : ""}
    ${p.applicationUrl && p.admissionsStatus!=="Inscripciones cerradas" ? `<a href="${escape(safeUrl(p.applicationUrl))}" rel="external noreferrer">Postular en el portal oficial ${icon("external",19)}</a>` : ""}
    </div>
    </div>
  </div></section>
  <section id="plan" class="wrap content-section preparation-grid"><div>
    ${heading("Organiza tu decisión","Mi plan de estudio","Revisa estos pasos antes de conversar con admisiones.")}
    <div class="program-actions">${link("/financiamiento?"+new URLSearchParams({programa:p.slug}),"Simular mi presupuesto","outline","calc")}</div>
  </div><div class="planning-card">
    <h3>Pasos para prepararte</h3><p class="fine" id="plan-progress" role="status" data-enhanced hidden>0 de ${checklist.length} pasos marcados</p>
    <fieldset data-enhanced hidden><legend class="sr-only">Pasos de mi plan para esta maestría</legend>${checklist.map(([key,label])=>`<label><input type="checkbox" data-plan-step="${key}"><span>${escape(label)}</span></label>`).join("")}</fieldset>
    <noscript><ul>${checklist.map(([,label])=>`<li>${escape(label)}</li>`).join("")}</ul></noscript>
  </div></section>
  <section class="hub-next"><div class="wrap"><div><h2>Conversa con admisiones</h2><p>Pregunta por los horarios, la inversión o la próxima convocatoria de esta maestría.</p></div><div class="program-actions">${link(enquiry(p.slug),inquiryLabel,"primary","arrow")}${link(appointment(p.slug),"Agendar una cita","light","calendar")}</div></div></section>
  ${related.length ? `<section id="relacionadas" class="wrap content-section"><div class="section-row">${heading(p.area,"Programas relacionados")}<a href="${escape(areaUrl(p.area))}" class="text-link icon-link">Ver por área ${icon("arrow",18)}</a></div><div class="card-grid">${related.map(i=>card(i)).join("")}</div></section>` : ""}
  <aside class="program-mobile-cta" aria-label="Contactar admisiones">${link(enquiry(p.slug), "Pedir información","primary")}${link(appointment(p.slug),"Agendar cita","outline","calendar")}</aside>
  </div>`;
}
function quiz() {
  return `<div class="wrap">${crumbs([["Orientación"]])}<div class="tool-layout"><div class="tool-intro">${kicker("Orientación de posgrados")}<h1>Encuentra tu <em>rumbo.</em></h1><p>Tres preguntas para descubrir qué maestrías conectan con tus intereses. Verás tus resultados sin dejar tus datos.</p><div class="tool-intro-icon" aria-hidden="true">${icon("compass",94)}</div></div><section class="tool-panel" id="quiz-panel" aria-label="Test de orientación"><div id="quiz-progress">Pregunta 1 de 3</div><div class="progress-track"><i id="quiz-bar"></i></div><div id="quiz-mount" aria-live="polite"></div><noscript>Activa JavaScript para hacer el test o <a href="/programas">explora las maestrías</a>.</noscript></section></div></div>`;
}
function finance(ps) {
  return `<div class="wrap">${crumbs([["Simulador"]])}<div class="tool-layout"><div class="tool-intro">${kicker("Planificación financiera")}<h1>Tu inversión, <em>en perspectiva.</em></h1><p>Haz números con tu propia cotización. Ajusta el aporte inicial, el plazo y la tasa para estimar una cuota mensual.</p><div class="tool-intro-icon" aria-hidden="true">${icon("calc",84)}</div></div><form class="tool-panel stack" id="finance-form"><h2>Simula tu presupuesto</h2><label>Programa de interés<select id="finance-program">${option("","Elige una maestría (opcional)")}${ps.map(p=>option(p.slug,p.title)).join("")}</select></label><label>Inversión total (USD)<input type="number" id="investment" min="0.01" max="1000000" step="0.01" placeholder="Ingresa el valor cotizado" required></label><p id="price-hint" class="field-hint">Utiliza una cotización vigente de admisiones.</p><div class="field-pair"><label>Aporte inicial (USD)<input type="number" id="initial" min="0" max="1000000" step="0.01" value="0" required></label><label>Plazo en meses<input type="number" id="months" min="1" max="120" step="1" value="12" required></label></div><label>Tasa nominal anual (%)<input type="number" id="rate" min="0" max="100" step="0.01" value="0" required></label><div class="estimate" role="status"><span>Cuota mensual estimada</span><strong id="monthly">—</strong><small id="financial-note">Ingresa la inversión para ver tu estimación.</small></div><p class="fine">Escenario personal en dólares. No incluye comisiones ni representa una oferta de crédito o un plan de pagos de UCG.</p><label class="share-scenario"><input type="checkbox" id="share-finance"> Compartir esta estimación con admisiones al consultar.</label><a id="finance-cta" class="btn btn-primary" href="/solicitar?origen=simulador">Consultar valores con admisiones</a></form></div></div>`;
}
function requestInfo(ps, institutionalLive) {
  return `<div class="wrap">${crumbs([["Solicitar información"]])}<div class="tool-layout"><div class="tool-intro">${kicker("Admisiones de posgrados")}<h1>Conversemos sobre <em>tu maestría.</em></h1><p>Cuéntanos qué programa te interesa. ${institutionalLive?"El equipo de admisiones podrá revisar tu consulta y orientarte sobre los siguientes pasos.":"El equipo que opera este portal podrá revisar tu consulta y orientarte sobre los siguientes pasos."}</p><a class="contact-number" href="tel:+59343726250">Admisiones · +593 4 372 6250</a></div><section class="tool-panel"><noscript><p class="fine">Para enviar tu consulta en esta página, activa JavaScript o llama al equipo de admisiones.</p></noscript><form class="stack" id="lead-form" method="post" action="/api/leads"><h2>Solicitar información</h2><label>Nombre y apellido<input name="name" type="text" autocomplete="name" required minlength="2" maxlength="110"></label><label>Correo electrónico<input name="email" type="email" autocomplete="email" required maxlength="200"></label><label>Maestría de interés<select name="program">${option("","Quiero orientación para elegir")}${ps.map(p=>option(p.slug,p.title)).join("")}</select></label><label>Teléfono <span id="phone-requirement" class="optional">(opcional)</span><input name="phone" type="tel" autocomplete="tel" maxlength="24" placeholder="+593"></label><p id="context-preview" class="fine" hidden></p><fieldset class="permissions"><legend>Preferencias de seguimiento</legend><label><input type="checkbox" name="consentEmail"> Acepto recibir correos de seguimiento sobre posgrados.</label><label><input type="checkbox" name="consentWhatsapp"> Acepto recibir mensajes de seguimiento sobre posgrados por WhatsApp.</label><label><input type="checkbox" name="consentVoice"> Acepto recibir llamadas de seguimiento, incluidas llamadas de un asistente de voz automatizado.</label></fieldset>${institutionalLive?"":`<p class="pilot-disclosure">${pilotCopy}</p>`}<p class="fine">${institutionalLive?"Tu consulta se enviará al equipo de admisiones.":"Tus datos se enviarán al equipo que opera este portal."} Los permisos de seguimiento son opcionales. <a href="${privacy}" target="_blank" rel="noopener noreferrer">Política de privacidad de UCG</a>.</p><div class="form-error" id="lead-error" role="alert" hidden></div><button class="btn btn-primary" type="submit">Enviar mi consulta</button></form><div class="success-box" id="lead-success" hidden role="status"><span class="success-icon">${icon("check",30)}</span><h2>Recibimos tu consulta.</h2><p>${institutionalLive?"El equipo de admisiones":"El equipo que opera este portal"} podrá revisar tu solicitud y tus preferencias de contacto.</p>${link("/programas","Volver a las maestrías","outline")}</div></section></div></div>`;
}
function guides(items) {
  const guideData = [
    ["compass","Elegir un programa","Descubre maestrías según tus intereses y la modalidad que prefieres.","/orientacion","Hacer el test"],
    ["calc","Preparar tu presupuesto","Calcula cuánto tendrías que destinar cada mes a tu formación.","/financiamiento","Abrir el simulador"],
    ["book","Comparar maestrías","Revisa el área, la modalidad y la duración en un solo lugar.","/programas","Comparar programas"]
  ];
  return `<section class="wrap">${crumbs([["Guías"]])}<div class="page-intro">${kicker("Recursos para aspirantes")}<h1>Guías de <em>posgrado.</em></h1><p>Herramientas y lecturas para tomar una decisión informada.</p></div><div class="guide-grid">${guideData.map(([i,t,d,u,a])=>`<article class="guide-card">${icon(i,34)}<h2>${t}</h2><p>${d}</p><a class="text-link" href="${u}">${a}</a></article>`).join("")}</div>${items.length ? `<div class="content-section">${heading("Orientación","Lecturas recientes")}<div class="reading-list">${items.map(i=>`<a href="/guias/${encodeURIComponent(i.slug)}"><h3>${escape(i.title)}</h3><p>${escape(i.description)}</p></a>`).join("")}</div></div>` : ""}</section>`;
}
function article(i) {
  return `<section class="wrap">${crumbs([["Guías","/guias"],[i.title]])}<article class="editorial-article">${kicker("Guía de posgrado")}<h1>${escape(i.title)}</h1><p class="article-deck">${escape(i.description)}</p>${String(i.body || "").split(/\n\s*\n/).filter(Boolean).map(x=>`<p>${escape(x)}</p>`).join("")}<div class="program-tools">${link("/solicitar?origen=guia","Conversar con admisiones","primary")}</div></article></section>`;
}
function notFound() { return `<section class="wrap empty-box"><h1>No encontramos esta página.</h1><p>Explora las maestrías disponibles o pide orientación a admisiones.</p>${link("/programas","Ver las maestrías","primary")}</section>`; }
export function renderStudent(path, programs, options={}) {
  const ps = Array.isArray(programs) ? programs : [];
  const location = new URL(path, "https://posgrados.invalid");
  const pathname = location.pathname.replace(/\/$/, "") || "/";
  const parts = pathname.split("/").filter(Boolean);
  const pages = {"/":["Posgrados en Ecuador","Explora las maestrías de la Universidad Casa Grande en Guayaquil. Compara programas, planifica tu inversión y recibe orientación de admisiones.",()=>home(ps)],"/programas":["Maestrías y programas de posgrado","Busca y compara las maestrías de la Universidad Casa Grande por área de estudio y formato.",()=>catalog(ps,location.searchParams)],"/orientacion":["Test de orientación de posgrados","Responde tres preguntas y descubre las maestrías que se ajustan a tus intereses.",()=>quiz()],"/financiamiento":["Simulador de inversión para tu maestría","Estima tu presupuesto mensual para una maestría, con tus propios valores, aporte inicial y plazo.",()=>finance(ps)],"/solicitar":["Solicitar información de posgrados","Consulta al equipo de admisiones sobre maestrías, requisitos, inversión y convocatoria.",()=>requestInfo(ps,options.institutionalLive)],"/guias":["Guías para estudiar una maestría","Encuentra recursos y herramientas para elegir un programa, preparar tu presupuesto y avanzar en tu postulación.",()=>guides(options.articles||[])]};
  const p = parts[0]==="programas" && parts.length===2 ? ps.find(i=>i.slug===parts[1]) : null;
  const a = parts[0]==="guias" && parts.length===2 ? (options.articles||[]).find(i=>i.slug===parts[1]) : null;
  if (pathname === "/cita" && typeof options.appointmentHtml === "string") pages["/cita"] = ["Agendar una cita de posgrados", "Elige un horario para conversar con admisiones de Universidad Casa Grande.", () => options.appointmentHtml];
  const entry = p ? [p.title, p.summary || "Explora el programa de posgrado y recibe orientación de admisiones.", ()=>program(p,ps)] : a ? [a.title, a.description, ()=>article(a)] : pages[pathname];
  const [title,desc,content] = entry || ["Página no encontrada","Explora la oferta de posgrados de UCG.",notFound];
  let origin = ""; try { if (options.origin && ["http:","https:"].includes(new URL(options.origin).protocol)) origin = new URL(options.origin).origin; } catch {}
  const canonical = origin ? origin + pathname : "";
  const org = {"@type":"CollegeOrUniversity","name":"Universidad Casa Grande","url":"https://www.casagrande.edu.ec/"};
  const schema = [{"@context":"https://schema.org","@type":"WebPage","name":title,"description":desc,"inLanguage":"es-EC",...(canonical?{url:canonical}:{})}];
  if(p) schema.push({"@context":"https://schema.org","@type":"Course","name":p.title,"description":desc,"provider":org,"inLanguage":"es",...(canonical?{url:canonical}:{}),sameAs:safeUrl(p.url)});
  if(a) schema.push({"@context":"https://schema.org","@type":"Article",headline:a.title,description:desc, ...(a.published_at?{datePublished:a.published_at}:{})});
  if (origin && parts.length) { const intermediate = parts.length===2 ? [{"@type":"ListItem",position:2,name:p?"Maestrías":"Guías",item:origin+"/"+parts[0]}] : []; schema.push({"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Posgrados",item:origin+"/"},...intermediate,{"@type":"ListItem",position:intermediate.length+2,name:title,item:canonical}]}); }
  const data = ps.map(({slug,title,area,mode,family,duration,price,admissionsStatus})=>({slug,title,area,mode,family,duration,price,admissionsStatus}));
  return `<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f8f7f3"><meta name="robots" content="${options.indexable && entry ? "index,follow":"noindex,nofollow"}"><title>${escape(title)} | Universidad Casa Grande</title><meta name="description" content="${escape(desc)}">${canonical?`<link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}">`:""}<meta property="og:type" content="${a?"article":"website"}"><meta property="og:locale" content="es_EC"><meta property="og:site_name" content="Posgrados UCG"><meta property="og:title" content="${escape(title)} | Universidad Casa Grande"><meta property="og:description" content="${escape(desc)}"><meta property="og:image" content="${escape(origin+(p?imageOf(p):hero))}"><link rel="stylesheet" href="/student.css"><script type="application/ld+json">${json(schema)}</script></head><body class="${p?"page-program":pathname==="/"?"page-home":pathname==="/programas"?"page-catalog":""}">${header(pathname)}<main id="contenido" tabindex="-1">${content()}</main>${footer(options.institutionalLive)}${assistantWidget()}<script id="catalog-data" type="application/json">${json(data)}</script><script src="/student-client.js" defer></script></body></html>`;
}
