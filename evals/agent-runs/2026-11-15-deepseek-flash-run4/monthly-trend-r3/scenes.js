// A twelve-point line chart: the shape of the monthly trend, not a ranking of months.
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const L = 96; // room for the value axis
    const R = 30;
    const T = 36;
    const B = 500;
    const plotW = W - L - R;
    const plotH = B - T;
    const items = scene.points || [];
    const n = items.length;
    const yMax = 600;
    const x = (i) => L + (i * plotW) / (n - 1);
    const y = (v) => T + (1 - v / yMax) * plotH;

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'display:block' }, root);

    // Baseline, value ticks and month labels.
    svg('line', { x1: L, y1: B, x2: L + plotW, y2: B, style: 'stroke:var(--track);stroke-width:2' }, chart);
    for (const v of [0, 200, 400, 600]) {
      const tick = svg(
        'text',
        { x: L - 14, y: y(v) + 8, 'text-anchor': 'end', 'data-df-role': 'tick', style: 'font-size:24px;fill:var(--muted)' },
        chart,
      );
      tick.textContent = fmt(v);
    }
    items.forEach((it, i) => {
      const label = svg(
        'text',
        { x: x(i), y: 536, 'text-anchor': 'middle', 'data-df-role': 'tick', style: 'font-size:24px;fill:var(--muted)' },
        chart,
      );
      label.textContent = it.label;
    });

    // The trend line, revealed left to right by its dash offset.
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(x(i) - x(i - 1), y(items[i].value) - y(items[i - 1].value));
    const d = items.map((it, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(it.value).toFixed(1)}`).join(' ');
    const line = svg(
      'path',
      {
        d,
        fill: 'none',
        'stroke-dasharray': len,
        'stroke-dashoffset': len,
        style: 'stroke:var(--accent);stroke-width:4;stroke-linejoin:round;stroke-linecap:round',
      },
      chart,
    );

    // One dot per month, each declaring the value it stands for.
    const dots = items.map((it, i) =>
      svg('circle', { cx: x(i), cy: y(it.value), r: 7, 'data-df-value': it.value, style: 'fill:var(--accent);opacity:0' }, chart),
    );
    const peak = items.reduce((best, it, i) => (it.value > items[best].value ? i : best), 0);
    const ring = svg(
      'circle',
      { cx: x(peak), cy: y(items[peak].value), r: 16, style: 'fill:none;stroke:var(--accent);stroke-width:2;opacity:0' },
      chart,
    );

    // Value labels for the months the script names, kept clear of the line.
    const placed = (scene.labeled || [])
      .map((month) => {
        const i = items.findIndex((it) => it.label === month);
        if (i < 0) return null;
        const steepOut = i < n - 1 && items[i + 1].value > items[i].value * 1.5;
        const steepIn = i > 0 && items[i].value > items[i - 1].value * 1.5;
        const anchor = steepOut || steepIn ? 'end' : 'middle';
        const dx = steepOut ? -16 : steepIn ? -14 : 0;
        const dy = steepOut ? -30 : steepIn ? -28 : -30;
        const el = svg(
          'text',
          {
            x: x(i) + dx,
            y: y(items[i].value) + dy,
            'text-anchor': anchor,
            style: 'font-size:28px;font-weight:700;fill:var(--text);opacity:0',
          },
          chart,
        );
        el.textContent = fmt(items[i].value);
        return { i, el };
      })
      .filter(Boolean);

    const drawStart = 0.35;
    const drawDur = 3.2;
    const pointAt = (i) => drawStart + drawDur * (n > 1 ? i / (n - 1) : 0);

    return (t) => {
      const p = ease(clamp((t - drawStart) / drawDur));
      line.setAttribute('stroke-dashoffset', String(len * (1 - p)));
      items.forEach((_, i) => {
        dots[i].style.opacity = String(ease(clamp((t - pointAt(i) - 0.05) / 0.3)));
      });
      ring.style.opacity = String(0.9 * ease(clamp((t - pointAt(peak) - 0.2) / 0.4)));
      for (const { i, el } of placed) {
        el.style.opacity = String(ease(clamp((t - pointAt(i) - 0.3) / 0.5)));
      }
    };
  },
};
