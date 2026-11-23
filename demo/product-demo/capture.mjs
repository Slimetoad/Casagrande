// Records the student acquisition engine (GitHub Pages portal + Admin) with Playwright.
// Run it against a LOCAL stack seeded with fictitious applicants (see README): the form
// scenario submits a lead, and the Admin shows every lead it holds, so never point this
// at production.
//
//   BASE_URL=http://localhost:8080 node capture.mjs
//   node capture.mjs crm lead                      # optional: record only some clips
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'build', 'clips');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:8080';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) throw new Error('Record against a local, fictitious stack only.');
const VIEW = { width: 1600, height: 900 };
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

// Visible cursor + click ripple, injected into every page so the recording reads as a guided demo.
const cursorInit = () => {
  const style = document.createElement('style');
  style.textContent = `
    #demo-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;
      transform:translate(-100px,-100px);transition:transform .12s linear}
    #demo-cursor svg{width:26px;height:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
    .demo-ripple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;z-index:2147483646;
      pointer-events:none;border:3px solid #ff8a00;animation:demo-ripple .6s ease-out forwards}
    @keyframes demo-ripple{from{transform:scale(.2);opacity:1}to{transform:scale(1.6);opacity:0}}`;
  const add = () => {
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L16 20l-3 1.4-3.4-7.6L4 17z" fill="#fff" stroke="#1e2324" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    window.addEventListener('mousemove', e => { cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    window.addEventListener('mousedown', e => {
      const r = document.createElement('div'); r.className = 'demo-ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
};

const pause = ms => new Promise(r => setTimeout(r, ms));

// Smooth, readable scrolling (the demo recording should not jump).
async function scrollTo(page, y, ms = 1100) {
  await page.evaluate(([y, ms]) => new Promise(resolve => {
    const start = window.scrollY, dist = y - start, t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, start + dist * e);
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  }), [y, ms]);
}

async function glide(page, locator) {
  await locator.first().scrollIntoViewIfNeeded();
  await locator.first().hover({ force: true });
  await pause(380);
}

