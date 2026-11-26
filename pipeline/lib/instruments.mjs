// Instruments for the score, each built from a physical description: struck strings, plucked strings,
// bowed bars, membranes. Ported to JavaScript (mono) from the soundtrack code of "The Last Page"
// (github.com/ChetasLua/the-last-page, audio/inst.py: piano_note, harp_note, bowed_bar, timp, bassdrum).
// Changes from the original: one channel instead of a stereo pair; fewer partials and notes cut once the
// damper has done its work, so that a minute of score renders in seconds in plain JavaScript.
import { SR, bp, db, fade, lp, modes, mtof, ns, rng, slow, white } from './dsp.mjs';

/** Soundboard mobility: a smooth deterministic ripple over frequency, in dB, under a broad response. */
function board(f, seed = 5) {
  const r = rng(seed);
  const waves = Array.from({ length: 14 }, () => [r.normal(0, 0.9), r.uniform(2, 16), r.uniform(0, 6.28)]);
  const lfPts = [40, 70, 110, 160, 260, 400, 1000, 2500, 5000, 10000].map(Math.log2);
  const dbPts = [-18, -10, -6, -3.5, -0.5, 0, -1, -3, -6, -14];
  return f.map((v) => {
    const lf = Math.log2(Math.max(v, 20));
    let y = waves.reduce((acc, [a, w, p]) => acc + a * Math.sin(lf * w + p), 0);
    let j = 0;
    while (j < lfPts.length - 2 && lf > lfPts[j + 1]) j++;
    const u = Math.min(1, Math.max(0, (lf - lfPts[j]) / (lfPts[j + 1] - lfPts[j])));
    y += dbPts[j] + (dbPts[j + 1] - dbPts[j]) * u;
    return y;
  });
}

/**
 * A felt piano note: two or three unison strings, each with a fast prompt decay and a slow aftersound,
 * stiff-string partials, a felt hammer that rolls off the top, the damper falling at `hold` seconds,
 * and the mechanics (hammer knock through the soundboard, felt rub, key bed).
 */
