// A line chart for the monthly series. Everything on screen is a function of t alone.
export default {
  line(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const box = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);
    box.style.display = 'block';

    const items = scene.series || [];
    const n = items.length;
    const left = 230;
    const right = 1590;
    const top = 40;
    const bottom = 470;
    const gridStep = 100;
    const maxValue = Math.max(...items.map((it) => it.value));
    const yMax = Math.ceil(maxValue / gridStep) * gridStep;
    const xAt = (i) => (n <= 1 ? left : left + (i * (right - left)) / (n - 1));
    const yAt = (v) => bottom - (v / yMax) * (bottom - top);

    // Grid, y ticks and month labels.
    const axis = svg('g', {}, box);
    for (let v = 0; v <= yMax + 1e-9; v += gridStep) {
      const yy = yAt(v);
      svg('line', { x1: left, x2: right, y1: yy, y2: yy, stroke: 'var(--track)', 'stroke-width': v === 0 ? 2 : 1 }, axis);
      const tick = svg('text', {
        x: left - 80,
        y: yy,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        style: 'fill: var(--muted); font-size: 24px',
      }, axis);
      tick.textContent = fmt(v);
      tick.dataset.dfRole = 'tick';
    }

    const months = svg('g', {}, box);
    items.forEach((it, i) => {
      const label = svg('text', {
        x: xAt(i),
        y: bottom + 50,
        'text-anchor': 'middle',
        style: 'fill: var(--muted); font-size: 24px',
      }, months);
      label.textContent = it.label;
      label.dataset.dfRole = 'tick';
    });

    // The line.
    const points = items.map((it, i) => ({ x: xAt(i), y: yAt(it.value), label: it.label, value: it.value }));
    const d = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const path = svg('path', {
      d,
      fill: 'none',
      stroke: 'var(--accent)',
      'stroke-width': 4,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'stroke-dasharray': `${length} ${length}`,
      'stroke-dashoffset': String(length),
    }, box);

    // Points; each one declares the value it stands for.
    const dots = points.map((p) => {
      const dot = svg('circle', { cx: p.x, cy: p.y, r: 7, style: 'fill: var(--accent)' }, box);
      dot.dataset.dfValue = String(p.value);
      dot.dataset.dfGroup = 'month';
      dot.style.opacity = '0';
      return dot;
    });

    // Value labels for the months the narration calls out, above the point, at the flat side.
    const labeled = (scene.labels || [])
      .map((label) => {
        const i = items.findIndex((it) => it.label === label);
        return i >= 0 ? { i, ...points[i] } : null;
      })
      .filter(Boolean);
    const labels = labeled.map((p, k) => {
      const text = fmt(p.value);
      const fs = 30;
      const w = text.length * 18 + 24;
      const next = points[p.i + 1];
      const dx = next && p.y - next.y > 60 ? -30 : 0;
      const cx = p.x + dx;
      const baseline = p.y - 34;
      const g = svg('g', {}, box);
      svg('rect', {
        x: cx - w / 2,
        y: baseline - 46,
        width: w,
        height: 56,
        rx: 8,
        style: 'fill: var(--bg)',
      }, g);
      const t = svg('text', {
        x: cx,
        y: baseline,
        'text-anchor': 'middle',
        style: `fill: var(--text); font-size: ${fs}px; font-weight: 700`,
      }, g);
      t.textContent = text;
      g.style.opacity = '0';
      return { g, at: 1 + k * 0.18 };
    });

    return (t) => {
      const draw = ease((t - 0.5) / 1.6);
      path.setAttribute('stroke-dashoffset', String(length * (1 - draw)));
      dots.forEach((dot, i) => {
        dot.style.opacity = String(ease((t - (0.45 + i * 0.055)) / 0.25));
      });
      labels.forEach((l) => {
        l.g.style.opacity = String(ease((t - l.at) / 0.35));
      });
      axis.style.opacity = String(ease((t - 0.15) / 0.4));
      months.style.opacity = String(ease((t - 0.25) / 0.4));
    };
  },
};
