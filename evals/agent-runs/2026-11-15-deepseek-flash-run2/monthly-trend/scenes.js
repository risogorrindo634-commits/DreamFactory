// Custom scene: a 12-point line chart. Every position is a pure function of the scene time.
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const chart = svg('svg', {
      width: W,
      height: H,
      viewBox: `0 0 ${W} ${H}`,
      style: 'display: block; margin-top: 18px',
    }, root);

    const items = scene.series || [];
    const L = 130; // plot left
    const R = 1500; // plot right
    const T = 60; // plot top
    const B = 455; // plot bottom
    const MAX = 600; // top of the value scale
    const x = (i) => L + (i * (R - L)) / Math.max(1, items.length - 1);
    const y = (v) => B - (Math.max(0, v) / MAX) * (B - T);

    // Grid and value ticks (not facts: marked as tick).
    const grid = svg('g', {}, chart);
    for (let v = 0; v <= MAX; v += 100) {
      svg('line', {
        x1: L, y1: y(v), x2: R, y2: y(v),
        stroke: 'var(--track)', 'stroke-width': v === 0 ? 2 : 1.5,
      }, grid);
      const tick = svg('text', {
        x: L - 16, y: y(v) + 8, 'text-anchor': 'end',
        style: 'fill: var(--muted); font-size: 22px',
      }, grid);
      tick.textContent = fmt(v);
      tick.dataset.dfRole = 'tick';
    }

    // Month ticks.
    items.forEach((it, i) => {
      const tick = svg('text', {
        x: x(i), y: 505, 'text-anchor': 'middle',
        style: 'fill: var(--muted); font-size: 22px',
      }, chart);
      tick.textContent = it.label;
      tick.dataset.dfRole = 'tick';
    });

    // A soft halo on the highest point. It breathes with time, so the picture is never quite still.
    const top = items.reduce((a, it, i) => (it.value > items[a].value ? i : a), 0);
    const glow = svg('circle', {
      cx: x(top), cy: y(items[top].value), r: 44, fill: 'var(--accent)', opacity: 0,
    }, chart);

    // The trend line.
    const d = items
      .map((it, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(it.value).toFixed(1)}`)
      .join(' ');
    const line = svg('path', {
      d,
      fill: 'none',
      stroke: 'var(--accent)',
      'stroke-width': 4,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }, chart);
    const total = line.getTotalLength();
    line.style.strokeDasharray = String(total);

    // One dot per month, each carrying its value.
    const points = items.map((it, i) => {
      const dot = svg('circle', { cx: x(i), cy: y(it.value), r: 7, fill: 'var(--accent)' }, chart);
      dot.dataset.dfValue = String(it.value);
      return dot;
    });

    // Value plates for 1月, 9月, 10月 and 11月. The plate hides gridlines behind the number.
    const wanted = new Map([
      ['1月', { anchor: 'start', dx: 16 }],
      ['9月', { anchor: 'end', dx: -16 }],
      ['10月', { anchor: 'end', dx: -16 }],
      ['11月', { anchor: 'middle', dx: 0 }],
    ]);
    const callouts = [];
    items.forEach((it, i) => {
      const spec = wanted.get(it.label);
      if (!spec) return;
      const bx = x(i) + spec.dx;
      const by = y(it.value) - 28;
      const label = fmt(it.value);
      const w = label.length * 18 + 20;
      const rx = spec.anchor === 'middle' ? bx - w / 2 : bx - w + 10;
      const plate = svg('rect', {
        x: rx, y: by - 30, width: w, height: 42, rx: 8, fill: 'var(--bg)',
      }, chart);
      const text = svg('text', {
        x: bx, y: by, 'text-anchor': spec.anchor,
        style: 'fill: var(--text); font-size: 30px; font-weight: 700',
      }, chart);
      text.textContent = label;
      callouts.push({ plate, text });
    });

    return (t, lines) => {
      grid.style.opacity = String(ease(clamp((t - 0.15) / 0.45)));
      line.style.strokeDashoffset = String(total * (1 - ease(clamp((t - 0.4) / 2))));
      glow.style.opacity = String(
        (0.1 + 0.05 * (0.5 + 0.5 * Math.sin(t * 2.2))) * ease(clamp((t - 2.2) / 0.8)),
      );
      points.forEach((dot, i) => {
        dot.style.opacity = String(ease(clamp((t - 0.7 - i * 0.08) / 0.35)));
      });
      callouts.forEach((c, j) => {
        const at = lines[j] ? Math.max(0.7, lines[j].start - 0.45) : 0.9 + j * 2.6;
        const p = ease(clamp((t - at) / 0.4));
        c.plate.style.opacity = String(p);
        c.text.style.opacity = String(p);
      });
    };
  },
};
