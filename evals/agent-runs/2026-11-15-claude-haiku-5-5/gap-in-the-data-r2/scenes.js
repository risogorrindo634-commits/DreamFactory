// scenes.js: a line chart for the monthly series. Built-in scenes have no line chart.
export default {
  line(scene, root, kit) {
    const { h, svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const padL = 120;
    const padR = 70;
    const padT = 50;
    const padB = 80;
    const rows = scene.series; // [{label, value, note}], value may be null
    const n = rows.length;
    const vals = rows.map((r) => r.value).filter((v) => typeof v === 'number');
    const niceTop = Math.ceil(Math.max(...vals) / 200) * 200;
    const x = (i) => padL + ((W - padL - padR) * i) / (n - 1);
    const y = (v) => padT + (H - padT - padB) * (1 - v / niceTop);
    const base = y(0);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // Axis: baseline, value ticks on the left, month labels below.
    svg('line', { x1: padL, x2: W - padR, y1: base, y2: base, style: 'stroke: var(--track); stroke-width: 2' }, chart);
    for (let k = 0; k <= 4; k++) {
      const v = (niceTop * k) / 4;
      const t = svg(
        'text',
        { x: padL - 16, y: y(v) + 8, 'text-anchor': 'end', style: 'fill: var(--muted); font-size: 24px', 'data-df-role': 'tick' },
        chart,
      );
      t.textContent = fmt(v);
    }
    rows.forEach((r, i) => {
      const t = svg(
        'text',
        { x: x(i), y: base + 46, 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 24px', 'data-df-role': 'tick' },
        chart,
      );
      t.textContent = r.label;
    });

    // Segments: only between two months that both have a value, so the line breaks at a gap.
    const segs = [];
    for (let i = 0; i < n - 1; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      if (typeof a.value !== 'number' || typeof b.value !== 'number') continue;
      const x1 = x(i);
      const y1 = y(a.value);
      const x2 = x(i + 1);
      const y2 = y(b.value);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const el = svg(
        'line',
        {
          x1, y1, x2, y2,
          style: 'stroke: var(--accent); stroke-width: 7; stroke-linecap: butt',
          'stroke-dasharray': len,
          'stroke-dashoffset': len,
        },
        chart,
      );
      segs.push({ el, i, len });
    }

    // Points: one per month with a value, each carrying its value.
    const dots = rows.map((r, i) => {
      if (typeof r.value !== 'number') return null;
      const c = svg(
        'circle',
        { cx: x(i), cy: y(r.value), r: 9, style: 'fill: var(--accent)', 'data-df-value': r.value },
        chart,
      );
      c.style.opacity = '0';
      return c;
    });

    // Value labels for January and December, placed up-and-left/right of the point.
    const first = svg('text', { x: x(0) + 14, y: y(rows[0].value) - 34, style: 'fill: var(--text); font-size: 30px; font-weight: 600' }, chart);
    first.textContent = `${fmt(rows[0].value)} 人`;
    const last = svg(
      'text',
      { x: x(n - 1) - 16, y: y(rows[n - 1].value) - 22, 'text-anchor': 'end', style: 'fill: var(--text); font-size: 30px; font-weight: 600' },
      chart,
    );
    last.textContent = `${fmt(rows[n - 1].value)} 人`;
    first.style.opacity = '0';
    last.style.opacity = '0';

    // The gap note sits in the empty space at the missing month.
    const gapIdx = rows.findIndex((r) => typeof r.value !== 'number');
    let gap = null;
    if (gapIdx >= 0) {
      gap = svg('text', { x: x(gapIdx), y: y(200), 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 28px' }, chart);
      gap.textContent = scene.gapNote;
      gap.style.opacity = '0';
    }

    return (lt, lines) => {
      const gapAt = lines[2] ? lines[2].start : 4; // the sentence about the missing month
      const drawEnd = gapAt - 0.2;
      const p = clamp((lt - 0.2) / Math.max(0.5, drawEnd - 0.2));
      const reach = p * (n - 1);
      segs.forEach(({ el, i, len }) => {
        const q = clamp(reach - i);
        el.setAttribute('stroke-dashoffset', String(len * (1 - q)));
        el.style.opacity = q > 0 ? '1' : '0';
      });
      dots.forEach((d, i) => {
        if (d) d.style.opacity = reach >= i - 0.001 ? '1' : '0';
      });
      first.style.opacity = String(ease(lt / 0.4));
      last.style.opacity = String(ease((lt - gapAt) / 0.4));
      if (gap) gap.style.opacity = String(ease((lt - gapAt) / 0.5));
    };
  },
};
