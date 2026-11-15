// Scene code for this film: a line chart over the months of a year, with a month that has no data.
// A builder creates its DOM once and returns update(t), which sets every style from t alone.
export default {
  gapline(scene, root, kit) {
    const { svg, ease, clamp, fmt, chartHead } = kit;
    chartHead(scene, root);
    const items = scene.series;
    const labelled = new Set(scene.labels || []);
    const W = 1640;
    const H = 560;
    const box = { left: 110, right: 1500, top: 60, bottom: 470 };
    const known = items.filter((it) => it.value != null);
    const top = Math.ceil(Math.max(...known.map((it) => it.value)) / 200) * 200;
    const x = (i) => box.left + (i * (box.right - box.left)) / (items.length - 1);
    const y = (v) => box.bottom - (v / top) * (box.bottom - box.top);

    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'margin-top: 20px' }, root);

    // Grid lines and axis labels are scale furniture, not facts.
    const axis = svg('g', { 'data-df-role': 'tick' }, chart);
    for (let k = 0; k <= 4; k++) {
      const v = (top * k) / 4;
      svg('line', { x1: box.left, x2: box.right, y1: y(v), y2: y(v), style: 'stroke: var(--track); stroke-width: 2' }, axis);
      svg('text', { x: box.left - 18, y: y(v) + 9, 'text-anchor': 'end', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = fmt(v);
    }
    items.forEach((it, i) => {
      svg('text', { x: x(i), y: box.bottom + 50, 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = it.label;
    });

    // A month without a value breaks the line: each unbroken run of months is drawn as its own line.
    const runs = [];
    items.forEach((it, i) => {
      if (it.value == null) return;
      if (i > 0 && items[i - 1].value != null) runs.at(-1).push(i);
      else runs.push([i]);
    });
    const clipId = `reveal-${scene.id}`;
    const clip = svg('rect', { x: 0, y: 0, width: 0, height: H }, svg('clipPath', { id: clipId }, svg('defs', {}, chart)));
    for (const run of runs) {
      svg('polyline', {
        points: run.map((i) => `${x(i)},${y(items[i].value)}`).join(' '),
        'clip-path': `url(#${clipId})`,
        style: 'fill: none; stroke: var(--accent); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round',
      }, chart);
    }

    const points = [];
    items.forEach((it, i) => {
      if (it.value == null) {
        // The gap says why it is a gap, in the words the data gives.
        const before = items[i - 1]?.value ?? items[i + 1]?.value;
        const after = items[i + 1]?.value ?? before;
        const note = svg('text', { x: x(i), y: y((before + after) / 2) - 70, 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 30px' }, chart);
        note.textContent = it.note || '';
        points.push({ label: note, at: x(i) });
        return;
      }
      const hot = it.label === scene.highlight;
      const dot = svg('circle', { cx: x(i), cy: y(it.value), r: hot ? 12 : 8, 'data-df-value': it.value, style: `fill: var(${hot ? '--accent' : '--text'})` }, chart);
      let label = null;
      if (labelled.has(it.label)) {
        // The first label starts at its point so it stays clear of the axis numbers; the last one sits past the line's end.
        const last = i === items.length - 1;
        const at = last ? { x: x(i) + 22, y: y(it.value) + 12, anchor: 'start' } : { x: i === 0 ? x(i) + 6 : x(i), y: y(it.value) - 26, anchor: i === 0 ? 'start' : 'middle' };
        label = svg('text', { x: at.x, y: at.y, 'text-anchor': at.anchor, style: `fill: var(${hot ? '--accent' : '--text'}); font-size: 36px; font-weight: 700` }, chart);
        label.textContent = fmt(it.value);
      }
      points.push({ dot, label, at: x(i) });
    });

    return (t) => {
      axis.style.opacity = String(ease((t - 0.2) / 0.5));
      const edge = box.left - 20 + ease((t - 0.5) / 1.8) * (box.right - box.left + 40);
      clip.setAttribute('width', String(Math.max(0, edge)));
      for (const p of points) {
        const shown = clamp((edge - p.at) / 24);
        if (p.dot) p.dot.style.opacity = String(shown);
        if (p.label) p.label.style.opacity = String(shown);
      }
    };
  },
};
