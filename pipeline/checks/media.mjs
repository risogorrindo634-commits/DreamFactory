// Checks that read the encoded film and its audio mix.
import { LOUDNESS_TARGET, measureLevels } from '../lib/audio.mjs';
import { compareSpeech, pickRecognizer, transcribe } from '../lib/asr.mjs';
import { run } from '../lib/util.mjs';

const fmtT = (t) => `${t.toFixed(1)}s`;

export const videoStillness = {
  id: 'video-stillness',
  title: '画面：没有黑屏，也没有长时间静止',
  tier: 'media',
  async run(ctx) {
    const limit = ctx.expect.maxFrozenSec ?? 6;
    const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', ctx.video.file,
      '-vf', 'blackdetect=d=0.5:pix_th=0.03,freezedetect=n=0.001:d=2', '-an', '-f', 'null', '-']);
    const problems = [];
    for (const m of stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) {
      problems.push(`${fmtT(Number(m[1]))}–${fmtT(Number(m[2]))} 是黑屏`);
    }
    const starts = [...stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
    const lengths = [...stderr.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
    // The subtitle is part of the picture, so a freeze ends where the subtitle changes. A short line
    // changes so few pixels that the detector sees some of these changes and misses others; the
    // timeline knows exactly when each line comes and goes (it stays 0.12 s past its last word).
    const changes = ctx.timeline.scenes.flatMap((sc) => sc.lines.flatMap((l) => [l.start, l.end + 0.12]));
    let longest = 0;
    starts.forEach((start, i) => {
      const end = start + (lengths[i] ?? ctx.timeline.duration - start); // a freeze that runs to the end has no length logged
      const edges = [start, ...changes.filter((t) => t > start && t < end).sort((a, b) => a - b), end];
      for (let k = 1; k < edges.length; k++) {
        const len = edges[k] - edges[k - 1];
        longest = Math.max(longest, len);
        if (len >= limit) problems.push(`${fmtT(edges[k - 1])} 起画面和字幕都不动，持续 ${len.toFixed(1)} 秒，上限 ${limit} 秒`);
      }
    });
    return {
      status: problems.length ? 'fail' : 'pass',
      summary: problems.length ? `${problems.length} 处问题` : `没有黑屏，画面和字幕最长 ${longest.toFixed(1)} 秒不动`,
      details: problems,
    };
  },
};

export const audioLevels = {
  id: 'audio-levels',
  title: '响度：整体响度和峰值在范围内',
  tier: 'media',
  async run(ctx) {
    if (!ctx.audio.voiced) return { status: 'skip', summary: '没有人声（静音语音后端）', details: [] };
    const { lufs, peak } = await measureLevels(ctx.audio.file);
    const problems = [];
    if (Math.abs(lufs - LOUDNESS_TARGET) > 2.5) problems.push(`整体响度 ${lufs} LUFS，目标 ${LOUDNESS_TARGET}±2.5`);
    if (peak > -1) problems.push(`峰值 ${peak} dBFS，上限 -1`);
    return {
      status: problems.length ? 'fail' : 'pass',
      summary: problems.length ? `${problems.length} 处问题` : `${lufs} LUFS，峰值 ${peak} dBFS`,
      details: problems,
    };
  },
};

export const audioGaps = {
  id: 'audio-gaps',
  title: '停顿：旁白之间没有过长的无声',
  tier: 'media',
  async run(ctx) {
    if (!ctx.audio.voiced) return { status: 'skip', summary: '没有人声（静音语音后端）', details: [] };
    const limit = ctx.expect.maxSilenceSec ?? 3.5;
    const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', ctx.audio.file,
      '-af', 'silencedetect=noise=-45dB:d=2', '-f', 'null', '-']);
    const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
    const lengths = [...stderr.matchAll(/silence_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
    const problems = [];
    let longest = 0;
    starts.forEach((start, i) => {
      const len = lengths[i] ?? ctx.timeline.duration - start;
      longest = Math.max(longest, len);
      if (len >= limit) problems.push(`${fmtT(start)} 起无声 ${len.toFixed(1)} 秒，上限 ${limit} 秒`);
    });
    return {
      status: problems.length ? 'fail' : 'pass',
      summary: problems.length ? `${problems.length} 处问题` : `最长无声 ${longest.toFixed(1)} 秒`,
      details: problems,
    };
  },
};

export const asr = {
  id: 'asr',
  title: '听写核对：语音识别听到的内容和数字与字幕一致',
  tier: 'media',
  async run(ctx) {
    const skip = (summary) => ({ status: 'skip', summary, details: [] });
    if (!ctx.audio.voiced) return skip('没有人声（静音语音后端）');
    if (ctx.timeline.backend === 'espeak') return skip('espeak 的发音连语音识别都听不懂，只用来占位，不做核对');
    const who = await pickRecognizer();
    if (!who) return skip('没有可用的语音识别：设置 DEEPSEEK_API_KEY，或运行 pip install faster-whisper');
    const lines = ctx.timeline.scenes.flatMap((sc) => sc.lines);
    const heard = await transcribe(lines.map((l) => l.audio), ctx.resolved.lang);
    const clip = (t) => (t.length > 26 ? `${t.slice(0, 26)}…` : t);
    const problems = [];
    lines.forEach((line, i) => {
      const c = compareSpeech(line.display, heard[i]);
      if (c.missing.length) {
        problems.push(`字幕里的 ${c.missing.join('、')} 没有在语音里听到：字幕「${clip(line.display)}」，听到「${clip(heard[i])}」`);
      } else if (c.wrongUnit.length) {
        problems.push(`数字后面的字听成了别的：字幕是「${c.wrongUnit[0].written}」，听到的是「${c.wrongUnit[0].heard}」，整句听到「${clip(heard[i])}」`);
      } else if (c.letters >= 4 && c.distance > 0.5) {
        // Homophones ("支" heard as "只") stay well under this; a different sentence does not.
        problems.push(`语音和字幕说的不是一回事：字幕「${clip(line.display)}」，听到「${clip(heard[i])}」`);
      }
    });
    return {
      status: problems.length ? 'fail' : 'pass',
      summary: problems.length ? `${problems.length} 处问题` : `${lines.length} 句旁白，听到的内容和数字都与字幕一致（${who === 'deepseek' ? 'DeepSeek' : 'faster-whisper'} 听写）`,
      details: problems.slice(0, 12),
    };
  },
};