export function piano(m, vel, hold, seed, { maxPartials = 28 } = {}) {
  const r = rng(seed);
  const f0 = mtof(m);
  const B = m >= 40 ? 1e-4 * 2 ** ((m - 40) / 11) : 1e-4 * (1 + ((40 - m) / 15) ** 2);
  let npar = 1;
  while (npar < maxPartials) {
    const k = npar + 1;
    if (k * f0 * Math.sqrt(1 + B * k * k) > 9500) break;
    npar = k;
  }
  const ks = Array.from({ length: npar }, (_, i) => i + 1);
  const fk = ks.map((k) => (k * f0 * Math.sqrt(1 + B * k * k)) / Math.sqrt(1 + B));
  const strike = 0.118 + 0.02 * r.uniform(-1, 1);
  const fh = (270 + 520 * vel) * (f0 / 262) ** 0.42;
  const brd = board(fk);
  let amp = ks.map((k, i) => ((Math.abs(Math.sin(k * Math.PI * strike)) + 0.06) / Math.sin(Math.PI * strike)) * (1 + (fk[i] / fh) ** 2) ** -0.95 * db(brd[i]) * k ** 0.12 * db(r.normal(0, 1.2)));
  const norm = Math.sqrt(amp.reduce((a, v) => a + v * v, 0));
  amp = amp.map((v) => v / norm);
  const T1 = 7.4 * 2 ** (-(m - 60) / 19);
  const tk = ks.map((k, i) => T1 / (1 + 0.13 * (k - 1) + 0.006 * (k - 1) ** 2 + (fk[i] / 5200) ** 2));
  const h = ns(hold);
  const n = Math.min(ns(Math.min(T1 * 3, 16)), h + ns(1.2));
  const nstr = m < 33 ? 1 : m < 45 ? 2 : 3;
  const det = { 1: [0], 2: [-0.28, 0.34], 3: [-0.27, 0.02, 0.24] }[nstr];
  const wts = { 1: [1], 2: [0.56, 0.44], 3: [0.46, 0.33, 0.21] }[nstr];
  const tau = 0.0016 * (1 + (1 - vel)) * (262 / f0) ** 0.25;
  const f = [];
  const a = [];
  const t60 = [];
  const ph = [];
  const att = [];
  for (let s = 0; s < nstr; s++) {
    const cents = det[s] * r.uniform(0.75, 1.3);
    [[1, 1], [nstr > 1 ? 0.24 : 0.14, 3]].forEach(([g, mul], stage) => {
      for (let i = 0; i < npar; i++) {
        f.push(fk[i] * 2 ** ((cents + 0.25 * stage) / 1200));
        a.push(amp[i] * wts[s] * g * db(r.normal(0, 0.8)));
        t60.push(tk[i] * mul * r.uniform(0.9, 1.1));
        ph.push(r.normal(0, 0.25) + 0.9 * stage * r.uniform(-1, 1));
        att.push(tau * (ks[i] < 3 ? 1.4 : 1));
      }
    });
  }
  let out = modes(n, f, a, t60, { phase: ph, att });
  // The damper: the tone dulls and dies over a tenth of a second or so.
  if (h < n) {
    const td = 0.13 + 0.16 * Math.max(0, (60 - m) / 30);
    const tail = out.slice(h);
    const dull = lp(tail, 420);
    for (let i = 0; i < tail.length; i++) {
      const t = i / SR;
      const mix = Math.exp(-t / 0.03);
      out[h + i] = (tail[i] * mix + dull[i] * (1 - mix)) * Math.exp(-t / td);
    }
    fade(out, 0, 0.05);
  } else {
    fade(out, 0, 0.6);
  }
  const g = vel ** 1.55 * 0.5;
  for (let i = 0; i < n; i++) out[i] *= g;
  // Mechanics.
  const nn = Math.min(ns(0.35), n);
  const kf = [71, 96, 128, 163, 205, 248, 305, 372, 455, 560, 690, 860].map((v) => v * r.uniform(0.97, 1.03));
  const ka = [0.5, 0.9, 1, 0.8, 0.9, 0.7, 0.5, 0.42, 0.3, 0.2, 0.14, 0.08].map((v) => v * r.uniform(0.6, 1.3));
  const knock = modes(nn, kf, ka, kf.map((_, i) => 0.16 - (0.11 * i) / 11), { seed: seed + 1, att: 0.0012, phase: 0 });
  const rub = bp(white(nn, seed + 2), 400, 5200);
  const bed = modes(nn, [104, 149, 231, 338, 512].map((v) => v * r.uniform(0.96, 1.04)), [1, 0.9, 0.6, 0.35, 0.2], [0.07, 0.06, 0.05, 0.04, 0.03], { seed: seed + 3, att: 0.001, phase: 0 });
  const d = ns(0.014 + 0.02 * (1 - vel));
  for (let i = 0; i < nn; i++) {
    const t = i / SR;
    out[i] += 0.019 * vel ** 1.25 * knock[i] + 0.052 * vel ** 1.1 * rub[i] * Math.exp(-t / 0.011) * (1 - Math.exp(-t / 0.002));
    if (i + d < n) out[i + d] += 0.011 * vel * bed[i];
  }
  return out;
}

/** A harp string: plucked near its middle, a little stiff, the gut and the soundbox in the attack. */
export function harp(m, vel, seed, { hold = 4, maxPartials = 36 } = {}) {
  const r = rng(seed);
  const f0 = mtof(m);
  const B = 3e-5;
  const K = Math.min(Math.floor(11000 / f0), maxPartials);
  const ks = Array.from({ length: K }, (_, i) => i + 1);
  const fk = ks.map((k) => k * f0 * Math.sqrt(1 + B * k * k));
  const pos = r.uniform(0.36, 0.46);
  const fc = (1100 + 2600 * vel) * (f0 / 262) ** 0.25;
  const a = ks.map((k, i) => ((Math.abs(Math.sin(k * Math.PI * pos)) / k ** 1.25 / (1 + (fk[i] / fc) ** 2) ** 0.8 + 0.02 / k) * db(r.normal(0, 1.5))));
  const T = Math.min(6, Math.max(0.5, 3.6 * (262 / f0) ** 0.55));
  const tk = ks.map((k, i) => T / (1 + 0.22 * (k - 1) + (fk[i] / 3800) ** 1.6));
  const n = ns(Math.min(T * 1.3, hold + 0.5));
  const x = modes(n, fk, a, tk, { seed, att: 0.0007, phase: 0.2 });
  const ten = Math.min(10, K);
  const y = modes(n, fk.slice(0, ten).map((v) => v * 2 ** (r.normal(0, 0.8) / 1200)), a.slice(0, ten), tk.slice(0, ten).map((v) => v * 1.8), { seed: seed + 1, att: 0.004 });
  for (let i = 0; i < n; i++) x[i] += 0.35 * y[i];
  const q = Math.min(ns(0.12), n);
  const nz = bp(white(q, seed + 2), 900, 5500);
  const box = modes(q, [118, 170, 235, 330, 470], [0.6, 1, 0.8, 0.5, 0.3], [0.1, 0.09, 0.07, 0.06, 0.05], { seed: seed + 3, att: 0.0015, phase: 0 });
  for (let i = 0; i < q; i++) x[i] += nz[i] * Math.exp(-i / SR / 0.006) * 0.1 * vel + box[i] * 0.1;
  const g = vel ** 1.2 * 0.55;
  for (let i = 0; i < n; i++) x[i] *= g;
  return fade(x, 0, 0.25);
}

