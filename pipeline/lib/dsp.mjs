// Small DSP toolkit for synthesized sound: seeded noise, modal resonators, biquad filters, fades.
// The modal bank, the instrument recipes built on it (see sfx.mjs) and the way of thinking about a
// sound as a set of decaying resonances are ported from the soundtrack code of "The Last Page"
// (github.com/ChetasLua/the-last-page, audio/core.py and audio/inst.py), a film scored entirely in code.
// Everything is deterministic: the same seed gives the same samples on every run.
import { RATE } from './wav.mjs';

export const SR = RATE;
const TAU = 2 * Math.PI;

export const db = (x) => 10 ** (x / 20);
export const ns = (sec) => Math.round(sec * SR);
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** Uniform numbers in [0, 1) from a seed (a small counter-based generator). */
export function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  return {
    uniform: (lo = 0, hi = 1) => lo + (hi - lo) * next(),
    normal: (mu = 0, sigma = 1) => {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return mu + sigma * s;
      }
      const u = Math.max(1e-12, next());
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(TAU * v);
      return mu + sigma * r * Math.cos(TAU * v);
    },
  };
}

/** White Gaussian noise, n samples. */
export function white(n, seed) {
  const r = rng(seed);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = r.normal();
  return out;
}

/**
 * A bank of decaying sinusoids: each mode k rings at f[k] with amplitude a[k] and dies away by 60 dB in
 * t60[k] seconds. att > 0 softens the attack (seconds), as a felt mallet or a fingertip does.
 * Each mode is a complex one-pole rotation, so a mode costs one multiply-add per sample.
 */
export function modes(n, f, a, t60, { seed = 0, att = 0, phase = null } = {}) {
  const r = rng(seed);
  const out = new Float64Array(n);
  for (let k = 0; k < f.length; k++) {
    if (!(f[k] > 0) || f[k] > 21000) continue;
    const w = (TAU * f[k]) / SR;
    const ph = phase ?? r.uniform(0, TAU);
    const attK = Array.isArray(att) ? att[k] : att;
    const d0 = 6.9078 / (Array.isArray(t60) ? t60[k] : t60);
    const ak = Array.isArray(a) ? a[k] : a;
    for (let s = 0; s < 2; s++) {
      if (s === 1 && !(attK > 0)) continue;
      const d = s === 0 ? d0 : d0 + 1 / attK;
      const amp = s === 0 ? ak : -ak;
      const rr = Math.exp(-d / SR);
      const cr = rr * Math.cos(w);
      const ci = rr * Math.sin(w);
      let re = amp * Math.cos(ph);
      let im = amp * Math.sin(ph);
      // Stop once the mode has fallen 140 dB below its start.
      const lim = Math.min(n, Math.floor((SR * Math.log(Math.max(Math.abs(amp), 1e-9) / 1e-7)) / d) + 1);
      for (let i = 0; i < lim; i++) {
        out[i] += im;
        const t = re * cr - im * ci;
        im = re * ci + im * cr;
        re = t;
      }
    }
  }
  return out;
}

/** RBJ biquad, applied in place on a copy. type: lowpass | highpass | bandpass (0 dB peak). */
export function biquad(x, type, f, q = Math.SQRT1_2) {
  const w = (TAU * Math.min(f, SR * 0.49)) / SR;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  let b;
  if (type === 'lowpass') b = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else if (type === 'highpass') b = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else if (type === 'bandpass') b = [al, 0, -al];
  else throw new Error(`unknown filter ${type}`);
  const a0 = 1 + al;
  const [b0, b1, b2] = b.map((v) => v / a0);
  const a1 = (-2 * c) / a0;
  const a2 = (1 - al) / a0;
  const out = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

export const lp = (x, f) => biquad(x, 'lowpass', f);
export const hp = (x, f) => biquad(x, 'highpass', f);
/** Band between lo and hi (a single resonant section centred on their geometric mean). */
export const bp = (x, lo, hi) => {
  const fc = Math.sqrt(lo * hi);
  return biquad(x, 'bandpass', fc, Math.max(0.3, fc / (hi - lo)));
};

/** Multiply by exp(-t / tau), in place. */
export function decay(x, tau) {
  const k = Math.exp(-1 / (tau * SR));
  let g = 1;
  for (let i = 0; i < x.length; i++) {
    x[i] *= g;
    g *= k;
  }
  return x;
}

/** Raised-cosine fade in over a seconds and out over b seconds, in place. */
export function fade(x, a = 0.002, b = 0.005) {
  const n = x.length;
  const na = Math.min(Math.round(a * SR), n >> 1);
  const nb = Math.min(Math.round(b * SR), n >> 1);
  for (let i = 0; i < na; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / na);
  for (let i = 0; i < nb; i++) x[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / nb);
  return x;
}

/** out[at + i] += g * x[i], clipped to out's length. */
export function addAt(out, x, atSec, g = 1) {
  const at = Math.round(atSec * SR);
  for (let i = Math.max(0, -at); i < x.length && at + i < out.length; i++) out[at + i] += g * x[i];
  return out;
}

export function peak(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}
