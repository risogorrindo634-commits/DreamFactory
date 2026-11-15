// Custom scene for this film: a line chart of the monthly series.
// Everything on screen is a pure function of the scene-local time t.
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const left = 100;
    const right = 1600;
    const top = 40;
    const bottom = 500;
    const yMax = 600;

    const items = scene.series ?? [];
    const n = items.length;
    const xAt = (i) => (n <= 1 ? left : left + (i * (right - left)) / (n - 1));
    const yAt = (v) => bottom - (v / yMax) * (bottom - top);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'display:block;margin-top:12px;overflow:visible' }, root);

    // Axis: gridlines and ticks are scale marks, not facts.
    for (let v = 0; v <= yMax; v += 100) {
      svg('line', { x1: left, y1: yAt(v), x2: right, y2: yAt(v), style: 'stroke:var(--track);stroke-width:1' }, chart);
      const tick = svg('text', { x: left - 16, y: yAt(v) + 8, 'text-anchor': 'end', style: 'fill:var(--muted);font-size:22px' }, chart);
      tick.textContent = fmt(v);
      tick.dataset.dfRole = 'tick';
    }
    items.forEach((it, i) => {
      const tick = svg('text', { x: xAt(i), y: bottom + 42, 'text-anchor': 'middle', style: 'fill:var(--muted);font-size:24px' }, chart);
      tick.textContent = it.label;
      tick.dataset.dfRole = 'tick';
    });

    // The line itself, revealed left to right.
    const pts = items.map((it, i) => [xAt(i), yAt(it.value)]);
    const cum = [0];
    let length = 0;
    for (let i = 1; i < pts.length; i++) {
      length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      cum.push(length);
    }
    const path = svg('polyline', {
      points: pts.map((p) => p.join(',')).join(' '),
      style: 'fill:none;stroke:var(--accent);stroke-width:5;stroke-linejoin:round;stroke-linecap:round',
    }, chart);
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);

    // A soft halo marks the peak; it is decoration, not a data mark.
    const peakIdx = Math.max(0, items.findIndex((it) => it.label === scene.highlight));
    const halo = svg('circle', {
      cx: xAt(peakIdx), cy: yAt(items[peakIdx]?.value ?? 0),
      style: 'fill:none;stroke:var(--accent);stroke-width:2',
    }, chart);

    // One dot per month, each declaring the value it stands for.
    const dots = items.map((it, i) => {
      const dot = svg('circle', {
        cx: xAt(i), cy: yAt(it.value), r: 7,
        style: `fill:${i === peakIdx ? 'var(--accent)' : 'var(--text)'}`,
      }, chart);
      dot.dataset.dfValue = String(it.value);
      dot.dataset.dfGroup = 'monthly';
      return { dot, frac: length ? cum[i] / length : 0 };
    });

    // The four numbers the brief asks for, each labelled above its point.
    const focus = scene.focus ?? [];
    const labels = focus.map((it) => {
      const idx = items.findIndex((row) => row.label === it.label);
      const value = idx >= 0 ? items[idx].value : it.value;
      const cx = idx >= 0 ? xAt(idx) : left;
      const ly = (idx >= 0 ? yAt(value) : bottom) - 34;
      const text = fmt(value);
      const w = Math.max(58, text.length * 19 + 24);
      const g = svg('g', {}, chart);
      svg('rect', {
        x: cx - w / 2, y: ly - 32, width: w, height: 42, rx: 10,
        style: 'fill:var(--bg);stroke:var(--bar);stroke-width:1.5',
      }, g);
      const label = svg('text', {
        x: cx, y: ly, 'text-anchor': 'middle',
        style: `fill:${it.label === scene.highlight ? 'var(--accent)' : 'var(--text)'};font-size:30px;font-weight:700`,
      }, g);
      label.textContent = text;
      g.style.opacity = '0';
      return g;
    });

    return (lt, lines) => {
      const reveal = ease((lt - 0.35) / 3.6);
      path.style.strokeDashoffset = String(length * (1 - reveal));
      for (const { dot, frac } of dots) {
        dot.style.opacity = String(clamp((lt - 0.35 - 3.6 * frac) / 0.3));
      }
      labels.forEach((g, k) => {
        const line = lines[k];
        const at = line ? line.start - 0.25 : 0.8;
        const p = ease((lt - at) / 0.45);
        g.style.opacity = String(p);
        g.style.transform = `translateY(${(1 - p) * 12}px)`;
      });
      const wave = 0.5 + 0.5 * Math.sin(lt * 2.1);
      halo.setAttribute('r', String(19 + 5 * wave));
      halo.style.opacity = String(0.16 + 0.16 * wave);
    };
  },
};
