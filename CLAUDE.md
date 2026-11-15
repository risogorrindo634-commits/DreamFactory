# DreamFactory

用代码做视频的管线。第一条垂直管线是数据故事短片：一份简报加一份数据，产出一支带旁白的数据讲解视频，并用自检把关。背景和判断见 `docs/llm-video-game-research.md`。

## 常用命令

```bash
node pipeline/cli.mjs run <影片目录> --no-video   # 只做文字层检查，十几秒
node pipeline/cli.mjs run <影片目录> --draft      # 草稿画质，带视频和声音检查
node pipeline/cli.mjs run <影片目录>              # 成片
node evals/run.mjs                                # 跑评测集，约七分钟
node evals/run.mjs --only <用例或缺陷的 id>
node evals/agent-run.mjs                          # 让模型无人值守做完每个用例，要花模型费用
node evals/agent-run.mjs --provider deepseek      # 同上，模型换成 DeepSeek，需要 DEEPSEEK_API_KEY
```

做片子之前先读 `DIRECTOR.md`。

## 结构

- `pipeline/`：管线本体。`film.mjs` 是一次运行的全流程，`lib/` 是各个环节，`checks/` 是自检，`tools/asr.py` 是本机语音识别的 Python 小工具。
- `pipeline/lib/deepseek.mjs`：DeepSeek 语音接口的请求函数和密钥读取，语音合成和听写核对共用。
- `.cache/tts/`：合成过的语音和听写结果的缓存，不入库，删掉只会让下次运行慢一些。
- `verticals/data-story/`：数据短片的画面。`runtime/df.js` 里每种场景是一个函数。影片目录里的 `scenes.js` 可以为那一支片子增加场景。
- `films/`：用真实数据做的片子，一支一个目录。除了简报、数据、要求和分镜，还有 `sources.md`（每个数字的出处和核对情况）和 `records/`（运行记录、自检报告、抽帧图）。成片在 `out/` 里，不入库。
- `evals/cases/`：评测用例，每个目录有简报、数据、要求和一支参考影片，个别带参考的 `scenes.js`。
- `evals/defects.json`：缺陷注入集，每条在参考影片上改一处，并写明哪项检查必须失败。
- `evals/BASELINE.md`：上一次评测的结果。
- `evals/agent-run.mjs`：无人值守评测。模型只拿到简报、数据、要求和 `DIRECTOR.md`，看不到参考影片。
- `evals/agent-runs/`：每次无人值守运行交付的分镜、运行记录和汇总。

## expect.json 的字段

| 字段 | 含义 | 哪项检查在查 |
| --- | --- | --- |
| `duration` | `[最短, 最长]`，秒 | `spec` |
| `requireCustomScene` | 内置场景做不出来，必须自己写场景代码 | `spec` |
| `mustShowText` | 必须写在画面上的文字；每一项是 `data.json` 里一个字符串的路径，或者文字本身 | `spec` |
| `mustShow` | 必须在画面上停留满 1 秒的数字 | `data-accuracy` |
| `mustSay` | 旁白必须念到的数字 | `data-accuracy` |
| `markCount` | 自定义图表里标了数值的图形必须正好这么多个 | `marks` |
| `maxFrozenSec`、`maxSilenceSec` | 画面静止和无声的上限，默认 6 秒和 3.5 秒 | `video-stillness`、`audio-gaps` |

`mustShow` 和 `mustSay` 的每一项是 `data.json` 里的路径，也可以是派生的数：`share 路径`、`times 甲 乙`、`up 甲 乙`、`down 甲 乙`，写法和 `film.json` 里的引用相同。

## 约定

- 画面必须只由时间决定。`seek(t)` 里不能用时钟、随机数、CSS 动画，也不能依赖上一帧。
- 新增或修改一项检查，必须同时在 `evals/defects.json` 里加一条它应该抓到的缺陷，然后跑评测。没有缺陷样例的检查等于没有验证过。
- 新增用例要带参考影片，并至少带一条缺陷，说明这个用例里最容易错的是什么。参考影片写完先自己看一遍抽帧图：检查通过不等于画面没问题。
- 改了管线或画面之后跑 `node evals/run.mjs`。干净用例出现失败是误报，要修检查或修参考影片，不能放宽到看不见为止。
- 页面上的文字靠 `data-df-role` 标注角色：`subtitle`、`source`、`tick`（刻度）、`animating`（跳动中的数字）。新场景里的刻度和跳动数字必须标注，否则会被当成事实去核对。
- 文字必须留在最近的 `data-df-box` 容器内，新场景要给会溢出的文字加上这个标记。
- 代表数据的图形要带 `data-df-value`，`marks` 检查靠它核对图形与数值是否一致。
- 缺陷可以改场景代码：`{"file": "scenes", "replace": "原文", "with": "改成"}`。改参考的 `scenes.js` 时要确认缺陷里引用的原文还在。
- 有的检查守的是管线的一个环节，影片内容怎么改都触发不了（字体、响度）。这类缺陷直接弄坏那个环节：`{"file": "faults", "set": "mixGainDb", "value": 6}`。可用的故障见 `pipeline/film.mjs` 里 `faults` 的说明；只能在某个系统上注入的缺陷要写 `"platform"`。
- 检查里的阈值要有出处。`crowding` 的三个阈值是在全部参考影片和 `evals/agent-runs/` 里历次交付的片子上量出来的，改之前先重量一遍。
- 不引入 npm 依赖，除了 Playwright。在已经预装 Playwright 的云端环境里不要运行 `npm install`。
- 语音供应商都在 `pipeline/lib/tts.mjs`，一个后端一个函数。新增后端后跑一遍评测，参考影片的片长会随语速变化，贴着时长上下限的要调整参考影片，不要放宽要求。
- `auto` 选语音的顺序：有 DeepSeek 密钥时用 `deepseek`，否则 `edge`，再否则 `espeak`，最后是静音轨。听写核对同理：有密钥用 DeepSeek，否则用本机的 faster-whisper。
- 密钥读 `DEEPSEEK_API_KEY`。云端环境里如果变量叫 `api_key`，且旁边的 `base_url` 指向 DeepSeek，也认。密钥不要写进仓库和命令行参数。
- 评测默认用 `auto` 选中的语音。参考影片在两种组合下都必须通过，改了语音、混音或听写相关的代码后两种都要跑：直接跑是 DeepSeek 语音加 DeepSeek 听写，`DF_ASR=whisper node evals/run.mjs --tts edge` 是 Edge 语音加本机听写。
- 没有网络时加 `--tts espeak`，这时听写核对会跳过，对应的缺陷记为“未判定”。
- 无人值守评测接新的模型供应商，在 `evals/agent-run.mjs` 的 `PROVIDERS` 里加一项：兼容 Anthropic 接口的地址、密钥、默认模型和公布的单价。命令行自己报的费用只对它自家的模型准确。
- 用真实数据做片子时，每个数字都要有读过原文的出处，写进那支片子的 `sources.md`；只见转述、没读到原文的数字要在画面上区分出来。做完把识别结果逐句对一遍：数字念对了不等于意思没听错。
- 代码注释用英文，文档和报告用中文。
- 改动直接提交并推送到 `main`，不另开分支，不开 PR。
