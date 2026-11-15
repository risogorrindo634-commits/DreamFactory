// Speech suppliers. Each backend turns one line of text into a 48 kHz mono WAV.
// Adding a supplier = one function here; nothing else in the pipeline knows which one ran.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deepseekBilledChars, deepseekKey, deepseekSpeech } from './deepseek.mjs';
import { hasCommand, hash, retry, run } from './util.mjs';
import { RATE, readWav, writeWav } from './wav.mjs';

// Default voice per language, and what a voice name of this supplier looks like.
const VOICES = {
  deepseek: { zh: 'stella', en: 'stella', own: /^(stella|tide)$/ },
  edge: { zh: 'zh-CN-XiaoxiaoNeural', en: 'en-US-AriaNeural', own: /Neural$/ },
  espeak: { zh: 'cmn', en: 'en-us', own: /^[a-z]{2,3}([-+][a-z0-9]+)*$/ },
};

// espeak-ng speed setting. Its Mandarin is slow at the default; 280 lands near 4.5 characters a second.
const ESPEAK_SPEED = { zh: '280', en: '170' };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Clips are kept across runs and films, keyed by backend, voice, rate and text. */
export const cacheDir = () => process.env.DF_TTS_CACHE ?? path.join(repoRoot, '.cache', 'tts');

/**
 * "auto" takes the best voice at hand: DeepSeek's speech API when a key is set (online, paid, a documented
 * service), then the Edge neural voices (online, free, no service terms), then espeak-ng (offline, robotic,
 * a timing placeholder), then a silent track with estimated timing.
 */
export function pickBackend(requested) {
  if (requested && requested !== 'auto') return requested;
  if (deepseekKey()) return 'deepseek';
  if (hasCommand('edge-tts')) return 'edge';
  return hasCommand('espeak-ng') ? 'espeak' : 'silent';
}

/** Rough speaking time, used only by the silent backend. */
function estimateSeconds(text) {
  const cjk = (text.match(/[㐀-鿿]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9]+/g) || []).length;
  const pauses = (text.match(/[，。？！；、,.?!;]/g) || []).length;
  return Math.max(0.8, cjk / 4.5 + words / 2.7 + pauses * 0.15);
}

const toWav = (src, dst) =>
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', dst]);

/**
 * Cut the silence a service pads its clips with (Edge adds about 0.2 s before and 0.6 s after),
 * leaving a short margin. The timeline adds its own pauses, and subtitles follow the clip length.
 */
function trimSilence(file, { lead = 0.04, tail = 0.12, floor = 330 } = {}) {
  const { samples, rate } = readWav(file);
  let first = 0;
  let last = samples.length - 1;
  while (first < last && Math.abs(samples[first]) < floor) first++;
  while (last > first && Math.abs(samples[last]) < floor) last--;
  const from = Math.max(0, first - Math.round(lead * rate));
  const to = Math.min(samples.length, last + 1 + Math.round(tail * rate));
  writeWav(file, samples.slice(from, to), rate);
}

const backends = {
  async silent({ text, outFile }) {
    writeWav(outFile, new Int16Array(Math.round(estimateSeconds(text) * RATE)));
  },
  async espeak({ text, voice, lang, outFile }) {
    const tmp = outFile + '.raw.wav';
    await run('espeak-ng', ['-v', voice, '-s', ESPEAK_SPEED[lang] ?? '170', '-w', tmp, text]);
    await toWav(tmp, outFile);
    fs.rmSync(tmp, { force: true });
  },
  // Microsoft Edge's read-aloud voices through the edge-tts command (pip install edge-tts).
  // An online service: it needs the network, and goes through HTTPS_PROXY when that is set.
  async edge({ text, voice, rate, outFile }) {
    const tmp = outFile + '.mp3';
    const args = ['--voice', voice, `--text=${text}`, '--write-media', tmp];
    if (rate) args.push(`--rate=${rate}`);
    const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
    if (proxy) args.push('--proxy', proxy);
    // The service has no terms and at times drops most requests ("No audio was received"), more so
    // when asked quickly. Patient retries get through: up to about a minute for one line.
    await retry(() => run('edge-tts', args), 8, 2000);
    await toWav(tmp, outFile);
    fs.rmSync(tmp, { force: true });
    trimSilence(outFile);
  },
  // DeepSeek's text-to-speech tool: a paid API with a key. It needs the network and has no speed setting.
  async deepseek({ text, voice, outFile }) {
    const tmp = outFile + '.raw.wav';
    await retry(() => deepseekSpeech({ text, voice, outFile: tmp }), 3);
    await toWav(tmp, outFile);
    fs.rmSync(tmp, { force: true });
    trimSilence(outFile);
  },
};

/** What a supplier charges a line as, in its own unit. Suppliers not listed are free. */
const BILLED = { deepseek: deepseekBilledChars };

let calls = 0;

/**
 * Synthesize one line, or reuse the cached clip. Returns the file, its length in seconds, and what the
 * supplier billed for it: 0 when the clip came from the cache or the supplier is free.
 */
export async function synth({ backend, lang, voice, rate, text }) {
  const fn = backends[backend];
  if (!fn) throw new Error(`unknown speech backend "${backend}" (have: ${Object.keys(backends).join(', ')})`);
  // A film names a voice of one supplier. Under another supplier the name means nothing, so the default speaks.
  const names = VOICES[backend];
  const v = voice && names?.own.test(voice) ? voice : names?.[lang] ?? '';
  if (backend !== 'edge') rate = undefined; // only Edge takes a speaking rate
  const speed = backend === 'espeak' ? ESPEAK_SPEED[lang] ?? '170' : `${rate ?? ''}/trimmed`;
  const dir = cacheDir();
  const outFile = path.join(dir, `${backend}-${hash([backend, v, speed, lang, text].join('|'))}.wav`);
  const fresh = !fs.existsSync(outFile);
  if (fresh) {
    fs.mkdirSync(dir, { recursive: true });
    // Two films in one process can ask for the same line at once; each call works in files of its own.
    const tmp = `${outFile}.${process.pid}.${++calls}.tmp.wav`;
    await fn({ text, voice: v, lang, rate, outFile: tmp });
    fs.renameSync(tmp, outFile); // a clip appears in the cache only once it is complete
  }
  const { samples, rate: hz } = readWav(outFile);
  return { file: outFile, duration: samples.length / hz, billed: fresh ? BILLED[backend]?.(text) ?? 0 : 0 };
}
