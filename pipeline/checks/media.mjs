// Checks that read the encoded film and its audio mix.
import fs from 'node:fs';
import path from 'node:path';
import { LOUDNESS_TARGET, asHeardOnSmallSpeakers, levelOver, measureLevels } from '../lib/audio.mjs';
import { compareSpeech, heardNumbers, pickRecognizer, transcribe } from '../lib/asr.mjs';
import { extractNumbers } from '../lib/data.mjs';
import { hash, run } from '../lib/util.mjs';
import { readWav } from '../lib/wav.mjs';

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
    // Listen to the voice alone: with a score under it the finished mix is never silent.
    const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', ctx.audio.voiceFile ?? ctx.audio.file,
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

// While a line is spoken the voice must stand this far above the score, in dB, and no further than
// the second number: past that the score is on the track but nobody hears it. Both are measured as
// phone and laptop speakers play the film, without the lows. The first film with a score sat 20.5 dB
// under its voice by that measure (17.9 on its best line), and the person who watched it heard no
// music at all: the second number is set inside that. It rests on that one listener so far.
const VOICE_OVER_MUSIC = 8;
const MUSIC_STILL_HEARD = 16;

export const music = {
  id: 'music',
  title: '配乐：听得到，不盖住旁白，配上音乐后数字还听得清',
  tier: 'media',
  async run(ctx) {
    if (!ctx.audio.musicFile) return { status: 'skip', summary: '这支片子没有配乐', details: [] };
    const voice = asHeardOnSmallSpeakers(readWav(ctx.audio.voiceFile).samples);
    const score = asHeardOnSmallSpeakers(readWav(ctx.audio.musicFile).samples);
    const problems = [];
    let closest = Infinity;
    const spoken = [];
    for (const sc of ctx.timeline.scenes) {
      for (const line of sc.lines) {
        const window = [[line.start, line.end]];
        spoken.push(window[0]);
        const margin = levelOver(voice, window) - levelOver(score, window);
        closest = Math.min(closest, margin);
        if (margin < VOICE_OVER_MUSIC) problems.push(`配乐盖住了旁白：「${line.display.slice(0, 20)}」这一句人声只比配乐高 ${margin.toFixed(1)} 分贝，至少要 ${VOICE_OVER_MUSIC}`);
      }
    }
    const overall = levelOver(voice, spoken) - levelOver(score, spoken);
    if (overall > MUSIC_STILL_HEARD) problems.push(`配乐太轻，在手机和笔记本上听不到：旁白时它比人声低 ${overall.toFixed(1)} 分贝，最多 ${MUSIC_STILL_HEARD}`);
    // Then listen to the finished sound scene by scene: every number in the subtitles has to come through the music.
    const who = await pickRecognizer();
    let listened = 0;
    if (who && ctx.timeline.backend !== 'espeak') {
      const dir = path.join(path.dirname(ctx.audio.file), 'listen');
      fs.mkdirSync(dir, { recursive: true });
      const spoken = ctx.timeline.scenes.filter((sc) => sc.lines.length && sc.end - sc.start < 115);
      const clips = [];
      for (const sc of spoken) {
        const tmp = path.join(dir, `${sc.id}.wav`);
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(sc.start), '-t', String(sc.end - sc.start), '-i', ctx.audio.file, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', tmp]);
        // Named by its content, so a transcript kept from an earlier mix is never read for this one.
        const named = path.join(dir, `${hash(fs.readFileSync(tmp).toString('base64'))}.wav`);
        fs.renameSync(tmp, named);
        clips.push(named);
      }
      const heard = await transcribe(clips, ctx.resolved.lang);
      spoken.forEach((sc, i) => {
        const said = heardNumbers(heard[i]);
        const lost = sc.lines.flatMap((l) => extractNumbers(l.display)).filter((n) => !said.some((v) => Math.abs(v - n.value) < 1e-9));
        if (lost.length) problems.push(`配上音乐后听不清：场景 ${sc.id} 里的 ${[...new Set(lost.map((n) => n.raw))].join('、')} 没有听到，整段听到「${heard[i].slice(0, 30)}…」`);
      });
      listened = spoken.length;
    }
    return {
      status: problems.length ? 'fail' : 'pass',
      summary: problems.length ? `${problems.length} 处问题` : `旁白时配乐比人声低 ${overall.toFixed(1)} 分贝，最吃紧的一句低 ${closest.toFixed(1)}${listened ? `；带着配乐听了 ${listened} 个场景，数字都听得到` : ''}`,
      details: problems.slice(0, 12),
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
