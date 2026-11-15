// A line chart on a real-date x axis. Every position comes from data dates and values;
// every frame is a pure function of the scene time handed in.

const D0 = '2023-11-06';
const D1 = '2026-09-30';

// Civil date to a day number (proleptic Gregorian). Deterministic: no clocks.
function dayNumber(s) {
  const [y, m, d] = s.split('-').map(Number);
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe;
}

const r1 = (n) => Math.round(n * 10) / 10;

export default {
  line(scene, root, kit) {
    const { svg, ease, chartHead } = kit;
    chartHead(scene, root);

    const items = scene.series || [];
    const X0 = 170;
    const X1 = 1600;
    const AX = 150;
    const AY = 500;
    const YT = 60;
    const YB = 470;
    const VMAX = 13;

    const d0 = dayNumber(D0);
    const d1 = dayNumber(D1);
    const x = (date) => X0 + ((dayNumber(date) - d0) / (d1 - d0)) * (X1 - X0);
    const y = (v) => YB - (v / VMAX) * (YB - YT);

    const chart = svg('svg', { width: 1640, height: 560, viewBox: '0 0 1640 560' }, root);

    // Axes: no grid lines, so nothing runs through a label.
    svg('line', { x1: AX, y1: AY, x2: 1610, y2: AY, style: 'stroke: var(--muted); stroke-width: 2; opacity: 0.55' }, chart);
    svg('line', { x1: AX, y1: 40, x2: AX, y2: AY, style: 'stroke: var(--muted); stroke-width: 2; opacity: 0.55' }, chart);

    // Y axis: marks in 亿, one tick every 4.
    for (const v of [0, 4, 8, 12]) {
      const tick = svg('text', {
        x: AX - 12,
        y: r1(y(v) + 8),
        'text-anchor': 'end',
        'data-df-role': 'tick',
        style: 'fill: var(--muted); font-size: 24px',
      }, chart);
      tick.textContent = String(v);
    }

    // X axis ticks sit at real dates, so the spacing is the spacing of time.
    const ticks = [
      ['2023-11-06', '2023 年 11 月', 'start'],
      ['2025-01-01', '2025 年', 'middle'],
      ['2026-01-01', '2026 年', 'middle'],
      ['2026-09-30', '2026 年 9 月', 'end'],
    ];
    for (const [date, text, anchor] of ticks) {
      const tick = svg('text', {
        x: r1(x(date)),
        y: 536,
        'text-anchor': anchor,
        'data-df-role': 'tick',
        style: 'fill: var(--muted); font-size: 24px',
      }, chart);
      tick.textContent = text;
    }

    const legend = svg('text', {
      x: X0,
      y: 30,
      style: 'fill: var(--muted); font-size: 28px',
    }, chart);
    legend.textContent = '实心点为官方披露，空心点为媒体报道';

    const pts = items.map((it) => ({ ...it, px: x(it.date), py: y(it.value) }));
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].px - pts[i - 1].px, pts[i].py - pts[i - 1].py);

    const path = svg('path', {
      d: pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p.px)} ${r1(p.py)}`).join(' '),
      fill: 'none',
      style: 'stroke: var(--accent); stroke-width: 4; stroke-linejoin: round; stroke-linecap: round',
    }, chart);
    path.style.strokeDasharray = String(r1(length));
    path.style.strokeDashoffset = String(r1(length));

    const marks = [];
    const labels = [];
    pts.forEach((p, i) => {
      const media = p.by === '媒体';
      const dot = svg('circle', {
        cx: r1(p.px),
        cy: r1(p.py),
        r: media ? 9 : 8,
        'data-df-value': String(p.value),
        'data-df-group': 'wau',
        style: media
          ? 'fill: var(--bg); stroke: var(--accent); stroke-width: 4; opacity: 0'
          : 'fill: var(--accent); opacity: 0',
      }, chart);
      // The first point sits on the y axis: its label goes to the right of the dot,
      // clear of the axis. All others sit above-left, where a rising line never runs.
      const value = svg('text', {
        x: r1(i === 0 ? p.px + 14 : p.px - 18),
        y: r1(p.py - 20),
        'text-anchor': i === 0 ? 'start' : 'end',
        style: 'fill: var(--text); font-size: 28px; font-weight: 700; opacity: 0',
      }, chart);
      value.textContent = String(p.value);
      marks.push(dot);
      labels.push(value);
    });

    return (t) => {
      const draw = ease((t - 0.25) / 3);
      path.style.strokeDashoffset = String(r1(length * (1 - draw)));
      pts.forEach((_, i) => {
        const on = String(ease((t - (0.55 + i * 0.2)) / 0.45));
        marks[i].style.opacity = on;
        labels[i].style.opacity = on;
      });
    };
  },
};
