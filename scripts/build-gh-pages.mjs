import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brand, programs } from '../src/catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SITE_DIR = join(ROOT, 'site');
const SITE_ADMIN_DIR = join(SITE_DIR, 'admin');
const SITE_PROGRAM_DIR = join(SITE_DIR, 'program');
const PUBLIC_DIR = join(ROOT, 'public');
const PUBLIC_MEDIA_DIR = join(PUBLIC_DIR, 'media');
const OUT_DIR = join(ROOT, 'dist-pages');
const OUT_ADMIN_DIR = join(OUT_DIR, 'admin');
const OUT_CRM_DIR = join(OUT_DIR, 'crm');
const OUT_MEDIA_DIR = join(OUT_DIR, 'media');
const OUT_PROGRAM_DIR = join(OUT_DIR, 'program');
const OUT_PROGRAMAS_DIR = join(OUT_DIR, 'programas');

const CANONICAL_BASE = 'https://slimetoad.github.io/Casagrande';
const FALLBACK_API_BASE = 'https://casagrande-posgrados-production.up.railway.app';
const FALLBACK_VOICE_PHONE = '+19124915544';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function resolveBuildConfig() {
  const fromEnvApi = (process.env.CASAGRANDE_API_URL || '').trim();
  const fromEnvPhone = (process.env.CASAGRANDE_PHONE_NUMBER || '').trim();

  let fileConfig = {};
  const configPath = join(SITE_DIR, 'config.json');
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf8')) || {};
    } catch (error) {
      throw new Error(`No se pudo leer site/config.json: ${error.message}`);
    }
  }

  const rawApi = fromEnvApi || (typeof fileConfig.apiBase === 'string' ? fileConfig.apiBase.trim() : '');
  const apiBase = (rawApi || FALLBACK_API_BASE).replace(/\/+$/, '');
  const voicePhone = fromEnvPhone || (typeof fileConfig.voicePhone === 'string' ? fileConfig.voicePhone.trim() : '') || FALLBACK_VOICE_PHONE;

  return { apiBase, voicePhone };
}

function toRelativeMediaPath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('Ruta de imagen vacía en src/catalog.js.');
  }
  const clean = rawPath.trim().replace(/^\/+/, '');
  if (!clean.startsWith('media/')) {
    throw new Error(`Ruta de media inesperada: ${rawPath}`);
  }
  return `./${clean}`;
}

