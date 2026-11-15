// A two-series line chart on one pair of axes, with the crossing month called out.
// Everything on screen is a pure function of t: no random numbers, clocks or state between frames.
export default {
  twolines(scene, root, kit) {
    const { svg, ease, chartHead } = kit;
    chartHead(scene, root);

    const series = scene.series ?? [];
    const all = series.flatMap((s) => s.items ?? []);
    if (!all.length) return () => {};
    const maxValue = Math.max(...all.map((it) => it.value));
    const step = maxValue > 200 ? 50 : 25;
    const yMax = Math.ceil(maxValue / step) * step;

    const W = 1640;
    const H = 560;
    const left = 100;
    const right = 1340;
    const top = 30;
    const bottom = 470;
    const n = Math.max(...series.map((s) => (s.items ?? []).length));
    const x = (i) => left + (i * (right - left)) / Math.max(1, n - 1);
    const y = (v) => bottom - (v / yMax) * (bottom - top);
    const paint = (s) => (s.tone === 'accent' ? 'var(--accent)' : 'var(--muted)');
    const unit = scene.unit ?? '';

    const chart = svg('svg', {
      width: W,
      height: H,
      viewBox: `0 0 ${W} ${H}`,
      style: 'display:block;margin-top:14px',
    }, root);

    // Axis furniture. Tick labels are not facts: they carry data-df-role="tick" on their group.
    const axis = svg('g', { 'data-df-role': 'tick' }, chart);
    svg('line', {
      x1: left, y1: bottom, x2: right, y2: bottom,
      style: 'stroke:var(--muted);stroke-width:2px;opacity:0.5',
    }, chart);
    for (let v = 0; v <= yMax; v += step) {
      svg('line', {
        x1: left - 12, y1: y(v), x2: left, y2: y(v),
        style: 'stroke:var(--muted);stroke-width:2px;opacity:0.7',
      }, axis);
      const label = svg('text', {
        x: left - 22, y: y(v) + 8, 'text-anchor': 'end',
        style: 'font-size:22px;fill:var(--muted)',
      }, axis);
      label.textContent = String(v);
    }
    (series[0]?.items ?? []).forEach((it, i) => {
      const label = svg('text', {
        x: x(i), y: bottom + 38, 'text-anchor': 'middle',
        style: 'font-size:22px;fill:var(--muted)',
      }, axis);
      label.textContent = it.label;
    });

    // The lines are drawn by widening a clip, so a dashed line keeps its pattern.
    const clipId = `reveal-${scene.id}`;
    const defs = svg('defs', {}, chart);
    const clip = svg('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, defs);
    const reveal = svg('rect', { x: 0, y: 0, width: 0, height: H }, clip);
    const plot = svg('g', { 'clip-path': `url(#${clipId})` }, chart);

    series.forEach((s) => {
      const items = s.items ?? [];
      svg('polyline', {
        points: items.map((it, i) => `${x(i)},${y(it.value)}`).join(' '),
        style: `fill:none;stroke:${paint(s)};stroke-width:5px;stroke-linejoin:round;stroke-linecap:round${s.dashed ? ';stroke-dasharray:16 12' : ''}`,
      }, plot);
      items.forEach((it, i) => {
        svg('circle', {
          cx: x(i),
          cy: y(it.value),
          r: 6,
          'data-df-value': String(it.value),
          'data-df-group': s.name,
          style: `fill:${paint(s)}`,
        }, plot);
      });
    });

    // A dashed guide down the crossing month, and a card listing the two values there.
    const month = scene.callout?.month;
    const monthIndex = month ? (series[0]?.items ?? []).findIndex((it) => it.label === month.label) : -1;
    const cross = monthIndex >= 0
      ? svg('line', {
        x1: x(monthIndex), y1: top - 8, x2: x(monthIndex), y2: bottom,
        style: 'stroke:var(--muted);stroke-width:2px;stroke-dasharray:10 12;opacity:0',
      }, chart)
      : null;

    const card = svg('g', { style: 'opacity:0' }, chart);
    svg('rect', {
      x: 100, y: 64, width: 470, height: 196, rx: 18,
      style: 'fill:var(--track)',
    }, card);
    const cardHead = svg('text', {
      x: 128, y: 116,
      style: 'font-size:30px;font-weight:700;fill:var(--accent)',
    }, card);
    cardHead.textContent = `${month?.label ?? ''}：第一次反超`;
    (scene.callout?.items ?? []).forEach((c, i) => {
      const text = svg('text', {
        x: 128,
        y: 170 + i * 54,
        style: `font-size:30px;fill:${i === 0 ? 'var(--text)' : 'var(--muted)'}`,
      }, card);
      text.textContent = `${c.name} ${c.point.value} ${unit}`;
    });

    // Direct labels at the end of each line: the series name and its final value.
    const endLabels = series.map((s) => {
      const items = s.items ?? [];
      const last = items[items.length - 1];
      const label = svg('text', {
        x: right + 26,
        y: y(last.value) + 10,
        style: `font-size:32px;font-weight:700;fill:${paint(s)};opacity:0`,
      }, chart);
      label.textContent = `${s.name} ${last.value} ${unit}`;
      return label;
    });

    return (t) => {
      reveal.setAttribute('width', String(8 + (right + 8) * ease((t - 0.2) / 1.5)));
      axis.style.opacity = String(ease((t - 0.05) / 0.4));
      if (cross) cross.style.opacity = String(0.6 * ease((t - 1.2) / 0.5));
      card.style.opacity = String(ease((t - 1.3) / 0.5));
      const labels = ease((t - 1.6) / 0.5);
      endLabels.forEach((el) => {
        el.style.opacity = String(labels);
      });
    };
  },
};
