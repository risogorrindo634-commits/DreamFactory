// A two-series line chart. Drawn once, then every style is a function of the scene's own time.
export default {
  lines(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640, H = 600;
    const X0 = 140, X1 = 1540, Y1 = 520;
    const VMAX = 240;
    const code = scene.code ?? [];
    const model = scene.model ?? [];
    const n = Math.max(code.length, model.length);
    const unit = scene.unit ?? '';
    const x = (i) => X0 + (i / Math.max(1, n - 1)) * (X1 - X0);
    const y = (v) => Y1 - (v / VMAX) * (Y1 - 90);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);
    chart.style.display = 'block';
    chart.style.marginTop = '20px';

    // Baseline of the value axis.
    svg('line', { x1: X0, x2: X1, y1: Y1, y2: Y1, style: 'stroke: var(--track); stroke-width: 2' }, chart);

    // Value ticks: axis furniture, not facts.
    for (const v of [0, 60, 120, 180, 240]) {
      const t = svg('text', { x: X0 - 26, y: y(v) + 9, 'text-anchor': 'end', style: 'font-size: 24px; fill: var(--muted)' }, chart);
      t.textContent = fmt(v);
      t.setAttribute('data-df-role', 'tick');
    }
    // Month ticks, taken from the data labels themselves.
    (code.length ? code : model).forEach((d, i) => {
      const t = svg('text', { x: x(i), y: Y1 + 38, 'text-anchor': 'middle', style: 'font-size: 24px; fill: var(--muted)' }, chart);
      t.textContent = d.label;
      t.setAttribute('data-df-role', 'tick');
    });

    // Legend: each line is named in words, not only by colour.
    for (const g of [
      { name: scene.codeName, color: 'var(--accent)', at: 140 },
      { name: scene.modelName, color: 'var(--muted)', at: 470 },
    ]) {
      svg('line', { x1: g.at, y1: 27, x2: g.at + 58, y2: 27, style: `stroke: ${g.color}; stroke-width: 5; stroke-linecap: round` }, chart);
      svg('circle', { cx: g.at + 29, cy: 27, r: 6, style: `fill: var(--bg); stroke: ${g.color}; stroke-width: 4` }, chart);
      const t = svg('text', { x: g.at + 76, y: 39, style: 'font-size: 32px; font-weight: 700; fill: var(--text)' }, chart);
      t.textContent = g.name;
    }

    const revealAt = (i) => 0.6 + 2.4 * (i / Math.max(1, n - 1));
    const shapes = [];
    for (const sr of [
      { data: code, color: 'var(--accent)', group: 'code' },
      { data: model, color: 'var(--muted)', group: 'model' },
    ]) {
      if (!sr.data.length) continue;
      let len = 0;
      for (let i = 1; i < sr.data.length; i++) len += Math.hypot(x(i) - x(i - 1), y(sr.data[i].value) - y(sr.data[i - 1].value));
      const pl = svg('polyline', {
        points: sr.data.map((d, i) => `${x(i)},${y(d.value)}`).join(' '),
        style: `fill: none; stroke: ${sr.color}; stroke-width: 5; stroke-linejoin: round; stroke-linecap: round`,
      }, chart);
      pl.style.strokeDasharray = String(len);
      pl.style.strokeDashoffset = String(len);
      shapes.push({ el: pl, line: true, len });
      sr.data.forEach((d, i) => {
        const c = svg('circle', {
          cx: x(i), cy: y(d.value), r: 6,
          style: `fill: var(--bg); stroke: ${sr.color}; stroke-width: 3`,
          'data-df-value': String(d.value),
          'data-df-group': sr.group,
        }, chart);
        c.style.opacity = '0';
        shapes.push({ el: c, line: false, at: revealAt(i) });
      });
    }

    // Value labels for the crossover month and the last month, placed clear of both lines.
    const idx = (label) => code.findIndex((d) => d.label === label);
    const i8 = idx('8月');
    const i12 = idx('12月');
    const vOf = (arr, i) => (i >= 0 && arr[i] ? arr[i].value : null);
    const callouts = [];
    const addCallout = (arr, i, color, anchor, tx, ty, lx1, ly1, lx2, ly2) => {
      if (i < 0 || !arr[i]) return;
      const px = x(i), py = y(arr[i].value);
      const lead = svg('line', { x1: px + lx1, y1: py + ly1, x2: px + lx2, y2: py + ly2, style: `stroke: ${color}; stroke-width: 2; stroke-dasharray: 5 5` }, chart);
      const t = svg('text', { x: px + tx, y: py + ty, 'text-anchor': anchor, style: `font-size: 32px; font-weight: 700; fill: ${color}` }, chart);
      t.textContent = `${fmt(arr[i].value)} ${unit}`.trim();
      t.style.opacity = '0';
      lead.style.opacity = '0';
      callouts.push({ text: t, lead, at: revealAt(i) + 0.15 });
    };
    addCallout(code, i8, 'var(--accent)', 'end', -55, -45, -50, -38, -9, -5);
    addCallout(model, i8, 'var(--muted)', 'start', 55, 65, 48, 58, 7, 7);
    addCallout(code, i12, 'var(--accent)', 'end', -55, -45, -50, -38, -9, -5);
    addCallout(model, i12, 'var(--muted)', 'end', -55, 65, -50, 58, -9, 7);

    const drawStart = 0.6;
    const drawEnd = 3.0;
    return (lt) => {
      const p = ease(clamp((lt - drawStart) / (drawEnd - drawStart)));
      for (const sh of shapes) {
        if (sh.line) sh.el.style.strokeDashoffset = String(sh.len * (1 - p));
        else sh.el.style.opacity = String(clamp((lt - sh.at) / 0.45));
      }
      for (const c of callouts) {
        const q = clamp((lt - c.at) / 0.45);
        c.text.style.opacity = String(q);
        c.lead.style.opacity = String(q * 0.9);
      }
    };
  },
};
