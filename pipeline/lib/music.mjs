// A score made by code: an underscore for the narration, composed from the timeline and played on
// modelled instruments (instruments.mjs). Nothing is sampled or downloaded, so there is nothing to
// license, and the same film always gets the same music.
//
// How it is built follows the score of "The Last Page" (github.com/ChetasLua/the-last-page), which
// was written in code against its picture:
//   - a theme of its own, stated quietly on solo piano at the start and returned in full at the peak;
//   - silence as structure: before a scene that opens with a hit, the music stops for a breath, then
//     timpani, bass drum and a low piano octave land together on the cut;
//   - it ends on one soft piano note;
//   - one room for everything (a scoring-stage tail convolved under the dry sound).
// The arrangement follows each scene's "energy" (0 quiet .. 3 full).
//
// Most people hear a film through a phone or a laptop, which plays next to nothing under 300 Hz.
// The parts that carry the music (piano, harp, bowed bars) sit above that; the drums are colour.
import { RATE } from './wav.mjs';
import { addAt, convolve, db, lateIR, rng } from './dsp.mjs';
import { bassdrum, bowedBar, harp, piano, timp } from './instruments.mjs';

// A minor, one chord a bar: Am, F, C, G. Bass note and a three-note voicing around middle C, as MIDI.
const CHORDS = [
  { bass: 45, mid: [57, 60, 64], arp: [69, 72, 76, 81] },
  { bass: 41, mid: [57, 60, 65], arp: [69, 72, 77, 81] },
  { bass: 48, mid: [55, 60, 64], arp: [67, 72, 76, 79] },
  { bass: 43, mid: [55, 59, 62], arp: [67, 71, 74, 79] },
];

// The theme: four bars over the four chords, [beat, MIDI, length in beats]. Original to this pipeline.
const THEME = [
  [0, 76, 1], [1, 81, 1.5], [2.5, 79, 0.5], [3, 76, 1],
  [4, 69, 1], [5, 72, 1], [6, 77, 1.5], [7.5, 76, 0.5],
  [8, 67, 1], [9, 72, 1], [10, 76, 1], [11, 74, 1],
  [12, 71, 1], [13, 74, 3],
];

const LEVELS = [0.18, 0.5, 0.8, 1]; // how full the arrangement is at each energy step

/**
 * @param {object} timeline  scenes with start and end, in seconds
 * @param {object} opts      bpm; energy per scene id (0..3); hits: scene ids that open with an impact
 * @returns {Float32Array}   mono, RATE samples a second, peaks within ±1
 */
