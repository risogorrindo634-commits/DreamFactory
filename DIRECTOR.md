# 导演规范：数据故事短片

这份规范写给做片子的智能体。任务是把一份简报和一份数据，做成一支带旁白的数据短片，并让它通过自检。

## 流程

1. 读影片目录里的 `brief.md`、`data.json`、`expect.json`。
2. 写 `film.json`（字段见下文）。内置场景做不出简报要求的画面时，再写 `scenes.js`（见“自定义场景”）。
3. 跑文字层检查，十几秒出结果：

   ```bash
   node pipeline/cli.mjs run <影片目录> --no-video
   ```

4. 读终端里的报告，再看 `out/contact.jpg` 抽帧图。报告只查得出能量化的问题，构图和节奏要靠看图。
5. 修 `film.json`，重跑。检查都通过后，渲染草稿并查画面和声音：

   ```bash
   node pipeline/cli.mjs run <影片目录> --draft
   ```

6. 草稿通过后，去掉 `--draft` 出成片，成片在 `out/film.mp4`。

最多返工 3 轮。3 轮后仍不通过，停下来把报告交给人，不要继续试。

终端输出的开头就是结论，不需要另外查看退出码。运行本身出错时（比如引用了不存在的数据、字段写错）不会有报告，只有一行“运行失败”和原因。

## 硬性规则

- **数字只引用，不手写。** 来自数据的数字一律写成 `{{facts.total}}` 或 `{"$": "series.categories"}`。手写的数字只要不在 `data.json` 里，检查就会失败。
- **不要为了通过检查去改 `data.json` 或 `expect.json`。** 它们是任务给的事实和要求。确实需要一个数据里没有的数字，停下来问人；没有人可问时按下一条处理。
- **简报的要求在规则内做不到时，交付能做到的部分并说明。** 比如简报要一个数据里没有的数字（增幅、倍数）：不要自己算出来写上去，也不要改写成汉字数字来绕过检查。交付规则内能做到的版本，并在汇报里写明哪条要求没有满足、缺什么。
- **数字写阿拉伯数字。** 写成汉字的数字同样会核对：“两千七百”“四点五倍”“九成”只要不在 `data.json` 里，检查一样失败。
- **每句旁白不超过 30 个汉字**（英文 84 个字符），一句只讲一件事。长句拆开。
- **数字和拉丁字母单位之间留空格**，写 `220 KB`，不写 `220KB`。紧贴字母的数字会被当成名字的一部分，比如 `3D`。
- **有数据的片子必须写 `source`**，并包含 `data.json` 里的 `source.name`。
- **不要削弱检查。** 检查报错时改片子，不改 `pipeline/checks/`。认为检查本身错了，停下来说明理由。

## 记录

每跑一次，`out/runs.jsonl` 会记一轮。下面两项需要自己补：

```bash
# 人改了东西，或者人给了修改意见
node pipeline/cli.mjs run <影片目录> --no-video --intervention "把标题改短"

# 这一轮花掉的模型费用
node pipeline/cli.mjs run <影片目录> --draft --cost-usd 1.25
```

管线靠这三个数衡量：每分钟成片成本、返工轮数、人工介入次数。

## film.json

```json
{
  "vertical": "data-story",
  "lang": "zh",
  "title": "片名，只用于报告",
  "source": "数据来源：{{source.name}}（截至 {{source.asOf}}）",
  "theme": { "accent": "#62c6ff" },
  "voice": { "backend": "auto", "name": "stella" },
  "scenes": []
}
```

- `lang`：`zh` 或 `en`，决定语音和字幕长度上限。
- `theme`：可选，可改 `bg`、`text`、`muted`、`accent`、`bar`、`track` 六个颜色。
- `voice`：可选，整段都可以不写。
  - `backend` 是 `auto`、`deepseek`、`edge`、`espeak`、`silent` 之一。`auto` 会选当前可用的最好的一种，报告开头写着这次用的是哪一种。
  - `name` 是声音，要用所选后端自己的名字。`deepseek` 有 `stella`（女声，默认）和 `tide`（男声）。`edge` 中文默认 `zh-CN-XiaoxiaoNeural`（女声），男声可用 `zh-CN-YunxiNeural`、`zh-CN-YunyangNeural`。名字不属于所用的后端时，会改用默认声音。
  - `rate` 是语速，比如 `+10%`。只有 `edge` 支持，其他后端会忽略。要调片长，增删旁白或场景。