function build() {
  const configObj = resolveBuildConfig();
  const { apiBase, voicePhone } = configObj;

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_MEDIA_DIR, { recursive: true });
  mkdirSync(OUT_ADMIN_DIR, { recursive: true });
  mkdirSync(OUT_CRM_DIR, { recursive: true });
  mkdirSync(OUT_PROGRAM_DIR, { recursive: true });
  mkdirSync(OUT_PROGRAMAS_DIR, { recursive: true });

  const mediaBasenames = new Set([
    basename(brand.logo || '/media/ucg-logo.png'),
    basename(brand.logoLight || '/media/ucg-logo-light.png'),
    basename(brand.hero || '/media/campus-hero.webp'),
    'campus-building.webp',
    'space-grotesk.woff2',
    'inter.woff2'
  ]);

  const staticPrograms = programs.map((p) => {
    const relImage = toRelativeMediaPath(p.image);
    mediaBasenames.add(basename(relImage));
    return {
      slug: p.slug,
      title: p.title,
      shortTitle: p.shortTitle,
      area: p.area,
      summary: p.summary,
      mode: p.mode,
      duration: p.duration,
      price: p.price,
      url: p.url,
      image: relImage,
      details: p.details || [],
      family: p.family,
      degree: p.degree,
      curriculum: p.curriculum || [],
      brochure: p.brochure || null,
      admissionsStatus: p.admissionsStatus || 'Consultar convocatoria',
      applicationUrl: p.applicationUrl || null,
      curriculumNote: p.curriculumNote || null,
      cesResolution: p.cesResolution || null,
      schedule: p.schedule || null,
      graduationMode: p.graduationMode || null,
      doubleDegree: p.doubleDegree || null,
      financing: p.financing || null,
      admissionProcess: Array.isArray(p.admissionProcess) ? p.admissionProcess : [],
      entryProfile: p.entryProfile || null,
      graduateProfile: Array.isArray(p.graduateProfile) ? p.graduateProfile : [],
      curriculumPeriods: p.curriculumPeriods || null
    };
  });

  for (const file of mediaBasenames) {
    const srcPath = join(PUBLIC_MEDIA_DIR, file);
    if (!existsSync(srcPath)) {
      throw new Error(`Falta el archivo de media requerido: ${srcPath}`);
    }
    copyFileSync(srcPath, join(OUT_MEDIA_DIR, file));
  }

  const faviconSrc = join(PUBLIC_DIR, 'favicon.svg');
  if (!existsSync(faviconSrc)) {
    throw new Error(`Falta favicon.svg en ${faviconSrc}`);
  }
  copyFileSync(faviconSrc, join(OUT_DIR, 'favicon.svg'));

  copyFileSync(join(SITE_DIR, 'styles.css'), join(OUT_DIR, 'styles.css'));
  copyFileSync(join(SITE_DIR, 'app.js'), join(OUT_DIR, 'app.js'));
  copyFileSync(join(SITE_ADMIN_DIR, 'admin.css'), join(OUT_ADMIN_DIR, 'admin.css'));
  copyFileSync(join(SITE_ADMIN_DIR, 'admin.js'), join(OUT_ADMIN_DIR, 'admin.js'));
  copyFileSync(join(SITE_PROGRAM_DIR, 'program.css'), join(OUT_PROGRAM_DIR, 'program.css'));
  copyFileSync(join(SITE_PROGRAM_DIR, 'program.js'), join(OUT_PROGRAM_DIR, 'program.js'));

  writeFileSync(join(OUT_DIR, 'config.json'), JSON.stringify(configObj, null, 2) + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, 'catalog.json'), JSON.stringify(staticPrograms, null, 2) + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, '.nojekyll'), '', 'utf8');

  const programOptionsHtml = staticPrograms
    .map((p) => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.title)} (${escapeHtml(p.area)})</option>`)
    .join('\n                ');

  let indexHtml = readFileSync(join(SITE_DIR, 'index.html'), 'utf8');
  let adminIndexHtml = readFileSync(join(SITE_ADMIN_DIR, 'index.html'), 'utf8');
  const programTemplateHtml = readFileSync(join(SITE_PROGRAM_DIR, 'template.html'), 'utf8');

  const configTagRegex = /<script id="ucg-config" type="application\/json">[\s\S]*?<\/script>/;
  const catalogTagRegex = /<script id="catalog-data" type="application\/json">[\s\S]*?<\/script>/;
  const optionsMarker = '<!--CATALOG_PROGRAM_OPTIONS-->';

  if (!configTagRegex.test(indexHtml)) {
    throw new Error('No se encontró <script id="ucg-config"> en site/index.html.');
  }
  if (!catalogTagRegex.test(indexHtml)) {
    throw new Error('No se encontró <script id="catalog-data"> en site/index.html.');
  }
  if (!configTagRegex.test(adminIndexHtml)) {
    throw new Error('No se encontró <script id="ucg-config"> en site/admin/index.html.');
  }
  if (!catalogTagRegex.test(adminIndexHtml)) {
    throw new Error('No se encontró <script id="catalog-data"> en site/admin/index.html.');
  }

  const inlineConfigScript = `<script id="ucg-config" type="application/json">${safeInlineJson(configObj)}</script>`;
  const inlineCatalogScript = `<script id="catalog-data" type="application/json">${safeInlineJson(staticPrograms)}</script>`;

  indexHtml = indexHtml
    .replace(configTagRegex, () => inlineConfigScript)
    .replace(catalogTagRegex, () => inlineCatalogScript)
    .replace(optionsMarker, () => programOptionsHtml);

  adminIndexHtml = adminIndexHtml
    .replace(configTagRegex, () => inlineConfigScript)
    .replace(catalogTagRegex, () => inlineCatalogScript);

  const crmRedirectHtml = `<!doctype html>
