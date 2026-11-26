#!/usr/bin/env node
// Task-level eval: a model gets only the brief, the data and DIRECTOR.md, and has to deliver a film
// that passes the checks with nobody to ask. It never sees the reference film of the case.
// Measured: did it deliver, how many pipeline runs it needed, what it cost, and whether it stayed
// inside the rules. The delivered film is then checked again here, outside the model's reach.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFilm } from '../pipeline/film.mjs';
import { deepseekKey } from '../pipeline/lib/deepseek.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
// Tasks normally come from the eval cases. --cases points at another folder of tasks, such as films/.
const casesDir = value('--cases') ? path.resolve(value('--cases')) : path.join(here, 'cases');
if (args.includes('--help')) {
  console.log(`用法：node evals/agent-run.mjs [选项]

  让模型在没有人值守的情况下完成每个用例，并记录轮数、费用和结果。
  需要 Claude Code 命令行（claude）。默认用它已登录的账号和模型。

  --only <a,b>      只跑指定的用例
  --cases <目录>    任务所在的目录，默认是 evals/cases；也可以指向 films，让模型重做一支真实的片子
  --repeat <n>      每个用例跑几遍，默认 1；多于 1 遍时汇总里有每个用例的通过次数
  --provider <名称> 换一家模型供应商：deepseek（需要 DEEPSEEK_API_KEY）
  --model <名称>    指定模型，默认用命令行当前配置的模型；换供应商时默认用它的 deepseek-flash
  --jobs <n>        同时跑几个，默认 3
  --budget <美元>   每个用例的费用上限，默认 8；换供应商时不生效，靠时间上限兜底
  --timeout <分钟>  每个用例的时间上限，默认 30
  --work <目录>     工作区位置，默认在系统临时目录
  --label <名称>    结果目录名，默认是 日期-模型
  --summarize <名称> 不运行，只按已有记录重新生成该结果目录的汇总`);
  process.exit(0);
}
// Other model suppliers, reached through the same command line by pointing it at their
// Anthropic-compatible endpoint. Prices are the supplier's published ones, in US dollars.
const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    key: deepseekKey,
    keyName: 'DEEPSEEK_API_KEY',
    // The model that reads images: the director has to look at the contact sheet.
    model: 'deepseek-flash',
    // Per million tokens: input served from the supplier's cache, other input, output.
    prices: {
      'deepseek-flash': { hit: 0.003, miss: 0.15, out: 0.6 },
      'deepseek-v4-pro': { hit: 0.022, miss: 0.66, out: 1.98 },
    },
    // Double at peak hours: 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday. Public holidays in China
    // are off-peak as well; they are not known here, so a holiday run is priced too high.
    peak: (d) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && [1, 2, 3, 6, 7, 8, 9].includes(d.getUTCHours()),
    peakFactor: 2,
  },
};
// Paid narration voices: list price per 10,000 billed characters, counted by the pipeline as the supplier counts.
const SPEECH_PRICES = { deepseek: 0.45 };

const only = value('--only')?.split(',');
const provider = value('--provider') ? PROVIDERS[value('--provider')] : null;
if (value('--provider') && !provider) {
  console.error(`不认识的供应商 "${value('--provider')}"，可用：${Object.keys(PROVIDERS).join('、')}`);
  process.exit(2);
}
if (provider && !value('--summarize') && !provider.key()) {
  console.error(`没有找到 ${provider.name} 的密钥，请设置环境变量 ${provider.keyName}`);
  process.exit(2);
}
const model = value('--model') ?? provider?.model;
const jobs = Number(value('--jobs') ?? 3);
const repeat = Math.max(1, Number(value('--repeat') ?? 1));
const budget = Number(value('--budget') ?? 8);
const timeoutMin = Number(value('--timeout') ?? 30);
const workRoot = value('--summarize') ? null : path.resolve(value('--work') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'dreamfactory-agent-')));
// One narration cache for the model's runs and the check afterwards: a line already synthesized is not paid for twice.
if (workRoot) process.env.DF_TTS_CACHE ??= path.join(workRoot, '.tts-cache');
// With another supplier the command line keeps its settings and session files here, not in the user's own.
const configDir = provider && workRoot ? path.join(workRoot, '.claude') : null;

