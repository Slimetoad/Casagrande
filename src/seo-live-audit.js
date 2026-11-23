import { brand, programs } from './catalog.js';
import { activeAI, aiText, clean, normalized, redact } from './providers.js';

const MAX_HTML_BYTES = 512 * 1024;
const CRAWL_TIMEOUT_MS = 10000;
const CRAWL_CONCURRENCY = 3;
const MAX_BATCH_URLS = 12;

export const DEFAULT_LIVE_TARGETS = [
  {
    url: 'https://www.casagrande.edu.ec/posgrados',
    label: 'Hub Posgrados Oficial (UCG)',
    role: 'hub',
    programSlug: null,
  },
  {
    url: 'https://posgrados.casagrande.edu.ec/maestrias',
    label: 'Portal Maestrías Flexibles (21 programas)',
    role: 'flexible-hub',
    programSlug: null,
  },
  {
    url: 'https://www.casagrande.edu.ec/posgrado/maestria-en-administracion-de-empresas',
    label: 'MBA · Administración de Empresas',
    role: 'program',
    programSlug: 'maestria-en-administracion-de-empresas',
  },
  {
    url: 'https://www.casagrande.edu.ec/posgrado/maestria-en-ia-y-ciencia-de-datos',
    label: 'IA y Ciencia de Datos',
    role: 'program',
    programSlug: 'maestria-en-ia-y-ciencia-de-datos',
  },
  {
    url: 'https://www.casagrande.edu.ec/posgrado/maestria-en-ciberseguridad',
    label: 'Maestría en Ciberseguridad',
    role: 'program',
    programSlug: 'maestria-en-ciberseguridad',
  },
  {
    url: 'https://www.casagrande.edu.ec/posgrado/maestria-en-derecho-digital',
    label: 'Maestría en Derecho Digital',
    role: 'program',
    programSlug: 'maestria-en-derecho-digital',
  },
  {
    url: 'https://www.casagrande.edu.ec/posgrado/maestria-en-marketing-estrategico',
    label: 'Maestría en Marketing Estratégico',
    role: 'program',
    programSlug: 'maestria-en-marketing-estrategico',
  },
  {
    url: 'https://www.casagrande.edu.ec/posgrado/maestria-en-comunicacion',
    label: 'Maestría en Comunicación',
    role: 'program',
    programSlug: 'maestria-en-comunicacion',
  },
];

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || !host.includes('.')) {
    return true;
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a >= 224) return true;
  }
  if (host === '::1' || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host)) {
    return true;
  }
  return false;
}

export function isSafePublicUrl(raw) {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return false;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (isPrivateOrLocalHostname(parsed.hostname)) return false;
  return true;
}

export function normalizePublicUrl(raw) {
  if (!isSafePublicUrl(raw)) return '';
  const parsed = new URL(raw.trim());
  parsed.hash = '';
  let href = parsed.href;
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/') && !parsed.search) {
    href = parsed.origin + parsed.pathname.replace(/\/+$/, '');
  }
  return href;
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(htmlFragment) {
  return decodeHtmlEntities(String(htmlFragment || '').replace(/<[^>]+>/g, ' '));
}

function readTagAttr(tagHtml, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tagHtml.match(re);
  return m ? decodeHtmlEntities(m[1] ?? m[2] ?? m[3] ?? '') : '';
}

function extractMeta(html, attrKey, attrVal) {
  const target = attrVal.toLowerCase();
  const metas = html.matchAll(/<meta\b[^>]*>/gi);
  for (const m of metas) {
    const tag = m[0];
    const k = readTagAttr(tag, attrKey).toLowerCase();
    if (k === target) {
      return readTagAttr(tag, 'content');
    }
  }
  return '';
}

function extractCanonical(html) {
  const links = html.matchAll(/<link\b[^>]*>/gi);
  for (const m of links) {
    const tag = m[0];
    const rel = readTagAttr(tag, 'rel').toLowerCase().split(/\s+/);
    if (rel.includes('canonical')) {
      return readTagAttr(tag, 'href');
    }
  }
  return '';
}

function collectJsonLdNodes(node, schemaTypes, schemaPhones) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdNodes(item, schemaTypes, schemaPhones);
    return;
  }
  if (typeof node['@type'] === 'string') {
    schemaTypes.add(node['@type']);
  } else if (Array.isArray(node['@type'])) {
    for (const t of node['@type']) {
      if (typeof t === 'string') schemaTypes.add(t);
    }
  }
  if (typeof node.telephone === 'string' && node.telephone.trim()) {
    schemaPhones.add(node.telephone.trim());
  }
  if (Array.isArray(node['@graph'])) {
    collectJsonLdNodes(node['@graph'], schemaTypes, schemaPhones);
  }
  if (Array.isArray(node.contactPoint)) {
    collectJsonLdNodes(node.contactPoint, schemaTypes, schemaPhones);
  } else if (node.contactPoint && typeof node.contactPoint === 'object') {
    collectJsonLdNodes(node.contactPoint, schemaTypes, schemaPhones);
  }
}

function inferProgramSlugFromUrl(url) {
  const match = catalogMatchByUrl(url);
  if (match) return match.slug;
  return null;
}

function catalogMatchByUrl(url) {
  const cleanUrl = String(url || '').replace(/\/+$/, '').toLowerCase();
  return (
    programs.find((p) => String(p.url || '').replace(/\/+$/, '').toLowerCase() === cleanUrl) ||
    programs.find((p) => cleanUrl.includes('/' + p.slug)) ||
    null
  );
}

/**
 * Extracts technical, content, structured-data, and conversion signals from
 * an HTML document and computes a 0–100 audit score with prioritized issues.
 */
