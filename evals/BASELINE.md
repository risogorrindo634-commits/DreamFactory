# 评测基线

干净用例误报 0/12，缺陷检出 59/59。

运行环境：Node v22.23.5 · 语音后端 edge · 草稿画质 · 2026-11-26

## 干净用例

参考影片不应触发任何检查。这里的失败就是误报。

| 用例 | 结果 | 片长（秒） | 误报的检查 |
| --- | --- | --- | --- |
| asks-for-missing-number | 通过 | 27.2 |  |
| cost-per-minute | 通过 | 43.8 |  |
| derived-numbers | 通过 | 30.5 |  |
| gap-in-the-data | 通过 | 26.1 |  |
| long-report | 通过 | 84.1 |  |
| monthly-trend | 通过 | 27.4 |  |
| top-of-long-list | 通过 | 22.0 |  |
| twenty-seconds | 通过 | 14.1 |  |
| two-series | 通过 | 32.6 |  |
| works-by-category | 通过 | 52.6 |  |
| works-by-category-en | 通过 | 48.6 |  |
| chatgpt-four-years | 通过 | 55.4 |  |

## 缺陷注入

每条缺陷只在参考影片上改一处。指定的检查必须失败，否则算漏检。

| 缺陷 | 改了什么 | 应失败的检查 | 结果 | 连带失败的检查 |
| --- | --- | --- | --- | --- |
| number-typo-on-screen | 画面上的数字打错：5,000 写成 5,500 | data-accuracy | 抓到 |  |
| number-wrong-in-narration | 旁白念错数字：483 念成 438 | data-accuracy | 抓到 |  |
| inline-series-wrong-value | 图表不引用数据，手抄时把 483 抄成 583 | data-accuracy | 抓到 | marks |
| required-fact-missing | 任务要求展示的总数没有出现在画面上 | data-accuracy | 抓到 |  |
| range-typo | 区间图手抄数据，把 15,000 抄成 150,000 | data-accuracy | 抓到 |  |
| number-typo-english | 英文版画面上的数字打错：5,000 写成 50,000 | data-accuracy | 抓到 |  |
| double-percent | 占比引用后面又手写了一个百分号，显示成 17%% | typography | 抓到 |  |
| leftover-template | 数据引用少写一个括号，模板符号原样出现在画面上 | typography | 抓到 |  |
| no-source | 数据画面没有标注来源 | citation | 抓到 |  |
| flash-text | 结尾画面一闪而过，来不及读 | readability | 抓到 |  |
| headline-overflow | 标题太长，撑出画面 | layout | 抓到 | readability、crowding |
| low-contrast | 次要文字颜色太接近背景 | contrast | 抓到 |  |
| long-subtitle | 一句旁白太长，字幕挤成两行 | subtitles | 抓到 | data-accuracy |
| empty-scene | 一个场景里什么内容都没有 | empty-frames | 抓到 |  |
| duration-out-of-range | 片长不符合任务要求 | spec | 抓到 |  |
| dead-air | 结尾画面静止且无声地停了十秒 | video-stillness、audio-gaps | 抓到 |  |
| chart-held-in-silence | 片子中间一张图讲完之后又干放了八秒，画面和字幕都不动 | video-stillness | 抓到 | audio-gaps |
| year-with-separator | 年份当成普通数字，显示成 2,026 年 | typography | 抓到 |  |
| share-of-subset | 只展示前 6 名却显示占比，占比是按这 6 个算的 | data-accuracy | 抓到 |  |
| derived-multiple-in-chinese | 倍数写成汉字，而且和引用算出来的不一样：五点五倍 | data-accuracy | 抓到 |  |
| derived-share-in-chinese | 降幅写成汉字放在画面上，引用算出来是 91%，写的是九成 | data-accuracy | 抓到 |  |
| derived-by-hand | 倍数不用引用，自己算了手写上去，还算错了：4.6 倍 | data-accuracy | 抓到 |  |
| derived-not-said | 任务要求讲的降幅没有讲，只说“降了很多” | data-accuracy | 抓到 |  |
| derived-wrong-direction | 成本明明下降了，引用却写成上升 | 拒绝运行并报错 | 抓到 |  |
| number-wrong-in-chinese | 旁白把总数写成汉字，而且写错了：两千八百 | data-accuracy | 抓到 |  |
| long-list-overflow | 把 24 个品类全部塞进一张图 | layout | 抓到 | crowding |
| over-the-time-limit | 20 秒的片子讲了太多，超出时长上限 | spec | 抓到 |  |
| built-in-instead-of-line-chart | 任务要求折线图，却用内置柱状图交差 | spec | 抓到 | layout、crowding |
| chart-points-misplaced | 折线图上的点画在了别的月份的高度上 | marks | 抓到 |  |
| chart-axis-inverted | 折线图的纵轴画反了，数值越大位置越低 | marks | 抓到 | layout、crowding |
| chart-without-values | 自定义图表没有标出每个点代表的数值 | marks | 抓到 |  |
| chart-uses-random | 自定义场景里用了随机数，每次重画都不一样 | determinism | 抓到 | crowding |
| chart-points-invisible | 折线图上的点半径写成零，画不出来 | marks | 抓到 |  |
| ranges-scale-not-a-range | 区间图的 scale 写成了 "log"，四根条形画不出来 | 拒绝运行并报错 | 抓到 |  |
| chart-lags-narration | 折线图画得太晚，旁白念完数字画面才出现 | sync | 抓到 |  |
| chart-label-on-line | 折线图的数值标签压在折线和圆点上 | crowding | 抓到 |  |
| chart-label-touches-tick | 数值标签紧贴纵轴刻度，150 和 42 读起来像 15042 | crowding | 抓到 |  |
| chart-label-covered | 最高点的数值标签被后画的图形整个盖住，画面上看不见 | crowding | 抓到 |  |
| chart-box-over-tick | 图表里一块底框盖住了半个纵轴刻度 | crowding | 抓到 |  |
| chart-tick-half-hidden | 一块和背景同色的底板盖住了刻度的后两位，150 读起来像 1 | crowding | 抓到 |  |
| voice-says-something-else | 字幕是一句话，语音念的是另一句话 | asr | 抓到 |  |
| voice-says-wrong-number | 字幕写 483，语音念成 438 | data-accuracy、asr | 抓到 |  |
| voice-says-wrong-number-english | 英文版字幕写 233，语音念成 323 | data-accuracy、asr | 抓到 |  |
| voice-says-wrong-number-before-unit | 字幕写 52 期，语音念成 57 期 | data-accuracy、asr | 抓到 |  |
| voice-says-wrong-number-after-letters | 字幕写“API，2 到 45 美元”，语音念成 3 到 45 | data-accuracy、asr | 抓到 |  |
| voice-says-wrong-unit | 字幕写 4.5 倍，语音念成 4.5 度：数字对了，量级的字错了 | asr | 抓到 |  |
| machine-without-cjk-font | 渲染的机器上没有中文字体，中文全部显示成方框 | fonts | 抓到 |  |
| mix-too-loud | 混音出错，旁白整体响了 6 分贝，峰值过载 | audio-levels | 抓到 |  |
| mix-too-quiet | 混音出错，旁白整体轻了 6 分贝 | audio-levels | 抓到 |  |
| invented-benchmark | 简报要的行业平均数据里没有，旁白编了一个：2,000 次 | data-accuracy | 抓到 |  |
| two-lines-without-names | 两条线只靠颜色区分，图上没有写哪条是哪种 | spec | 抓到 |  |
| two-lines-labels-collide | 两条线交叉处，两个数值标签叠在一起 | layout | 抓到 |  |
| gap-drawn-as-zero | 缺数据的月份被画成了 0，折线一头扎到底 | marks | 抓到 | spec |
| gap-without-note | 折线在缺口处断开了，但没有写为什么断 | spec | 抓到 |  |
| music-over-voice | 配乐的音量调错了，高了 12 分贝，盖过旁白 | music | 抓到 |  |
| music-too-quiet | 配乐的音量调得太低，低了 10 分贝，片子里有配乐但听不到 | music | 抓到 |  |
| sfx-late | 混音时音效整体晚了 0.2 秒，柱子长出来之后才响 | av-sync | 抓到 |  |
| sfx-cue-early | 折线图的提示点算早了 0.25 秒，点还没出现声音就响了 | av-sync | 抓到 |  |
| sfx-on-still-element | 提示点挂在了不动的图表标题上，声音响的时候画面上什么也没发生 | av-sync | 抓到 |  |

## 各项检查的覆盖

| 检查 | 缺陷样例 | 抓到 | 备注 |
| --- | --- | --- | --- |
| spec | 5 | 5 |  |
| data-accuracy | 17 | 17 |  |
| citation | 1 | 1 |  |
| readability | 1 | 1 |  |
| layout | 3 | 3 |  |
| crowding | 5 | 5 |  |
| contrast | 1 | 1 |  |
| subtitles | 1 | 1 |  |
| sync | 1 | 1 |  |
| typography | 3 | 3 |  |
| empty-frames | 1 | 1 |  |
| marks | 5 | 5 |  |
| determinism | 1 | 1 |  |
| fonts | 1 | 1 |  |
| av-sync | 3 | 3 | 12 个干净用例里有 11 个用不上这项检查 |
| video-stillness | 2 | 2 |  |
| audio-levels | 2 | 2 |  |
| audio-gaps | 1 | 1 |  |
| music | 2 | 2 | 12 个干净用例里有 10 个用不上这项检查 |
| asr | 6 | 6 |  |
