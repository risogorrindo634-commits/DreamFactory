#!/usr/bin/env node
// The eval set has two halves:
//   1. clean cases  - reference films that must pass every check (measures false alarms)
//   2. defects      - the same films with one planted fault each; the named checks must fail
//                     (measures whether the checks catch what they claim to catch)
// A check with no defect aimed at it is unproven, and the scoreboard says so.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFilm } from '../pipeline/film.mjs';
import { CHECKS } from '../pipeline/checks/index.mjs';
import { readJson } from '../pipeline/lib/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(here, 'cases');
const tmpDir = path.join(here, '.tmp');

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--help')) {
  console.log(`用法：node evals/run.mjs [选项]

  --only <id>        只跑一个用例或缺陷
  --tts <后端>       auto（默认）| espeak | edge | silent
  --jobs <n>         同时跑几个，默认 3
  --save-baseline    把结果写入 evals/BASELINE.md`);
  process.exit(0);
}
const only = value('--only');
const tts = value('--tts');
const jobs = Number(value('--jobs') ?? 3);

const segments = (p) => [...p.matchAll(/[^.[\]]+|\[(\d+)\]/g)].map((m) => (m[1] !== undefined ? Number(m[1]) : m[0]));
function applyOp(target, op) {
  const segs = segments(op.set ?? op.remove);
  let cur = target;
  for (const s of segs.slice(0, -1)) cur = cur[s];
  const last = segs.at(-1);
  if ('set' in op) cur[last] = op.value;
  else if (Array.isArray(cur)) cur.splice(last, 1);
  else delete cur[last];
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(jobs, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
}

const mediaIds = new Set(CHECKS.filter((c) => c.tier === 'media').map((c) => c.id));
const caseIds = fs.readdirSync(casesDir).filter((d) => fs.existsSync(path.join(casesDir, d, 'film.json'))).sort();
// Films made with real data are kept passing too: a check that changes must not turn on a film already delivered.
const filmsDir = path.join(here, '..', 'films');
const filmIds = fs.existsSync(filmsDir) ? fs.readdirSync(filmsDir).filter((d) => fs.existsSync(path.join(filmsDir, d, 'film.json'))).sort() : [];
const dirOf = (id) => (caseIds.includes(id) ? path.join(casesDir, id) : path.join(filmsDir, id));
const defects = readJson(path.join(here, 'defects.json'));

const cleanRuns = [...caseIds, ...filmIds].filter((id) => !only || only === id);
const defectRuns = defects.filter((d) => !only || only === d.id);
fs.rmSync(tmpDir, { recursive: true, force: true });
const started = Date.now();

const clean = await pool(cleanRuns, async (id) => {
  try {
    const r = await runFilm(dirOf(id), { draft: true, tts, log: false, outDir: path.join(tmpDir, `clean-${id}`) });
    console.log(`${r.passed ? '通过  ' : '误报  '} ${id}${r.passed ? '' : `  ← ${r.failed.join(', ')}`}`);
    return { id, ok: r.passed, failed: r.failed, durationSec: r.durationSec, backend: r.backend, checks: r.checks };
  } catch (e) {
    console.log(`出错   ${id}  ← ${e.message.split('\n')[0]}`);
    return { id, ok: false, failed: ['(运行出错)'], error: e.message, checks: [] };
  }
});

const planted = await pool(defectRuns, async (d) => {
  const dir = dirOf(d.base);
  const scenesFile = path.join(dir, 'scenes.js');
  const files = {
    film: readJson(path.join(dir, 'film.json')),
    data: readJson(path.join(dir, 'data.json')),
    expect: readJson(path.join(dir, 'expect.json')),
    scenes: fs.existsSync(scenesFile) ? fs.readFileSync(scenesFile, 'utf8') : null,
    faults: {}, // a stage of the pipeline broken on purpose, for checks that no film content can trip
  };
  if (d.platform && d.platform !== process.platform) {
    console.log(`跳过   ${d.id}  ← 这条缺陷只能在 ${d.platform} 上注入`);
    return { ...d, ok: null, missed: [], extra: [], unjudged: `只能在 ${d.platform} 上注入` };
  }
  try {
    for (const op of d.ops) {
      if (op.file !== 'scenes') applyOp(files[op.file], op);
      else if (!files.scenes?.includes(op.replace)) throw new Error('缺陷要替换的代码在 scenes.js 里找不到');
      else files.scenes = files.scenes.replace(op.replace, op.with);
    }
    const r = await runFilm(dir, {
      ...files, draft: true, tts, log: false,
      video: (d.expectFail ?? []).some((id) => mediaIds.has(id)),
      outDir: path.join(tmpDir, `defect-${d.id}`),
    });
    if (d.expectError) {
      console.log(`漏检   ${d.id}  ← 应该报错“${d.expectError}”，却正常跑完了`);
      return { ...d, expectFail: [], ok: false, missed: ['(应该报错)'], extra: r.failed };
    }
    const skippedChecks = d.expectFail.filter((id) => r.checks.find((c) => c.id === id)?.status === 'skip');
    if (skippedChecks.length) {
      console.log(`跳过   ${d.id}  ← 本次运行跳过了 ${skippedChecks.join('、')}`);
      return { ...d, ok: null, missed: [], extra: [], unjudged: `${skippedChecks.join('、')} 被跳过` };
    }
    const missed = d.expectFail.filter((id) => !r.failed.includes(id));
    const extra = r.failed.filter((id) => !d.expectFail.includes(id));
    console.log(`${missed.length ? '漏检  ' : '抓到  '} ${d.id}${missed.length ? `  ← 没有失败：${missed.join(', ')}` : ''}`);
    return { ...d, ok: missed.length === 0, missed, extra };
  } catch (e) {
    if (d.expectError && e.message.includes(d.expectError)) {
      console.log(`抓到   ${d.id}`);
      return { ...d, expectFail: [], ok: true, missed: [], extra: [] };
    }
    console.log(`出错   ${d.id}  ← ${e.message.split('\n')[0]}`);
    return { ...d, expectFail: d.expectFail ?? [], ok: false, missed: d.expectFail ?? ['(运行出错)'], extra: [], error: e.message };
  }
});

// Scoreboard
const falseAlarms = clean.filter((c) => !c.ok).length;
const judged = planted.filter((d) => d.ok !== null);
const caught = judged.filter((d) => d.ok).length;
const passedOver = planted.length - judged.length;
const coverage = CHECKS.map((c) => {
  const aimed = planted.filter((d) => d.expectFail.includes(c.id));
  return { id: c.id, title: c.title, aimed: aimed.length, caught: aimed.filter((d) => !d.missed.includes(c.id)).length };
});
// How many clean films each check sat out. A check that has nothing to look at in some films (no score,
// no custom chart) is not the same as a check that never ran.
const skipped = new Map();
for (const c of clean) for (const k of c.checks) if (k.status === 'skip') skipped.set(k.id, (skipped.get(k.id) ?? 0) + 1);
const unproven = coverage.filter((c) => c.aimed === 0).map((c) => c.id);
const backend = clean.find((c) => c.backend)?.backend ?? tts ?? 'auto';
const cell = (s) => String(s).replace(/\|/g, '\\|');

const md = [
  '# 评测基线',
  '',
  `干净用例误报 ${falseAlarms}/${clean.length}，缺陷检出 ${caught}/${judged.length}${passedOver ? `，另有 ${passedOver} 条没有判定` : ''}。`,
  '',
  `运行环境：Node ${process.version} · 语音后端 ${backend} · 草稿画质 · ${new Date().toISOString().slice(0, 10)}`,
  '',
  '## 干净用例',
  '',
  '参考影片不应触发任何检查。这里的失败就是误报。',
  '',
  '| 用例 | 结果 | 片长（秒） | 误报的检查 |',
  '| --- | --- | --- | --- |',
  ...clean.map((c) => `| ${c.id} | ${c.ok ? '通过' : '误报'} | ${c.durationSec?.toFixed(1) ?? ''} | ${cell(c.failed.join('、'))} |`),
  '',
  '## 缺陷注入',
  '',
  '每条缺陷只在参考影片上改一处。指定的检查必须失败，否则算漏检。',
  '',
  '| 缺陷 | 改了什么 | 应失败的检查 | 结果 | 连带失败的检查 |',
  '| --- | --- | --- | --- | --- |',
  ...planted.map((d) => `| ${d.id} | ${cell(d.title)} | ${d.expectError ? '拒绝运行并报错' : d.expectFail.join('、')} | ${d.ok === null ? `未判定：${d.unjudged}` : d.ok ? '抓到' : `漏检：${d.missed.join('、')}`} | ${d.extra.join('、')} |`),
  '',
  '## 各项检查的覆盖',
  '',
  '| 检查 | 缺陷样例 | 抓到 | 备注 |',
  '| --- | --- | --- | --- |',
  ...coverage.map((c) => {
    const sat = skipped.get(c.id) ?? 0;
    const note = sat === clean.length ? '本次运行跳过' : sat ? `${clean.length} 个干净用例里有 ${sat} 个用不上这项检查` : c.aimed === 0 ? '没有缺陷样例，效果未经验证' : '';
    return `| ${c.id} | ${c.aimed} | ${c.caught} | ${note} |`;
  }),
  '',
].join('\n');

fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(path.join(tmpDir, 'scoreboard.md'), md);
if (args.includes('--save-baseline')) fs.writeFileSync(path.join(here, 'BASELINE.md'), md);

console.log(`\n干净用例误报 ${falseAlarms}/${clean.length}，缺陷检出 ${caught}/${judged.length}${passedOver ? `（${passedOver} 条未判定）` : ''}，用时 ${Math.round((Date.now() - started) / 1000)} 秒`);
if (unproven.length) console.log(`没有缺陷样例的检查：${unproven.join('、')}`);
console.log(`计分板：${path.join(tmpDir, 'scoreboard.md')}`);
process.exit(falseAlarms === 0 && caught === judged.length ? 0 : 1);
