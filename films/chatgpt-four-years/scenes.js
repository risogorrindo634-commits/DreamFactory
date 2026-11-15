// Scene code for this film: reported milestones on a real time axis.
// The points are announcements made on particular days, so they sit where their dates put them,
// not at equal steps. A builder creates its DOM once and returns update(t), which sets every style from t alone.
export default {
  milestones(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);
    const items = scene.series;
    const labelled = new Set(scene.labels || []);
    const W = 1640;
    const H = 560;
    const box = { left: 110, right: 1560, top: 60, bottom: 470 };

    // A calendar date as a day count, worked out from the date itself. No clock is involved.
    const dayNumber = (iso) => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      const a = Math.floor((14 - mm) / 12);
      const y = yy + 4800 - a;
      const m = mm + 12 * a - 3;
      return dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    };
    const first = dayNumber(scene.from);
    const last = dayNumber(scene.to);
    const top = Math.ceil(Math.max(...items.map((it) => it.value)) / 3) * 3;
    const x = (iso) => box.left + ((dayNumber(iso) - first) / (last - first)) * (box.right - box.left);
    const y = (v) => box.bottom - (v / top) * (box.bottom - box.top);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'margin-top: 20px' }, root);

    // Grid lines, value steps and the years along the bottom are scale furniture, not facts.
    const axis = svg('g', { 'data-df-role': 'tick' }, chart);
    for (let k = 0; k <= 4; k++) {
      const v = (top * k) / 4;
      svg('line', { x1: box.left, x2: box.right, y1: y(v), y2: y(v), style: 'stroke: var(--track); stroke-width: 2' }, axis);
      svg('text', { x: box.left - 18, y: y(v) + 9, 'text-anchor': 'end', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = fmt(v);
    }
    const firstYear = Number(scene.from.slice(0, 4)) + 1;
    const lastYear = Number(scene.to.slice(0, 4));
    for (let year = firstYear; year <= lastYear; year++) {
      const at = x(`${year}-01-01`);
      svg('line', { x1: at, x2: at, y1: box.bottom, y2: box.bottom + 12, style: 'stroke: var(--muted); stroke-width: 2' }, axis);
      svg('text', { x: at, y: box.bottom + 50, 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = String(year);
    }

    // Which points OpenAI stated itself and which are known only through press reports.
    const legend = svg('g', {}, chart);
    [['官方公布', false], ['媒体报道', true]].forEach(([name, hollow], k) => {
      const at = box.left + 40 + k * 240;
      svg('circle', { cx: at, cy: box.top + 24, r: 9, style: hollow ? 'fill: var(--bg); stroke: var(--accent); stroke-width: 4' : 'fill: var(--accent)' }, legend);
      svg('text', { x: at + 22, y: box.top + 34, style: 'fill: var(--text); font-size: 28px' }, legend).textContent = name;
    });

    // The line is revealed left to right by a growing clip rectangle.
    const clipId = `reveal-${scene.id}`;
    const clip = svg('rect', { x: 0, y: 0, width: 0, height: H }, svg('clipPath', { id: clipId }, svg('defs', {}, chart)));
    svg('polyline', {
      points: items.map((it) => `${x(it.date)},${y(it.value)}`).join(' '),
      'clip-path': `url(#${clipId})`,
      style: 'fill: none; stroke: var(--accent); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round',
    }, chart);

    const points = items.map((it) => {
      const hollow = it.by !== '官方';
      const dot = svg('circle', { cx: x(it.date), cy: y(it.value), r: 9, 'data-df-value': it.value, style: hollow ? 'fill: var(--bg); stroke: var(--accent); stroke-width: 4' : 'fill: var(--accent)' }, chart);
      let label = null;
      if (labelled.has(it.label)) {
        // The line only ever climbs, so the space above and to the left of a point is always clear of it.
        label = svg('text', { x: x(it.date) - 16, y: y(it.value) - 20, 'text-anchor': 'end', style: 'fill: var(--text); font-size: 34px; font-weight: 700' }, chart);
        label.textContent = `${fmt(it.value)} ${scene.unit}`;
      }
      return { dot, label, at: x(it.date) };
    });

    return (t) => {
      axis.style.opacity = String(ease((t - 0.2) / 0.5));
      legend.style.opacity = String(ease((t - 0.4) / 0.5));
      const edge = box.left - 20 + ease((t - 0.6) / 2.6) * (box.right - box.left + 40);
      clip.setAttribute('width', String(Math.max(0, edge)));
      for (const p of points) {
        const shown = clamp((edge - p.at) / 24);
        p.dot.style.opacity = String(shown);
        if (p.label) p.label.style.opacity = String(shown);
      }
    };
  },
};
