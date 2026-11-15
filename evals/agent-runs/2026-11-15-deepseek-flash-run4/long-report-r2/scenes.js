// A line chart for the monthly series: one point per month, the peak labelled on the chart.
export default {
  line(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 600;
    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);
    const items = scene.series ?? [];
    if (!items.length) return () => {};

    const padL = 110;
    const padR = 60;
    const padT = 40;
    const padB = 80;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const maxV = Math.max(...items.map((it) => it.value));
    const topV = Math.max(200, Math.ceil(maxV / 200) * 200);
    const xOf = (i) => padL + (plotW * i) / Math.max(1, items.length - 1);
    const yOf = (v) => padT + plotH * (1 - v / topV);
    const pts = items.map((it, i) => ({ label: it.label, value: it.value, x: xOf(i), y: yOf(it.value) }));

    // Baseline and axis labels. Axis labels are ticks, not facts.
    svg('line', {
      x1: padL, y1: padT + plotH, x2: W - padR, y2: padT + plotH,
      stroke: 'var(--track)', 'stroke-width': 2,
    }, chart);

    const yTicks = [];
    for (let v = 0; v <= topV; v += 200) {
      const t = svg('text', {
        x: padL - 26, y: yOf(v) + 8, 'text-anchor': 'end',
        style: 'font-size:22px;fill:var(--muted)',
      }, chart);
      t.textContent = fmt(v);
      t.dataset.dfRole = 'tick';
      yTicks.push(t);
    }

    const xLabels = pts.map((p) => {
      const t = svg('text', {
        x: p.x, y: padT + plotH + 46, 'text-anchor': 'middle',
        style: 'font-size:24px;fill:var(--muted)',
      }, chart);
      t.textContent = p.label;
      t.dataset.dfRole = 'tick';
      return t;
    });

    // The line itself, drawn left to right by shortening the dash gap.
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const path = svg('path', {
      d, fill: 'none', stroke: 'var(--bar)', 'stroke-width': 5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, chart);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    path.style.strokeDasharray = `${(len + 1).toFixed(1)}`;

    // One point per month; each declares the number it stands for.
    const peakIndex = pts.reduce((best, p, i) => (p.value > pts[best].value ? i : best), 0);
    const dots = pts.map((p, i) => {
      const c = svg('circle', {
        cx: p.x, cy: p.y, r: i === peakIndex ? 9 : 7,
        fill: i === peakIndex ? 'var(--accent)' : 'var(--bar)',
      }, chart);
      c.dataset.dfValue = String(p.value);
      c.dataset.dfGroup = 'month';
      return c;
    });

    // Value labels: the starting month in muted grey, the year's peak in the accent colour.
    const firstLabel = svg('text', {
      x: pts[0].x + 16, y: pts[0].y - 26,
      style: 'font-size:30px;fill:var(--muted)',
    }, chart);
    firstLabel.textContent = fmt(pts[0].value);

    const peak = pts[peakIndex];
    const peakLabel = svg('text', {
      x: peak.x - 10, y: peak.y - 42, 'text-anchor': 'end',
      style: 'font-size:38px;font-weight:700;fill:var(--accent)',
    }, chart);
    peakLabel.textContent = fmt(peak.value);

    return (lt) => {
      const draw = ease((lt - 0.2) / 2.0);
      path.style.strokeDashoffset = String(((len + 1) * (1 - draw)).toFixed(1));
      yTicks.forEach((t, i) => {
        t.style.opacity = String(ease((lt - 0.15 - i * 0.05) / 0.4));
      });
      xLabels.forEach((t, i) => {
        t.style.opacity = String(ease((lt - 0.25 - i * 0.04) / 0.4));
      });
      dots.forEach((c, i) => {
        c.style.opacity = String(ease((lt - 0.5 - i * 0.13) / 0.35));
      });
      firstLabel.style.opacity = String(ease((lt - 0.95) / 0.4));
      peakLabel.style.opacity = String(ease((lt - 1.65) / 0.4));
    };
  },
};