每个场景都可以带这些字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 场景名，出现在报告里 |
| `type` | 场景类型，见下表 |
| `narration` | 旁白，一句一个字符串；字幕与它逐句对应。语音把某个词念错时，可以写成 `{"text": "字幕", "say": "让语音念的写法"}`，只改读法，不要改意思 |
| `minDuration` | 这个场景至少停留多少秒 |
| `duration` | 把场景固定为多少秒；短于旁白会报错 |

场景时长默认由旁白决定：旁白念多久，场景就停多久。

## 场景类型

| 类型 | 用途 | 专有字段 |
| --- | --- | --- |
| `title` | 开场 | `kicker`、`headline`、`sub` |
| `bignumber` | 强调一个数字 | `label`、`value`、`unit`、`note` |
| `bars` | 比较一组数量 | `title`、`sub`、`series`、`highlight`、`unit`、`showShare` |
| `ranges` | 比较一组区间，对数刻度 | `title`、`sub`、`series`、`highlight`、`unit`、`scale` |
| `bullets` | 几条结论 | `title`、`items` |
| `outro` | 收尾 | `headline`、`sub` |

- `bars` 的 `series` 是 `[{label, value}]`，`ranges` 的是 `[{label, low, high}]`，都应该引用数据。
- `highlight` 填一个 `label`，那一行用强调色。
- `showShare` 为真时，每行多显示占比。
- `unit` 直接写单位，比如 `件` 或 `works`，不用自己加空格。
- `ranges` 的坐标轴总是对数刻度。`scale` 可选，写成 `[下限, 上限]` 两个正数；不写时自动取到 10 的整数次幂。向观众解释刻度时说“每一格差一个数量级”；“十倍”是一个不在数据里的数字。
- `bullets` 的条数和旁白句数相同时，每条会在对应那句旁白开始时出现。

## 自定义场景

内置的六种场景做不出简报要求的画面时（比如折线图），在影片目录里写一个 `scenes.js`，为这支片子增加场景类型。能用内置场景就不要自己写。

```js
// scenes.js
export default {
  // 名字就是 film.json 里的 type，不能与内置场景同名
  line(scene, root, kit) {
    // 这里只运行一次，用来搭好画面。
    // scene 是 film.json 里这个场景的内容，数据引用已经填好；root 是这个场景的容器。
    const { h, svg, ease, clamp, rise, fmt, chartHead } = kit;
    chartHead(scene, root); // 画 scene.title 和 scene.sub
    const chart = svg('svg', { width: 1640, height: 560, viewBox: '0 0 1640 560' }, root);
    // ……创建图形和文字……

    // 返回的函数每一帧调用一次。t 是进入这个场景后的秒数，
    // lines 是这个场景每句旁白的 { start, end }，同样以场景开始为零点。
    return (t, lines) => {
      // 只根据 t 设置样式和属性
    };
  },
};
```

`kit` 提供的工具：

| 工具 | 作用 |
| --- | --- |
| `h(标签, 类名, 文字, 父元素)` | 创建 HTML 元素 |
| `svg(标签, 属性对象, 父元素)` | 创建 SVG 元素；颜色和字号写在 `style` 属性里 |
| `ease(x)`、`clamp(x)` | 把进度压到 0–1，`ease` 带缓出 |
| `rise(元素, 进度)` | 淡入并上移 |
| `fmt(数字)` | 加千分位 |
| `chartHead(scene, root)` | 画标题和副标题 |

- 颜色用主题变量：`var(--text)`、`var(--muted)`、`var(--accent)`、`var(--bar)`、`var(--track)`。
- 场景可用的区域宽 1640 像素，标题以下高约 640 像素。

自定义场景的规则，每条都有检查：

