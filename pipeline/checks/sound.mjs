// Checks on the sound effects: does each one land where the picture moves?
import { findOnsets } from '../lib/sfx.mjs';
import { readWav } from '../lib/wav.mjs';

// How far a sound may sit from its picture before people notice: ITU-R BT.1359-1 puts the threshold of
// detectability at sound 45 ms ahead of the picture and 125 ms behind it. Sound that comes early is
// noticed sooner because in nature it never does.
const MAX_LEAD = 0.045;
const MAX_LAG = 0.125;
// The fastest step of the element's own region must change at least this many pixels (CSS pixels,
// largest channel difference over 16). Below it nothing visible happens near the sound. Measured on the
// reference films: the smallest real cue moves several hundred pixels in its fastest step, a still
// element 0. See evals/BASELINE.md.
const MIN_CHANGE = 40;

const ms = (s) => `${Math.round(s * 1000)} 毫秒`;

export const avSync = {
  id: 'av-sync',
  title: '音效：每个音效落在画面变化最快的那一刻',
  tier: 'dom',
  run(ctx) {
    const skip = (summary) => ({ status: 'skip', summary, details: [] });
    const effects = ctx.effects ?? [];
    if (!ctx.film.sfx) return skip('这支片子没有音效');
    if (!effects.length) return skip('页面没有声明提示点，没有音效可放');
    if (!ctx.audio.sfxFile) return skip('没有人声，音效没有混进去（静音语音后端）');
    const { samples } = readWav(ctx.audio.sfxFile);
    const onsets = findOnsets(Float64Array.from(samples, (v) => v / 32768));
    const problems = [];
    if (onsets.length !== effects.length) {
      problems.push(`排了 ${effects.length} 个音效，音轨里听出 ${onsets.length} 个起音`);
    }
    let worst = 0;
    effects.forEach((e, i) => {
      const seen = ctx.cueTimes.find((m) => m.cue === e.cue);
      const heard = onsets[i];
      const where = `场景 ${e.scene} 的第 ${i + 1} 个音效（${e.kind}，${e.t.toFixed(2)}s）`;
      if (heard == null) return;
      if (!seen || seen.visual == null || seen.change < MIN_CHANGE) {
        problems.push(`${where}响的时候，画面上它对应的元素前后 0.4 秒内看不出变化`);
        return;
      }
      const d = heard - seen.visual;
      if (Math.abs(d) > Math.abs(worst)) worst = d;
      if (d < -MAX_LEAD) problems.push(`${where}比画面早 ${ms(-d)}：画面在 ${seen.visual.toFixed(3)}s 动得最快，声音在 ${heard.toFixed(3)}s，最多早 ${ms(MAX_LEAD)}`);
      if (d > MAX_LAG) problems.push(`${where}比画面晚 ${ms(d)}：画面在 ${seen.visual.toFixed(3)}s 动得最快，声音在 ${heard.toFixed(3)}s，最多晚 ${ms(MAX_LAG)}`);
    });
    return {
      status: problems.length ? 'fail' : 'pass',
      summary: problems.length
        ? `${problems.length} 处问题`
        : `${effects.length} 个音效，声音与画面最大相差 ${ms(Math.abs(worst))}（${worst < 0 ? '声音在前' : '声音在后'}）`,
      details: problems.slice(0, 12),
    };
  },
};
