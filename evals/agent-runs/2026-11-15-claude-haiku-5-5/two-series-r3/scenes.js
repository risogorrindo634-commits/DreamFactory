// 折线图场景：两条线画在同一张图上，标出两条线的名字，以及 8 月和 12 月的数值。
export default {
  line(scene, root, kit) {
    const { h, svg, ease, clamp, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const X0 = 150;
    const X1 = 1480;
    const Y0 = 500; // 数值 0 所在的 y
    const K = 1.76; // 每件的像素数，250 件对应 440 像素
    const xs = (i) => X0 + ((X1 - X0) * i) / 11;
    const ys = (v) => Y0 - K * v;

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);
    const text = (x, y, s, anchor, size, fill, parent = chart) => {
      const el = svg('text', { x, y, 'text-anchor': anchor, style: `font-size:${size}px; fill:${fill}` }, parent);
      el.textContent = s;
      return el;
    };

    // 坐标轴：数值刻度与月份刻度都不是事实，标为刻度
    svg('line', { x1: X0, y1: Y0, x2: X1, y2: Y0, style: 'stroke: var(--track); stroke-width: 2' }, chart);
    for (const v of [0, 50, 100, 150, 200, 250]) {
      const el = text(128, ys(v) + 8, String(v), 'end', 22, 'var(--muted)');
      el.dataset.dfRole = 'tick';
    }
    scene.code.forEach((d, i) => {
      const el = text(xs(i), 530, `${i + 1}月`, 'middle', 22, 'var(--muted)');
      el.dataset.dfRole = 'tick';
    });

    // 两条线
    const codeLine = svg(
      'polyline',
      {
        points: scene.code.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' '),
        pathLength: 1,
        fill: 'none',
        'stroke-dasharray': 1,
        'stroke-dashoffset': 1,
        style: 'stroke: var(--accent); stroke-width: 8; stroke-linejoin: round; stroke-linecap: round',
      },
      chart,
    );
    const modelLine = svg(
      'polyline',
      {
        points: scene.model.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' '),
        pathLength: 1,
        fill: 'none',
        'stroke-dasharray': 1,
        'stroke-dashoffset': 1,
        style: 'stroke: var(--muted); stroke-width: 8; stroke-linejoin: round; stroke-linecap: round',
      },
      chart,
    );

    // 数据点：数值大的点位置更靠上，同一组内单调
    const dots = [];
    const addDots = (rows, group, color) =>
      rows.forEach((d, i) => {
        const el = svg(
          'circle',
          { cx: xs(i), cy: ys(d.value), r: 7, 'data-df-group': group, 'data-df-value': d.value, style: `fill: ${color}` },
          chart,
        );
        dots.push({ el, i });
      });
    addDots(scene.code, 'code', 'var(--accent)');
    addDots(scene.model, 'model', 'var(--muted)');

    // 线的名字
    text(1496, 92, scene.codeName, 'start', 28, 'var(--accent)');
    text(1496, 306, scene.modelName, 'start', 28, 'var(--text)');

    // 8 月与 12 月的数值标注
    const idx8 = scene.code.findIndex((d) => d.label === '8月');
    const idx12 = scene.code.findIndex((d) => d.label === '12月');
    const code8 = text(xs(idx8) - 16, ys(scene.code[idx8].value) - 30, String(scene.code[idx8].value), 'end', 28, 'var(--accent)');
    const model8 = text(xs(idx8) + 16, ys(scene.model[idx8].value) + 34, String(scene.model[idx8].value), 'start', 28, 'var(--text)');
    const code12 = text(xs(idx12) - 14, ys(scene.code[idx12].value) - 22, String(scene.code[idx12].value), 'end', 28, 'var(--accent)');
    const model12 = text(xs(idx12) - 12, ys(scene.model[idx12].value) + 36, String(scene.model[idx12].value), 'end', 28, 'var(--text)');
    const labels8 = [code8, model8];
    const labels12 = [code12, model12];

    // 时间只决定画面：线逐步画出，点随之出现，数值在它所在那句旁白开始前出现
    return (t, lines) => {
      const draw = ease(t / 2.2);
      codeLine.style.strokeDashoffset = String(1 - draw);
      modelLine.style.strokeDashoffset = String(1 - draw);
      for (const { el, i } of dots) el.style.opacity = String(clamp(draw * 11 - i));

      const at8 = lines.length > 1 ? lines[1].start - 0.3 : 2;
      const at12 = lines.length > 3 ? lines[3].start - 0.3 : 6;
      const a8 = ease((t - at8) / 0.4);
      const a12 = ease((t - at12) / 0.4);
      for (const el of labels8) el.style.opacity = String(a8);
      for (const el of labels12) el.style.opacity = String(a12);
    };
  },
};