const PROMPT = `你在一条做数据短片的管线里工作。这次没有人值守，没有人可以提问，全程自己完成。

工作目录里有 DIRECTOR.md（导演规范）、pipeline/（管线）和 task/（任务）。
task/ 里有 brief.md（简报）、data.json（数据）、expect.json（要求）。
先读 DIRECTOR.md，按它的流程写出 task/film.json，直到草稿渲染（--draft）的自检全部通过。

这次运行的权限如下。超出范围的操作会被直接拒绝，不会有人来批准：
- 读文件：只能读工作目录里的文件，用读取工具。
- 写文件：只能用写入、编辑工具新建和修改 task/film.json，以及确有需要时的 task/scenes.js。
- 运行命令：只放行三种。一种是 ls。一种是 node pipeline/cli.mjs run task，后面可以加 --no-video 或 --draft。
  还有一种是 node pipeline/cli.mjs frames task <起始秒> <结束秒>，把一段连续帧拼成 task/out/frames.jpg，用来看动作。
  命令后面不要接分号、管道、重定向或别的命令，否则整条会被拒绝。
- 某一条命令被拒绝，只说明那一条不在放行范围内。上面三种命令仍然可以用。
- 管线输出的开头就是结论，不需要另外看退出码。

按 DIRECTOR.md 的规定最多返工 3 轮；仍不通过就停下，说明卡在哪里。

结束时用三五句话报告：是否通过、管线跑了几次、每次改了什么。`;

// What the director is allowed to touch: write only inside task/, run only the pipeline on the task.
// Reading needs no rule inside the working directory and is refused outside it; the one exception
// is the command line's own cache of long tool output. Everything else is refused without a prompt.
const TOOLS = ['Edit(task/**)', 'Bash(node pipeline/cli.mjs run task:*)', 'Bash(node pipeline/cli.mjs frames task:*)', 'Bash(ls:*)', `Read(${configDir ? `/${configDir}` : '~/.claude'}/projects/**)`];

// What the command line and the pipeline under it need from this machine: paths, locale, proxy and
// certificate settings, and the pipeline's own switches.
const PASS_ON = /^(PATH|HOME|USER|LOGNAME|SHELL|TERM|LANG|LC_\w+|TZ|TMPDIR|TEMP|TMP|https?_proxy|no_proxy|all_proxy|NODE_PATH|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|SSL_CERT_\w+|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE|PLAYWRIGHT_\w+|HF_\w+|XDG_\w+|PYTHON\w+|VIRTUAL_ENV|DF_\w+)$/i;

/**
 * The environment the command line runs in. By default, this one. With another supplier it is built from
 * scratch: a short list of what is needed, then the supplier's endpoint and key. The sign-in and session
 * of whoever started this script are not handed to another company's endpoint.
 */
function cliEnv() {
  if (!provider) return { ...process.env };
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => PASS_ON.test(k)));
  const key = provider.key();
  return {
    ...env,
    CLAUDE_CONFIG_DIR: configDir,
    ANTHROPIC_BASE_URL: provider.baseUrl,
    ANTHROPIC_AUTH_TOKEN: key,
    // Every role the command line fills goes to the one model, so nothing is quietly served by another.
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    [provider.keyName]: key, // the pipeline's narration voice and listening check use the same key
  };
}

function treeHash(dir, skip = []) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const rel = path.relative(dir, p);
      if (skip.includes(rel.split(path.sep)[0])) continue;
      const st = fs.lstatSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) h.update(rel).update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}
const fileHash = (files) => files.reduce((h, f) => h.update(fs.readFileSync(f)), createHash('sha256')).digest('hex');

function runCli(ws, transcriptFile) {
  const cliArgs = ['-p', PROMPT, '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--permission-mode', 'dontAsk'];
  // The command line counts money by its own models' prices, so its budget means nothing for another
  // supplier's model. There the time limit is the only stop.
  if (!provider) cliArgs.push('--max-budget-usd', String(budget));
  if (model) cliArgs.push('--model', model);
  cliArgs.push('--allowedTools', ...TOOLS);
  return new Promise((resolve) => {
    const child = spawn('claude', cliArgs, { cwd: ws, env: cliEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    const out = fs.createWriteStream(transcriptFile);
    let stderr = '';
    let timedOut = false;
    child.stdout.pipe(out);
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMin * 60000);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: String(e.message), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      out.end(() => resolve({ code, stderr, timedOut }));
    });
  });
}

