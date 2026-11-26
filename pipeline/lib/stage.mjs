// The stage: a film's page open in headless Chromium. The page contract is small:
//   window.DF = { duration, seek(t) }   and   <html data-ready="1"> once fonts and DOM are in place.
// Text is read back from the live DOM, so checks see exactly what a viewer would.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);

// With this class on <html> every glyph turns transparent and nothing moves: a screenshot then shows
// only what lies behind and around the text. Borders and shapes drawn in the text colour stay.
const NO_TEXT_CSS = `
html.df-no-text *, html.df-no-text *::before, html.df-no-text *::after {
  -webkit-text-fill-color: transparent !important;
  -webkit-text-stroke-color: transparent !important;
  text-decoration-color: transparent !important;
  text-shadow: none !important;
}
html.df-no-text svg text, html.df-no-text svg tspan, html.df-no-text svg textPath {
  fill: transparent !important;
  stroke: transparent !important;
}`;

// Evals only: a font setup that hides every font able to draw Chinese, as on a machine that has none.
// It works through fontconfig, which is what the browser asks for fonts on Linux.
const NO_CJK_FONTS = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <selectfont>
    <rejectfont>
      <pattern><patelt name="charset"><charset><int>0x6c38</int></charset></patelt></pattern>
    </rejectfont>
  </selectfont>
</fontconfig>
`;

export async function openStage({ outDir, vertical, draft = false, noCjkFonts = false }) {
  const { chromium } = require('playwright');
  const server = await startServer({ '/runtime/': vertical.runtimeDir, '/film/': path.join(outDir, 'build') });
  const launch = {};
  if (noCjkFonts) {
    if (process.platform !== 'linux') throw new Error('fonts can only be taken away on Linux');
    const conf = path.join(outDir, 'build', 'no-cjk-fonts.conf');
    fs.writeFileSync(conf, NO_CJK_FONTS);
    launch.env = { ...process.env, FONTCONFIG_FILE: conf };
  }
  const browser = await chromium.launch(launch);
  const scale = draft ? 0.5 : 1;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${server.origin}/runtime/index.html`);
  try {
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 15000 });
  } catch {
    await browser.close();
    await server.close();
    throw new Error(`the film page did not become ready${errors.length ? `: ${errors.join('; ')}` : ''}`);
  }
  await page.addStyleTag({ content: NO_TEXT_CSS });
  const duration = await page.evaluate(() => window.DF.duration);
  return {
    page,
    scale,
    errors,
    duration,
    seek: (t) => page.evaluate((x) => window.DF.seek(x), t),
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}

/**
 * Runs in the page: every visible piece of text with its box, opacity, colour and role.
 * With withChars, each text also carries the boxes of its letters and digits (up to 48 of them).
 */