<html lang="es-EC">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, nofollow">
  <meta http-equiv="refresh" content="0; url=../admin/">
  <title>Redirigiendo a Admin · Posgrados UCG</title>
  <script>location.replace('../admin/' + location.search + location.hash);</script>
</head>
<body>
  <p>Redirigiendo a <a href="../admin/">Admin · Posgrados UCG</a>…</p>
</body>
</html>
`;

  writeFileSync(join(OUT_DIR, 'index.html'), indexHtml, 'utf8');
  writeFileSync(join(OUT_ADMIN_DIR, 'index.html'), adminIndexHtml, 'utf8');
  writeFileSync(join(OUT_CRM_DIR, 'index.html'), crmRedirectHtml, 'utf8');

  const programasIndexHtml = `<!doctype html>
<html lang="es-EC">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, follow">
  <meta http-equiv="refresh" content="0; url=../#catalogo">
  <title>Maestrías UCG · Posgrados Universidad Casa Grande</title>
  <script>location.replace('../#catalogo');</script>
</head>
<body>
  <p>Explora las 34 maestrías en <a href="../#catalogo">Posgrados UCG</a>…</p>
</body>
</html>
`;
  writeFileSync(join(OUT_PROGRAMAS_DIR, 'index.html'), programasIndexHtml, 'utf8');

  const renderedPrograms = [];
  for (const prog of staticPrograms) {
    const outSlugDir = join(OUT_PROGRAMAS_DIR, prog.slug);
    mkdirSync(outSlugDir, { recursive: true });
    const html = renderProgramHtml({
      template: programTemplateHtml,
      program: prog,
      allPrograms: staticPrograms,
      inlineConfigScript,
      inlineCatalogScript
    });
    writeFileSync(join(outSlugDir, 'index.html'), html, 'utf8');
    renderedPrograms.push({ slug: prog.slug, html, outDir: outSlugDir });
  }

  const sitemapXml = buildSitemapXml(staticPrograms);
  writeFileSync(join(OUT_DIR, 'sitemap.xml'), sitemapXml, 'utf8');

  verifyOutput(staticPrograms, indexHtml, adminIndexHtml, crmRedirectHtml, renderedPrograms, sitemapXml);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: 'dist-pages',
        pages: [
          'index.html',
          'admin/index.html',
          'crm/index.html (redirect)',
          'programas/index.html (redirect)',
          `${renderedPrograms.length} programas/{slug}/index.html`,
          'sitemap.xml'
        ],
        programsCount: staticPrograms.length,
        mediaCopied: mediaBasenames.size,
        apiBase,
        voicePhone: voicePhone || null
      },
      null,
      2
    )
  );
}

function formatUsdTotal(price) {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return 'Consultar con Admisiones';
  }
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(price) + ' USD';
}

function statusPillClass(status) {
  if (status === 'Inscripción disponible') return 'pill-open';
  if (status === 'Inscripciones cerradas') return 'pill-closed';
  return 'pill-consult';
}

function buildProgramJsonLd(program) {
  const canonicalUrl = `${CANONICAL_BASE}/programas/${encodeURIComponent(program.slug)}/`;
  const imageUrl = `${CANONICAL_BASE}/media/${basename(program.image)}`;
  const courseNode = {
    '@type': 'Course',
    name: program.title,
    description: program.summary,
    url: canonicalUrl,
    image: imageUrl,
    educationalCredentialAwarded: program.degree || program.title,
    timeRequired: program.duration || undefined,
    provider: {
      '@type': 'EducationalOrganization',
      name: brand.name || 'Universidad Casa Grande',
      sameAs: brand.url || 'https://www.casagrande.edu.ec'
    }
  };
  if (typeof program.price === 'number' && Number.isFinite(program.price) && program.price > 0) {
    courseNode.offers = {
      '@type': 'Offer',
      price: program.price,
      priceCurrency: 'USD',
      category: 'Posgrado',
      url: canonicalUrl
    };
  }
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      courseNode,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Posgrados UCG', item: `${CANONICAL_BASE}/` },
          { '@type': 'ListItem', position: 2, name: program.area || 'Maestrías', item: `${CANONICAL_BASE}/#catalogo` },
          { '@type': 'ListItem', position: 3, name: program.shortTitle || program.title, item: canonicalUrl }
        ]
      }
    ]
  };
  return `<script type="application/ld+json">${safeInlineJson(graph)}</script>`;
}

