import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
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
const PUBLIC_DIR = join(ROOT, 'public');
const PUBLIC_MEDIA_DIR = join(PUBLIC_DIR, 'media');
const OUT_DIR = join(ROOT, 'dist-pages');
const OUT_ADMIN_DIR = join(OUT_DIR, 'admin');
const OUT_CRM_DIR = join(OUT_DIR, 'crm');
const OUT_MEDIA_DIR = join(OUT_DIR, 'media');

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
      curriculumNote: p.curriculumNote || null
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

  writeFileSync(join(OUT_DIR, 'config.json'), JSON.stringify(configObj, null, 2) + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, 'catalog.json'), JSON.stringify(staticPrograms, null, 2) + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, '.nojekyll'), '', 'utf8');

  const programOptionsHtml = staticPrograms
    .map((p) => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.title)} (${escapeHtml(p.area)})</option>`)
    .join('\n                ');

  let indexHtml = readFileSync(join(SITE_DIR, 'index.html'), 'utf8');
  let adminIndexHtml = readFileSync(join(SITE_ADMIN_DIR, 'index.html'), 'utf8');

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

  verifyOutput(staticPrograms, indexHtml, adminIndexHtml, crmRedirectHtml);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: 'dist-pages',
        pages: ['index.html', 'admin/index.html', 'crm/index.html (redirect)'],
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

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

// The staff credential is entered at sign-in and kept in sessionStorage. It must never be
// baked into the static site, even if the build machine happens to have it in its env.
function verifyNoStaffCredential() {
  const secrets = ['ADMISSIONS_STAFF_TOKEN', 'ADMIN_API_TOKEN']
    .map((name) => (process.env[name] || '').trim())
    .filter((value) => value.length >= 8);
  for (const file of listFiles(OUT_DIR)) {
    if (!/\.(?:html|js|json|css|txt|xml|svg)$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (/ADMISSIONS_STAFF_TOKEN\s*[:=]\s*["'][^"']+/.test(text) || secrets.some((value) => text.includes(value))) {
      throw new Error(`Credencial del equipo detectada en ${file}.`);
    }
  }
}

function verifyOutput(staticPrograms, indexHtml, adminIndexHtml, crmRedirectHtml) {
  if (staticPrograms.length !== 34) {
    throw new Error(`Se esperaban 34 programas en el catálogo y se encontraron ${staticPrograms.length}.`);
  }

  if (/\bid=["']crm["']/.test(indexHtml)) {
    throw new Error('dist-pages/index.html aún contiene la sección #crm incrustada.');
  }
  if (!indexHtml.includes('./admin/')) {
    throw new Error('dist-pages/index.html debe enlazar al workspace Admin (./admin/).');
  }
  if (!crmRedirectHtml.includes('../admin/')) {
    throw new Error('dist-pages/crm/index.html debe redirigir a ../admin/.');
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

  verifyRelativeAssetRefs(OUT_DIR, indexHtml, cssContent, 'dist-pages/index.html');
  verifyRelativeAssetRefs(OUT_ADMIN_DIR, adminIndexHtml, adminCssContent, 'dist-pages/admin/index.html');
  verifyRelativeAssetRefs(OUT_CRM_DIR, crmRedirectHtml, '', 'dist-pages/crm/index.html');

  // The Admin must only reach the authenticated /api/admin/* routes.
  if (/\/api\/public\//.test(adminJsContent) || /\/api\/public\//.test(adminIndexHtml)) {
    throw new Error('dist-pages/admin aún usa rutas /api/public/* sin autenticación; usa /api/admin/*.');
  }
  if (!adminJsContent.includes('/api/admin/session')) {
    throw new Error('dist-pages/admin/admin.js debe iniciar sesión del equipo contra /api/admin/session.');
  }
  verifyNoStaffCredential();

  const secretPatterns = [
    /\bkey_[a-f0-9]{16,}/i,
    /\bre_[A-Za-z0-9_]{16,}/,
    /sk-ant-[A-Za-z0-9_-]{12,}/,
    /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/
  ];
  for (const [label, text] of [
    ['index.html', indexHtml],
    ['styles.css', cssContent],
    ['app.js', jsContent],
    ['admin/index.html', adminIndexHtml],
    ['admin/admin.css', adminCssContent],
    ['admin/admin.js', adminJsContent],
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
