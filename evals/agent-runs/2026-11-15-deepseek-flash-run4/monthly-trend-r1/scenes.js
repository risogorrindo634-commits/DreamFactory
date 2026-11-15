// A line chart for the monthly series. The picture is a pure function of the scene time:
// the line is revealed left to right, then the dots and the named months fade in and stay put.
export default {
  line(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const left = 100;
    const right = 1600;
    const top = 56;
    const bottom = 500;
    const items = scene.series || [];
    const max = Math.max(...items.map((it) => Number(it.value)));
    // A round top for the axis, worked out from the data. It is a layout scale, not a fact:
    // no label prints it.
    const scaleMax = Math.ceil(max / 100) * 100;
    const x = (i) => left + (i * (right - left)) / Math.max(1, items.length - 1);
    const y = (v) => bottom - (v / scaleMax) * (bottom - top);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'margin-top:16px;display:block' }, root);

    // Baseline and a few scale ticks. Tick numbers are axis labels, not facts.
    svg('line', { x1: left, y1: bottom, x2: right, y2: bottom, style: 'stroke:var(--track);stroke-width:2' }, chart);
    for (const v of [0, 200, 400]) {
      const tick = svg('text', { x: left - 26, y: y(v) + 8, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:24px' }, chart);
      tick.textContent = fmt(v);
      tick.dataset.dfRole = 'tick';
    }
    // Months along the axis, read from the data.
    items.forEach((it, i) => {
      const tick = svg('text', { x: x(i), y: bottom + 34, 'text-anchor': 'middle', style: 'fill:var(--muted);font-size:24px' }, chart);
      tick.textContent = it.label;
      tick.dataset.dfRole = 'tick';
    });

    // The line, revealed by a growing clip rectangle.
    const defs = svg('defs', {}, chart);
    const clip = svg('clipPath', { id: 'df-line-clip' }, defs);
    const clipRect = svg('rect', { x: 0, y: 0, width: 0, height: H }, clip);
    const d = items.map((it, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(it.value)}`).join(' ');
    svg('path', {
      d,
      'clip-path': 'url(#df-line-clip)',
      style: 'fill:none;stroke:var(--accent);stroke-width:5;stroke-linejoin:round;stroke-linecap:round',
    }, chart);

    // One dot per month, each tagged with the number it stands for.
    const dots = items.map((it, i) => {
      const dot = svg('circle', { cx: x(i), cy: y(it.value), r: 8, style: 'fill:var(--accent)' }, chart);
      dot.dataset.dfValue = String(it.value);
      dot.dataset.dfGroup = 'monthly';
      return dot;
    });

    // Value callouts for the named months, set above-left of the point so the line
    // never runs through them.
    const wanted = new Set(scene.callouts || []);
    const labels = [];
    items.forEach((it, i) => {
      if (!wanted.has(it.label)) return;
      const label = svg('text', {
        x: x(i) - 40,
        y: y(it.value) - 24,
        'text-anchor': 'middle',
        style: 'fill:var(--text);font-size:30px;font-weight:700',
      }, chart);
      label.textContent = fmt(it.value);
      labels.push(label);
    });

    return (t) => {
      clipRect.setAttribute('width', String(W * ease((t - 0.15) / 1)));
      dots.forEach((dot, i) => dot.setAttribute('opacity', String(ease((t - 0.35 - i * 0.05) / 0.3))));
      labels.forEach((label) => label.setAttribute('opacity', String(ease((t - 0.7) / 0.4))));
    };
  },
};
