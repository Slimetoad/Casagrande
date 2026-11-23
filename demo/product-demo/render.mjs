#!/usr/bin/env node
// Renders the motion-graphic demo frame by frame: the browser seeks the master timeline
// and each recording to the exact frame time, and the screenshot is piped into ffmpeg.
//
//   node render.mjs                       # full film -> build/product-demo.mp4
//   node render.mjs --still 2,42.5        # PNG frames -> build/still-<t>s.png (QA)
//   node render.mjs --fps 30 --out build/x.mp4
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(here, 'build');
const args = process.argv.slice(2);
const opt = (key, fallback) => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : fallback; };
const FPS = Number(opt('--fps', 30));
const outFile = path.resolve(here, opt('--out', 'build/product-demo.mp4'));
const stillAt = opt('--still', null); // comma-separated seconds, e.g. 2,9.5,14
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

// Measure each recording: total length, and the first painted frame (Playwright
// records from page creation, so the first frames are often a blank white page).
function probeDuration(file) {
  const text = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();
  return Number(text.trim());
}
function probeFirstPaint(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'fps=10,scale=64:36,format=gray', '-f', 'rawvideo', '-'],
    { maxBuffer: 256 * 1024 * 1024 });
  const frame = 64 * 36;
  const means = [];
  for (let i = 0; i + frame <= raw.length; i += frame) {
    let sum = 0;
    for (let j = 0; j < frame; j++) sum += raw[i + j];
    means.push(sum / frame);
  }
  if (!means.length || means[0] < 245) return 0; // content is already on screen at the start
  const first = means.findIndex(m => Math.abs(m - means[0]) > 6);
  return first < 0 ? 0 : Math.max(0, first / 10 - 0.1);
}

const manifest = JSON.parse(readFileSync(path.join(build, 'clips', 'manifest.json'), 'utf8'));
const clipDurations = {};
const clipTrims = {};
for (const clip of manifest) {
  const file = path.join(build, clip.file);
  clipDurations[clip.name] = probeDuration(file);
  clipTrims[clip.name] = +probeFirstPaint(file).toFixed(2);
  console.log(`clip ${clip.name.padEnd(18)} ${clipDurations[clip.name].toFixed(2)}s  trim ${clipTrims[clip.name]}s`);
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const narrationFile = path.join(build, 'narration.json');
const narration = existsSync(narrationFile) ? JSON.parse(readFileSync(narrationFile, 'utf8')) : {};
await page.addInitScript(({ d, t, n }) => { window.__clipDurations = d; window.__clipTrims = t; window.__narration = n; },
  { d: clipDurations, t: clipTrims, n: narration });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(pathToFileURL(path.join(here, 'index.html')).href + '?render=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });

const total = await page.evaluate(() => window.__duration);
console.log(`timeline ${total.toFixed(2)}s`);
const scenes = await page.evaluate(() => window.__scenes);
writeFileSync(path.join(build, 'timeline.json'), JSON.stringify({ total, scenes }, null, 2));
console.log(scenes.map(s => `${s.id} ${s.start}-${s.end}${s.rate ? ' @' + s.rate + 'x' : ''}`).join(' | '));

if (stillAt !== null) {
  mkdirSync(build, { recursive: true });
  for (const t of stillAt.split(',').map(Number)) {
    await page.evaluate(time => window.renderAt(time), t);
    const file = path.join(build, `still-${t}s.png`);
    await page.screenshot({ path: file, type: 'png' });
    console.log('still', file);
  }
  await browser.close();
  process.exit(0);
}

mkdirSync(path.dirname(outFile), { recursive: true });
const frames = Math.round(total * FPS);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
const started = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate(time => window.renderAt(time), i / FPS);
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(jpeg)) await once(ff.stdin, 'drain');
  if (i % 150 === 0) console.log(`frame ${i}/${frames} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
const [code] = await once(ff, 'close');
await browser.close();
if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
console.log('wrote', outFile);
