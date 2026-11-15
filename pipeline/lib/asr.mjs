// Listening back: transcribe the narration clips and compare what was heard with the script.
// Two recognizers can listen: DeepSeek's speech-to-text API (needs a key) and faster-whisper, which runs
// on this machine (pip install faster-whisper). With neither, the check is skipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractNumbers } from './data.mjs';
import { deepseekKey, deepseekTranscribe } from './deepseek.mjs';
import { retry, run } from './util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.DF_ASR_MODEL ?? 'small';

let recognizer;
/**
 * Who listens: "deepseek", "whisper", or null when nobody can. DeepSeek goes first when a key is set;
 * DF_ASR=deepseek|whisper forces one.
 */
export async function pickRecognizer() {
  if (recognizer === undefined) {
    const want = process.env.DF_ASR ?? 'auto';
    const whisper = () => run('python3', ['-c', 'import faster_whisper, numpy']).then(() => 'whisper', () => null);
    if (want === 'whisper') recognizer = await whisper();
    else if (deepseekKey()) recognizer = 'deepseek';
    else recognizer = want === 'deepseek' ? null : await whisper();
  }
  return recognizer;
}

/** Transcripts for a list of clips, in order. Each transcript is cached next to its clip, per recognizer. */
export async function transcribe(files, lang) {
  const who = await pickRecognizer();
  const cached = (f) => `${f}.${who === 'deepseek' ? 'deepseek' : MODEL}.${lang}.txt`;
  const todo = [...new Set(files.filter((f) => !fs.existsSync(cached(f))))];
  if (who === 'deepseek') {
    // One short request per clip, a few at a time.
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const f = todo[next++];
        fs.writeFileSync(cached(f), await retry(() => deepseekTranscribe(f), 3));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
  } else if (todo.length) {
    const { stdout } = await run('python3', [path.join(here, '..', 'tools', 'asr.py')], { input: JSON.stringify({ model: MODEL, lang, files: todo }) });
    const { texts } = JSON.parse(stdout);
    todo.forEach((f, i) => fs.writeFileSync(cached(f), texts[i]));
  }
  return files.map((f) => fs.readFileSync(cached(f), 'utf8'));
}

const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT = { 十: 10, 百: 100, 千: 1000 };
const EN_SMALL = Object.fromEntries(
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ').map((w, i) => [w, i]),
);
const EN_TENS = Object.fromEntries('twenty thirty forty fifty sixty seventy eighty ninety'.split(' ').map((w, i) => [w, 20 + 10 * i]));
const EN_SCALE = { thousand: 1e3, million: 1e6, billion: 1e9 };
const EN_NUMBER_WORD = new RegExp(`\\b(${[...Object.keys(EN_SMALL), ...Object.keys(EN_TENS), ...Object.keys(EN_SCALE), 'hundred', 'percent'].join('|')})\\b`, 'g');

/** "两千七百九十三" -> 2793, "十七" -> 17, "二七九三" -> 2793, "五点五" -> 5.5 */
export function chineseNumber(s) {
  const [whole, frac] = s.split('点');
  let value = 0;
  if (!/[十百千万亿]/.test(whole)) {
    value = whole ? Number([...whole].map((c) => CN_DIGIT[c]).join('')) : 0;
  } else {
    let total = 0;
    let section = 0;
    let digit = 0;
    for (const c of whole) {
      if (c in CN_DIGIT) digit = CN_DIGIT[c];
      else if (c in CN_UNIT) {
        section += (digit || 1) * CN_UNIT[c];
        digit = 0;
      } else {
        total += (section + digit) * (c === '万' ? 1e4 : 1e8);
        section = 0;
        digit = 0;
      }
    }
    value = total + section + digit;
  }
  if (frac) value += Number(`0.${[...frac].map((c) => CN_DIGIT[c] ?? '').join('')}`);
  return value;
}

/**
 * Numbers spoken in English, however the recognizer wrote them down. Each unbroken run of number words
 * and digits gives one number: "two hundred and thirty-three" and "200 and thirty-three" are both 233,
 * "2 thousand 793" is 2793, "three point five" is 3.5. Any other word or punctuation mark ends a run.
 */
export function englishNumbers(text) {
  const out = [];
  let total = 0;
  let current = 0;
  let frac = null;
  let parts = 0;
  const close = () => {
    if (parts) out.push(total + current + (frac ? Number(`0.${frac}`) : 0));
    total = 0;
    current = 0;
    frac = null;
    parts = 0;
  };
  for (const [tok] of text.toLowerCase().matchAll(/[a-z\d]+(?:[,.]\d+)*|[^\sa-z\d-]+/g)) {
    const value = /^\d[\d,]*(\.\d+)?$/.test(tok) ? Number(tok.replace(/,/g, '')) : EN_SMALL[tok] ?? EN_TENS[tok];
    if (value !== undefined && frac !== null && value < 10) frac += value;
    else if (value !== undefined) {
      if (frac !== null) close();
      current += value;
      parts++;
    } else if (tok === 'hundred') {
      current = (current || 1) * 100;
      parts++;
    } else if (tok in EN_SCALE && parts) {
      total += (current || 1) * EN_SCALE[tok];
      current = 0;
    } else if (tok === 'point' && parts && frac === null) frac = '';
    else if (tok !== 'and' || !parts || frac !== null) close();
  }
  close();
  return out;
}

/** Every number a transcript contains, whether written as digits, Chinese numerals or English words. */
export function heardNumbers(text) {
  const out = extractNumbers(text).map((n) => n.value);
  for (const m of text.matchAll(/[零〇一二两三四五六七八九十百千万亿点]+/g)) {
    const v = chineseNumber(m[0].replace(/^点+|点+$/g, ''));
    if (Number.isFinite(v)) out.push(v);
  }
  out.push(...englishNumbers(text));
  return out;
}

/** The words of a sentence without numbers, punctuation or spacing, for a like-for-like comparison. */
const wording = (s) =>
  s.toLowerCase().replace(EN_NUMBER_WORD, '').replace(/[零〇一二两三四五六七八九十百千万亿点\d%％]/g, '').replace(/[^\p{Script=Han}a-z]/gu, '');

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Compare one subtitle with what was heard.
 * missing: numbers in the subtitle that were not heard. distance: 0 = same wording, 1 = nothing in common.
 */
export function compareSpeech(subtitle, heard) {
  const said = heardNumbers(heard);
  const missing = extractNumbers(subtitle).filter((n) => !said.some((v) => Math.abs(v - n.value) < 1e-9)).map((n) => n.raw);
  const a = [...wording(subtitle)];
  const b = [...wording(heard)];
  const distance = Math.max(a.length, b.length) ? editDistance(a, b) / Math.max(a.length, b.length) : 0;
  return { missing, distance, letters: a.length };
}
