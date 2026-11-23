// Records the real product (public portal, admissions CRM demo, content engine)
// with Playwright. Every scenario only reads or previews: no form is submitted,
// no booking is created, and the CRM runs in its built-in fictitious demo mode.
//
//   BASE_URL=https://casa-grande-posgrados.francisco.chatgpt.site node capture.mjs
//   node capture.mjs chat crm-conversation        # optional: record only some clips
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'build', 'clips');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.BASE_URL || 'https://casa-grande-posgrados.francisco.chatgpt.site';
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
  // 1. Discover: the portal's promise, then the catalog entry point.
  home: async page => {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await pause(2200);
    await scrollTo(page, 560, 1300);
    await pause(900);
    await scrollTo(page, 1180, 1500);
    await pause(1000);
    await scrollTo(page, 0, 900);
    await pause(700);
    await glide(page, page.getByRole('link', { name: /Explorar maestrías/ }));
    await pause(900);
  },

  // 2. Compare: filter by area, then compare two programs side by side.
  catalog: async page => {
    await page.goto(BASE + '/programas', { waitUntil: 'load' });
    await pause(1800);
    await glide(page, page.locator('#area-filter'));
    await page.locator('#area-filter').selectOption({ label: 'Negocios' });
    await pause(1300);
    const compare = page.locator('input[aria-label^="Comparar"]:visible');
    await compare.nth(1).waitFor({ state: 'attached', timeout: 15000 });
    await glide(page, compare.nth(0));
    await compare.nth(0).check({ force: true });
    await pause(700);
    await glide(page, compare.nth(1));
    await compare.nth(1).check({ force: true });
    await pause(1600);
    await scrollTo(page, 260, 900);
    await pause(1500);
  },

  // 3. Ask: the public assistant answers from the institutional catalog.
  chat: async page => {
    await page.goto(BASE + '/financiamiento', { waitUntil: 'load' });
    await pause(1600);
    await glide(page, page.locator('#chat-launch'));
    await page.locator('#chat-launch').click();
    await pause(1100);
    await glide(page, page.getByRole('button', { name: '¿Cómo consulto el costo?' }));
    await page.getByRole('button', { name: '¿Cómo consulto el costo?' }).click();
    await pause(3200);
    await pause(1600);
  },

  // 4. Orient: three questions to find a fit.
  orientation: async page => {
    await page.goto(BASE + '/orientacion', { waitUntil: 'load' });
    await pause(1500);
    await glide(page, page.getByText('Tecnología', { exact: true }));
    await page.getByText('Tecnología', { exact: true }).click();
    await pause(700);
    await glide(page, page.getByRole('button', { name: 'Continuar' }));
    await page.getByRole('button', { name: 'Continuar' }).click();
    await pause(1300);
    for (let i = 0; i < 2; i++) {
      const option = page.locator('label').filter({ hasText: /./ }).locator('visible=true').nth(1);
      if (await option.count()) { await glide(page, option); await option.click().catch(() => {}); }
      await pause(700);
      const next = page.getByRole('button', { name: /Continuar|Ver resultados|Ver mis resultados/ });
      if (await next.count()) { await glide(page, next); await next.first().click().catch(() => {}); }
      await pause(1300);
    }
    await pause(1500);
  },

  // 5. Plan: the investment simulator with the user's own quote.
  simulator: async page => {
    await page.goto(BASE + '/financiamiento', { waitUntil: 'load' });
    await pause(1500);
    await glide(page, page.locator('#finance-program'));
    await page.locator('#finance-program').selectOption({ index: 1 });
    await pause(700);
    await glide(page, page.locator('#investment'));
    await page.locator('#investment').click();
    await page.locator('#investment').pressSequentially('9800', { delay: 140 });
    await pause(500);
    await glide(page, page.locator('#months'));
    await page.locator('#months').fill('');
    await page.locator('#months').pressSequentially('24', { delay: 160 });
    await pause(500);
    await glide(page, page.locator('#rate'));
    await page.locator('#rate').fill('');
    await page.locator('#rate').pressSequentially('8', { delay: 160 });
    await pause(1200);
    await glide(page, page.locator('#monthly'));
    await pause(2600);
  },

  // 6. Consent: a request form with channel-by-channel permissions. Not submitted.
  request: async page => {
    await page.goto(BASE + '/solicitar', { waitUntil: 'load' });
    await pause(1500);
    await glide(page, page.locator('input[name=name]'));
    await page.locator('input[name=name]').click();
    await page.locator('input[name=name]').pressSequentially('Valeria Ejemplo', { delay: 70 });
    await glide(page, page.locator('input[name=email]'));
    await page.locator('input[name=email]').click();
    await page.locator('input[name=email]').pressSequentially('ejemplo@correo.test', { delay: 50 });
    await glide(page, page.locator('select[name=program]'));
    await page.locator('select[name=program]').selectOption({ index: 1 });
    await pause(900);
    await scrollTo(page, 430, 1100);
    await pause(700);
    await glide(page, page.locator('input[name=consentEmail]'));
    await page.locator('input[name=consentEmail]').check({ force: true });
    await pause(500);
    await glide(page, page.locator('input[name=consentVoice]'));
    await page.locator('input[name=consentVoice]').uncheck({ force: true });
    await pause(2600);
  },

  // 7. Attract: the content engine's public plan and guides.
  editorial: async page => {
    await page.goto(BASE + '/motor-de-contenidos', { waitUntil: 'load' });
    await pause(2200);
    await scrollTo(page, 720, 1400);
    await pause(900);
    await scrollTo(page, 1500, 1800);
    await pause(900);
    await glide(page, page.getByRole('link', { name: 'Leer la guía' }));
    await pause(1800);
  },

  // 8. Qualify: paste a fictitious email and let the CRM extract the case.
  'crm-conversation': async page => {
    await page.goto(BASE + '/crm', { waitUntil: 'load' });
    await pause(1800);
    await glide(page, page.locator('a[data-view="conversaciones"]'));
    await page.locator('a[data-view="conversaciones"]').click();
    await pause(1200);
    await page.locator('#conversation-form').scrollIntoViewIfNeeded();
    await pause(700);
    await glide(page, page.getByRole('button', { name: 'Analizar conversación' }));
    await page.getByRole('button', { name: 'Analizar conversación' }).click();
    await pause(3200);
    await page.locator('#conversation-result').scrollIntoViewIfNeeded();
    await pause(900);
    await scrollTo(page, (await page.evaluate(() => window.scrollY)) + 380, 1400);
    await pause(2600);
  },

  // 9. Act: the case view with owner, next step, tasks and automation.
  'crm-case': async page => {
    await page.goto(BASE + '/crm', { waitUntil: 'load' });
    await pause(1500);
    const openCase = page.getByRole('button', { name: 'Abrir expediente' }).first();
    await openCase.waitFor({ state: 'visible', timeout: 20000 });
    await glide(page, openCase);
    await openCase.click({ force: true });
    await page.locator('#panel[open]').waitFor({ state: 'visible', timeout: 15000 });
    await pause(1500);
    await page.locator('#panel').hover({ position: { x: 300, y: 300 } });
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 260); await pause(900); }
    await pause(900);
    await page.keyboard.press('Escape');
    await pause(700);
    await glide(page, page.locator('a[data-view="agentes"]'));
    await page.locator('a[data-view="agentes"]').click();
    await pause(1800);
    await scrollTo(page, 0, 900);
    await pause(1200);
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