function readTranscript(file, ws) {
  const events = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const uses = events
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => e.message?.content ?? [])
    .filter((b) => b.type === 'tool_use');
  const ownSpill = (p) => p.includes(`${path.sep}.claude${path.sep}`) && p.includes(`${path.sep}tool-results${path.sep}`);
  const inside = (p) => path.resolve(ws, p).startsWith(fs.realpathSync(ws)) || path.resolve(ws, p).startsWith(ws) || ownSpill(p);
  // Any call that names a path outside the workspace counts, whether it went through or was refused.
  const outside = uses
    .filter((u) => ['Read', 'Glob', 'Grep'].includes(u.name))
    .map((u) => u.input?.file_path ?? u.input?.path)
    .filter((p) => p && !inside(p));
  for (const u of uses) {
    if (u.name === 'Bash' && String(u.input?.command ?? '').includes(repo)) outside.push(`Bash: ${String(u.input.command).slice(0, 120)}`);
  }
  return { result: events.findLast((e) => e.type === 'result') ?? null, toolUses: uses.length, readsOutsideWorkspace: outside };
}

/**
 * passed: the model got its own draft through the checks, and the film passes again here.
 * unchecked: the film passes here, but the model never got a draft through the checks itself.
 * interrupted: the model did not end normally (usage limit, budget, timeout).
 */
function outcomeOf(r) {
  if (!r.agent.finished) return 'interrupted';
  if (!r.verified.passed) return 'failed';
  return r.roundLog.some((x) => x.passed && x.rendered) ? 'passed' : 'unchecked';
}