/** A vibraphone bar under a bow: a slow stick-slip swell, 1:4:10 tuning, gentle beating. A soft pad. */
export function bowedBar(m, dur, vel, seed) {
  const r = rng(seed);
  const n = ns(dur + 2.4);
  const f0 = mtof(m);
  const x = new Float64Array(n);
  for (const [ra, a] of [[1, 1], [4.01, 0.06], [9.9, 0.012], [1.0012, 0.18]]) {
    const ph0 = r.uniform(0, 6.28);
    const wob = slow(n, 4, seed + Math.round(ra * 10));
    const w = (2 * Math.PI * f0 * ra) / SR;
    for (let i = 0; i < n; i++) x[i] += a * Math.sin(w * i + ph0) * (1 + 0.12 * wob[i]);
  }
  const nz = bp(white(n, seed + 9), f0 * 0.97, f0 * 1.03);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = Math.min(1, t / (dur * 0.75));
    const e = (u * u * (3 - 2 * u)) ** 1.4 * (t > dur ? Math.exp(-(t - dur) / 0.75) : 1);
    x[i] = (x[i] + 0.25 * nz[i]) * e * vel * 0.4;
  }
  return fade(x, 0.03, 0.5);
}

/** A timpani stroke: the membrane's inharmonic modes, the air inside, the stick on the head. */
export function timp(m, vel, seed, tail = 3) {
  const r = rng(seed);
  const f0 = mtof(m);
  const ra = [1.0, 1.504, 1.742, 2.0, 2.245, 2.494, 2.8, 2.98, 3.46, 3.9, 4.4];
  const shape = [1, 1, 0.8, 1, 0.8, 1, 1, 1, 1, 1, 1];
  const a = [1.0, 0.62, 0.25, 0.4, 0.18, 0.22, 0.1, 0.12, 0.08, 0.05, 0.04].map((v, i) => v * db(r.normal(0, 2)) * shape[i] * (0.35 + 0.65 * vel) ** (i * 0.16));
  const t = [2.9, 2.3, 0.9, 1.7, 0.6, 1.2, 0.5, 0.8, 0.4, 0.3, 0.25].map((v) => v * (100 / f0) ** 0.25);
  const n = ns(tail);
  const x = modes(n, ra.map((k) => f0 * k), a, t, { seed, att: 0.0025, phase: 0.4 });
  const air = modes(n, [0.52, 0.83, 1.36].map((k) => f0 * k), [0.35, 0.5, 0.3], [0.16, 0.22, 0.2], { seed: seed + 1, att: 0.002, phase: 0 });
  const q = ns(0.06);
  const stick = lp(white(q, seed + 2), 600 + 1800 * vel);
  for (let i = 0; i < n; i++) x[i] += air[i];
  for (let i = 0; i < q; i++) x[i] += stick[i] * Math.exp(-i / SR / 0.007) * 0.5 * vel;
  const g = vel ** 1.4 * 0.5;
  for (let i = 0; i < n; i++) x[i] *= g;
  return fade(x, 0, 0.5);
}

/** A concert bass drum: low modes and a soft beater. */
export function bassdrum(vel, seed, tail = 2.6) {
  const n = ns(tail);
  const x = modes(n, [38, 61, 84, 104, 131, 162, 205, 260], [1, 0.8, 0.5, 0.4, 0.25, 0.18, 0.1, 0.06], [1.5, 1.1, 0.7, 0.55, 0.4, 0.3, 0.22, 0.18], { seed, att: 0.004, phase: 0.3 });
  const q = ns(0.1);
  const beater = lp(white(q, seed + 1), 900);
  for (let i = 0; i < q; i++) x[i] += beater[i] * Math.exp(-i / SR / 0.012) * 0.5;
  for (let i = 0; i < n; i++) x[i] *= vel * 0.6;
  return fade(x, 0, 0.6);
}
