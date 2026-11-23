import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteD1 } from '../server/d1-sqlite.mjs';
import { handleHttpRequest } from '../server/index.mjs';
import {
  analyzeHtmlDocument,
  inspectOriginSitemap,
  isSafePublicUrl,
  normalizePublicUrl,
} from '../src/seo-live-audit.js';

test('isSafePublicUrl y normalizePublicUrl validan HTTPS público y bloquean destinos internos', () => {
  assert.equal(isSafePublicUrl('https://www.casagrande.edu.ec/posgrados'), true);
  assert.equal(
    normalizePublicUrl('https://www.casagrande.edu.ec/posgrados/#top'),
    'https://www.casagrande.edu.ec/posgrados',
  );

  for (const unsafe of [
    'http://www.casagrande.edu.ec/posgrados',
    'https://localhost/admin',
    'https://127.0.0.1:8080/',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.5/internal',
    'https://192.168.1.1/',
    'https://172.16.0.10/',
    'https://user:pass@www.casagrande.edu.ec/posgrados',
    'ftp://www.casagrande.edu.ec/posgrados',
  ]) {
    assert.equal(isSafePublicUrl(unsafe), false, `debió rechazar URL insegura: ${unsafe}`);
  }
});

test('analyzeHtmlDocument detecta brechas reales en hub Next.js, portal flexible opaco y aprueba ficha optimizada', () => {
  const longDesc =
    'La maestrías de la Universidad Casa Grande buscan formar profesionales altamente capacitados con metodologías prácticas e innovación continua para liderar proyectos reales en organizaciones del Ecuador y la región con flexibilidad y acompañamiento académico.';
  const hubHtml = `<!doctype html><html lang="es"><head>
    <title>Posgrados | Universidad Casa Grande</title>
    <meta content="${longDesc}" name="description">
    <link rel="canonical" href="https://www.casagrande.edu.ec/posgrados">
    <meta property="og:title" content="Posgrados">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: 'Universidad Casa Grande',
      contactPoint: [{ '@type': 'ContactPoint', telephone: '+593-4-283-5630' }],
    })}</script>
  </head><body>
    <main>
      <h1>Nuestros Posgrados</h1>
      <p>Explora nuestros programas ejecutivos y de especialización en Guayaquil.</p>
      <img src="/a.png" alt="UCG"><img src="/b.png">
      <a href="https://posgrados.casagrande.edu.ec/login">Login</a>
    </main>
    <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
  </body></html>`;

  const hubAudit = analyzeHtmlDocument('https://www.casagrande.edu.ec/posgrados', hubHtml, {
    statusCode: 200,
    responseMs: 120,
    role: 'hub',
  });
  const hubCodes = new Set(hubAudit.issues.map((i) => i.code));
  assert.ok(hubCodes.has('SSR_NO_PROGRAM_LINKS'));
  assert.ok(hubCodes.has('NO_H2_STRUCTURE'));
  assert.ok(hubCodes.has('META_DESC_TOO_LONG'));
  assert.ok(hubCodes.has('MISSING_COURSE_SCHEMA'));
  assert.ok(hubCodes.has('SCHEMA_CONTACT_MISMATCH'));
  assert.ok(hubAudit.issues.find((i) => i.code === 'META_DESC_TOO_LONG')?.evidence.includes('La maestrías'));

  const flexHtml = `<!doctype html><html><head><title>Universidad Casa Grande - Posgrados</title></head><body>
    <h2>Maestrías</h2>
    <img src="/1.png" alt="Logo"><img src="/2.png"><img src="/3.png"><img src="/4.png"><img src="/5.png"><img src="/6.png">
  </body></html>`;
  const flexAudit = analyzeHtmlDocument(
    'https://posgrados.casagrande.edu.ec/maestrias?action=vermaestria&id=OPPQQRRSSTTUUVVWWXXU',
    flexHtml,
    { statusCode: 200, responseMs: 80, role: 'flexible-hub' },
  );
  const flexCodes = new Set(flexAudit.issues.map((i) => i.code));
  assert.ok(flexCodes.has('MISSING_H1'));
  assert.ok(flexCodes.has('MISSING_META_DESC'));
  assert.ok(flexCodes.has('MISSING_CANONICAL'));
  assert.ok(flexCodes.has('OPAQUE_QUERY_URLS'));
  assert.ok(flexCodes.has('MISSING_JSONLD'));
  assert.ok(flexCodes.has('MISSING_IMAGE_ALT'));
  assert.ok(flexAudit.score < 50);

  const cleanDesc = 'Maestría en Administración de Empresas MBA UCG en línea en Ecuador. Inversión, malla y financiamiento hasta 18 meses.';
  const cleanHtml = `<!doctype html><html lang="es-EC"><head>
    <title>MBA Mención Analítica · Posgrados UCG</title>
    <meta name="description" content="${cleanDesc}">
    <link rel="canonical" href="https://slimetoad.github.io/Casagrande/programas/maestria-en-administracion-de-empresas/">
    <meta property="og:title" content="MBA · UCG">
    <meta property="og:description" content="${cleanDesc}">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'EducationalOrganization', name: 'Universidad Casa Grande', contactPoint: [{ telephone: '+593 4 372 6250' }] },
        { '@type': 'Course', name: 'MBA · Administración de Empresas' },
        { '@type': 'FAQPage', mainEntity: [] },
      ],
    })}</script>
  </head><body>
    <main>
      <h1>Maestría en Administración de Empresas MBA</h1>
      <h2>Plan de estudios y horarios</h2>
      <p>Inversión referencial $3,200 USD con financiamiento directo y arancel flexible.</p>
      <h2>Preguntas frecuentes</h2>
      <p>Título de tercer nivel registrado en SENESCYT. Solicitar información o postular en línea.</p>
      <img src="/mba.webp" alt="Estudiantes MBA UCG">
      <a href="/programas/maestria-en-ciberseguridad/">Ciberseguridad</a>
      <a href="/programas/maestria-en-ia-y-ciencia-de-datos/">IA y Datos</a>
      <a href="/programas/maestria-en-marketing-estrategico/">Marketing</a>
    </main>
  </body></html>`;
  const cleanAudit = analyzeHtmlDocument(
    'https://slimetoad.github.io/Casagrande/programas/maestria-en-administracion-de-empresas/',
    cleanHtml,
    { statusCode: 200, responseMs: 50, role: 'program', programSlug: 'maestria-en-administracion-de-empresas' },
  );
  assert.ok(cleanAudit.score >= 85, `se esperaba score >= 85, obtuvo ${cleanAudit.score}`);
  assert.equal(cleanAudit.issues.filter((i) => i.severity === 'critical').length, 0);
});

