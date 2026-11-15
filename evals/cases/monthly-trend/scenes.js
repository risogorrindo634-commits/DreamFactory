// Scene code for this film: a line chart over the months of a year.
// A builder creates its DOM once and returns update(t), which sets every style from t alone.
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);
    const items = scene.series;
    const labelled = new Set(scene.labels || []);
    const W = 1640;
    const H = 560;
    const box = { left: 110, right: 1580, top: 60, bottom: 470 };
    const top = Math.ceil(Math.max(...items.map((it) => it.value)) / 100) * 100;
    const x = (i) => box.left + (i * (box.right - box.left)) / (items.length - 1);
    const y = (v) => box.bottom - (v / top) * (box.bottom - box.top);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'margin-top: 20px' }, root);

    // Grid lines and axis labels are scale furniture, not facts.
    const axis = svg('g', { 'data-df-role': 'tick' }, chart);
    for (let k = 0; k <= 4; k++) {
      const v = (top * k) / 4;
      svg('line', { x1: box.left, x2: box.right, y1: y(v), y2: y(v), style: 'stroke: var(--track); stroke-width: 2' }, axis);
      svg('text', { x: box.left - 18, y: y(v) + 9, 'text-anchor': 'end', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = fmt(v);
    }
    items.forEach((it, i) => {
      svg('text', { x: x(i), y: box.bottom + 50, 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = it.label;
    });

    // The line is revealed left to right by a growing clip rectangle.
    const clipId = `reveal-${scene.id}`;
    const clip = svg('rect', { x: 0, y: 0, width: 0, height: H }, svg('clipPath', { id: clipId }, svg('defs', {}, chart)));
    svg('polyline', {
      points: items.map((it, i) => `${x(i)},${y(it.value)}`).join(' '),
      'clip-path': `url(#${clipId})`,
      style: 'fill: none; stroke: var(--accent); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round',
    }, chart);

    const points = items.map((it, i) => {
      const hot = it.label === scene.highlight;
      const dot = svg('circle', { cx: x(i), cy: y(it.value), r: hot ? 12 : 8, 'data-df-value': it.value, style: `fill: var(${hot ? '--accent' : '--text'})` }, chart);
      let label = null;
      if (labelled.has(it.label)) {
        // A label sits above its point. Where the line climbs steeply to the next point it would run
        // through the label, so there the label moves to the upper left of the point.
        const next = items[i + 1];
        const steep = next && (y(it.value) - y(next.value)) / (x(i + 1) - x(i)) > 0.4;
        label = svg('text', { x: steep ? x(i) - 14 : x(i), y: y(it.value) - 24, 'text-anchor': steep ? 'end' : 'middle', style: `fill: var(${hot ? '--accent' : '--text'}); font-size: 36px; font-weight: 700` }, chart);
        label.textContent = fmt(it.value);
      }
      return { dot, label, at: x(i) };
    });

    return (t) => {
      axis.style.opacity = String(ease((t - 0.2) / 0.5));
      const edge = box.left - 20 + ease((t - 0.5) / 1.8) * (box.right - box.left + 40);
      clip.setAttribute('width', String(Math.max(0, edge)));
      for (const p of points) {
        const shown = clamp((edge - p.at) / 24);
        p.dot.style.opacity = String(shown);
        if (p.label) p.label.style.opacity = String(shown);
      }
    };
  },
};
