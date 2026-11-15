// Data references. A film never types a number that comes from the data: it points at it
// ({"$": "series.categories"} or "{{facts.total}}"), and the checks later verify that every
// number that reaches the screen or the narration can be traced back to data.json.

const splitPath = (p) => [...String(p).matchAll(/[^.[\]]+|\[([^\]]+)\]/g)].map((m) => m[1] ?? m[0]);

/** Look up a path. Arrays of {label, ...} items can be indexed by label: series.categories[游戏]. */
export function getPath(data, p) {
  let cur = data;
  for (const seg of splitPath(p)) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const byLabel = cur.find((it) => it && typeof it === 'object' && it.label === seg);
      cur = byLabel !== undefined ? byLabel : cur[Number(seg)];
    } else {
      cur = cur[seg];
    }
  }
  return cur;
}

/** The scalar at a path: a number or string, or the `value` of a series item. */
export function getScalar(data, p) {
  const v = getPath(data, p);
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) return v.value;
  return v;
}

export const formatNumber = (n) =>
  (Number.isInteger(n) ? n : Math.round(n * 10) / 10).toLocaleString('en-US');

/** The whole-percent share of a series item within its series. */
function sharePercent(data, p) {
  const segs = splitPath(p);
  const series = getPath(data, segs.slice(0, -1).join('.'));
  const item = getPath(data, p);
  if (!Array.isArray(series) || !item || typeof item.value !== 'number') {
    throw new Error(`"share ${p}" must point at an item of a series`);
  }
  const total = series.reduce((a, it) => a + it.value, 0);
  return Math.round((100 * item.value) / total);
}

// A path may hold spaces inside its brackets: series.films[2025 年].
const PATHS = /[^\s[\]]+(?:\[[^\]]*\][^\s[\]]*)*/g;
const DERIVED = ['times', 'up', 'down'];

/**
 * A number worked out from two values in the data. All three read "from a to b":
 *   times a b  - b divided by a, to one decimal ("4.5")
 *   up a b     - the rise from a to b in whole percent
 *   down a b   - the fall from a to b in whole percent
 * up and down refuse to run when the change goes the other way, so a film cannot call a fall a rise.
 */
export function derive(data, fn, args) {
  const paths = args.match(PATHS) ?? [];
  if (paths.length !== 2) throw new Error(`"${fn}" takes two values from data.json, got ${paths.length}: "${fn} ${args}"`);
  const [a, b] = paths.map((p) => {
    const v = getScalar(data, p);
    if (typeof v !== 'number') throw new Error(`"${fn}" needs two numbers, and "${p}" is not a number in data.json`);
    return v;
  });
  if (a <= 0) throw new Error(`"${fn} ${args}": the first value must be above zero, and it is ${a}`);
  if (fn === 'times') return Math.round((10 * b) / a) / 10;
  const rise = b - a;
  if (rise === 0) throw new Error(`"${fn} ${args}": both values are ${a}, nothing rose or fell`);
  if ((fn === 'up') !== rise > 0) throw new Error(`"${fn} ${args}": ${a} to ${b} goes ${rise > 0 ? 'up' : 'down'}, use "${rise > 0 ? 'up' : 'down'}"`);
  return Math.round((100 * Math.abs(rise)) / a);
}

/** The number an expect.json entry stands for: a path, or "share path", "times a b", "up a b", "down a b". */
export function expectedNumber(data, spec) {
  const [, fn, rest] = String(spec).match(/^(share|times|up|down)\s+(.+)$/) ?? [];
  if (fn === 'share') return sharePercent(data, rest.trim());
  if (fn) return derive(data, fn, rest);
  return getScalar(data, spec);
}

/**
 * Fill {{path}}, {{share path}} and {{times a b}}, {{up a b}}, {{down a b}} in a string.
 * mode "screen": numbers get thousands separators. mode "speech": plain digits, spoken percent.
 * Numbers worked out by times, up and down are added to `derived`, when one is given.
 */
export function renderTemplate(str, data, mode, lang = 'zh', derived = null) {
  const percent = (pct) => (mode === 'screen' ? `${pct}%` : lang === 'zh' ? `百分之${pct}` : `${pct} percent`);
  return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, inner) => {
    const [, fn, rest] = inner.match(/^(share|times|up|down)\s+(.+)$/) ?? [];
    if (fn === 'share') return percent(sharePercent(data, rest.trim()));
    if (fn) {
      const value = derive(data, fn, rest);
      derived?.add(value);
      return fn === 'times' ? (mode === 'screen' || lang === 'en' ? formatNumber(value) : String(value)) : percent(value);
    }
    const p = inner;
    const v = getScalar(data, p);
    if (v === undefined || (typeof v === 'object' && v !== null)) {
      throw new Error(`film.json points at "${p}", which is not a value in data.json`);
    }
    if (v === null) throw new Error(`film.json points at "${p}", which is empty in data.json: there is no number to show`);
    if (typeof v !== 'number') return String(v);
    // An English voice reads "2793" as a year, "twenty-seven ninety-three", and "2,793" as a quantity.
    // A Chinese voice reads the plain digits as a quantity and stumbles on the comma.
    return mode === 'screen' || lang === 'en' ? formatNumber(v) : String(v);
  });
}

