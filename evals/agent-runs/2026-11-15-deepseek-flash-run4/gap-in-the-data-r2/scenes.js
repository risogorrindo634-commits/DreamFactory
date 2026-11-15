// A line chart whose line breaks where a month has no value.
// Nothing here depends on a clock, a random number or the previous frame: the picture is a function of t.
export default {
  line(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 620;
    const L = 120;
    const R = 1590;
    const T = 70;
    const B = 520;
    const Y_MAX = 800;
    const slot = (R - L) / 12;
    const cx = (m) => L + (m - 0.5) * slot;
    const cy = (v) => B - (v / Y_MAX) * (B - T);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'display:block' }, root);

    const items = (scene.series || []).map((it, i) => ({ ...it, month: i + 1 }));
    const points = items.filter((it) => typeof it.value === 'number');
    const missing = items.filter((it) => typeof it.value !== 'number');

    // Horizontal grid, an axis with tick labels, and the month names along the bottom.
    const grid = svg('g', { style: 'opacity:0' }, chart);
    for (const v of [0, 200, 400, 600]) {
      svg('line', { x1: L, y1: cy(v), x2: R, y2: cy(v), style: 'stroke:var(--track);stroke-width:1.5' }, grid);
    }
    const axis = svg('g', { style: 'opacity:0' }, chart);
    for (const v of [0, 200, 400, 600, 800]) {
      const t = svg('text', {
        x: L - 24,
        y: cy(v) + 8,
        'text-anchor': 'end',
        'data-df-role': 'tick',
        style: 'fill:var(--muted);font-size:24px',
      }, axis);
      t.textContent = fmt(v);
    }
    for (const it of items) {
      const t = svg('text', {
        x: cx(it.month),
        y: B + 44,
        'text-anchor': 'middle',
        'data-df-role': 'tick',
        style: 'fill:var(--muted);font-size:24px',
      }, axis);
      t.textContent = it.label;
    }

    // Split the points into unbroken runs: a month with no value starts a new run, so no line
    // ever crosses the gap.
    const runs = [];
    let run = [];
    for (const p of points) {
      if (run.length && p.month !== run[run.length - 1].month + 1) {
        runs.push(run);
        run = [];
      }
      run.push(p);
    }
    if (run.length) runs.push(run);

    const polylines = runs.map((r) => svg('polyline', {
      points: r.map((p) => `${cx(p.month)},${cy(p.value)}`).join(' '),
      style: 'fill:none;stroke:var(--accent);stroke-width:4;stroke-linejoin:round;stroke-linecap:round;opacity:0',
    }, chart));

    // One dot per month that has a value; each carries the number it stands for.
    const dots = points.map((p) => svg('circle', {
      cx: cx(p.month),
      cy: cy(p.value),
      r: 7,
      'data-df-value': String(p.value),
      style: 'fill:var(--accent);opacity:0',
    }, chart));

    // Every point is labelled above and to its left, clear of the rising line.
    const labels = points.map((p) => {
      const t = svg('text', {
        x: cx(p.month) - 12,
        y: cy(p.value) - 18,
        'text-anchor': 'end',
        style: 'fill:var(--text);font-size:30px;font-weight:700;opacity:0',
      }, chart);
      t.textContent = fmt(p.value);
      return t;
    });

    // The hole: a dashed marker standing on that month, and the row's own note beside it.
    let gap = null;
    if (missing.length) {
      gap = svg('g', { style: 'opacity:0' }, chart);
      const gx = cx(missing[0].month);
      svg('line', {
        x1: gx,
        y1: B,
        x2: gx,
        y2: B - 190,
        style: 'stroke:var(--muted);stroke-width:2;stroke-dasharray:8 10',
      }, gap);
      const note = svg('text', {
        x: gx,
        y: B - 210,
        'text-anchor': 'middle',
        style: 'fill:var(--text);font-size:30px;font-weight:700',
      }, gap);
      note.textContent = missing[0].note ?? '数据缺失';
    }

    return (t) => {
      grid.style.opacity = String(ease((t - 0.05) / 0.45));
      axis.style.opacity = String(ease((t - 0.1) / 0.45));
      polylines.forEach((el, i) => {
        el.style.opacity = String(ease((t - 0.45 - i * 0.15) / 0.5));
      });
      dots.forEach((el, i) => {
        el.style.opacity = String(ease((t - 0.7 - i * 0.04) / 0.5));
      });
      labels.forEach((el, i) => {
        el.style.opacity = String(ease((t - 0.9 - i * 0.05) / 0.45));
      });
      if (gap) gap.style.opacity = String(ease((t - 1.3) / 0.5));
    };
  },
};
