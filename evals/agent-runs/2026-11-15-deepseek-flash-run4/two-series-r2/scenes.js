// A line chart for two monthly series: both lines are labelled by name, every point carries
// its value, and the months named in `markMonths` get their values written on the chart.
export default {
  line(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 600;
    const x0 = 90;
    const x1 = 1580;
    const yTop = 100;
    const yBot = 560;

    const series = scene.series || {};
    const keys = Object.keys(series).filter((k) => Array.isArray(series[k]) && series[k].length);
    const names = scene.names || {};
    const colorOf = (i) => (i === 0 ? 'var(--accent)' : i === 1 ? 'var(--bar)' : 'var(--muted)');

    const first = series[keys[0]] || [];
    const n = Math.max(...keys.map((k) => series[k].length));
    const values = keys.flatMap((k) => series[k].map((it) => Number(it.value)));
    const max = Math.max(...values);
    const step = max > 200 ? 50 : max > 100 ? 25 : max > 40 ? 20 : 10;
    const top = Math.max(step, Math.ceil(max / step) * step);
    const X = (i) => x0 + (i * (x1 - x0)) / Math.max(1, n - 1);
    const Y = (v) => yBot - (v / top) * (yBot - yTop);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);
    chart.style.display = 'block';
    chart.style.marginTop = '24px';

    const axis = svg('g', {}, chart);
    const guides = svg('g', {}, chart);
    const linesG = svg('g', {}, chart);
    const dotsG = svg('g', {}, chart);
    const labelsG = svg('g', {}, chart);
    const legend = svg('g', {}, chart);

    // Axes: a baseline, a value axis on the left, and a tick for every labelled value.
    for (const seg of [[x0, yBot, x1, yBot], [x0, yTop, x0, yBot]]) {
      const rule = svg('line', { x1: seg[0], y1: seg[1], x2: seg[2], y2: seg[3] }, axis);
      rule.style.cssText = 'stroke: var(--track); stroke-width: 2;';
    }
    for (let v = 0; v <= top + 1e-9; v += step) {
      const tick = svg('text', { x: x0 - 16, y: Y(v) + 7, 'text-anchor': 'end', 'data-df-role': 'tick' }, axis);
      tick.textContent = fmt(v);
      tick.style.cssText = 'fill: var(--muted); font-size: 22px;';
    }
    const monthTicks = first.map((it, i) => {
      const tick = svg('text', { x: X(i), y: yBot + 30, 'text-anchor': 'middle', 'data-df-role': 'tick' }, axis);
      tick.textContent = it.label;
      tick.style.cssText = 'fill: var(--muted); font-size: 22px;';
      return tick;
    });
    for (const month of scene.markMonths || []) {
      const i = first.findIndex((it) => it.label === month);
      if (i >= 0) monthTicks[i].style.cssText = 'fill: var(--accent); font-size: 22px; font-weight: 700;';
    }

    // Legend: the two names from data.json, each beside its line's colour.
    keys.forEach((k, i) => {
      const bx = 1120 + i * 250;
      const swatch = svg('line', { x1: bx, y1: 22, x2: bx + 46, y2: 22 }, legend);
      swatch.style.cssText = `stroke: ${colorOf(i)}; stroke-width: 6; stroke-linecap: round;`;
      const name = svg('text', { x: bx + 62, y: 32 }, legend);
      name.textContent = names[k] ?? k;
      name.style.cssText = 'fill: var(--text); font-size: 30px;';
    });

    // A dashed guide through the month where the lines cross, named above the plot.
    const markMonth = (scene.markMonths || [])[0];
    const markIndex = markMonth ? first.findIndex((it) => it.label === markMonth) : -1;
    let guide = null;
    let badge = null;
    if (markIndex >= 0) {
      guide = svg('line', { x1: X(markIndex), y1: 92, x2: X(markIndex), y2: yBot - 15 }, guides);
      guide.style.cssText = 'stroke: var(--accent); stroke-width: 2; stroke-dasharray: 6 8; opacity: 0;';
      badge = svg('text', { x: X(markIndex), y: 76, 'text-anchor': 'middle' }, labelsG);
      badge.textContent = '反超';
      badge.style.cssText = 'fill: var(--accent); font-size: 28px; font-weight: 700; opacity: 0;';
    }

    const lines = keys.map((k, i) => {
      const d = series[k]
        .map((it, j) => `${j ? 'L' : 'M'}${X(j).toFixed(1)} ${Y(Number(it.value)).toFixed(1)}`)
        .join(' ');
      const path = svg('path', { d }, linesG);
      path.style.cssText = `fill: none; stroke: ${colorOf(i)}; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round;`;
      const len = path.getTotalLength();
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      return { el: path, len };
    });

    // Every point stands for its value; the months being talked about are drawn a little larger.
    const wanted = new Set(scene.markMonths || []);
    const dots = [];
    keys.forEach((k, ki) => {
      series[k].forEach((it, i) => {
        const v = Number(it.value);
        const dot = svg('circle', {
          cx: X(i),
          cy: Y(v),
          r: wanted.has(it.label) ? 9 : 6.5,
          'data-df-value': v,
          'data-df-group': k,
        }, dotsG);
        dot.style.cssText = `fill: ${colorOf(ki)}; stroke: var(--bg); stroke-width: 2; opacity: 0;`;
        dots.push({ el: dot, i });
      });
    });

    // The numbers written on the chart. A value near the top of its month goes above-left of its
    // point, clear of the rising line; a lower one goes below-right, where the line has passed.
    const labels = [];
    for (const month of scene.markMonths || []) {
      const entries = keys
        .map((k, ki) => {
          const i = series[k].findIndex((it) => it.label === month);
          return i >= 0 ? { k, ki, i, v: Number(series[k][i].value) } : null;
        })
        .filter(Boolean);
      const highest = Math.max(...entries.map((e) => e.v));
      for (const e of entries) {
        const up = e.i === n - 1 || e.v === highest;
        const label = svg('text', {
          x: up ? X(e.i) - 16 : X(e.i) + 18,
          y: up ? Y(e.v) - 26 : Y(e.v) + 46,
          'text-anchor': up ? 'end' : 'start',
        }, labelsG);
        label.textContent = fmt(e.v);
        label.style.cssText = `fill: ${colorOf(e.ki)}; font-size: 30px; font-weight: 700; opacity: 0;`;
        labels.push(label);
      }
    }

    return (t) => {
      axis.style.opacity = String(ease((t - 0.1) / 0.7));
      const draw = ease((t - 0.5) / 1.4);
      for (const line of lines) line.el.style.strokeDashoffset = String(line.len * (1 - draw));
      for (const dot of dots) {
        dot.el.style.opacity = String(ease((t - 1.5 - (dot.i / Math.max(1, n - 1)) * 0.5) / 0.3));
      }
      const labelIn = ease((t - 2.0) / 0.5);
      for (const label of labels) label.style.opacity = String(labelIn);
      legend.style.opacity = String(ease((t - 0.2) / 0.6));
      if (guide) guide.style.opacity = String(0.55 * ease((t - 1.9) / 0.5));
      if (badge) badge.style.opacity = String(ease((t - 2.0) / 0.5));
    };
  },
};