const scenarios = {
  // 1. Attract: the portal's promise and the AI admissions officer line.
  portal: async page => {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await pause(2600);
    await glide(page, page.locator('#hero-program-count, h1').first());
    await page.evaluate(() => { const y = document.querySelector('#voz-ia').getBoundingClientRect().top + window.scrollY - 70; window.__y = y; });
    await scrollTo(page, await page.evaluate(() => window.__y), 1600);
    await pause(2600);
    await glide(page, page.locator('#copy-phone-btn'));
    await pause(1600);
  },

  // 2. Explore: 34 programs, instant search, area chips, open-enrollment filter.
  catalog: async page => {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await pause(800);
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#catalogo').getBoundingClientRect().top + window.scrollY - 70));
    await pause(1400);
    await glide(page, page.locator('#catalog-search'));
    await page.locator('#catalog-search').click();
    await page.locator('#catalog-search').pressSequentially('inteligencia', { delay: 110 });
    await pause(1800);
    await page.locator('#catalog-search').fill('');
    await pause(500);
    const chip = page.locator('[data-area-chip]').filter({ hasText: 'Negocios' }).first();
    await glide(page, chip);
    await chip.click();
    await pause(900);
    await glide(page, page.locator('#open-only-filter'));
    await page.locator('#open-only-filter').check({ force: true });
    await pause(1200);
    await scrollTo(page, await page.evaluate(() => window.scrollY + 360), 1100);
    await pause(1600);
  },

  // 3. Convert: a web inquiry lands in the CRM (local DB, fictitious applicant).
  form: async page => {
    await page.goto(BASE + '/?programa=maestria-en-ia-y-ciencia-de-datos#solicitar', { waitUntil: 'load' });
    await pause(1200);
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#solicitar').getBoundingClientRect().top + window.scrollY - 40));
    await pause(1000);
    const type = async (sel, text, delay = 55) => { await glide(page, page.locator(sel)); await page.locator(sel).click(); await page.locator(sel).pressSequentially(text, { delay }); };
    await type('#lead-name', 'Valentina Ríos Mejía');
    await type('#lead-email', 'valentina.rios@example.com', 35);
    await type('#lead-phone', '0990000109', 60);
    await type('#lead-city', 'Guayaquil');
    await glide(page, page.locator('#lead-consent-email'));
    await page.locator('#lead-consent-email').check({ force: true });
    await page.locator('#lead-consent-voice').check({ force: true });
    await pause(500);
    await glide(page, page.locator('#lead-submit-btn'));
    await page.locator('#lead-submit-btn').click();
    await page.locator('#lead-success').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await page.locator('#lead-success').scrollIntoViewIfNeeded().catch(() => {});
    await pause(2600);
  },

  // 4. Organize: CRM KPIs, six-stage pipeline, call activity.
  crm: async page => {
    await page.goto(BASE + '/admin/#crm', { waitUntil: 'load' });
    await page.locator('[data-lead-id]').first().waitFor({ timeout: 20000 });
    await pause(2600);
    const card = page.locator('article[data-lead-id]').filter({ hasText: 'Valentina' }).first();
    await card.hover({ force: true });
    await pause(700);
    const sel = card.locator('select').first();
    if (await sel.count()) { await sel.selectOption({ label: 'En orientación' }).catch(() => {}); }
    await pause(1600);
    await glide(page, page.locator('[data-crm-view="activity"]'));
    await page.locator('[data-crm-view="activity"]').click();
    await pause(2200);
    await scrollTo(page, 380, 1300);
    await pause(1800);
  },

  // 5. Act: one applicant record — verified call intelligence, follow-up, tasks.
  lead: async page => {
    await page.goto(BASE + '/admin/#crm', { waitUntil: 'load' });
    await page.locator('[data-lead-id]').first().waitFor({ timeout: 20000 });
    await pause(1000);
    const card = page.locator('article[data-lead-id]').filter({ hasText: 'Gabriela' }).first();
    await glide(page, card);
    await card.click();
    await page.locator('#candidate-drawer').waitFor({ state: 'visible', timeout: 10000 });
    await pause(2800);
    await glide(page, page.locator('[data-drawer-tab="nurture"]'));
    await page.locator('[data-drawer-tab="nurture"]').click();
    await pause(900);
    await glide(page, page.locator('[data-template="resumen"]'));
    await page.locator('[data-template="resumen"]').click();
    await pause(2400);
    await glide(page, page.locator('[data-drawer-tab="tasks"]'));
    await page.locator('[data-drawer-tab="tasks"]').click();
    await pause(2200);
  },

  // 6. Grow: Ecuador search demand and the evidence-bound analysis.
  seo: async page => {
    await page.goto(BASE + '/admin/#seo', { waitUntil: 'load' });
    await page.locator('#seo-table-body tr').first().waitFor({ timeout: 20000 });
    await pause(2400);
    await scrollTo(page, await page.evaluate(() => { const h = [...document.querySelectorAll('h2,h3')].find(e => /Matriz de Oportunidad/.test(e.textContent)); return h ? h.getBoundingClientRect().top + window.scrollY - 90 : 600; }), 1500);
    await pause(2600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(400);
    await glide(page, page.locator('#seo-select-top-btn'));
    await page.locator('#seo-select-top-btn').click();
    await pause(700);
    const chip = page.locator('[data-seo-q]').first();
    await glide(page, chip);
    await chip.click();
    await pause(500);
    await glide(page, page.locator('#seo-analyze-btn'));
    await page.locator('#seo-analyze-btn').click();
    await pause(3200);
    await page.locator('#seo-findings-box').scrollIntoViewIfNeeded().catch(() => {});
    await pause(2400);
  },

  // 7. Publish: the content engine turns demand into a draft guide.
  content: async page => {
    await page.goto(BASE + '/admin/#content', { waitUntil: 'load' });
    await page.locator('[data-quick-draft]').first().waitFor({ timeout: 20000 });
    await pause(2200);
    const draft = page.locator('[data-quick-draft]').first();
    await glide(page, draft);
    await draft.click();
    await pause(3200);
    await glide(page, page.locator('[data-studio-mode="preview"]'));
    await page.locator('[data-studio-mode="preview"]').click();
    await pause(1600);
    await page.mouse.wheel(0, 320);
    await pause(2200);
  },
};

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(scenarios);
const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
const manifest = [];

for (const name of names) {
  const dir = path.join(outDir, '_raw-' + name);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, locale: 'es-EC', timezoneId: 'America/Guayaquil',
    recordVideo: { dir, size: VIEW }, colorScheme: 'light' });
  await context.addInitScript(cursorInit);
  const page = await context.newPage();
  const created = Date.now();
  try {
    await scenarios[name](page);
  } catch (error) {
    console.error(`! ${name}: ${error.message.split('\n')[0]}`);
  }
  const video = page.video();
  const ended = Date.now();
  await context.close();
  const rawPath = await video.path();
  const finalPath = path.join(outDir, name + '.webm');
  renameSync(rawPath, finalPath);
  manifest.push({ name, file: `clips/${name}.webm`, durationSec: +((ended - created) / 1000).toFixed(2) });
  console.log(`ok ${name} ${((ended - created) / 1000).toFixed(1)}s`);
}

await browser.close();
const previous = path.join(outDir, 'manifest.json');
const merged = existsSync(previous) ? JSON.parse(require('node:fs').readFileSync(previous, 'utf8')) : [];
const byName = new Map(merged.map(c => [c.name, c]));
for (const c of manifest) byName.set(c.name, c);
writeFileSync(previous, JSON.stringify([...byName.values()], null, 2));
