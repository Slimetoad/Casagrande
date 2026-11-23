#!/usr/bin/env node
/**
 * Idempotent Retell AI provisioning script for Universidad Casa Grande (UCG) Posgrados.
 *
 * Reads all 34 verified graduate programs dynamically from src/catalog.js and configures:
 *   1. Retell LLM ("UCG Posgrados · Oficial de Admisiones (Ecuador)") with Ecuadorian Spanish prompt
 *   2. Retell Voice Agent (voice: 11labs-Andrea, model: eleven_flash_v2_5, language: es-419)
 *   3. Post-call structured extraction schema matching src/channels.js & src/conversation-intake.js
 *   4. Dedicated UCG phone number provisioning via POST /create-phone-number (protecting +17874920528)
 *
 * Security: NEVER hardcode API keys or secrets. Reads process.env.RETELL_API_KEY at runtime.
 */

import { brand, programs } from '../src/catalog.js';

const RETELL_API_BASE = 'https://api.retellai.com';
const AGENT_NAME = 'UCG Posgrados · Oficial de Admisiones (Ecuador)';
const PHONE_NICKNAME = 'UCG Posgrados Admisiones';
const PROTECTED_NUMBERS = new Set(['+17874920528']);
const PORTAL_URL = 'https://slimetoad.github.io/Casagrande/';
const DEFAULT_CATALOG_LOOKUP_URL = 'https://casagrande-posgrados-production.up.railway.app/api/retell/catalog-lookup';
const DEFAULT_LLM_MODEL = 'gpt-5.4';
const VOICE_ID = '11labs-Andrea';
const VOICE_MODEL = 'eleven_flash_v2_5';
const LANGUAGE = 'es-419';
const WEBHOOK_EVENTS = ['call_started', 'call_ended', 'call_analyzed'];

const BEGIN_MESSAGE =
  '¡Hola! Mucho gusto. Le saluda Andrea, Oficial de Admisiones de Posgrados de la Universidad Casa Grande, en Guayaquil, Ecuador. ¿Cómo le puedo ayudar hoy con nuestras maestrías y posgrados?';

const BOOSTED_KEYWORDS = [
  'Universidad Casa Grande',
  'Casa Grande',
  'UCG',
  'Guayaquil',
  'Miraflores',
  'Ecuador',
  'Quito',
  'Cuenca',
  'posgrados',
  'posgrado',
  'maestría',
  'Magíster',
  'complexivo',
  'titulación',
  'doble titulación',
  'UCAM',
  'SENESCYT',
  'CES',
  'financiamiento',
  'arancel',
  'tercer nivel',
  'admisiones',
  'convocatoria',
  'cohorte',
  'inversión',
  'ciberseguridad',
  'neuropsicología',
  'tributario',
  'arroba',
  'punto',
  'i griega',
  'ye',
  'i latina',
  'be grande',
  'uve',
  've corta',
  'doble uve',
  'hache',
  'zeta',
  'equis',
  'guion',
  'guion bajo',
  'gmail',
  'hotmail',
  'outlook',
  'icloud',
  'yahoo',
  'casagrande',
  'edu',
  'ec',
  '593',
];

