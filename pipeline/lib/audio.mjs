// Narration mix: every clip is placed at its timeline position, then the track is brought to the
// loudness target without letting the peak past the ceiling.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './util.mjs';
import { RATE, readWav, writeWav } from './wav.mjs';

export const LOUDNESS_TARGET = -14; // LUFS, integrated
export const PEAK_CEILING = -1.5; // dBFS

/** Integrated loudness and peak of an audio file, measured with ffmpeg's EBU R128 meter. */
export async function measureLevels(file) {
  const { stderr } = await run('ffmpeg', ['-nostats', '-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const lufs = Number((summary.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
  const peak = Number((summary.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
  return { lufs, peak };
}

/**
 * Bring a track to the loudness target through a limiter. Speech peaks sit far above its average
 * level, so plain gain would stop short; the limiter trims loudness a little, hence the repeated
 * passes. It holds sample peaks, while the meter reads true peaks, which land higher by an amount
 * that depends on the voice: start 1 dB under the ceiling and lower the limit by whatever still gets past.
 */
async function normalize(raw, file) {
  const before = await measureLevels(raw);
  if (!Number.isFinite(before.lufs)) return null;
  let limitDb = PEAK_CEILING - 1;
  let gainDb = LOUDNESS_TARGET - before.lufs;
  for (let pass = 0; pass < 6; pass++) {
    const levelIn = Math.min(64, 10 ** (gainDb / 20));
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw,
      '-af', `alimiter=level_in=${levelIn}:limit=${10 ** (limitDb / 20)}:attack=5:release=60:level=false`,
      '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', file]);
    const after = await measureLevels(file);
    const off = LOUDNESS_TARGET - after.lufs;
    const over = after.peak - PEAK_CEILING;
    if (Math.abs(off) <= 0.5 && over <= 0) break;
    if (Math.abs(off) > 0.5) gainDb += off;
    if (over > 0) limitDb -= over;
  }
  return Math.round(gainDb * 10) / 10;
}

/** Average level of a track over a set of time windows, in dB relative to full scale. */
export function levelOver(samples, windows) {
  let sum = 0;
  let n = 0;
  for (const [from, to] of windows) {
    const a = Math.max(0, Math.round(from * RATE));
    const b = Math.min(samples.length, Math.round(to * RATE));
    for (let i = a; i < b; i++) sum += (samples[i] / 32768) ** 2;
    n += Math.max(0, b - a);
  }
  return n && sum > 0 ? 10 * Math.log10(sum / n) : -Infinity;
}

/**
 * A track as a phone or laptop speaker gives it back: with what lies under about 400 Hz taken away
 * (a steep high-pass, two stages). Levels meant to describe what a listener hears are measured on this.
 */
export function asHeardOnSmallSpeakers(samples) {
  const w = (2 * Math.PI * 400) / RATE;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w);
  const [b0, b1, b2, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, -2 * cos, 1 - alpha].map((v) => v / (1 + alpha));
  let data = Float64Array.from(samples);
  for (let stage = 0; stage < 2; stage++) {
    const out = new Float64Array(data.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      out[i] = y;
    }
    data = out;
  }
  return Int16Array.from(data, (v) => Math.max(-32768, Math.min(32767, Math.round(v))));
}

// How far under the voice the sound effects sit, in dB, measured the same way over the first 150 ms of
// each effect against the voice over its spoken lines. A first setting, not yet checked by a listener:
// loud enough to be heard on a phone, and the music check still listens for every number through the mix.
export const SFX_UNDER_VOICE = 8;

// How far under the voice the music sits while someone is speaking, in dB, unless the film says
// otherwise. Measured as small speakers play both: a score that is all bass reads as loud on a
// meter and cannot be heard on a phone.
export const MUSIC_UNDER_VOICE = 12;

/**
 * @param {object} music    null for none, or { bpm, under, energy: {sceneId: 0..3}, hits: [sceneId] }
 * @param {Array}  effects  sound effects placed on the picture's cues (sfx.mjs placeEffects), or none
 * Returns the finished mix, and the voice, music and effects on their own for the checks.
 */
export async function mixNarration({ timeline, outDir, music = null, effects = [], faultGainDb, faultMusicGainDb, faultSfxDelaySec }) {
  const total = Math.round(timeline.duration * RATE);
  const mix = new Float32Array(total);
  let clips = 0;
  for (const scene of timeline.scenes) {
    for (const line of scene.lines) {
      const { samples, rate } = readWav(line.audio);
      if (rate !== RATE) throw new Error(`clip is ${rate} Hz, expected ${RATE}: ${line.audio}`);
      const at = Math.round(line.start * RATE);
      for (let i = 0; i < samples.length && at + i < total; i++) mix[at + i] += samples[i] / 32768;
      clips++;
    }
  }
  const file = path.join(outDir, 'audio', 'mix.wav');
  const voiceFile = path.join(outDir, 'audio', 'voice.wav');
  const musicFile = path.join(outDir, 'audio', 'music.wav');
  const sfxFile = path.join(outDir, 'audio', 'sfx.wav');
  const raw = path.join(outDir, 'audio', 'mix.raw.wav');
  const save = (target, floats) => {
    const out = new Int16Array(total);
    for (let i = 0; i < total; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round((floats[i] ?? 0) * 32767)));
    writeWav(target, out);
  };
  // Keep a track exactly as long as the timeline, whatever the encoder padded or dropped.
  const fit = (target) => {
    const { samples } = readWav(target);
    if (samples.length === total) return samples;
    const fixed = new Int16Array(total);
    fixed.set(samples.subarray(0, Math.min(total, samples.length)));
    writeWav(target, fixed);
    return fixed;
  };
  fs.rmSync(musicFile, { force: true });
  fs.rmSync(sfxFile, { force: true });
  save(raw, mix);
  if (timeline.backend === 'silent' || clips === 0) {
    fs.renameSync(raw, file);
    return { file, voiced: false };
  }

  // The voice alone, at the target loudness.
  const gainDb = await normalize(raw, voiceFile);
  if (gainDb === null) {
    fs.renameSync(raw, file);
    return { file, voiced: false };
  }
  const voice = fit(voiceFile);
  const lines = timeline.scenes.flatMap((sc) => sc.lines.map((l) => [l.start, l.end]));
  const heardVoice = levelOver(asHeardOnSmallSpeakers(voice), lines);
  let score = null;
  if (music) {
    // The score ducks while a line is spoken and comes back up between lines and scenes.
    const { renderMusic } = await import('./music.mjs');
    score = renderMusic(timeline, music);
    const speaking = new Uint8Array(total);
    for (const [from, to] of lines) speaking.fill(1, Math.max(0, Math.round((from - 0.05) * RATE)), Math.min(total, Math.round((to + 0.05) * RATE)));
    let duck = 1;
    for (let i = 0; i < total; i++) {
      const target = speaking[i] ? 0.6 : 1;
      duck += (target - duck) / ((target < duck ? 0.08 : 0.25) * RATE);
      score[i] *= duck;
    }
    // Set its level from the voice: so many dB under it over the spoken stretches, as small speakers play both.
    const asInt = Int16Array.from(score, (v) => Math.round(v * 32767));
    const under = music.under ?? MUSIC_UNDER_VOICE;
    const heardScore = levelOver(asHeardOnSmallSpeakers(asInt), lines);
    const gain = 10 ** ((heardVoice - under - heardScore) / 20);
    for (let i = 0; i < total; i++) score[i] *= gain;
    // Fader rides: the score is set by its average, but a phrase can swell under one line. Wherever a line
    // stands less than (under - 2) dB over the music, ride the music down for that line, as a mixer would.
    {
      const voiceHeard = asHeardOnSmallSpeakers(voice);
      const scoreHeard = asHeardOnSmallSpeakers(Int16Array.from(score, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)))));
      const ride = new Float64Array(total).fill(1);
      const ramp = 0.15 * RATE;
      for (const [from, to] of lines) {
        const margin = levelOver(voiceHeard, [[from, to]]) - levelOver(scoreHeard, [[from, to]]);
        const short = under - 2 - margin;
        if (!(short > 0)) continue;
        const g = 10 ** (-short / 20);
        const a = Math.round((from - 0.1) * RATE);
        const b = Math.round((to + 0.1) * RATE);
        for (let i = Math.max(0, a - ramp); i < Math.min(total, b + ramp); i++) {
          const edge = i < a ? (a - i) / ramp : i > b ? (i - b) / ramp : 0;
          ride[i] = Math.min(ride[i], 1 - (1 - g) * (1 - edge));
        }
      }
      for (let i = 0; i < total; i++) score[i] *= ride[i];
    }
    // Evals only: the finished score knocked off its level, to show that the music check notices.
    if (faultMusicGainDb) for (let i = 0; i < total; i++) score[i] *= 10 ** (faultMusicGainDb / 20);
    save(musicFile, score);
  }
  let sfx = null;
  if (effects.length) {
    const { renderEffects } = await import('./sfx.mjs');
    const delaySec = faultSfxDelaySec ?? 0; // evals only: every effect late by this much
    sfx = renderEffects(effects, total, { delaySec });
    const peakOf = sfx.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const asInt = Int16Array.from(sfx, (v) => Math.round((v / peakOf) * 16000));
    const heardSfx = levelOver(asHeardOnSmallSpeakers(asInt), effects.map((e) => [e.t + delaySec, e.t + delaySec + 0.15]));
    const gain = (16000 / 32767 / peakOf) * 10 ** ((heardVoice - SFX_UNDER_VOICE - heardSfx) / 20);
    for (let i = 0; i < total; i++) sfx[i] *= gain;
    save(sfxFile, sfx);
  }
  if (score || sfx) {
    const both = new Float32Array(total);
    for (let i = 0; i < total; i++) both[i] = voice[i] / 32768 + (score ? score[i] : 0) + (sfx ? sfx[i] : 0);
    save(raw, both);
    await normalize(raw, file);
  } else {
    fs.copyFileSync(voiceFile, file);
  }
  fs.rmSync(raw, { force: true });
  if (faultGainDb) {
    // Evals only: knock the finished mix off its target, to show that the loudness check notices.
    fs.renameSync(file, raw);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `volume=${faultGainDb}dB`, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', file]);
    fs.rmSync(raw, { force: true });
  }
  fit(file);
  return { file, voiced: true, voiceFile, musicFile: score ? musicFile : null, sfxFile: sfx ? sfxFile : null, gainDb };
}