function readTexts(withChars = false) {
  const root = document.getElementById('stage') || document.body;
  const ids = (window.__dfIds ||= new WeakMap());
  window.__dfSeq ||= 0;
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.replace(/\s+/g, ' ').trim();
    const el = n.parentElement;
    if (!text || !el || el.getClientRects().length === 0) continue;
    let opacity = 1;
    let visible = true;
    let role = '';
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        visible = false;
        break;
      }
      opacity *= parseFloat(cs.opacity);
      if (!role && a.dataset.dfRole) role = a.dataset.dfRole;
    }
    if (!visible || opacity < 0.02) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (!ids.has(el)) ids.set(el, ++window.__dfSeq);
    const cs = getComputedStyle(el);
    // A text box is as tall as the font's ascent plus descent, well over the glyphs themselves.
    // Trim it to the em square so neighbours are judged by where the ink is.
    const fontSize = parseFloat(cs.fontSize);
    const lineBox = range.getClientRects()[0];
    const inset = lineBox ? Math.max(0, (lineBox.height - fontSize) / 2) : 0;
    const boxEl = el.closest('[data-df-box]');
    const b = boxEl ? boxEl.getBoundingClientRect() : null;
    const sceneEl = el.closest('[data-scene]');
    // Pieces of one run of text sit side by side by design: inline elements share their block's run.
    // An SVG <text> is placed by coordinates and is a run of its own.
    let flowEl = el instanceof SVGElement ? el.closest('text') || el : el;
    while (!(flowEl instanceof SVGElement) && flowEl.parentElement && getComputedStyle(flowEl).display.startsWith('inline')) flowEl = flowEl.parentElement;
    if (!ids.has(flowEl)) ids.set(flowEl, ++window.__dfSeq);
    let chars;
    if (withChars) {
      // Letters and digits always leave ink; punctuation and spaces may not.
      const picks = [];
      let at = 0;
      for (const c of n.nodeValue) {
        if (/[\p{L}\p{N}]/u.test(c)) picks.push([at, c.length]);
        at += c.length;
      }
      const every = Math.max(1, Math.ceil(picks.length / 48));
      chars = [];
      for (let k = 0; k < picks.length; k += every) {
        range.setStart(n, picks[k][0]);
        range.setEnd(n, picks[k][0] + picks[k][1]);
        const c = range.getBoundingClientRect();
        if (c.width >= 1 && c.height >= 1) chars.push([c.left, c.top, c.width, c.height]);
      }
    }
    out.push({
      chars,
      id: ids.get(el),
      flow: ids.get(flowEl),
      text,
      role,
      opacity: Math.round(opacity * 1000) / 1000,
      x: r.left,
      y: r.top + inset,
      w: r.width,
      h: r.height - 2 * inset,
      color: el instanceof SVGElement ? cs.fill : cs.color,
      fontSize,
      box: b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null,
      scene: sceneEl ? sceneEl.dataset.scene : '',
    });
  }
  return out;
}

/** Runs in the page: every shape that declares the data value it stands for. */
function readMarks() {
  const out = [];
  for (const el of document.querySelectorAll('[data-df-value]')) {
    if (el.getClientRects().length === 0) continue;
    const r = el.getBoundingClientRect();
    const sceneEl = el.closest('[data-scene]');
    out.push({
      value: Number(el.dataset.dfValue),
      group: el.dataset.dfGroup || 'default',
      scene: sceneEl ? sceneEl.dataset.scene : '',
      w: r.width,
      h: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    });
  }
  return out;
}

/**
 * Runs in the page, on two screenshots of one moment: the frame as shown, and the same frame with the
 * glyphs made transparent. For each text, in the order given:
 *   ratio  - contrast against the pixels just outside its box
 *   behind - the share of its box where, with the glyphs gone, something stands out from the box's own
 *            background: a line, a shape or the edge of a shape running through the text
 *   hidden - the share of its letters and digits that leave no ink at all: something sits on top of
 *            them, whatever its colour, or they are cut off
 */
