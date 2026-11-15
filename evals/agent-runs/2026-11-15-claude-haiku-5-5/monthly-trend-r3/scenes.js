// scenes.js — 折线图场景（内置场景没有折线图）
export default {
  line(scene, root, kit) {
    const { svg, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640, H = 560;
    const L = 130, R = 40, T = 30, B = 70;
    const pw = W - L - R, ph = H - T - B;
    const VMAX = 600;
    const data = scene.series;
    const n = data.length;
    const x = (i) => L + i * (pw / (n - 1));
    const y = (v) => T + ph * (1 - v / VMAX);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // 刻度与网格（不是事实，标 tick）
    for (let v = 0; v <= VMAX; v += 100) {
      svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), style: 'stroke: var(--track); stroke-width: 2' }, chart);
      const tl = svg('text', {
        x: L - 16, y: y(v) + 8, 'text-anchor': 'end',
        'data-df-role': 'tick', style: 'fill: var(--muted); font-size: 22px',
      }, chart);
      tl.textContent = fmt(v);
    }
    data.forEach((d, i) => {
      const tl = svg('text', {
        x: x(i), y: T + ph + 46, 'text-anchor': 'middle',
        'data-df-role': 'tick', style: 'fill: var(--muted); font-size: 22px',
      }, chart);
      tl.textContent = d.label;
    });

    const path = svg('path', {
      fill: 'none',
      style: 'stroke: var(--accent); stroke-width: 6; stroke-linejoin: round; stroke-linecap: round',
    }, chart);

    const dots = data.map((d, i) => svg('circle', {
      cx: x(i), cy: y(d.value), r: 9,
      'data-df-value': d.value, 'data-df-group': 'monthly',
      style: 'fill: var(--accent); opacity: 0',
    }, chart));

    // 标注：1月、9月、10月、全年最高（11月）。k 是对应旁白的句序号。
    const marks = [
      { i: 0, k: 0, dx: 16, dy: -20, anchor: 'start', text: () => fmt(data[0].value) },
      { i: 8, k: 1, dx: 16, dy: 40, anchor: 'start', text: () => fmt(data[8].value) },
      { i: 9, k: 2, dx: -16, dy: -22, anchor: 'end', text: () => fmt(data[9].value) },
      { i: 10, k: 3, dx: -16, dy: -22, anchor: 'end', text: () => '最高 ' + fmt(data[10].value) },
    ];
    const labels = marks.map((m) => {
      const el = svg('text', {
        x: x(m.i) + m.dx, y: y(data[m.i].value) + m.dy, 'text-anchor': m.anchor,
        style: 'fill: var(--text); font-size: 28px; font-weight: 700; opacity: 0',
      }, chart);
      el.textContent = m.text();
      return el;
    });

    // 画面进度：点 0、8、9、10、11 分别在第 0、1、2、3、4 句旁白开始时到达，中间线性过渡。
    return (t, lines) => {
      const s = (k) => (lines[k] ? lines[k].start : lines[lines.length - 1].start);
      const anchors = [[0, s(0)], [8, s(1)], [9, s(2)], [10, s(3)], [11, s(4)]];
      let cur = 0;
      if (t > anchors[0][1]) {
        cur = anchors[anchors.length - 1][0];
        for (let k = 1; k < anchors.length; k++) {
          const [ia, ta] = anchors[k - 1];
          const [ib, tb] = anchors[k];
          if (t <= tb) {
            cur = ia + (ib - ia) * (tb > ta ? (t - ta) / (tb - ta) : 1);
            break;
          }
        }
      }
      cur = Math.min(cur, n - 1);

      // 折线：画到当前进度
      const whole = Math.floor(cur);
      let d = '';
      for (let i = 0; i <= whole; i++) {
        d += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(data[i].value).toFixed(1) + ' ';
      }
      if (whole < n - 1 && cur > whole) {
        const f = cur - whole;
        const xi = x(whole) + (x(whole + 1) - x(whole)) * f;
        const yi = y(data[whole].value) + (y(data[whole + 1].value) - y(data[whole].value)) * f;
        d += 'L' + xi.toFixed(1) + ' ' + yi.toFixed(1);
      }
      path.setAttribute('d', d.trim());

      // 数据点：到达后淡入
      dots.forEach((el, i) => {
        el.style.opacity = String(clamp((cur - i) * 4));
      });

      // 标注：对应旁白开始后淡入
      marks.forEach((m, j) => {
        const a = clamp((t - s(m.k)) / 0.4);
        labels[j].style.opacity = String(a);
      });
    };
  },
};