function parseArgs(argv) {
  const opts = {
    webhookUrl: process.env.RETELL_WEBHOOK_URL?.trim() || '',
    catalogLookupUrl:
      process.env.RETELL_CATALOG_LOOKUP_URL?.trim() || process.env.RETELL_CATALOG_URL?.trim() || '',
    phone: process.env.RETELL_INBOUND_NUMBER?.trim() || '',
    areaCode: process.env.RETELL_AREA_CODE ? Number(process.env.RETELL_AREA_CODE) : null,
    countryCode: process.env.RETELL_COUNTRY_CODE?.trim() || '',
    numberProvider: process.env.RETELL_NUMBER_PROVIDER?.trim() || '',
    model: process.env.RETELL_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL,
    dryRun: false,
    skipPhone: false,
    clearWebhook: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--webhook-url' && argv[i + 1]) {
      opts.webhookUrl = argv[++i].trim();
    } else if (arg.startsWith('--webhook-url=')) {
      opts.webhookUrl = arg.slice('--webhook-url='.length).trim();
    } else if ((arg === '--catalog-url' || arg === '--catalog-lookup-url') && argv[i + 1]) {
      opts.catalogLookupUrl = argv[++i].trim();
    } else if (arg.startsWith('--catalog-url=')) {
      opts.catalogLookupUrl = arg.slice('--catalog-url='.length).trim();
    } else if (arg.startsWith('--catalog-lookup-url=')) {
      opts.catalogLookupUrl = arg.slice('--catalog-lookup-url='.length).trim();
    } else if (arg === '--phone' && argv[i + 1]) {
      opts.phone = argv[++i].trim();
    } else if (arg.startsWith('--phone=')) {
      opts.phone = arg.slice('--phone='.length).trim();
    } else if (arg === '--area-code' && argv[i + 1]) {
      opts.areaCode = Number(argv[++i]);
    } else if (arg.startsWith('--area-code=')) {
      opts.areaCode = Number(arg.slice('--area-code='.length));
    } else if (arg === '--country-code' && argv[i + 1]) {
      opts.countryCode = argv[++i].trim();
    } else if (arg.startsWith('--country-code=')) {
      opts.countryCode = arg.slice('--country-code='.length).trim();
    } else if (arg === '--number-provider' && argv[i + 1]) {
      opts.numberProvider = argv[++i].trim();
    } else if (arg.startsWith('--number-provider=')) {
      opts.numberProvider = arg.slice('--number-provider='.length).trim();
    } else if (arg === '--model' && argv[i + 1]) {
      opts.model = argv[++i].trim();
    } else if (arg.startsWith('--model=')) {
      opts.model = arg.slice('--model='.length).trim();
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--skip-phone') {
      opts.skipPhone = true;
    } else if (arg === '--clear-webhook') {
      opts.clearWebhook = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else {
      throw new Error(`Opción no reconocida: ${arg}`);
    }
  }

  if (opts.phone && PROTECTED_NUMBERS.has(opts.phone)) {
    throw new Error(`El número ${opts.phone} está protegido (pertenece a otra cuenta/servicio) y no debe modificarse.`);
  }

  if (opts.areaCode !== null && (!Number.isInteger(opts.areaCode) || opts.areaCode < 100 || opts.areaCode > 999)) {
    throw new Error(`--area-code debe ser un entero de 3 dígitos (recibido: ${opts.areaCode}).`);
  }

  if (opts.webhookUrl) {
    const parsed = new URL(opts.webhookUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error(`webhookUrl inválida: ${opts.webhookUrl}`);
    }
  }

  if (!opts.catalogLookupUrl) {
    opts.catalogLookupUrl = opts.webhookUrl
      ? `${new URL(opts.webhookUrl).origin}/api/retell/catalog-lookup`
      : DEFAULT_CATALOG_LOOKUP_URL;
  } else {
    const parsedCatalog = new URL(opts.catalogLookupUrl);
    if (!['https:', 'http:'].includes(parsedCatalog.protocol)) {
      throw new Error(`catalogUrl inválida: ${opts.catalogLookupUrl}`);
    }
  }

  return opts;
}

function formatPriceUsd(price) {
  if (Number.isFinite(price) && price > 0) {
    const monthly18 = Math.round(price / 18);
    return `$${price.toLocaleString('en-US')} USD (ref. 18m: ~$${monthly18}/mes)`;
  }
  return 'Consultar con Admisiones';
}

function mostCommonValue(values) {
  const counts = new Map();
  for (const val of values.filter(Boolean)) {
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [val, count] of counts.entries()) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return bestCount > 1 ? best : '';
}

function deriveFamilyDefaults(catalogPrograms) {
  const defaults = {};
  const families = [...new Set(catalogPrograms.map((p) => p.family).filter(Boolean))];
  for (const family of families) {
    const group = catalogPrograms.filter((p) => p.family === family);
    defaults[family] = {
      schedule: mostCommonValue(group.map((p) => p.schedule)),
      graduationMode: mostCommonValue(group.map((p) => p.graduationMode)),
      financing: mostCommonValue(group.map((p) => p.financing)),
      admissionProcess: mostCommonValue(
        group.map((p) => (Array.isArray(p.admissionProcess) ? p.admissionProcess.join(' ') : '')),
      ),
    };
  }
  return defaults;
}