async function runCase(id, attempt) {
  // With several runs of a case, each gets its own workspace and its own record: <case>-r2 is the second.
  const name = repeat > 1 ? `${id}-r${attempt}` : id;
  const src = path.join(casesDir, id);
  const ws = path.join(workRoot, name);
  const task = path.join(ws, 'task');
  fs.rmSync(ws, { recursive: true, force: true });
  fs.mkdirSync(task, { recursive: true });
  for (const d of ['pipeline', 'verticals']) fs.cpSync(path.join(repo, d), path.join(ws, d), { recursive: true });
  for (const f of ['DIRECTOR.md', 'package.json']) fs.copyFileSync(path.join(repo, f), path.join(ws, f));
  const inputs = ['brief.md', 'data.json', 'expect.json'];
  for (const f of inputs) fs.copyFileSync(path.join(src, f), path.join(task, f));
  if (fs.existsSync(path.join(repo, 'node_modules'))) fs.symlinkSync(path.join(repo, 'node_modules'), path.join(ws, 'node_modules'), 'dir');
  const before = { rules: treeHash(ws, ['task', 'node_modules', '.cache']), inputs: fileHash(inputs.map((f) => path.join(task, f))) };

  console.log(`开始   ${name}`);
  const startedAt = new Date();
  const transcript = path.join(workRoot, `${name}.transcript.jsonl`);
  const cli = await runCli(ws, transcript);
  const { result, toolUses, readsOutsideWorkspace } = readTranscript(transcript, ws);

  const filmFile = path.join(task, 'film.json');
  const scenesFile = path.join(task, 'scenes.js');
  const delivered = fs.existsSync(filmFile);
  const scenes = fs.existsSync(scenesFile) ? fs.readFileSync(scenesFile, 'utf8') : null;
  const logFile = path.join(task, 'out', 'runs.jsonl');
  const roundLog = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
        .map((r) => ({ round: r.round, passed: r.passed, failed: r.failed, rendered: r.rendered, filmVersion: r.filmVersion, backend: r.backend, ttsBilled: r.ttsBilled }))
    : [];

  // Check the delivered film again against the case's own data and requirements.
  let verified = { passed: false, failed: ['(没有交付 film.json)'], durationSec: null };
  if (delivered) {
    try {
      const r = await runFilm(src, { film: JSON.parse(fs.readFileSync(filmFile, 'utf8')), scenes, draft: true, log: false, outDir: path.join(workRoot, `${name}.verify`) });
      verified = { passed: r.passed, failed: r.failed, durationSec: r.durationSec };
    } catch (e) {
      verified = { passed: false, failed: [`(运行出错：${e.message.split('\n')[0]})`], durationSec: null };
    }
  }

  const usage = result?.modelUsage ?? {};
  const mainModel = Object.entries(usage).sort((a, b) => b[1].costUSD - a[1].costUSD)[0]?.[0] ?? model ?? 'unknown';
  const sum = (k) => Object.values(usage).reduce((a, u) => a + (u[k] ?? 0), 0);
  // The command line prices a model it does not know as one of its own. Where the supplier has a price
  // list, the cost is worked out here from the token counts instead.
  const price = provider?.prices[mainModel];
  const peak = Boolean(price) && provider.peak(startedAt);
  const modelCost = !result
    ? null
    : price
      ? Object.values(usage).reduce((a, u) => a + (u.cacheReadInputTokens * price.hit + u.inputTokens * price.miss + u.outputTokens * price.out) / 1e6, 0) * (peak ? provider.peakFactor : 1)
      : result.total_cost_usd;
  // Narration the model's runs had synthesized by a paid voice, at list price.
  const voice = roundLog.findLast((r) => r.backend)?.backend ?? null;
  const ttsBilled = roundLog.reduce((a, r) => a + (r.ttsBilled ?? 0), 0);
  const speechCost = (ttsBilled * (SPEECH_PRICES[voice] ?? 0)) / 1e4;
  const usd = (x) => (x == null ? null : Math.round(x * 1e4) / 1e4);
  const record = {
    case: id,
    run: name,
    model: mainModel,
    provider: provider?.name ?? null,
    delivered,
    customScene: Boolean(scenes),
    verified,
    pipelineRuns: roundLog.length,
    failedRuns: roundLog.filter((r) => !r.passed).length,
    filmVersions: new Set(roundLog.map((r) => r.filmVersion).filter(Boolean)).size || null,
    roundLog,
    agent: {
      finished: Boolean(result) && !result.is_error && (result.terminal_reason ?? 'completed') === 'completed',
      stopReason: !result
        ? cli.timedOut ? `超过时间上限 ${timeoutMin} 分钟` : `命令行退出码 ${cli.code}`
        : !result.is_error
          ? '完成'
          : `${result.terminal_reason ?? result.subtype}${result.api_error_status ? ` ${result.api_error_status}` : ''}：${String(result.result ?? '').split('\n')[0].slice(0, 80)}`,
      turns: result?.num_turns ?? null,
      toolUses,
      wallSec: result ? Math.round(result.duration_ms / 1000) : null,
      costUsd: usd(modelCost),
      // "price-list": worked out here from the supplier's prices; "cli": the figure the command line reported.
      costBasis: !result ? null : price ? 'price-list' : 'cli',
      pricePeriod: price ? (peak ? 'peak' : 'off-peak') : null,
      tokens: { input: sum('inputTokens'), output: sum('outputTokens'), cacheRead: sum('cacheReadInputTokens'), cacheWrite: sum('cacheCreationInputTokens') },
      refusedActions: (result?.permission_denials ?? []).map((d) => `${d.tool_name}: ${JSON.stringify(d.tool_input).slice(0, 120)}`),
    },
    integrity: {
      rulesUntouched: treeHash(ws, ['task', 'node_modules', '.cache']) === before.rules,
      inputsUntouched: fileHash(inputs.map((f) => path.join(task, f))) === before.inputs,
      readsOutsideWorkspace,
    },
    speech: { backend: voice, billedChars: ttsBilled, costUsd: usd(speechCost) },
    costUsd: usd(modelCost == null ? null : modelCost + speechCost),
    limits: { budgetUsd: provider ? null : budget, timeoutMin },
    report: result?.result ?? cli.stderr.slice(-600),
    files: { film: delivered ? filmFile : null, scenes: scenes ? scenesFile : null, runs: fs.existsSync(logFile) ? logFile : null },
  };
  record.outcome = outcomeOf(record);
  console.log(`${{ passed: '通过  ', failed: '未通过', interrupted: '中断  ', unchecked: '未自检' }[record.outcome]} ${name}  管线 ${record.pipelineRuns} 次，${record.costUsd ?? '?'} 美元`);
  return record;
}

