// A line chart for the monthly trend. Every frame is a pure function of t: no clock, no state.
export default {
  line(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);
    chart.style.display = 'block';
    chart.style.marginTop = '18px';

    const left = 96;
    const right = 64;
    const top = 46;
    const bottom = 62;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const items = scene.series || [];
    const n = items.length;
    const yMax = 700;
    const xAt = (i) => left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const yAt = (v) => top + plotH - (v / yMax) * plotH;

    // Horizontal grid and the value axis. Ticks are not facts, so they carry the tick role.
    for (const v of [0, 200, 400, 600]) {
      const gy = yAt(v);
      const grid = svg('line', { x1: left, x2: left + plotW, y1: gy, y2: gy }, chart);
      grid.style.stroke = 'var(--track)';
      grid.style.strokeWidth = '2';
      const tick = svg('text', { x: left - 20, y: gy + 8, 'text-anchor': 'end' }, chart);
      tick.textContent = String(v);
      tick.style.fill = 'var(--muted)';
      tick.style.fontSize = '24px';
      tick.dataset.dfRole = 'tick';
    }

    // Month labels along the bottom.
    const xLabels = items.map((it, i) => {
      const label = svg('text', { x: xAt(i), y: H - 20, 'text-anchor': 'middle' }, chart);
      label.textContent = it.label;
      label.style.fill = 'var(--muted)';
      label.style.fontSize = '28px';
      return label;
    });

    // The line itself, drawn on from left to right.
    const points = items.map((it, i) => `${xAt(i)},${yAt(it.value)}`).join(' ');
    const poly = svg('polyline', { points, fill: 'none', pathLength: 1 }, chart);
    poly.style.stroke = 'var(--accent)';
    poly.style.strokeWidth = '4';
    poly.style.strokeLinejoin = 'round';
    poly.style.strokeLinecap = 'round';

    // One dot per month, each declaring the value it stands for.
    const dots = items.map((it, i) => {
      const dot = svg('circle', { cx: xAt(i), cy: yAt(it.value), r: 8 }, chart);
      dot.style.fill = 'var(--accent)';
      dot.dataset.dfValue = String(it.value);
      dot.dataset.dfGroup = 'monthly';
      return dot;
    });

    // Label the peak, placed clear of the line and the last dot.
    let peak = 0;
    for (let i = 1; i < n; i++) if (items[i].value > items[peak].value) peak = i;
    const labelX = xAt(peak) - 20;
    const labelY = yAt(items[peak].value) - 28;
    const peakLabel = svg('text', { x: labelX, y: labelY, 'text-anchor': 'end' }, chart);
    peakLabel.textContent = `${fmt(items[peak].value)} 件`;
    peakLabel.style.fill = 'var(--accent)';
    peakLabel.style.fontSize = '34px';
    peakLabel.style.fontWeight = '700';

    return (t) => {
      const draw = ease((t - 0.2) / 1.0);
      poly.style.strokeDasharray = '1';
      poly.style.strokeDashoffset = String(1 - draw);
      dots.forEach((dot, i) => {
        dot.style.opacity = String(ease((t - 0.35 - i * 0.05) / 0.35));
      });
      peakLabel.style.opacity = String(ease((t - 0.7) / 0.5));
      xLabels.forEach((label, i) => {
        label.style.opacity = String(ease((t - 0.15 - i * 0.03) / 0.4));
      });
    };
  },
};
