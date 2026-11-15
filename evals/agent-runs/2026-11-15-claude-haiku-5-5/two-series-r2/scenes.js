// scenes.js：增加一个折线图场景。内置场景里没有折线图。
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, chartHead } = kit;
    chartHead(scene, root);

    const W = 1640;
    const H = 560;
    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    const x0 = 130;
    const x1 = 1280;
    const top = 30;
    const bottom = 500;
    const ymax = 250;
    const X = (i) => x0 + (i * (x1 - x0)) / 11;
    const Y = (v) => bottom - (v / ymax) * (bottom - top);

    const code = scene.code; // [{label, value}]
    const model = scene.model;
    const names = scene.names; // {code, model}

    // 刻度线和刻度数字
    for (const v of [0, 50, 100, 150, 200, 250]) {
      svg('line', {
        x1: x0, x2: x1, y1: Y(v), y2: Y(v),
        style: 'stroke: var(--track); stroke-width: 2px',
      }, chart);
      const tk = svg('text', {
        x: x0 - 18, y: Y(v) + 8, 'text-anchor': 'end', 'data-df-role': 'tick',
        style: 'fill: var(--muted); font-size: 22px',
      }, chart);
      tk.textContent = String(v);
    }

    // 月份标签
    code.forEach((d, i) => {
      const tx = svg('text', {
        x: X(i), y: bottom + 40, 'text-anchor': 'middle', 'data-df-role': 'tick',
        style: 'fill: var(--muted); font-size: 22px',
      }, chart);
      tx.textContent = d.label;
    });

    const mkSeries = (rows, color, group) => {
      const d = rows.map((r, i) => `${i ? 'L' : 'M'} ${X(i)} ${Y(r.value)}`).join(' ');
      const path = svg('path', {
        d, fill: 'none',
        style: `stroke: ${color}; stroke-width: 6px; stroke-linejoin: round; stroke-linecap: round`,
      }, chart);
      const len = path.getTotalLength();
      path.style.strokeDasharray = `${len}px`;
      const dots = rows.map((r, i) => svg('circle', {
        cx: X(i), cy: Y(r.value), r: 8,
        'data-df-value': r.value, 'data-df-group': group,
        style: `fill: ${color}`,
      }, chart));
      return { path, len, dots };
    };

    const cs = mkSeries(code, 'var(--accent)', 'code');
    const ms = mkSeries(model, 'var(--text)', 'model');

    const tag = (txt, x, y, color, anchor) => {
      const el = svg('text', {
        x, y, 'text-anchor': anchor || 'middle',
        style: `fill: ${color}; font-size: 28px`,
      }, chart);
      el.textContent = txt;
      el.style.opacity = 0;
      return el;
    };

    // 线的名字，写在线的末端
    const nameCode = tag(names.code, X(11) + 26, Y(code[11].value) + 10, 'var(--accent)', 'start');
    const nameModel = tag(names.model, X(11) + 26, Y(model[11].value) + 10, 'var(--text)', 'start');

    // 8 月反超：两个数字和标题
    const cAug = tag(String(code[7].value), X(7) - 14, Y(code[7].value) - 16, 'var(--accent)', 'end');
    const mAug = tag(String(model[7].value), X(7), Y(model[7].value) + 44, 'var(--text)', 'middle');
    const hlAug = tag('8 月反超', X(7), Y(code[7].value) - 70, 'var(--text)', 'middle');

    // 12 月：两个数字
    const cDec = tag(String(code[11].value), X(11), Y(code[11].value) - 22, 'var(--accent)', 'middle');
    const mDec = tag(String(model[11].value), X(11), Y(model[11].value) + 44, 'var(--text)', 'middle');

    return (t, lines) => {
      const reveal = lines[1];
      const p = clamp((t - reveal.start) / (reveal.end - reveal.start));
      const e = ease(p);
      for (const s of [cs, ms]) {
        s.path.style.strokeDashoffset = `${s.len * (1 - e)}px`;
        s.dots.forEach((dot, i) => {
          dot.style.opacity = e * 11 >= i ? 1 : 0;
        });
      }
      const fade = (el, start) => {
        el.style.opacity = clamp((t - start) / 0.6);
      };
      fade(nameCode, reveal.start);
      fade(nameModel, reveal.start);
      fade(cAug, lines[2].start);
      fade(mAug, lines[2].start);
      fade(hlAug, lines[2].start);
      fade(cDec, lines[3].start);
      fade(mDec, lines[3].start);
    };
  },
};