async function measurePixels({ png, plate, items, scale }) {
  const load = async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const g = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return { px: g.getImageData(0, 0, bmp.width, bmp.height).data, W: bmp.width, H: bmp.height };
  };
  const { px, W, H } = await load(png);
  const back = (await load(plate)).px;
  const LIN = Float64Array.from({ length: 256 }, (_, v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  const lum = (c) => 0.2126 * LIN[Math.round(c[0])] + 0.7152 * LIN[Math.round(c[1])] + 0.0722 * LIN[Math.round(c[2])];
  const lumAt = (data, i) => 0.2126 * LIN[data[i]] + 0.7152 * LIN[data[i + 1]] + 0.0722 * LIN[data[i + 2]];
  const median = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return items.map((it) => {
    const x0 = Math.round(it.x * scale) - 2;
    const y0 = Math.round(it.y * scale) - 2;
    const x1 = Math.round((it.x + it.w) * scale) + 2;
    const y1 = Math.round((it.y + it.h) * scale) + 2;
    const ch = [[], [], []];
    const take = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      ch[0].push(px[i]);
      ch[1].push(px[i + 1]);
      ch[2].push(px[i + 2]);
    };
    for (let x = x0; x <= x1; x++) {
      take(x, y0);
      take(x, y1);
    }
    for (let y = y0; y <= y1; y++) {
      take(x0, y);
      take(x1, y);
    }
    if (!ch[0].length) return { ratio: null, behind: null, hidden: null };
    const bg = ch.map(median);
    const [r, gg, b, a = 1] = (it.color.match(/[\d.]+/g) || []).map(Number);
    const fg = [r, gg, b].map((v, i) => v * a + bg[i] * (1 - a));
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;

    // Inside the box. Large boxes are read on a coarser grid; a few thousand pixels say enough.
    const bx0 = Math.max(0, Math.floor(it.x * scale));
    const by0 = Math.max(0, Math.floor(it.y * scale));
    const bx1 = Math.min(W, Math.ceil((it.x + it.w) * scale));
    const by1 = Math.min(H, Math.ceil((it.y + it.h) * scale));
    const step = Math.max(1, Math.floor(Math.sqrt(((bx1 - bx0) * (by1 - by0)) / 6000)));
    const at = [];
    for (let y = by0; y < by1; y += step) for (let x = bx0; x < bx1; x += step) at.push((y * W + x) * 4);
    if (!at.length) return { ratio, behind: null, hidden: null };
    const own = [0, 1, 2].map((k) => median(at.map((i) => back[i + k])));
    const ownLum = lum(own);
    let standsOut = 0;
    for (const i of at) {
      const l = lumAt(back, i);
      const contrast = (Math.max(l, ownLum) + 0.05) / (Math.min(l, ownLum) + 0.05);
      const far = Math.max(Math.abs(back[i] - own[0]), Math.abs(back[i + 1] - own[1]), Math.abs(back[i + 2] - own[2]));
      if (contrast >= 1.5 || far >= 80) standsOut++;
    }
    // Character by character: does drawing the glyph change any pixel of its own cell?
    let unseen = 0;
    for (const [cx, cy, cw, chh] of it.chars ?? []) {
      let inked = false;
      const yEnd = Math.min(H, Math.ceil((cy + chh) * scale));
      const xEnd = Math.min(W, Math.ceil((cx + cw) * scale));
      for (let y = Math.max(0, Math.floor(cy * scale)); y < yEnd && !inked; y++) {
        for (let x = Math.max(0, Math.floor(cx * scale)); x < xEnd; x++) {
          const i = (y * W + x) * 4;
          if (Math.max(Math.abs(px[i] - back[i]), Math.abs(px[i + 1] - back[i + 1]), Math.abs(px[i + 2] - back[i + 2])) > 24) {
            inked = true;
            break;
          }
        }
      }
      if (!inked) unseen++;
    }
    const hidden = it.chars?.length ? Math.round((unseen / it.chars.length) * 1000) / 1000 : null;
    return { ratio, behind: Math.round((standsOut / at.length) * 1000) / 1000, hidden };
  });
}

/** Runs in the page: the share of pixels that clearly differ between two screenshots. */
async function pixelDifference({ a, b }) {
  const load = async (png) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const g = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, bmp.width, bmp.height);
  };
  const A = await load(a);
  const B = await load(b);
  if (A.width !== B.width || A.height !== B.height) return 1;
  let strong = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > 32) strong++;
  }
  return strong / (A.width * A.height);
}

/**
 * Runs in the page, on a run of screenshots of one region taken at even steps of time: how much the
 * region changes from each shot to the next. mad is the mean absolute difference over the region's
 * pixels and channels (0-255); moved counts pixels whose largest channel difference passes 16.
 */
async function changeRun({ shots }) {
  const load = async (png) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const g = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, bmp.width, bmp.height).data;
  };
  const frames = [];
  for (const s of shots) frames.push(await load(s));
  const out = [];
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1];
    const b = frames[k];
    let sum = 0;
    let moved = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d0 = Math.abs(a[i] - b[i]);
      const d1 = Math.abs(a[i + 1] - b[i + 1]);
      const d2 = Math.abs(a[i + 2] - b[i + 2]);
      sum += d0 + d1 + d2;
      if (Math.max(d0, d1, d2) > 16) moved++;
    }
    out.push({ mad: sum / ((a.length / 4) * 3), moved });
  }
  return out;
}

