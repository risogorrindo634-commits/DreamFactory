// Scene code for this film: two lines over the months of a year, on one chart.
// A builder creates its DOM once and returns update(t), which sets every style from t alone.
export default {
  twolines(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);
    const [first, second] = scene.series;
    const months = first.items.map((it) => it.label);
    const labelled = new Set(scene.labels || []);
    const W = 1640;
    const H = 580;
    const box = { left: 110, right: 1500, top: 90, bottom: 490 };
    const top = Math.ceil(Math.max(...scene.series.flatMap((s) => s.items.map((it) => it.value))) / 50) * 50;
    const x = (i) => box.left + (i * (box.right - box.left)) / (months.length - 1);
    const y = (v) => box.bottom - (v / top) * (box.bottom - box.top);
    const colour = { [first.key]: '--accent', [second.key]: '--muted' };

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'margin-top: 12px' }, root);

    // Which line is which: a swatch and the name, above the plot. Colour alone is not enough.
    scene.series.forEach((s, k) => {
      const at = box.left + k * 260;
      svg('line', { x1: at, x2: at + 56, y1: 34, y2: 34, style: `stroke: var(${colour[s.key]}); stroke-width: 6; stroke-linecap: round` }, chart);
      svg('text', { x: at + 72, y: 45, style: 'fill: var(--text); font-size: 30px' }, chart).textContent = s.name;
    });

    // Grid lines and axis labels are scale furniture, not facts.
    const axis = svg('g', { 'data-df-role': 'tick' }, chart);
    for (let k = 0; k <= 5; k++) {
      const v = (top * k) / 5;
      svg('line', { x1: box.left, x2: box.right, y1: y(v), y2: y(v), style: 'stroke: var(--track); stroke-width: 2' }, axis);
      svg('text', { x: box.left - 18, y: y(v) + 9, 'text-anchor': 'end', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = fmt(v);
    }
    months.forEach((m, i) => {
      svg('text', { x: x(i), y: box.bottom + 50, 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = m;
    });

    // Both lines are revealed left to right by one growing clip rectangle.
    const clipId = `reveal-${scene.id}`;
    const clip = svg('rect', { x: 0, y: 0, width: 0, height: H }, svg('clipPath', { id: clipId }, svg('defs', {}, chart)));
    for (const s of scene.series) {
      svg('polyline', {
        points: s.items.map((it, i) => `${x(i)},${y(it.value)}`).join(' '),
        'clip-path': `url(#${clipId})`,
        style: `fill: none; stroke: var(${colour[s.key]}); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round`,
      }, chart);
    }

    const points = [];
    scene.series.forEach((s, k) => {
      const other = scene.series[1 - k];
      s.items.forEach((it, i) => {
        const dot = svg('circle', { cx: x(i), cy: y(it.value), r: 7, 'data-df-value': it.value, 'data-df-group': s.key, style: `fill: var(${colour[s.key]})` }, chart);
        let label = null;
        if (labelled.has(it.label)) {
          // Where the two lines are close, the higher point is labelled above and to the left of itself,
          // the lower one below and to the right, so the numbers stay clear of both lines and of each other.
          const above = it.value >= other.items[i].value;
          const last = i === months.length - 1;
          const at = last ? { x: x(i) + 18, y: y(it.value) + 12, anchor: 'start' } : above ? { x: x(i) - 14, y: y(it.value) - 22, anchor: 'end' } : { x: x(i) + 14, y: y(it.value) + 46, anchor: 'start' };
          label = svg('text', { x: at.x, y: at.y, 'text-anchor': at.anchor, style: `fill: var(${k === 0 ? '--accent' : '--text'}); font-size: 34px; font-weight: 700` }, chart);
          label.textContent = fmt(it.value);
        }
        points.push({ dot, label, at: x(i) });
      });
    });

    return (t) => {
      axis.style.opacity = String(ease((t - 0.2) / 0.5));
      const edge = box.left - 20 + ease((t - 0.5) / 2.2) * (box.right - box.left + 40);
      clip.setAttribute('width', String(Math.max(0, edge)));
      for (const p of points) {
        const shown = clamp((edge - p.at) / 24);
        p.dot.style.opacity = String(shown);
        if (p.label) p.label.style.opacity = String(shown);
      }
    };
  },
};
