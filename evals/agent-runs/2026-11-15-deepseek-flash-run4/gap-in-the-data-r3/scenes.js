// A line chart with a hole in it. Months without a value are left out of the line, so the
// stroke breaks at the gap; the missing month carries the note from data.json instead of a number.
export default {
  linegap(scene, root, kit) {
    const { svg, ease, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 600;
    const left = 100;
    const right = 170;
    const top = 55;
    const plotH = 485;
    const vMax = 800;
    const items = scene.series || [];
    const n = items.length || 12;
    const plotW = W - left - right;
    const xAt = (i) => left + (plotW * i) / (n - 1);
    const yAt = (v) => top + (1 - v / vMax) * plotH;
    const bottomY = top + plotH;

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // Axis baseline and quiet tick marks.
    svg('line', { x1: left, y1: bottomY, x2: left + plotW, y2: bottomY, style: 'stroke:var(--track);stroke-width:2' }, chart);

    const tickTexts = [];
    for (const v of [0, 200, 400, 600, 800]) {
      const y = yAt(v);
      const t = svg('text', {
        x: left - 20,
        y: y + 8,
        'text-anchor': 'end',
        'data-df-role': 'tick',
        style: 'font-size:22px;fill:var(--muted)',
      }, chart);
      t.textContent = fmt(v);
      tickTexts.push(t);
    }

    const monthTexts = [];
    items.forEach((it, i) => {
      const t = svg('text', {
        x: xAt(i),
        y: bottomY + 44,
        'text-anchor': 'middle',
        'data-df-role': 'tick',
        style: 'font-size:24px;fill:var(--muted)',
      }, chart);
      t.textContent = it.label;
      monthTexts.push(t);
    });

    // The line is drawn only where there are values: a run ends at every gap.
    const runs = [];
    let run = [];
    items.forEach((it, i) => {
      if (typeof it.value === 'number') run.push({ i, v: it.value });
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    });
    if (run.length) runs.push(run);
    const lines = runs.map((r) => svg('polyline', {
      points: r.map((p) => `${xAt(p.i)},${yAt(p.v)}`).join(' '),
      style: 'fill:none;stroke:var(--accent);stroke-width:4;stroke-linejoin:round;stroke-linecap:round',
    }, chart));

    // One mark per month that has a value; the value it stands for is on the mark itself.
    const dots = [];
    items.forEach((it, i) => {
      if (typeof it.value !== 'number') return;
      dots.push({
        el: svg('circle', {
          cx: xAt(i),
          cy: yAt(it.value),
          r: 9,
          'data-df-value': String(it.value),
          style: 'fill:var(--bg);stroke:var(--accent);stroke-width:4',
        }, chart),
        k: dots.length,
      });
    });

    // The first and last month of the run are written out on the chart.
    const firstLast = items
      .map((it, i) => ({ it, i }))
      .filter((x) => typeof x.it.value === 'number');
    const valueTexts = [...new Set([firstLast[0], firstLast[firstLast.length - 1]])]
      .filter(Boolean)
      .map(({ it, i }, k) => {
        const t = svg('text', {
          x: xAt(i) + (k === 0 ? 18 : 0),
          y: yAt(it.value) - 22,
          'text-anchor': 'middle',
          style: 'font-size:30px;font-weight:700;fill:var(--text)',
        }, chart);
        t.textContent = fmt(it.value);
        return t;
      });

    // In the empty month, the line is absent and the data's own note takes its place.
    const noteTexts = items
      .map((it, i) => ({ it, i }))
      .filter((x) => x.it.value == null)
      .map(({ it, i }) => {
        const prev = items[i - 1];
        const next = items[i + 1];
        const yPrev = prev && typeof prev.value === 'number' ? yAt(prev.value) : bottomY - 120;
        const yNext = next && typeof next.value === 'number' ? yAt(next.value) : bottomY - 120;
        const t = svg('text', {
          x: xAt(i),
          y: (yPrev + yNext) / 2 + 64,
          'text-anchor': 'middle',
          style: 'font-size:30px;fill:var(--muted)',
        }, chart);
        t.textContent = it.note || '数据缺失';
        return t;
      });

    return (lt) => {
      const axes = ease((lt - 0.15) / 0.5);
      tickTexts.forEach((t) => { t.style.opacity = String(axes); });
      monthTexts.forEach((t) => { t.style.opacity = String(axes); });
      const lp = ease((lt - 0.5) / 0.5);
      lines.forEach((el) => { el.style.opacity = String(lp); });
      dots.forEach((d) => { d.el.style.opacity = String(ease((lt - 0.55 - d.k * 0.05) / 0.35)); });
      valueTexts.forEach((t, k) => { t.style.opacity = String(ease((lt - 1.0 - k * 0.15) / 0.45)); });
      noteTexts.forEach((t) => { t.style.opacity = String(ease((lt - 1.3) / 0.5)); });
    };
  },
};
