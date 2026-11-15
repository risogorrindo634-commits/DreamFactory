// scenes.js：为本片增加一个折线图场景（逐月走势）。
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, rise, fmt, chartHead } = kit;
    chartHead(scene, root);

    const pts = scene.series; // [{ label, value }]
    const W = 1640, H = 560;
    const L = 130, R = 60, T = 60, B = 70;
    const plotW = W - L - R, plotH = H - T - B;
    const yMax = 700;
    const x = (i) => L + (plotW * i) / (pts.length - 1);
    const y = (v) => T + plotH * (1 - v / yMax);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // 刻度线与刻度值（数值只作坐标，标为 tick）
    [0, 200, 400, 600].forEach((v) => {
      svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), style: 'stroke:var(--track);stroke-width:2' }, chart);
      const t = svg('text', { x: L - 16, y: y(v) + 8, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:22px' }, chart);
      t.setAttribute('data-df-role', 'tick');
      t.textContent = String(v);
    });

    // 月份标签（坐标，标为 tick）
    pts.forEach((p, i) => {
      const t = svg('text', { x: x(i), y: H - 20, 'text-anchor': 'middle', style: 'fill:var(--muted);font-size:22px' }, chart);
      t.setAttribute('data-df-role', 'tick');
      t.textContent = p.label;
    });

    // 折线
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
    const path = svg('path', { d, fill: 'none', style: 'stroke:var(--accent);stroke-width:6;stroke-linejoin:round' }, chart);
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;

    // 数据点，每个点标数值
    const dots = pts.map((p, i) => {
      const c = svg('circle', { cx: x(i), cy: y(p.value), r: 9, style: 'fill:var(--accent)' }, chart);
      c.setAttribute('data-df-value', String(p.value));
      c.setAttribute('data-df-group', 'monthly');
      return c;
    });

    // 全年最高点的数值标签：放在点的左上方，避开折线
    let maxIdx = 0;
    pts.forEach((p, i) => { if (p.value > pts[maxIdx].value) maxIdx = i; });
    const maxPt = pts[maxIdx];
    const lbl = svg('text', {
      x: x(maxIdx) - 24, y: y(maxPt.value) - 18, 'text-anchor': 'end',
      style: 'fill:var(--text);font-size:32px;font-weight:600',
    }, chart);
    lbl.textContent = `${fmt(maxPt.value)} 件`;

    return (t, lines) => {
      const draw = ease(clamp(t / 4));
      path.style.strokeDashoffset = `${len * (1 - draw)}`;
      dots.forEach((c, i) => {
        c.style.opacity = `${clamp((t - i * 0.25) / 0.3)}`;
      });
      const start = lines[1] ? lines[1].start : 0;
      rise(lbl, clamp((t - start) / 0.6));
    };
  },
};