export function renderMusic(timeline, { bpm = 112, energy = {}, hits = [] } = {}) {
  const total = Math.round(timeline.duration * RATE);
  const dry = new Float64Array(total);
  const beat = 60 / bpm;
  const barLen = 4 * beat;
  const scenes = timeline.scenes;
  const last = scenes.length - 1;

  const levelOf = (i) => {
    const e = energy[scenes[i].id];
    if (e != null) return LEVELS[Math.max(0, Math.min(3, Math.round(e)))];
    // No direction given: open quietly, build through the middle, come down for the ending.
    return i === 0 || i === last ? LEVELS[1] : LEVELS[Math.min(3, 1 + Math.round((2 * i) / Math.max(1, last - 1)))];
  };
  const sceneAt = (t) => Math.max(0, scenes.findIndex((sc, i) => t >= sc.start && (t < sc.end || i === last)));
  const levelAt = (t) => levelOf(sceneAt(t));

  // Notes are rendered once per pitch, length and loudness and reused: a minute of score repeats a lot.
  const cache = new Map();
  const note = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const vq = (v) => Math.round(v * 20) / 20; // loudness steps of 0.05
  const playPiano = (t, m, v, hold) => {
    const vel = vq(v);
    const len = Math.round(hold * 4) / 4;
    addAt(dry, note(`p${m}:${vel}:${len}`, () => piano(m, vel, len, 40 + m)), t);
  };
  const playHarp = (t, m, v) => {
    const vel = vq(v);
    addAt(dry, note(`h${m}:${vel}`, () => harp(m, vel, 500 + m, { hold: 1.5 })), t, 0.8);
  };

  // Where the theme is heard: from the first bar of the film, and again from the first bar of the peak
  // scene (the first scene marked as a hit, else the first scene at the highest energy).
  const peak = (() => {
    const hit = scenes.findIndex((sc) => hits.includes(sc.id));
    if (hit > 0) return hit;
    let best = -1;
    scenes.forEach((sc, i) => {
      if (i > 0 && i < last && (best < 0 || levelOf(i) > levelOf(best))) best = i;
    });
    return best;
  })();
  const firstBarFrom = (t) => Math.ceil((t - 1e-6) / barLen);
  const themeBars = new Map(); // bar index -> 'quiet' | 'full'
  const claim = (bar0, how) => {
    // The theme starts on a bar that holds the first chord (Am), so it always fits its harmony.
    const start = Math.ceil(bar0 / 4) * 4;
    for (let b = start; b < start + 4; b++) themeBars.set(b, { how, at: start });
  };
  claim(0, 'quiet');
  if (peak > 0) claim(firstBarFrom(scenes[peak].start), 'full');
  const outroStart = last > 0 ? scenes[last].start : timeline.duration;

  const bars = Math.ceil(timeline.duration / barLen) + 1;
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barLen;
    if (t0 >= timeline.duration) break;
    const chord = CHORDS[bar % CHORDS.length];
    const e = levelAt(t0 + 0.01);
    const inOutro = t0 >= outroStart;

    // Pad: bowed bars on the chord, held through the bar and overlapping the next.
    chord.mid.forEach((m, k) => {
      addAt(dry, note(`b${m}:${vq(0.25 + 0.3 * e)}:${bpm}`, () => bowedBar(m + 12, barLen * 1.1, vq(0.25 + 0.3 * e), 900 + m + k)), t0, 0.55);
    });
    if (inOutro) continue;

    const theme = themeBars.get(bar);
    if (theme) {
      // The theme, on piano: alone and soft at the start, in octaves with the harp at the peak.
      const from = (bar - theme.at) * 4;
      for (const [b, m, len] of THEME) {
        if (b < from || b >= from + 4) continue;
        const t = theme.at * barLen + b * beat;
        if (theme.how === 'quiet') playPiano(t, m - 12, 0.42 + (b === 0 ? 0.06 : 0), len * beat * 0.95);
        else {
          playPiano(t, m, 0.72, len * beat * 0.95);
          playPiano(t, m - 12, 0.5, len * beat * 0.95);
          playHarp(t, m + 12, 0.55);
        }
      }
      // Under the full theme: the bass on the bar.
      if (theme.how === 'full') playPiano(t0, chord.bass, 0.55, barLen * 0.95);
      else if (bar > 0) playPiano(t0, chord.bass + 12, 0.3, barLen * 0.9);
      continue;
    }

    // Away from the theme the piano keeps time: the bass on one and three, the chord on two and four.
    if (e >= 0.5) {
      for (let q = 0; q < 4; q++) {
        const t = t0 + q * beat;
        if (q % 2 === 0) playPiano(t, chord.bass + 12, 0.32 + 0.18 * e, beat * 1.8);
        else chord.mid.forEach((m) => playPiano(t, m, 0.22 + 0.15 * e, beat * 0.8));
      }
    }
    // A harp arpeggio in eighths once the scene has energy: the part that carries the motion.
    if (e >= 0.8) {
      const order = [0, 1, 2, 3, 2, 1, 2, 3];
      for (let s = 0; s < 8; s++) playHarp(t0 + s * (beat / 2), chord.arp[order[s]], 0.3 + 0.2 * e * (s % 4 === 0 ? 1.2 : 0.9));
    }
    // A soft pulse: bass drum on the bar, timpani on three at full energy.
    if (e >= 0.8) addAt(dry, note(`bd${vq(0.25 * e)}`, () => bassdrum(vq(0.25 * e), 77)), t0);
    if (e >= 1) addAt(dry, note(`tp${chord.bass}`, () => timp(chord.bass, 0.45, 88)), t0 + 2 * beat);
  }

  // The ending: one soft piano note, an octave of A, as the last scene begins.
  if (last > 0) {
    playPiano(outroStart + 0.25, 57, 0.4, 3.5);
    playPiano(outroStart + 0.25, 69, 0.32, 3.5);
  }

  // One room for everything: a scoring-stage tail (audio/rooms.py "stage") under the dry sound.
  const room = lateIR(101, [2.2, 2.3, 2.4, 2.35, 2.25, 2.15, 1.9, 1.5, 0.95, 0.55], 3.6, [-9, -5, -1.5, 0, 0, 0, -0.5, -1.5, -4, -8], 0.045);
  const wet = convolve(dry, room);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) out[i] = dry[i] + db(-9) * wet[i];

  // Silence as structure: a breath before each hit, then the impact on the cut.
  const gain = new Float64Array(total).fill(1);
  scenes.forEach((sc, i) => {
    if (i === 0 || !hits.includes(sc.id)) return;
    const a = Math.round((sc.start - 0.45) * RATE);
    const b = Math.round(sc.start * RATE);
    const ramp = Math.round(0.12 * RATE);
    for (let k = Math.max(0, a); k < Math.min(total, b); k++) {
      const into = k - a;
      gain[k] = into < ramp ? 1 - into / ramp : 0;
    }
  });
  for (let i = 0; i < total; i++) out[i] *= gain[i];
  scenes.forEach((sc, i) => {
    if (i === 0 || !hits.includes(sc.id)) return;
    addAt(out, timp(45, 0.95, 300 + i), sc.start, 1.2);
    addAt(out, bassdrum(0.9, 310 + i), sc.start, 1.0);
    addAt(out, piano(33, 0.8, 1.6, 320 + i), sc.start, 1.0);
    addAt(out, piano(45, 0.75, 1.6, 330 + i), sc.start, 1.0);
  });

  // Every cut gets a soft whoosh of air.
  scenes.forEach((sc, i) => {
    if (i === 0) return;
    const r = rng(1000 + i);
    let lp = 0;
    const a = Math.round((sc.start - 0.22) * RATE);
    const len = Math.round(0.5 * RATE);
    for (let k = 0; k < len; k++) {
      const idx = a + k;
      if (idx < 0 || idx >= total) continue;
      const t = k / RATE;
      lp += (r.normal() * 0.6 - lp) * (0.05 + 0.5 * Math.min(1, t / 0.25));
      out[idx] += 0.05 * Math.sin((Math.PI * t) / 0.5) ** 2 * lp;
    }
  });

  // Fade in and out, then bring the peak to just under full scale.
  let top = 0;
  const fadeIn = Math.round(0.4 * RATE);
  const fadeOut = Math.round(1.6 * RATE);
  for (let i = 0; i < total; i++) {
    out[i] *= Math.min(1, i / fadeIn) * Math.min(1, (total - i) / fadeOut);
    top = Math.max(top, Math.abs(out[i]));
  }
  if (top > 0) for (let i = 0; i < total; i++) out[i] *= 0.9 / top;
  return out;
}
