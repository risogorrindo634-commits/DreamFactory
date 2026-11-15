// A line chart for one year of monthly values, drawn with a break where a month has no data.
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 620;
    const plot = { x0: 200, x1: 1600, y0: 60, y1: 520, max: 800 };
    const items = scene.series || [];
    const last = Math.max(1, items.length - 1);
    const xFor = (i) => plot.x0 + ((plot.x1 - plot.x0) * i) / last;
    const yFor = (v) => plot.y1 - (v / plot.max) * (plot.y1 - plot.y0);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // Axis rules.
    svg('line', { x1: plot.x0, y1: plot.y0, x2: plot.x0, y2: plot.y1, style: 'stroke: var(--track); stroke-width: 2' }, chart);
    svg('line', { x1: plot.x0, y1: plot.y1, x2: plot.x1, y2: plot.y1, style: 'stroke: var(--track); stroke-width: 2' }, chart);

    // Value axis: labels and small tick marks are not facts, so they carry the tick role.
    const yAxis = svg('g', { 'data-df-role': 'tick' }, chart);
    for (const v of [0, 200, 400, 600, 800]) {
      const y = yFor(v);
      svg('line', { x1: plot.x0 - 12, y1: y, x2: plot.x0, y2: y, style: 'stroke: var(--muted); stroke-width: 2; opacity: 0.6' }, chart);
      const t = svg('text', { x: plot.x0 - 50, y: y + 8, 'text-anchor': 'end', style: 'fill: var(--muted); font-size: 24px' }, yAxis);
      t.textContent = fmt(v);
    }

    // Month labels.
    items.forEach((m, i) => {
      const missing = typeof m.value !== 'number';
      const t = svg('text', {
        x: xFor(i), y: plot.y1 + 40, 'text-anchor': 'middle', 'data-df-role': 'tick',
        style: `fill: ${missing ? 'var(--accent)' : 'var(--muted)'}; font-size: 26px; font-weight: ${missing ? 700 : 400}`,
      }, chart);
      t.textContent = m.label;
    });

    // A dashed rule marks the month with no data; the note sits on it, masking the dashes.
    let gap = null;
    const gapIdx = items.findIndex((m) => typeof m.value !== 'number');
    if (gapIdx >= 0) {
      const gx = xFor(gapIdx);
      const g = svg('g', {}, chart);
      svg('line', {
        x1: gx, y1: plot.y0, x2: gx, y2: plot.y1,
        style: 'stroke: var(--muted); stroke-width: 2; stroke-dasharray: 10 12; opacity: 0.7',
      }, g);
      const w = 176;
      svg('rect', { x: gx - w / 2, y: 280, width: w, height: 60, rx: 10, style: 'fill: var(--bg); stroke: var(--accent); stroke-width: 2' }, g);
      const note = svg('text', { x: gx, y: 319, 'text-anchor': 'middle', style: 'fill: var(--accent); font-size: 34px; font-weight: 700' }, g);
      note.textContent = scene.note || '';
      gap = { g, at: 0.85 };
    }

    // One polyline per unbroken run of months: the line never crosses the gap.
    const runs = [];
    let run = [];
    items.forEach((m, i) => {
      if (typeof m.value === 'number') run.push({ i, value: m.value });
      else {
        if (run.length) runs.push(run);
        run = [];
      }
    });
    if (run.length) runs.push(run);

    const segs = runs.map((r, k) => {
      let len = 0;
      for (let j = 1; j < r.length; j++) len += Math.hypot(xFor(r[j].i) - xFor(r[j - 1].i), yFor(r[j].value) - yFor(r[j - 1].value));
      const el = svg('polyline', {
        points: r.map((m) => `${xFor(m.i)},${yFor(m.value)}`).join(' '),
        style: 'fill: none; stroke: var(--accent); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round',
      }, chart);
      el.style.strokeDasharray = `${len} ${len}`;
      el.style.strokeDashoffset = String(len);
      return { el, len, delay: k * 0.2 };
    });

    // A dot and its value for every month that has data; the first and last are called out.
    const dots = [];
    let firstIdx = -1;
    let lastIdx = -1;
    items.forEach((m, i) => {
      if (typeof m.value !== 'number') return;
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    });
    items.forEach((m, i) => {
      if (typeof m.value !== 'number') return;
      const x = xFor(i);
      const y = yFor(m.value);
      const key = i === firstIdx || i === lastIdx;
      const dot = svg('circle', {
        cx: x, cy: y, r: key ? 10 : 7,
        'data-df-value': String(m.value), 'data-df-group': 'monthly',
        style: `fill: var(--bg); stroke: var(--accent); stroke-width: ${key ? 6 : 4}`,
      }, chart);
      dot.style.opacity = '0';
      const anchor = i === firstIdx ? 'start' : i === lastIdx ? 'end' : 'middle';
      const dx = i === firstIdx ? 18 : i === lastIdx ? -18 : 0;
      const fs = key ? 36 : 30;
      const label = svg('text', {
        x: x + dx, y: y - (key ? 36 : 30), 'text-anchor': anchor,
        style: `fill: ${key ? 'var(--accent)' : 'var(--text)'}; font-size: ${fs}px; font-weight: ${key ? 700 : 500}`,
      }, chart);
      label.textContent = fmt(m.value);
      label.style.opacity = '0';
      dots.push({ dot, label, at: 0.25 + (i / last) * 0.9 });
    });
    if (gap) gap.g.style.opacity = '0';

    return (t) => {
      for (const s of segs) {
        const p = ease(clamp((t - 0.2 - s.delay) / 1.1));
        s.el.style.strokeDashoffset = String(s.len * (1 - p));
      }
      for (const d of dots) {
        const p = ease(clamp((t - d.at) / 0.35));
        d.dot.style.opacity = String(p);
        d.label.style.opacity = String(p);
      }
      if (gap) gap.g.style.opacity = String(ease(clamp((t - gap.at) / 0.5)));
    };
  },
};
