#!/usr/bin/env node
// Agent-facing entry point. Exit code: 0 all checks pass, 1 some check failed, 2 the run itself broke.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runFilm } from './film.mjs';
import { openStage } from './lib/stage.mjs';

const USAGE = `用法：node pipeline/cli.mjs run <影片目录> [选项]
      node pipeline/cli.mjs frames <影片目录> <起始秒> <结束秒> [--step <秒>]

  影片目录里要有 film.json 和 data.json，可选 expect.json。产物写到 <影片目录>/out/。

  frames 把一段时间里的连续帧拼成一张图（out/frames.jpg），从左到右、从上到下，用来看动作：
  抽帧图隔几秒才一张，看不出东西是怎么动的。要先 run 过一次。--step 默认 1/15 秒，最多 24 帧。

选项：
  --draft               草稿画质（半分辨率、15 帧），返工阶段用，快
  --no-video            不渲染视频，只做文字层检查，最快
  --tts <后端>          auto（默认）| espeak | edge | silent
  --only <a,b>          只跑指定的检查
  --cost-usd <数字>     记录这一轮花掉的模型费用
  --intervention <说明> 记录一次人工介入
`;

const args = process.argv.slice(2);
if (args[0] === 'frames' && args[1] && !args.includes('--help')) {
  await frames();
  process.exit(0);
}
if (args[0] !== 'run' || !args[1] || args.includes('--help')) {
  console.log(USAGE);
  process.exit(args.includes('--help') ? 0 : 2);
}
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const filmDir = path.resolve(args[1]);
try {
  const report = await runFilm(filmDir, {
    draft: args.includes('--draft'),
    video: !args.includes('--no-video'),
    tts: value('--tts'),
    only: value('--only')?.split(','),
    costUsd: value('--cost-usd') != null ? Number(value('--cost-usd')) : undefined,
    intervention: value('--intervention'),
  });
  process.stdout.write(fs.readFileSync(path.join(filmDir, 'out', 'report.md'), 'utf8'));
  process.exit(report.passed ? 0 : 1);
} catch (e) {
  console.error(`运行失败：${e.message}`);
  process.exit(2);
}

/** A strip of consecutive frames, for judging motion. */
async function frames() {
  const filmDir = path.resolve(args[1]);
  const outDir = path.join(filmDir, 'out');
  const from = Number(args[2]);
  const to = Number(args[3]);
  const i = args.indexOf('--step');
  const step = i >= 0 ? Number(args[i + 1]) : 1 / 15;
  if (!fs.existsSync(path.join(outDir, 'build', 'film.resolved.json'))) {
    console.error('运行失败：还没有画面，先运行一次 node pipeline/cli.mjs run');
    process.exit(2);
  }
  if (!(to > from) || !(step > 0)) {
    console.error('运行失败：要写起始秒和结束秒，结束要晚于起始');
    process.exit(2);
  }
  const times = [];
  for (let t = from; t <= to + 1e-9 && times.length < 24; t += step) times.push(Math.round(t * 1000) / 1000);
  const vertical = await import('../verticals/data-story/vertical.mjs');
  const stage = await openStage({ outDir, vertical, draft: true });
  const file = path.join(outDir, 'frames.jpg');
  const cols = 4;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '1', '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=480:-2,tile=${cols}x${Math.ceil(times.length / cols)}:padding=6:margin=6:color=0x202020`, '-frames:v', '1', '-q:v', '3', file], { stdio: ['pipe', 'ignore', 'inherit'] });
  try {
    for (const t of times) {
      await stage.seek(Math.min(t, stage.duration - 0.001));
      ff.stdin.write(await stage.page.screenshot({ type: 'jpeg', quality: 85 }));
    }
  } finally {
    await stage.close();
  }
  await new Promise((resolve) => {
    ff.on('close', resolve);
    ff.stdin.end();
  });
  console.log(`连续帧：${file}`);
  console.log(`从左到右、从上到下依次是 ${times.map((t) => `${t}s`).join('、')}`);
}
