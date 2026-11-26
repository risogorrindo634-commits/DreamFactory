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
 * a, t60, att and phase may each be one number for every mode or an array with one per mode.
 * Each mode is a complex one-pole rotation, so a mode costs one multiply-add per sample.
 */
export function modes(n, f, a, t60, { seed = 0, att = 0, phase = null } = {}) {
  const r = rng(seed);
  const out = new Float64Array(n);
  for (let k = 0; k < f.length; k++) {
    if (!(f[k] > 0) || f[k] > 21000) continue;
    const w = (TAU * f[k]) / SR;
    const ph = Array.isArray(phase) ? phase[k] : phase ?? r.uniform(0, TAU);
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

/**
 * A smooth random curve: a new random target `hz` times a second between lo and hi, joined by
 * Catmull-Rom splines (audio/core.py slow). For vibrato, bowing pressure, slow swells.
 */
export function slow(n, hz, seed, lo = -1, hi = 1) {
  const r = rng(seed);
  const step = SR / hz;
  const k = Math.floor(n / step) + 5;
  const p = Array.from({ length: k }, () => r.uniform(lo, hi));
  const out = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    const x = s / step + 1;
    const i = Math.floor(x);
    const u = x - i;
    const p0 = p[i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(i + 2, k - 1)];
    out[s] = 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
  }
  return out;
}

/** In-place radix-2 FFT of (re, im); length must be a power of two. inverse divides by n. */
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k;
        const b = a + (len >> 1);
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] /= n;
  }
}

/** Convolve x with an impulse response h (overlap-add through the FFT); the result has x's length. */
export function convolve(x, h) {
  let size = 1;
  while (size < 2 * h.length) size <<= 1;
  const block = size - h.length + 1;
  const hr = new Float64Array(size);
  const hi = new Float64Array(size);
  hr.set(h);
  fft(hr, hi);
  const out = new Float64Array(x.length);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let start = 0; start < x.length; start += block) {
    re.fill(0);
    im.fill(0);
    const end = Math.min(x.length, start + block);
    let any = false;
    for (let i = start; i < end; i++) {
      re[i - start] = x[i];
      if (x[i] !== 0) any = true;
    }
    if (!any) continue;
    fft(re, im);
    for (let k = 0; k < size; k++) {
      const r = re[k] * hr[k] - im[k] * hi[k];
      im[k] = re[k] * hi[k] + im[k] * hr[k];
      re[k] = r;
    }
    fft(re, im, true);
    for (let i = 0; i < size && start + i < x.length; i++) out[start + i] += re[i];
  }
  return out;
}

const BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * The late tail of a room (audio/core.py late_ir, mono): Gaussian noise split into octave bands, each
 * band dying away at its own rate rt[b] (seconds to -60 dB) and set to gainDb[b]; a soft onset, a
 * faded end, unit energy. Low bands ring longer than high ones in any real hall.
 */
export function lateIR(seed, rt, length, gainDb = BANDS.map(() => 0), onset = 0.035) {
  const n = ns(length);
  const out = new Float64Array(n);
  BANDS.forEach((fb, b) => {
    const noise = white(n, seed * 31 + b);
    const band = b === 0 ? lp(noise, fb * 1.41) : b === BANDS.length - 1 ? hp(noise, fb / 1.41) : biquad(noise, 'bandpass', fb, 1.41);
    const k = Math.exp(-6.9078 / (rt[b] * SR));
    let g = db(gainDb[b]);
    for (let i = 0; i < n; i++) {
      out[i] += band[i] * g;
      g *= k;
    }
  });
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] *= (1 - Math.exp(-t / onset)) ** 2;
  }
  fade(out, 0, length * 0.15);
  for (let i = 0; i < n; i++) energy += out[i] * out[i];
  const norm = 1 / Math.sqrt(energy || 1);
  for (let i = 0; i < n; i++) out[i] *= norm;
  return out;
}
