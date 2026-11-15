// 折线图：内置场景里没有折线图，简报要求必须用折线图。
export default {
  line(scene, root, kit) {
    const { svg, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    const pts = scene.series;
    const n = pts.length;
    const max = 700;
    const x0 = 120;
    const x1 = 1560;
    const yTop = 40;
    const yBot = 500;
    const X = i => x0 + ((x1 - x0) * i) / (n - 1);
    const Y = v => yBot - ((yBot - yTop) * v) / max;

    // 刻度（标为 tick，不当作事实核对）
    [0, 200, 400, 600].forEach(v => {
      svg('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v), style: 'stroke: var(--track); stroke-width: 2' }, chart);
      const tk = svg('text', {
        x: x0 - 16,
        y: Y(v) + 8,
        'text-anchor': 'end',
        'data-df-role': 'tick',
        style: 'fill: var(--muted); font-size: 22px',
      }, chart);
      tk.textContent = fmt(v);
    });

    // 月份标签
    pts.forEach((p, i) => {
      const mt = svg('text', {
        x: X(i),
        y: yBot + 44,
        'text-anchor': 'middle',
        style: 'fill: var(--muted); font-size: 28px',
      }, chart);
      mt.textContent = p.label;
    });

    // 折线
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.value)}`).join(' ');
    const path = svg('path', {
      d,
      fill: 'none',
      style: 'stroke: var(--accent); stroke-width: 6; stroke-linejoin: round; stroke-linecap: round',
    }, chart);
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;

    // 数据点
    const dots = pts.map((p, i) => svg('circle', {
      cx: X(i),
      cy: Y(p.value),
      r: 9,
      'data-df-value': p.value,
      'data-df-group': 'monthly',
      style: 'fill: var(--accent); opacity: 0',
    }, chart));

    // 最高月份的数值标签，放在点的左上方
    let pk = 0;
    pts.forEach((p, i) => { if (p.value > pts[pk].value) pk = i; });
    const peak = pts[pk];
    const label = svg('text', {
      x: X(pk) - 22,
      y: Y(peak.value) - 22,
      'text-anchor': 'end',
      style: 'fill: var(--text); font-size: 40px; font-weight: 700; opacity: 0',
    }, chart);
    label.textContent = `${fmt(peak.value)} 件`;

    return (t, lines) => {
      const drawEnd = Math.max(lines[0] ? lines[0].end : 1, 0.5);
      const p = clamp(t / drawEnd);
      path.style.strokeDashoffset = `${len * (1 - p)}`;
      const q = p * (n - 1);
      dots.forEach((dot, i) => {
        dot.style.opacity = `${clamp(q - i + 0.5)}`;
      });
      const s = lines[1] ? lines[1].start : drawEnd;
      label.style.opacity = `${clamp((t - s) / 0.4)}`;
    };
  },
};