export function analyzeHtmlDocument(url, html, meta = {}) {
  const sourceHtml = String(html || '');
  const statusCode = Number.isFinite(meta.statusCode) ? meta.statusCode : 200;
  const responseMs = Number.isFinite(meta.responseMs) ? meta.responseMs : 0;
  const role = meta.role || (/\/posgrado\/|\/programas\//i.test(url) ? 'program' : /maestrias/i.test(url) ? 'flexible-hub' : 'hub');

  const titleMatch = sourceHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';
  const titleLength = title.length;

  const metaDescription = extractMeta(sourceHtml, 'name', 'description');
  const metaDescLength = metaDescription.length;
  const metaRobots = extractMeta(sourceHtml, 'name', 'robots');
  const noindex = /\bnoindex\b/i.test(metaRobots);
  const canonical = extractCanonical(sourceHtml);

  const ogTitle = extractMeta(sourceHtml, 'property', 'og:title');
  const ogDescription = extractMeta(sourceHtml, 'property', 'og:description');
  const ogImage = extractMeta(sourceHtml, 'property', 'og:image');

  const h1Texts = [...sourceHtml.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean);
  const h2Texts = [...sourceHtml.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean);
  const h3Count = (sourceHtml.match(/<h3\b/gi) || []).length;

  const visibleText = stripTags(
    sourceHtml
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' '),
  );
  const wordCount = visibleText ? visibleText.split(/\s+/).filter(Boolean).length : 0;

  const imgMatches = [...sourceHtml.matchAll(/<img\b[^>]*>/gi)];
  const imgTotal = imgMatches.length;
  const imgMissingAlt = imgMatches.filter((m) => {
    const alt = readTagAttr(m[0], 'alt');
    return !alt;
  }).length;
  const altCoveragePct = imgTotal ? Math.round(((imgTotal - imgMissingAlt) / imgTotal) * 100) : 100;

  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch { /* ignore */ }
  const selfNormalized = String(url || '').replace(/\/+$/, '');
  const hrefMatches = [...sourceHtml.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)];
  const programLinkSet = new Set();
  for (const m of hrefMatches) {
    const rawHref = (m[1] || m[2] || '').trim();
    if (!rawHref || rawHref.startsWith('#') || /login|mailto:|tel:|javascript:/i.test(rawHref)) continue;
    let absHref = rawHref;
    if (origin && rawHref.startsWith('/')) absHref = origin + rawHref;
    const normHref = absHref.replace(/\/+$/, '');
    if (normHref === selfNormalized) continue;
    if (/\/posgrado\/|\/programas\/|maestria-[a-z0-9-]+|\?action=vermaestria/i.test(normHref)) {
      programLinkSet.add(normHref);
    }
  }
  const internalPosgradoLinks = programLinkSet.size;
  const samplePosgradoLinks = [...programLinkSet].slice(0, 6);

  const schemaTypesSet = new Set();
  const schemaPhonesSet = new Set();
  for (const m of sourceHtml.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]);
      collectJsonLdNodes(parsed, schemaTypesSet, schemaPhonesSet);
    } catch { /* malformed JSON-LD should not abort audit */ }
  }
  const schemaTypes = [...schemaTypesSet];
  const schemaPhones = [...schemaPhonesSet];

  const hasNextData = /<script\b[^>]*id=["']__NEXT_DATA__["']/i.test(sourceHtml);
  const hasOpaqueQueryUrl = /\?(?:[^#]*&)?(?:action|id)=/i.test(url);
  const normVisible = normalized(visibleText);
  const hasPricingSignal =
    /(?:\$\s*\d{3,}|usd\s*\d{3,}|\barancel|\bfinanciamiento\b|\binversion\b|\bvalor de la maestria\b)/i.test(normVisible);
  const hasFaqSignal =
    schemaTypes.some((t) => /faqpage/i.test(t)) ||
    /preguntas frecuentes|\bfaq\b/i.test(normVisible);
  const hasCtaSignal =
    /(?:solicitar|inscrib|postul|admision|contactar|whatsapp|agendar)/i.test(normVisible);

  const issues = [];
  const pushIssue = (severity, code, issueTitle, evidence, action) => {
    issues.push({ severity, code, title: issueTitle, evidence, action });
  };

  // Weighted 100-point rubric
  let score = 0;

  // 1. HTTP & Indexability (15 pts)
  if (statusCode >= 400 || statusCode === 0) {
    pushIssue(
      'critical',
      'HTTP_ERROR',
      `Página devuelve estado HTTP ${statusCode || 'sin respuesta'}`,
      `La URL respondió con HTTP ${statusCode} en ${responseMs} ms.`,
      'Corregir redirección 301 hacia la ficha activa o eliminar URL rota del sitemap.',
    );
  } else if (noindex) {
    score += 5;
    pushIssue(
      'critical',
      'NOINDEX_BLOCKED',
      'Etiqueta meta robots bloquea indexación (noindex)',
      `Meta robots detectado: "${metaRobots}".`,
      'Remover noindex de páginas comerciales de posgrados para habilitar captura orgánica en Google.',
    );
  } else {
    score += 15;
  }

  // 2. Title & Meta Description (15 pts)
  let metaPts = 0;
  if (titleLength === 0) {
    pushIssue(
      'high',
      'MISSING_TITLE',
      'Etiqueta <title> ausente',
      'La página no expone un <title> en HTML SSR.',
      'Definir un <title> único (50–65 caracteres) con el nombre de la maestría y "Universidad Casa Grande".',
    );
  } else if (titleLength >= 25 && titleLength <= 65) {
    metaPts += 7;
  } else if (titleLength > 65) {
    metaPts += 4;
    pushIssue(
      'medium',
      'TITLE_TOO_LONG',
      `<title> demasiado largo (${titleLength} caracteres)`,
      `Título actual: "${clean(title, 95)}". Google suele truncar después de ~60–65 caracteres.`,
      'Acortar a 50–62 caracteres priorizando la palabra clave principal de búsqueda en Ecuador al inicio.',
    );
  } else {
    metaPts += 4;
    pushIssue(
      'medium',
      'TITLE_TOO_SHORT',
      `<title> demasiado corto (${titleLength} caracteres)`,
      `Título actual: "${title}".`,
      'Enriquecer el título con modalidad, "Guayaquil / Ecuador" y "Universidad Casa Grande".',
    );
  }

  const hasMetaTypo = /\bLa maestr[ií]as\b/i.test(metaDescription);
  if (metaDescLength === 0) {
    pushIssue(
      'high',
      'MISSING_META_DESC',
      'Meta description ausente en SSR',
      'No existe <meta name="description"> visible para los buscadores.',
      'Redactar una meta description persuasiva (135–160 caracteres) con modalidad, duración y llamado a la acción.',
    );
  } else if (metaDescLength >= 110 && metaDescLength <= 170 && !hasMetaTypo) {
    metaPts += 8;
  } else {
    metaPts += 3;
    if (metaDescLength > 170) {
      pushIssue(
        'medium',
        'META_DESC_TOO_LONG',
        `Meta description excede el límite recomendado (${metaDescLength} caracteres)${hasMetaTypo ? ' + error tipográfico' : ''}`,
        hasMetaTypo
          ? `Contiene ${metaDescLength} caracteres (ideal 140–160) e inicia con "La maestrías" en lugar de "Las maestrías".`
          : `Contiene ${metaDescLength} caracteres; Google recorta el extracto en SERPs tras ~160 caracteres.`,
        'Reescribir en 145–160 caracteres exactos corrigiendo redacción y agregando beneficio clave.',
      );
    } else {
      pushIssue(
        'medium',
        'META_DESC_SUBOPTIMAL',
        `Meta description corta (${metaDescLength} caracteres)`,
        `Descripción actual: "${clean(metaDescription, 140)}".`,
        'Ampliar a 140–160 caracteres con palabras clave de posgrado en Ecuador.',
      );
    }
  }
  score += metaPts;

  // 3. Headings & SSR Content Structure (15 pts)
  let headingPts = 0;
  if (h1Texts.length === 1) {
    headingPts += 8;
  } else if (h1Texts.length === 0) {
    pushIssue(
      'high',
      'MISSING_H1',
      'Falta encabezado principal <h1> en HTML SSR',
      `El HTML renderizado contiene 0 etiquetas <h1> (${wordCount} palabras visibles).`,
      'Renderizar un único <h1> semántico en SSR con la intención de búsqueda principal de la página.',
    );
  } else {
    headingPts += 5;
    pushIssue(
      'medium',
      'MULTIPLE_H1',
      `Múltiples etiquetas <h1> detectadas (${h1Texts.length})`,
      `Encabezados encontrados: ${h1Texts.slice(0, 3).join(' | ')}.`,
      'Consolidar a un solo <h1> principal y degradar los demás a <h2>.',
    );
  }

  if (h2Texts.length >= 2) {
    headingPts += 7;
  } else if (h2Texts.length === 1) {
    headingPts += 3;
    pushIssue(
      'medium',
      'SHALLOW_H2_STRUCTURE',
      'Solo 1 subtítulo <h2> en la página',
      `Único H2: "${h2Texts[0]}".`,
      'Agregar bloques <h2> orientados a búsqueda: Malla curricular, Inversión y financiamiento, Requisitos y Campo laboral.',
    );
  } else {
    pushIssue(
      'high',
      'NO_H2_STRUCTURE',
      'Sin estructura de subtítulos <h2> en HTML inicial',
      `Se detectaron 0 etiquetas <h2> (H3: ${h3Count}). Esto limita la indexación por secciones y fragmentos destacados.`,
      'Agregar subtítulos <h2> ricos en intención de búsqueda (áreas, modalidad, admisión y preguntas frecuentes).',
    );
  }
  score += headingPts;

  // 4. Structured Data JSON-LD (15 pts)
  const hasCourseOrCollectionSchema = schemaTypes.some((t) =>
    /course|educationaloccupationalprogram|itemlist|collectionpage/i.test(t),
  );
  if (!schemaTypes.length) {
    pushIssue(
      'high',
      'MISSING_JSONLD',
      'Sin datos estructurados Schema.org (JSON-LD)',
      '0 bloques application/ld+json encontrados en el documento.',
      role === 'program'
        ? 'Inyectar JSON-LD EducationalOccupationalProgram / Course + Offer + FAQPage.'
        : 'Inyectar JSON-LD ItemList / CollectionPage listando los 34 programas con enlaces directos.',
    );
  } else if (hasCourseOrCollectionSchema) {
    score += 15;
  } else {
    score += 6;
    pushIssue(
      'high',
      'MISSING_COURSE_SCHEMA',
      'Falta Schema de programa educativo (Course / EducationalOccupationalProgram / ItemList)',
      `Solo declara: ${schemaTypes.join(', ')}. No expone ofertas académicas estructuradas para Google Rich Results.`,
      role === 'program'
        ? 'Agregar JSON-LD Course / EducationalOccupationalProgram con modalidad, duración, título y oferta.'
        : 'Agregar JSON-LD ItemList con URLs indexables de las maestrías activas y FAQPage.',
    );
  }

  const admissionsDigits = String(brand.admissionsPhone || '').replace(/\D/g, '');
  const mismatchedPhone = schemaPhones.find((p) => {
    const digits = p.replace(/\D/g, '');
    return digits && admissionsDigits && digits !== admissionsDigits;
  });
  if (mismatchedPhone) {
    pushIssue(
      'medium',
      'SCHEMA_CONTACT_MISMATCH',
      'Teléfono desactualizado o inconsistente en JSON-LD',
      `El Schema declara "${mismatchedPhone}" mientras el portal de Admisiones usa "${brand.admissionsPhone}".`,
      `Unificar el JSON-LD EducationalOrganization con "${brand.admissionsPhone}" y añadir el canal de posgrados.`,
    );
  }

  // 5. Canonical & Clean URLs (10 pts)
  let canonicalPts = 0;
  if (canonical) {
    canonicalPts += 6;
  } else {
    pushIssue(
      'high',
      'MISSING_CANONICAL',
      'Etiqueta <link rel="canonical"> ausente',
      'Sin URL canónica explícita, Google puede indexar duplicados con parámetros de consulta.',
      'Agregar <link rel="canonical" href="..."> apuntando a URL limpia y amigable.',
    );
  }
  if (!hasOpaqueQueryUrl) {
    canonicalPts += 4;
  } else {
    pushIssue(
      'high',
      'OPAQUE_QUERY_URLS',
      'URL con parámetros opacos (?action=...&id=...) poco amigable para SEO',
      `URL actual: ${clean(url, 120)}.`,
      'Publicar rutas limpias por slug (/programas/{slug}/) con redirección o canonical claro para posgrados flexibles.',
    );
  }
  score += canonicalPts;

  // 6. Internal SSR Program Links & Discovery (10 pts)
  const isHubRole = role === 'hub' || role === 'flexible-hub';
  if (isHubRole) {
    if (internalPosgradoLinks >= 8) {
      score += 10;
    } else if (internalPosgradoLinks >= 3) {
      score += 5;
    } else {
      pushIssue(
        'critical',
        'SSR_NO_PROGRAM_LINKS',
        'El hub HTML no expone enlaces SSR (<a href>) hacia las fichas de maestrías',
        hasNextData
          ? `Página Next.js con __NEXT_DATA__ mínimo (0 bloques <h2> y solo ${internalPosgradoLinks} enlace(s) de posgrado en SSR). Los crawlers sin ejecución JS completa pierden la arquitectura interna.`
          : `Solo ${internalPosgradoLinks} enlace(s) rastreables a fichas de maestría en el HTML inicial.`,
        'Renderizar en servidor una grilla de enlaces <a> directos a los 34 programas por área académica para transferir PageRank e indexar todo el catálogo.',
      );
    }
  } else {
    if (internalPosgradoLinks >= 3 && wordCount >= 180) score += 10;
    else if (internalPosgradoLinks >= 1 && wordCount >= 80) score += 7;
    else score += 4;
  }

  // 7. OpenGraph & Image Alt Coverage (10 pts)
  let mediaPts = 0;
  if (ogTitle && ogDescription) {
    mediaPts += 5;
  } else {
    mediaPts += ogTitle || ogDescription ? 2 : 0;
    pushIssue(
      'medium',
      'MISSING_OG_TAGS',
      'Etiquetas OpenGraph incompletas para compartir en redes/WhatsApp',
      `og:title=${Boolean(ogTitle)}, og:description=${Boolean(ogDescription)}, og:image=${Boolean(ogImage)}.`,
      'Completar og:title, og:description y og:image para maximizar CTR al compartir desde CRM y WhatsApp.',
    );
  }
  if (imgTotal === 0 || altCoveragePct >= 80) {
    mediaPts += 5;
  } else {
    mediaPts += 2;
    pushIssue(
      altCoveragePct < 55 ? 'high' : 'medium',
      'MISSING_IMAGE_ALT',
      `${imgMissingAlt} de ${imgTotal} imágenes sin atributo alt descriptivo (${altCoveragePct}% cobertura)`,
      'Imágenes sin alt reducen accesibilidad y posicionamiento en Google Imágenes.',
      'Agregar alt descriptivos con el nombre del programa y campus Universidad Casa Grande.',
    );
  }
  score += mediaPts;

  // 8. Conversion, Pricing Transparency & FAQ Signals (10 pts)
  let convPts = 0;
  if (hasCtaSignal) convPts += 4;
  if (hasPricingSignal) {
    convPts += 3;
  } else {
    pushIssue(
      'medium',
      'NO_TRANSPARENT_PRICING',
      'Sin información de inversión en USD o financiamiento visible en HTML SSR',
      'Los aspirantes en Ecuador buscan "precio", "costo" y "cuotas"; ocultar esta señal reduce intención comercial.',
      'Mostrar arancel USD (cuando esté publicado) o enlace directo al Simulador de Inversión (#herramientas) y financiamiento UCG 18 meses.',
    );
  }
  if (hasFaqSignal) {
    convPts += 3;
  } else {
    pushIssue(
      'medium',
      'NO_FAQ_STRUCTURE',
      'Sin sección de Preguntas Frecuentes (FAQ) indexable',
      'No se detectan señales de FAQ en contenido ni JSON-LD FAQPage.',
      'Incluir 4–6 preguntas frecuentes (requisitos SENESCYT, horarios de tutorías, complexivo vs tesis, financiamiento) para capturar People Also Ask.',
    );
  }
  score += convPts;

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    url,
    role,
    programSlug: meta.programSlug || inferProgramSlugFromUrl(url),
    statusCode,
    responseMs,
    score,
    title,
    titleLength,
    metaDescription,
    metaDescLength,
    canonical,
    metaRobots,
    noindex,
    h1Count: h1Texts.length,
    h1Texts: h1Texts.slice(0, 4),
    h2Count: h2Texts.length,
    h2Texts: h2Texts.slice(0, 8),
    h3Count,
    wordCount,
    ogTitle,
    ogDescription,
    ogImage,
    imgTotal,
    imgMissingAlt,
    altCoveragePct,
    internalPosgradoLinks,
    samplePosgradoLinks,
    schemaTypes,
    schemaPhones,
    hasNextData,
    hasOpaqueQueryUrl,
    hasPricingSignal,
    hasFaqSignal,
    hasCtaSignal,
    issues,
  };
}

async function fetchCappedText(url, fetchImpl, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const response = await fetchImpl(url, {
      method: options.method || 'GET',
      redirect: options.redirect || 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'UCG-Posgrados-SEO-Auditor/1.0 (+https://casagrande-posgrados-production.up.railway.app)',
        Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
      },
    });
    const finalUrl = response.url || url;
    if (options.redirect !== 'manual' && finalUrl && !isSafePublicUrl(finalUrl)) {
      throw new Error('La redirección apunta a un destino no permitido.');
    }
    if (options.method === 'HEAD') {
      return { status: response.status, responseMs: Date.now() - t0, finalUrl, text: '' };
    }
    const reader = response.body?.getReader();
    let text = '';
    if (reader) {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        text += decoder.decode(value, { stream: true });
        if (received >= MAX_HTML_BYTES) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
      text += decoder.decode();
    } else {
      text = (await response.text()).slice(0, MAX_HTML_BYTES);
    }
    return { status: response.status, responseMs: Date.now() - t0, finalUrl, text };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}

