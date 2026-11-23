import { brand } from './catalog.js';
import { clean, publicOrigin, redact } from './providers.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

/**
 * Returns the public portal base URL, preserving a valid path prefix such as
 * `/Casagrande` on GitHub Pages while stripping trailing slashes.
 */
export function portalBaseUrl(env) {
  const raw = typeof env?.PUBLIC_BASE_URL === 'string' ? env.PUBLIC_BASE_URL.trim() : '';
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
        const cleanPath = parsed.pathname.replace(/\/+$/, '');
        return parsed.origin + cleanPath;
      }
    } catch { /* Fall back to validated origin helper below. */ }
  }
  return publicOrigin(env);
}

/**
 * Returns the origin hosting dynamic server routes (`/confirmar`,
 * `/preferencias`, `/cita`, `/api/preferences`). Prefers an explicit backend
 * domain when the static portal is hosted separately (e.g. GitHub Pages).
 */
export function serviceOrigin(env) {
  const apiBase = typeof env?.API_BASE_URL === 'string' ? env.API_BASE_URL.trim() : '';
  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.origin;
    } catch { /* Ignore invalid API_BASE_URL. */ }
  }
  const domain = typeof env?.RAILWAY_PUBLIC_DOMAIN === 'string' ? env.RAILWAY_PUBLIC_DOMAIN.trim() : '';
  if (/^[a-z0-9.-]+$/i.test(domain)) {
    return 'https://' + domain;
  }
  return publicOrigin(env);
}

export function parseLeadContext(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function institutionalHref(value) {
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' && (u.hostname === 'casagrande.edu.ec' || u.hostname.endsWith('.casagrande.edu.ec')) &&
      !u.username && !u.password && !u.port) {
      return u.href;
    }
  } catch { /* Optional external link. */ }
  return '';
}

function formatUsd(amount) {
  return '$' + new Intl.NumberFormat('es-EC').format(amount) + ' USD';
}

export function formatSimulatorPlan(plan) {
  if (!plan) return '';
  if (typeof plan === 'string') return redact(clean(plan, 180));
  if (typeof plan !== 'object' || Array.isArray(plan)) return '';
  const parts = [];
  if (Number.isFinite(plan.tuition) && plan.tuition > 0) parts.push('Inversión ref. ' + formatUsd(plan.tuition));
  if (Number.isFinite(plan.downPayment) && plan.downPayment > 0) parts.push('entrada ' + formatUsd(plan.downPayment));
  if (Number.isFinite(plan.months) && plan.months > 0) parts.push(plan.months + ' cuotas');
  if (Number.isFinite(plan.monthlyPayment) && plan.monthlyPayment > 0) parts.push(formatUsd(plan.monthlyPayment) + '/mes');
  if (!parts.length && typeof plan.summary === 'string') return redact(clean(plan.summary, 180));
  return redact(parts.join(' · '));
}

function buildDetailRows(lead, program, context) {
  const rows = [];
  const programLabel = program?.title || clean(context.programTitle, 140) || 'Orientación para elegir maestría';
  rows.push({ label: 'Programa de interés', value: redact(programLabel) });

  if (program) {
    if (program.mode) rows.push({ label: 'Modalidad', value: program.mode });
    if (program.duration) rows.push({ label: 'Duración', value: program.duration });
    const investment = Number.isFinite(program.price) && program.price > 0
      ? `${formatUsd(program.price)} (financiamiento directo disponible)`
      : 'Consultar arancel y plan de pagos con Admisiones';
    rows.push({ label: 'Inversión', value: investment });
    if (program.schedule) rows.push({ label: 'Horario', value: program.schedule });
    if (program.cesResolution) rows.push({ label: 'Resolución CES', value: program.cesResolution });
    if (program.doubleDegree) rows.push({ label: 'Doble titulación', value: program.doubleDegree });
  }

  const city = clean(context.ciudad || context.city, 80);
  if (city) rows.push({ label: 'Ciudad', value: redact(city) });

  const horizon = clean(context.horizonte || context.horizon || context.timeframe, 80);
  if (horizon) rows.push({ label: 'Horizonte de inicio', value: redact(horizon) });

  const appointmentNote = clean(
    context.appointment || (context.solicitaCita ? 'Cita de orientación personalizada solicitada' : ''),
    120,
  );
  if (appointmentNote) rows.push({ label: 'Agenda', value: redact(appointmentNote) });

  const simText = formatSimulatorPlan(context.simulatorPlan);
  if (simText) rows.push({ label: 'Plan simulado', value: simText });

  const inquiry = clean(context.consulta || context.notes, 280);
  if (inquiry) rows.push({ label: 'Tu consulta', value: redact(inquiry) });

  const channels = ['Correo electrónico'];
  if (lead?.consent_voice === 1) channels.push('llamada telefónica');
  rows.push({ label: 'Canales autorizados', value: channels.join(' y ') });

  return rows;
}

