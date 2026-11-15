// 折线图场景：12 个月的走势，四个指定月份的数值标在图上。
export default {
  line(scene, root, kit) {
    const { svg, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const M = { l: 110, r: 60, t: 40, b: 70 };
    const pw = W - M.l - M.r;
    const ph = H - M.t - M.b;
    const YMAX = 600;
    const data = scene.series;
    const n = data.length;
    const xOf = (i) => M.l + (pw * i) / (n - 1);
    const yOf = (v) => M.t + ph * (1 - v / YMAX);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // 横轴基线（不画网格线，避免穿过数值标签）
    svg('line', {
      x1: M.l, x2: W - M.r, y1: M.t + ph, y2: M.t + ph,
      style: 'stroke: var(--track); stroke-width: 2',
    }, chart);

    // 纵轴刻度（数字是刻度，不是数据事实）
    for (let v = 0; v <= YMAX; v += 100) {
      const tk = svg('text', {
        x: M.l - 14, y: yOf(v) + 8, 'text-anchor': 'end',
        'data-df-role': 'tick',
        style: 'font-size: 22px; fill: var(--muted)',
      }, chart);
      tk.textContent = String(v);
    }

    // 横轴月份标签
    data.forEach((d, i) => {
      const tk = svg('text', {
        x: xOf(i), y: M.t + ph + 34, 'text-anchor': 'middle',
        'data-df-role': 'tick',
        style: 'font-size: 24px; fill: var(--muted)',
      }, chart);
      tk.textContent = d.label;
    });

    // 折线
    const d = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ');
    const path = svg('path', {
      d, fill: 'none',
      style: 'stroke: var(--accent); stroke-width: 6; stroke-linejoin: round; stroke-linecap: round',
    }, chart);

    // 每个月一个点，数值大的点位置更高
    const dots = data.map((p, i) => {
      const isMax = p.value === Math.max(...data.map((q) => q.value));
      return svg('circle', {
        cx: xOf(i), cy: yOf(p.value), r: isMax ? 11 : 7,
        'data-df-value': p.value,
        style: 'fill: var(--accent)',
      }, chart);
    });

    // 指定月份的数值标签；标签在对应旁白开始前半秒出现
    const marks = (scene.marks || []).map((m) => {
      const i = data.findIndex((q) => q.label === m.label);
      const p = data[i];
      const x = xOf(i);
      const y = yOf(p.value);
      const leftStart = i === 0;
      const el = svg('text', {
        x: leftStart ? x + 14 : x - 14,
        y: leftStart ? y - 26 : y - 22,
        'text-anchor': leftStart ? 'start' : 'end',
        style: 'font-size: 28px; fill: var(--text); font-weight: 600',
      }, chart);
      el.textContent = `${p.label} ${fmt(p.value)} 件`;
      el.style.opacity = '0';
      return { el, at: m.at };
    });

    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len} ${len}`;

    return (t, lines) => {
      const end = lines.length ? lines[lines.length - 1].end : 1;
      const p = clamp(t / Math.max(end, 0.01));
      path.style.strokeDashoffset = String(len * (1 - p));
      dots.forEach((c, i) => {
        c.style.opacity = p * (n - 1) >= i - 0.001 ? '1' : '0';
      });
      marks.forEach(({ el, at }) => {
        const start = lines[at] ? lines[at].start : 0;
        el.style.opacity = t >= Math.max(0, start - 0.5) ? '1' : '0';
      });
    };
  },
};