test('inspectOriginSitemap sigue sitemapindex y reporta rutas 404 frente a URLs activas', async () => {
  const mockFetch = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/robots.txt')) {
      return new Response('User-agent: *\nSitemap: https://www.casagrande.edu.ec/sitemap.xml\n', { status: 200 });
    }
    if (u.endsWith('/sitemap.xml')) {
      return new Response(
        '<sitemapindex><sitemap><loc>https://www.casagrande.edu.ec/sitemap-0.xml</loc></sitemap></sitemapindex>',
        { status: 200 },
      );
    }
    if (u.endsWith('/sitemap-0.xml')) {
      return new Response(
        `<urlset>
          <url><loc>https://www.casagrande.edu.ec/posgrados</loc></url>
          <url><loc>https://www.casagrande.edu.ec/posgrados/maestria-en-administracion-de-empresas</loc></url>
          <url><loc>https://www.casagrande.edu.ec/posgrados/maestria-en-ciberseguridad</loc></url>
        </urlset>`,
        { status: 200 },
      );
    }
    if (init.method === 'HEAD' && u.includes('/posgrados/maestria-')) {
      return new Response(null, { status: 404 });
    }
    if (init.method === 'HEAD' && u.endsWith('/posgrados')) {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 200 });
  };

  const summary = await inspectOriginSitemap('https://www.casagrande.edu.ec/posgrados', mockFetch);
  assert.equal(summary.origin, 'https://www.casagrande.edu.ec');
  assert.equal(summary.sitemapUrl, 'https://www.casagrande.edu.ec/sitemap-0.xml');
  assert.equal(summary.posgradoUrlsCount, 3);
  assert.equal(summary.brokenUrls.length, 2);
  assert.equal(summary.okUrls.length, 1);
});

