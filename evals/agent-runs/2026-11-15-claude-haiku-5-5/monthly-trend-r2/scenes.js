// 折线图场景：12 个月的走势，按旁白逐句画出，四个指定月份的数量标在图上。
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const rows = scene.series;
    const n = rows.length;
    const W = 1640;
    const H = 520;
    const padL = 130;
    const padR = 60;
    const padT = 70;
    const padB = 90;
    const top = H - padB;
    const plotH = H - padT - padB;
    const plotW = W - padL - padR;
    const scaleMax = Math.ceil(Math.max(...rows.map((r) => r.value)) / 200) * 200;
    const xOf = (i) => padL + (i * plotW) / (n - 1);
    const yOf = (v) => top - (v / scaleMax) * plotH;

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // 刻度和网格（刻度不是数据，标成 tick）
    for (let v = 0; v <= scaleMax; v += 200) {
      const y = yOf(v);
      if (v > 0) svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, style: 'stroke: var(--track); stroke-width: 2' }, chart);
      const tk = svg('text', { x: padL - 16, y: y + 8, 'text-anchor': 'end', 'data-df-role': 'tick', style: 'fill: var(--muted); font-size: 22px' }, chart);
      tk.textContent = String(v);
    }
    svg('line', { x1: padL, x2: W - padR, y1: top, y2: top, style: 'stroke: var(--muted); stroke-width: 2' }, chart);

    // 月份标签
    rows.forEach((r, i) => {
      const m = svg('text', { x: xOf(i), y: top + 46, 'text-anchor': 'middle', 'data-df-role': 'tick', style: 'fill: var(--muted); font-size: 22px' }, chart);
      m.textContent = r.label;
    });

    // 折线：按 t 逐步画出
    const d = rows.map((r, i) => `${i ? 'L' : 'M'} ${xOf(i)} ${yOf(r.value)}`).join(' ');
    const path = svg('path', {
      d,
      pathLength: 1,
      fill: 'none',
      style: 'stroke: var(--accent); stroke-width: 7; stroke-linejoin: round; stroke-dasharray: 1 1; stroke-dashoffset: 1',
    }, chart);

    // 每个月一个点，标上数值
    const dots = rows.map((r, i) => svg('circle', {
      cx: xOf(i),
      cy: yOf(r.value),
      r: 9,
      'data-df-value': r.value,
      style: 'fill: var(--accent); opacity: 0',
    }, chart));

    // 四个指定月份的数值标签：点的左上方（上升陡的地方）或右上方
    const callouts = [
      { label: '1月', sentence: 1, dx: 14, dy: -22, anchor: 'start' },
      { label: '9月', sentence: 2, dx: -14, dy: -18, anchor: 'end' },
      { label: '10月', sentence: 3, dx: -14, dy: -18, anchor: 'end' },
      { label: '11月', sentence: 4, dx: -14, dy: -18, anchor: 'end' },
    ].map((c) => {
      const i = rows.findIndex((r) => r.label === c.label);
      const row = rows[i];
      const el = svg('text', {
        x: xOf(i) + c.dx,
        y: yOf(row.value) + c.dy,
        'text-anchor': c.anchor,
        style: 'fill: var(--text); font-size: 30px; font-weight: 600; opacity: 0',
      }, chart);
      el.textContent = `${row.label} ${fmt(row.value)}件`;
      return { ...c, i, el };
    });

    return (t, lines) => {
      const start = lines[0].start;
      const end = lines[Math.min(4, lines.length - 1)].end;
      const p = ease(clamp((t - start) / Math.max(0.01, end - start)));
      path.style.strokeDashoffset = String(1 - p);
      const q = p * (n - 1);
      dots.forEach((dot, i) => {
        dot.style.opacity = String(clamp(q - i + 1));
      });
      callouts.forEach((c) => {
        const at = lines[Math.min(c.sentence, lines.length - 1)].start;
        c.el.style.opacity = String(clamp((t - at + 0.3) / 0.4));
      });
    };
  },
};