/** Resolve every data reference in a film. Narration becomes {display, speech} per line. */
export function resolveFilm(film, data) {
  const lang = film.lang ?? 'zh';
  let touched = false;
  const derived = new Set(); // numbers the film had worked out by reference; the checks accept these too
  const walk = (v) => {
    if (typeof v === 'string') {
      if (v.includes('{{')) touched = true;
      return renderTemplate(v, data, 'screen', lang, derived);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 1 && keys[0] === '$') {
        const target = getPath(data, v.$);
        if (target === undefined) throw new Error(`film.json points at "${v.$}", which is not in data.json`);
        touched = true;
        return structuredClone(target);
      }
      return Object.fromEntries(keys.map((k) => [k, walk(v[k])]));
    }
    return v;
  };
  const out = { ...film, lang };
  if (film.source != null) out.source = renderTemplate(film.source, data, 'screen', lang, derived);
  if (film.title != null) out.title = renderTemplate(film.title, data, 'screen', lang);
  out.scenes = (film.scenes ?? []).map((scene, i) => {
    touched = false;
    const { narration = [], ...rest } = scene;
    const resolved = walk(rest);
    resolved.id = scene.id ?? `scene-${i + 1}`;
    resolved.lines = narration.map((line) => {
      // A line is a string, or { text, say } when the voice should read it differently from the subtitle.
      const text = typeof line === 'string' ? line : line.text;
      const say = typeof line === 'string' ? line : line.say ?? line.text;
      if (text.includes('{{') || say.includes('{{')) touched = true;
      return {
        display: renderTemplate(text, data, 'screen', lang, derived),
        speech: renderTemplate(say, data, 'speech', lang, derived),
      };
    });
    resolved.usesData = touched;
    return resolved;
  });
  out.derived = [...derived];
  return out;
}

/**
 * Every number a film may show or say: the values in data.json, numbers written inside its labels
 * ("7月") and its source block (an as-of date), plus series totals and shares.
 */
export function allowedNumbers(data) {
  const set = new Set();
  const walk = (v) => {
    if (typeof v === 'number') set.add(v);
    else if (typeof v === 'string') [...extractNumbers(v), ...extractChineseNumbers(v)].forEach((n) => set.add(n.value));
    else if (Array.isArray(v)) {
      if (v.length && v.every((it) => it && typeof it === 'object' && typeof it.value === 'number')) {
        const total = v.reduce((a, it) => a + it.value, 0);
        set.add(total);
        for (const it of v) {
          set.add(Math.round((100 * it.value) / total));
          set.add(Math.round((1000 * it.value) / total) / 10);
        }
      }
      v.forEach(walk);
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(data);
  return set;
}

/**
 * Numbers written as digits in a text. Digits glued to Latin letters ("3D", "H264") are words,
 * not quantities, and are skipped.
 */
export function extractNumbers(text) {
  const out = [];
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  for (const m of text.matchAll(re)) {
    const prev = text[m.index - 1] ?? '';
    const next = text[m.index + m[0].length] ?? '';
    if (/[A-Za-z]/.test(prev) || /[A-Za-z]/.test(next)) continue;
    out.push({ raw: m[0], value: Number(m[0].replace(/,/g, '')), end: m.index + m[0].length });
  }
  return out;
}

const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT = { 十: 10, 百: 100, 千: 1000 };

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

// These read as words, not as quantities.
const CN_NOT_A_NUMBER = new Set(['千万', '万一', '万万', '一一', '一五一十', '三三两两']);

/**
 * Quantities written in Chinese characters. Counted: a numeral with a unit ("两千七百", "十七"), a decimal
 * ("四点五"), three or more digits in a row ("二〇二六"), and a single numeral in front of 倍 or 成
 * ("四倍" is 4, "九成" is 90). A lone numeral in ordinary prose ("三件事", "第二", "两年") is not counted.
 */
export function extractChineseNumbers(text) {
  const out = [];
  for (const m of text.matchAll(/[零〇一二两三四五六七八九十百千万亿点]+/g)) {
    const raw = m[0].replace(/^点+|点+$/g, '');
    if (!raw || CN_NOT_A_NUMBER.has(raw)) continue;
    const next = m[0].endsWith('点') ? '' : text[m.index + m[0].length] ?? '';
    const digits = [...raw].every((c) => c in CN_DIGIT);
    let value = null;
    if ([...raw].length === 1) {
      if (next === '倍' || next === '成') value = chineseNumber(raw) * (next === '成' ? 10 : 1);
    } else if (raw.includes('点') || !digits || [...raw].length >= 3) {
      value = chineseNumber(raw);
    }
    if (value !== null && Number.isFinite(value)) out.push({ raw: [...raw].length === 1 ? raw + next : raw, value });
  }
  return out;
}

export const hasNumber = (set, value) => [...set].some((a) => Math.abs(a - value) < 1e-9);
