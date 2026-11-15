// scenes.js：折线图场景，两条线同时画，标出 8 月反超和 12 月两类的数量
function posAt(t, k, clamp) {
  if (t <= k[0][1]) return k[0][0];
  for (let j = 0; j < k.length - 1; j++) {
    const [i0, t0] = k[j];
    const [i1, t1] = k[j + 1];
    if (t <= t1) return i0 + (i1 - i0) * clamp((t - t0) / (t1 - t0));
  }
  return k[k.length - 1][0];
}

export default {
  line(scene, root, kit) {
    const { svg, clamp, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const L = 150;
    const R = 1560;
    const T = 30;
    const B = 480;
    const MAX = 300;
    const x = (i) => L + (i * (R - L)) / 11;
    const y = (v) => B - (v / MAX) * (B - T);

    const host = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    const series = {
      code: { name: scene.names.code, data: scene.code, color: 'var(--accent)' },
      model: { name: scene.names.model, data: scene.model, color: 'var(--text)' },
    };

    // 网格和刻度（刻度不是事实，标 tick）
    for (const v of [100, 200, 300]) {
      svg('line', { x1: L, x2: R, y1: y(v), y2: y(v), style: 'stroke: var(--track); stroke-width: 2' }, host);
    }
    for (const v of [0, 100, 200, 300]) {
      const tx = svg('text', { x: L - 16, y: y(v) + 8, 'text-anchor': 'end', 'data-df-role': 'tick', style: 'font-size: 22px; fill: var(--muted)' }, host);
      tx.textContent = String(v);
    }
    scene.code.forEach((d, i) => {
      const tx = svg('text', { x: x(i), y: B + 40, 'text-anchor': 'middle', 'data-df-role': 'tick', style: 'font-size: 22px; fill: var(--muted)' }, host);
      tx.textContent = d.label;
    });

    // 图例：两条线的名字
    const legend = [
      ['code', 70],
      ['model', 120],
    ];
    for (const [key, yy] of legend) {
      svg('line', { x1: L + 10, x2: L + 60, y1: yy - 10, y2: yy - 10, style: `stroke: ${series[key].color}; stroke-width: 6` }, host);
      const tx = svg('text', { x: L + 75, y: yy, style: 'font-size: 28px; fill: var(--text)' }, host);
      tx.textContent = series[key].name;
    }

    // 折线和数据点
    const lineEls = {};
    const dots = {};
    for (const key of ['code', 'model']) {
      lineEls[key] = svg('polyline', {
        fill: 'none',
        stroke: series[key].color,
        'stroke-width': 6,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        points: '',
      }, host);
      dots[key] = series[key].data.map((d, i) => svg('circle', {
        cx: x(i),
        cy: y(d.value),
        r: 9,
        'data-df-value': d.value,
        'data-df-group': key,
        style: `fill: ${series[key].color}`,
        opacity: 0,
      }, host));
    }

    // 8 月、12 月的数量标注
    const callouts = [
      { at: 3, text: `${series.code.name} ${series.code.data[7].value}件`, x: x(7) - 22, y: y(series.code.data[7].value) - 30, anchor: 'end' },
      { at: 3, text: `${series.model.name} ${series.model.data[7].value}件`, x: x(7) + 22, y: y(series.model.data[7].value) + 58, anchor: 'start' },
      { at: 4, text: `${series.code.name} ${series.code.data[11].value}件`, x: x(11) + 8, y: y(series.code.data[11].value) - 30, anchor: 'end' },
      { at: 4, text: `${series.model.name} ${series.model.data[11].value}件`, x: x(11) + 8, y: y(series.model.data[11].value) + 52, anchor: 'end' },
    ].map((c) => {
      const el = svg('text', { x: c.x, y: c.y, 'text-anchor': c.anchor, opacity: 0, style: 'font-size: 28px; fill: var(--text)' }, host);
      el.textContent = c.text;
      return { ...c, el };
    });

    // 每一帧只由 t 决定：绘制进度按旁白句的开始时间分段推进
    const knotsFor = (ls) => [
      [0, 0],
      [6, ls[2].start],
      [7, ls[3].start],
      [11, ls[4].start + 0.8],
    ];

    return (t, ls) => {
      const cur = posAt(t, knotsFor(ls), clamp);
      for (const key of ['code', 'model']) {
        const data = series[key].data;
        const n = Math.floor(cur);
        const pts = [];
        for (let i = 0; i <= n; i++) pts.push(`${x(i)},${y(data[i].value)}`);
        if (n < data.length - 1) {
          const f = cur - n;
          const a = data[n].value;
          const b = data[n + 1].value;
          pts.push(`${x(n) + (x(n + 1) - x(n)) * f},${y(a + (b - a) * f)}`);
        }
        lineEls[key].setAttribute('points', pts.join(' '));
        dots[key].forEach((c, i) => c.setAttribute('opacity', i <= cur ? 1 : 0));
      }
      for (const c of callouts) {
        c.el.setAttribute('opacity', clamp((t - ls[c.at].start) / 0.5));
      }
    };
  },
};
