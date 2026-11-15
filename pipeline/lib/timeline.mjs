// The timeline is the single source of truth for picture, subtitles and sound.
// Narration is synthesized first; its measured length decides how long each scene lasts.
import path from 'node:path';
import { round3 } from './util.mjs';
import { synth } from './tts.mjs';

const LEAD = 0.5; // scene start to first word
const GAP = 0.3; // between narration lines
const TAIL = 0.8; // last word to scene end

export async function buildTimeline({ resolved, outDir, backend, vertical, fps = 30 }) {
  const audioDir = path.join(outDir, 'audio');
  const scenes = [];
  let t = 0;
  let billed = 0; // what the speech supplier charged for lines synthesized in this run, in its own unit
  for (const scene of resolved.scenes) {
    const clips = [];
    for (const line of scene.lines) {
      clips.push(await synth({ backend, lang: resolved.lang, voice: resolved.voice?.name, rate: resolved.voice?.rate, text: line.speech }));
      billed += clips.at(-1).billed;
    }
    const speech = clips.reduce((a, c) => a + c.duration, 0) + GAP * Math.max(0, clips.length - 1);
    const natural = clips.length ? LEAD + speech + TAIL : 0;
    const floor = Math.max(vertical.minDuration(scene), scene.minDuration ?? 0);
    const duration = scene.duration ?? Math.max(natural, floor);
    if (scene.duration != null && natural > scene.duration + 1e-6) {
      throw new Error(
        `scene "${scene.id}" is fixed at ${scene.duration}s but its narration needs ${natural.toFixed(1)}s`,
      );
    }
    let cursor = t + LEAD;
    const lines = scene.lines.map((line, i) => {
      const start = cursor;
      const end = start + clips[i].duration;
      cursor = end + GAP;
      return { display: line.display, speech: line.speech, start: round3(start), end: round3(end), audio: clips[i].file };
    });
    scenes.push({ id: scene.id, type: scene.type, usesData: scene.usesData, start: round3(t), end: round3(t + duration), lines });
    t += duration;
  }
  // Land the end on a frame boundary.
  const duration = Math.ceil(t * fps - 1e-6) / fps;
  if (scenes.length) scenes[scenes.length - 1].end = round3(duration);
  return { fps, width: 1920, height: 1080, duration: round3(duration), backend, ttsBilled: billed, scenes };
}
