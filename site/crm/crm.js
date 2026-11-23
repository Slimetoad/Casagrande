(() => {
  'use strict';

  const STAGES = ['Nuevo', 'En orientación', 'En postulación', 'Admitido', 'Matriculado', 'Cerrado'];
  const DEFAULT_API_BASE = 'https://casagrande-posgrados-production.up.railway.app';
  const DEFAULT_VOICE_PHONE = '+19124915544';

  const state = {
    apiBase: DEFAULT_API_BASE,
    voicePhone: DEFAULT_VOICE_PHONE,
    programs: [],
    programBySlug: new Map(),
    view: 'kanban',
    filters: {
      search: '',
      stage: '',
      source: '',
      area: '',
      verification: '',
      sort: 'recent'
    },
    crm: {
      leads: [],
      tasks: [],
      conversations: [],
      events: [],
      nurtureJobs: [],
      stats: {
        totalLeads: 0,
        retellCalls: 0,
        verifiedEmails: 0,
        recapEmailsSent: 0,
        openTasks: 0,
        avgScore: 0,
        stageCounts: Object.fromEntries(STAGES.map((s) => [s, 0]))
      }
    },
    selectedLeadId: null,
    drawerTab: 'profile',
    selectedTemplate: '',
    autoRefreshTimer: null,
    isLoading: false,
    draggedLeadId: null
  };

  const els = {
    healthPill: document.getElementById('health-pill'),
    healthText: document.getElementById('health-text'),
    newLeadBtn: document.getElementById('new-lead-btn'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    autoRefreshToggle: document.getElementById('auto-refresh-toggle'),
    refreshBtn: document.getElementById('refresh-btn'),
    kpiTotal: document.getElementById('kpi-total'),
    kpiRetell: document.getElementById('kpi-retell'),
    kpiVerified: document.getElementById('kpi-verified'),
    kpiEmails: document.getElementById('kpi-emails'),
    kpiTasks: document.getElementById('kpi-tasks'),
    kpiScore: document.getElementById('kpi-score'),
    stageFunnelPills: document.getElementById('stage-funnel-pills'),
    syncStatus: document.getElementById('sync-status'),
    filterSearch: document.getElementById('filter-search'),
    filterStage: document.getElementById('filter-stage'),
    filterSource: document.getElementById('filter-source'),
    filterArea: document.getElementById('filter-area'),
    filterVerification: document.getElementById('filter-verification'),
    filterSort: document.getElementById('filter-sort'),
    filteredCount: document.getElementById('filtered-count'),
    clearFiltersBtn: document.getElementById('clear-filters-btn'),
    crmError: document.getElementById('crm-error'),
    viewKanban: document.getElementById('view-kanban'),
    viewTable: document.getElementById('view-table'),
    viewActivity: document.getElementById('view-activity'),
    kanbanBoard: document.getElementById('kanban-board'),
    tableBody: document.getElementById('table-body'),
    activityCallsCount: document.getElementById('activity-calls-count'),
    activityCallsList: document.getElementById('activity-calls-list'),
    activityEventsCount: document.getElementById('activity-events-count'),
    activityTasksList: document.getElementById('activity-tasks-list'),
    activityEventsList: document.getElementById('activity-events-list'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    drawer: document.getElementById('candidate-drawer'),
    drawerCloseBtn: document.getElementById('drawer-close-btn'),
    drawerSourceBadge: document.getElementById('drawer-source-badge'),
    drawerStageBadge: document.getElementById('drawer-stage-badge'),
    drawerScoreBadge: document.getElementById('drawer-score-badge'),
    drawerLeadName: document.getElementById('drawer-lead-name'),
    drawerLeadSub: document.getElementById('drawer-lead-sub'),
    drawerTelLink: document.getElementById('drawer-tel-link'),
    drawerMailLink: document.getElementById('drawer-mail-link'),
    drawerWaLink: document.getElementById('drawer-wa-link'),
    drawerTasksBadge: document.getElementById('drawer-tasks-badge'),
    drawerRetellCard: document.getElementById('drawer-retell-card'),
    drawerProfileForm: document.getElementById('drawer-profile-form'),
    editStage: document.getElementById('edit-stage'),
    editOwner: document.getElementById('edit-owner'),
    editProgram: document.getElementById('edit-program'),
    editScoreRange: document.getElementById('edit-score-range'),
    editScoreNum: document.getElementById('edit-score-num'),
    editScoreReadout: document.getElementById('edit-score-readout'),
    editDue: document.getElementById('edit-due'),
    editNextAction: document.getElementById('edit-next-action'),
    editNote: document.getElementById('edit-note'),
    editConsentEmail: document.getElementById('edit-consent-email'),
    editConsentVoice: document.getElementById('edit-consent-voice'),
    editPaused: document.getElementById('edit-paused'),
    saveProfileBtn: document.getElementById('save-profile-btn'),
    nurtureNoEmailWarn: document.getElementById('nurture-no-email-warn'),
    nurtureTemplateChips: document.getElementById('nurture-template-chips'),
    aiDraftBtn: document.getElementById('ai-draft-btn'),
    aiRecBox: document.getElementById('ai-recommendation-box'),
    nurtureEmailForm: document.getElementById('nurture-email-form'),
    nurtureSubject: document.getElementById('nurture-subject'),
    nurtureBody: document.getElementById('nurture-body'),
    sendNurtureBtn: document.getElementById('send-nurture-btn'),
    drawerEmailHistory: document.getElementById('drawer-email-history'),
    drawerTaskForm: document.getElementById('drawer-task-form'),
    newTaskTitle: document.getElementById('new-task-title'),
    newTaskDue: document.getElementById('new-task-due'),
    createTaskBtn: document.getElementById('create-task-btn'),
    drawerTasksList: document.getElementById('drawer-tasks-list'),
    drawerNoteForm: document.getElementById('drawer-note-form'),
    newNoteText: document.getElementById('new-note-text'),
    newNotePin: document.getElementById('new-note-pin'),
    saveNoteBtn: document.getElementById('save-note-btn'),
    drawerTimeline: document.getElementById('drawer-timeline'),
    deleteStep1: document.getElementById('delete-confirm-step1'),
    deleteStep2: document.getElementById('delete-confirm-step2'),
    deleteTrigger: document.getElementById('delete-lead-trigger'),
    deleteConfirm: document.getElementById('delete-lead-confirm'),
    deleteCancel: document.getElementById('delete-lead-cancel'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    newLeadModal: document.getElementById('new-lead-modal'),
    closeNewLeadModal: document.getElementById('close-new-lead-modal'),
    cancelNewLead: document.getElementById('cancel-new-lead'),
    newLeadForm: document.getElementById('new-lead-form'),
    modalName: document.getElementById('modal-name'),
    modalEmail: document.getElementById('modal-email'),
    modalPhone: document.getElementById('modal-phone'),
    modalProgram: document.getElementById('modal-program'),
    modalCity: document.getElementById('modal-city'),
    modalNote: document.getElementById('modal-note'),
    modalConsentEmail: document.getElementById('modal-consent-email'),
    modalConsentVoice: document.getElementById('modal-consent-voice'),
    modalError: document.getElementById('modal-error'),
    submitNewLead: document.getElementById('submit-new-lead'),
    toastContainer: document.getElementById('toast-container')
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

  function formatDateEc(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) return String(iso);
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Guayaquil'
    }).format(d);
  }

  function toDatetimeLocalValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromDatetimeLocalValue(localStr) {
    if (!localStr || !localStr.trim()) return null;
    const d = new Date(localStr);
    return Number.isNaN(d.valueOf()) ? null : d.toISOString();
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

  async function resolveConfig() {
    const params = new URLSearchParams(window.location.search);
    const queryApi = sanitizeApiBase(params.get('api') || '');
    if (queryApi) {
      state.apiBase = queryApi;
    }

    const inlineConfigEl = document.getElementById('ucg-config');
    if (inlineConfigEl?.textContent) {
      const parsed = parseJsonSafe(inlineConfigEl.textContent, null);
      if (!queryApi) {
        const inlineApi = sanitizeApiBase(parsed?.apiBase);
        if (inlineApi) state.apiBase = inlineApi;
      }
      if (parsed?.voicePhone) applyVoicePhone(parsed.voicePhone);
      if (queryApi || sanitizeApiBase(parsed?.apiBase)) return;
    }

    try {
      const res = await fetch('../config.json', { cache: 'no-store' });
      if (res.ok) {
        const cfg = await res.json();
        if (!queryApi) {
          const fileApi = sanitizeApiBase(cfg?.apiBase);
          if (fileApi) state.apiBase = fileApi;
        }
        if (cfg?.voicePhone) applyVoicePhone(cfg.voicePhone);
      }
    } catch {
      // Fall back to default API base when config.json cannot be loaded.
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
        const res = await fetch('../catalog.json');
        if (res.ok) {
          const fetched = await res.json();
          if (Array.isArray(fetched)) list = fetched;
        }
      } catch {
        // Leave empty if catalog.json cannot be fetched.
      }
    }

    state.programs = list;
    state.programBySlug = new Map(list.map((p) => [p.slug, p]));
  }

  function showToast(message, type = 'ok') {
    if (!els.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'err' ? 'is-err' : 'is-ok'}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 3600);
  }

  async function apiRequest(path, options = {}) {
    const res = await fetch(`${state.apiBase}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Error ${res.status}`);
    }
    return data;
  }

  async function checkHealth() {
    try {
      const data = await apiRequest('/api/health');
      if (data.inboundNumber) applyVoicePhone(data.inboundNumber);
      if (data.dbReady !== false && data.retellConfigured && data.mailConfigured) {
        els.healthPill.className = 'health-pill health-ok';
        els.healthText.textContent = 'Railway · Voz IA y Resend activos';
      } else if (data.dbReady !== false) {
        els.healthPill.className = 'health-pill health-warn';
        els.healthText.textContent = 'Railway · CRM en línea';
      } else {
        throw new Error('Degraded');
      }
    } catch {
      els.healthPill.className = 'health-pill health-err';
      els.healthText.textContent = 'Sin conexión al backend';
    }
  }

  function enrichLead(lead) {
    const ctx = parseJsonSafe(lead.context, {});
    const leadConvs = state.crm.conversations.filter((c) => c.lead_id === lead.id);
    const latestConv = leadConvs[0] || null;
    const extRaw = parseJsonSafe(latestConv?.extraction, {});
    const ext = parseJsonSafe(extRaw.retellData, extRaw);
    const leadTasks = state.crm.tasks.filter((t) => t.lead_id === lead.id);
    const openTasks = leadTasks.filter((t) => t.status === 'pendiente');
    const leadJobs = state.crm.nurtureJobs.filter((j) => j.lead_id === lead.id);
    const latestJob = leadJobs[0] || null;
    const leadEvents = state.crm.events.filter((e) => e.lead_id === lead.id);

    const prog = state.programBySlug.get(lead.program) || null;
    const isRetell = String(lead.source || '').toLowerCase().includes('retell') ||
      latestConv?.provider === 'retell';

    const emailConfirmed = Boolean(
      ctx.emailConfirmed ??
      ctx.email_confirmed_by_spelling ??
      ext.emailConfirmed ??
      ext.email_confirmed_by_spelling
    );
    const phoneConfirmed = Boolean(
      ctx.phoneConfirmed ??
      ctx.phone_confirmed_by_readback ??
      ext.phoneConfirmed ??
      ext.phone_confirmed_by_readback
    );
    const humanCallback = Boolean(
      ctx.humanCallback ??
      ctx.human_callback ??
      ext.humanCallback ??
      ext.human_callback ??
      ctx.solicitaCita
    );

    const city = ctx.city || ctx.ciudad || ext.city || '';
    const modality = ctx.modality || ext.modality || '';
    const horizon = ctx.horizon || ctx.horizonte || ext.horizon || '';
    const academicBackground = ctx.academicBackground || ext.academicBackground || '';
    const keyQuestions = ctx.keyQuestions || ext.keyQuestions || '';
    const obstacles = ctx.obstacles || ext.obstacles || '';
    const summary = ctx.callSummary ||
      ctx.call_summary_es ||
      ext.summary ||
      ext.call_summary_es ||
      latestConv?.excerpt ||
      ctx.consulta ||
      '';

    return {
      ...lead,
      score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : 0,
      paused: Boolean(lead.paused),
      consent_email: Boolean(lead.consent_email),
      consent_voice: Boolean(lead.consent_voice),
      ctx,
      prog,
      programTitle: prog?.shortTitle || prog?.title || ctx.programInterest || ext.programInterest || lead.program || 'Orientación general',
      programArea: prog?.area || '',
      isRetell,
      emailConfirmed,
      phoneConfirmed,
      humanCallback,
      city,
      modality,
      horizon,
      academicBackground,
      keyQuestions,
      obstacles,
      summary,
      tasks: leadTasks,
      openTasksCount: openTasks.length,
      conversations: leadConvs,
      nurtureJobs: leadJobs,
      latestJob,
      events: leadEvents
    };
  }

  function getFilteredLeads() {
    const enriched = state.crm.leads.map(enrichLead);
    const q = normalizeText(state.filters.search);
    const { stage, source, area, verification, sort } = state.filters;

    const filtered = enriched.filter((lead) => {
      if (stage && lead.stage !== stage) return false;
      if (source === 'retell' && !lead.isRetell) return false;
      if (source === 'web' && lead.isRetell) return false;
      if (area && lead.programArea !== area) return false;
      if (verification === 'email_confirmed' && !lead.emailConfirmed) return false;
      if (verification === 'phone_confirmed' && !lead.phoneConfirmed) return false;
      if (verification === 'advisor_requested' && !lead.humanCallback) return false;
      if (!q) return true;

      const haystack = normalizeText([
        lead.name,
        lead.email,
        lead.phone,
        lead.programTitle,
        lead.program,
        lead.city,
        lead.owner,
        lead.note,
        lead.summary,
        lead.academicBackground,
        lead.keyQuestions
      ].join(' '));
      return haystack.includes(q);
    });

    filtered.sort((a, b) => {
      if (sort === 'score') {
        if (b.score !== a.score) return b.score - a.score;
      } else if (sort === 'due') {
        const ad = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
        const bd = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
      }
      return Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0);
    });

    return filtered;
  }

  function scoreClass(score) {
    if (score >= 75) return 'score-high';
    if (score >= 45) return 'score-med';
    return 'score-low';
  }

  function stageCssSuffix(stage) {
    return normalizeText(stage).replace(/\s+/g, '');
  }

  function formatResendBadge(job) {
    if (!job) return '<span class="badge badge-neutral">Sin envío Resend</span>';
    if (job.status === 'accepted' || job.status === 'sent') {
      return '<span class="badge badge-ok">Resend: Enviado</span>';
    }
    if (job.status === 'pending' || job.status === 'processing') {
      return '<span class="badge badge-warn">Resend: Pendiente</span>';
    }
    if (job.status === 'failed') {
      return '<span class="badge badge-err">Resend: Error</span>';
    }
    return `<span class="badge badge-neutral">${escapeHtml(job.status)}</span>`;
  }

  function renderKpisAndFunnel(filteredCount) {
    const stats = state.crm.stats || {};
    if (els.kpiTotal) els.kpiTotal.textContent = String(stats.totalLeads ?? state.crm.leads.length);
    if (els.kpiRetell) els.kpiRetell.textContent = String(stats.retellCalls ?? 0);
    if (els.kpiVerified) els.kpiVerified.textContent = String(stats.verifiedEmails ?? 0);
    if (els.kpiEmails) els.kpiEmails.textContent = String(stats.recapEmailsSent ?? 0);
    if (els.kpiTasks) els.kpiTasks.textContent = String(stats.openTasks ?? 0);
    if (els.kpiScore) els.kpiScore.textContent = `${stats.avgScore ?? 0}/100`;

    const stageCounts = stats.stageCounts || {};
    const totalAll = stats.totalLeads ?? state.crm.leads.length;

    if (els.stageFunnelPills) {
      els.stageFunnelPills.innerHTML = [
        `<button type="button" class="funnel-pill${state.filters.stage === '' ? ' is-active' : ''}" data-funnel-stage="">Todas <span>${totalAll}</span></button>`,
        ...STAGES.map((stage) => {
          const count = stageCounts[stage] ?? state.crm.leads.filter((l) => l.stage === stage).length;
          return `<button type="button" class="funnel-pill${state.filters.stage === stage ? ' is-active' : ''}" data-funnel-stage="${escapeHtml(stage)}">${escapeHtml(stage)} <span>${count}</span></button>`;
        })
      ].join('');
    }

    const hasFilters = Boolean(
      state.filters.search ||
      state.filters.stage ||
      state.filters.source ||
      state.filters.area ||
      state.filters.verification
    );
    if (els.filteredCount) {
      els.filteredCount.textContent = `${filteredCount} ${filteredCount === 1 ? 'aspirante' : 'aspirantes'}`;
    }
    if (els.clearFiltersBtn) {
      els.clearFiltersBtn.hidden = !hasFilters;
    }
  }

  function renderKanban(leads) {
    if (!els.kanbanBoard) return;
    els.kanbanBoard.innerHTML = STAGES.map((stage) => {
      const colLeads = leads.filter((l) => l.stage === stage);
      const cardsHtml = colLeads.length
        ? colLeads.map((lead) => `
          <article class="lead-card${lead.isRetell ? ' is-retell' : ''}" draggable="true" data-lead-id="${escapeHtml(lead.id)}">
            <div class="lead-card-top">
              <h3>${escapeHtml(lead.name)}</h3>
              <span class="score-pill ${scoreClass(lead.score)}">${lead.score} pts</span>
            </div>
            <div class="lead-program-line">${escapeHtml(lead.programTitle)}</div>
            <div class="lead-badges">
              <span class="badge ${lead.isRetell ? 'badge-retell' : 'badge-web'}">${escapeHtml(lead.isRetell ? 'Llamada Retell' : 'Formulario web')}</span>
              ${lead.emailConfirmed ? '<span class="badge badge-ok">✓ Deletreado</span>' : ''}
              ${lead.phoneConfirmed ? '<span class="badge badge-ok">✓ Tel. confirmado</span>' : ''}
              ${lead.humanCallback ? '<span class="badge badge-info">Solicita asesor</span>' : ''}
              ${lead.paused ? '<span class="badge badge-warn">Pausado</span>' : ''}
              ${formatResendBadge(lead.latestJob)}
            </div>
            <div class="lead-meta-line">
              ${escapeHtml([lead.city, lead.horizon, lead.owner ? `Asesor: ${lead.owner}` : ''].filter(Boolean).join(' · ') || lead.email || lead.phone || 'Sin datos adicionales')}
            </div>
            ${lead.next_action || lead.openTasksCount ? `<div class="lead-next-action">
              ${lead.openTasksCount ? `<strong>${lead.openTasksCount} tarea(s)</strong> · ` : ''}${escapeHtml(lead.next_action || 'Revisar pendiente')}
            </div>` : ''}
            <div class="lead-card-footer">
              <select class="quick-stage-select" aria-label="Mover etapa de ${escapeHtml(lead.name)}" data-move-lead="${escapeHtml(lead.id)}">
                ${STAGES.map((st) => `<option value="${escapeHtml(st)}"${st === lead.stage ? ' selected' : ''}>${escapeHtml(st)}</option>`).join('')}
              </select>
              <span class="lead-time">${escapeHtml(formatDateEc(lead.updated_at || lead.created_at))}</span>
            </div>
          </article>
        `).join('')
        : '<div class="kanban-empty">Sin expedientes en esta etapa</div>';

      return `
        <div class="kanban-col" data-stage-col="${escapeHtml(stage)}">
          <div class="kanban-col-head">
            <div class="kanban-col-title">
              <span class="stage-dot stage-${escapeHtml(stageCssSuffix(stage))}" aria-hidden="true"></span>
              <span>${escapeHtml(stage)}</span>
            </div>
            <span class="kanban-count">${colLeads.length}</span>
          </div>
          <div class="kanban-cards">${cardsHtml}</div>
        </div>
      `;
    }).join('');
  }

  function renderTable(leads) {
    if (!els.tableBody) return;
    if (!leads.length) {
      els.tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#526071;">No hay expedientes que coincidan con los filtros actuales.</td></tr>';
      return;
    }

    els.tableBody.innerHTML = leads.map((lead) => `
      <tr data-lead-id="${escapeHtml(lead.id)}">
        <td>
          <div class="table-name">${escapeHtml(lead.name)}</div>
          <div class="table-sub">${escapeHtml(lead.email || 'Sin correo')} · ${escapeHtml(lead.phone || 'Sin teléfono')}</div>
        </td>
        <td>
          <div>${escapeHtml(lead.programTitle)}</div>
          ${lead.city ? `<div class="table-sub">${escapeHtml(lead.city)}</div>` : ''}
        </td>
        <td>
          <select class="quick-stage-select" aria-label="Mover etapa de ${escapeHtml(lead.name)}" data-move-lead="${escapeHtml(lead.id)}">
            ${STAGES.map((st) => `<option value="${escapeHtml(st)}"${st === lead.stage ? ' selected' : ''}>${escapeHtml(st)}</option>`).join('')}
          </select>
        </td>
        <td><span class="score-pill ${scoreClass(lead.score)}">${lead.score}</span></td>
        <td><span class="badge ${lead.isRetell ? 'badge-retell' : 'badge-web'}">${escapeHtml(lead.isRetell ? 'Llamada Retell' : 'Web')}</span></td>
        <td>
          <div class="lead-badges">
            ${lead.emailConfirmed ? '<span class="badge badge-ok">✓ Email</span>' : ''}
            ${lead.phoneConfirmed ? '<span class="badge badge-ok">✓ Tel</span>' : ''}
            ${!lead.emailConfirmed && !lead.phoneConfirmed ? '<span class="badge badge-neutral">—</span>' : ''}
          </div>
        </td>
        <td>${formatResendBadge(lead.latestJob)}</td>
        <td>
          <div>${escapeHtml(lead.next_action || '—')}</div>
          ${lead.openTasksCount ? `<div class="table-sub">${lead.openTasksCount} tarea(s) abierta(s)</div>` : ''}
        </td>
        <td class="table-sub">${escapeHtml(formatDateEc(lead.updated_at || lead.created_at))}</td>
      </tr>
    `).join('');
  }

  function renderActivity() {
    const convs = state.crm.conversations || [];
    const tasks = state.crm.tasks || [];
    const events = state.crm.events || [];
    const leadById = new Map(state.crm.leads.map((l) => [l.id, l]));

    if (els.activityCallsCount) els.activityCallsCount.textContent = String(convs.length);
    if (els.activityCallsList) {
      els.activityCallsList.innerHTML = convs.length
        ? convs.map((c) => {
          const lead = leadById.get(c.lead_id);
          const extRaw = parseJsonSafe(c.extraction, {});
          const ext = parseJsonSafe(extRaw.retellData, extRaw);
          const summary = ext.summary || ext.call_summary_es || c.excerpt || 'Sin resumen.';
          return `
            <article class="feed-item">
              <div class="feed-item-head">
                <strong>${escapeHtml(c.contact_name || lead?.name || 'Aspirante')}</strong>
                <span class="badge ${c.provider === 'retell' ? 'badge-retell' : 'badge-web'}">${escapeHtml(c.provider.toUpperCase())} · ${escapeHtml(c.kind)}</span>
              </div>
              <p class="feed-item-body">${escapeHtml(summary)}</p>
              <div class="feed-item-meta">
                <span>${escapeHtml(c.contact_email || 'Sin correo')} · ${escapeHtml(c.contact_phone || 'Sin teléfono')}</span>
                <span>${escapeHtml(formatDateEc(c.occurred_at))}</span>
                ${c.lead_id ? `<button type="button" class="text-btn" data-open-lead="${escapeHtml(c.lead_id)}">Abrir expediente →</button>` : ''}
              </div>
            </article>
          `;
        }).join('')
        : '<div class="kanban-empty">Aún no se registran llamadas o conversaciones.</div>';
    }

    if (els.activityTasksList) {
      const pendingFirst = [...tasks].slice(0, 12);
      els.activityTasksList.innerHTML = pendingFirst.length
        ? pendingFirst.map((t) => {
          const lead = leadById.get(t.lead_id);
          const done = t.status === 'hecha';
          return `
            <div class="task-row${done ? ' is-done' : ''}">
              <label class="task-check-label">
                <input type="checkbox" data-toggle-task="${escapeHtml(t.id)}"${done ? ' checked' : ''}>
                <span>
                  <div class="task-title">${escapeHtml(t.title)}</div>
                  <div class="task-meta">${escapeHtml(lead?.name || 'Aspirante')} · Vence: ${escapeHtml(formatDateEc(t.due_at))}</div>
                </span>
              </label>
              ${t.lead_id ? `<button type="button" class="text-btn" data-open-lead="${escapeHtml(t.lead_id)}">Ver</button>` : ''}
            </div>
          `;
        }).join('')
        : '<div class="kanban-empty">No hay tareas registradas.</div>';
    }

    if (els.activityEventsCount) els.activityEventsCount.textContent = String(events.length);
    if (els.activityEventsList) {
      els.activityEventsList.innerHTML = events.length
        ? events.slice(0, 25).map((ev) => {
          const lead = leadById.get(ev.lead_id);
          return `
            <article class="feed-item">
              <div class="feed-item-head">
                <span class="badge badge-neutral">${escapeHtml(ev.type)}</span>
                <span class="lead-time">${escapeHtml(formatDateEc(ev.created_at))}</span>
              </div>
              <p class="feed-item-body">${escapeHtml(ev.description)}</p>
              <div class="feed-item-meta">
                <span>${escapeHtml(lead?.name || '')} · Por: ${escapeHtml(ev.actor || 'Sistema')}</span>
                ${ev.lead_id ? `<button type="button" class="text-btn" data-open-lead="${escapeHtml(ev.lead_id)}">Abrir</button>` : ''}
              </div>
            </article>
          `;
        }).join('')
        : '<div class="kanban-empty">Sin eventos recientes.</div>';
    }
  }

  function renderAllViews() {
    const filtered = getFilteredLeads();
    renderKpisAndFunnel(filtered.length);
    renderKanban(filtered);
    renderTable(filtered);
    renderActivity();

    if (state.selectedLeadId && !els.drawer.hidden) {
      const current = state.crm.leads.find((l) => l.id === state.selectedLeadId);
      if (current) {
        populateDrawer(enrichLead(current), false);
      } else {
        closeDrawer();
      }
    }
  }

  function buildTemplateCopy(lead, templateKey) {
    const prog = lead.prog;
    const progTitle = prog?.title || lead.programTitle || 'nuestros programas de posgrado';
    const priceText = prog && typeof prog.price === 'number' && prog.price > 0
      ? `$${new Intl.NumberFormat('es-EC').format(prog.price)} USD`
      : 'consultar directamente con Admisiones';
    const basePortal = window.location.origin + window.location.pathname.replace(/\/crm\/?.*$/, '');
    const citaUrl = `${basePortal}/#cita`;

    if (templateKey === 'resumen') {
      return {
        subject: `Resumen de su llamada · ${prog?.shortTitle || 'Posgrados UCG'}`,
        body: [
          `Hola ${lead.name},`,
          `Muchas gracias por comunicarse con Universidad Casa Grande (Guayaquil, Ecuador). Le compartimos un resumen de lo conversado sobre ${progTitle}.`,
          lead.summary ? `Resumen: ${lead.summary}` : 'Quedamos atentos para acompañarle en su decisión académica.',
          `Detalles verificados del programa:\n• Modalidad: ${prog?.mode || 'Consultar con Admisiones'}\n• Duración: ${prog?.duration || 'Consultar con Admisiones'}\n• Inversión publicada: ${priceText}${prog?.url ? `\n• Ficha oficial: ${prog.url}` : ''}${prog?.brochure ? `\n• Folleto PDF: ${prog.brochure}` : ''}`,
          `Puede agendar una cita personalizada aquí: ${citaUrl}\n\nCordialmente,\nAdmisiones de Posgrados · Universidad Casa Grande\n+593 4 372 6250`
        ].join('\n\n')
      };
    }

    if (templateKey === 'inversion' || templateKey === 'financiamiento') {
      return {
        subject: `Información de inversión y formas de pago · ${prog?.shortTitle || 'Posgrados UCG'}`,
        body: [
          `Hola ${lead.name},`,
          `Le saludamos desde Admisiones de Posgrados de la Universidad Casa Grande. Respecto a la inversión de ${progTitle}, el valor publicado es ${priceText}.`,
          'Con gusto podemos orientarle sobre alternativas de pago, fechas de convocatoria y pasos para formalizar su postulación.',
          `Si desea conversar con un asesor, puede agendar una cita en ${citaUrl} o responder directamente a este correo.\n\nCordialmente,\nAdmisiones de Posgrados · Universidad Casa Grande`
        ].join('\n\n')
      };
    }

    if (templateKey === 'cita') {
      return {
        subject: `Agendemos su asesoría personalizada · ${prog?.shortTitle || 'Posgrados UCG'}`,
        body: [
          `Hola ${lead.name},`,
          `Nos encantaría conversar con usted en una breve entrevista informativa sobre ${progTitle} para revisar horarios, malla curricular y fechas de inicio.`,
          `Puede solicitar su horario preferido en ${citaUrl} o respondernos con su disponibilidad.\n\nCordialmente,\nAdmisiones de Posgrados · Universidad Casa Grande`
        ].join('\n\n')
      };
    }

    if (templateKey === 'requisitos') {
      return {
        subject: `Requisitos y proceso de admisión · ${prog?.shortTitle || 'Posgrados UCG'}`,
        body: [
          `Hola ${lead.name},`,
          `Le compartimos la guía inicial para postular a ${progTitle} en la Universidad Casa Grande.`,
          'Por lo general se solicita título de tercer nivel registrado, copia de documento de identidad y formulario de admisión según la convocatoria vigente.',
          `${prog?.url ? `Ficha oficial del programa: ${prog.url}\n` : ''}Puede confirmar su documentación y fechas en ${citaUrl}.\n\nCordialmente,\nAdmisiones de Posgrados · Universidad Casa Grande`
        ].join('\n\n')
      };
    }

    return {
      subject: `Ficha académica · ${prog?.shortTitle || 'Posgrados UCG'}`,
      body: [
        `Hola ${lead.name},`,
        `Gracias por su interés en ${progTitle} de la Universidad Casa Grande (Guayaquil, Ecuador).`,
        `Datos clave:\n• Modalidad: ${prog?.mode || 'En línea'}\n• Duración: ${prog?.duration || 'Consultar con Admisiones'}\n• Inversión publicada: ${priceText}${prog?.url ? `\n• Ficha oficial: ${prog.url}` : ''}${prog?.brochure ? `\n• Folleto PDF: ${prog.brochure}` : ''}`,
        `Agende orientación en ${citaUrl}.\n\nCordialmente,\nAdmisiones de Posgrados · Universidad Casa Grande`
      ].join('\n\n')
    };
  }

  function populateDrawer(lead, resetDraft = true) {
    els.drawerLeadName.textContent = lead.name;
    els.drawerLeadSub.textContent = [lead.email || 'Sin correo', lead.phone || 'Sin teléfono', lead.programTitle].join(' · ');

    els.drawerSourceBadge.className = `badge ${lead.isRetell ? 'badge-retell' : 'badge-web'}`;
    els.drawerSourceBadge.textContent = lead.isRetell ? 'Llamada Retell' : 'Formulario web';

    els.drawerStageBadge.className = 'badge badge-neutral';
    els.drawerStageBadge.textContent = lead.stage;

    els.drawerScoreBadge.className = `score-pill ${scoreClass(lead.score)}`;
    els.drawerScoreBadge.textContent = `${lead.score}/100 pts`;

    if (lead.phone) {
      els.drawerTelLink.setAttribute('href', `tel:${lead.phone}`);
      els.drawerTelLink.setAttribute('aria-disabled', 'false');
      const waDigits = lead.phone.replace(/\D/g, '');
      if (waDigits) {
        els.drawerWaLink.setAttribute('href', `https://wa.me/${waDigits}`);
        els.drawerWaLink.setAttribute('aria-disabled', 'false');
      } else {
        els.drawerWaLink.setAttribute('aria-disabled', 'true');
      }
    } else {
      els.drawerTelLink.setAttribute('href', '#');
      els.drawerTelLink.setAttribute('aria-disabled', 'true');
      els.drawerWaLink.setAttribute('href', '#');
      els.drawerWaLink.setAttribute('aria-disabled', 'true');
    }

    if (lead.email) {
      els.drawerMailLink.setAttribute('href', `mailto:${lead.email}`);
      els.drawerMailLink.setAttribute('aria-disabled', 'false');
    } else {
      els.drawerMailLink.setAttribute('href', '#');
      els.drawerMailLink.setAttribute('aria-disabled', 'true');
    }

    els.drawerTasksBadge.textContent = String(lead.openTasksCount);

    els.drawerRetellCard.innerHTML = `
      <h4>Verificación e inteligencia de conversación</h4>
      <div class="lead-badges" style="margin-bottom:0.55rem;">
        ${lead.emailConfirmed ? '<span class="badge badge-ok">✓ Correo verificado por deletreo</span>' : '<span class="badge badge-neutral">Correo sin deletrear</span>'}
        ${lead.phoneConfirmed ? '<span class="badge badge-ok">✓ Teléfono confirmado por lectura</span>' : '<span class="badge badge-neutral">Teléfono sin lectura</span>'}
        ${lead.humanCallback ? '<span class="badge badge-info">Solicita atención humana / cita</span>' : ''}
      </div>
      <p>${lead.summary ? escapeHtml(lead.summary) : '<em>Sin resumen de llamada o consulta adicional.</em>'}</p>
      <dl class="retell-facts-grid">
        <div><dt>Ciudad</dt><dd>${escapeHtml(lead.city || 'No indicada')}</dd></div>
        <div><dt>Modalidad preferida</dt><dd>${escapeHtml(lead.modality || lead.prog?.mode || 'No indicada')}</dd></div>
        <div><dt>Horizonte de inicio</dt><dd>${escapeHtml(lead.horizon || 'Por definir')}</dd></div>
        <div><dt>Formación previa</dt><dd>${escapeHtml(lead.academicBackground || 'No indicada')}</dd></div>
        <div><dt>Preguntas clave</dt><dd>${escapeHtml(lead.keyQuestions || '—')}</dd></div>
        <div><dt>Consideraciones</dt><dd>${escapeHtml(lead.obstacles || '—')}</dd></div>
      </dl>
    `;

    els.editStage.value = lead.stage;
    els.editOwner.value = lead.owner || '';
    els.editProgram.value = lead.program || '';
    els.editScoreRange.value = String(lead.score);
    els.editScoreNum.value = String(lead.score);
    els.editScoreReadout.textContent = String(lead.score);
    els.editDue.value = toDatetimeLocalValue(lead.due_at);
    els.editNextAction.value = lead.next_action || '';
    els.editNote.value = lead.note || '';
    els.editConsentEmail.checked = lead.consent_email;
    els.editConsentVoice.checked = lead.consent_voice;
    els.editPaused.checked = lead.paused;

    const hasEmail = Boolean(lead.email);
    els.nurtureNoEmailWarn.hidden = hasEmail;
    els.sendNurtureBtn.disabled = !hasEmail;
    if (resetDraft) {
      els.aiRecBox.hidden = true;
      state.selectedTemplate = lead.isRetell ? 'resumen' : 'ficha';
      const initialCopy = buildTemplateCopy(lead, state.selectedTemplate);
      els.nurtureSubject.value = initialCopy.subject;
      els.nurtureBody.value = initialCopy.body;
    }

    els.drawerEmailHistory.innerHTML = lead.nurtureJobs.length
      ? lead.nurtureJobs.map((j) => `
        <div class="timeline-item">
          <div class="timeline-item-top">
            <span>${formatResendBadge(j)}</span>
            <span>${escapeHtml(formatDateEc(j.updated_at || j.due_at))}</span>
          </div>
          <strong>${escapeHtml(j.subject || j.reason || j.intent || 'Seguimiento')}</strong>
          ${j.provider_id ? `<div class="table-sub">Resend ID: ${escapeHtml(j.provider_id)}</div>` : ''}
        </div>
      `).join('')
      : '<div class="kanban-empty">No hay envíos registrados en Resend para este expediente.</div>';

    els.drawerTasksList.innerHTML = lead.tasks.length
      ? lead.tasks.map((t) => {
        const done = t.status === 'hecha';
        return `
          <div class="task-row${done ? ' is-done' : ''}">
            <label class="task-check-label">
              <input type="checkbox" data-toggle-task="${escapeHtml(t.id)}"${done ? ' checked' : ''}>
              <span>
                <div class="task-title">${escapeHtml(t.title)}</div>
                <div class="task-meta">Vence: ${escapeHtml(formatDateEc(t.due_at))}</div>
              </span>
            </label>
          </div>
        `;
      }).join('')
      : '<div class="kanban-empty">Sin tareas creadas todavía.</div>';

    const timelineItems = [
      ...lead.events.map((e) => ({
        kind: e.type,
        time: e.created_at,
        actor: e.actor || 'Sistema',
        text: e.description
      })),
      ...lead.conversations.map((c) => ({
        kind: `conversación (${c.provider})`,
        time: c.occurred_at,
        actor: c.contact_name || 'Aspirante',
        text: c.excerpt || 'Conversación registrada.'
      }))
    ].sort((a, b) => Date.parse(b.time || 0) - Date.parse(a.time || 0));

    els.drawerTimeline.innerHTML = timelineItems.length
      ? timelineItems.map((item) => `
        <div class="timeline-item">
          <div class="timeline-item-top">
            <strong>${escapeHtml(item.kind)} · ${escapeHtml(item.actor)}</strong>
            <span>${escapeHtml(formatDateEc(item.time))}</span>
          </div>
          <p>${escapeHtml(item.text)}</p>
        </div>
      `).join('')
      : '<div class="kanban-empty">Sin actividad registrada todavía.</div>';

    els.deleteStep1.hidden = false;
    els.deleteStep2.hidden = true;
  }

  function openDrawer(leadId) {
    const rawLead = state.crm.leads.find((l) => l.id === leadId);
    if (!rawLead) return;
    state.selectedLeadId = leadId;
    populateDrawer(enrichLead(rawLead), true);
    switchDrawerTab('profile');
    els.drawerBackdrop.hidden = false;
    els.drawer.hidden = false;
    els.drawerCloseBtn.focus();
  }

  function closeDrawer() {
    state.selectedLeadId = null;
    els.drawerBackdrop.hidden = true;
    els.drawer.hidden = true;
  }

  function switchDrawerTab(tabName) {
    state.drawerTab = tabName;
    document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
      const active = btn.dataset.drawerTab === tabName;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    ['profile', 'nurture', 'tasks', 'history'].forEach((name) => {
      const panel = document.getElementById(`drawer-panel-${name}`);
      if (panel) panel.hidden = name !== tabName;
    });
  }

  function openNewLeadModal() {
    els.modalError.hidden = true;
    els.newLeadForm.reset();
    els.modalConsentEmail.checked = true;
    els.modalBackdrop.hidden = false;
    els.newLeadModal.hidden = false;
    els.modalName.focus();
  }

  function closeNewLeadModal() {
    els.modalBackdrop.hidden = true;
    els.newLeadModal.hidden = true;
  }

  async function loadCrm(silent = false) {
    if (state.isLoading) return;
    state.isLoading = true;
    if (!silent && els.syncStatus) els.syncStatus.textContent = 'Actualizando CRM…';
    if (els.crmError) els.crmError.hidden = true;

    try {
      const data = await apiRequest('/api/public/crm');
      state.crm = {
        leads: Array.isArray(data.leads) ? data.leads : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        conversations: Array.isArray(data.conversations) ? data.conversations : [],
        events: Array.isArray(data.events) ? data.events : [],
        nurtureJobs: Array.isArray(data.nurtureJobs) ? data.nurtureJobs : [],
        stats: data.stats || {}
      };
      renderAllViews();
      if (els.syncStatus) {
        els.syncStatus.textContent = `Actualizado: ${formatDateEc(new Date().toISOString())}`;
      }
    } catch (err) {
      if (els.crmError) {
        els.crmError.textContent = `Error al cargar el CRM (${err.message}).`;
        els.crmError.hidden = false;
      }
      if (els.syncStatus) els.syncStatus.textContent = 'Error de sincronización';
    } finally {
      state.isLoading = false;
    }
  }

  async function moveLeadStage(leadId, nextStage) {
    const existing = state.crm.leads.find((l) => l.id === leadId);
    if (!existing || existing.stage === nextStage) return;
    try {
      await apiRequest(`/api/public/crm/leads/${encodeURIComponent(leadId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: nextStage, actor: 'Admisiones' })
      });
      showToast(`Expediente movido a "${nextStage}"`);
      await loadCrm(true);
    } catch (err) {
      showToast(`No se pudo mover la etapa: ${err.message}`, 'err');
      renderAllViews();
    }
  }

  async function toggleTaskStatus(taskId, checked) {
    const nextStatus = checked ? 'hecha' : 'pendiente';
    try {
      await apiRequest(`/api/public/crm/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, actor: 'Admisiones' })
      });
      showToast(checked ? 'Tarea marcada como hecha' : 'Tarea reabierta');
      await loadCrm(true);
    } catch (err) {
      showToast(`No se pudo actualizar la tarea: ${err.message}`, 'err');
    }
  }

  function exportCsv() {
    const rows = getFilteredLeads();
    if (!rows.length) {
      showToast('No hay registros visibles para exportar.', 'err');
      return;
    }
    const headers = [
      'ID', 'Nombre', 'Correo', 'Correo_Verificado', 'Teléfono', 'Teléfono_Confirmado',
      'Programa', 'Etapa', 'Puntaje', 'Origen', 'Ciudad', 'Horizonte',
      'Asesor', 'Próxima_Acción', 'Resend_Estado', 'Resumen', 'Actualizado'
    ];
    const safeCell = (val) => {
      let s = String(val ?? '').replace(/\r?\n/g, ' ');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [
      headers.map(safeCell).join(','),
      ...rows.map((l) => [
        l.id,
        l.name,
        l.email,
        l.emailConfirmed ? 'Sí' : 'No',
        l.phone,
        l.phoneConfirmed ? 'Sí' : 'No',
        l.programTitle,
        l.stage,
        l.score,
        l.source,
        l.city,
        l.horizon,
        l.owner,
        l.next_action,
        l.latestJob?.status || '',
        l.summary,
        l.updated_at || l.created_at
      ].map(safeCell).join(','))
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ucg-posgrados-crm-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Exportados ${rows.length} expedientes a CSV`);
  }

  function populateSelects() {
    const areas = [...new Set(state.programs.map((p) => p.area).filter(Boolean))];
    const stageOptions = STAGES.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    const programOptions = state.programs
      .map((p) => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.title)} (${escapeHtml(p.area)})</option>`)
      .join('');

    if (els.filterStage) els.filterStage.innerHTML = '<option value="">Todas las etapas</option>' + stageOptions;
    if (els.filterArea) {
      els.filterArea.innerHTML = '<option value="">Todas las áreas</option>' +
        areas.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    }
    if (els.editStage) els.editStage.innerHTML = stageOptions;
    if (els.editProgram) els.editProgram.innerHTML = '<option value="">Orientación general de posgrados</option>' + programOptions;
    if (els.modalProgram) els.modalProgram.innerHTML = '<option value="">Orientación general de posgrados</option>' + programOptions;
  }

  function setupAutoRefresh() {
    if (state.autoRefreshTimer) {
      window.clearInterval(state.autoRefreshTimer);
      state.autoRefreshTimer = null;
    }
    if (els.autoRefreshToggle?.checked) {
      state.autoRefreshTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadCrm(true);
        }
      }, 15000);
    }
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        document.querySelectorAll('[data-view]').forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        els.viewKanban.hidden = state.view !== 'kanban';
        els.viewTable.hidden = state.view !== 'table';
        els.viewActivity.hidden = state.view !== 'activity';
      });
    });

    els.refreshBtn?.addEventListener('click', () => {
      checkHealth();
      loadCrm();
    });
    els.autoRefreshToggle?.addEventListener('change', setupAutoRefresh);
    els.exportCsvBtn?.addEventListener('click', exportCsv);
    els.newLeadBtn?.addEventListener('click', openNewLeadModal);
    els.closeNewLeadModal?.addEventListener('click', closeNewLeadModal);
    els.cancelNewLead?.addEventListener('click', closeNewLeadModal);
    els.modalBackdrop?.addEventListener('click', closeNewLeadModal);

    els.stageFunnelPills?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-funnel-stage]');
      if (!btn) return;
      state.filters.stage = btn.dataset.funnelStage || '';
      if (els.filterStage) els.filterStage.value = state.filters.stage;
      renderAllViews();
    });

    els.filterSearch?.addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      renderAllViews();
    });
    els.filterStage?.addEventListener('change', (e) => {
      state.filters.stage = e.target.value;
      renderAllViews();
    });
    els.filterSource?.addEventListener('change', (e) => {
      state.filters.source = e.target.value;
      renderAllViews();
    });
    els.filterArea?.addEventListener('change', (e) => {
      state.filters.area = e.target.value;
      renderAllViews();
    });
    els.filterVerification?.addEventListener('change', (e) => {
      state.filters.verification = e.target.value;
      renderAllViews();
    });
    els.filterSort?.addEventListener('change', (e) => {
      state.filters.sort = e.target.value;
      renderAllViews();
    });

    els.clearFiltersBtn?.addEventListener('click', () => {
      state.filters = { search: '', stage: '', source: '', area: '', verification: '', sort: state.filters.sort };
      els.filterSearch.value = '';
      els.filterStage.value = '';
      els.filterSource.value = '';
      els.filterArea.value = '';
      els.filterVerification.value = '';
      renderAllViews();
    });

    // Kanban click, quick-move, and drag-and-drop
    els.kanbanBoard?.addEventListener('click', (e) => {
      if (e.target.closest('[data-move-lead]')) return;
      const card = e.target.closest('[data-lead-id]');
      if (card) openDrawer(card.dataset.leadId);
    });

    els.kanbanBoard?.addEventListener('change', (e) => {
      const select = e.target.closest('[data-move-lead]');
      if (select) moveLeadStage(select.dataset.moveLead, select.value);
    });

    els.kanbanBoard?.addEventListener('dragstart', (e) => {
      const card = e.target.closest('[data-lead-id]');
      if (!card) return;
      state.draggedLeadId = card.dataset.leadId;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', state.draggedLeadId);
    });

    els.kanbanBoard?.addEventListener('dragend', (e) => {
      const card = e.target.closest('[data-lead-id]');
      if (card) card.classList.remove('is-dragging');
      state.draggedLeadId = null;
      els.kanbanBoard.querySelectorAll('.kanban-col').forEach((c) => c.classList.remove('is-drag-over'));
    });

    els.kanbanBoard?.addEventListener('dragover', (e) => {
      const col = e.target.closest('[data-stage-col]');
      if (!col) return;
      e.preventDefault();
      col.classList.add('is-drag-over');
    });

    els.kanbanBoard?.addEventListener('dragleave', (e) => {
      const col = e.target.closest('[data-stage-col]');
      if (col && !col.contains(e.relatedTarget)) {
        col.classList.remove('is-drag-over');
      }
    });

    els.kanbanBoard?.addEventListener('drop', (e) => {
      const col = e.target.closest('[data-stage-col]');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('is-drag-over');
      const leadId = state.draggedLeadId || e.dataTransfer.getData('text/plain');
      const stage = col.dataset.stageCol;
      if (leadId && stage) {
        moveLeadStage(leadId, stage);
      }
    });

    // Table click & stage move
    els.tableBody?.addEventListener('click', (e) => {
      if (e.target.closest('[data-move-lead]')) return;
      const row = e.target.closest('tr[data-lead-id]');
      if (row) openDrawer(row.dataset.leadId);
    });

    els.tableBody?.addEventListener('change', (e) => {
      const select = e.target.closest('[data-move-lead]');
      if (select) moveLeadStage(select.dataset.moveLead, select.value);
    });

    // Activity view actions
    els.viewActivity?.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-lead]');
      if (openBtn) openDrawer(openBtn.dataset.openLead);
    });

    els.viewActivity?.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-toggle-task]');
      if (chk) toggleTaskStatus(chk.dataset.toggleTask, chk.checked);
    });

    // Drawer navigation & forms
    els.drawerCloseBtn?.addEventListener('click', closeDrawer);
    els.drawerBackdrop?.addEventListener('click', closeDrawer);

    document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
      btn.addEventListener('click', () => switchDrawerTab(btn.dataset.drawerTab));
    });

    els.editScoreRange?.addEventListener('input', (e) => {
      els.editScoreNum.value = e.target.value;
      els.editScoreReadout.textContent = e.target.value;
    });

    els.editScoreNum?.addEventListener('input', (e) => {
      const clamped = Math.max(0, Math.min(100, Number.parseInt(e.target.value || '0', 10) || 0));
      els.editScoreRange.value = String(clamped);
      els.editScoreReadout.textContent = String(clamped);
    });

    els.drawerProfileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.selectedLeadId) return;
      const score = Math.max(0, Math.min(100, Number.parseInt(els.editScoreNum.value || '0', 10) || 0));
      const payload = {
        stage: els.editStage.value,
        owner: els.editOwner.value.trim(),
        program: els.editProgram.value,
        score,
        due_at: fromDatetimeLocalValue(els.editDue.value),
        next_action: els.editNextAction.value.trim(),
        note: els.editNote.value.trim(),
        consent_email: els.editConsentEmail.checked,
        consent_voice: els.editConsentVoice.checked,
        paused: els.editPaused.checked,
        actor: els.editOwner.value.trim() || 'Admisiones'
      };
      els.saveProfileBtn.disabled = true;
      try {
        await apiRequest(`/api/public/crm/leads/${encodeURIComponent(state.selectedLeadId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        showToast('Expediente actualizado');
        await loadCrm(true);
      } catch (err) {
        showToast(`Error al guardar: ${err.message}`, 'err');
      } finally {
        els.saveProfileBtn.disabled = false;
      }
    });

    els.nurtureTemplateChips?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-template]');
      if (!btn || !state.selectedLeadId) return;
      const rawLead = state.crm.leads.find((l) => l.id === state.selectedLeadId);
      if (!rawLead) return;
      state.selectedTemplate = btn.dataset.template;
      const copy = buildTemplateCopy(enrichLead(rawLead), state.selectedTemplate);
      els.nurtureSubject.value = copy.subject;
      els.nurtureBody.value = copy.body;
      els.aiRecBox.hidden = true;
    });

    els.aiDraftBtn?.addEventListener('click', async () => {
      if (!state.selectedLeadId) return;
      const prev = els.aiDraftBtn.textContent;
      els.aiDraftBtn.disabled = true;
      els.aiDraftBtn.textContent = 'Generando con Claude…';
      try {
        const res = await apiRequest(`/api/public/crm/leads/${encodeURIComponent(state.selectedLeadId)}/ai-draft`, {
          method: 'POST',
          body: JSON.stringify({
            template: state.selectedTemplate || 'seguimiento',
            goal: state.selectedTemplate || 'seguimiento personalizado'
          })
        });
        els.nurtureSubject.value = res.subject || '';
        els.nurtureBody.value = res.body || '';
        if (res.recommendedAction) {
          const srcLabel = res.source === 'anthropic' ? 'Borrador IA (Claude)' : 'Plantilla inteligente UCG';
          els.aiRecBox.innerHTML = `<strong>${escapeHtml(srcLabel)}:</strong> Próxima acción sugerida: ${escapeHtml(res.recommendedAction)}`;
          els.aiRecBox.hidden = false;
        }
        showToast(res.source === 'anthropic' ? 'Borrador generado con Claude IA' : 'Borrador preparado con catálogo UCG');
      } catch (err) {
        showToast(`No se pudo generar el borrador: ${err.message}`, 'err');
      } finally {
        els.aiDraftBtn.disabled = false;
        els.aiDraftBtn.textContent = prev;
      }
    });

    els.nurtureEmailForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.selectedLeadId) return;
      const subject = els.nurtureSubject.value.trim();
      const body = els.nurtureBody.value.trim();
      if (!subject || !body) {
        showToast('Ingresa asunto y mensaje antes de enviar.', 'err');
        return;
      }
      const prev = els.sendNurtureBtn.textContent;
      els.sendNurtureBtn.disabled = true;
      els.sendNurtureBtn.textContent = 'Enviando vía Resend…';
      try {
        const res = await apiRequest(`/api/public/crm/leads/${encodeURIComponent(state.selectedLeadId)}/nurture-email`, {
          method: 'POST',
          body: JSON.stringify({
            subject,
            body,
            template: state.selectedTemplate || 'programa',
            actor: els.editOwner.value.trim() || 'Admisiones'
          })
        });
        showToast(`Correo enviado vía Resend (ID: ${res.providerId})`);
        await loadCrm(true);
      } catch (err) {
        showToast(`Error al enviar correo: ${err.message}`, 'err');
      } finally {
        els.sendNurtureBtn.disabled = false;
        els.sendNurtureBtn.textContent = prev;
      }
    });

    els.drawerTaskForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.selectedLeadId) return;
      const title = els.newTaskTitle.value.trim();
      if (!title) return;
      const dueAt = fromDatetimeLocalValue(els.newTaskDue.value);
      els.createTaskBtn.disabled = true;
      try {
        await apiRequest(`/api/public/crm/leads/${encodeURIComponent(state.selectedLeadId)}/tasks`, {
          method: 'POST',
          body: JSON.stringify({
            title,
            ...(dueAt ? { due_at: dueAt } : {}),
            actor: els.editOwner.value.trim() || 'Admisiones'
          })
        });
        els.drawerTaskForm.reset();
        showToast('Tarea agregada al expediente');
        await loadCrm(true);
      } catch (err) {
        showToast(`No se pudo crear la tarea: ${err.message}`, 'err');
      } finally {
        els.createTaskBtn.disabled = false;
      }
    });

    els.drawerTasksList?.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-toggle-task]');
      if (chk) toggleTaskStatus(chk.dataset.toggleTask, chk.checked);
    });

    els.drawerNoteForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.selectedLeadId) return;
      const text = els.newNoteText.value.trim();
      if (!text) return;
      els.saveNoteBtn.disabled = true;
      try {
        await apiRequest(`/api/public/crm/leads/${encodeURIComponent(state.selectedLeadId)}/notes`, {
          method: 'POST',
          body: JSON.stringify({
            text,
            pinToLead: els.newNotePin.checked,
            actor: els.editOwner.value.trim() || 'Admisiones'
          })
        });
        els.newNoteText.value = '';
        showToast('Nota registrada en el historial');
        await loadCrm(true);
      } catch (err) {
        showToast(`No se pudo guardar la nota: ${err.message}`, 'err');
      } finally {
        els.saveNoteBtn.disabled = false;
      }
    });

    els.deleteTrigger?.addEventListener('click', () => {
      els.deleteStep1.hidden = true;
      els.deleteStep2.hidden = false;
    });

    els.deleteCancel?.addEventListener('click', () => {
      els.deleteStep1.hidden = false;
      els.deleteStep2.hidden = true;
    });

    els.deleteConfirm?.addEventListener('click', async () => {
      if (!state.selectedLeadId) return;
      const targetId = state.selectedLeadId;
      els.deleteConfirm.disabled = true;
      try {
        await apiRequest(`/api/public/crm/leads/${encodeURIComponent(targetId)}`, {
          method: 'DELETE'
        });
        closeDrawer();
        showToast('Expediente eliminado');
        await loadCrm(true);
      } catch (err) {
        showToast(`No se pudo eliminar: ${err.message}`, 'err');
      } finally {
        els.deleteConfirm.disabled = false;
      }
    });

    // New Lead Modal
    els.newLeadForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      els.modalError.hidden = true;
      const name = els.modalName.value.trim();
      const email = els.modalEmail.value.trim();
      const phone = els.modalPhone.value.trim();
      const program = els.modalProgram.value;
      const city = els.modalCity.value.trim();
      const note = els.modalNote.value.trim();
      const consentEmail = els.modalConsentEmail.checked;
      const consentVoice = els.modalConsentVoice.checked;

      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        els.modalError.textContent = 'Ingresa nombre completo y un correo válido.';
        els.modalError.hidden = false;
        return;
      }
      if (consentVoice && !phone) {
        els.modalError.textContent = 'Ingresa un teléfono si autoriza llamadas.';
        els.modalError.hidden = false;
        return;
      }

      els.submitNewLead.disabled = true;
      try {
        await apiRequest('/api/leads', {
          method: 'POST',
          headers: {
            'Idempotency-Key': typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `crm-${Date.now()}`
          },
          body: JSON.stringify({
            name,
            email,
            phone,
            program,
            source: 'CRM Admisiones',
            consentEmail,
            consentVoice,
            context: {
              origen: 'crm-manual',
              ...(city ? { ciudad: city } : {}),
              ...(note ? { consulta: note } : {})
            }
          })
        });
        closeNewLeadModal();
        showToast('Nuevo aspirante registrado en el CRM');
        await loadCrm(true);
      } catch (err) {
        els.modalError.textContent = err.message;
        els.modalError.hidden = false;
      } finally {
        els.submitNewLead.disabled = false;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els.newLeadModal.hidden) closeNewLeadModal();
        else if (!els.drawer.hidden) closeDrawer();
      }
    });
  }

  async function init() {
    await Promise.all([resolveConfig(), loadCatalog()]);
    populateSelects();
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
