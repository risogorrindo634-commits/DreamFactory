// 折线图场景：6 月没有数据，折线在那里断开，并标出缺失的备注。
export default {
  line(scene, root, kit) {
    const { svg, clamp, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    const T = 60; // 绘图区顶部
    const B = 500; // 基线（0）
    const MAX = 800;
    const yOf = (v) => T + ((MAX - v) * (B - T)) / MAX;
    const xOf = (i) => 170 + i * 127;
    const series = scene.series;

    // 刻度线与刻度（不是事实，标 tick）
    for (const v of [0, 200, 400, 600, 800]) {
      const y = yOf(v);
      svg('line', {
        x1: 150, x2: 1600, y1: y, y2: y,
        style: `stroke:${v === 0 ? 'var(--muted)' : 'var(--track)'};stroke-width:2`,
      }, chart);
      const tx = svg('text', {
        x: 128, y: y + 8, 'text-anchor': 'end', 'data-df-role': 'tick',
        style: 'fill:var(--muted);font-size:24px',
      }, chart);
      tx.textContent = String(v);
    }

    // 月份刻度
    series.forEach((d, i) => {
      const tx = svg('text', {
        x: xOf(i), y: 534, 'text-anchor': 'middle', 'data-df-role': 'tick',
        style: 'fill:var(--muted);font-size:24px',
      }, chart);
      tx.textContent = d.label;
    });

    // 折线段与数据点：缺失的点不画，段也不跨过缺口
    const segs = [];
    const dots = [];
    series.forEach((d, i) => {
      if (d.value == null) return;
      if (i > 0 && series[i - 1].value != null) {
        const seg = svg('line', {
          x1: xOf(i - 1), y1: yOf(series[i - 1].value), x2: xOf(i), y2: yOf(d.value),
          style: 'stroke:var(--accent);stroke-width:5;stroke-linecap:round',
        }, chart);
        segs.push({ el: seg, i });
      }
      const dot = svg('circle', {
        cx: xOf(i), cy: yOf(d.value), r: 9,
        style: 'fill:var(--accent)',
        'data-df-value': String(d.value),
      }, chart);
      dots.push({ el: dot, i });
    });

    // 1 月与 12 月的数值标签
    const first = svg('text', {
      x: xOf(0), y: yOf(series[0].value) + 44, 'text-anchor': 'middle',
      style: 'fill:var(--text);font-size:28px',
    }, chart);
    first.textContent = `${series[0].value} 人`;

    const last = svg('text', {
      x: xOf(11) - 18, y: yOf(series[11].value) - 14, 'text-anchor': 'end',
      style: 'fill:var(--text);font-size:28px',
    }, chart);
    last.textContent = `${series[11].value} 人`;

    // 缺口处的备注（来自 data.json）
    const gap = svg('text', {
      x: xOf(5), y: yOf(300), 'text-anchor': 'middle',
      style: 'fill:var(--muted);font-size:28px',
    }, chart);
    gap.textContent = scene.gap;

    // 每一帧只由 t 和旁白时间决定
    return (t, lines) => {
      const fade = (t0) => clamp((t - t0) / 0.35);
      const reveal = (i) => {
        if (i === 0) return 0;
        if (i <= 4) {
          const d = Math.max(0.1, lines[1].end - lines[1].start);
          return lines[1].start + ((i - 1) / 4) * d;
        }
        if (i <= 10) {
          const d = Math.max(0.1, lines[4].end - lines[4].start);
          return lines[4].start + ((i - 6) / 5) * d;
        }
        return Math.max(0, lines[5].start - 0.4);
      };
      for (const s of segs) s.el.style.opacity = fade(reveal(s.i));
      for (const p of dots) p.el.style.opacity = fade(reveal(p.i));
      first.style.opacity = fade(0);
      last.style.opacity = fade(reveal(11));
      gap.style.opacity = fade(lines[2].start);
    };
  },
};
