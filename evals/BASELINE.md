# 评测基线

干净用例误报 0/7，缺陷检出 41/41。

运行环境：Node v22.23.4 · 语音后端 deepseek · 草稿画质 · 2026-11-15

## 干净用例

参考影片不应触发任何检查。这里的失败就是误报。

| 用例 | 结果 | 片长（秒） | 误报的检查 |
| --- | --- | --- | --- |
| asks-for-derived-number | 通过 | 26.6 |  |
| cost-per-minute | 通过 | 45.6 |  |
| monthly-trend | 通过 | 26.0 |  |
| top-of-long-list | 通过 | 22.0 |  |
| twenty-seconds | 通过 | 13.6 |  |
| works-by-category | 通过 | 52.8 |  |
| works-by-category-en | 通过 | 53.3 |  |

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
| headline-overflow | 标题太长，撑出画面 | layout | 抓到 | readability |
| low-contrast | 次要文字颜色太接近背景 | contrast | 抓到 |  |
| long-subtitle | 一句旁白太长，字幕挤成两行 | subtitles | 抓到 | data-accuracy |
| empty-scene | 一个场景里什么内容都没有 | empty-frames | 抓到 |  |
| duration-out-of-range | 片长不符合任务要求 | spec | 抓到 |  |
| dead-air | 结尾画面静止且无声地停了十秒 | video-stillness、audio-gaps | 抓到 |  |
| year-with-separator | 年份当成普通数字，显示成 2,026 年 | typography | 抓到 |  |
| share-of-subset | 只展示前 6 名却显示占比，占比是按这 6 个算的 | data-accuracy | 抓到 |  |
| derived-multiple-in-chinese | 数据里没有的倍数，自己算出来写成汉字：四点五倍 | data-accuracy | 抓到 |  |
| derived-share-in-chinese | 数据里没有的降幅，写在画面上：成本降了九成 | data-accuracy | 抓到 |  |
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
| voice-says-something-else | 字幕是一句话，语音念的是另一句话 | asr | 抓到 |  |
| voice-says-wrong-number | 字幕写 483，语音念成 438 | data-accuracy、asr | 抓到 |  |
| voice-says-wrong-number-english | 英文版字幕写 233，语音念成 323 | data-accuracy、asr | 抓到 |  |
| machine-without-cjk-font | 渲染的机器上没有中文字体，中文全部显示成方框 | fonts | 抓到 |  |
| mix-too-loud | 混音出错，旁白整体响了 6 分贝，峰值过载 | audio-levels | 抓到 |  |
| mix-too-quiet | 混音出错，旁白整体轻了 6 分贝 | audio-levels | 抓到 |  |

## 各项检查的覆盖

| 检查 | 缺陷样例 | 抓到 | 备注 |
| --- | --- | --- | --- |
| spec | 3 | 3 |  |
| data-accuracy | 12 | 12 |  |
| citation | 1 | 1 |  |
| readability | 1 | 1 |  |
| layout | 2 | 2 |  |
| crowding | 4 | 4 |  |
| contrast | 1 | 1 |  |
| subtitles | 1 | 1 |  |
| sync | 1 | 1 |  |
| typography | 3 | 3 |  |
| empty-frames | 1 | 1 |  |
| marks | 4 | 4 |  |
| determinism | 1 | 1 |  |
| fonts | 1 | 1 |  |
| video-stillness | 1 | 1 |  |
| audio-levels | 2 | 2 |  |
| audio-gaps | 1 | 1 |  |
| asr | 3 | 3 |  |
