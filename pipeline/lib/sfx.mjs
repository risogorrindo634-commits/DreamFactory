// Sound effects tied to the picture. The page declares cues (window.DF.cues): moments where something
// on screen moves in a way a sound should answer. Two kinds:
//   pop - something arrives: a bar starts to grow, a point appears, a line of text comes in.
//         A short struck bar, pitched: a run of pops in one scene climbs a pentatonic scale.
//   hit - something lands with weight: a big number stops counting.
//         A dry wooden thud with a low drop under it and a bell note on top.
// The recipes are ported from "The Last Page" (audio/inst.py glock_note, audio/sfx.py jolt and subhit),
// shortened for narration: a data film cannot let a bar ring for three seconds under the voice.
// Every effect starts with a sharp transient on its first sample, so the ear (and the av-sync check)
// hears it exactly where it is placed.
import { SR, addAt, bp, db, decay, fade, hp, lp, modes, mtof, ns, rng, white } from './dsp.mjs';

// A minor pentatonic, two octaves from A5: the key the score is written in (music.mjs).
const SCALE = [81, 84, 86, 88, 91, 93, 96, 98, 100, 103];

/** A struck metal bar, glockenspiel ratios, damped to about a third of a second. */
export function pop(midi, vel = 0.7, seed = 1) {
  const r = rng(seed);
  const f0 = mtof(midi);
  const ratios = [1, 2.756, 5.404, 8.933];
  const amps = [1, 0.3, 0.1, 0.035].map((a) => a * db(r.normal(0, 1.5)));
  const t60 = [0.35, 0.16, 0.07, 0.035];
  const n = ns(0.4);
  const x = modes(n, ratios.map((k) => f0 * k), amps, t60, { seed, att: 0.0004, phase: 0.3 });
  // The mallet: a tick of bright noise.
  const q = ns(0.02);
  const tick = decay(hp(white(q, seed + 2), 3500), 0.0018);
  for (let i = 0; i < q; i++) x[i] += 0.12 * tick[i];
  for (let i = 0; i < n; i++) x[i] *= 0.4 * vel ** 1.3;
  return fade(x, 0, 0.15);
}

/** A thud with weight: wooden case modes, a falling sub drop, a bell note to give it a pitch. */
export function hit(weight = 1, seed = 1, midi = 69) {
  const r = rng(seed);
  const n = ns(0.9);
  const k = r.uniform(0.96, 1.04);
  const f = [46, 67, 98, 141, 205, 298, 430, 640, 960, 1500, 2300].map((v) => v * k);
  const a = [0.8, 1, 0.95, 0.8, 0.7, 0.5, 0.4, 0.3, 0.2, 0.13, 0.08].map((v) => v * db(r.normal(0, 2)));
  const t60 = [0.16, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.04, 0.03, 0.02, 0.014];
  const x = modes(n, f, a, t60, { seed, att: 0.0006, phase: 0 });
  for (let i = 0; i < n; i++) x[i] *= 0.55;
  const crack = decay(bp(white(n, seed + 1), 300, 4500), 0.007);
  const body = decay(lp(white(n, seed + 2), 240), 0.035);
  // The drop: a sine gliding from 78 Hz to 31 Hz, gently saturated (audio/sfx.py subhit).
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (31 + 47 * Math.exp(-t / 0.09))) / SR;
    const sub = Math.tanh(1.6 * Math.sin(ph) * (1 - Math.exp(-t / 0.0035)) * Math.exp(-t / 0.4)) / Math.tanh(1.6);
    x[i] += 0.42 * crack[i] + 1.0 * body[i] + 0.7 * sub;
  }
  // The bell on top carries the hit on a phone, which plays nothing of the drop.
  const bell = pop(midi + 12, 0.9, seed + 7);
  for (let i = 0; i < bell.length && i < n; i++) x[i] += 0.9 * bell[i];
  for (let i = 0; i < n; i++) x[i] *= weight;
  return fade(x, 0.0002, 0.2);
}

// Effects closer together than this are merged: the ear hears one event, and so does the check.
export const MIN_GAP = 0.06;

/**
 * Choose the effects for a film from the page's cues. Returns [{t, kind, scene, cue, midi}], sorted.
 * Pops climb the scale in the order they come within a scene; a hit is a step under the scene's first pop.
 */
export function placeEffects(cues) {
  const sorted = [...cues].sort((p, q) => p.t - q.t);
  const placed = [];
  const step = new Map();
  for (const c of sorted) {
    if (placed.length && c.t - placed.at(-1).t < MIN_GAP) continue;
    const i = step.get(c.scene) ?? 0;
    step.set(c.scene, i + 1);
    const midi = c.kind === 'hit' ? 57 : SCALE[Math.min(i, SCALE.length - 1)];
    placed.push({ t: c.t, kind: c.kind, scene: c.scene, cue: c.index, midi });
  }
  return placed;
}

/** The effects stem: every placed effect at its time, shifted by delaySec (evals only), in a mono float track. */
export function renderEffects(effects, totalSamples, { delaySec = 0 } = {}) {
  const out = new Float64Array(totalSamples);
  effects.forEach((e, i) => {
    const x = e.kind === 'hit' ? hit(1, 300 + i, e.midi) : pop(e.midi, 0.7, 100 + i);
    addAt(out, x, e.t + delaySec, e.kind === 'hit' ? 1 : 0.5);
  });
  return out;
}

/**
 * Where effects start in a track. Every effect opens with a bright transient, so the track is first
 * high-passed at 1 kHz: low partials would otherwise swing a short envelope up and down within each
 * cycle and read as new onsets. An onset is a 1 ms envelope that jumps 10 dB or more above the
 * quietest point of the 15 ms before it. Returns onset times in seconds.
 */
export function findOnsets(samples, { rate = SR, rise = 10, floorDb = -50, refractory = 0.04 } = {}) {
  const bright = hp(hp(samples, 1000), 1000);
  const hop = Math.round(rate / 1000);
  const env = [];
  for (let i = 0; i < bright.length; i += hop) {
    let m = 0;
    for (let k = i; k < Math.min(bright.length, i + hop); k++) m = Math.max(m, Math.abs(bright[k]));
    env.push(20 * Math.log10(m + 1e-9));
  }
  const top = env.reduce((m, v) => Math.max(m, v), -Infinity);
  const onsets = [];
  let last = -Infinity;
  for (let i = 1; i < env.length; i++) {
    if (env[i] < top + floorDb) continue;
    let low = Infinity;
    for (let k = Math.max(0, i - 15); k < i; k++) low = Math.min(low, env[k]);
    if (env[i] - low < rise) continue;
    if (i / 1000 - last < refractory) continue;
    // Walk back to the first block of the rise.
    let j = i;
    while (j > 0 && env[j - 1] > low + 3 && i - j < 15) j--;
    onsets.push(j / 1000);
    last = i / 1000;
  }
  return onsets;
}