/**
 * Reads `/robots.txt` and `/sitemap.xml` (following first child sitemapindex),
 * discovers posgrado URLs, and probes up to 6 URLs for live HTTP status codes.
 */
export async function inspectOriginSitemap(origin, fetchImpl = fetch) {
  const safeOrigin = normalizePublicUrl(origin);
  if (!safeOrigin) return null;
  const originRoot = new URL(safeOrigin).origin;
  const checkedAt = new Date().toISOString();

  let robotsTxtOk = false;
  let declaredSitemap = `${originRoot}/sitemap.xml`;
  try {
    const robotsRes = await fetchCappedText(`${originRoot}/robots.txt`, fetchImpl);
    robotsTxtOk = robotsRes.status >= 200 && robotsRes.status < 300;
    const smMatch = robotsRes.text.match(/^\s*Sitemap:\s*(https:\/\/[^\s]+)/im);
    if (smMatch && isSafePublicUrl(smMatch[1]) && new URL(smMatch[1]).origin === originRoot) {
      declaredSitemap = smMatch[1].trim();
    }
  } catch { /* robots optional */ }

  let locs = [];
  let activeSitemapUrl = declaredSitemap;
  try {
    const smRes = await fetchCappedText(declaredSitemap, fetchImpl);
    if (smRes.status >= 200 && smRes.status < 300) {
      if (/<sitemapindex\b/i.test(smRes.text)) {
        const childMatch = smRes.text.match(/<loc>\s*(https:\/\/[^<\s]+)\s*<\/loc>/i);
        if (childMatch && isSafePublicUrl(childMatch[1]) && new URL(childMatch[1]).origin === originRoot) {
          activeSitemapUrl = childMatch[1].trim();
          const childRes = await fetchCappedText(activeSitemapUrl, fetchImpl);
          if (childRes.status >= 200 && childRes.status < 300) {
            locs = [...childRes.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
          }
        }
      } else {
        locs = [...smRes.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
      }
    }
  } catch { /* sitemap unavailable */ }

  const posgradoUrls = [...new Set(locs)].filter((u) => /posgrado|maestr/i.test(u) && isSafePublicUrl(u));
  // Probe representative discovered URLs (including nested /posgrados/maestria-* paths)
  const prioritizedProbe = [
    ...posgradoUrls.filter((u) => /\/posgrados\/maestria-/i.test(u)).slice(0, 4),
    ...posgradoUrls.filter((u) => !/\/posgrados\/maestria-/i.test(u)).slice(0, 2),
  ].slice(0, 6);

  const sampled = await runPool(prioritizedProbe, CRAWL_CONCURRENCY, async (probeUrl) => {
    try {
      let res = await fetchCappedText(probeUrl, fetchImpl, { method: 'HEAD', redirect: 'manual' });
      if (res.status === 405 || res.status === 501) {
        res = await fetchCappedText(probeUrl, fetchImpl, { method: 'GET', redirect: 'manual' });
      }
      return { url: probeUrl, status: res.status };
    } catch (err) {
      return { url: probeUrl, status: 0, error: clean(err?.message || 'Error de red', 120) };
    }
  });

  const brokenUrls = sampled.filter((s) => s.status >= 400 || s.status === 0);
  const redirectUrls = sampled.filter((s) => s.status >= 300 && s.status < 400);
  const okUrls = sampled.filter((s) => s.status >= 200 && s.status < 300);

  return {
    origin: originRoot,
    robotsTxtOk,
    sitemapUrl: activeSitemapUrl,
    totalSitemapUrls: locs.length,
    posgradoUrlsCount: posgradoUrls.length,
    sampled,
    brokenUrls,
    redirectUrls,
    okUrls,
    checkedAt,
  };
}

export async function ensureLiveAuditTables(db) {
  if (!db) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS seo_live_targets (
    url TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'custom',
    program_slug TEXT,
    added_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS seo_live_audits (
    url TEXT PRIMARY KEY,
    label TEXT,
    role TEXT,
    program_slug TEXT,
    status_code INTEGER,
    response_ms INTEGER,
    score INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    title_length INTEGER,
    meta_description TEXT,
    meta_desc_length INTEGER,
    canonical TEXT,
    h1_count INTEGER,
    h2_count INTEGER,
    word_count INTEGER,
    img_total INTEGER,
    img_missing_alt INTEGER,
    internal_posgrado_links INTEGER,
    schema_types_json TEXT,
    issues_json TEXT,
    metrics_json TEXT,
    sitemap_json TEXT,
    crawled_at TEXT NOT NULL,
    error TEXT
  )`).run();
}

export async function seedDefaultLiveTargets(db) {
  if (!db) return;
  await ensureLiveAuditTables(db);
  const existing = await db.prepare('SELECT COUNT(*) AS n FROM seo_live_targets').first();
  if ((existing?.n || 0) > 0) return;
  const now = new Date().toISOString();
  const stmts = DEFAULT_LIVE_TARGETS.map((t) =>
    db.prepare(
      `INSERT OR IGNORE INTO seo_live_targets(url, label, role, program_slug, added_at, active)
       VALUES(?, ?, ?, ?, ?, 1)`,
    ).bind(t.url, t.label, t.role, t.programSlug || null, now),
  );
  await db.batch(stmts);
}

function safeJsonParse(raw, fallback) {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function buildLiveActionPlan(audits = [], sitemapSummary = null) {
  const cards = [];
  const mainHub = audits.find((a) => a.role === 'hub') || audits.find((a) => /\/posgrados\/?$/.test(a.url));
  const flexHub = audits.find((a) => a.role === 'flexible-hub') || audits.find((a) => /posgrados\.casagrande\.edu\.ec/i.test(a.url));
  const programAudits = audits.filter((a) => a.role === 'program');

  if (sitemapSummary?.brokenUrls?.length) {
    cards.push({
      id: 'fix-sitemap-404',
      priority: 'Crítico',
      priorityTone: 'crit',
      channel: 'Arquitectura & Sitemap',
      title: `Corregir ${sitemapSummary.brokenUrls.length}+ rutas 404 en sitemap-0.xml (/posgrados/* vs /posgrado/*)`,
      impact: `Evita perder autoridad orgánica de ${sitemapSummary.posgradoUrlsCount} URLs declaradas en ${sitemapSummary.origin}`,
      steps: [
        `El sitemap declara rutas plurales (ej. ${sitemapSummary.brokenUrls[0].url}) que devuelven HTTP ${sitemapSummary.brokenUrls[0].status}, mientras las fichas reales responden 200 en singular (/posgrado/...).`,
        'Implementar redirecciones 301 de /posgrados/<slug> → /posgrado/<slug> o actualizar sitemap-0.xml para apuntar exclusivamente a URLs 200.',
        'Complementar captación inmediata enlazando las nuevas fichas optimizadas (/programas/<slug>/) y guías indexables (/guias/<slug>).',
      ],
      programSlug: 'maestria-en-administracion-de-empresas',
      keyword: 'maestria administracion de empresas ecuador',
      aiQuestion: `Nuestro rastreo detectó URLs 404 en el sitemap oficial de casagrande.edu.ec como ${sitemapSummary.brokenUrls[0].url}. ¿Qué plan técnico priorizas para recuperar ese posicionamiento?`,
    });
  }

  if (mainHub && (mainHub.internalPosgradoLinks < 3 || mainHub.h2Count === 0)) {
    cards.push({
      id: 'fix-hub-ssr-links',
      priority: 'Crítico',
      priorityTone: 'crit',
      channel: 'Indexación SSR Hub',
      title: 'Exponer enlaces SSR, <h2> e ItemList JSON-LD en casagrande.edu.ec/posgrados',
      impact: `${mainHub.h2Count} etiquetas H2 y ${mainHub.internalPosgradoLinks} enlaces de maestrías en el HTML inicial (score ${mainHub.score}/100)`,
      steps: [
        'El HTML SSR de /posgrados solo imprime el H1 "Nuestros Posgrados" sin H2 por facultad ni enlaces directos <a> a las 34 maestrías.',
        `Reducir la meta description de ${mainHub.metaDescLength} a 150–160 caracteres (corrigiendo "La maestrías" → "Las maestrías").`,
        'Mientras UCG actualiza Next.js, impulsar nuestro portal estático (/programas/{slug}/) y publicar guías temáticas enlazadas al hub y a cada área.',
      ],
      programSlug: 'maestria-en-ia-y-ciencia-de-datos',
      keyword: 'maestrias en linea ecuador universidad casa grande',
      aiQuestion: `casagrande.edu.ec/posgrados tiene score ${mainHub.score}/100, ${mainHub.metaDescLength} caracteres en meta description, ${mainHub.h2Count} H2 y ${mainHub.internalPosgradoLinks} enlaces SSR a maestrías. ¿Qué debemos corregir primero y cómo captar tráfico mientras tanto?`,
    });
  }

  const missingCourseSchema = audits.filter(
    (a) => a.statusCode === 200 && !a.schemaTypes.some((t) => /course|educationaloccupationalprogram|itemlist/i.test(t)),
  );
  if (missingCourseSchema.length) {
    cards.push({
      id: 'add-course-schema',
      priority: 'Alto Impacto',
      priorityTone: 'high',
      channel: 'Rich Results JSON-LD',
      title: `Agregar Schema EducationalOccupationalProgram / Course en ${missingCourseSchema.length} páginas vivas`,
      impact: 'Desbloquea fragmentos enriquecidos en Google (duración, modalidad y precios en Ecuador)',
      steps: [
        `Ninguna de las ${missingCourseSchema.length} páginas auditadas declara JSON-LD de Course o FAQPage; solo exponen Organization/WebSite genérico.`,
        `Actualizar el teléfono del Schema EducationalOrganization (hoy +593-4-283-5630) al oficial de Admisiones (${brand.admissionsPhone}).`,
        'Aprovechar que nuestras fichas /programas/{slug}/ y /guias/{slug} ya publican Course + Offer + BreadcrumbList validado.',
      ],
      programSlug: 'maestria-en-ciberseguridad',
      keyword: 'maestria en ciberseguridad ecuador',
      aiQuestion: '¿Qué impacto tiene añadir Schema Course, FAQPage y actualizar el teléfono en JSON-LD de las páginas oficiales de casagrande.edu.ec?',
    });
  }

  if (flexHub && (flexHub.h1Count === 0 || flexHub.metaDescLength === 0 || !flexHub.canonical)) {
    cards.push({
      id: 'fix-flexible-portal',
      priority: 'Alto Impacto',
      priorityTone: 'high',
      channel: '21 Maestrías Flexibles',
      title: 'Rescatar SEO de las 21 Maestrías Flexibles (posgrados.casagrande.edu.ec)',
      impact: `${flexHub.h1Count} H1 · ${flexHub.metaDescLength} chars meta desc · ${flexHub.imgMissingAlt}/${flexHub.imgTotal} imágenes sin alt`,
      steps: [
        'Las 21 maestrías flexibles ($2,800–$3,200 USD, alta intención comercial) cargan sin H1, sin meta description, sin canonical y con URLs opacas (?action=vermaestria&id=...).',
        'Agregar atributos alt descriptivos en las miniaturas y publicar <link rel="canonical"> + URLs amigables.',
        'Priorizar guías SEO en /guias/{slug} para estas 21 maestrías destacando su precio exacto en USD y tutorías los fines de semana.',
      ],
      programSlug: 'comunicacion-estrategica-e-imagen-institucional',
      keyword: 'maestria comunicacion estrategica en linea ecuador',
      aiQuestion: 'El portal posgrados.casagrande.edu.ec/maestrias tiene 0 H1, 0 meta description, sin canonical y URLs opacas. ¿Cómo capturamos búsquedas comerciales para las 21 maestrías flexibles?',
    });
  }

  const missingPricing = programAudits.filter((a) => !a.metrics?.hasPricingSignal || !a.metrics?.hasFaqSignal);
  if (missingPricing.length || audits.length > 0) {
    const sampleProg = missingPricing[0]?.programSlug || programAudits[0]?.programSlug || 'maestria-en-administracion-de-empresas';
    cards.push({
      id: 'optimize-pricing-faq',
      priority: 'Mejora Rápida',
      priorityTone: 'med',
      channel: 'Conversión & FAQ',
      title: 'Inyectar bloques FAQ y transparencia financiera / Simulador en fichas',
      impact: `Detectado en ${missingPricing.length || audits.length} página(s) auditadas sin bloque FAQ o financiamiento claro`,
      steps: [
        'Incorporar sección <h2> "Inversión y financiamiento directo UCG (hasta 18 meses)" con acceso directo al Simulador.',
        'Sumar 4–5 preguntas frecuentes sobre título SENESCYT, examen complexivo y horarios sincrónicos para captar búsquedas "requisitos / cuánto cuesta".',
        'Conectar cada página con el formulario directo al CRM y atención inmediata por voz IA en +1 (912) 491-5544.',
      ],
      programSlug: sampleProg,
      keyword: 'requisitos y costos maestrias casa grande guayaquil',
      aiQuestion: '¿Qué secciones FAQ e información financiera deberíamos añadir en las páginas de posgrados para elevar la conversión a leads?',
    });
  }

  return cards.slice(0, 6);
}

export async function loadLiveAuditSnapshot(db) {
  if (!db) {
    return {
      ok: true,
      summary: {
        auditedCount: 0,
        targetsCount: DEFAULT_LIVE_TARGETS.length,
        avgScore: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lastCrawledAt: null,
      },
      sitemapSummary: null,
      targets: DEFAULT_LIVE_TARGETS.map((t) => ({ ...t, active: 1, isDefault: true })),
      audits: [],
      recommendations: [],
    };
  }

  await seedDefaultLiveTargets(db);

  const [targetRes, auditRes] = await Promise.all([
    db.prepare('SELECT url, label, role, program_slug AS programSlug, added_at AS addedAt, active FROM seo_live_targets WHERE active = 1 ORDER BY added_at ASC, url ASC').all(),
    db.prepare('SELECT * FROM seo_live_audits ORDER BY score ASC, crawled_at DESC').all(),
  ]);

  const targets = (targetRes.results || []).map((t) => ({
    ...t,
    isDefault: DEFAULT_LIVE_TARGETS.some((d) => d.url === t.url),
  }));

  const targetOrder = new Map(targets.map((t, idx) => [t.url, idx]));
  let sitemapSummary = null;

  const audits = (auditRes.results || [])
    .map((row) => {
      const schemaTypes = safeJsonParse(row.schema_types_json, []);
      const issues = safeJsonParse(row.issues_json, []);
      const metrics = safeJsonParse(row.metrics_json, {});
      const rowSitemap = safeJsonParse(row.sitemap_json, null);
      if (rowSitemap && (!sitemapSummary || (row.crawled_at || '') >= (sitemapSummary.checkedAt || ''))) {
        sitemapSummary = rowSitemap;
      }
      return {
        url: row.url,
        label: row.label || row.title || row.url,
        role: row.role || 'custom',
        programSlug: row.program_slug || null,
        isDefault: DEFAULT_LIVE_TARGETS.some((d) => d.url === row.url),
        statusCode: row.status_code ?? null,
        responseMs: row.response_ms ?? null,
        score: row.score ?? 0,
        title: row.title || '',
        titleLength: row.title_length ?? 0,
        metaDescription: row.meta_description || '',
        metaDescLength: row.meta_desc_length ?? 0,
        canonical: row.canonical || '',
        h1Count: row.h1_count ?? 0,
        h2Count: row.h2_count ?? 0,
        wordCount: row.word_count ?? 0,
        imgTotal: row.img_total ?? 0,
        imgMissingAlt: row.img_missing_alt ?? 0,
        internalPosgradoLinks: row.internal_posgrado_links ?? 0,
        schemaTypes,
        issues,
        metrics,
        crawledAt: row.crawled_at,
        error: row.error || null,
      };
    })
    .sort((a, b) => {
      const ai = targetOrder.has(a.url) ? targetOrder.get(a.url) : 999;
      const bi = targetOrder.has(b.url) ? targetOrder.get(b.url) : 999;
      return ai - bi || a.score - b.score;
    });

  const auditedCount = audits.length;
  const avgScore = auditedCount
    ? Math.round(audits.reduce((sum, a) => sum + (a.score || 0), 0) / auditedCount)
    : 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  for (const a of audits) {
    for (const iss of a.issues) {
      if (iss.severity === 'critical') criticalCount++;
      else if (iss.severity === 'high') highCount++;
      else mediumCount++;
    }
  }
  if (sitemapSummary?.brokenUrls?.length) criticalCount += sitemapSummary.brokenUrls.length;

  const lastCrawledAt = audits.reduce((latest, a) => (!latest || (a.crawledAt || '') > latest ? a.crawledAt : latest), null);
  const recommendations = buildLiveActionPlan(audits, sitemapSummary);

  return {
    ok: true,
    summary: {
      auditedCount,
      targetsCount: targets.length,
      avgScore,
      criticalCount,
      highCount,
      mediumCount,
      lastCrawledAt,
    },
    sitemapSummary,
    targets,
    audits,
    recommendations,
  };
}

export async function addLiveTarget(db, { url, label = '', role = 'custom', programSlug = null }) {
  await seedDefaultLiveTargets(db);
  const normalizedUrl = normalizePublicUrl(url);
  if (!normalizedUrl) {
    throw new Error('Ingresa una URL pública válida con https:// (sin localhost ni redes internas).');
  }
  const parsed = new URL(normalizedUrl);
  const inferredSlug = programSlug || inferProgramSlugFromUrl(normalizedUrl);
  const inferredRole = role !== 'custom'
    ? role
    : inferredSlug
      ? 'program'
      : /\/posgrados\/?$/i.test(parsed.pathname)
        ? 'hub'
        : /maestrias/i.test(parsed.pathname)
          ? 'flexible-hub'
          : 'custom';
  const cleanLabel = clean(label, 120) || (inferredSlug ? programs.find((p) => p.slug === inferredSlug)?.shortTitle : '') || `${parsed.hostname}${parsed.pathname}`;
  const now = new Date().toISOString();

  await db.prepare(
    `INSERT INTO seo_live_targets(url, label, role, program_slug, added_at, active)
     VALUES(?, ?, ?, ?, ?, 1)
     ON CONFLICT(url) DO UPDATE SET
       label = COALESCE(NULLIF(excluded.label, ''), seo_live_targets.label),
       role = excluded.role,
       program_slug = COALESCE(excluded.program_slug, seo_live_targets.program_slug),
       active = 1`,
  ).bind(normalizedUrl, cleanLabel, inferredRole, inferredSlug, now).run();

  return normalizedUrl;
}

export async function removeLiveTarget(db, url) {
  await ensureLiveAuditTables(db);
  const normalizedUrl = normalizePublicUrl(url) || String(url || '').trim();
  if (!normalizedUrl) throw new Error('Indica la URL que deseas eliminar.');
  await db.batch([
    db.prepare('DELETE FROM seo_live_targets WHERE url = ?').bind(normalizedUrl),
    db.prepare('DELETE FROM seo_live_audits WHERE url = ?').bind(normalizedUrl),
  ]);
  return loadLiveAuditSnapshot(db);
}

/**
 * Crawls configured (or requested) live UCG URLs, audits SSR HTML, headings,
 * structured data, canonical URLs, images, internal discovery, and sitemap health,
 * and saves results in SQLite so SEO Analysis learns from real production pages.
 */
export async function crawlLiveTargets(
  db,
  { urls = null, includeDefaults = false, checkSitemap = true, fetchImpl = fetch } = {},
) {
  await seedDefaultLiveTargets(db);

  if (Array.isArray(urls) && urls.length) {
    if (urls.length > MAX_BATCH_URLS) {
      throw new Error(`Puedes auditar hasta ${MAX_BATCH_URLS} URLs por lote.`);
    }
    for (const rawUrl of urls) {
      await addLiveTarget(db, { url: rawUrl });
    }
  }

  const allTargets = (
    await db.prepare('SELECT url, label, role, program_slug AS programSlug FROM seo_live_targets WHERE active = 1 ORDER BY added_at ASC').all()
  ).results || [];

  let targetsToCrawl = allTargets;
  if (Array.isArray(urls) && urls.length && !includeDefaults) {
    const wanted = new Set(urls.map((u) => normalizePublicUrl(u)).filter(Boolean));
    targetsToCrawl = allTargets.filter((t) => wanted.has(t.url));
  }
  targetsToCrawl = targetsToCrawl.slice(0, MAX_BATCH_URLS);

  const hubTarget = targetsToCrawl.find((t) => t.role === 'hub') ||
    allTargets.find((t) => t.role === 'hub') ||
    targetsToCrawl[0];

  const [crawlResults, sitemapSummary] = await Promise.all([
    runPool(targetsToCrawl, CRAWL_CONCURRENCY, async (target) => {
      const crawledAt = new Date().toISOString();
      try {
        const res = await fetchCappedText(target.url, fetchImpl);
        const report = analyzeHtmlDocument(target.url, res.text, {
          statusCode: res.status,
          responseMs: res.responseMs,
          role: target.role,
          programSlug: target.programSlug,
        });
        return { target, report, crawledAt, error: null };
      } catch (err) {
        const errMsg = clean(err?.message || 'No se pudo consultar la URL en vivo.', 220);
        return {
          target,
          crawledAt,
          error: errMsg,
          report: analyzeHtmlDocument(target.url, '', {
            statusCode: 0,
            responseMs: 0,
            role: target.role,
            programSlug: target.programSlug,
          }),
        };
      }
    }),
    checkSitemap && hubTarget ? inspectOriginSitemap(hubTarget.url, fetchImpl).catch(() => null) : Promise.resolve(null),
  ]);

  const stmts = [];
  for (const item of crawlResults) {
    const { target, report, crawledAt, error } = item;
    const issues = error
      ? [{
          severity: 'critical',
          code: 'FETCH_ERROR',
          title: 'Error de conexión al auditar la URL',
          evidence: error,
          action: 'Verificar disponibilidad de la página desde servidores externos.',
        }, ...report.issues.filter((i) => i.code !== 'HTTP_ERROR')]
      : report.issues;
    const isHubForSitemap = sitemapSummary && new URL(target.url).origin === sitemapSummary.origin && target.role === 'hub';

    stmts.push(
      db.prepare(
        `INSERT INTO seo_live_audits(
          url, label, role, program_slug, status_code, response_ms, score,
          title, title_length, meta_description, meta_desc_length, canonical,
          h1_count, h2_count, word_count, img_total, img_missing_alt, internal_posgrado_links,
          schema_types_json, issues_json, metrics_json, sitemap_json, crawled_at, error
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          label = excluded.label,
          role = excluded.role,
          program_slug = excluded.program_slug,
          status_code = excluded.status_code,
          response_ms = excluded.response_ms,
          score = excluded.score,
          title = excluded.title,
          title_length = excluded.title_length,
          meta_description = excluded.meta_description,
          meta_desc_length = excluded.meta_desc_length,
          canonical = excluded.canonical,
          h1_count = excluded.h1_count,
          h2_count = excluded.h2_count,
          word_count = excluded.word_count,
          img_total = excluded.img_total,
          img_missing_alt = excluded.img_missing_alt,
          internal_posgrado_links = excluded.internal_posgrado_links,
          schema_types_json = excluded.schema_types_json,
          issues_json = excluded.issues_json,
          metrics_json = excluded.metrics_json,
          sitemap_json = COALESCE(excluded.sitemap_json, seo_live_audits.sitemap_json),
          crawled_at = excluded.crawled_at,
          error = excluded.error`,
      ).bind(
        target.url,
        target.label || report.title || target.url,
        target.role,
        report.programSlug || target.programSlug || null,
        report.statusCode,
        report.responseMs,
        error ? 0 : report.score,
        report.title,
        report.titleLength,
        report.metaDescription,
        report.metaDescLength,
        report.canonical,
        report.h1Count,
        report.h2Count,
        report.wordCount,
        report.imgTotal,
        report.imgMissingAlt,
        report.internalPosgradoLinks,
        JSON.stringify(report.schemaTypes),
        JSON.stringify(issues),
        JSON.stringify({
          altCoveragePct: report.altCoveragePct,
          h1Texts: report.h1Texts,
          h2Texts: report.h2Texts,
          hasNextData: report.hasNextData,
          hasOpaqueQueryUrl: report.hasOpaqueQueryUrl,
          hasPricingSignal: report.hasPricingSignal,
          hasFaqSignal: report.hasFaqSignal,
          hasCtaSignal: report.hasCtaSignal,
          ogTitle: Boolean(report.ogTitle),
          ogDescription: Boolean(report.ogDescription),
          ogImage: Boolean(report.ogImage),
          schemaPhones: report.schemaPhones,
          samplePosgradoLinks: report.samplePosgradoLinks,
        }),
        isHubForSitemap ? JSON.stringify(sitemapSummary) : null,
        crawledAt,
        error,
      ),
    );
  }

  if (stmts.length) {
    await db.batch(stmts);
  }

  return loadLiveAuditSnapshot(db);
}

/**
 * Answers strategic & technical SEO questions grounded strictly in the latest
 * crawled live UCG audit snapshot (falling back deterministically if AI is off).
 */
export async function analyzeLiveAuditQuestion(env, liveSnapshot, question = '') {
  const audits = Array.isArray(liveSnapshot?.audits) ? liveSnapshot.audits : [];
  const recs = Array.isArray(liveSnapshot?.recommendations) ? liveSnapshot.recommendations : [];
  if (!audits.length) {
    return { mode: 'descriptivo', findings: [] };
  }

  const compactContext = {
    pregunta: redact(clean(question, 350)) || '¿Qué problemas y oportunidades revelan las páginas reales de posgrados y qué debemos hacer primero?',
    resumen: liveSnapshot.summary,
    sitemap: liveSnapshot.sitemapSummary
      ? {
          origin: liveSnapshot.sitemapSummary.origin,
          posgradoUrlsCount: liveSnapshot.sitemapSummary.posgradoUrlsCount,
          brokenUrls: liveSnapshot.sitemapSummary.brokenUrls,
          okUrls: liveSnapshot.sitemapSummary.okUrls,
        }
      : null,
    paginasAuditadas: audits.slice(0, 12).map((a) => ({
      url: a.url,
      label: a.label,
      role: a.role,
      statusCode: a.statusCode,
      score: a.score,
      titleLength: a.titleLength,
      metaDescLength: a.metaDescLength,
      canonical: Boolean(a.canonical),
      h1Count: a.h1Count,
      h2Count: a.h2Count,
      imgTotal: a.imgTotal,
      imgMissingAlt: a.imgMissingAlt,
      internalPosgradoLinks: a.internalPosgradoLinks,
      schemaTypes: a.schemaTypes,
      issues: a.issues.slice(0, 5).map((i) => ({ severity: i.severity, code: i.code, title: i.title, evidence: i.evidence })),
    })),
  };

  if (activeAI(env)) {
    try {
      const prompt = 'Eres auditor SEO técnico y estratega de captación universitaria para Universidad Casa Grande en Ecuador. Recibes mediciones reales obtenidas al rastrear sus páginas vivas y sitemap. Responde en español con 2 o 3 hallazgos concretos accionables basados únicamente en los datos observados (nunca inventes métricas ni URLs fuera del JSON). Devuelve solo JSON válido: {"findings":[{"title":"título claro","interpretation":"diagnóstico con cifras y URLs exactas observadas","nextStep":"acción práctica concreta","references":[{"id":"live","metric":"seo_live_audit","statement":"evidencia puntual"}]}]}.';
      const raw = await aiText(env, prompt, JSON.stringify(compactContext), 1300);
      const parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi, ''));
      const valid = (Array.isArray(parsed?.findings) ? parsed.findings : [])
        .slice(0, 3)
        .map((f) => ({
          title: clean(f?.title, 150),
          interpretation: clean(f?.interpretation, 650),
          nextStep: clean(f?.nextStep, 450),
          references: Array.isArray(f?.references)
            ? f.references
                .slice(0, 3)
                .map((r) => ({
                  id: clean(r?.id || 'live', 60),
                  metric: clean(r?.metric || 'seo_live_audit', 40),
                  statement: clean(r?.statement, 280),
                }))
                .filter((r) => r.statement)
            : [],
        }))
        .filter((f) => f.title && f.interpretation && f.nextStep);
      if (valid.length) {
        return { mode: 'modelo', findings: valid };
      }
    } catch { /* fall back cleanly to verified live findings */ }
  }

  const findings = recs.slice(0, 3).map((rec) => ({
    title: rec.title,
    interpretation: `${rec.impact}. ${rec.steps[0] || ''}`,
    nextStep: rec.steps.slice(1).join(' ') || rec.steps[0] || '',
    references: [
      {
        id: rec.id,
        metric: 'seo_live_audit',
        statement: `${rec.channel} (${rec.priority}) — ${rec.impact}`,
      },
    ],
  }));

  return { mode: 'descriptivo', findings };
}
