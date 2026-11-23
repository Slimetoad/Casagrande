(() => {
  'use strict';

  const DEFAULT_API_BASE = 'https://casagrande-posgrados-production.up.railway.app';
  const DEFAULT_VOICE_PHONE = '+19124915544';

  function parseJsonScript(id, fallback) {
    const el = document.getElementById(id);
    if (!el || !el.textContent) return fallback;
    try {
      return JSON.parse(el.textContent);
    } catch {
      return fallback;
    }
  }

  function sanitizeApiBase(candidate) {
    if (!candidate || typeof candidate !== 'string') return '';
    const trimmed = candidate.trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin + parsed.pathname.replace(/\/+$/, '');
      }
    } catch {
      return '';
    }
    return '';
  }

  function resolveConfig() {
    const embedded = parseJsonScript('ucg-config', {});
    const params = new URLSearchParams(window.location.search);
    const apiOverride = sanitizeApiBase(params.get('api'));
    const apiBase = apiOverride || sanitizeApiBase(embedded.apiBase) || DEFAULT_API_BASE;
    const voicePhone =
      typeof embedded.voicePhone === 'string' && embedded.voicePhone.trim()
        ? embedded.voicePhone.trim()
        : DEFAULT_VOICE_PHONE;
    return { apiBase, voicePhone };
  }

  function formatVoicePhone(e164) {
    const digits = String(e164 || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return e164 || DEFAULT_VOICE_PHONE;
  }

  function formatUsd(amount) {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(Math.max(0, Math.round(Number(amount) || 0)));
  }

  function makeIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `ucg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function bindVoicePhones(voicePhone) {
    const digits = String(voicePhone || '').replace(/[^\d+]/g, '');
    const href = `tel:${digits.startsWith('+') ? digits : `+${digits}`}`;
    const display = formatVoicePhone(voicePhone);

    document.querySelectorAll('[data-voice-phone-link]').forEach((node) => {
      node.setAttribute('href', href);
    });
    document.querySelectorAll('[data-voice-phone-display]').forEach((node) => {
      node.textContent = display;
    });
  }

  async function checkBackendHealth(apiBase) {
    const pill = document.getElementById('health-pill');
    const text = document.getElementById('health-text');
    if (!pill || !text) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${apiBase}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      pill.classList.remove('health-loading', 'health-warn', 'health-err');
      pill.classList.add('health-ok');
      const liveText =
        data && data.status === 'ok'
          ? 'Admisiones IA en línea'
          : 'Servicio conectado';
      text.textContent = liveText;
    } catch {
      pill.classList.remove('health-loading', 'health-ok', 'health-err');
      pill.classList.add('health-warn');
      text.textContent = 'Portal informativo · Formulario activo';
    } finally {
      window.clearTimeout(timer);
    }
  }

  function buildDonutSvg(gross, savings, downAmount, financed) {
    const total = Math.max(1, gross);
    const radius = 78;
    const cx = 110;
    const cy = 110;
    const circumference = 2 * Math.PI * radius;

    const segments = [
      { label: 'Saldo en cuotas', value: financed, color: '#FF8300' },
      { label: 'Entrada', value: downAmount, color: '#38bdf8' },
      { label: 'Beca / descuento', value: savings, color: '#10b981' }
    ];

    let offset = 0;
    const circles = segments
      .filter((seg) => seg.value > 0)
      .map((seg) => {
        const dash = (seg.value / total) * circumference;
        const dashArray = `${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`;
        const dashOffset = (-offset).toFixed(2);
        offset += dash;
        return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="22" stroke-linecap="butt" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 ${cx} ${cy})" />`;
      })
      .join('');

    const net = Math.max(0, gross - savings);

    return `
      <svg viewBox="0 0 220 220" width="220" height="220" role="img" aria-label="Distribución referencial de inversión: arancel neto ${formatUsd(net)}, beca ${formatUsd(savings)}, entrada ${formatUsd(downAmount)}, saldo financiado ${formatUsd(financed)}">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="22" />
        ${circles}
        <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="11" font-weight="600" fill="#cbd5e1">NETO ESTIMADO</text>
        <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="22" font-weight="800" fill="#ffffff">${formatUsd(net)}</text>
        <text x="${cx}" y="${cy + 34}" text-anchor="middle" font-size="11" fill="#94a3b8">USD referencial</text>
      </svg>
    `;
  }

  function initSimulator(program) {
    const disclaimerEl = document.getElementById('sim-disclaimer');
    const customWrap = document.getElementById('sim-custom-price-wrap');
    const tuitionRange = document.getElementById('sim-tuition-range');
    const tuitionInput = document.getElementById('sim-tuition-input');
    const tuitionReadout = document.getElementById('sim-tuition-readout');
    const discountRange = document.getElementById('sim-discount-range');
    const discountReadout = document.getElementById('sim-discount-readout');
    const downRange = document.getElementById('sim-down-range');
    const downReadout = document.getElementById('sim-down-readout');
    const monthsRange = document.getElementById('sim-months-range');
    const monthsReadout = document.getElementById('sim-months-readout');
    const donutMount = document.getElementById('sim-donut-mount');
    const monthlyValueEl = document.getElementById('sim-monthly-value');
    const monthlySubEl = document.getElementById('sim-monthly-sub');
    const grossValEl = document.getElementById('sim-gross-val');
    const savingsValEl = document.getElementById('sim-savings-val');
    const downValEl = document.getElementById('sim-down-val');
    const financedValEl = document.getElementById('sim-financed-val');
    const applyBtn = document.getElementById('sim-apply-plan-btn');

    if (!discountRange || !downRange || !monthsRange || !donutMount) {
      return { getPlanSummary: () => '' };
    }

    const hasPublishedPrice =
      typeof program.price === 'number' && Number.isFinite(program.price) && program.price > 0;

    let currentTuition = hasPublishedPrice ? Math.round(program.price) : 6500;

    if (customWrap) {
      customWrap.hidden = hasPublishedPrice;
    }

    if (disclaimerEl) {
      disclaimerEl.textContent = hasPublishedPrice
        ? `Cálculo referencial sobre el arancel publicado (${formatUsd(currentTuition)}). Las becas, tasas y cuotas finales se confirman con Admisiones UCG.`
        : 'Este programa tiene arancel por confirmar con Admisiones. Usa el monto referencial para proyectar cuotas aproximadas y valida tu cotización oficial al enviar el formulario.';
    }

    if (tuitionRange && tuitionInput && tuitionReadout) {
      const clamped = Math.min(12000, Math.max(1500, currentTuition));
      tuitionRange.value = String(clamped);
      tuitionInput.value = String(currentTuition);
      tuitionReadout.textContent = formatUsd(currentTuition);
    }

    let lastPlanSummary = '';

    function updateSimulation() {
      const discountPct = Math.min(50, Math.max(0, Number(discountRange.value) || 0));
      const downPct = Math.min(80, Math.max(0, Number(downRange.value) || 0));
      const months = Math.min(36, Math.max(1, Number(monthsRange.value) || 12));

      const gross = Math.max(500, Math.round(currentTuition));
      const savings = Math.round(gross * (discountPct / 100));
      const net = Math.max(0, gross - savings);
      const downAmount = Math.round(net * (downPct / 100));
      const financed = Math.max(0, net - downAmount);
      const monthly = Math.round(financed / months);

      if (discountReadout) discountReadout.textContent = `${discountPct}% (${formatUsd(savings)})`;
      if (downReadout) downReadout.textContent = `${downPct}% (${formatUsd(downAmount)})`;
      if (monthsReadout) monthsReadout.textContent = `${months} ${months === 1 ? 'mes' : 'meses'}`;
      if (tuitionReadout) tuitionReadout.textContent = formatUsd(gross);

      if (monthlyValueEl) monthlyValueEl.textContent = `${formatUsd(monthly)} / mes`;
      if (monthlySubEl) {
        monthlySubEl.textContent = `x ${months} ${months === 1 ? 'cuota mensual' : 'cuotas mensuales'} · Neto estimado ${formatUsd(net)}`;
      }
      if (grossValEl) {
        grossValEl.textContent = hasPublishedPrice ? formatUsd(gross) : `${formatUsd(gross)} (ref.)`;
      }
      if (savingsValEl) savingsValEl.textContent = `-${formatUsd(savings)}`;
      if (downValEl) downValEl.textContent = formatUsd(downAmount);
      if (financedValEl) financedValEl.textContent = formatUsd(financed);

      donutMount.innerHTML = buildDonutSvg(gross, savings, downAmount, financed);

      const baseNote = hasPublishedPrice ? 'arancel' : 'referencial';
      lastPlanSummary = `Plan simulado (${baseNote} ${formatUsd(gross)}, dscto ${discountPct}%, entrada ${downPct}%, ${months} cuotas aprox. de ${formatUsd(monthly)}/mes).`;
    }

    if (tuitionRange && tuitionInput) {
      tuitionRange.addEventListener('input', () => {
        currentTuition = Math.max(500, Number(tuitionRange.value) || 6500);
        tuitionInput.value = String(currentTuition);
        updateSimulation();
      });
      tuitionInput.addEventListener('input', () => {
        const val = Number(tuitionInput.value);
        if (Number.isFinite(val) && val >= 500) {
          currentTuition = Math.min(25000, Math.round(val));
          tuitionRange.value = String(Math.min(12000, Math.max(1500, currentTuition)));
          updateSimulation();
        }
      });
    }

    discountRange.addEventListener('input', updateSimulation);
    downRange.addEventListener('input', updateSimulation);
    monthsRange.addEventListener('input', updateSimulation);

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const notesEl = document.getElementById('lead-notes');
        if (notesEl) {
          const existing = notesEl.value.trim();
          const cleaned = existing.replace(/^Plan simulado \([^)]*\)\.\s*/i, '').trim();
          notesEl.value = cleaned ? `${lastPlanSummary}\n${cleaned}` : lastPlanSummary;
        }
        const formSection = document.getElementById('solicitar');
        if (formSection) {
          formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        const nameInput = document.getElementById('lead-name');
        if (nameInput) {
          window.setTimeout(() => nameInput.focus(), 350);
        }
      });
    }

    updateSimulation();
    return {
      getPlanSummary: () => lastPlanSummary
    };
  }

  function initLeadForm(config, program, simulatorApi) {
    const form = document.getElementById('course-lead-form');
    if (!form) return;

    const nameEl = document.getElementById('lead-name');
    const emailEl = document.getElementById('lead-email');
    const phoneEl = document.getElementById('lead-phone');
    const phoneReqEl = document.getElementById('phone-req-label');
    const cityEl = document.getElementById('lead-city');
    const horizonEl = document.getElementById('lead-horizon');
    const notesEl = document.getElementById('lead-notes');
    const appointmentEl = document.getElementById('lead-appointment');
    const consentEmailEl = document.getElementById('lead-consent-email');
    const consentVoiceEl = document.getElementById('lead-consent-voice');
    const errorEl = document.getElementById('lead-error');
    const successEl = document.getElementById('lead-success');
    const successMsgEl = document.getElementById('lead-success-msg');
    const submitBtn = document.getElementById('lead-submit-btn');

    function syncPhoneRequirement() {
      const voiceRequired = Boolean(consentVoiceEl && consentVoiceEl.checked);
      if (phoneReqEl) {
        phoneReqEl.textContent = voiceRequired ? '(obligatorio)' : '(opcional)';
      }
      if (phoneEl) {
        phoneEl.required = voiceRequired;
      }
    }

    if (consentVoiceEl) {
      consentVoiceEl.addEventListener('change', syncPhoneRequirement);
    }
    syncPhoneRequirement();

    function showError(message) {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
      if (successEl) {
        successEl.hidden = true;
      }
    }

    function clearMessages() {
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearMessages();

      const name = nameEl ? nameEl.value.trim() : '';
      const email = emailEl ? emailEl.value.trim() : '';
      const phone = phoneEl ? phoneEl.value.trim() : '';
      const city = cityEl ? cityEl.value.trim() : '';
      const horizon = horizonEl ? horizonEl.value : '';
      const notes = notesEl ? notesEl.value.trim() : '';
      const appointment = appointmentEl ? appointmentEl.value : '';
      const consentEmail = consentEmailEl ? Boolean(consentEmailEl.checked) : true;
      const consentVoice = consentVoiceEl ? Boolean(consentVoiceEl.checked) : false;

      if (name.length < 2) {
        showError('Por favor ingresa tu nombre completo.');
        if (nameEl) nameEl.focus();
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('Por favor ingresa un correo electrónico válido.');
        if (emailEl) emailEl.focus();
        return;
      }
      if (consentVoice && phone.replace(/\D/g, '').length < 7) {
        showError('Si solicitas llamada de seguimiento, por favor incluye un teléfono válido.');
        if (phoneEl) phoneEl.focus();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando solicitud...';
      }

      const payload = {
        name,
        email,
        phone: phone || null,
        program: program.slug || null,
        source: 'Formulario ficha 10x',
        consentEmail,
        consentVoice,
        context: {
          page: 'program-10x',
          programTitle: program.title || program.shortTitle || '',
          city: city || null,
          horizon: horizon || null,
          appointment: appointment || null,
          notes: notes || null,
          simulatorPlan: simulatorApi ? simulatorApi.getPlanSummary() : null
        }
      };

      try {
        const res = await fetch(`${config.apiBase}/api/leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': makeIdempotencyKey()
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `No pudimos registrar la solicitud (HTTP ${res.status}).`);
        }

        if (successEl) successEl.hidden = false;
        if (successMsgEl) {
          const emailStatus = data && data.emailStatus ? ` Estado de envío: ${data.emailStatus}.` : '';
          successMsgEl.textContent = `Registramos tu interés en ${program.shortTitle || program.title} para ${email}.${emailStatus}`;
        }
        form.reset();
        if (consentEmailEl) consentEmailEl.checked = true;
        syncPhoneRequirement();
      } catch (err) {
        showError(err && err.message ? err.message : 'Ocurrió un error al enviar tu solicitud. Intenta nuevamente.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar consulta sobre esta maestría';
        }
      }
    });
  }

  function init() {
    const config = resolveConfig();
    const program = parseJsonScript('program-data', {});

    bindVoicePhones(config.voicePhone);
    checkBackendHealth(config.apiBase);
    const simulatorApi = initSimulator(program);
    initLeadForm(config, program, simulatorApi);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
