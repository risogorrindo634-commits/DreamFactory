// DeepSeek's speech tools: text to speech and speech to text, both on the one API key.
// Requests go out through curl, which follows HTTPS_PROXY and the system's certificate settings on its own.
import fs from 'node:fs';
import { run } from './util.mjs';

const BASE = 'https://api.deepseek.com';

/**
 * The key is DEEPSEEK_API_KEY. A bare `api_key` also counts when the `base_url` next to it points at
 * DeepSeek, which is how some hosted environments name the pair.
 */
export function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  return /^https:\/\/([\w-]+\.)*deepseek\.com(\/|$)/.test(process.env.base_url ?? '') ? process.env.api_key || null : null;
}

/** One request, answer written to outFile. The key travels on stdin, so it never shows in the process list. */
async function call(pathname, args, outFile) {
  const key = deepseekKey();
  if (!key) throw new Error('no DeepSeek key: set DEEPSEEK_API_KEY');
  const { stdout } = await run('curl', ['-sS', '-m', '120', '--config', '-', '-o', outFile, '-w', '%{http_code}', ...args, `${BASE}${pathname}`], {
    input: `header = "Authorization: Bearer ${key}"\n`,
  });
  if (stdout.trim() === '200') return;
  const body = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').slice(0, 300) : '';
  fs.rmSync(outFile, { force: true });
  throw new Error(`DeepSeek ${pathname} answered ${stdout.trim()}: ${body}`);
}

/** Text to a WAV file (24 kHz mono). Voices: stella (female), tide (male). The service has no speed setting. */
export async function deepseekSpeech({ text, voice, outFile }) {
  // filter_markdown off: the voice says the line as written, and the listening check hears what was said.
  const body = JSON.stringify({ text, voice_id: voice, format: 'wav', filter_markdown: false });
  await call('/v1/tools/tts', ['-H', 'Content-Type: application/json', '--data-binary', body], outFile);
}

/** A WAV clip (16-bit PCM, up to 120 s) to the text heard in it. The language is detected from the audio. */
export async function deepseekTranscribe(file) {
  const out = `${file}.${process.pid}.asr.json`;
  const quoted = file.replace(/["\\]/g, '\\$&');
  try {
    await call('/v1/tools/asr', ['-F', `file=@"${quoted}";type=audio/wav`], out);
    return String(JSON.parse(fs.readFileSync(out, 'utf8')).text ?? '').trim();
  } finally {
    fs.rmSync(out, { force: true });
  }
}

/**
 * What the speech service bills a line as: a Chinese character counts as 2, anything else as 1.
 * Full-width punctuation is counted as 2 here as well, which can only overstate.
 */
export const deepseekBilledChars = (text) => [...text].reduce((n, c) => n + (c.codePointAt(0) >= 0x2e80 ? 2 : 1), 0);