test('endpoints HTTP de Admin SEO en vivo rastrean, guardan, analizan y gestionan targets en SQLite', async (t) => {
  const db = openSqliteD1(':memory:');
  const env = { DB: db, PUBLIC_BASE_URL: 'https://slimetoad.github.io/Casagrande' };

  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/robots.txt')) {
      return new Response('User-agent: *\nSitemap: https://www.casagrande.edu.ec/sitemap.xml\n', { status: 200 });
    }
    if (u.endsWith('/sitemap.xml')) {
      return new Response(
        '<sitemapindex><sitemap><loc>https://www.casagrande.edu.ec/sitemap-0.xml</loc></sitemap></sitemapindex>',
        { status: 200 },
      );
    }
    if (u.endsWith('/sitemap-0.xml')) {
      return new Response(
        '<urlset><url><loc>https://www.casagrande.edu.ec/posgrados</loc></url><url><loc>https://www.casagrande.edu.ec/posgrados/maestria-en-ciberseguridad</loc></url></urlset>',
        { status: 200 },
      );
    }
    if (init.method === 'HEAD') {
      return new Response(null, { status: u.includes('/posgrados/maestria-') ? 404 : 200 });
    }
    return new Response(
      `<!doctype html><html><head><title>Posgrados | Universidad Casa Grande</title>
      <meta name="description" content="La maestrías de Universidad Casa Grande buscan formar profesionales en Ecuador con programas en línea e híbridos de alta calidad académica y práctica directa.">
      <link rel="canonical" href="${u}"></head>
      <body><h1>Nuestros Posgrados</h1><p>Información de maestrías UCG.</p><script id="__NEXT_DATA__">{}</script></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );
  });

  try {
    const initialRes = await handleHttpRequest(
      new Request('https://api.example.test/api/public/admin/seo'),
      env,
    );
    assert.equal(initialRes.status, 200);
    const initialJson = await initialRes.json();
    assert.equal(initialJson.ok, true);
    assert.equal(initialJson.liveAudit.targets.length, 8);

    const badTarget = await handleHttpRequest(
      new Request('https://api.example.test/api/public/admin/seo/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1/secret' }),
      }),
      env,
    );
    assert.equal(badTarget.status, 400);

    const crawlRes = await handleHttpRequest(
      new Request('https://api.example.test/api/public/admin/seo/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkSitemap: true }),
      }),
      env,
    );
    assert.equal(crawlRes.status, 200);
    const crawlJson = await crawlRes.json();
    assert.equal(crawlJson.liveAudit.audits.length, 8);
    assert.ok(crawlJson.liveAudit.sitemapSummary.brokenUrls.length >= 1);
    assert.ok(crawlJson.liveAudit.recommendations.some((r) => r.id === 'fix-sitemap-404'));
    assert.ok(crawlJson.liveAudit.recommendations.some((r) => r.id === 'fix-hub-ssr-links'));

    const customUrl = 'https://www.casagrande.edu.ec/posgrado/maestria-en-administracion-publica';
    const addRes = await handleHttpRequest(
      new Request('https://api.example.test/api/public/admin/seo/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: customUrl, label: 'Administración Pública Oficial' }),
      }),
      env,
    );
    assert.equal(addRes.status, 200);
    const addJson = await addRes.json();
    assert.equal(addJson.addedUrl, customUrl);
    assert.equal(addJson.liveAudit.audits.length, 9);

    const analyzeRes = await handleHttpRequest(
      new Request('https://api.example.test/api/public/admin/seo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: 30,
          ids: [],
          focusLive: true,
          question: '¿Qué errores tiene casagrande.edu.ec/posgrados y cómo mejorar el sitemap?',
        }),
      }),
      env,
    );
    assert.equal(analyzeRes.status, 200);
    const analyzeJson = await analyzeRes.json();
    assert.equal(analyzeJson.liveAuditIncluded, true);
    assert.ok(analyzeJson.findings.length >= 1);

    const delRes = await handleHttpRequest(
      new Request(
        `https://api.example.test/api/public/admin/seo/targets?url=${encodeURIComponent(customUrl)}`,
        { method: 'DELETE' },
      ),
      env,
    );
    assert.equal(delRes.status, 200);
    const delJson = await delRes.json();
    assert.equal(delJson.liveAudit.audits.length, 8);
  } finally {
    db.close();
  }
});