const summarizeOnly = value('--summarize');
const ids = summarizeOnly ? [] : fs.readdirSync(casesDir).filter((d) => fs.existsSync(path.join(casesDir, d, 'brief.md'))).sort().filter((d) => !only || only.includes(d));
// Run by run across the cases, so a second run of a case starts only after every case has had its first.
const todo = Array.from({ length: repeat }, (_, k) => ids.map((id) => [id, k + 1])).flat();
const records = new Array(todo.length);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, todo.length) }, async () => {
    while (next < todo.length) {
      const i = next++;
      records[i] = await runCase(...todo[i]);
    }
  }),
);

// Save what the model delivered, and a summary.
let label = summarizeOnly ?? value('--label') ?? `${new Date().toISOString().slice(0, 10)}-${records[0]?.model ?? 'unknown'}`;
const date = label.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? new Date().toISOString().slice(0, 10);
if (!summarizeOnly && !value('--label')) {
  // Never write over an earlier run's record.
  const base = label;
  for (let n = 2; fs.existsSync(path.join(here, 'agent-runs', label)); n++) label = `${base}-run${n}`;
}
const outDir = path.join(here, 'agent-runs', label);
for (const r of records) {
  const dir = path.join(outDir, r.run);
  fs.mkdirSync(dir, { recursive: true });
  if (r.files.film) fs.copyFileSync(r.files.film, path.join(dir, 'film.json'));
  if (r.files.scenes) fs.copyFileSync(r.files.scenes, path.join(dir, 'scenes.js'));
  if (r.files.runs) fs.copyFileSync(r.files.runs, path.join(dir, 'runs.jsonl'));
  const { files, ...rest } = r;
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(rest, null, 2) + '\n');
}

// The summary covers every case recorded under this label, so an interrupted case can be re-run alone.
const all = fs.readdirSync(outDir).filter((d) => fs.existsSync(path.join(outDir, d, 'result.json'))).sort()
  .map((d) => JSON.parse(fs.readFileSync(path.join(outDir, d, 'result.json'), 'utf8')));
const caseIds = [...new Set(all.map((r) => r.case))];
const repeated = all.length > caseIds.length;
const unit = repeated ? '次运行' : '个用例';
// Did the first thing the model handed to the pipeline already pass? The sharpest single number here.
const firstTry = (r) => r.roundLog[0]?.passed === true;
const mean = (list, get) => (list.length ? list.reduce((a, r) => a + (get(r) ?? 0), 0) / list.length : 0);
const outcome = outcomeOf;
// Records from before narration was priced carry the model's cost only.
const cost = (r) => r.costUsd ?? r.agent.costUsd;
const money = (x) => (x == null ? '' : x >= 0.1 ? x.toFixed(2) : String(Number(x.toFixed(3))));
const perMinute = (r) => (cost(r) != null && r.verified.durationSec ? money(cost(r) / (r.verified.durationSec / 60)) : '');
const paidVoice = all.some((r) => r.speech?.costUsd);
const limits = all[0]?.limits ?? { budgetUsd: budget, timeoutMin: null };
const priced = all.filter((r) => r.agent.costBasis === 'price-list');
const periods = [...new Set(priced.map((r) => (r.agent.pricePeriod === 'peak' ? '高峰时段' : '非高峰时段')))].join('、');
const count = (o) => all.filter((r) => outcome(r) === o).length;
const clean = (r) => r.integrity.rulesUntouched && r.integrity.inputsUntouched && r.integrity.readsOutsideWorkspace.length === 0;
const verdict = (r) =>
  ({ interrupted: `中断：${r.agent.stopReason}`, failed: `未通过：${r.verified.failed.join('、')}`, unchecked: '未自检', passed: '通过' })[outcome(r)];
