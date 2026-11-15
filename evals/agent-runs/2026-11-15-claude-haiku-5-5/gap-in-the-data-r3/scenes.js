// scenes.js：增加一个折线图场景。缺失的月份断开折线，并在缺口处标出备注。
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const left = 110;
    const right = 1560;
    const top = 40;
    const bottom = 440;
    const pts = scene.series; // [{label, value, note}]，缺失的月份 value 为 null

    const vals = pts.map((p) => p.value).filter((v) => v != null);
    const lo = Math.floor((Math.min(...vals) * 0.7) / 50) * 50;
    const hi = Math.ceil((Math.max(...vals) * 1.05) / 50) * 50;
    const n = pts.length;
    const X = (i) => left + (i * (right - left)) / (n - 1);
    const Y = (v) => top + ((hi - v) / (hi - lo)) * (bottom - top);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // 网格线只画线，不写数字
    for (let g = Math.ceil(lo / 100) * 100; g < hi; g += 100) {
      svg('line', { x1: left, x2: right, y1: Y(g), y2: Y(g), style: 'stroke: var(--track); stroke-width: 2' }, chart);
    }
    svg('line', { x1: left, x2: right, y1: Y(lo), y2: Y(lo), style: 'stroke: var(--muted); stroke-width: 2' }, chart);

    // 月份标签
    pts.forEach((p, i) => {
      const lab = svg('text', { x: X(i), y: bottom + 56, 'text-anchor': 'middle', 'data-df-role': 'tick', style: 'fill: var(--muted); font-size: 24px' }, chart);
      lab.textContent = p.label;
    });

    // 折线：按连续段分开画，缺失处断开
    const runs = [];
    let cur = null;
    pts.forEach((p, i) => {
      if (p.value == null) {
        cur = null;
        return;
      }
      if (!cur) {
        cur = [];
        runs.push(cur);
      }
      cur.push([X(i), Y(p.value)]);
    });
    const paths = runs.map((run) => {
      const d = run.map((q, k) => `${k ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ');
      return svg('path', {
        d,
        fill: 'none',
        stroke: 'var(--accent)',
        'stroke-width': 6,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        pathLength: 1,
        'stroke-dasharray': '1 1',
        'stroke-dashoffset': 1,
      }, chart);
    });

    // 数据点与数值：标签放在点的左上方
    pts.forEach((p, i) => {
      if (p.value == null) return;
      svg('circle', { cx: X(i), cy: Y(p.value), r: 9, 'data-df-value': p.value, style: 'fill: var(--accent)' }, chart);
      const lab = svg('text', { x: X(i) - 16, y: Y(p.value) - 18, 'text-anchor': 'end', style: 'fill: var(--text); font-size: 28px' }, chart);
      lab.textContent = fmt(p.value);
    });

    // 缺口处写备注
    const gap = pts.findIndex((p) => p.value == null);
    if (gap >= 0 && pts[gap].note) {
      const note = svg('text', { x: X(gap), y: 340, 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 28px' }, chart);
      note.textContent = pts[gap].note;
    }

    return (t) => {
      const p = ease(clamp(t / 4));
      paths.forEach((el) => el.setAttribute('stroke-dashoffset', String(1 - p)));
    };
  },
};
