// 折线图场景：简报要求逐月走势必须是折线图，内置场景里没有。
export default {
  line(scene, root, kit) {
    const { svg, ease, clamp, chartHead } = kit;
    chartHead(scene, root); // 标题和副标题

    const data = scene.series; // [{label, value}]，数据引用已经填好
    const n = data.length;
    const W = 1640;
    const H = 520;
    const padL = 130;
    const padR = 60;
    const padT = 60;
    const padB = 70;
    const cw = W - padL - padR;
    const ch = H - padT - padB;
    const yMax = 700;
    const X = (i) => padL + (cw * i) / (n - 1);
    const Y = (v) => padT + ch * (1 - v / yMax);

    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);

    // 刻度（不是事实，标为 tick）
    [0, 200, 400, 600].forEach((v) => {
      svg('line', {
        x1: padL, x2: W - padR, y1: Y(v), y2: Y(v),
        style: 'stroke: var(--track); stroke-width: 2;',
      }, s);
      const tl = svg('text', {
        x: padL - 16, y: Y(v) + 8, 'text-anchor': 'end',
        'data-df-role': 'tick',
        style: 'fill: var(--muted); font-size: 22px;',
      }, s);
      tl.textContent = String(v);
    });

    // 月份标签（刻度）
    data.forEach((d, i) => {
      const tx = svg('text', {
        x: X(i), y: H - padB + 44, 'text-anchor': 'middle',
        'data-df-role': 'tick',
        style: 'fill: var(--muted); font-size: 22px;',
      }, s);
      tx.textContent = d.label;
    });

    // 折线
    const pathD = data
      .map((d, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(d.value).toFixed(1))
      .join(' ');
    const line = svg('path', {
      d: pathD,
      style: 'fill: none; stroke: var(--accent); stroke-width: 6; stroke-linejoin: round; stroke-linecap: round;',
    }, s);
    const total = line.getTotalLength();
    line.style.strokeDasharray = String(total);

    // 数据点：每个点都标 data-df-value
    // 标数值的点：索引 -> 对应旁白句（1月、6月、12月）
    const labeled = { 0: 1, 5: 2, 11: 3 };
    const dots = data.map((d, i) => svg('circle', {
      cx: X(i), cy: Y(d.value), r: i in labeled ? 12 : 7,
      'data-df-value': String(d.value),
      style: 'fill: var(--accent);',
    }, s));

    // 数值标签：陡升处放在点的左上方
    const addLabel = (i, anchor, dx, dy) => {
      const el = svg('text', {
        x: X(i) + dx, y: Y(data[i].value) + dy, 'text-anchor': anchor,
        style: 'fill: var(--text); font-size: 30px; font-weight: 600;',
      }, s);
      el.textContent = String(data[i].value);
      el.style.opacity = '0';
      return el;
    };
    const labelEls = {
      0: addLabel(0, 'middle', 0, -26),
      5: addLabel(5, 'middle', 0, -26),
      11: addLabel(11, 'end', -18, -22),
    };

    return (t, lines) => {
      // 折线在第一句旁白期间画完
      const s0 = lines[0] ? lines[0].start : 0;
      const e0 = lines[0] ? lines[0].end : s0 + 3;
      const p = clamp((t - s0) / Math.max(0.01, e0 - s0));
      line.style.strokeDashoffset = String(total * (1 - ease(p)));
      const k = p * (n - 1);

      dots.forEach((c, i) => {
        if (i in labeled) {
          const L = lines[labeled[i]];
          const o = L ? clamp((t - L.start) / 0.4) : 0;
          c.style.opacity = String(o);
          labelEls[i].style.opacity = String(o);
        } else {
          c.style.opacity = String(clamp((k - i) * 2));
        }
      });
    };
  },
};
