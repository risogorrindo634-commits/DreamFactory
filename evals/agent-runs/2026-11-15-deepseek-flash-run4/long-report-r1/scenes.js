// Custom scene for this film: a monthly line chart.
// Everything on screen is a pure function of the scene time `t`.

export default {
  line(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 520;
    const plot = { x0: 130, x1: 1580, y0: 60, y1: 450 };
    const pts = (scene.points || []).filter((p) => p && typeof p.value === 'number');
    if (!pts.length) return () => {};

    const max = Math.max(...pts.map((p) => p.value));
    // The top of the scale is the next round hundred above the largest value.
    const top = Math.max(100, Math.ceil(max / 100) * 100);
    const n = pts.length;
    const xAt = (i) => plot.x0 + (n === 1 ? 0 : (i * (plot.x1 - plot.x0)) / (n - 1));
    const yAt = (v) => plot.y1 - (v / top) * (plot.y1 - plot.y0);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'display:block' }, root);

    // Value axis: short tick marks just outside the plot, and their labels further left.
    const yLabels = [];
    for (let v = 0; v <= top; v += 100) {
      const y = yAt(v);
      svg('line', { x1: plot.x0 - 10, y1: y, x2: plot.x0 - 2, y2: y, style: 'stroke:var(--muted);stroke-width:2' }, chart);
      const t = svg('text', {
        x: plot.x0 - 20,
        y: y + 8,
        'text-anchor': 'end',
        style: 'fill:var(--muted);font-size:24px',
      }, chart);
      t.textContent = fmt(v);
      t.dataset.dfRole = 'tick';
      yLabels.push(t);
    }

    // Baseline of the plot.
    svg('line', {
      x1: plot.x0, y1: plot.y1, x2: plot.x1, y2: plot.y1,
      style: 'stroke:var(--track);stroke-width:2',
    }, chart);

    // Month labels under the plot, taken from the data.
    const xLabels = pts.map((p, i) => {
      const t = svg('text', {
        x: xAt(i),
        y: plot.y1 + 36,
        'text-anchor': 'middle',
        style: 'fill:var(--muted);font-size:24px',
      }, chart);
      t.textContent = p.label;
      t.dataset.dfRole = 'tick';
      return t;
    });

    // The trend line.
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`).join(' ');
    const path = svg('path', {
      d,
      style: 'fill:none;stroke:var(--accent);stroke-width:4;stroke-linejoin:round;stroke-linecap:round',
    }, chart);

    // One dot per month, each tagged with the value it stands for.
    const dots = pts.map((p, i) => {
      const c = svg('circle', {
        cx: xAt(i), cy: yAt(p.value), r: 7,
        style: 'fill:var(--accent)',
      }, chart);
      c.dataset.dfValue = String(p.value);
      c.dataset.dfGroup = 'monthly';
      return c;
    });

    // The peak month is labelled; the label sits above and to the left of the dot, clear of the line.
    let peakIndex = 0;
    pts.forEach((p, i) => {
      if (p.value > pts[peakIndex].value) peakIndex = i;
    });
    const peak = pts[peakIndex];
    const unit = scene.unit ? (/^[A-Za-z]/.test(scene.unit) ? ` ${scene.unit}` : `${scene.unit}`) : '';
    const peakLabel = svg('text', {
      x: xAt(peakIndex) - 22,
      y: yAt(peak.value) - 26,
      'text-anchor': 'end',
      style: 'fill:var(--text);font-size:34px;font-weight:700',
    }, chart);
    peakLabel.textContent = `${fmt(peak.value)} ${unit}`.replace(/\s+$/, '');

    return (t) => {
      const axisIn = ease((t - 0.1) / 0.6);
      for (const el of yLabels) el.style.opacity = String(axisIn);
      path.style.opacity = String(ease((t - 0.3) / 0.9));
      dots.forEach((c, i) => {
        const p = ease((t - (0.5 + i * 0.06)) / 0.35);
        c.setAttribute('r', (7 * p).toFixed(2));
        c.style.opacity = String(p);
        xLabels[i].style.opacity = String(p);
      });
      peakLabel.style.opacity = String(ease((t - 1.3) / 0.4));
    };
  },
};
