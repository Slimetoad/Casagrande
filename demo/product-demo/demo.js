/*
 * "Casa Grande Student Acquisition Engine" product film.
 * One GSAP master timeline drives every scene, plus per-frame updaters (counters, call
 * waveform, flywheel runner), so render.mjs can render any frame deterministically.
 * Scene lengths stretch to fit their narration (build/narration.json via render.mjs).
 */
(() => {
  // Recordings are 25 fps and the film is 30 fps: at exactly 1.2x every film frame shows the next
  // recorded frame, so playback never stutters. Scenes that need more time hold the last frame.
  const PLAY_RATE = 1.2;
  const SOURCE_FPS = 25;
  const TRIM = 0.25;      // default preroll skipped at the start of a recording
  const TAIL = 0.35;      // safety margin before a recording's last frame
  const LEAD = 0.55;      // narration starts this long after a scene begins
  const PAD_END = 0.8;    // breathing room after a line ends

  const params = new URLSearchParams(location.search);
  const renderMode = params.get('render') === '1';
  const stage = document.getElementById('stage');
  const scenesEl = document.getElementById('scenes');
  const durations = window.__clipDurations || {};
  const trims = window.__clipTrims || {};
  const narration = window.__narration || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const make = (tag, cls, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  };

  const master = gsap.timeline({ paused: true });
  const clips = [];
  const updaters = [];

  const ICON = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    portal: '<rect x="3" y="4" width="18" height="15" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    crm: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21 20a6 6 0 0 0-4-5.6"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-6M22 20H2"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24">${ICON[name]}</svg>`;

  function showDuring(node, start, end) {
    master.set(node, { autoAlpha: 1 }, start);
    master.set(node, { autoAlpha: 0 }, end);
  }

  function wipeAt(boundary) {
    const w = $('#wipe');
    master.fromTo(w, { xPercent: -100, autoAlpha: 1 }, { xPercent: 0, duration: 0.34, ease: 'power3.in', immediateRender: false }, boundary - 0.34)
      .fromTo(w, { xPercent: 0 }, { xPercent: 100, duration: 0.42, ease: 'power3.out', immediateRender: false }, boundary)
      .set(w, { autoAlpha: 0 }, boundary + 0.42);
  }

  function kinetic(container, html, at, size) {
    const title = make('h2', 'title', html.replace(/(<[^>]+>)|([^\s<>]+)/g, (m, tag, word) => tag ? tag : `<span class="w">${word}</span>`));
    title.style.fontSize = size;
    container.appendChild(title);
    master.from(title.querySelectorAll('.w'), { yPercent: 115, autoAlpha: 0, duration: 0.9, ease: 'power4.out', stagger: 0.06 }, at);
    return title;
  }

  function sceneBox(item) {
    const node = make('section', 'scene');
    scenesEl.appendChild(node);
    showDuring(node, item.start, item.end);
    return node;
  }

  // Deterministic count-up driven by the frame time.
  function counter(el, to, at, dur = 1.4, fmt = v => Math.round(v).toLocaleString('en-US')) {
    updaters.push(t => {
      const k = Math.max(0, Math.min(1, (t - at) / dur));
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
    });
  }

  // ---------- Scenes ----------

  function hookScene(item) {
    const node = sceneBox(item);
    const wrap = make('div', 'center');
    node.appendChild(wrap);
    kinetic(wrap, 'A future student<br>has <em>questions.</em>', item.start + 0.25, '150px').style.textAlign = 'center';
    const sub = make('p', 'sub', 'The first to answer them well wins the conversation.');
    sub.style.cssText = 'text-align:center;margin:60px auto 0;font:500 44px/1.3 "Space Grotesk",sans-serif;color:#fff;';
    wrap.appendChild(sub);
    master.from(sub, { autoAlpha: 0, y: 26, duration: 0.9, ease: 'power3.out' }, item.start + LEAD + 2.6);
  }

  function titleScene(item) {
    const node = sceneBox(item);
    const kick = make('div', 'kicker', 'Introducing');
    kick.style.cssText = 'position:absolute;left:160px;top:170px;';
    node.appendChild(kick);
    master.from(kick, { autoAlpha: 0, x: -20, duration: 0.6 }, item.start + 0.2);
    const t = kinetic(node, 'Casa Grande Student<br>Acquisition <em>Engine.</em>', item.start + 0.35, '128px');
    t.style.cssText += ';position:absolute;left:160px;top:215px;';
    const grid = make('div', 'pillars');
    const pillars = [
      ['portal', 'Portal', '34 programs, instant search and filters'],
      ['phone', 'AI Admissions Officer', 'Phone line in Ecuadorian Spanish'],
      ['crm', 'Admissions CRM', 'Six-stage pipeline and follow-up'],
      ['chart', 'SEO Analysis', 'Search demand across Ecuador'],
      ['doc', 'Content Engine', 'Guides drafted from real demand'],
    ];
    pillars.forEach(([ic, h, p], i) => {
      const el = make('div', 'pillar', `<div class="ic">${icon(ic)}</div><h3>${h}</h3><p>${p}</p>`);
      grid.appendChild(el);
      master.fromTo(el, { autoAlpha: 0, y: 50, rotationX: -25 }, { autoAlpha: 1, y: 0, rotationX: 0, duration: 0.8, ease: 'power3.out' }, item.start + 2.3 + i * 0.4);
    });
    grid.style.perspective = '1200px';
    node.appendChild(grid);
  }

  function sectionScene(item) {
    const node = sceneBox(item);
    const num = make('div', 'sec-num', item.num);
    const word = make('div', 'sec-word');
    const line = make('div', 'sec-line');
    const sub = make('div', 'sec-sub', item.sub);
    node.append(num, word, line, sub);
    kinetic(word, item.word, item.start + 0.15, '190px');
    master.fromTo(num, { autoAlpha: 0, x: -90 }, { autoAlpha: 1, x: 0, duration: 0.9, ease: 'power3.out' }, item.start + 0.05)
      .fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'power3.inOut' }, item.start + 0.45)
      .fromTo(sub, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, item.start + 0.8)
      .to(num, { x: 40, duration: item.dur, ease: 'none' }, item.start + 0.95);
  }

  function clipScene(item) {
    const node = sceneBox(item);
    const cam = make('div', 'cam');
    const win = make('div', 'browser');
    win.innerHTML = `<div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="url"><b>${item.host}</b>${item.route}</div></div>`;
    const screen = make('div', 'screen');
    const video = make('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = `build/clips/${item.clip}.webm`;
    const sheen = make('div', 'sheen');
    screen.append(video, sheen);
    win.appendChild(screen);
    cam.appendChild(win);
    const chip = make('div', 'chip', `<b>${item.tag}</b>${item.chip}`);
    const caption = make('p', 'caption', item.caption);
    node.append(cam, chip, caption);
    clips.push({ video, start: item.start, dur: item.dur, raw: item.trim, rate: item.rate, usable: item.usable });

    const s = item.start;
    master.fromTo(win, { y: 40, z: -140, rotationY: (item.tilt || -12) / 2, rotationX: 3, autoAlpha: 0 },
      { y: 0, z: 0, rotationY: 0, rotationX: 0, autoAlpha: 1, duration: 1.0, ease: 'power3.out' }, s)
      .fromTo(sheen, { xPercent: -120 }, { xPercent: 120, duration: 1.3, ease: 'power2.inOut' }, s + 0.6)
      .fromTo(chip, { x: -30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, s + 0.35)
      .fromTo(caption, { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: 'power2.out' }, s + 0.55);

    if (item.stats) {
      const box = make('div', 'stats');
      item.stats.forEach(([n, l, fmt], i) => {
        const el = make('div', 'stat', `<div class="n">0</div><div class="l">${l}</div>`);
        box.appendChild(el);
        const at = s + 1.6 + i * 0.55;
        master.fromTo(el, { autoAlpha: 0, x: 60 }, { autoAlpha: 1, x: 0, duration: 0.7, ease: 'back.out(1.6)' }, at);
        counter($('.n', el), n, at, 1.3, fmt);
      });
      node.appendChild(box);
    }
  }

  function callScene(item) {
    const node = sceneBox(item);
    const s = item.start;
    const n0 = s + LEAD;
    const phone = make('div', 'phone', `<div class="notch"></div>
      <div class="call-head"><div class="avatar">A</div><div class="call-name">Andrea</div>
      <div class="call-role">Oficial de Admisiones IA · Posgrados UCG</div><div class="call-timer">00:00</div></div>
      <div class="wave">${'<i></i>'.repeat(22)}</div><div class="transcript"></div>`);
    node.appendChild(phone);
    master.fromTo(phone, { autoAlpha: 0, y: 80, rotationY: 18 }, { autoAlpha: 1, y: 0, rotationY: 0, duration: 1.0, ease: 'power3.out' }, s);
    const timer = $('.call-timer', phone);
    const bars = [...phone.querySelectorAll('.wave i')];
    const callEnd = n0 + 11.6;
    updaters.push(t => {
      const live = t >= s && t < item.end;
      if (!live) return;
      const sec = Math.max(0, Math.min(t, callEnd) - s) * 11;
      timer.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
      timer.style.color = t < callEnd ? '#2fa36b' : '#9aa3a1';
      const energy = t < callEnd ? 1 : Math.max(0, 1 - (t - callEnd) * 2);
      bars.forEach((b, i) => {
        const v = Math.abs(Math.sin(t * 7.3 + i * 0.9) * Math.sin(t * 3.1 + i * 0.37));
        b.style.height = (8 + 50 * v * energy) + 'px';
      });
    });

    const transcript = $('.transcript', phone);
    const lines = [
      ['agent', '¡Hola! Le saluda Andrea, Oficial de Admisiones de Posgrados de la UCG.', 'Hi! This is Andrea, UCG graduate admissions.', 0.4],
      ['user', 'Me interesa la maestría en Inteligencia Artificial.', 'I’m interested in the AI master’s.', 2.6],
      ['agent', 'Con gusto. ¿Me deletrea su correo, por favor?', 'Of course. Could you spell your email?', 4.2],
      ['user', 'd-i-e-g-o punto s-a-l-a-z-a-r, arroba example punto com', '', 5.8],
      ['agent', 'Confirmo: diego.salazar@example.com. ¿Es correcto?', 'Let me confirm it back to you.', 7.4],
    ];
    lines.forEach(([who, es, en, at]) => {
      const b = make('div', `bubble ${who}`, es + (en ? `<small>${en}</small>` : ''));
      transcript.appendChild(b);
      master.fromTo(b, { autoAlpha: 0, y: 18, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.8)' }, n0 + at);
    });

    const cap = make('div', 'capture', `<div class="kicker">Captured during the call</div><h2 class="title" style="font-size:58px">17 data points, <em>structured.</em></h2>`);
    const checks = [
      ['Name', '', 2.2],
      ['Email spelled back and confirmed', '✓ Deletreado', 4.4],
      ['Phone read back digit by digit', '✓ Tel. confirmado', 6.2],
      ['Program of interest', '', 8.4],
      ['City · modality · start horizon', '', 9.3],
      ['Key questions and obstacles', '', 10.2],
      ['Recap-email consent · advisor callback', '', 11.1],
    ];
    checks.forEach(([label, tag, at]) => {
      const row = make('div', 'check', `<div class="box">${icon('check')}</div><div>${label}</div>${tag ? `<span class="t">${tag}</span>` : ''}`);
      cap.appendChild(row);
      master.fromTo(row, { autoAlpha: 0, x: 40 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'power2.out' }, n0 + at - 0.6);
      master.set(row, { className: 'check on' }, n0 + at);
      master.fromTo(row.querySelector('.box'), { scale: 0.6 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }, n0 + at);
    });
    node.appendChild(cap);
    master.from(cap.querySelector('.kicker'), { autoAlpha: 0, duration: 0.5 }, s + 0.6);
    master.from(cap.querySelector('h2'), { autoAlpha: 0, y: 24, duration: 0.7, ease: 'power3.out' }, s + 0.7);

    const arrow = make('div', 'arrow', 'Lands in the CRM →');
    arrow.style.cssText += ';left:790px;top:905px;';
    const card = make('div', 'leadcard', `<div class="top"><div class="nm">Diego Salazar Andrade</div><div class="pts">85 pts</div></div>
      <div class="pg">Inteligencia Artificial y Analítica de Datos</div>
      <div class="tags"><span class="tag">Llamada Retell</span><span class="tag ok">✓ Deletreado</span><span class="tag ok">✓ Tel. confirmado</span></div>
      <div class="stage">Etapa · Nuevo</div>`);
    card.style.cssText += ';left:1210px;top:780px;';
    node.append(arrow, card);
    master.fromTo(arrow, { autoAlpha: 0, x: -20 }, { autoAlpha: 1, x: 0, duration: 0.5 }, callEnd + 0.1)
      .fromTo(card, { autoAlpha: 0, x: 120, rotation: 4 }, { autoAlpha: 1, x: 0, rotation: 0, duration: 0.8, ease: 'back.out(1.4)' }, callEnd + 0.3)
      .to(cap, { y: -110, duration: 0.8, ease: 'power2.inOut' }, callEnd);

    const flag = make('div', 'flag', 'Illustrative call with a fictitious applicant. The live agent speaks Ecuadorian Spanish.');
    node.appendChild(flag);
    master.from(flag, { autoAlpha: 0, duration: 0.6 }, s + 1.0);
  }

  function flywheelScene(item) {
    const node = sceneBox(item);
    const cx = 960, cy = 560, r = 330;
    const C = 2 * Math.PI * r;
    const svg = `<svg class="wheel" viewBox="0 0 1920 1080"><defs><linearGradient id="wheelGrad" x1="0" x2="1"><stop offset="0" stop-color="#ff8300"/><stop offset="1" stop-color="#ffb35c"/></linearGradient></defs>
      <circle class="ring" cx="${cx}" cy="${cy}" r="${r}"/><circle class="ring-fill" cx="${cx}" cy="${cy}" r="${r}" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 ${cx} ${cy})"/></svg>`;
    node.insertAdjacentHTML('beforeend', svg);
    const fill = node.querySelector('.ring-fill');
    master.fromTo(fill, { attr: { 'stroke-dashoffset': C } }, { attr: { 'stroke-dashoffset': 0 }, duration: 2.2, ease: 'power2.inOut' }, item.start + 0.3);
    const hub = make('div', 'hub', '<div class="k">The engine</div><div class="h">One connected <span style="color:#ff8300">loop.</span></div>');
    node.appendChild(hub);
    master.from(hub, { autoAlpha: 0, scale: 0.9, duration: 0.8, ease: 'power3.out' }, item.start + 0.5);
    const nodes = [
      ['chart', 'Search demand', 'SEO Analysis · Ecuador'],
      ['portal', 'Portal', '34 programs · web form'],
      ['phone', 'AI admissions officer', 'Verified phone inquiries'],
      ['crm', 'Admissions CRM', 'Six stages · follow-up'],
      ['doc', 'Content Engine', 'Guides from real demand'],
    ];
    const els = nodes.map(([ic, lb, sm], i) => {
      const a = (-90 + i * 72) * Math.PI / 180;
      const el = make('div', 'node', `<div class="dot">${icon(ic)}</div><div class="lb">${lb}</div><div class="sm">${sm}</div>`);
      el.style.left = (cx + r * Math.cos(a)) + 'px';
      el.style.top = (cy + r * Math.sin(a) - 46) + 'px';
      node.appendChild(el);
      master.fromTo(el, { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, duration: 0.55, ease: 'back.out(2)' }, item.start + 0.4 + i * 0.38);
      return el;
    });
    const runner = make('div', 'runner');
    node.appendChild(runner);
    const n0 = item.start + LEAD;
    const windows = [[0, 1.2], [0.9, 2.0], [2.0, 3.8], [3.9, 5.4], [5.5, 9.5]];
    updaters.push(t => {
      if (t < item.start || t >= item.end) return;
      const a = -Math.PI / 2 + (t - item.start) * 0.9;
      runner.style.left = (cx + r * Math.cos(a)) + 'px';
      runner.style.top = (cy + r * Math.sin(a)) + 'px';
      runner.style.opacity = t > item.start + 2.0 ? 1 : 0;
      els.forEach((el, i) => el.classList.toggle('hot', t - n0 >= windows[i][0] && t - n0 < windows[i][1]));
    });
  }

  function closingScene(item) {
    const node = sceneBox(item);
    const wrap = make('div', 'center');
    node.appendChild(wrap);
    const logo = make('img', 'logo');
    logo.src = '../../public/media/ucg-logo-light.png';
    logo.alt = 'Universidad Casa Grande';
    wrap.appendChild(logo);
    kinetic(wrap, 'Student Acquisition <em>Engine.</em>', item.start + 0.7, '112px').style.textAlign = 'center';
    const sub = make('p', 'sub', 'From the first search to enrollment.');
    sub.style.cssText = 'text-align:center;margin:40px auto 0;font-size:36px;';
    wrap.appendChild(sub);
    const legal = make('p', 'legal', 'Pilot portal. Applicants, calls and CRM records shown are fictitious and were recorded on a local copy of the platform. Search figures come from a dated OpenSEO Ecuador snapshot.');
    node.appendChild(legal);
    master.from(logo, { autoAlpha: 0, y: 24, duration: 0.9, ease: 'power3.out' }, item.start + 0.1)
      .from(sub, { autoAlpha: 0, y: 20, duration: 0.8, ease: 'power3.out' }, item.start + 2.2)
      .from(legal, { autoAlpha: 0, duration: 0.8 }, item.start + 3.0);
  }

  // ---------- Plan ----------
  const host = 'ucg-posgrados';
  const plan = [
    { id: 'hook', type: 'hook', dur: 6.5 },
    { id: 'title', type: 'title', dur: 7.5 },
    { id: 'sec-attract', type: 'section', dur: 2.8, num: '01', word: '<em>Attract.</em>', sub: 'A portal built to convert curiosity.' },
    { id: 'portal', type: 'clip', clip: 'portal', host, route: ' / inicio', tag: 'Portal', chip: 'Attract', tilt: -12,
      caption: '<strong>34 verified programs</strong> and a direct line to an AI admissions officer.',
      stats: [[34, 'master’s programs'], [7, 'areas of study'], [15, 'open for enrollment now']] },
    { id: 'catalog', type: 'clip', clip: 'catalog', host, route: ' / maestrías', tag: 'Portal', chip: 'Explore', tilt: 12,
      caption: 'Instant search, area filters and <strong>open-enrollment status</strong> at a glance.' },
    { id: 'sec-engage', type: 'section', dur: 2.8, num: '02', word: '<em>Engage.</em>', sub: 'Every inquiry answered and verified.' },
    { id: 'call', type: 'call', dur: 14 },
    { id: 'form', type: 'clip', clip: 'form', host, route: ' / solicitar', tag: 'Web', chip: 'Inquiry form', tilt: -10,
      caption: 'One form, <strong>straight into the CRM</strong>, with consent recorded per channel.' },
    { id: 'sec-convert', type: 'section', dur: 2.8, num: '03', word: '<em>Convert.</em>', sub: 'One pipeline from inquiry to enrollment.' },
    { id: 'crm', type: 'clip', clip: 'crm', host, route: ' / admin / crm', tag: 'Admin', chip: 'Admissions CRM', tilt: 12,
      caption: 'A <strong>six-stage pipeline</strong> with verification badges, lead scores and call activity.' },
    { id: 'lead', type: 'clip', clip: 'lead', host, route: ' / admin / expediente', tag: 'Admin', chip: 'Applicant record', tilt: -12,
      caption: 'Call intelligence, <strong>ready follow-ups</strong> and advisor callback tasks.' },
    { id: 'sec-grow', type: 'section', dur: 2.8, num: '04', word: '<em>Grow.</em>', sub: 'Turn search demand into enrollments.' },
    { id: 'seo', type: 'clip', clip: 'seo', host, route: ' / admin / seo', tag: 'Admin', chip: 'SEO Analysis', tilt: 12,
      caption: '<strong>Ecuador search demand</strong>, mapped program by program, with findings tied to the data.',
      stats: [[2610, 'monthly searches in Ecuador'], [22, 'of 34 programs with demand'], [720, 'searches for the top term']] },
    { id: 'content', type: 'clip', clip: 'content', host, route: ' / admin / contenido', tag: 'Admin', chip: 'Content Engine', tilt: -12,
      caption: 'Demand becomes <strong>guides</strong>: drafted from the catalog, reviewed, then published.' },
    { id: 'flywheel', type: 'flywheel', dur: 9 },
    { id: 'closing', type: 'closing', dur: 7.5 },
  ];

  const builders = { hook: hookScene, title: titleScene, section: sectionScene, clip: clipScene, call: callScene, flywheel: flywheelScene, closing: closingScene };

  function fitDurations(item) {
    const need = narration[item.id] ? LEAD + narration[item.id] + PAD_END : 0;
    if (item.type !== 'clip') { item.dur = Math.max(item.dur, need); return; }
    item.trim = trims[item.clip] ?? TRIM;
    item.usable = Math.max(2, (durations[item.clip] || 10) - item.trim - TAIL);
    item.dur = Math.max(item.usable / PLAY_RATE, need);
    item.rate = PLAY_RATE;
  }

  function build() {
    let t = 0;
    plan.forEach(item => {
      fitDurations(item);
      item.start = t;
      item.end = t + item.dur;
      t = item.end;
    });
    plan.forEach(item => builders[item.type](item));
    plan.slice(0, -1).forEach(item => wipeAt(item.end));
    master.to('.glow.a', { x: 500, y: 200, duration: t, ease: 'sine.inOut' }, 0)
      .to('.glow.b', { x: -420, y: -160, duration: t, ease: 'sine.inOut' }, 0)
      .to('.grid', { backgroundPosition: '0px 400px', duration: t, ease: 'none' }, 0);
    master.set({}, {}, t);
    window.__duration = t;
    window.__scenes = plan.map(i => ({ id: i.id, type: i.type, start: +i.start.toFixed(3), end: +i.end.toFixed(3),
      narrationStart: narration[i.id] ? +(i.start + LEAD).toFixed(3) : null, rate: i.rate ? +i.rate.toFixed(3) : null }));
  }

  function seekVideo(video, time) {
    return new Promise(resolve => {
      if (Math.abs(video.currentTime - time) < 0.01 && video.readyState >= 2) return resolve();
      const timer = setTimeout(resolve, 3000);
      video.addEventListener('seeked', () => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { clearTimeout(timer); resolve(); }, 35)));
      }, { once: true });
      video.currentTime = time;
    });
  }

  window.renderAt = async t => {
    master.seek(t, false);
    updaters.forEach(fn => fn(t));
    for (const clip of clips) {
      if (t >= clip.start && t < clip.start + clip.dur) {
        // Land in the middle of a recorded frame, and hold the last one when the scene runs longer.
        const step = Math.min(Math.round((t - clip.start) * clip.rate * SOURCE_FPS), Math.floor(clip.usable * SOURCE_FPS));
        await seekVideo(clip.video, clip.raw + (step + 0.5) / SOURCE_FPS);
      }
    }
    return true;
  };

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
    const ready = clips.map(c => waitVideo(c.video));
    ready.push(document.fonts ? document.fonts.ready : Promise.resolve());
    const logo = $('img.logo');
    if (logo) ready.push(logo.complete ? Promise.resolve() : new Promise(r => { logo.onload = r; logo.onerror = r; }));
    await Promise.all(ready);
    window.__ready = true;
  });
})();