function buildCurriculumPeriodsHtml(program) {
  const p1 = Array.isArray(program.curriculumPeriods?.period1) && program.curriculumPeriods.period1.length
    ? program.curriculumPeriods.period1
    : (Array.isArray(program.curriculum) ? program.curriculum.slice(0, Math.ceil(program.curriculum.length / 2)) : []);
  const p2 = Array.isArray(program.curriculumPeriods?.period2) && program.curriculumPeriods.period2.length
    ? program.curriculumPeriods.period2
    : (Array.isArray(program.curriculum) ? program.curriculum.slice(Math.ceil(program.curriculum.length / 2)) : []);

  let runningIndex = 1;
  const renderCycle = (title, items) => {
    if (!items.length) return '';
    const listHtml = items.map((subject) => {
      const numStr = String(runningIndex++).padStart(2, '0');
      return `<li><span class="module-num">${numStr}</span><span>${escapeHtml(subject)}</span></li>`;
    }).join('\n            ');
    return `<article class="cycle-card">
          <div class="cycle-head">
            <h3>${escapeHtml(title)}</h3>
            <span class="cycle-badge">${items.length} asignaturas</span>
          </div>
          <ul class="module-list">
            ${listHtml}
          </ul>
        </article>`;
  };

  return [
    renderCycle('Primer Período Académico', p1),
    renderCycle('Segundo Período Académico', p2)
  ].filter(Boolean).join('\n          ');
}

function buildAdmissionStepsHtml(program) {
  const rawSteps = Array.isArray(program.admissionProcess) && program.admissionProcess.length
    ? program.admissionProcess
    : (Array.isArray(brand.admissionsSteps) ? brand.admissionsSteps : []);
  return rawSteps.map((step, idx) => {
    const cleanText = String(step || '').replace(/^\d+\.\s*/, '');
    return `<article class="adm-step-card">
            <span class="adm-step-num">Paso 0${idx + 1}</span>
            <p>${escapeHtml(cleanText)}</p>
          </article>`;
  }).join('\n          ');
}

function buildRelatedCardsHtml(program, allPrograms) {
  const sameArea = allPrograms.filter((other) => other.slug !== program.slug && other.area === program.area);
  const others = allPrograms.filter((other) => other.slug !== program.slug && other.area !== program.area);
  const picks = [...sameArea, ...others].slice(0, 3);

  return picks.map((rel) => {
    const href = `../${encodeURIComponent(rel.slug)}/`;
    const imgPath = `../../media/${basename(rel.image)}`;
    return `<a class="related-card" href="${href}">
            <div class="related-card-img">
              <img src="${escapeHtml(imgPath)}" alt="${escapeHtml(rel.shortTitle || rel.title)}" loading="lazy" decoding="async" width="480" height="360">
            </div>
            <div class="related-card-body">
              <h3>${escapeHtml(rel.shortTitle || rel.title)}</h3>
              <p class="related-card-meta">${escapeHtml(rel.mode || 'En línea')} · ${escapeHtml(rel.duration || 'Consultar')} · ${escapeHtml(formatUsdTotal(rel.price))}</p>
              <span class="related-card-cta">Ver ficha 10x →</span>
            </div>
          </a>`;
  }).join('\n          ');
}