/** The cues the page declared: [{index, t, kind, scene}]. */
export const readCues = (stage) => stage.page.evaluate(() => window.DF.cues ?? []);

// How far either side of a cue to look for the movement it belongs to, and how finely.
export const CUE_WINDOW = 0.4;
const CUE_STEP = 1 / 60;

/**
 * For each placed effect, find when its element on screen changes fastest: screenshots of the element's
 * region every 1/60 s across the cue window, then the step with the largest change. That moment is
 * where the sound belongs: the launch of a move, or its impact. Returns
 * [{cue, t, visual, change}] with change in CSS pixels that visibly moved during that step.
 */
export async function measureCues(stage, effects) {
  const out = [];
  for (const e of effects) {
    const rectAt = async (t) => {
      await stage.seek(Math.max(0, t));
      return stage.page.evaluate((i) => {
        const r = window.__dfCueEls[i].getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      }, e.cue);
    };
    // The element may still be moving into place at the cue: take its region then and once it has settled.
    const boxes = [await rectAt(e.t), await rectAt(e.t + CUE_WINDOW)].filter((b) => b.w > 0 && b.h > 0);
    if (!boxes.length) {
      out.push({ cue: e.cue, t: e.t, visual: null, change: 0 });
      continue;
    }
    const pad = 12;
    const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
    const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
    const x1 = Math.min(1920, Math.max(...boxes.map((b) => b.x + b.w)) + pad);
    const y1 = Math.min(1080, Math.max(...boxes.map((b) => b.y + b.h)) + pad);
    const clip = { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
    const steps = Math.round((2 * CUE_WINDOW) / CUE_STEP);
    const times = Array.from({ length: steps + 1 }, (_, k) => e.t - CUE_WINDOW + k * CUE_STEP);
    const shots = [];
    for (const t of times) {
      await stage.seek(Math.min(Math.max(0, t), stage.duration - 0.001));
      shots.push((await stage.page.screenshot({ type: 'png', clip })).toString('base64'));
    }
    const run = await stage.page.evaluate(changeRun, { shots });
    let best = 0;
    run.forEach((r, k) => {
      if (r.mad > run[best].mad) best = k;
    });
    out.push({
      cue: e.cue,
      t: e.t,
      visual: Math.round(((times[best] + times[best + 1]) / 2) * 1000) / 1000,
      change: Math.round(run[best].moved / stage.scale ** 2),
    });
  }
  return out;
}

/** Runs in the page: are CJK glyphs really drawn, or is the font falling back to empty boxes? */
function cjkGlyphsDraw() {
  const family = getComputedStyle(document.getElementById('stage') || document.body).fontFamily;
  const draw = (ch) => {
    const c = new OffscreenCanvas(64, 64);
    const g = c.getContext('2d');
    g.font = `48px ${family}`;
    g.textBaseline = 'top';
    g.fillText(ch, 4, 4);
    return g.getImageData(0, 0, 64, 64).data;
  };
  const glyph = draw('永');
  const missing = draw('￿');
  let ink = 0;
  let same = true;
  for (let i = 3; i < glyph.length; i += 4) {
    if (glyph[i]) ink++;
    if (glyph[i] !== missing[i]) same = false;
  }
  return ink > 0 && !same;
}

export const SAMPLE_STEP = 0.25;

/**
 * Walk the film once: read text on a fixed grid (plus the midpoint of every narration line and
 * scene), measure contrast and what lies behind each text once a second, read data marks once each scene has settled, tile a
 * contact sheet for the agent to look at, and redraw a few moments to see that they repeat.
 */
export async function sampleFilm(stage, timeline, { contactFile } = {}) {
  const times = new Map();
  const gridCount = Math.floor(timeline.duration / SAMPLE_STEP + 1e-6);
  for (let i = 0; i <= gridCount; i++) times.set(Math.min(i * SAMPLE_STEP, timeline.duration - 0.001).toFixed(3), { grid: true });
  for (const scene of timeline.scenes) {
    const mid = ((scene.start + scene.end) / 2).toFixed(3);
    if (!times.has(mid)) times.set(mid, { grid: false });
    // Late in the scene every animation has finished and the exit fade has not started.
    const settled = Math.max(scene.start, scene.end - 0.4).toFixed(3);
    times.set(settled, { ...(times.get(settled) ?? { grid: false }), marks: true });
    for (const line of scene.lines) {
      const m = ((line.start + line.end) / 2).toFixed(3);
      if (!times.has(m)) times.set(m, { grid: false });
    }
  }
  const order = [...times.keys()].map(Number).sort((a, b) => a - b);

  const sheetEvery = Math.max(2, Math.ceil(timeline.duration / 24));
  let sheet = null;
  let sheetFrames = 0;
  if (contactFile) {
    const cols = 4;
    const rows = Math.ceil((Math.floor(timeline.duration / sheetEvery) + 1) / cols);
    sheet = spawn(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '1', '-c:v', 'mjpeg', '-i', '-',
        '-vf', `scale=480:-2,tile=${cols}x${rows}:padding=6:margin=6:color=0x202020`, '-frames:v', '1', '-q:v', '3', contactFile],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    sheet.stdin.on('error', () => {});
  }

  const samples = [];
  for (const t of order) {
    await stage.seek(t);
    const meta = times.get(t.toFixed(3));
    const onSecond = meta.grid && Math.abs(t - Math.round(t)) < 1e-6;
    const texts = await stage.page.evaluate(readTexts, onSecond);
    if (onSecond) {
      const settled = texts.filter((x) => x.opacity >= 0.95 && x.role !== 'animating');
      if (settled.length) {
        const png = (await stage.page.screenshot({ type: 'png' })).toString('base64');
        await stage.page.evaluate(() => document.documentElement.classList.add('df-no-text'));
        const plate = (await stage.page.screenshot({ type: 'png' })).toString('base64');
        await stage.page.evaluate(() => document.documentElement.classList.remove('df-no-text'));
        const measured = await stage.page.evaluate(measurePixels, { png, plate, items: settled, scale: stage.scale });
        settled.forEach((x, i) => {
          x.contrast = measured[i].ratio;
          x.behind = measured[i].behind;
          x.hidden = measured[i].hidden;
        });
      }
      for (const x of texts) delete x.chars; // only needed for the measurement above
      if (sheet && Math.round(t) % sheetEvery === 0) {
        sheet.stdin.write(await stage.page.screenshot({ type: 'jpeg', quality: 85 }));
        sheetFrames++;
      }
    }
    samples.push({ t, grid: meta.grid, texts, marks: meta.marks ? await stage.page.evaluate(readMarks) : null });
  }
  if (sheet) {
    await new Promise((resolve) => {
      sheet.on('close', resolve);
      sheet.stdin.end();
    });
  }
  // The picture must depend on time alone: draw a moment, go elsewhere, come back, compare.
  // The browser itself is not bit-exact (a few dozen anti-aliased pixels can differ on a redraw),
  // so the comparison counts clearly different pixels instead of comparing bytes.
  const repeat = [];
  const shot = () => stage.page.screenshot({ type: 'png' });
  for (const f of [0.3, 0.55, 0.8]) {
    const t = Math.round(timeline.duration * f * 30) / 30;
    await stage.seek(t);
    const first = await shot();
    await stage.seek(Math.max(0, t - 1.7));
    await stage.seek(Math.min(timeline.duration - 0.001, t + 2.3));
    await stage.seek(t);
    const second = await shot();
    const changed = first.equals(second) ? 0 : await stage.page.evaluate(pixelDifference, { a: first.toString('base64'), b: second.toString('base64') });
    repeat.push({ t, changed });
  }
  const cjkOk = await stage.page.evaluate(cjkGlyphsDraw);
  return { samples, repeat, cjkOk, sheetFrames, pageErrors: stage.errors };
}