const md = [
  `# 无人值守运行：${label}`,
  '',
  `${count('passed')}/${all.length} ${unit}由模型自己跑通自检，并通过复验${count('unchecked') ? `；${count('unchecked')} 个交付的影片能通过复验，但模型自己没有跑通自检` : ''}${count('failed') ? `；${count('failed')} 个未通过复验` : ''}${count('interrupted') ? `；${count('interrupted')} 个中途被打断，不计入结果` : ''}。模型只拿到简报、数据、要求和导演规范，看不到参考影片，全程没有人介入。`,
  '',
  `第一次交给管线就通过自检的有 ${all.filter(firstTry).length}/${all.length}；平均每${repeated ? '次' : '个用例'}跑管线 ${mean(all, (r) => r.pipelineRuns).toFixed(1)} 次，费用 ${money(mean(all.filter((r) => cost(r) != null), cost))} 美元。`,
  '',
  `模型 ${all[0]?.model}${all[0]?.provider ? `（${all[0].provider}）` : ''} · ${date} · 每个用例${limits.budgetUsd != null ? `费用上限 ${limits.budgetUsd} 美元` : `时间上限 ${limits.timeoutMin} 分钟`}${all[0]?.speech?.backend ? ` · 旁白语音 ${all[0].speech.backend}` : ''}`,
  '',
  `| 用例 | 结果 | 管线运行 | 其中未通过 | 分镜版本 | 写了场景代码 | 模型轮数 | 用时（秒） | 费用（美元） |${paidVoice ? ' 其中语音 |' : ''} 片长（秒） | 每分钟成片（美元） | 守规 |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- |${paidVoice ? ' --- |' : ''} --- | --- | --- |`,
  ...all.map((r) =>
    `| ${r.run ?? r.case} | ${verdict(r)} | ${r.pipelineRuns} | ${r.failedRuns} | ${r.filmVersions ?? ''} | ${r.customScene ? '是' : ''} | ${r.agent.turns ?? ''} | ${r.agent.wallSec ?? ''} | ${money(cost(r))} |${paidVoice ? ` ${money(r.speech?.costUsd)} |` : ''} ${r.verified.durationSec?.toFixed(1) ?? ''} | ${perMinute(r)} | ${clean(r) ? '是' : '否'} |`),
  '',
  '- **结果**：模型交付后，用用例原本的数据和要求重新跑一遍草稿渲染和全部自检，这叫复验。“通过”要求模型自己也跑通过草稿自检；片子能过复验但模型自己没跑通的记为“未自检”。模型没有正常结束的运行（用量限额、费用上限、超时）记为“中断”。',
  '- **管线运行**：模型自己调用管线的次数，含只查文字层的快速运行。',
  '- **分镜版本**：这些运行里实际出现过几版不同的 film.json；分镜没改就重跑的不算新版本。',
  '- **守规**：没有改动管线、规范、数据和要求，也没有读工作区以外的文件。',
  priced.length
    ? `- **费用**里模型的部分，按 ${priced[0].provider} 公布的单价和这次运行的 token 数折算（${periods}）。命令行自己报的费用是按它自家模型的价格算的，这里不采用。`
    : '- **费用**含命令行自身的系统提示开销，每次调用起步约 0.2 美元。',
  ...(paidVoice
    ? ['- **其中语音**：模型自己跑管线时新合成的旁白，已计入费用。按原价每万计费字符 0.45 美元计，一个汉字算 2 个字符；目前限时五折，实际扣费更低。听写核对每小时音频约 0.1 美元，没有计入。']
    : []),
  ...(repeated
    ? [
        '',
        '## 每个用例的稳定性',
        '',
        '| 用例 | 运行 | 通过 | 第一次就通过自检 | 平均管线运行 | 平均费用（美元） |',
        '| --- | --- | --- | --- | --- | --- |',
        ...caseIds.map((id) => {
          const runs = all.filter((r) => r.case === id);
          return `| ${id} | ${runs.length} | ${runs.filter((r) => outcome(r) === 'passed').length} | ${runs.filter(firstTry).length} | ${mean(runs, (r) => r.pipelineRuns).toFixed(1)} | ${money(mean(runs.filter((r) => cost(r) != null), cost))} |`;
        }),
      ]
    : []),
  '',
  '## 模型自己的汇报',
  '',
  ...all.flatMap((r) => [`### ${r.run ?? r.case}`, '', ...String(r.report).trim().split('\n').map((l) => `> ${l}`), '']),
].join('\n');
fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), md);
console.log(`\n${count('passed')}/${all.length} 通过${count('unchecked') ? `，${count('unchecked')} 个未自检` : ''}${count('interrupted') ? `，${count('interrupted')} 个被中断` : ''}。结果：${path.join(outDir, 'SUMMARY.md')}`);
if (!summarizeOnly) console.log(`工作区和完整对话记录：${workRoot}`);
process.exit(count('passed') === all.length ? 0 : 1);