function renderProgramHtml({ template, program, allPrograms, inlineConfigScript, inlineCatalogScript }) {
  const imageRelFromProgram = `../../media/${basename(program.image)}`;
  const programForInline = { ...program, image: imageRelFromProgram };
  const inlineProgramScript = `<script id="program-data" type="application/json">${safeInlineJson(programForInline)}</script>`;

  const statusPillHtml = `<span class="pill ${statusPillClass(program.admissionsStatus)}">${escapeHtml(program.admissionsStatus || 'Consultar convocatoria')}</span>`;
  const doubleDegreePillHtml = program.doubleDegree
    ? '<span class="pill pill-ucam">Opción Doble Titulación</span>'
    : '';
  const doubleDegreeBannerHtml = program.doubleDegree
    ? `<div class="double-degree-banner"><div><strong>Convenio de Doble Titulación Internacional</strong><span> · ${escapeHtml(program.doubleDegree)}</span></div><span>Consultar requisitos en Admisiones</span></div>`
    : '';

  const brochureLinkHtml = program.brochure
    ? `<a href="${escapeHtml(program.brochure)}" target="_blank" rel="noopener noreferrer">Descargar folleto PDF ↗</a>`
    : '';
  const applyLinkHtml = program.applicationUrl
    ? `<a href="${escapeHtml(program.applicationUrl)}" target="_blank" rel="noopener noreferrer">Inscripción directa UCG ↗</a>`
    : '';
  const officialLinkHtml = program.url
    ? `<a href="${escapeHtml(program.url)}" target="_blank" rel="noopener noreferrer">Ficha oficial en casagrande.edu.ec ↗</a>`
    : '';

  const priceDisplay = formatUsdTotal(program.price);
  const priceSub = typeof program.price === 'number' && program.price > 0
    ? 'Arancel total publicado (USD)'
    : 'Valor y facilidades confirmados con Admisiones';

  const graduateProfileHtml = (Array.isArray(program.graduateProfile) ? program.graduateProfile : [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('\n              ');

  const curriculumNoteHtml = program.curriculumNote
    ? `<p class="curriculum-note">${escapeHtml(program.curriculumNote)}</p>`
    : '';

  const replacements = new Map([
    ['<!--PROGRAM_TITLE-->', escapeHtml(program.title)],
    ['<!--PROGRAM_DESCRIPTION-->', escapeHtml(program.summary)],
    ['<!--PROGRAM_IMAGE-->', escapeHtml(imageRelFromProgram)],
    ['<!--PROGRAM_JSONLD-->', buildProgramJsonLd(program)],
    ['<!--PROGRAM_AREA-->', escapeHtml(program.area)],
    ['<!--PROGRAM_SHORT_TITLE-->', escapeHtml(program.shortTitle || program.title)],
    ['<!--PROGRAM_FAMILY-->', escapeHtml(program.family || 'Posgrado')],
    ['<!--PROGRAM_STATUS_PILL-->', statusPillHtml],
    ['<!--PROGRAM_DOUBLE_DEGREE_PILL-->', doubleDegreePillHtml],
    ['<!--PROGRAM_DEGREE-->', escapeHtml(program.degree || program.title)],
    ['<!--PROGRAM_CES-->', escapeHtml(program.cesResolution || 'Registro vigente CES')],
    ['<!--PROGRAM_SUMMARY-->', escapeHtml(program.summary)],
    ['<!--PROGRAM_BROCHURE_LINK-->', brochureLinkHtml],
    ['<!--PROGRAM_APPLY_LINK-->', applyLinkHtml],
    ['<!--PROGRAM_OFFICIAL_LINK-->', officialLinkHtml],
    ['<!--PROGRAM_PRICE_DISPLAY-->', escapeHtml(priceDisplay)],
    ['<!--PROGRAM_PRICE_SUB-->', escapeHtml(priceSub)],
    ['<!--PROGRAM_SCHEDULE-->', escapeHtml(program.schedule || 'Consultar horarios de cohorte con Admisiones')],
    ['<!--PROGRAM_DURATION-->', escapeHtml(program.duration || 'Consultar duración')],
    ['<!--PROGRAM_MODE-->', escapeHtml(program.mode || 'En línea')],
    ['<!--PROGRAM_GRADUATION-->', escapeHtml(program.graduationMode || 'Trabajo de titulación conforme al reglamento UCG')],
    ['<!--PROGRAM_DOUBLE_DEGREE_BANNER-->', doubleDegreeBannerHtml],
    ['<!--PROGRAM_CURRICULUM_PERIODS-->', buildCurriculumPeriodsHtml(program)],
    ['<!--PROGRAM_CURRICULUM_NOTE-->', curriculumNoteHtml],
    ['<!--PROGRAM_FINANCING-->', escapeHtml(program.financing || brand.financingPolicy || '')],
    ['<!--BRAND_FINANCING_POLICY-->', escapeHtml(brand.financingPolicy || '')],
    ['<!--PROGRAM_ADMISSION_STEPS-->', buildAdmissionStepsHtml(program)],
    ['<!--PROGRAM_ENTRY_PROFILE-->', escapeHtml(program.entryProfile || 'Título de tercer nivel de grado debidamente registrado en SENESCYT.')],
    ['<!--PROGRAM_GRADUATE_PROFILE-->', graduateProfileHtml],
    ['<!--BRAND_ADDRESS-->', escapeHtml(brand.campusAddress || brand.city || 'Guayaquil, Ecuador')],
    ['<!--PROGRAM_RELATED_CARDS-->', buildRelatedCardsHtml(program, allPrograms)]
  ]);

  let out = template;
  for (const [token, val] of replacements.entries()) {
    out = out.split(token).join(val);
  }

  out = out
    .replace(/<script id="ucg-config" type="application\/json">[\s\S]*?<\/script>/, () => inlineConfigScript)
    .replace(/<script id="program-data" type="application\/json">[\s\S]*?<\/script>/, () => inlineProgramScript)
    .replace(/<script id="catalog-data" type="application\/json">[\s\S]*?<\/script>/, () => inlineCatalogScript);

  return out;
}

function buildSitemapXml(staticPrograms) {
  const verifiedDate = brand.verifiedAt || '2026-11-22';
  const urls = [
    `${CANONICAL_BASE}/`,
    ...staticPrograms.map((p) => `${CANONICAL_BASE}/programas/${encodeURIComponent(p.slug)}/`)
  ];
  const entries = urls.map((loc, idx) => `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${escapeHtml(verifiedDate)}</lastmod>
    <priority>${idx === 0 ? '1.0' : '0.8'}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

function verifyRelativeAssetRefs(baseDir, htmlText, cssText, label) {
  const rootMediaRefs = [
    ...htmlText.matchAll(/(?:src|href|content)=["'](\/(?:media|styles\.css|app\.js|admin\.css|admin\.js|crm\.css|crm\.js|favicon\.svg)[^"']*)["']/g),
    ...cssText.matchAll(/url\(["']?(\/media\/[^)"']+)["']?\)/g)
  ];
  if (rootMediaRefs.length > 0) {
    throw new Error(`Se detectaron rutas absolutas desde raíz en ${label}: ${rootMediaRefs.map((m) => m[1]).join(', ')}`);
  }

  const relRefs = [
    ...Array.from(htmlText.matchAll(/(?:src|href|content)=["'](\.\.?\/[^"']+)["']/g), (m) => m[1]),
    ...Array.from(cssText.matchAll(/url\(["']?(\.\.?\/[^)"']+)["']?\)/g), (m) => m[1])
  ];

  for (const ref of relRefs) {
    const cleanRef = ref.split('?')[0].split('#')[0];
    if (!cleanRef || cleanRef.endsWith('/')) {
      const targetDir = resolve(baseDir, cleanRef || '.');
      if (!existsSync(join(targetDir, 'index.html'))) {
        throw new Error(`Directorio/enlace relativo roto en ${label}: ${ref}`);
      }
      continue;
    }
    const target = resolve(baseDir, cleanRef);
    if (!existsSync(target)) {
      throw new Error(`Referencia local rota en ${label}: ${ref}`);
    }
  }
}

function verifyOutput(staticPrograms, indexHtml, adminIndexHtml, crmRedirectHtml, renderedPrograms, sitemapXml) {
  if (staticPrograms.length !== 34) {
    throw new Error(`Se esperaban 34 programas en el catálogo y se encontraron ${staticPrograms.length}.`);
  }
  if (!Array.isArray(renderedPrograms) || renderedPrograms.length !== 34) {
    throw new Error(`Se esperaban 34 páginas individuales y se generaron ${renderedPrograms ? renderedPrograms.length : 0}.`);
  }

  if (/\bid=["']crm["']/.test(indexHtml)) {
    throw new Error('dist-pages/index.html aún contiene la sección #crm incrustada.');
  }
  if (!indexHtml.includes('./admin/')) {
    throw new Error('dist-pages/index.html debe enlazar al workspace Admin (./admin/).');
  }
  if (!indexHtml.includes('#herramientas')) {
    throw new Error('dist-pages/index.html debe incluir la sección #herramientas.');
  }
  if (!crmRedirectHtml.includes('../admin/')) {
    throw new Error('dist-pages/crm/index.html debe redirigir a ../admin/.');
  }
  if (!sitemapXml.includes(`${CANONICAL_BASE}/programas/`)) {
    throw new Error('dist-pages/sitemap.xml debe incluir las rutas /programas/{slug}/.');
  }

  for (const p of staticPrograms) {
    if (!p.image.startsWith('./media/')) {
      throw new Error(`Imagen no relativa para ${p.slug}: ${p.image}`);
    }
    const diskPath = join(OUT_DIR, p.image.slice(2));
    if (!existsSync(diskPath)) {
      throw new Error(`Imagen copiada no encontrada para ${p.slug}: ${diskPath}`);
    }
  }

  const cssContent = readFileSync(join(OUT_DIR, 'styles.css'), 'utf8');
  const jsContent = readFileSync(join(OUT_DIR, 'app.js'), 'utf8');
  const adminCssContent = readFileSync(join(OUT_ADMIN_DIR, 'admin.css'), 'utf8');
  const adminJsContent = readFileSync(join(OUT_ADMIN_DIR, 'admin.js'), 'utf8');
  const programCssContent = readFileSync(join(OUT_PROGRAM_DIR, 'program.css'), 'utf8');
  const programJsContent = readFileSync(join(OUT_PROGRAM_DIR, 'program.js'), 'utf8');

  verifyRelativeAssetRefs(OUT_DIR, indexHtml, cssContent, 'dist-pages/index.html');
  verifyRelativeAssetRefs(OUT_ADMIN_DIR, adminIndexHtml, adminCssContent, 'dist-pages/admin/index.html');
  verifyRelativeAssetRefs(OUT_CRM_DIR, crmRedirectHtml, '', 'dist-pages/crm/index.html');
  verifyRelativeAssetRefs(OUT_PROGRAM_DIR, '', programCssContent, 'dist-pages/program/program.css');

  const secretPatterns = [
    /\bkey_[a-f0-9]{16,}/i,
    /\bre_[A-Za-z0-9_]{16,}/,
    /sk-ant-[A-Za-z0-9_-]{12,}/
  ];

  for (const item of renderedPrograms) {
    const label = `dist-pages/programas/${item.slug}/index.html`;
    if (/<!--(?:PROGRAM|BRAND)_/.test(item.html)) {
      throw new Error(`Quedaron marcadores sin reemplazar en ${label}.`);
    }
    verifyRelativeAssetRefs(item.outDir, item.html, '', label);
    for (const pattern of secretPatterns) {
      if (pattern.test(item.html)) {
        throw new Error(`Posible secreto detectado en ${label}.`);
      }
    }
  }

  for (const [label, text] of [
    ['index.html', indexHtml],
    ['styles.css', cssContent],
    ['app.js', jsContent],
    ['admin/index.html', adminIndexHtml],
    ['admin/admin.css', adminCssContent],
    ['admin/admin.js', adminJsContent],
    ['program/program.css', programCssContent],
    ['program/program.js', programJsContent],
    ['crm/index.html', crmRedirectHtml]
  ]) {
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) {
        throw new Error(`Posible secreto detectado en dist-pages/${label}.`);
      }
    }
  }
}

build();