- **画面只由 `t` 决定。** 不用 `Math.random()`、`Date`、定时器、CSS 动画，不在两帧之间保留状态。检查会把同一时刻重画一遍，结果不同就失败。
- **文字必须是真正的文字**，用 HTML 元素或 SVG 的 `text`，不要画在 canvas 上，否则检查读不到，观众看到的数字也就没人核对。
- **代表数据的图形要标数值。** 给每个点或柱加上 `data-df-value="数值"`。检查会核对：数值大的图形必须更长、更高或位置更靠上。一个场景里有几组图形时，用 `data-df-group` 区分。
- **不是事实的数字要标角色。** 刻度和坐标轴标签所在的元素加 `data-df-role="tick"`，正在跳动的数字加 `data-df-role="animating"`，否则它们会被当成事实去核对。
- **字号**：正文不小于 28 像素，刻度不小于 20 像素。
- **文字周围留空。** 数值标签不要压在线条、圆点上，不要紧贴刻度或别的文字，带底框的标签不要盖住旁边的文字。检查会把文字隐去，看每段文字背后有没有别的图形穿过，也会看文字是不是被盖住了。折线向上走得陡的地方，标签放在点的左上方。

## 数据引用

| 写法 | 得到 |
| --- | --- |
| `{"$": "series.categories"}` | 整个数组或对象 |
| `{"$": "series.categories[游戏]"}` | 按 `label` 取其中一行，可以用几个这样的引用拼出一个子集 |
| `{{facts.total}}` | 一个数字；画面上带千分位，旁白里不带 |
| `{{series.categories[游戏]}}` | 按 `label` 取一行的 `value` |
| `{{series.cost[工作室].high}}` | 按 `label` 取一行里的某个字段 |
| `{{share series.categories[游戏]}}` | 这一行占整组的百分比，取整，已经带百分号，后面不要再写 `%` |

可以出现的数字有四类：`data.json` 里的任何数字、标签等文字里写着的数字（比如“7月”里的 7）、每组数据的合计、每一行的占比。占比按 `data.json` 里的整组数据算；只展示一部分行时不要打开 `showShare`，它会按展示出来的这几行重新算。

数据里写成字符串的值原样显示，不加千分位，年份就是这样存的。

## 检查失败时怎么改

| 检查 | 常见原因 | 改法 |
| --- | --- | --- |
| `data-accuracy` | 手写了数字（写成汉字也算），或漏了必须出现的数据 | 改成引用；对照 `expect.json` 的 `mustShow` 和 `mustSay` |
| `citation` | 没写 `source` | 补上，并包含 `source.name` |
| `readability` | 场景太短 | 加旁白，或设 `minDuration` |
| `layout` | 文字太长 | 缩短文字 |
| `crowding` | 自定义图表里，标签压在线条或图形上、紧贴刻度，或被别的图形盖住 | 把标签挪到空白处，和线条、刻度、别的文字之间留出空隙 |
| `contrast` | 改了主题色 | 换一个与背景差得更开的颜色 |
| `subtitles` | 旁白太长 | 拆成两句 |
| `sync` | 旁白念到一个数字时，画面上还没有它 | 让图形早点出现，或把这句旁白往后挪 |
| `typography` | 占比引用后面又写了 `%`，或引用少写了括号 | 删掉多余的符号，补全括号 |
| `empty-frames` | 场景没有内容 | 补内容，或删掉这个场景 |
| `marks` | 自定义图表里图形的位置或大小与数值对不上，或没有标数值 | 检查坐标换算；给每个代表数据的图形加 `data-df-value` |
| `determinism` | 自定义场景用了随机数、时钟，或在两帧之间留了状态 | 改成只根据传入的时间计算 |
| `video-stillness` | 一句旁白太长，画面一直不动 | 拆句，或把内容分到两个场景 |
| `asr` | 语音没有念出字幕里的数字，或 `say` 写的和字幕不是一回事 | 检查 `say`；数字写成阿拉伯数字，单位写全 |
| `audio-gaps` | 场景没有旁白，或 `minDuration` 远大于旁白 | 补旁白，或缩短 |
| `spec` | 片长超出要求 | 增删场景或旁白 |
