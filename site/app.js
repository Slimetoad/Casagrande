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
    footerApiInfo: document.getElementById('footer-api-info'),
    herramientasSection: document.getElementById('herramientas'),
    oriArea: document.getElementById('ori-area'),
    oriMode: document.getElementById('ori-mode'),
    oriDuration: document.getElementById('ori-duration'),
    oriPriority: document.getElementById('ori-priority'),
    oriSummary: document.getElementById('ori-summary'),
    oriResults: document.getElementById('ori-results'),
    hubSimProgram: document.getElementById('hub-sim-program'),
    hubSimCustomWrap: document.getElementById('hub-sim-custom-wrap'),
    hubSimTuitionRange: document.getElementById('hub-sim-tuition-range'),
    hubSimTuitionReadout: document.getElementById('hub-sim-tuition-readout'),
    hubSimDiscountRange: document.getElementById('hub-sim-discount-range'),
    hubSimDiscountReadout: document.getElementById('hub-sim-discount-readout'),
    hubSimDownRange: document.getElementById('hub-sim-down-range'),
    hubSimDownReadout: document.getElementById('hub-sim-down-readout'),
    hubSimMonthsRange: document.getElementById('hub-sim-months-range'),
    hubSimMonthsReadout: document.getElementById('hub-sim-months-readout'),
    hubSimDisclaimer: document.getElementById('hub-sim-disclaimer'),
    hubSimDonutMount: document.getElementById('hub-sim-donut-mount'),
    hubSimMonthly: document.getElementById('hub-sim-monthly'),
    hubSimMonthlySub: document.getElementById('hub-sim-monthly-sub'),
    hubSimBarsMount: document.getElementById('hub-sim-bars-mount'),
    hubSimGross: document.getElementById('hub-sim-gross'),
    hubSimSavings: document.getElementById('hub-sim-savings'),
    hubSimDown: document.getElementById('hub-sim-down'),
    hubSimFinanced: document.getElementById('hub-sim-financed'),
    hubSimApplyBtn: document.getElementById('hub-sim-apply-btn'),
    hubSimDetailLink: document.getElementById('hub-sim-detail-link'),
    cmpSelect1: document.getElementById('cmp-select-1'),
    cmpSelect2: document.getElementById('cmp-select-2'),
    cmpSelect3: document.getElementById('cmp-select-3'),
    cmpChartMount: document.getElementById('cmp-chart-mount'),
    cmpTableMount: document.getElementById('cmp-table-mount')
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

  function formatUsdShort(value) {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(Math.max(0, Math.round(Number(value) || 0)));
  }

  function programDetailHref(slug) {
    return `./programas/${encodeURIComponent(String(slug || ''))}/`;
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
      const detailUrl = programDetailHref(p.slug);

      return `<article class="program-card" data-slug="${escapeHtml(p.slug)}">
        <div class="program-media">
          <a class="program-media-link" href="${detailUrl}" aria-label="Más detalles de ${escapeHtml(p.title)}">
            <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.shortTitle || p.title)}" loading="lazy" decoding="async" width="640" height="360">
          </a>
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
          <h3 class="program-title"><a class="program-title-link" href="${detailUrl}">${escapeHtml(p.title)}</a></h3>
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
            <div class="program-actions-row">
              <a class="btn btn-primary" href="${detailUrl}">Más detalles →</a>
              <button type="button" class="btn btn-ghost-dark" data-select-program="${escapeHtml(p.slug)}">Solicitar info</button>
            </div>
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

  function parseDurationMonths(duration) {
    const text = normalizeText(duration);
    const monthsMatch = text.match(/(\d+)\s*mes/);
    if (monthsMatch) return Number(monthsMatch[1]);
    const semMatch = text.match(/(\d+)\s*semestre/);
    if (semMatch) return Number(semMatch[1]) * 6;
    const yearMatch = text.match(/(\d+)\s*ano/);
    if (yearMatch) return Number(yearMatch[1]) * 12;
    return 12;
  }

  function switchToolTab(tabName) {
    document.querySelectorAll('[data-tool-tab]').forEach((btn) => {
      const active = btn.dataset.toolTab === tabName;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tool-panel').forEach((panel) => {
      panel.hidden = panel.id !== `tool-tab-${tabName}`;
    });
  }

  function buildMatchGaugeSvg(pct) {
    const r = 34;
    const cx = 44;
    const cy = 44;
    const c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    return `<svg class="ori-gauge" viewBox="0 0 88 88" role="img" aria-label="Afinidad estimada ${pct}%">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e6eaf0" stroke-width="8" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FF8300" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${dash.toFixed(1)} ${(c - dash).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" />
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="18" font-weight="800" fill="#141920">${pct}%</text>
    </svg>`;
  }

  function renderOrientador() {
    if (!els.oriResults || !state.programs.length) return;
    const areaPref = els.oriArea?.value || '';
    const modePref = els.oriMode?.value || '';
    const durationPref = els.oriDuration?.value || '';
    const priorityPref = els.oriPriority?.value || 'balanced';

    const scored = state.programs.map((p) => {
      let score = 40;
      const reasons = [];

      if (areaPref) {
        if (p.area === areaPref) {
          score += 32;
          reasons.push(`Área exacta: ${p.area}`);
        }
      } else {
        score += 14;
      }

      if (modePref) {
        if (p.mode === modePref) {
          score += 22;
          reasons.push(`Modalidad ${p.mode}`);
        }
      } else {
        score += 10;
        if (p.mode) reasons.push(`Modalidad ${p.mode}`);
      }

      const months = parseDurationMonths(p.duration);
      if (durationPref === 'corta') {
        if (months <= 12) {
          score += 16;
          reasons.push(`Duración compacta (${p.duration})`);
        }
      } else if (durationPref === 'extendida') {
        if (months > 12) {
          score += 16;
          reasons.push(`Profundización (${p.duration})`);
        }
      } else {
        score += 10;
      }

      const hasPublishedPrice = typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0;
      const isWeekendOrExec = /sabado|sábado|domingo|fin de semana|vespertin|jueves|viernes|online|asincr/i.test(
        `${p.schedule || ''} ${p.mode || ''}`
      );

      if (priorityPref === 'tuition') {
        if (hasPublishedPrice) {
          score += 18;
          reasons.push(`Arancel público ${formatCurrency(p.price)}`);
        }
      } else if (priorityPref === 'double') {
        if (p.doubleDegree) {
          score += 18;
          reasons.push(`Doble titulación: ${p.doubleDegree}`);
        }
      } else if (priorityPref === 'weekend') {
        if (isWeekendOrExec) {
          score += 18;
          reasons.push(p.schedule ? `Horario: ${p.schedule}` : 'Formato compatible con trabajo');
        }
      } else if (p.admissionsStatus === 'Inscripción disponible') {
        score += 14;
        reasons.push('Convocatoria abierta para inscripción');
      }

      if (p.admissionsStatus === 'Inscripción disponible') score += 4;
      if (!reasons.length && p.duration) reasons.push(`Duración: ${p.duration}`);
      if (p.doubleDegree && priorityPref !== 'double' && reasons.length < 3) {
        reasons.push(`Convenio: ${p.doubleDegree}`);
      }

      return {
        program: p,
        pct: Math.min(98, Math.max(52, score)),
        reasons: reasons.slice(0, 3)
      };
    });

    scored.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      const openA = a.program.admissionsStatus === 'Inscripción disponible' ? 1 : 0;
      const openB = b.program.admissionsStatus === 'Inscripción disponible' ? 1 : 0;
      return openB - openA;
    });

    const top3 = scored.slice(0, 3);
    if (els.oriSummary) {
      els.oriSummary.textContent = `Top 3 recomendaciones calculadas sobre las ${state.programs.length} maestrías oficiales según tus preferencias.`;
    }

    els.oriResults.innerHTML = top3.map((entry, idx) => {
      const p = entry.program;
      const detailUrl = programDetailHref(p.slug);
      return `<article class="ori-card">
        <div class="ori-card-head">
          ${buildMatchGaugeSvg(entry.pct)}
          <div>
            <span class="ori-rank-kicker">Recomendación #${idx + 1} · ${escapeHtml(p.area)}</span>
            <h3><a class="program-title-link" href="${detailUrl}">${escapeHtml(p.shortTitle || p.title)}</a></h3>
          </div>
        </div>
        <div class="ori-meta">
          <span class="ori-pill">${escapeHtml(p.mode || 'En línea')}</span>
          <span class="ori-pill">${escapeHtml(p.duration || 'Consultar')}</span>
          <span class="ori-pill">${escapeHtml(formatCurrency(p.price))}</span>
        </div>
        <ul class="ori-reasons">
          ${entry.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
        <div class="ori-actions">
          <a class="btn btn-primary btn-sm" href="${detailUrl}">Más detalles →</a>
          <button type="button" class="btn btn-ghost-dark btn-sm" data-simulate-slug="${escapeHtml(p.slug)}">Simular cuotas</button>
          <button type="button" class="btn btn-ghost-dark btn-sm" data-select-program="${escapeHtml(p.slug)}">Solicitar info</button>
        </div>
      </article>`;
    }).join('');
  }

  let currentHubPlanSummary = '';

  function buildHubDonutSvg(gross, savings, downAmount, financed) {
    const total = Math.max(1, gross);
    const radius = 70;
    const cx = 100;
    const cy = 100;
    const c = 2 * Math.PI * radius;
    const segments = [
      { value: financed, color: '#FF8300' },
      { value: downAmount, color: '#38bdf8' },
      { value: savings, color: '#10b981' }
    ];
    let offset = 0;
    const circles = segments.filter((s) => s.value > 0).map((s) => {
      const dash = (s.value / total) * c;
      const svg = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="20" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" />`;
      offset += dash;
      return svg;
    }).join('');
    const net = Math.max(0, gross - savings);

    return `<svg viewBox="0 0 200 200" width="188" height="188" role="img" aria-label="Distribución referencial: neto ${formatUsdShort(net)}">
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="20" />
      ${circles}
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="10" font-weight="600" fill="#cbd5e1">NETO REFERENCIAL</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="21" font-weight="800" fill="#ffffff">${formatUsdShort(net)}</text>
      <text x="${cx}" y="${cy + 31}" text-anchor="middle" font-size="10" fill="#cbd5e1">USD</text>
    </svg>`;
  }

  function buildHubBarsSvg(gross, savings, downAmount, financed) {
    const rows = [
      { label: 'Beca / desc.', value: savings, color: '#10b981' },
      { label: 'Entrada inicial', value: downAmount, color: '#38bdf8' },
      { label: 'Saldo en cuotas', value: financed, color: '#FF8300' }
    ];
    const maxVal = Math.max(1, gross);
    const barMaxW = 240;

    return `<svg viewBox="0 0 460 118" role="img" aria-label="Desglose en barras de ahorro, entrada y saldo financiado">
      ${rows.map((row, idx) => {
        const y = 14 + idx * 36;
        const w = Math.max(4, Math.round((row.value / maxVal) * barMaxW));
        return `
          <text x="0" y="${y + 13}" font-size="12" font-weight="600" fill="#e2e8f0">${row.label}</text>
          <rect x="118" y="${y}" width="${barMaxW}" height="16" rx="8" fill="rgba(255,255,255,0.12)" />
          <rect x="118" y="${y}" width="${w}" height="16" rx="8" fill="${row.color}" />
          <text x="368" y="${y + 13}" font-size="12" font-weight="700" fill="#ffffff">${formatUsdShort(row.value)}</text>
        `;
      }).join('')}
    </svg>`;
  }

  function updateHubSimulator() {
    if (!els.hubSimProgram || !state.programs.length) return;
    const slug = els.hubSimProgram.value || state.programs[0].slug;
    const p = state.programBySlug.get(slug) || state.programs[0];
    const hasPublished = typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0;

    if (els.hubSimCustomWrap) els.hubSimCustomWrap.hidden = hasPublished;
    if (els.hubSimDetailLink) els.hubSimDetailLink.href = programDetailHref(p.slug);

    const customBase = Math.max(2500, Number(els.hubSimTuitionRange?.value) || 6500);
    const gross = hasPublished ? Math.round(p.price) : Math.round(customBase);
    const discountPct = Math.min(50, Math.max(0, Number(els.hubSimDiscountRange?.value) || 0));
    const downPct = Math.min(80, Math.max(0, Number(els.hubSimDownRange?.value) || 0));
    const months = Math.min(36, Math.max(1, Number(els.hubSimMonthsRange?.value) || 12));

    const savings = Math.round(gross * (discountPct / 100));
    const net = Math.max(0, gross - savings);
    const downAmount = Math.round(net * (downPct / 100));
    const financed = Math.max(0, net - downAmount);
    const monthly = Math.round(financed / months);

    if (els.hubSimTuitionReadout) els.hubSimTuitionReadout.textContent = formatUsdShort(gross);
    if (els.hubSimDiscountReadout) els.hubSimDiscountReadout.textContent = `${discountPct}%`;
    if (els.hubSimDownReadout) els.hubSimDownReadout.textContent = `${downPct}%`;
    if (els.hubSimMonthsReadout) els.hubSimMonthsReadout.textContent = `${months} ${months === 1 ? 'mes' : 'meses'}`;

    if (els.hubSimDisclaimer) {
      els.hubSimDisclaimer.textContent = hasPublished
        ? `Cálculo referencial sobre arancel publicado (${formatUsdShort(gross)} USD). Las becas, matrícula y cuotas finales se validan con Admisiones UCG.`
        : 'Este programa tiene arancel por confirmar con Admisiones. Estás visualizando un monto referencial para planificar cuotas.';
    }

    if (els.hubSimMonthly) els.hubSimMonthly.textContent = formatUsdShort(monthly);
    if (els.hubSimMonthlySub) {
      els.hubSimMonthlySub.textContent = `${months} ${months === 1 ? 'cuota mensual' : 'cuotas mensuales'} · Neto ${formatUsdShort(net)} USD`;
    }
    if (els.hubSimGross) els.hubSimGross.textContent = hasPublished ? formatUsdShort(gross) : `${formatUsdShort(gross)} (ref.)`;
    if (els.hubSimSavings) els.hubSimSavings.textContent = `-${formatUsdShort(savings)}`;
    if (els.hubSimDown) els.hubSimDown.textContent = formatUsdShort(downAmount);
    if (els.hubSimFinanced) els.hubSimFinanced.textContent = formatUsdShort(financed);

    if (els.hubSimDonutMount) els.hubSimDonutMount.innerHTML = buildHubDonutSvg(gross, savings, downAmount, financed);
    if (els.hubSimBarsMount) els.hubSimBarsMount.innerHTML = buildHubBarsSvg(gross, savings, downAmount, financed);

    const priceKind = hasPublished ? 'arancel publicado' : 'arancel referencial';
    currentHubPlanSummary = `Simulación Centro de Herramientas (${p.shortTitle || p.title}, ${priceKind} ${formatUsdShort(gross)}, desc. ${discountPct}%, entrada ${downPct}%, ${months} cuotas aprox. de ${formatUsdShort(monthly)}/mes).`;
  }

  function renderComparator() {
    if (!els.cmpSelect1 || !els.cmpSelect2 || !els.cmpTableMount || !state.programs.length) return;
    const selectedSlugs = [els.cmpSelect1.value, els.cmpSelect2.value, els.cmpSelect3?.value]
      .filter((slug, idx, arr) => slug && state.programBySlug.has(slug) && arr.indexOf(slug) === idx);

    const selected = selectedSlugs.map((s) => state.programBySlug.get(s));
    if (!selected.length) return;

    const publishedPrices = selected.map((p) => (typeof p.price === 'number' && p.price > 0 ? p.price : 0));
    const maxPrice = Math.max(1, ...publishedPrices);

    if (els.cmpChartMount) {
      const svgH = 24 + selected.length * 46;
      const barW = 290;
      els.cmpChartMount.innerHTML = `<svg viewBox="0 0 680 ${svgH}" role="img" aria-label="Comparativa de aranceles publicados en dólares">
        ${selected.map((p, idx) => {
          const y = 16 + idx * 46;
          const label = (p.shortTitle || p.title).slice(0, 34);
          const hasPrice = typeof p.price === 'number' && p.price > 0;
          const w = hasPrice ? Math.max(12, Math.round((p.price / maxPrice) * barW)) : barW;
          const barEl = hasPrice
            ? `<rect x="235" y="${y}" width="${w}" height="20" rx="6" fill="#FF8300" />
               <text x="${243 + w}" y="${y + 15}" font-size="12" font-weight="700" fill="#141920">${escapeHtml(formatCurrency(p.price))}</text>`
            : `<rect x="235" y="${y}" width="${barW}" height="20" rx="6" fill="none" stroke="#c8ccc2" stroke-dasharray="4 4" />
               <text x="245" y="${y + 14}" font-size="11" font-weight="600" fill="#55606e">Por confirmar con Admisiones</text>`;
          return `
            <text x="0" y="${y + 14}" font-size="12" font-weight="700" fill="#141920">${escapeHtml(label)}</text>
            <rect x="235" y="${y}" width="${barW}" height="20" rx="6" fill="#e9ece6" />
            ${barEl}
          `;
        }).join('')}
      </svg>`;
    }

    const rows = [
      { label: 'Área', get: (p) => p.area || '—' },
      { label: 'Modalidad', get: (p) => p.mode || '—' },
      { label: 'Duración', get: (p) => p.duration || 'Consultar' },
      { label: 'Arancel publicado', get: (p) => formatCurrency(p.price) },
      { label: 'Horarios', get: (p) => p.schedule || 'Consultar con Admisiones' },
      { label: 'Titulación', get: (p) => p.graduationMode || 'Trabajo de titulación según malla' },
      { label: 'Doble titulación', get: (p) => p.doubleDegree || 'No aplica / consultar convenios' },
      { label: 'Resolución CES', get: (p) => p.cesResolution || 'Registro vigente en portal oficial UCG' }
    ];

    els.cmpTableMount.innerHTML = `<table class="cmp-table">
      <thead>
        <tr>
          <th>Criterio</th>
          ${selected.map((p) => `<th>${escapeHtml(p.shortTitle || p.title)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <th scope="row">${escapeHtml(row.label)}</th>
            ${selected.map((p) => `<td>${escapeHtml(row.get(p))}</td>`).join('')}
          </tr>
        `).join('')}
        <tr>
          <th scope="row">Acciones</th>
          ${selected.map((p) => `
            <td>
              <div class="cmp-cell-actions">
                <a class="btn btn-primary btn-sm" href="${programDetailHref(p.slug)}">Más detalles →</a>
                <button type="button" class="btn btn-ghost-dark btn-sm" data-select-program="${escapeHtml(p.slug)}">Solicitar info</button>
              </div>
            </td>
          `).join('')}
        </tr>
      </tbody>
    </table>`;
  }

  function findProgramSlugByRegex(regex, fallbackIndex = 0) {
    const match = state.programs.find((p) => regex.test(`${p.slug} ${p.title} ${p.area}`));
    if (match) return match.slug;
    return state.programs[Math.min(fallbackIndex, Math.max(0, state.programs.length - 1))]?.slug || '';
  }

  function populateToolsHub() {
    if (!state.programs.length) return;
    const areas = [...new Set(state.programs.map((p) => p.area).filter(Boolean))];
    const modes = [...new Set(state.programs.map((p) => p.mode).filter(Boolean))];

    if (els.oriArea) {
      els.oriArea.innerHTML = '<option value="">Todas las áreas</option>' +
        areas.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    }
    if (els.oriMode) {
      els.oriMode.innerHTML = '<option value="">Cualquier modalidad</option>' +
        modes.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    }

    const programOptionsHtml = state.programs
      .map((p) => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.title)} (${escapeHtml(typeof p.price === 'number' && p.price > 0 ? formatUsdShort(p.price) : 'Por confirmar')})</option>`)
      .join('');

    if (els.hubSimProgram) {
      els.hubSimProgram.innerHTML = programOptionsHtml;
      const defaultSim = state.programs.find((p) => typeof p.price === 'number' && p.price > 0) || state.programs[0];
      if (defaultSim) els.hubSimProgram.value = defaultSim.slug;
    }

    if (els.cmpSelect1 && els.cmpSelect2) {
      els.cmpSelect1.innerHTML = programOptionsHtml;
      els.cmpSelect2.innerHTML = programOptionsHtml;
      if (els.cmpSelect3) {
        els.cmpSelect3.innerHTML = '<option value="">— Sin 3er programa —</option>' + programOptionsHtml;
      }
      els.cmpSelect1.value = findProgramSlugByRegex(/inteligencia artificial|\bia\b/i, 0);
      els.cmpSelect2.value = findProgramSlugByRegex(/ciberseguridad/i, 1);
      if (els.cmpSelect3) {
        els.cmpSelect3.value = findProgramSlugByRegex(/ciencia de datos|big data|analitica/i, 2);
      }
    }

    renderOrientador();
    updateHubSimulator();
    renderComparator();
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

    document.querySelectorAll('[data-tool-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchToolTab(btn.dataset.toolTab || 'orientador');
      });
    });

    [els.oriArea, els.oriMode, els.oriDuration, els.oriPriority].forEach((sel) => {
      sel?.addEventListener('change', renderOrientador);
    });

    [
      els.hubSimProgram,
      els.hubSimTuitionRange,
      els.hubSimDiscountRange,
      els.hubSimDownRange,
      els.hubSimMonthsRange
    ].forEach((ctrl) => {
      ctrl?.addEventListener('input', updateHubSimulator);
      ctrl?.addEventListener('change', updateHubSimulator);
    });

    els.hubSimApplyBtn?.addEventListener('click', () => {
      const slug = els.hubSimProgram?.value || '';
      if (els.leadNotes && currentHubPlanSummary) {
        const cleaned = els.leadNotes.value.replace(/^Simulación Centro de Herramientas \([^)]*\)\.\s*/i, '').trim();
        els.leadNotes.value = cleaned ? `${currentHubPlanSummary}\n${cleaned}` : currentHubPlanSummary;
      }
      selectProgramInForm(slug, true);
    });

    [els.cmpSelect1, els.cmpSelect2, els.cmpSelect3].forEach((sel) => {
      sel?.addEventListener('change', renderComparator);
    });

    document.querySelectorAll('[data-cmp-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.cmpPreset;
        if (preset === 'ia-tech') {
          if (els.cmpSelect1) els.cmpSelect1.value = findProgramSlugByRegex(/inteligencia artificial|\bia\b/i, 0);
          if (els.cmpSelect2) els.cmpSelect2.value = findProgramSlugByRegex(/ciberseguridad/i, 1);
          if (els.cmpSelect3) els.cmpSelect3.value = findProgramSlugByRegex(/ciencia de datos|big data|analitica/i, 2);
        } else if (preset === 'negocios') {
          if (els.cmpSelect1) els.cmpSelect1.value = findProgramSlugByRegex(/administracion de empresas|mba/i, 0);
          if (els.cmpSelect2) els.cmpSelect2.value = findProgramSlugByRegex(/finanzas/i, 1);
          if (els.cmpSelect3) els.cmpSelect3.value = findProgramSlugByRegex(/proyectos/i, 2);
        } else if (preset === 'educacion') {
          if (els.cmpSelect1) els.cmpSelect1.value = findProgramSlugByRegex(/innovacion/i, 0);
          if (els.cmpSelect2) els.cmpSelect2.value = findProgramSlugByRegex(/inclusion|necesidades educativas/i, 1);
          if (els.cmpSelect3) els.cmpSelect3.value = findProgramSlugByRegex(/bilingue|ingles/i, 2);
        }
        renderComparator();
      });
    });

    els.herramientasSection?.addEventListener('click', (e) => {
      const simBtn = e.target.closest('[data-simulate-slug]');
      if (simBtn) {
        const slug = simBtn.dataset.simulateSlug || '';
        switchToolTab('simulador');
        if (els.hubSimProgram && slug) {
          els.hubSimProgram.value = slug;
          updateHubSimulator();
        }
        els.herramientasSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const selectBtn = e.target.closest('[data-select-program]');
      if (selectBtn) {
        selectProgramInForm(selectBtn.dataset.selectProgram || '', true);
      }
    });
  }

  async function init() {
    await Promise.all([resolveConfig(), loadCatalog()]);

    if (els.footerApiInfo) {
      els.footerApiInfo.textContent = `API conectada: ${state.apiBase}${state.apiOverridden ? ' (override ?api=)' : ''}`;
    }

    populateHeroAndFilters();
    renderCatalog();
    populateToolsHub();

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
