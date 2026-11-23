(() => {
  'use strict';

  const DEFAULT_API_BASE = 'https://casagrande-posgrados-production.up.railway.app';
  const DEFAULT_VOICE_PHONE = '+19124915544';
  const PLACEHOLDER_EMAIL_PREFIX = 'intake:phone:';

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
    },
    crmFilter: 'all',
    crmData: null,
    crmTimer: null,
    isLoadingCrm: false
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
    crmRefreshBtn: document.getElementById('crm-refresh-btn'),
    crmAutoRefresh: document.getElementById('crm-auto-refresh'),
    crmSyncStatus: document.getElementById('crm-sync-status'),
    crmError: document.getElementById('crm-error'),
    crmLeadsList: document.getElementById('crm-leads-list'),
    kpiTotalLeads: document.getElementById('kpi-total-leads'),
    kpiRetellCalls: document.getElementById('kpi-retell-calls'),
    kpiVerifiedEmails: document.getElementById('kpi-verified-emails'),
    kpiRecapsSent: document.getElementById('kpi-recaps-sent'),
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

  function formatDateEc(iso) {
    if (!iso) return 'Reciente';
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) return String(iso);
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Guayaquil'
    }).format(d);
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
        `Registramos tu solicitud${selectedProg ? ' para ' + selectedProg.shortTitle : ''}. Ya puedes verla en el CRM en vivo.`;
      els.leadSuccess.hidden = false;
      els.leadForm.reset();
      if (els.leadConsentEmail) els.leadConsentEmail.checked = true;
      updatePhoneRequirement();
      selectProgramInForm('', false);
      loadCrm();
    } catch (err) {
      els.leadError.textContent = err?.message || 'No pudimos conectar con el servidor de admisiones. Intenta nuevamente.';
      els.leadError.hidden = false;
    } finally {
      els.leadSubmitBtn.disabled = false;
      els.leadSubmitBtn.textContent = prevText;
    }
  }

  function formatNurtureBadge(status, providerId, isRetell, consentEmail) {
    if (!status) {
      if (!isRetell && consentEmail) {
        return '<span class="crm-tag crm-tag-web">Seguimiento web autorizado</span>';
      }
      return '<span class="crm-tag crm-tag-neutral">Sin correo automático</span>';
    }
    const labels = {
      accepted: 'Recap enviado (accepted)',
      sent: 'Recap enviado (sent)',
      pending: 'Recap pendiente',
      processing: 'Enviando recap…',
      failed: 'Error en envío',
      skipped: 'Omitido / sin permiso',
      uncertain: 'Estado por confirmar'
    };
    const cls = status === 'accepted' || status === 'sent'
      ? 'crm-tag-verified'
      : status === 'pending' || status === 'processing'
        ? 'crm-tag-pending'
        : status === 'failed'
          ? 'crm-tag-err'
          : 'crm-tag-neutral';
    const titleAttr = providerId ? ` title="ID Resend: ${escapeHtml(providerId)}"` : '';
    return `<span class="crm-tag ${cls}"${titleAttr}>${escapeHtml(labels[status] || status)}</span>`;
  }

  function enrichCrmData(raw) {
    const leads = Array.isArray(raw?.leads) ? raw.leads : [];
    const conversations = Array.isArray(raw?.conversations) ? raw.conversations : [];
    const nurtureJobs = Array.isArray(raw?.nurtureJobs) ? raw.nurtureJobs : [];

    const convByLead = new Map();
    for (const c of conversations) {
      const leadId = c.lead_id || c.leadId;
      if (!leadId) continue;
      if (!convByLead.has(leadId)) convByLead.set(leadId, []);
      convByLead.get(leadId).push(c);
    }

    const jobsByLead = new Map();
    for (const j of nurtureJobs) {
      const leadId = j.lead_id || j.leadId;
      if (!leadId) continue;
      if (!jobsByLead.has(leadId)) jobsByLead.set(leadId, []);
      jobsByLead.get(leadId).push(j);
    }

    const enrichedLeads = leads.map((lead) => {
      const ctx = parseJsonSafe(lead.context, {});
      const leadConvs = convByLead.get(lead.id) || [];
      const latestConv = leadConvs[0] || null;
      const extRaw = parseJsonSafe(latestConv?.extraction, {});
      const ext = parseJsonSafe(extRaw.retellData, extRaw);
      const leadJobs = jobsByLead.get(lead.id) || [];
      const latestJob = leadJobs[0] || null;

      const isRetell = String(lead.source || '').toLowerCase().includes('retell') ||
        latestConv?.provider === 'retell';

      const emailRaw = String(lead.email || '');
      const hasRealEmail = Boolean(emailRaw && !emailRaw.startsWith(PLACEHOLDER_EMAIL_PREFIX));
      const email = hasRealEmail ? emailRaw : '';
      const phone = lead.phone || latestConv?.contact_phone || '';

      const emailConfirmed = Boolean(
        ctx.emailConfirmed ??
        ctx.email_confirmed_by_spelling ??
        ext.emailConfirmed ??
        ext.email_confirmed_by_spelling ??
        lead.emailConfirmed
      );

      const phoneConfirmed = Boolean(
        ctx.phoneConfirmed ??
        ctx.phone_confirmed_by_readback ??
        ext.phoneConfirmed ??
        ext.phone_confirmed_by_readback ??
        lead.phoneConfirmed
      );

      const prog = state.programBySlug.get(lead.program);
      const programTitle = prog?.title ||
        ctx.programInterest ||
        ext.programInterest ||
        lead.program ||
        'Orientación general de posgrados';

      const summary = ctx.callSummary ||
        ctx.call_summary_es ||
        ext.summary ||
        ext.call_summary_es ||
        latestConv?.excerpt ||
        ctx.consulta ||
        '';

      const chips = [];
      if (ctx.city || ctx.ciudad || ext.city) chips.push(`Ciudad: ${ctx.city || ctx.ciudad || ext.city}`);
      if (ctx.modality || ext.modality) chips.push(`Modalidad: ${ctx.modality || ext.modality}`);
      if (ctx.horizon || ctx.horizonte || ext.horizon) chips.push(`Inicio: ${ctx.horizon || ctx.horizonte || ext.horizon}`);
      if (ctx.academicBackground || ext.academicBackground) chips.push(`Perfil: ${ctx.academicBackground || ext.academicBackground}`);
      if (ctx.keyQuestions || ext.keyQuestions) chips.push(`Consultó: ${ctx.keyQuestions || ext.keyQuestions}`);
      if (ctx.obstacles || ext.obstacles) chips.push(`Consideración: ${ctx.obstacles || ext.obstacles}`);
      if (ctx.solicitaCita) chips.push('Solicitó cita');

      return {
        id: lead.id,
        name: lead.name || latestConv?.contact_name || 'Aspirante sin nombre',
        email,
        phone,
        emailConfirmed,
        phoneConfirmed,
        programTitle,
        stage: lead.stage || 'Nuevo',
        source: lead.source || (isRetell ? 'Llamada Retell' : 'Formulario web'),
        isRetell,
        summary,
        chips,
        recapStatus: latestJob?.status || lead.recapStatus || '',
        recapProviderId: latestJob?.provider_id || latestJob?.providerId || '',
        consentEmail: Boolean(lead.consent_email),
        updatedAt: lead.updated_at || lead.updatedAt || lead.created_at || lead.createdAt || ''
      };
    });

    const stats = raw?.stats || {};
    const totalLeads = stats.totalLeads ?? stats.total_leads ?? enrichedLeads.length;
    const retellCalls = stats.retellCalls ?? stats.retell_calls ??
      (conversations.filter((c) => c.provider === 'retell').length ||
        enrichedLeads.filter((l) => l.isRetell).length);
    const verifiedEmails = stats.verifiedEmails ?? stats.verified_emails ??
      enrichedLeads.filter((l) => l.emailConfirmed || (!l.isRetell && l.email)).length;
    const recapEmailsSent = stats.recapEmailsSent ?? stats.recaps_sent ?? stats.emailsSent ??
      nurtureJobs.filter((j) => j.status === 'accepted' || j.status === 'sent').length;

    return {
      stats: { totalLeads, retellCalls, verifiedEmails, recapEmailsSent },
      leads: enrichedLeads
    };
  }

  function renderCrm() {
    if (!state.crmData) return;
    const { stats, leads } = state.crmData;

    if (els.kpiTotalLeads) els.kpiTotalLeads.textContent = String(stats.totalLeads);
    if (els.kpiRetellCalls) els.kpiRetellCalls.textContent = String(stats.retellCalls);
    if (els.kpiVerifiedEmails) els.kpiVerifiedEmails.textContent = String(stats.verifiedEmails);
    if (els.kpiRecapsSent) els.kpiRecapsSent.textContent = String(stats.recapEmailsSent);

    const visible = leads.filter((lead) => {
      if (state.crmFilter === 'retell') return lead.isRetell;
      if (state.crmFilter === 'web') return !lead.isRetell;
      return true;
    });

    if (!visible.length) {
      const phoneLabel = formatVoicePhone(state.voicePhone) || 'nuestra Oficial de Admisiones IA';
      els.crmLeadsList.innerHTML = `<div class="crm-empty">
        No hay registros en esta vista todavía. Llama al <strong>${escapeHtml(phoneLabel)}</strong> o envía una solicitud en el formulario para verla aparecer en vivo.
      </div>`;
      return;
    }

    els.crmLeadsList.innerHTML = visible.map((lead) => `
      <article class="crm-lead-card${lead.isRetell ? ' is-retell' : ''}">
        <div class="crm-lead-identity">
          <h3>${escapeHtml(lead.name)}</h3>
          <div class="crm-lead-meta">
            <span class="crm-tag ${lead.isRetell ? 'crm-tag-retell' : 'crm-tag-web'}">${escapeHtml(lead.source)}</span>
            <span class="crm-tag crm-tag-stage">${escapeHtml(lead.stage)}</span>
          </div>
          <p class="crm-program-name">${escapeHtml(lead.programTitle)}</p>
          <span class="crm-timestamp">Actualizado: ${escapeHtml(formatDateEc(lead.updatedAt))}</span>
        </div>

        <div class="crm-contact-lines">
          <div class="crm-contact-row">
            <span class="crm-contact-label">Correo:</span>
            <span>${lead.email ? escapeHtml(lead.email) : '<em>No proporcionado</em>'}</span>
            ${lead.emailConfirmed ? '<span class="crm-tag crm-tag-verified">✓ Deletreado</span>' : ''}
          </div>
          <div class="crm-contact-row">
            <span class="crm-contact-label">Teléfono:</span>
            <span>${lead.phone ? escapeHtml(lead.phone) : '<em>No proporcionado</em>'}</span>
            ${lead.phoneConfirmed ? '<span class="crm-tag crm-tag-verified">✓ Confirmado</span>' : ''}
          </div>
          <div class="crm-email-status-row">
            <span class="crm-contact-label">Resend:</span>
            ${formatNurtureBadge(lead.recapStatus, lead.recapProviderId, lead.isRetell, lead.consentEmail)}
          </div>
        </div>

        <div class="crm-summary-col">
          <span class="crm-summary-title">${lead.isRetell ? 'Resumen de llamada (Español)' : 'Detalle de consulta'}</span>
          <p>${lead.summary ? escapeHtml(lead.summary) : '<em>Sin resumen adicional registrado.</em>'}</p>
          ${lead.chips.length ? `<div class="crm-context-chips">
            ${lead.chips.map((c) => `<span class="crm-context-chip">${escapeHtml(c)}</span>`).join('')}
          </div>` : ''}
        </div>
      </article>
    `).join('');
  }

  async function loadCrm() {
    if (state.isLoadingCrm) return;
    state.isLoadingCrm = true;
    if (els.crmSyncStatus) els.crmSyncStatus.textContent = 'Actualizando CRM…';
    if (els.crmError) els.crmError.hidden = true;

    try {
      const res = await fetch(`${state.apiBase}/api/public/crm`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      state.crmData = enrichCrmData(payload);
      renderCrm();
      if (els.crmSyncStatus) {
        els.crmSyncStatus.textContent = `Última actualización: ${formatDateEc(new Date().toISOString())}`;
      }
    } catch {
      if (els.crmError) {
        els.crmError.textContent = `No pudimos cargar el CRM en vivo desde ${state.apiBase}/api/public/crm.`;
        els.crmError.hidden = false;
      }
      if (els.crmSyncStatus) {
        els.crmSyncStatus.textContent = 'Error de sincronización con el backend.';
      }
    } finally {
      state.isLoadingCrm = false;
    }
  }

  function setupAutoRefresh() {
    if (state.crmTimer) {
      window.clearInterval(state.crmTimer);
      state.crmTimer = null;
    }
    if (els.crmAutoRefresh?.checked) {
      state.crmTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadCrm();
        }
      }, 15000);
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

    els.crmRefreshBtn?.addEventListener('click', () => {
      checkHealth();
      loadCrm();
    });

    els.crmAutoRefresh?.addEventListener('change', setupAutoRefresh);

    document.querySelectorAll('[data-crm-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.crmFilter = btn.dataset.crmFilter || 'all';
        document.querySelectorAll('[data-crm-filter]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        renderCrm();
      });
    });
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
    loadCrm();
    setupAutoRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