function compileCatalogPrompt(catalogPrograms, familyDefaults) {
  return catalogPrograms
    .map((program, index) => {
      const fam = familyDefaults[program.family] || {};
      const period1 = Array.isArray(program.curriculumPeriods?.period1) && program.curriculumPeriods.period1.length
        ? program.curriculumPeriods.period1.join(', ')
        : '';
      const period2 = Array.isArray(program.curriculumPeriods?.period2) && program.curriculumPeriods.period2.length
        ? program.curriculumPeriods.period2.join(', ')
        : '';
      const fallbackCurriculum = Array.isArray(program.curriculum) && program.curriculum.length
        ? program.curriculum.join(', ')
        : 'Consultar malla vigente con Admisiones';
      const priceText = formatPriceUsd(program.price);
      const links = [
        `Ficha: ${program.url}`,
        program.brochure ? `Folleto: ${program.brochure}` : '',
        program.applicationUrl ? `Postulación: ${program.applicationUrl}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      const admission = Array.isArray(program.admissionProcess) && program.admissionProcess.length
        ? program.admissionProcess.join(' ')
        : '';

      const lines = [
        `${index + 1}. [${program.slug}] ${program.title}`,
        `   Área: ${program.area} | Línea: ${program.family} | Mod: ${program.mode} | Dur: ${program.duration} | Inv: ${priceText} | Estado: ${program.admissionsStatus}`,
        `   Título: ${program.degree} | CES: ${program.cesResolution || 'Consultar con Admisiones'}`,
      ];

      const scheduleDiff = program.schedule && program.schedule !== fam.schedule;
      const gradDiff = program.graduationMode && program.graduationMode !== fam.graduationMode;
      if (scheduleDiff || gradDiff) {
        const parts = [];
        if (scheduleDiff) parts.push(`Horario: ${program.schedule}`);
        if (gradDiff) parts.push(`Titulación: ${program.graduationMode}`);
        lines.push(`   ${parts.join(' | ')}`);
      }
      if (program.doubleDegree) lines.push(`   Doble titulación: ${program.doubleDegree}`);
      if (program.financing && program.financing !== fam.financing) {
        lines.push(`   Financiamiento: ${program.financing}`);
      }
      if (program.entryProfile) lines.push(`   Ingreso: ${program.entryProfile}`);
      if (admission && admission !== fam.admissionProcess) lines.push(`   Admisión: ${admission}`);
      if (period1 || period2) {
        if (period1) lines.push(`   Período I: ${period1}`);
        if (period2) lines.push(`   Período II: ${period2}`);
      } else {
        lines.push(`   Malla: ${fallbackCurriculum}`);
      }
      lines.push(`   Enfoque: ${program.summary} | ${links}`);
      return lines.join('\n');
    })
    .join('\n');
}

function buildGeneralPrompt(catalogPrograms, institution) {
  const familyDefaults = deriveFamilyDefaults(catalogPrograms);
  const catalogBlock = compileCatalogPrompt(catalogPrograms, familyDefaults);
  const areas = [...new Set(catalogPrograms.map((p) => p.area))].join(', ');
  const admissionsStepsText = Array.isArray(institution.admissionsSteps)
    ? institution.admissionsSteps.join(' ')
    : '';
  const familySummaryLines = Object.entries(familyDefaults)
    .map(([family, d]) => {
      const parts = [`Línea ${family}:`];
      if (d.schedule) parts.push(`Horario estándar: ${d.schedule}`);
      if (d.graduationMode) parts.push(`Titulación estándar: ${d.graduationMode}.`);
      if (d.financing) parts.push(`Financiamiento: ${d.financing}`);
      if (d.admissionProcess) parts.push(`Admisión: ${d.admissionProcess}`);
      return `- ${parts.join(' ')}`;
    })
    .join('\n');

  return `Usted es Andrea, Oficial de Admisiones de Posgrados de la ${institution.name} (${institution.shortName}), ubicada en ${institution.city}.
Su misión es brindar una orientación cálida, precisa y profesional a los aspirantes interesados en las ${catalogPrograms.length} maestrías oficiales de posgrado, resolver sus consultas con datos verificados, recopilar y verificar rigurosamente sus datos de contacto y perfil académico, y solicitar su autorización para enviarles un correo personalizado de resumen y agradecimiento.

DATOS INSTITUCIONALES OFICIALES (ÚNICA FUENTE AUTORIZADA):
- Institución: ${institution.name} (${institution.shortName}) — ${institution.city}
- Campus Guayaquil: ${institution.campusAddress}
- Teléfono oficial de Admisiones en Guayaquil: ${institution.admissionsPhone} (en voz alta léalo como: «más cinco nueve tres, cuatro, tres siete dos, seis dos cinco cero»)
- WhatsApp oficial de Admisiones: ${institution.whatsappPhone} (en voz alta léalo dígito por dígito: «más cinco nueve tres, nueve, cinco ocho seis cuatro, cuatro siete cuatro uno»)
- Correos oficiales: ${institution.admissionsEmail} (Admisiones) y ${institution.postgraduateEmail} (Posgrados)
- Portal informativo de Posgrados: ${PORTAL_URL}
- Sitio institucional de Posgrados: ${institution.catalogUrl} y maestrías flexibles en ${institution.flexibleCatalogUrl}
- Áreas académicas del catálogo vigente (${catalogPrograms.length} programas verificados al ${institution.verifiedAt}): ${areas}.
- Política general de financiamiento: ${institution.financingPolicy}
- Proceso general de admisión: ${admissionsStepsText}
- Modalidad publicada en el catálogo vigente: los ${catalogPrograms.length} programas listados se imparten en modalidad En línea. Los programas de línea Flexible (12 meses) tienen tutorías sincrónicas los sábados o domingos de 08:00 a 13:00 y titulación mediante examen complexivo; los de línea Inmersiva (2 semestres) cuentan con sesiones sincrónicas programadas según cada cohorte, folleto oficial descargable y opción a doble titulación UCAM (España) en programas seleccionados.

REGLAS ESTÁNDAR POR LÍNEA (APLICAN SALVO INDICACIÓN ESPECÍFICA EN EL PROGRAMA):
${familySummaryLines}

HERRAMIENTA EN VIVO DEL CATÁLOGO (consultar_catalogo_ucg):
- Dispone de la función consultar_catalogo_ucg conectada al catálogo oficial de UCG en vivo.
- Úsela cuando el aspirante pida comparar varias maestrías o solicite detalles profundos (malla completa por períodos, resolución CES, doble titulación UCAM, requisitos específicos de ingreso, financiamiento o horarios exactos) para confirmar siempre datos al día sin improvisar.

IDIOMA Y DIALECTO (ESPAÑOL ECUATORIANO — REGLA ESTRICTA):
- Hable siempre en español ecuatoriano culto, cercano, cálido y respetuoso, utilizando de forma consistente el trato de «usted».
- Use expresiones naturales de Ecuador como «Mucho gusto», «Con todo gusto», «Con mucho gusto», «¿Cómo le puedo ayudar?», «Permítame», «Disculpe», «maestrías», «posgrados», «inversión», «malla curricular», «título de tercer nivel», «SENESCYT» y «cohorte».
- PROHIBIDO usar «vosotros» de España («vosotros», «os», «tenéis», «vale») y PROHIBIDO usar modismos mexicanos o argentinos («qué padre», «ándale», «órale», «chido», «che», «bárbaro», «vos sabés»).
- Manténgase 100 % en español durante toda la llamada, incluidos deletreos, arroba, punto, números y nombres de programas. Cambie al inglés únicamente si el interlocutor habla una oración completa en inglés y pide expresamente continuar en ese idioma.

ESTILO CONVERSACIONAL PARA VOZ:
- Sea clara, amable y conversacional: responda en 2 a 4 oraciones cortas por turno y haga UNA sola pregunta a la vez.
- PROHIBIDO usar listas con viñetas, numeraciones, negritas, enlaces URL literales ni formatos escritos en su diálogo hablado. Cuando mencione enlaces o folletos, diga por ejemplo: «Con todo gusto le enviamos el enlace oficial y el folleto a su correo electrónico».

VERACIDAD Y LÍMITES DEL CATÁLOGO (CERO INVENCIONES):
- Responda cualquier pregunta sobre la Universidad Casa Grande y sus ${catalogPrograms.length} maestrías basándose ÚNICAMENTE en el catálogo verificado al final de estas instrucciones o en la herramienta consultar_catalogo_ucg.
- NUNCA invente aranceles, porcentajes exactos de descuento por convenio, becas no publicadas ni fechas exactas de inicio de clases que no figuren en el catálogo.
- Si una maestría es de línea Inmersiva (inversión «Consultar con Admisiones») o no tiene fecha de inicio publicada, dígalo con total transparencia: nunca invente un precio; explique que el valor exacto, convenios y calendario de la próxima cohorte los confirma directamente Admisiones y ofrezca enviarle el folleto oficial y el resumen por correo.
- Cuando la maestría sí tiene inversión publicada (programas Flexibles de $2,800, $3,000 o $3,200 USD), indíquela claramente y ofrezca como referencia el financiamiento directo hasta 18 meses (por ejemplo cuotas referenciales cercanas a 156, 167 o 178 dólares mensuales sin entrada, siempre aclarando que es una referencia sujeta a evaluación y condiciones vigentes con Admisiones, además de opciones con tarjeta de crédito o convenios).
- Si una maestría figura con «Inscripciones cerradas», infórmelo con amabilidad y ofrezca registrar su interés para que Admisiones le avise en la próxima convocatoria o sugerirle una alternativa abierta en la misma área.
- Si el aspirante pregunta por modalidad presencial o híbrida, aclare honestamente que los ${catalogPrograms.length} programas del catálogo vigente se dictan en línea, y anote su preferencia modal para que Admisiones le oriente si hay opciones específicas.

PROTOCOLO OBLIGATORIO DE CALIFICACIÓN Y VERIFICACIÓN DEL ASPIRANTE:
Si el aspirante hace una consulta inicial sobre una maestría, primero respóndale de forma breve y útil con los datos verificados del catálogo, y luego conduzca la conversación con naturalidad para completar estos pasos en orden (sin repetir datos que ya haya mencionado):

1. NOMBRE COMPLETO:
   - Solicite amablemente su nombre completo (nombres y apellidos).

2. CORREO ELECTRÓNICO Y DELETREO OBLIGATORIO LETRA POR LETRA:
   - Pida su correo electrónico para poder enviarle la ficha del programa y el resumen.
   - OBLIGATORIO antes de avanzar: deletree el correo completo carácter por carácter en voz alta. Ejemplo de cómo debe sonar: «Permítame confirmarle su correo letra por letra para asegurarnos de que quede perfecto: ce, a, ere, ele, o, ese, punto, pe, e, ere, e, zeta, arroba, ge, eme, a, i, ele, punto, ce, o, eme. ¿Es correcto así?»
   - Reglas de claridad fonética al deletrear en español: diga «i griega» (o «ye») para «y», «i latina» para «i», «be grande» para «b», «uve» (o «ve corta») para «v», «doble uve» para «w», «hache» para «h», «jota» para «j», «ge» para «g», «zeta» para «z», «equis» para «x», «arroba» para «@», «punto» para «.», «guion» para «-», «guion bajo» para «_».
   - NUNCA escriba la dirección cruda (como «carlos@gmail.com») en sus respuestas habladas; escríbala siempre deletreada en palabras para que el audio la pronuncie letra por letra.
   - Espere confirmación explícita («¿Es correcto así?»). Si la persona corrige alguna letra o dominio, corríjalo de inmediato, vuelva a deletrear todo el correo completo y pida confirmación nuevamente antes de pasar al siguiente paso.

3. TELÉFONO / WHATSAPP Y LECTURA DÍGITO POR DÍGITO OBLIGATORIA:
   - Pida su número de teléfono o WhatsApp, aclarando el código de país (por ejemplo, +593 para Ecuador —si indica un celular ecuatoriano que empieza en 09, aclare que con código de país queda más cinco nueve tres nueve...— o el código del país desde donde nos contacta). Si el sistema muestra el número entrante ({{user_number}}) y no está vacío, puede preguntarle si prefiere registrar ese mismo número u otro distinto, pero SIEMPRE léalo completo dígito por dígito antes de darlo por confirmado.
   - OBLIGATORIO: repita el número completo dígito por dígito en grupos claros con pausas breves, sin juntar dígitos ni escribir guiones. Ejemplo: «Permítame confirmar su número dígito por dígito: más cinco, nueve, tres... nueve, nueve, uno... dos, tres, cuatro... cinco, seis, siete. ¿Está correcto el número?»
   - Espere confirmación explícita. Si corrige algún dígito, léalo completo otra vez dígito por dígito hasta confirmarlo.

4. PERFIL ACADÉMICO Y PREFERENCIAS (una pregunta breve por turno):
   - Programa o área de posgrado de interés (si aún no lo definió, ayúdele a compararlos brevemente).
   - Ciudad de residencia (ej. Guayaquil, Quito, Cuenca u otra ciudad/país).
   - Modalidad preferida (en línea, híbrida o presencial).
   - Horizonte estimado de inicio (ej. próxima cohorte, este mes, en tres meses, próximo año).
   - Título de tercer nivel o formación profesional previa (y si está registrado en SENESCYT o si es del extranjero).
   - Preguntas clave o posibles obstáculos que desee resolver (horarios laborales o tutorías de fin de semana, financiamiento o formas de pago, requisitos de postulación o documentación).

5. CONSENTIMIENTO DE ENVÍO Y CIERRE CÁLIDO:
   - Pida autorización explícita para enviarle el correo de seguimiento: «¿Me autoriza enviarle a su correo confirmado un resumen personalizado de nuestra llamada junto con la ficha oficial del programa?»
   - Si desea conversar con un asesor humano de Admisiones por alguna duda específica de financiamiento o convalidación, confirme si prefiere que un asesor le devuelva la llamada.
   - Si en algún momento la persona solicita no ser contactada nuevamente o darse de baja, respete su decisión con total cortesía y despídase sin insistir.
   - Cierre con calidez ecuatoriana agradeciendo por comunicarse con Posgrados de la Universidad Casa Grande, confirmando que su correo personalizado de resumen y agradecimiento ya va en camino, deseándole un excelente día y finalizando la llamada con la herramienta end_call.

CATÁLOGO OFICIAL VERIFICADO DE POSGRADOS UCG (${catalogPrograms.length} PROGRAMAS):
${catalogBlock}`;
}

function buildPostCallAnalysisData(catalogPrograms) {
  const slugList = catalogPrograms.map((p) => p.slug).join(', ');
  return [
    {
      type: 'string',
      name: 'applicant_name',
      description: 'Nombre completo (nombres y apellidos) proporcionado por el aspirante durante la llamada. Vacío si no lo dio.',
      examples: ['María Fernanda León Cedeño', 'Carlos Andrés Pérez'],
    },
    {
      type: 'string',
      name: 'applicant_email',
      description:
        'Correo electrónico completo en minúsculas proporcionado y confirmado por el aspirante (formato local@dominio.tld, reconstruido correctamente a partir del deletreo). Vacío si no dio correo.',
      examples: ['maria.leon@gmail.com', 'carlos.perez@casagrande.edu.ec'],
    },
    {
      type: 'boolean',
      name: 'email_confirmed_by_spelling',
      description:
        'Verdadero (true) únicamente si el agente deletreó el correo carácter por carácter al aspirante y el aspirante confirmó explícitamente que es correcto; falso (false) en caso contrario.',
    },
    {
      type: 'string',
      name: 'applicant_phone',
      description:
        'Número de teléfono o WhatsApp confirmado por el aspirante, preferiblemente en formato internacional E.164 con código de país (ej. +593991234567). Vacío si no se obtuvo.',
      examples: ['+593991234567', '+17875550199'],
    },
    {
      type: 'boolean',
      name: 'phone_confirmed_by_readback',
      description:
        'Verdadero (true) únicamente si el agente leyó el teléfono dígito por dígito y el aspirante confirmó explícitamente que es correcto; falso (false) en caso contrario.',
    },
    {
      type: 'string',
      name: 'program_slug',
      description: `Slug exacto del catálogo UCG que mejor corresponde a la maestría elegida o consultada principalmente por el aspirante. Debe ser exactamente uno de: ${slugList}. Devuelva cadena vacía "" si solo consultó en general o no eligió un programa específico.`,
      examples: ['maestria-en-ia-y-ciencia-de-datos', 'maestria-en-administracion-de-empresas', ''],
    },
    {
      type: 'string',
      name: 'program_interest',
      description:
        'Nombre legible de la maestría o área académica de posgrado de interés del aspirante (ej. "Maestría en Inteligencia Artificial y Analítica de Datos" o "Área de Negocios").',
      examples: ['Maestría en Inteligencia Artificial y Analítica de Datos', 'Posgrados en Educación'],
    },
    {
      type: 'string',
      name: 'city',
      description: 'Ciudad (y país si aplica) de residencia indicada por el aspirante. Vacío si no se mencionó.',
      examples: ['Guayaquil', 'Quito', 'Cuenca'],
    },
    {
      type: 'string',
      name: 'preferred_modality',
      description: 'Modalidad de estudio preferida por el aspirante (En línea, Híbrida o Presencial). Vacío si no se indicó.',
      examples: ['En línea', 'Híbrida', 'Presencial'],
    },
    {
      type: 'string',
      name: 'start_horizon',
      description:
        'Horizonte temporal o cohorte en que el aspirante desea iniciar sus estudios (ej. "Próxima cohorte", "En tres meses", "Segundo semestre"). Vacío si no se indicó.',
      examples: ['Próxima cohorte', 'En dos meses', '2027'],
    },
    {
      type: 'string',
      name: 'academic_background',
      description:
        'Título de tercer nivel o trayectoria académica/profesional comentada por el aspirante. Vacío si no la indicó.',
      examples: ['Ingeniero en Sistemas con 4 años de experiencia', 'Licenciada en Ciencias de la Educación'],
    },
    {
      type: 'string',
      name: 'key_questions',
      description:
        'Resumen breve en español de las preguntas principales que realizó el aspirante durante la llamada (inversión, malla, horarios, requisitos, etc.).',
      examples: ['Consultó por la inversión, horarios de tutorías y fecha de próxima cohorte.'],
    },
    {
      type: 'string',
      name: 'obstacles',
      description:
        'Obstáculos o inquietudes expresadas por el aspirante (ej. compatibilidad de horario laboral, financiamiento, documentos pendientes, o "Ninguno").',
      examples: ['Disponibilidad entre semana por horario laboral', 'Opciones de financiamiento', 'Ninguno'],
    },
    {
      type: 'string',
      name: 'call_summary_es',
      description:
        'Resumen conciso y natural en español ecuatoriano (2 a 4 oraciones) de lo conversado en la llamada: interés académico, perfil del aspirante, verificaciones realizadas y siguientes pasos acordados.',
      examples: [
        'El aspirante consultó desde Guayaquil por la Maestría en Inteligencia Artificial y Analítica de Datos en modalidad en línea. Confirmó su correo y número por deletreo y lectura dígito a dígito, y autorizó el envío de la ficha oficial y el resumen por correo.',
      ],
    },
    {
      type: 'boolean',
      name: 'consent_email',
      description:
        'Verdadero (true) si el aspirante dio su consentimiento expreso para recibir el correo electrónico de resumen y seguimiento; falso (false) si lo rechazó o no dio autorización.',
    },
    {
      type: 'boolean',
      name: 'human_callback',
      description:
        'Verdadero (true) si el aspirante solicitó expresamente que un asesor humano de Admisiones le llame o contacte para revisar detalles adicionales; falso (false) en caso contrario.',
    },
    {
      type: 'boolean',
      name: 'opt_out',
      description:
        'Verdadero (true) únicamente si el aspirante solicitó darse de baja o pidió expresamente no volver a ser contactado; falso (false) en caso contrario.',
    },
  ];
}

async function retellRequest(apiKey, path, { method = 'GET', body } = {}) {
  const url = `${RETELL_API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    const err = new Error(`Retell API ${method} ${path} falló (${response.status}): ${detail}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function listAllAgents(apiKey) {
  const agents = [];
  let paginationKey;
  for (let page = 0; page < 10; page++) {
    const body = paginationKey ? { pagination_key: paginationKey, limit: 100 } : { limit: 100 };
    const res = await retellRequest(apiKey, '/v2/list-agents', { method: 'POST', body });
    const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    agents.push(...items);
    if (!res?.has_more || !items.length) break;
    paginationKey = items[items.length - 1]?.agent_id;
    if (!paginationKey) break;
  }
  return agents;
}

async function listPhoneNumbers(apiKey) {
  const res = await retellRequest(apiKey, '/v2/list-phone-numbers', { method: 'POST', body: {} });
  return Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
}

async function upsertLlm(apiKey, existingLlmId, payload) {
  if (existingLlmId) {
    try {
      return await retellRequest(apiKey, `/update-retell-llm/${encodeURIComponent(existingLlmId)}`, {
        method: 'PATCH',
        body: payload,
      });
    } catch (error) {
      if (error?.status === 400 && /published/i.test(error.message)) {
        return retellRequest(apiKey, '/create-retell-llm', {
          method: 'POST',
          body: payload,
        });
      }
      throw error;
    }
  }
  return retellRequest(apiKey, '/create-retell-llm', {
    method: 'POST',
    body: payload,
  });
}

async function upsertAgent(apiKey, existingAgentId, payload) {
  if (existingAgentId) {
    return retellRequest(apiKey, `/update-agent/${encodeURIComponent(existingAgentId)}`, {
      method: 'PATCH',
      body: payload,
    });
  }
  return retellRequest(apiKey, '/create-agent', {
    method: 'POST',
    body: payload,
  });
}

async function ensureUcgPhoneNumber(apiKey, agentId, opts) {
  const existingPhones = await listPhoneNumbers(apiKey);
  const candidates = existingPhones.filter((p) => !PROTECTED_NUMBERS.has(p.phone_number));

  let targetPhone = null;
  if (opts.phone) {
    targetPhone = candidates.find((p) => p.phone_number === opts.phone) || null;
    if (!targetPhone) {
      throw new Error(`El número indicado (${opts.phone}) no existe entre los números disponibles de Retell.`);
    }
  } else {
    targetPhone =
      candidates.find((p) => p.nickname === PHONE_NICKNAME) ||
      candidates.find((p) => Array.isArray(p.inbound_agents) && p.inbound_agents.some((a) => a.agent_id === agentId)) ||
      null;
  }

  if (targetPhone) {
    const updated = await retellRequest(apiKey, `/update-phone-number/${encodeURIComponent(targetPhone.phone_number)}`, {
      method: 'PATCH',
      body: {
        inbound_agents: [{ agent_id: agentId, weight: 1 }],
        inbound_webhook_url: null,
        nickname: PHONE_NICKNAME,
      },
    });
    return { action: 'updated', phone: updated };
  }

  const createPayload = {
    inbound_agents: [{ agent_id: agentId, weight: 1 }],
    nickname: PHONE_NICKNAME,
  };
  if (opts.areaCode !== null) createPayload.area_code = opts.areaCode;
  if (opts.countryCode) createPayload.country_code = opts.countryCode;
  if (opts.numberProvider) createPayload.number_provider = opts.numberProvider;

  const created = await retellRequest(apiKey, '/create-phone-number', {
    method: 'POST',
    body: createPayload,
  });
  return { action: 'purchased', phone: created };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Uso: RETELL_API_KEY=... node scripts/configure-retell.mjs [opciones]

Opciones:
  --webhook-url <url>     URL pública HTTPS para eventos webhook (ej. https://.../api/webhooks/retell)
  --catalog-url <url>     URL pública HTTPS para consultar_catalogo_ucg (por defecto deriva de --webhook-url o usa Railway)
  --clear-webhook         Limpia webhook_url del agente (deja null)
  --phone <e164>          Número UCG existente a actualizar (si se omite, reutiliza el UCG existente o compra uno nuevo)
  --area-code <3dig>      Código de área opcional (ej. 305) al comprar un número nuevo en Retell
  --country-code <iso>    Código de país opcional al comprar un número nuevo (ej. US)
  --number-provider <p>   Proveedor telefónico opcional (ej. twilio o telnyx)
  --model <modelo>        Modelo LLM en Retell (por defecto: ${DEFAULT_LLM_MODEL})
  --skip-phone            Omite la compra o enlace del número telefónico
  --dry-run               Muestra métricas del catálogo y prompt sin llamar a Retell AI`);
    return;
  }

  const generalPrompt = buildGeneralPrompt(programs, brand);
  const postCallAnalysisData = buildPostCallAnalysisData(programs);
  const llmPayload = {
    model: opts.model,
    general_prompt: generalPrompt,
    begin_message: BEGIN_MESSAGE,
    start_speaker: 'agent',
    general_tools: [
      {
        type: 'custom',
        name: 'consultar_catalogo_ucg',
        description:
          'Consulta información verificada y detallada de cualquier maestría de la Universidad Casa Grande: inversión exacta, horario y tutorías, malla curricular completa por períodos, resolución CES, doble titulación, requisitos de ingreso y financiamiento.',
        url: opts.catalogLookupUrl,
        speak_during_execution: true,
        execution_message_type: 'static_text',
        execution_message_description:
          'Permítame verificar ese dato exacto en el catálogo oficial de Posgrados...',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Nombre, tema o palabra clave de la maestría o área académica',
            },
            slug: {
              type: 'string',
              description: 'Slug exacto si se conoce',
            },
            area: {
              type: 'string',
              description:
                'Área de estudio opcional (Negocios, Tecnología, Derecho, Educación, Comunicación, Salud, Arquitectura)',
            },
          },
        },
        speak_after_execution: true,
      },
      {
        type: 'end_call',
        name: 'end_call',
        description:
          'Finalizar la llamada cortésmente cuando se hayan respondido las consultas, verificado o registrado los datos y cerrado la despedida.',
        speak_after_execution: true,
      },
    ],
  };

  if (opts.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          agentName: AGENT_NAME,
          programsCompiled: programs.length,
          promptChars: generalPrompt.length,
          postCallFields: postCallAnalysisData.map((f) => `${f.name}:${f.type}`),
          tools: llmPayload.general_tools.map((t) => ({ name: t.name, type: t.type, url: t.url || null })),
          voiceId: VOICE_ID,
          voiceModel: VOICE_MODEL,
          language: LANGUAGE,
          llmModel: opts.model,
          webhookUrl: opts.webhookUrl || null,
          catalogLookupUrl: opts.catalogLookupUrl,
          phone: opts.skipPhone ? null : opts.phone || '(auto: reuse UCG number or purchase new via /create-phone-number)',
          protectedNumbers: [...PROTECTED_NUMBERS],
        },
        null,
        2,
      ),
    );
    return;
  }

  const apiKey = process.env.RETELL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Falta RETELL_API_KEY en las variables de entorno.');
  }

  const existingAgents = await listAllAgents(apiKey);
  const matchedAgent = existingAgents.find((agent) => agent.agent_name === AGENT_NAME);

  let existingAgentDetails = null;
  let existingLlmId = null;
  if (matchedAgent?.agent_id) {
    existingAgentDetails = await retellRequest(apiKey, `/get-agent/${encodeURIComponent(matchedAgent.agent_id)}`);
    if (existingAgentDetails?.response_engine?.type === 'retell-llm') {
      existingLlmId = existingAgentDetails.response_engine.llm_id || null;
    }
  }

  const llm = await upsertLlm(apiKey, existingLlmId, llmPayload);
  const llmId = llm.llm_id || existingLlmId;

  const agentPayload = {
    agent_name: AGENT_NAME,
    response_engine: {
      type: 'retell-llm',
      llm_id: llmId,
    },
    voice_id: VOICE_ID,
    voice_model: VOICE_MODEL,
    language: LANGUAGE,
    voice_temperature: 0.9,
    voice_speed: 1,
    responsiveness: 0.95,
    interruption_sensitivity: 0.9,
    enable_backchannel: false,
    stt_mode: 'accurate',
    boosted_keywords: BOOSTED_KEYWORDS,
    max_call_duration_ms: 900000,
    data_storage_setting: 'everything',
    post_call_analysis_data: postCallAnalysisData,
  };

  if (opts.webhookUrl) {
    agentPayload.webhook_url = opts.webhookUrl;
    agentPayload.webhook_events = WEBHOOK_EVENTS;
  } else if (opts.clearWebhook) {
    agentPayload.webhook_url = null;
  }

  const agent = await upsertAgent(apiKey, matchedAgent?.agent_id || null, agentPayload);
  const agentId = agent.agent_id;

  // Publish the agent version so inbound phone traffic serves the latest configuration.
  try {
    await retellRequest(apiKey, `/publish-agent-version/${encodeURIComponent(agentId)}`, {
      method: 'POST',
      body: { version: agent.version ?? 0 },
    });
  } catch (publishErr) {
    console.warn(`Aviso al publicar agente ${agentId}: ${publishErr.message}`);
  }

  let phoneOutcome = null;
  if (!opts.skipPhone) {
    phoneOutcome = await ensureUcgPhoneNumber(apiKey, agentId, opts);
  }

  const verifiedAgent = await retellRequest(apiKey, `/get-agent/${encodeURIComponent(agentId)}`);
  const verifiedPhones = await listPhoneNumbers(apiKey);
  const targetPhoneNumber = phoneOutcome?.phone?.phone_number || opts.phone || null;
  const verifiedPhone = targetPhoneNumber
    ? verifiedPhones.find((p) => p.phone_number === targetPhoneNumber) || phoneOutcome?.phone
    : null;

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        action: matchedAgent ? 'updated' : 'created',
        programsCompiled: programs.length,
        llm_id: llmId,
        llm_model: llm.model || opts.model,
        llm_tools: (llm.general_tools || llmPayload.general_tools).map((t) => t.name),
        agent_id: agentId,
        agent_name: verifiedAgent.agent_name,
        version: verifiedAgent.version,
        is_published: verifiedAgent.is_published,
        voice_id: verifiedAgent.voice_id,
        voice_model: verifiedAgent.voice_model,
        language: verifiedAgent.language,
        webhook_url: verifiedAgent.webhook_url || null,
        webhook_events: verifiedAgent.webhook_events || null,
        post_call_analysis_fields: (verifiedAgent.post_call_analysis_data || []).map((f) => f.name),
        phone_action: phoneOutcome?.action || null,
        phone_binding: verifiedPhone
          ? {
              phone_number: verifiedPhone.phone_number,
              nickname: verifiedPhone.nickname,
              inbound_agents: verifiedPhone.inbound_agents,
              inbound_webhook_url: verifiedPhone.inbound_webhook_url,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Error configurando Retell AI:', error.message);
  process.exit(1);
});