function renderHtmlEmail({
  badge,
  headline,
  greeting,
  introParagraphs,
  calloutTitle,
  calloutBody,
  detailRows,
  confirmUrl,
  programUrl,
  programButtonLabel,
  agendaUrl,
  brochureUrl,
  nextHint,
  closingLines,
  prefsUrl,
  voiceLine,
  live,
}) {
  const brandSub = live ? 'Posgrados & Educación Continua' : 'Portal de Posgrados UCG';
  const rowsHtml = detailRows.map((row, idx) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:${idx === detailRows.length - 1 ? '0' : '1px solid #E5EAF1'};font-size:13px;font-weight:600;color:#475569;width:36%;vertical-align:top;">${escapeHtml(row.label)}</td>
      <td style="padding:10px 14px;border-bottom:${idx === detailRows.length - 1 ? '0' : '1px solid #E5EAF1'};font-size:14px;color:#0F172A;line-height:1.5;vertical-align:top;">${escapeHtml(row.value)}</td>
    </tr>`).join('');

  const confirmBlock = confirmUrl
    ? `
      <tr>
        <td style="padding:0 32px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
            <tr>
              <td style="padding:16px 18px;">
                <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0F2744;">¿Deseas ajustar tu programa o fecha estimada de inicio?</p>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#475569;">Puedes confirmar o actualizar la maestría que te interesa y cuándo te gustaría empezar desde este enlace privado:</p>
                <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:9px 16px;background:#FFFFFF;border:1px solid #0F2744;border-radius:7px;color:#0F2744;font-size:13px;font-weight:600;text-decoration:none;">Confirmar o actualizar mis datos &rarr;</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const brochureButton = brochureUrl
    ? `<td style="padding:4px;"><a href="${escapeHtml(brochureUrl)}" style="display:inline-block;padding:11px 18px;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:8px;color:#0F2744;font-size:13px;font-weight:600;text-decoration:none;">Ver brochure oficial (PDF)</a></td>`
    : '';

  const phoneDigits = String(brand.admissionsPhone || '').replace(/[^+\d]/g, '');
  const waDigits = String(brand.whatsappPhone || '').replace(/\D/g, '');
  const voiceHtml = voiceLine
    ? `<p style="margin:6px 0 0;font-size:13px;color:#475569;">Línea de orientación telefónica: <strong style="color:#0F2744;">${escapeHtml(voiceLine)}</strong></p>`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1E293B;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F1F4F8;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #DCE3EC;box-shadow:0 8px 24px rgba(15,39,68,0.08);">
          <tr>
            <td style="background:#0F2744;border-top:5px solid #FF8300;padding:26px 32px;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;color:#F8B259;">Universidad Casa Grande &middot; Guayaquil</p>
              <h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;font-weight:700;color:#FFFFFF;">${escapeHtml(brandSub)}</h1>
              <span style="display:inline-block;padding:4px 11px;border-radius:999px;background:rgba(255,131,0,0.18);border:1px solid rgba(255,169,77,0.45);color:#FFD8A8;font-size:12px;font-weight:600;">${escapeHtml(badge)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 14px;">
              <p style="margin:0 0 14px;font-size:18px;font-weight:700;color:#0F2744;">${escapeHtml(greeting)}</p>
              ${introParagraphs.map(p => `<p style="margin:0 0 12px;font-size:15px;line-height:1.62;color:#334155;">${escapeHtml(p)}</p>`).join('')}
            </td>
          </tr>
          <tr>
            <td style="padding:4px 32px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFF8EE;border-left:4px solid #FF8300;border-radius:8px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#9A4B00;">${escapeHtml(calloutTitle)}</p>
                    <p style="margin:0;font-size:14px;line-height:1.58;color:#3F2E1A;">${escapeHtml(calloutBody)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 22px;">
              <p style="margin:0 0 10px;font-size:13px;letter-spacing:0.6px;text-transform:uppercase;font-weight:700;color:#0F2744;">Resumen de tu solicitud</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #DCE3EC;border-radius:10px;overflow:hidden;background:#FAFBFD;">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          ${confirmBlock}
          <tr>
            <td style="padding:0 32px 20px;">
              <p style="margin:0 0 14px;font-size:14px;line-height:1.58;color:#475569;">${escapeHtml(nextHint)}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 -4px;">
                <tr>
                  <td style="padding:4px;"><a href="${escapeHtml(programUrl)}" style="display:inline-block;padding:12px 20px;background:#0F2744;border-radius:8px;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(programButtonLabel)}</a></td>
                  <td style="padding:4px;"><a href="${escapeHtml(agendaUrl)}" style="display:inline-block;padding:12px 18px;background:#FF8300;border-radius:8px;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">Agendar cita con Admisiones</a></td>
                  ${brochureButton}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#0F2744;">Canales directos de Admisiones UCG</p>
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">
                      Tel&eacute;fono Guayaquil: <a href="tel:${escapeHtml(phoneDigits)}" style="color:#0F2744;font-weight:600;text-decoration:none;">${escapeHtml(brand.admissionsPhone)}</a>
                      &nbsp;&middot;&nbsp;
                      WhatsApp: <a href="https://wa.me/${escapeHtml(waDigits)}" style="color:#0F2744;font-weight:600;text-decoration:none;">${escapeHtml(brand.whatsappPhone)}</a>
                    </p>
                    ${voiceHtml}
                    <p style="margin:6px 0 0;font-size:12px;color:#64748B;">${escapeHtml(brand.campusAddress)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 24px;border-top:1px solid #E5EAF1;background:#FCFDFE;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0F2744;">${escapeHtml(closingLines[0])}</p>
              ${closingLines[1] ? `<p style="margin:0 0 14px;font-size:13px;color:#475569;">${escapeHtml(closingLines[1])}</p>` : '<div style="height:10px;"></div>'}
              <p style="margin:0;font-size:12px;line-height:1.5;color:#64748B;">
                Recibiste este correo porque solicitaste orientaci&oacute;n de posgrados. Puedes cambiar tus preferencias o dejar de recibir mensajes en cualquier momento desde tu
                <a href="${escapeHtml(prefsUrl)}" style="color:#475569;text-decoration:underline;">enlace de preferencias</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Builds the Resend email payload (`subject`, `text`, `html`, headers, and reply-to)
 * for welcome, guidance, application, and admission outreach jobs.
 */
export function buildOutreachEmail({ env, job, lead, program = null, confirmUrl = '', replyTo = '' }) {
  const portalBase = portalBaseUrl(env);
  const serviceBase = serviceOrigin(env);
  const splitDeployment = Boolean(portalBase && serviceBase && portalBase !== serviceBase);
  const prefs = `${serviceBase}/preferencias/${lead.pref_token}`;
  const first = clean(lead.name, 100).split(' ')[0];
  const title = program?.title || '';
  const live = env?.INSTITUTIONAL_LIVE === 'true';

  const visit = program
    ? splitDeployment
      ? `${portalBase}/programas/${encodeURIComponent(program.slug)}/`
      : `${portalBase}/programas/${encodeURIComponent(program.slug)}`
    : splitDeployment
      ? `${portalBase}/#catalogo`
      : `${portalBase}/programas`;

  const simulatorUrl = splitDeployment
    ? `${portalBase}/#herramientas`
    : `${portalBase}/financiamiento${program ? '?programa=' + encodeURIComponent(program.slug) : ''}`;

  const agenda = `${serviceBase}/cita${program ? '?programa=' + encodeURIComponent(program.slug) : ''}`;
  const brochureUrl = institutionalHref(program?.brochure);
  const context = parseLeadContext(lead.context);

  const guidance = job.kind === 'guidance';
  const application = job.kind === 'application';
  const admission = job.kind === 'admission';

  const closingText = live
    ? 'Equipo de Admisiones de Posgrados\nUniversidad Casa Grande'
    : 'Equipo de orientación · Portal piloto de posgrados';
  const closingLines = closingText.split('\n');
  const formalFooter = 'Puedes dejar de recibir correos o cambiar tus preferencias desde tu enlace de baja.\n' + prefs;
  const greeting = first ? 'Hola, ' + first + '.' : 'Hola.';

  let subject;
  let badge;
  let calloutTitle;
  let calloutBody;
  let introParagraphs;
  let nextHint;

  if (application) {
    subject = 'Tu proceso de postulación';
    badge = 'Postulación en curso';
    introParagraphs = [
      'El equipo que lleva tu caso registró que tu postulación' + (title ? ' a ' + title : '') + ' está en curso.',
      'Estamos aquí para acompañarte hasta completar tu ingreso.',
    ];
    calloutTitle = 'Siguiente paso con tu expediente';
    calloutBody = 'Un asesor de Admisiones verificará tus documentos y se mantendrá en contacto contigo para confirmar fechas vigentes.';
    nextHint = 'Consulta con tu asesor qué documentos requieren verificación y si hay una fecha vigente para completar tu expediente.';
  } else if (admission) {
    subject = 'Próximos pasos de tu matrícula';
    badge = 'Admisión confirmada';
    introParagraphs = [
      '¡Felicitaciones! El equipo que lleva tu caso registró tu admisión' + (title ? ' a ' + title : '') + '. Podemos orientarte para completar tu matrícula.',
    ];
    calloutTitle = 'Acompañamiento para tu matrícula';
    calloutBody = 'Nuestro equipo de Admisiones se comunicará contigo para guiarte en los pasos administrativos y opciones de pago.';
    nextHint = 'Confirma los pasos administrativos, el costo vigente y las condiciones de pago con tu asesor antes de realizar un pago.';
  } else if (guidance) {
    subject = 'Tu siguiente paso para elegir un posgrado';
    badge = 'Orientación académica';
    introParagraphs = [
      '¿Qué te falta por resolver' + (title ? ' sobre ' + title : ' para elegir un posgrado') + '?',
      'Nuestro equipo de Admisiones sigue disponible para ayudarte a comparar modalidades, horarios y plan de financiamiento sin compromiso.',
    ];
    calloutTitle = 'Tu asesor está listo para ayudarte';
    calloutBody = 'Si quieres revisar requisitos, homologación o facilidades de pago, un asesor de Posgrados puede atenderte por correo, WhatsApp o en una cita breve.';
    nextHint = /financi|inversi|calcul|simul/i.test(lead.source)
      ? 'Para preparar tu presupuesto, revisa la entrada y el número de cuotas en el simulador:\n' + simulatorUrl
      : 'Revisa el plan de estudios, cómo encaja la modalidad con tu semana laboral y agenda una conversación si te gustaría resolver dudas puntuales.';
  } else {
    const progShort = program?.shortTitle || title;
    subject = (first ? '¡Gracias por escribirnos, ' + first + '!' : '¡Gracias por escribirnos!') +
      ' Recibimos tu solicitud' + (progShort ? ' · ' + progShort : ' de Posgrados UCG');
    badge = 'Solicitud recibida';
    introParagraphs = [
      '¡Qué gusto saludarte! Muchas gracias por tu interés en ' + (title || 'nuestros programas de posgrado') + ' de la Universidad Casa Grande.',
      'Recibimos tu solicitud de orientación correctamente y ya registramos los detalles de tu consulta para darte una atención personalizada.',
    ];
    calloutTitle = '¿Qué sigue ahora?';
    const voicePref = lead.consent_voice === 1 || context.solicitaCita || context.appointment
      ? ' Además, dejamos registrada tu preferencia para conversar por llamada o agendar una cita personalizada.'
      : '';
    calloutBody = 'Un asesor de nuestro equipo de Admisiones de Posgrados revisará tus datos y se pondrá en contacto contigo muy pronto para guiarte con fechas de inicio, requisitos y facilidades de financiamiento.' + voicePref;
    if (/financi|inversi|calcul|simul/i.test(lead.source)) {
      nextHint = 'Para preparar tu presupuesto, también puedes revisar opciones de cuotas en el simulador: ' + simulatorUrl;
    } else if (/orient|quiz/i.test(lead.source)) {
      nextHint = 'Mientras te contactamos, puedes comparar el enfoque de la maestría, su horario y modalidades disponibles en la ficha oficial.';
    } else {
      nextHint = 'Antes de elegir, revisa qué aprenderás, cómo encaja la modalidad con tu semana y qué requisitos necesitas consultar.';
    }
  }

  const detailRows = buildDetailRows(lead, program, context);
  const voiceLine = clean(env?.RETELL_INBOUND_NUMBER, 30);

  const detailsText = detailRows.map(r => '• ' + r.label + ': ' + r.value).join('\n');
  const lines = [
    greeting,
    ...introParagraphs,
    calloutTitle + ':\n' + calloutBody,
    'Resumen de tu solicitud:\n' + detailsText,
  ];

  if (job.kind === 'welcome') {
    if (confirmUrl) {
      lines.push('Confirma o corrige la maestría que te interesa y cuándo te gustaría empezar desde este enlace privado.\n' + confirmUrl);
    } else {
      lines.push('Si cambió la maestría que te interesa o cuándo te gustaría empezar, cuéntaselo al equipo de orientación cuando solicites una cita.');
    }
  }

  lines.push(
    nextHint,
    'Puedes consultar ' + (title ? 'la ficha completa del programa' : 'el catálogo') + ' aquí.\n' + visit,
    'Si te gustaría conversar, puedes solicitar una cita aquí.\n' + agenda,
  );
  if (brochureUrl) {
    lines.push('Folletos y plan de estudios oficial (PDF):\n' + brochureUrl);
  }
  lines.push(
    'Canales directos de Admisiones UCG:\n• Teléfono Guayaquil: ' + brand.admissionsPhone +
      '\n• WhatsApp: ' + brand.whatsappPhone +
      (voiceLine ? '\n• Orientación telefónica: ' + voiceLine : ''),
    closingText,
    formalFooter,
  );

  const html = renderHtmlEmail({
    badge,
    headline: subject,
    greeting,
    introParagraphs,
    calloutTitle,
    calloutBody,
    detailRows,
    confirmUrl: job.kind === 'welcome' ? confirmUrl : '',
    programUrl: visit,
    programButtonLabel: title ? 'Ver ficha completa del programa' : 'Explorar catálogo de maestrías',
    agendaUrl: agenda,
    brochureUrl,
    nextHint,
    closingLines,
    prefsUrl: prefs,
    voiceLine,
    live,
  });

  return {
    from: env.RESEND_FROM,
    to: [lead.email],
    tags: [{ name: 'flujo', value: 'posgrados-ucg' }, { name: 'seguimiento', value: job.id }],
    subject,
    text: lines.join('\n\n'),
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
    headers: {
      'List-Unsubscribe': '<' + serviceBase + '/api/preferences/' + lead.pref_token + '>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
