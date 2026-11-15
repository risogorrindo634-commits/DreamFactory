import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export function writeJson(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}

export const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
export const round3 = (x) => Math.round(x * 1000) / 1000;

export function hasCommand(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Try again after a growing pause: `pause` ms after the first failure, twice that after the second, and so on. */
export async function retry(fn, times, pause = 800) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= times) throw e;
      await new Promise((r) => setTimeout(r, pause * attempt));
    }
  }
}

/** Run a command to completion. Rejects with the tail of stderr on a non-zero exit. */
export function run(cmd, args, { input, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(out);
      const stderr = Buffer.concat(err).toString('utf8');
      if (code !== 0) return reject(new Error(`${cmd} exited with ${code}\n${stderr.slice(-1500)}`));
      resolve({ stdout: binary ? stdout : stdout.toString('utf8'), stderr });
    });
    child.stdin.end(input ?? undefined);
  });
}

/** Stream info for a media file, via ffprobe. */
export async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  const info = JSON.parse(stdout);
  const video = info.streams.find((s) => s.codec_type === 'video');
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  const rate = video ? video.r_frame_rate.split('/').map(Number) : null;
  return {
    duration: Number(info.format.duration),
    video: video && {
      codec: video.codec_name,
      width: video.width,
      height: video.height,
      pixFmt: video.pix_fmt,
      fps: rate[0] / (rate[1] || 1),
      duration: Number(video.duration ?? info.format.duration),
    },
    audio: audio && { codec: audio.codec_name, duration: Number(audio.duration ?? info.format.duration) },
  };
}
