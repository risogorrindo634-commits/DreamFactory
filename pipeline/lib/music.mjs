// A score made by code: an underscore for the narration, synthesized from the timeline.
// Nothing is sampled or downloaded, so there is nothing to license, and the same film always gets
// the same music. The arrangement follows each scene's "energy" (0 quiet .. 3 full).
import { RATE } from './wav.mjs';

const TAU = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** A small repeatable noise source: the same seed gives the same hiss on every run. */
function noise(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

// Four chords, two bars each, in A minor: Am, F, C, G. Notes are MIDI numbers.
const CHORDS = [
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [48, 52, 55, 64],
  [55, 59, 62, 67],
];
const LEVELS = [0.18, 0.5, 0.8, 1]; // how full the arrangement is at each energy step

/**
 * @param {object} timeline  scenes with start and end, in seconds
 * @param {object} opts      bpm; energy per scene id (0..3); hits: scene ids that open with an impact
 * @returns {Float32Array}   mono, RATE samples a second, peaks within ±1
 */
export function renderMusic(timeline, { bpm = 112, energy = {}, hits = [] } = {}) {
  const total = Math.round(timeline.duration * RATE);
  const out = new Float32Array(total);
  const beat = 60 / bpm;
  const add = (startSec, lengthSec, fn) => {
    const from = Math.max(0, Math.round(startSec * RATE));
    const to = Math.min(total, Math.round((startSec + lengthSec) * RATE));
    for (let i = from; i < to; i++) out[i] += fn((i - from) / RATE);
  };

  // How full the music is at each moment: each scene's level, eased over half a second at the cuts.
  const scenes = timeline.scenes;
  const last = scenes.length - 1;
  const levelOf = (i) => {
    const e = energy[scenes[i].id];
    if (e != null) return LEVELS[Math.max(0, Math.min(3, Math.round(e)))];
    // No direction given: open quietly, build through the middle, come down for the ending.
    return i === 0 || i === last ? LEVELS[1] : LEVELS[Math.min(3, 1 + Math.round((2 * i) / Math.max(1, last - 1)))];
  };
  const level = new Float32Array(total);
  scenes.forEach((sc, i) => level.fill(levelOf(i), Math.round(sc.start * RATE), Math.round(sc.end * RATE)));
  const settle = (0.5 * RATE) / 3;
  for (let i = 0, acc = level[0]; i < total; i++) {
    acc += (level[i] - acc) / settle;
    level[i] = acc;
  }
  const at = (sec) => level[Math.min(total - 1, Math.max(0, Math.round(sec * RATE)))];

  const bars = Math.ceil(timeline.duration / (4 * beat)) + 1;
  for (let bar = 0; bar < bars; bar++) {
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const t0 = bar * 4 * beat;

    // Pad: the chord held under everything, soft attack, overlapping the next bar.
    const padLen = 4 * beat + 0.9;
    chord.forEach((note, v) => {
      const f = hz(note) * (1 + (v - 1.5) * 0.0012);
      const gain = 0.11 * (0.6 + 0.4 * at(t0 + beat));
      add(t0, padLen, (t) => {
        const env = Math.min(1, t / 0.7) * Math.min(1, (padLen - t) / 0.9);
        let s = 0;
        for (let k = 1; k <= 4; k++) s += Math.sin(TAU * f * k * t + v) / k ** 1.9;
        return gain * env * s;
      });
    });

    for (let step = 0; step < 16; step++) {
      const ts = t0 + step * (beat / 4);
      const e = at(ts);
      // Bass: the root on every eighth note once the scene has some energy.
      if (step % 2 === 0 && e > 0.35) {
        const f = hz(chord[0] - 24);
        const gain = 0.3 * e * (step % 8 === 0 ? 1 : 0.7);
        add(ts, 0.3, (t) => gain * Math.exp(-t / 0.16) * (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t)));
      }
      // A plucked arpeggio through the chord, up and back, for motion.
      if (e > 0.3) {
        const order = [0, 1, 2, 3, 2, 1, 2, 3];
        const f = hz(chord[order[step % 8]]);
        const gain = 0.03 * (e - 0.15) * (step % 4 === 0 ? 1.2 : 0.8);
        add(ts, 0.4, (t) => gain * Math.exp(-t / 0.11) * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t)));
      }
      // Kick on the beat, hat between beats, when the arrangement is full.
      if (step % 4 === 0 && e > 0.6) {
        const gain = 0.5 * e;
        add(ts, 0.3, (t) => gain * Math.exp(-t / 0.11) * Math.sin(TAU * (48 * t + 3.2 * (1 - Math.exp(-t / 0.028)))));
      }
      if (step % 4 === 2 && e > 0.75) {
        const hiss = noise(bar * 16 + step + 1);
        let prev = 0;
        add(ts, 0.07, (t) => {
          const n = hiss();
          const hp = n - prev; // a crude high-pass: keeps the hiss, drops the thump
          prev = n;
          return 0.05 * e * Math.exp(-t / 0.022) * hp;
        });
      }
    }
  }

  // Every cut gets a soft whoosh; scenes marked as hits open with a riser and a low impact.
  scenes.forEach((sc, i) => {
    if (i === 0) return;
    const hiss = noise(1000 + i);
    let lp = 0;
    add(sc.start - 0.22, 0.5, (t) => {
      lp += (hiss() - lp) * (0.05 + 0.5 * Math.min(1, t / 0.25));
      return 0.09 * Math.sin((Math.PI * t) / 0.5) ** 2 * lp;
    });
    if (!hits.includes(sc.id)) return;
    const rise = noise(2000 + i);
    let band = 0;
    add(sc.start - 1.1, 1.1, (t) => {
      band += (rise() - band) * (0.03 + 0.4 * (t / 1.1) ** 2);
      return 0.14 * (t / 1.1) ** 2 * band;
    });
    add(sc.start, 0.9, (t) => 0.55 * Math.exp(-t / 0.3) * Math.sin(TAU * (52 * t + 2.5 * (1 - Math.exp(-t / 0.05)))));
  });

  // Gentle top roll-off, fade in and out, then bring the peak to just under full scale.
  let lp = 0;
  let peak = 0;
  const fadeIn = Math.round(0.4 * RATE);
  const fadeOut = Math.round(1.6 * RATE);
  for (let i = 0; i < total; i++) {
    lp += (out[i] - lp) * 0.35;
    const fade = Math.min(1, i / fadeIn) * Math.min(1, (total - i) / fadeOut);
    out[i] = Math.tanh(1.4 * lp) * fade;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  if (peak > 0) for (let i = 0; i < total; i++) out[i] *= 0.9 / peak;
  return out;
}
