/*
 * Motion-graphic product demo. One GSAP master timeline drives every scene, so any
 * frame can be rendered deterministically (render.mjs seeks to each frame time).
 * Recorded clips from capture.mjs play inside a browser frame at RATE speed.
 */
(() => {
  const RATE = 1.3;   // recordings are played slightly faster than real time
  const TRIM = 0.25;  // default preroll skipped at the start of a recording (render.mjs measures each one)
  const TAIL = 0.35;  // safety margin before a recording's last frame

  const params = new URLSearchParams(location.search);
  const renderMode = params.get('render') === '1';
  const stage = document.getElementById('stage');
  const scenesEl = document.getElementById('scenes');
  const durations = window.__clipDurations || {};
  const trims = window.__clipTrims || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const make = (tag, cls, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  };

  const master = gsap.timeline({ paused: true });
  const clips = [];
  const scenes = [];

  const clipLength = name => Math.max(2, (durations[name] || 10) - (trims[name] ?? TRIM) - TAIL) / RATE;

  function showDuring(node, start, end) {
    master.set(node, { autoAlpha: 1 }, start);
    master.set(node, { autoAlpha: 0 }, end);
  }

  // Orange wipe centred on a scene boundary; the cut happens while the wipe covers the frame.
  function wipeAt(boundary) {
    const w = $('#wipe');
    master.fromTo(w, { xPercent: -100, autoAlpha: 1 }, { xPercent: 0, duration: 0.36, ease: 'power3.in', immediateRender: false }, boundary - 0.36)
      .fromTo(w, { xPercent: 0 }, { xPercent: 100, duration: 0.4, ease: 'power3.out', immediateRender: false }, boundary)
      .set(w, { autoAlpha: 0 }, boundary + 0.4);
  }

  // Split headline words so they can rise in one by one (HTML tags pass through untouched).
  function kinetic(container, html, at, size) {
    const title = make('h2', 'title', html.replace(/(<[^>]+>)|([^\s<>]+)/g, (m, tag, word) => tag ? tag : `<span class="w">${word}</span>`));
    title.style.fontSize = size;
    container.appendChild(title);
    master.from(title.querySelectorAll('.w'), { yPercent: 115, autoAlpha: 0, duration: 0.9, ease: 'power4.out', stagger: 0.07 }, at);
    return title;
  }

  function sceneBox(start, end) {
    const node = make('section', 'scene');
    scenesEl.appendChild(node);
    showDuring(node, start, end);
    scenes.push(node);
    return node;
  }

  // Recording inside a browser frame, with a chapter chip and a lower-third caption.
  function clipScene(item) {
    const { start, end, dur } = item;
    const node = sceneBox(start, end);
    const win = make('div', 'browser');
    win.innerHTML = `<div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="url"><b>posgrados</b> ${item.route}</div></div>`;
    const screen = make('div', 'screen');
    const video = make('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = `build/clips/${item.clip}.webm`;
    screen.appendChild(video);
    win.appendChild(screen);
    const chip = make('div', 'chip', (item.num ? `<b>${item.num}</b>` : '') + item.chip);
    const caption = make('p', 'caption', item.caption);
    node.append(win, chip, caption);
    clips.push({ video, start, dur, raw: trims[item.clip] ?? TRIM });

    const sub = gsap.timeline();
    sub.fromTo(win, { y: 56, scale: 0.955, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.8, ease: 'power3.out' }, 0)
      .fromTo(chip, { x: -30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, 0.3)
      .fromTo(caption, { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: 'power2.out' }, 0.5)
      .to(win, { scale: 1.022, duration: Math.max(0.1, dur - 0.8), ease: 'none' }, 0.8);
    master.add(sub, start);
  }

  function hookScene(item) {
    const { start, end } = item;
    const node = sceneBox(start, end);
    const wrap = make('div', 'center');
    node.appendChild(wrap);
    const title = kinetic(wrap, 'Un aspirante decide<br><em>en minutos.</em>', start + 0.2, '168px');
    title.style.textAlign = 'center';
    const q = make('p', 'sub', '¿Tu institución responde a tiempo?');
    q.style.cssText = 'text-align:center;margin:56px auto 0;font-size:44px;color:#fff;font-family:"Space Grotesk",sans-serif;font-weight:500;';
    wrap.appendChild(q);
    master.from(q, { autoAlpha: 0, y: 24, duration: 0.8, ease: 'power3.out' }, start + 2.6);
  }

  function journeyScene(item) {
    const { start, end } = item;
    const node = sceneBox(start, end);
    const head = make('div', 'kicker', 'Recorrido del aspirante');
    head.style.cssText = 'position:absolute;left:230px;top:120px;';
    const title = kinetic(node, 'Del primer clic a la <em>matrícula.</em>', start + 0.1, '96px');
    title.style.cssText = 'position:absolute;left:230px;top:160px;';
    node.append(head);
    const track = make('div', 'path');
    const fill = make('div', 'fill');
    track.appendChild(fill);
    node.appendChild(track);
    const stations = [
      ['Descubre', 'Fichas con fuentes oficiales'],
      ['Compara', 'Hasta tres programas'],
      ['Decide', 'Orientación y dudas'],
      ['Planifica', 'Cuota con tu cotización'],
      ['Conversa', 'Admisiones y una cita'],
      ['Matricúlate', 'Con seguimiento hasta el final'],
    ];
    const xs = stations.map((_, i) => 230 + i * (1460 / (stations.length - 1)));
    const nodes = stations.map(([label, sub], i) => {
      const s = make('div', 'station');
      s.style.left = xs[i] + 'px';
      s.innerHTML = `<div class="dot">${String(i + 1).padStart(2, '0')}</div><div class="lbl">${label}</div><div class="sm">${sub}</div>`;
      node.appendChild(s);
      return s;
    });
    const runner = make('div', 'runner');
    node.appendChild(runner);
    const note = make('p', 'sub', 'Admisiones acompaña a cada aspirante hasta su matrícula.');
    note.style.cssText = 'position:absolute;left:0;right:0;top:760px;text-align:center;font-size:34px;';
    node.appendChild(note);

    const t0 = start + 0.7;
    const span = 4.6;
    master.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: span, ease: 'power1.inOut' }, t0);
    master.fromTo(runner, { x: xs[0] }, { x: xs[xs.length - 1], duration: span, ease: 'power1.inOut' }, t0);
    nodes.forEach((s, i) => {
      const at = t0 + (span * i) / (nodes.length - 1);
      master.fromTo(s, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, at - 0.1);
    });
    master.from(note, { autoAlpha: 0, y: 20, duration: 0.8, ease: 'power2.out' }, start + 5.5);
  }

  function acquisitionScene(item) {
    const { start, end } = item;
    const node = sceneBox(start, end);
    const wrap = make('div', 'center');
    node.appendChild(wrap);
    const kick = make('div', 'kicker', 'Captación');
    kick.style.cssText = 'text-align:center;margin-bottom:34px;';
    wrap.appendChild(kick);
    kinetic(wrap, 'La captación empieza <em>en la búsqueda.</em>', start + 0.4, '132px').style.textAlign = 'center';
    const sub = make('p', 'sub', 'Un motor de contenidos convierte búsquedas reales en guías de posgrado, revisadas antes de publicarse.');
    sub.style.cssText = 'text-align:center;margin:56px auto 0;max-width:1180px;';
    wrap.appendChild(sub);
    master.from(sub, { autoAlpha: 0, y: 24, duration: 0.8, ease: 'power3.out' }, start + 2.0);
  }

  function engineScene(item) {
    const { start, end } = item;
    const node = sceneBox(start, end);
    const kick = make('div', 'kicker', 'Motor de contenidos');
    kick.style.cssText = 'position:absolute;left:150px;top:118px;';
    node.appendChild(kick);
    const title = kinetic(node, 'Del dato de búsqueda <em>a la guía publicada.</em>', start + 0.2, '80px');
    title.style.cssText = 'position:absolute;left:150px;top:160px;';

    const rail = make('div', 'rail');
    node.appendChild(rail);
    const packet = make('div', 'packet');
    node.appendChild(packet);
    const steps = [
      ['01', 'Búsquedas reales', 'Search Console, OpenSEO y Semrush (opcional) miden la demanda de cada programa.'],
      ['02', 'Oportunidades', 'Cada tema se puntúa con demanda, interés registrado en el CRM y vacíos de contenido.'],
      ['03', 'Borrador', 'Se apoya en el catálogo institucional. El modelo de IA es opcional y nunca decide por el equipo.'],
      ['04', 'Revisión', 'El personal revisa, edita y decide. Nada se publica sin esa revisión.'],
      ['05', 'Publicación', 'El portal publica la guía y el CMS institucional confirma la versión con su comprobante.'],
    ];
    const flow = make('div', 'flow');
    const cards = steps.map(([n, h, p]) => {
      const c = make('div', 'node', `<div class="n">${n}</div><h3>${h}</h3><p>${p}</p>`);
      flow.appendChild(c);
      return c;
    });
    node.appendChild(flow);

    const wlabel = make('div', 'lbl', '<span>Puntuación de cada oportunidad</span><span>100 puntos</span>');
    const weights = make('div', 'weights');
    weights.appendChild(wlabel);
    const stack = make('div', 'stack');
    stack.innerHTML = '<div class="seg-a">Demanda de búsqueda · 50</div><div class="seg-b">CRM · 25</div><div class="seg-c">Brecha de contenido · 25</div>';
    weights.appendChild(stack);
    const legend = make('div', 'legend', '<span><b>Demanda</b>: cuánto se busca cada tema.</span><span><b>CRM</b>: qué consultan ya los aspirantes.</span><span><b>Brecha</b>: qué falta publicar.</span>');
    weights.appendChild(legend);
    node.appendChild(weights);

    const t0 = start + 0.9;
    master.fromTo(rail, { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'power2.out' }, t0 - 0.3);
    master.fromTo(packet, { x: 180 }, { x: 1740, duration: 3.6, ease: 'power1.inOut' }, t0);
    cards.forEach((c, i) => master.fromTo(c, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out' }, t0 + 0.2 + i * 0.5));
    const segs = stack.children;
    [50, 25, 25].forEach((pct, i) => {
      segs[i].style.width = '0%';
      master.fromTo(segs[i], { width: '0%' }, { width: pct + '%', duration: 1.1, ease: 'power3.inOut' }, start + 5.4 + i * 0.35);
    });
    master.from(wlabel, { autoAlpha: 0, duration: 0.6 }, start + 5.2);
    master.from(legend, { autoAlpha: 0, y: 14, duration: 0.7 }, start + 7.4);
  }

  function agentsScene(item) {
    const { start, end } = item;
    const node = sceneBox(start, end);
    const wrap = make('div', 'center');
    wrap.style.top = '280px';
    wrap.style.transform = 'none';
    node.appendChild(wrap);
    const kick = make('div', 'kicker', 'CRM con agentes');
    kick.style.cssText = 'text-align:center;margin-bottom:30px;';
    wrap.appendChild(kick);
    kinetic(wrap, 'El CRM trabaja las señales. <em>El equipo decide.</em>', start + 0.2, '96px').style.textAlign = 'center';
    const grid = make('div', 'agents');
    grid.style.top = '560px';
    const agents = [
      ['Lee', 'Del correo o de la llamada extrae el programa, la intención, el obstáculo y la frase que lo respalda.'],
      ['Propone', 'Sugiere el siguiente paso con su fundamento, un responsable y una fecha. El equipo revisa y asume cada decisión.'],
      ['Sigue', 'Seguimiento solo por canales permitidos: hasta dos mensajes por semana, 24 horas entre envíos y bajas respetadas.'],
    ];
    agents.forEach(([h, p], i) => {
      const card = make('div', 'agent', `<div class="badge">0${i + 1}</div><h3>${h}</h3><p>${p}</p>`);
      grid.appendChild(card);
      master.fromTo(card, { autoAlpha: 0, y: 46 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out' }, start + 2.2 + i * 1.1);
    });
    node.appendChild(grid);
  }

  function funnelScene(item) {
    const { start, end } = item;
    const node = sceneBox(start, end);
    const kick = make('div', 'kicker', 'Conversión');
    kick.style.cssText = 'position:absolute;left:0;right:0;top:118px;text-align:center;';
    node.appendChild(kick);
    const title = kinetic(node, 'De la ficha <em>a la matrícula.</em>', start + 0.2, '96px');
    title.style.cssText = 'position:absolute;left:0;right:0;top:160px;text-align:center;';
    const box = make('div', 'funnel');
    box.style.top = '420px';
    const stages = [
      ['Vistas', 'Personas que abren una ficha de maestría.', 1100],
      ['Aspirantes', 'Solicitudes deduplicadas por aspirante y programa.', 920],
      ['Citas', 'Reservas confirmadas durante el período.', 740],
      ['Matrículas', 'Solo con evidencia registrada en el expediente.', 560],
    ];
    stages.forEach(([t, d, w], i) => {
      const s = make('div', 'step' + (i === stages.length - 1 ? ' last' : ''), `<span class="t">${t}</span><span class="d">${d}</span>`);
      s.style.width = w + 'px';
      box.appendChild(s);
      master.fromTo(s, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.7, ease: 'power3.out' }, start + 1.0 + i * 0.6);
    });
    node.appendChild(box);
    const note = make('p', 'note', 'Cada etapa se mide por separado. Esquema ilustrativo: las cifras dependen de cada institución.');
    node.appendChild(note);
    master.to(note, { autoAlpha: 1, duration: 0.8 }, start + 4.0);
  }

  function closingScene(item) {
    const { start, end } = item;
    const node = sceneBox(start, end);
    const wrap = make('div', 'center');
    node.appendChild(wrap);
    const logo = make('img', 'logo');
    logo.src = '../../public/media/ucg-logo-light.png';
    logo.alt = 'Universidad Casa Grande';
    wrap.appendChild(logo);
    const title = kinetic(wrap, 'De la búsqueda <em>a la matrícula.</em>', start + 0.9, '110px');
    title.style.textAlign = 'center';
    const sub = make('p', 'sub', 'Sitio, contenidos y CRM con agentes, en una sola plataforma.');
    sub.style.cssText = 'text-align:center;margin:44px auto 0;';
    wrap.appendChild(sub);
    const legal = make('p', 'legal', 'Demostración grabada en el portal público y en el CRM de muestra, con datos ficticios. Los resultados dependen de cada institución.');
    node.appendChild(legal);
    master.from(logo, { autoAlpha: 0, y: 24, duration: 0.9, ease: 'power3.out' }, start + 0.1);
    master.from(sub, { autoAlpha: 0, y: 20, duration: 0.8, ease: 'power3.out' }, start + 3.2);
    master.from(legal, { autoAlpha: 0, duration: 0.8 }, start + 4.4);
  }

  const plan = [
    { type: 'hook', dur: 4.8 },
    { type: 'journey', dur: 6.6 },
    { type: 'clip', clip: 'home', route: '/', num: '01', chip: 'Descubre', caption: '<strong>34 maestrías</strong> en 7 áreas de estudio, cada ficha con su fuente oficial.' },
    { type: 'clip', clip: 'catalog', route: '/programas', num: '02', chip: 'Compara', caption: 'Filtra por área y <strong>compara hasta tres programas</strong> lado a lado.' },
    { type: 'clip', clip: 'orientation', route: '/orientacion', num: '03', chip: 'Decide', caption: 'Tres preguntas conectan el interés del aspirante con las maestrías que se ajustan a él.' },
    { type: 'clip', clip: 'chat', route: '/financiamiento', num: '03', chip: 'Pregunta al asistente', caption: 'Responde con el catálogo oficial y <strong>dice con claridad lo que aún no está publicado</strong>.' },
    { type: 'clip', clip: 'simulator', route: '/financiamiento', num: '04', chip: 'Planifica', caption: 'Calcula la cuota mensual con <strong>la cotización vigente</strong> de admisiones.' },
    { type: 'clip', clip: 'request', route: '/solicitar', num: '05', chip: 'Conversa', caption: 'Cada canal pide <strong>su propio permiso</strong>. Correo, WhatsApp y llamadas son opcionales.' },
    { type: 'acquisition', dur: 4.8 },
    { type: 'engine', dur: 11.8 },
    { type: 'clip', clip: 'editorial', route: '/motor-de-contenidos', chip: 'Motor de contenidos', caption: 'Un <strong>plan editorial público</strong> y guías que responden a búsquedas reales.' },
    { type: 'agents', dur: 8.8 },
    { type: 'clip', clip: 'crm-conversation', route: '/crm', chip: 'CRM · Lee', caption: 'Pega un correo o un resumen de llamada: el CRM extrae <strong>programa, intención, obstáculo</strong> y la frase que lo respalda.' },
    { type: 'clip', clip: 'crm-case', route: '/crm', chip: 'CRM · Propone y sigue', caption: 'Cada expediente muestra <strong>el siguiente paso y su responsable</strong>, las tareas y la automatización activa.' },
    { type: 'funnel', dur: 7.4 },
    { type: 'closing', dur: 8.2 },
  ];

  const builders = { hook: hookScene, journey: journeyScene, acquisition: acquisitionScene, engine: engineScene, agents: agentsScene, funnel: funnelScene, closing: closingScene, clip: clipScene };

  function build() {
    let t = 0;
    plan.forEach(item => {
      item.dur = item.type === 'clip' ? clipLength(item.clip) : item.dur;
      item.start = t;
      item.end = t + item.dur;
      t = item.end;
    });
    plan.forEach(item => builders[item.type](item));
    plan.slice(0, -1).forEach(item => wipeAt(item.end));
    master.set({}, {}, t);
    master.duration(t);
    window.__duration = t;
    window.__scenes = plan.map(i => ({ type: i.type, clip: i.clip || null, start: +i.start.toFixed(2), end: +i.end.toFixed(2) }));
  }

  // Seek a recording to a time and wait until the frame is decoded.
  function seekVideo(video, time) {
    return new Promise(resolve => {
      if (Math.abs(video.currentTime - time) < 0.01 && video.readyState >= 2) return resolve();
      const timer = setTimeout(resolve, 3000);
      video.addEventListener('seeked', () => {
        // Give the decoder a moment to present the new frame before the screenshot is taken.
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { clearTimeout(timer); resolve(); }, 35)));
      }, { once: true });
      video.currentTime = time;
    });
  }

  // Deterministic frame: the renderer calls this once per output frame.
  window.renderAt = async t => {
    master.seek(t, false);
    for (const clip of clips) {
      if (t >= clip.start && t < clip.start + clip.dur) {
        const raw = clip.raw + (t - clip.start) * RATE;
        const max = Number.isFinite(clip.video.duration) ? clip.video.duration - 0.05 : Infinity;
        await seekVideo(clip.video, Math.min(raw, max));
      }
    }
    return true;
  };

  const ready = [];
  function waitVideo(video) {
    return new Promise(resolve => {
      if (video.readyState >= 2) return resolve();
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', resolve, { once: true });
      video.load();
    });
  }

  function fit() {
    if (renderMode) return;
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(${(window.innerWidth - 1920 * s) / 2}px, ${(window.innerHeight - 1080 * s) / 2}px) scale(${s})`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    build();
    fit();
    window.addEventListener('resize', fit);
    clips.forEach(c => ready.push(waitVideo(c.video)));
    ready.push(document.fonts ? document.fonts.ready : Promise.resolve());
    const logo = $('img.logo');
    if (logo) ready.push(logo.complete ? Promise.resolve() : new Promise(r => { logo.onload = r; logo.onerror = r; }));
    await Promise.all(ready);
    window.__ready = true;
    if (!renderMode && params.get('preview') === '1') {
      master.play(0);
    }
  });
})();
