(() => {
  'use strict';

  const DEFAULT_API_BASE = 'https://casagrande-posgrados-production.up.railway.app';
  const DEFAULT_VOICE_PHONE = '+19124915544';

  const state = {
    apiBase: DEFAULT_API_BASE,
    voicePhone: DEFAULT_VOICE_PHONE,
    apiOverridden: false,
    programs: [],
    programBySlug: new Map(),
    filters: {
      query: '',
      area: '',
      mode: '',
      family: '',
      openOnly: false
    }
  };

  const els = {
    menuToggle: document.getElementById('menu-toggle'),
    mobileDrawer: document.getElementById('mobile-drawer'),
    healthPill: document.getElementById('health-pill'),
    healthText: document.getElementById('health-text'),
    voiceBadge: document.getElementById('voice-service-badge'),
    voiceDetail: document.getElementById('voice-service-detail'),
    copyPhoneBtn: document.getElementById('copy-phone-btn'),
    copyPhoneStatus: document.getElementById('copy-phone-status'),
    heroProgramCount: document.getElementById('hero-program-count'),
    statTotalPrograms: document.getElementById('stat-total-programs'),
    statTotalAreas: document.getElementById('stat-total-areas'),
    statOpenPrograms: document.getElementById('stat-open-programs'),
    catalogCount: document.getElementById('catalog-count'),
    catalogSearch: document.getElementById('catalog-search'),
    areaFilter: document.getElementById('area-filter'),
    modeFilter: document.getElementById('mode-filter'),
    familyFilter: document.getElementById('family-filter'),
    areaChips: document.getElementById('area-chips'),
    openOnlyFilter: document.getElementById('open-only-filter'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    emptyResetBtn: document.getElementById('empty-reset-btn'),
    catalogGrid: document.getElementById('catalog-grid'),
    catalogEmpty: document.getElementById('catalog-empty'),
    leadForm: document.getElementById('lead-form'),
    leadName: document.getElementById('lead-name'),
    leadEmail: document.getElementById('lead-email'),
    leadPhone: document.getElementById('lead-phone'),
    phoneReqLabel: document.getElementById('phone-req-label'),
    leadProgram: document.getElementById('lead-program'),
    leadCity: document.getElementById('lead-city'),
    leadHorizon: document.getElementById('lead-horizon'),
    leadNotes: document.getElementById('lead-notes'),
    leadAppointment: document.getElementById('lead-appointment'),
    leadConsentEmail: document.getElementById('lead-consent-email'),
    leadConsentVoice: document.getElementById('lead-consent-voice'),
    leadError: document.getElementById('lead-error'),
    leadSuccess: document.getElementById('lead-success'),
    leadSuccessMsg: document.getElementById('lead-success-msg'),
    leadSubmitBtn: document.getElementById('lead-submit-btn'),
    selectedProgramBanner: document.getElementById('selected-program-banner'),
    selectedProgramName: document.getElementById('selected-program-name'),
    clearSelectedProgram: document.getElementById('clear-selected-program'),
    footerApiInfo: document.getElementById('footer-api-info')
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function safeUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return '';
    try {
      const parsed = new URL(raw.trim(), window.location.href);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
    } catch {
      return '';
    }
  }

  function formatCurrency(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return 'Consultar con Admisiones';
    }
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value) + ' USD';
  }

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function parseJsonSafe(raw, fallback = {}) {
    if (!raw) return fallback;
    if (typeof raw === 'object') return raw;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function sanitizeApiBase(candidate) {
    if (typeof candidate !== 'string' || !candidate.trim()) return '';
    try {
      const parsed = new URL(candidate.trim());
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      return parsed.origin + parsed.pathname.replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  function formatVoicePhone(raw) {
    const clean = String(raw || '').trim();
    if (!clean) return '';
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return clean.startsWith('+') ? clean : `+${digits}`;
  }

  function applyVoicePhone(rawPhone) {
    const clean = String(rawPhone || '').trim();
    if (!clean) return;
    const digits = clean.replace(/\D/g, '');
    const e164 = clean.startsWith('+') ? clean : (digits ? `+${digits}` : '');
    if (!e164) return;
    state.voicePhone = e164;
    const formatted = formatVoicePhone(e164);

    document.querySelectorAll('[data-voice-phone-link]').forEach((el) => {
      el.setAttribute('href', `tel:${e164}`);
    });
    document.querySelectorAll('[data-voice-phone-display]').forEach((el) => {
      el.textContent = formatted;
    });
    if (els.copyPhoneBtn) {
      els.copyPhoneBtn.disabled = false;
    }
  }

  async function resolveConfig() {
    const params = new URLSearchParams(window.location.search);
    const queryApi = sanitizeApiBase(params.get('api') || '');
    if (queryApi) {
      state.apiBase = queryApi;
      state.apiOverridden = true;
    }

    const inlineConfigEl = document.getElementById('ucg-config');
    if (inlineConfigEl?.textContent) {
      const parsed = parseJsonSafe(inlineConfigEl.textContent, null);
      if (!state.apiOverridden) {
        const inlineApi = sanitizeApiBase(parsed?.apiBase);
        if (inlineApi) state.apiBase = inlineApi;
      }
      if (parsed?.voicePhone) {
        applyVoicePhone(parsed.voicePhone);
      }
      if (state.apiOverridden || sanitizeApiBase(parsed?.apiBase)) {
        return;
      }
    }

    try {
      const res = await fetch('./config.json', { cache: 'no-store' });
      if (res.ok) {
        const cfg = await res.json();
        if (!state.apiOverridden) {
          const fileApi = sanitizeApiBase(cfg?.apiBase);
          if (fileApi) state.apiBase = fileApi;
        }
        if (cfg?.voicePhone) {
          applyVoicePhone(cfg.voicePhone);
        }
      }
    } catch {
      // Keep default API base when config.json cannot be read locally.
    }
  }

  async function loadCatalog() {
    const inlineCatalogEl = document.getElementById('catalog-data');
    let list = [];
    if (inlineCatalogEl?.textContent) {
      const parsed = parseJsonSafe(inlineCatalogEl.textContent, []);
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed;
      }
    }

    if (!list.length) {
      try {
        const res = await fetch('./catalog.json');
        if (res.ok) {
          const fetched = await res.json();
          if (Array.isArray(fetched)) list = fetched;
        }
      } catch {
        // Leave empty if catalog.json is unreachable.
      }
    }

    state.programs = list.map((item) => ({
      ...item,
      image: typeof item.image === 'string' && item.image.startsWith('/media/')
        ? `.${item.image}`
        : (item.image || './media/campus-hero.webp')
    }));
    state.programBySlug = new Map(state.programs.map((p) => [p.slug, p]));
  }

  function populateHeroAndFilters() {
    const areas = [...new Set(state.programs.map((p) => p.area).filter(Boolean))];
    const modes = [...new Set(state.programs.map((p) => p.mode).filter(Boolean))];
    const families = [...new Set(state.programs.map((p) => p.family).filter(Boolean))];
    const openCount = state.programs.filter((p) => p.admissionsStatus === 'Inscripción disponible').length;

    if (els.heroProgramCount) els.heroProgramCount.textContent = String(state.programs.length);
    if (els.statTotalPrograms) els.statTotalPrograms.textContent = String(state.programs.length);
    if (els.statTotalAreas) els.statTotalAreas.textContent = String(areas.length);
    if (els.statOpenPrograms) els.statOpenPrograms.textContent = String(openCount);

    if (els.areaFilter) {
      els.areaFilter.innerHTML = '<option value="">Todas las áreas</option>' +
        areas.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    }
    if (els.modeFilter) {
      els.modeFilter.innerHTML = '<option value="">Todas las modalidades</option>' +
        modes.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    }
    if (els.familyFilter) {
      els.familyFilter.innerHTML = '<option value="">Inmersiva y Flexible</option>' +
        families.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
    }

    if (els.areaChips) {
      els.areaChips.innerHTML = [
        { value: '', label: 'Todas (' + state.programs.length + ')' },
        ...areas.map((a) => ({
          value: a,
          label: `${a} (${state.programs.filter((p) => p.area === a).length})`
        }))
      ]
        .map((chip) => `<button type="button" class="chip-btn${state.filters.area === chip.value ? ' is-active' : ''}" data-area-chip="${escapeHtml(chip.value)}">${escapeHtml(chip.label)}</button>`)
        .join('');
    }

    if (els.leadProgram) {
      const currentVal = els.leadProgram.value;
      els.leadProgram.innerHTML = '<option value="">Quiero orientación para elegir una maestría</option>' +
        state.programs
          .map((p) => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.title)} (${escapeHtml(p.area)})</option>`)
          .join('');
      if (currentVal && state.programBySlug.has(currentVal)) {
        els.leadProgram.value = currentVal;
      }
    }
  }

  function statusBadgeClass(status) {
    if (status === 'Inscripción disponible') return 'status-open';
    if (status === 'Inscripciones cerradas') return 'status-closed';
    return 'status-consult';
  }

  function renderCatalog() {
    const q = normalizeText(state.filters.query);
    const { area, mode, family, openOnly } = state.filters;

    const filtered = state.programs.filter((p) => {
      if (area && p.area !== area) return false;
      if (mode && p.mode !== mode) return false;
      if (family && p.family !== family) return false;
      if (openOnly && p.admissionsStatus !== 'Inscripción disponible') return false;
      if (!q) return true;
      const haystack = normalizeText([
        p.title,
        p.shortTitle,
        p.area,
        p.degree,
        p.summary,
        p.family,
        p.mode,
        ...(Array.isArray(p.curriculum) ? p.curriculum : []),
        ...(Array.isArray(p.details) ? p.details : [])
      ].join(' '));
      return haystack.includes(q);
    });

    if (els.catalogCount) {
      els.catalogCount.textContent = `${filtered.length} de ${state.programs.length}`;
    }

    const hasFilters = Boolean(q || area || mode || family || openOnly);
    if (els.resetFiltersBtn) els.resetFiltersBtn.hidden = !hasFilters;

    if (!filtered.length) {
      els.catalogGrid.innerHTML = '';
      els.catalogEmpty.hidden = false;
      return;
    }

    els.catalogEmpty.hidden = true;
    els.catalogGrid.innerHTML = filtered.map((p) => {
      const curriculum = Array.isArray(p.curriculum) ? p.curriculum.filter(Boolean) : [];
      const previewItems = curriculum.slice(0, 3);
      const officialUrl = safeUrl(p.url);
      const brochureUrl = safeUrl(p.brochure);
      const tuitionText = formatCurrency(p.price);

      return `<article class="program-card" data-slug="${escapeHtml(p.slug)}">
        <div class="program-media">
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.shortTitle || p.title)}" loading="lazy" decoding="async" width="640" height="360">
          <div class="program-badges">
            <span class="badge badge-area">${escapeHtml(p.area)}</span>
            <span class="badge badge-family">${escapeHtml(p.family || 'Posgrado')}</span>
          </div>
        </div>
        <div class="program-body">
          <div class="program-status-row">
            <span class="status-pill ${statusBadgeClass(p.admissionsStatus)}">${escapeHtml(p.admissionsStatus || 'Consultar')}</span>
            <span class="program-mode-text">${escapeHtml(p.mode || 'En línea')}</span>
          </div>
          <h3 class="program-title">${escapeHtml(p.title)}</h3>
          ${p.degree ? `<p class="program-degree">${escapeHtml(p.degree)}</p>` : ''}

          <dl class="program-facts">
            <div>
              <dt>Inversión</dt>
              <dd>${escapeHtml(tuitionText)}</dd>
            </div>
            <div>
              <dt>Duración</dt>
              <dd>${escapeHtml(p.duration || 'Consultar')}</dd>
            </div>
          </dl>

          <p class="program-summary">${escapeHtml(p.summary || '')}</p>

          ${curriculum.length ? `<div class="program-curriculum">
            <div class="curriculum-label">Vista previa de malla (${curriculum.length} asignaturas)</div>
            <ul class="curriculum-preview">
              ${previewItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
            ${curriculum.length > 3 ? `<details class="curriculum-more">
              <summary>Ver malla completa (${curriculum.length})</summary>
              <ol>${curriculum.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
            </details>` : ''}
            ${p.curriculumNote ? `<p class="curriculum-note">${escapeHtml(p.curriculumNote)}</p>` : ''}
          </div>` : ''}

          <div class="program-actions">
            <button type="button" class="btn btn-primary btn-block" data-select-program="${escapeHtml(p.slug)}">Solicitar información</button>
            <div class="program-ext-links">
              ${officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">Ficha oficial UCG ↗</a>` : ''}
              ${brochureUrl ? `<a href="${escapeHtml(brochureUrl)}" target="_blank" rel="noopener noreferrer">Folleto PDF ↗</a>` : ''}
            </div>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function syncAreaChipsActive() {
    if (!els.areaChips) return;
    els.areaChips.querySelectorAll('[data-area-chip]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.areaChip === state.filters.area);
    });
  }

  function selectProgramInForm(slug, scrollToForm = true) {
    if (!els.leadProgram) return;
    const program = state.programBySlug.get(slug);
    els.leadProgram.value = program ? program.slug : '';

    if (program && els.selectedProgramBanner && els.selectedProgramName) {
      els.selectedProgramName.textContent = `${program.title} · ${formatCurrency(program.price)}`;
      els.selectedProgramBanner.hidden = false;
    } else if (els.selectedProgramBanner) {
      els.selectedProgramBanner.hidden = true;
    }

    if (scrollToForm) {
      document.getElementById('solicitar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        els.leadName?.focus({ preventScroll: true });
      }, 350);
    }
  }

  function resetCatalogFilters() {
    state.filters = { query: '', area: '', mode: '', family: '', openOnly: false };
    if (els.catalogSearch) els.catalogSearch.value = '';
    if (els.areaFilter) els.areaFilter.value = '';
    if (els.modeFilter) els.modeFilter.value = '';
    if (els.familyFilter) els.familyFilter.value = '';
    if (els.openOnlyFilter) els.openOnlyFilter.checked = false;
    syncAreaChipsActive();
    renderCatalog();
  }

  async function checkHealth() {
    if (!els.healthPill || !els.healthText) return;
    try {
      const res = await fetch(`${state.apiBase}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.inboundNumber) {
        applyVoicePhone(data.inboundNumber);
      }
      const dbOk = data.dbReady !== false && data.ok !== false;
      const retellOk = Boolean(data.retellConfigured);
      const mailOk = Boolean(data.mailConfigured);

      if (dbOk && retellOk && mailOk) {
        els.healthPill.className = 'health-pill health-ok';
        els.healthText.textContent = 'Voz IA y CRM en línea';
        if (els.voiceBadge) {
          els.voiceBadge.className = 'status-badge is-ok';
          els.voiceBadge.textContent = 'Servicio activo 24/7';
        }
        if (els.voiceDetail) {
          const numText = formatVoicePhone(data.inboundNumber || state.voicePhone) || 'línea Retell activa';
          els.voiceDetail.textContent = `Retell AI (${numText}), base CRM SQLite y envío de resúmenes Resend operativos.`;
        }
      } else if (dbOk) {
        els.healthPill.className = 'health-pill health-warn';
        els.healthText.textContent = 'CRM en línea (parcial)';
        if (els.voiceBadge) {
          els.voiceBadge.className = 'status-badge is-warn';
          els.voiceBadge.textContent = 'Backend conectado';
        }
        if (els.voiceDetail) {
          const missing = [];
          if (!retellOk) missing.push('Retell');
          if (!mailOk) missing.push('Resend');
          els.voiceDetail.textContent = `Base CRM lista.${missing.length ? ' Pendiente configuración de: ' + missing.join(', ') + '.' : ''}`;
        }
      } else {
        throw new Error('Backend degraded');
      }
    } catch {
      els.healthPill.className = 'health-pill health-err';
      els.healthText.textContent = 'Backend sin conexión';
      if (els.voiceBadge) {
        els.voiceBadge.className = 'status-badge is-err';
        els.voiceBadge.textContent = 'Sin respuesta del servidor';
      }
      if (els.voiceDetail) {
        els.voiceDetail.textContent = `No pudimos conectar con ${state.apiBase}/api/health. Puedes probar otra API con ?api=https://...`;
      }
    }
  }

  function updatePhoneRequirement() {
    const voiceChecked = Boolean(els.leadConsentVoice?.checked);
    if (els.leadPhone) {
      els.leadPhone.required = voiceChecked;
    }
    if (els.phoneReqLabel) {
      els.phoneReqLabel.textContent = voiceChecked
        ? '(obligatorio para llamadas)'
        : '(opcional)';
    }
  }

  async function submitLeadForm(event) {
    event.preventDefault();
    if (!els.leadForm) return;

    els.leadError.hidden = true;
    els.leadSuccess.hidden = true;

    const name = (els.leadName?.value || '').trim();
    const email = (els.leadEmail?.value || '').trim();
    const phone = (els.leadPhone?.value || '').trim();
    const program = els.leadProgram?.value || '';
    const city = (els.leadCity?.value || '').trim();
    const horizon = els.leadHorizon?.value || '';
    const notes = (els.leadNotes?.value || '').trim();
    const requestAppointment = Boolean(els.leadAppointment?.checked);
    const consentEmail = Boolean(els.leadConsentEmail?.checked);
    const consentVoice = Boolean(els.leadConsentVoice?.checked);

    if (name.length < 2) {
      els.leadError.textContent = 'Por favor ingresa tu nombre completo.';
      els.leadError.hidden = false;
      els.leadName?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      els.leadError.textContent = 'Por favor ingresa un correo electrónico válido.';
      els.leadError.hidden = false;
      els.leadEmail?.focus();
      return;
    }
    if (consentVoice && !phone) {
      els.leadError.textContent = 'Ingresa tu teléfono si autorizaste llamadas de seguimiento.';
      els.leadError.hidden = false;
      els.leadPhone?.focus();
      return;
    }

    const context = {
      origen: requestAppointment ? 'cita-github-pages' : 'portal-github-pages'
    };
    if (city) context.ciudad = city;
    if (horizon) context.horizonte = horizon;
    if (notes) context.consulta = notes;
    if (requestAppointment) context.solicitaCita = true;

    const payload = {
      name,
      email,
      phone,
      program,
      source: 'Formulario web',
      consentEmail,
      consentVoice,
      context
    };

    const prevText = els.leadSubmitBtn.textContent;
    els.leadSubmitBtn.disabled = true;
    els.leadSubmitBtn.textContent = 'Enviando solicitud…';

    try {
      const idempotencyKey = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `ucg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const res = await fetch(`${state.apiBase}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Error al enviar (${res.status}).`);
      }

      const selectedProg = state.programBySlug.get(program);
      els.leadSuccessMsg.textContent = data.message ||
        `Registramos tu solicitud${selectedProg ? ' para ' + selectedProg.shortTitle : ''}. El equipo de Admisiones podrá revisar tu ficha en Admin.`;
      els.leadSuccess.hidden = false;
      els.leadForm.reset();
      if (els.leadConsentEmail) els.leadConsentEmail.checked = true;
      updatePhoneRequirement();
      selectProgramInForm('', false);
    } catch (err) {
      els.leadError.textContent = err?.message || 'No pudimos conectar con el servidor de admisiones. Intenta nuevamente.';
      els.leadError.hidden = false;
    } finally {
      els.leadSubmitBtn.disabled = false;
      els.leadSubmitBtn.textContent = prevText;
    }
  }

  function bindEvents() {
    if (els.menuToggle && els.mobileDrawer) {
      els.menuToggle.addEventListener('click', () => {
        const nextOpen = els.mobileDrawer.hidden;
        els.mobileDrawer.hidden = !nextOpen;
        els.menuToggle.setAttribute('aria-expanded', String(nextOpen));
      });

      els.mobileDrawer.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
          els.mobileDrawer.hidden = true;
          els.menuToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    if (els.copyPhoneBtn) {
      els.copyPhoneBtn.addEventListener('click', async () => {
        const number = state.voicePhone;
        if (!number) {
          els.copyPhoneStatus.textContent = 'Número en activación';
          return;
        }
        try {
          await navigator.clipboard.writeText(number);
          els.copyPhoneStatus.textContent = '¡Copiado!';
        } catch {
          els.copyPhoneStatus.textContent = number;
        }
        window.setTimeout(() => {
          if (els.copyPhoneStatus) els.copyPhoneStatus.textContent = '';
        }, 2500);
      });
    }

    els.catalogSearch?.addEventListener('input', (e) => {
      state.filters.query = e.target.value;
      renderCatalog();
    });

    els.areaFilter?.addEventListener('change', (e) => {
      state.filters.area = e.target.value;
      syncAreaChipsActive();
      renderCatalog();
    });

    els.modeFilter?.addEventListener('change', (e) => {
      state.filters.mode = e.target.value;
      renderCatalog();
    });

    els.familyFilter?.addEventListener('change', (e) => {
      state.filters.family = e.target.value;
      renderCatalog();
    });

    els.openOnlyFilter?.addEventListener('change', (e) => {
      state.filters.openOnly = e.target.checked;
      renderCatalog();
    });

    els.areaChips?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-area-chip]');
      if (!btn) return;
      state.filters.area = btn.dataset.areaChip || '';
      if (els.areaFilter) els.areaFilter.value = state.filters.area;
      syncAreaChipsActive();
      renderCatalog();
    });

    els.resetFiltersBtn?.addEventListener('click', resetCatalogFilters);
    els.emptyResetBtn?.addEventListener('click', resetCatalogFilters);

    els.catalogGrid?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-select-program]');
      if (!btn) return;
      selectProgramInForm(btn.dataset.selectProgram || '', true);
    });

    els.leadProgram?.addEventListener('change', (e) => {
      selectProgramInForm(e.target.value, false);
    });

    els.clearSelectedProgram?.addEventListener('click', () => {
      selectProgramInForm('', false);
      els.leadProgram?.focus();
    });

    els.leadConsentVoice?.addEventListener('change', updatePhoneRequirement);
    els.leadForm?.addEventListener('submit', submitLeadForm);
  }

  async function init() {
    await Promise.all([resolveConfig(), loadCatalog()]);

    if (els.footerApiInfo) {
      els.footerApiInfo.textContent = `API conectada: ${state.apiBase}${state.apiOverridden ? ' (override ?api=)' : ''}`;
    }

    populateHeroAndFilters();
    renderCatalog();

    const params = new URLSearchParams(window.location.search);
    const preselectSlug = params.get('programa') || '';
    if (preselectSlug && state.programBySlug.has(preselectSlug)) {
      selectProgramInForm(preselectSlug, false);
    }
    if (window.location.hash === '#cita' && els.leadAppointment) {
      els.leadAppointment.checked = true;
    }

    updatePhoneRequirement();
    bindEvents();
    checkHealth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
