// A line chart for one monthly series. The built-in scenes rank and compare; only a line shows
// the shape of a trend over time. Everything drawn here is a pure function of the scene time.
export default {
  line(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 600;
    const X0 = 110; // left edge of the plot, after the value scale
    const X1 = 1600; // right edge
    const Y0 = 60; // top of the plot
    const Y1 = 520; // baseline
    const VMAX = 600; // counts start at zero: an honest line chart has a zero baseline

    const items = scene.series || [];
    const n = Math.max(1, items.length);
    const px = (i) => X0 + (i * (X1 - X0)) / Math.max(1, n - 1);
    const py = (v) => Y0 + ((VMAX - v) / VMAX) * (Y1 - Y0);

    const box = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'display:block;margin-top:18px' }, root);

    // Value scale on the left, in steps of 100.
    for (let v = 0; v <= VMAX; v += 100) {
      const t = svg('text', {
        x: X0 - 18,
        y: py(v) + 8,
        'text-anchor': 'end',
        style: 'fill:var(--muted);font-size:22px',
        'data-df-role': 'tick',
      }, box);
      t.textContent = fmt(v);
      svg('line', { x1: X0 - 8, y1: py(v), x2: X0, y2: py(v), style: 'stroke:var(--track);stroke-width:2' }, box);
    }
    svg('line', { x1: X0, y1: Y1, x2: X1, y2: Y1, style: 'stroke:var(--track);stroke-width:2' }, box);

    // Months along the baseline.
    items.forEach((it, i) => {
      const t = svg('text', {
        x: px(i),
        y: Y1 + 44,
        'text-anchor': 'middle',
        style: 'fill:var(--muted);font-size:22px',
        'data-df-role': 'tick',
      }, box);
      t.textContent = it.label;
    });

    // The line is drawn left to right by widening a clip, so the reveal is a function of time only.
    const defs = svg('defs', {}, box);
    const clip = svg('clipPath', { id: 'df-line-clip' }, defs);
    const reveal = svg('rect', { x: 0, y: 0, width: 0, height: H }, clip);
    const d = items.map((it, i) => `${i ? 'L' : 'M'} ${px(i).toFixed(1)} ${py(it.value).toFixed(1)}`).join(' ');
    svg('path', {
      d,
      'clip-path': 'url(#df-line-clip)',
      style: 'fill:none;stroke:var(--accent);stroke-width:4;stroke-linejoin:round;stroke-linecap:round',
    }, box);

    // Points get a number for the checks and the viewer: one shape per month.
    const dots = items.map((it, i) => svg('circle', {
      cx: px(i),
      cy: py(it.value),
      r: 7,
      'data-df-value': String(it.value),
      'data-df-group': 'monthly',
      style: 'fill:var(--text)',
    }, box));

    // Which months carry a printed value: the ones the film names, plus the peak.
    const marked = new Set();
    for (const label of scene.annotate || []) {
      const i = items.findIndex((it) => it.label === label);
      if (i >= 0) marked.add(i);
    }
    let peak = 0;
    items.forEach((it, i) => {
      if (it.value > items[peak].value) peak = i;
    });
    marked.add(peak);

    // Highlighted months get the accent colour, peak included.
    [...marked].forEach((i) => {
      dots[i].style.fill = 'var(--accent)';
    });

    // Labels sit above the points, clear of the line: the first to the right of the scale,
    // the later ones up and to the left, where the line climbs steeply.
    const labels = [...marked].sort((a, b) => a - b).map((i, k) => {
      const first = i === 0;
      const el = svg('text', {
        x: px(i) + (first ? 16 : -14),
        y: py(items[i].value) - (first ? 30 : 26),
        'text-anchor': first ? 'start' : 'end',
        style: `fill:${i === peak ? 'var(--accent)' : 'var(--text)'};font-size:30px;font-weight:700`,
      }, box);
      el.textContent = fmt(items[i].value);
      return { el, k };
    });

    return (lt) => {
      reveal.setAttribute('width', String(W * ease((lt - 0.15) / 0.9)));
      dots.forEach((c, i) => {
        c.style.opacity = String(ease((lt - 0.5 - i * 0.035) / 0.35));
      });
      labels.forEach(({ el, k }) => {
        el.style.opacity = String(ease((lt - 0.9 - k * 0.06) / 0.35));
      });
    };
  },
};
