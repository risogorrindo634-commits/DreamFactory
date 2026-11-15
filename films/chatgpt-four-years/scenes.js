// Scene code for this film. Every scene is built once and then drawn from the time alone:
// update(t, lines) gets the seconds since the scene began and the timing of its narration lines,
// so each picture change lands on the line that speaks of it.
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const out3 = (x) => 1 - (1 - x) ** 3;
const overshoot = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const css = (el, style) => Object.assign(el.style, style) && el;
const show = (el, p, dy = 36) => css(el, { opacity: String(p), transform: `translateY(${(1 - p) * dy}px)` });
const pop = (el, p) => css(el, { opacity: String(Math.min(1, p * 3)), transform: `scale(${p <= 0 ? 0.6 : 0.6 + 0.4 * overshoot(p)})` });
const startOf = (lines, i) => (lines[i] ? lines[i].start : 0);
const endOf = (lines, i) => (lines[i] ? lines[i].end : 0);

/** A full-frame layer to place things on, with a slow drifting glow so no frame is ever quite still. */
function canvas(root, kit, tint = '52, 211, 153') {
  root.style.padding = '0';
  const glow = css(kit.h('div', '', null, root), { position: 'absolute', left: '0', top: '0', width: '1920px', height: '1080px' });
  const layer = css(kit.h('div', '', null, root), { position: 'absolute', left: '0', top: '0', width: '1920px', height: '880px' });
  const put = (style, text, parent = layer) => css(kit.h('div', '', text ?? null, parent), { position: 'absolute', ...style });
  const drift = (t) => {
    glow.style.background = `radial-gradient(1000px 640px at ${52 + 26 * Math.sin(0.33 * t)}% ${34 + 10 * Math.cos(0.27 * t)}%, rgba(${tint}, 0.11), rgba(${tint}, 0) 72%)`;
  };
  return { put, drift };
}
/** Where a number comes from, in small type under the picture. */
const footnote = (put, text) => css(put({ left: '140px', top: '800px', fontSize: '24px', color: 'var(--muted)', whiteSpace: 'nowrap' }, text), {}).setAttribute('data-df-role', 'source');

export default {
  // The post that announced the first million users, typed out as the line is spoken.
  tweet(scene, root, kit) {
    const { put, drift } = canvas(root, kit);
    const date = put({ left: '140px', top: '96px', fontSize: '44px', color: 'var(--accent)', letterSpacing: '4px', fontWeight: '700' }, scene.date);
    const head = put({ left: '140px', top: '160px', fontSize: '96px', fontWeight: '800', whiteSpace: 'nowrap' }, scene.headline);
    const card = put({ left: '140px', top: '380px', width: '1130px', height: '330px', borderRadius: '28px', background: '#161d27', border: '2px solid #2a3542' });
    put({ left: '40px', top: '40px', width: '84px', height: '84px', borderRadius: '50%', background: 'linear-gradient(135deg, #34d399, #0e7490)' }, null, card);
    put({ left: '150px', top: '38px', fontSize: '36px', fontWeight: '700', whiteSpace: 'nowrap' }, scene.by, card);
    put({ left: '150px', top: '88px', fontSize: '28px', color: 'var(--muted)', whiteSpace: 'nowrap' }, `${scene.handle} · ${scene.tweetDate}`, card);
    const typed = put({ left: '40px', top: '168px', width: '1050px', fontSize: '42px', lineHeight: '58px' }, '', card);
    const caret = put({ left: '0', top: '0', width: '4px', height: '46px', background: 'var(--accent)' }, null, card);
    const stamp = put({ left: '1360px', top: '330px', width: '420px', height: '400px' });
    put({ left: '0', top: '0', fontSize: '40px', color: 'var(--muted)', whiteSpace: 'nowrap' }, '上线第', stamp);
    const dayRow = put({ left: '0', top: '78px', whiteSpace: 'nowrap' }, null, stamp);
    css(kit.h('span', '', String(scene.day), dayRow), { fontSize: '230px', fontWeight: '800', color: 'var(--accent)', lineHeight: '230px' });
    css(kit.h('span', '', '天', dayRow), { fontSize: '64px', fontWeight: '700', marginLeft: '18px' });
    put({ left: '0', top: '330px', fontSize: '52px', fontWeight: '700', whiteSpace: 'nowrap' }, scene.users, stamp);
    const text = scene.tweet;
    return (t, lines) => {
      drift(t);
      show(date, out3(seg(t, 0.05, 0.45)));
      show(head, out3(seg(t, 0.15, 0.6)));
      const second = startOf(lines, 1);
      const third = startOf(lines, 2);
      show(card, out3(seg(t, second - 0.3, second + 0.1)), 60);
      // Typing: so many characters by now. Half-typed text is not a fact to be checked or read in full.
      const n = Math.round(text.length * seg(t, second + 0.1, second + 1.1));
      typed.textContent = text.slice(0, n);
      if (n < text.length) typed.dataset.dfRole = 'animating';
      else delete typed.dataset.dfRole;
      caret.style.opacity = n < text.length ? '0' : String(Math.floor(t / 0.45) % 2);
      css(caret, { left: '40px', top: '236px' });
      pop(stamp, seg(t, third, third + 0.45));
    };
  },

  // How long each product took to reach the same number of users. One clock runs for all three bars.
  race(scene, root, kit) {
    const { put, drift } = canvas(root, kit);
    const items = scene.series;
    const longest = Math.max(...items.map((it) => it.value));
    const head = put({ left: '140px', top: '96px', fontSize: '80px', fontWeight: '800', whiteSpace: 'nowrap' }, scene.title);
    const left = 520;
    const full = 1000;
    const rows = items.map((it, i) => {
      const top = 290 + i * 150;
      const label = put({ left: '140px', top: `${top}px`, width: '340px', fontSize: '52px', fontWeight: i === 0 ? '800' : '500', color: i === 0 ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap', lineHeight: '72px' }, it.label);
      const bar = put({ left: `${left}px`, top: `${top + 8}px`, width: '0', height: '56px', borderRadius: '28px', background: i === 0 ? 'var(--accent)' : 'var(--bar)' });
      bar.dataset.dfValue = String(it.value);
      const value = put({ left: '0', top: `${top}px`, fontSize: '52px', fontWeight: '800', whiteSpace: 'nowrap', lineHeight: '72px' }, '');
      return { it, label, bar, value };
    });
    const badge = scene.badge ? put({ left: '1060px', top: '252px', fontSize: '130px', fontWeight: '800', color: 'var(--accent)', lineHeight: '150px', whiteSpace: 'nowrap' }, scene.badge) : null;
    footnote(put, scene.note);
    return (t, lines) => {
      drift(t);
      show(head, out3(seg(t, 0.05, 0.5)));
      // The clock: each line of narration carries it to the next product's finishing time.
      let months = 0;
      items.forEach((it, i) => {
        const from = i ? items[i - 1].value : 0;
        months = Math.max(months, from + (it.value - from) * out3(seg(t, startOf(lines, i) + 0.1, endOf(lines, i) - 0.3)));
      });
      if (badge) pop(badge, seg(t, startOf(lines, items.length), startOf(lines, items.length) + 0.45));
      rows.forEach((r, i) => {
        show(r.label, out3(seg(t, 0.2 + i * 0.12, 0.6 + i * 0.12)), 0);
        const now = Math.min(months, r.it.value);
        const done = months >= r.it.value;
        r.bar.style.width = `${Math.max(56, (now / longest) * full)}px`;
        r.bar.style.opacity = months > 0 ? '1' : '0';
        r.value.style.left = `${left + Math.max(56, (now / longest) * full) + 24}px`;
        r.value.textContent = `${done ? r.it.value : Math.floor(now)} ${scene.unit}`;
        r.value.style.opacity = months > 0 ? '1' : '0';
        r.value.style.color = done && i === 0 ? 'var(--accent)' : 'var(--text)';
        if (done) delete r.value.dataset.dfRole;
        else r.value.dataset.dfRole = 'animating';
      });
    };
  },

  // The incumbents react: one report, then three launches within four months.
  shock(scene, root, kit) {
    const { put, drift } = canvas(root, kit, '248, 113, 113');
    const date = put({ left: '140px', top: '150px', fontSize: '44px', color: '#f87171', letterSpacing: '4px', fontWeight: '700' }, scene.date);
    const head = put({ left: '140px', top: '216px', fontSize: '84px', fontWeight: '800', lineHeight: '120px', whiteSpace: 'nowrap' }, scene.headline);
    const note = put({ left: '140px', top: '370px', fontSize: '34px', color: 'var(--muted)', whiteSpace: 'nowrap' }, scene.note);
    const cards = scene.rivals.map((r, i) => {
      const card = put({ left: '1040px', top: `${150 + i * 190}px`, width: '740px', height: '160px', borderRadius: '24px', background: '#161d27', border: '2px solid #2a3542' });
      put({ left: '40px', top: '26px', fontSize: '30px', color: 'var(--muted)', letterSpacing: '2px', whiteSpace: 'nowrap' }, r.date, card);
      put({ left: '40px', top: '70px', fontSize: '50px', fontWeight: '700', whiteSpace: 'nowrap' }, `${r.by} · ${r.label}`, card);
      return card;
    });
    return (t, lines) => {
      drift(t);
      show(date, out3(seg(t, 0.05, 0.4)));
      show(head, out3(seg(t, 0.15, 0.6)));
      show(note, out3(seg(t, 0.5, 0.9)), 0);
      // A slow pulse on the headline while its line is spoken, then it settles.
      const alarm = seg(t, 0.4, endOf(lines, 0)) < 1 ? 0.5 + 0.5 * Math.sin(7 * t) : 0;
      head.style.textShadow = `0 0 ${Math.round(40 * alarm)}px rgba(248, 113, 113, ${(0.55 * alarm).toFixed(3)})`;
      const second = startOf(lines, 1);
      cards.forEach((card, i) => {
        const p = out3(seg(t, second + i * 0.4, second + i * 0.4 + 0.45));
        css(card, { opacity: String(p), transform: `translateX(${(1 - p) * 120}px)` });
      });
    };
  },

  // Weekly users on a real time axis, drawn as the narration goes.
  rise(scene, root, kit) {
    const { put, drift } = canvas(root, kit);
    const { svg, fmt } = kit;
    const items = scene.series;
    const head = put({ left: '140px', top: '80px', fontSize: '72px', fontWeight: '800', whiteSpace: 'nowrap' }, scene.title);
    const W = 1640;
    const H = 600;
    const box = { left: 110, right: 1500, top: 100, bottom: 510 };
    // A calendar date as a day count, worked out from the date itself. No clock is involved.
    const dayNumber = (iso) => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      const a = Math.floor((14 - mm) / 12);
      const y = yy + 4800 - a;
      const m = mm + 12 * a - 3;
      return dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    };
    const first = dayNumber(scene.from);
    const last = dayNumber(scene.to);
    const top = Math.ceil(Math.max(...items.map((it) => it.value)) / 3) * 3;
    const x = (iso) => box.left + ((dayNumber(iso) - first) / (last - first)) * (box.right - box.left);
    const y = (v) => box.bottom - (v / top) * (box.bottom - box.top);
    const holder = put({ left: '140px', top: '180px', width: `${W}px`, height: `${H}px` });
    const chart = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, holder);
    const axis = svg('g', { 'data-df-role': 'tick' }, chart);
    for (let k = 0; k <= 4; k++) {
      const v = (top * k) / 4;
      svg('line', { x1: box.left, x2: box.right, y1: y(v), y2: y(v), style: 'stroke: var(--track); stroke-width: 2' }, axis);
      svg('text', { x: box.left - 18, y: y(v) + 9, 'text-anchor': 'end', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = fmt(v);
    }
    for (let year = Number(scene.from.slice(0, 4)) + 1; year <= Number(scene.to.slice(0, 4)); year++) {
      const at = x(`${year}-01-01`);
      svg('line', { x1: at, x2: at, y1: box.bottom, y2: box.bottom + 12, style: 'stroke: var(--muted); stroke-width: 2' }, axis);
      svg('text', { x: at, y: box.bottom + 50, 'text-anchor': 'middle', style: 'fill: var(--muted); font-size: 26px' }, axis).textContent = String(year);
    }
    const clipId = `reveal-${scene.id}`;
    const clip = svg('rect', { x: 0, y: 0, width: 0, height: H }, svg('clipPath', { id: clipId }, svg('defs', {}, chart)));
    svg('polyline', {
      points: items.map((it) => `${x(it.date)},${y(it.value)}`).join(' '),
      'clip-path': `url(#${clipId})`,
      style: 'fill: none; stroke: var(--accent); stroke-width: 7; stroke-linejoin: round; stroke-linecap: round',
    }, chart);
    const points = items.map((it, i) => {
      const hollow = it.by !== '官方';
      const dot = svg('circle', { cx: x(it.date), cy: y(it.value), r: 10, 'data-df-value': it.value, style: hollow ? 'fill: var(--bg); stroke: var(--accent); stroke-width: 4' : 'fill: var(--accent)' }, chart);
      let label = null;
      if (i === 0 || i === items.length - 1) {
        // The line only ever climbs, so the space above and to the left of a point is always clear of it.
        const big = i > 0;
        label = svg('text', { x: x(it.date) - 18, y: y(it.value) - 22, 'text-anchor': 'end', style: `fill: var(${big ? '--accent' : '--text'}); font-size: ${big ? 64 : 40}px; font-weight: 800` }, chart);
        label.textContent = `${fmt(it.value)} ${scene.unit}`;
      }
      return { dot, label, at: x(it.date) };
    });
    footnote(put, scene.note);
    const start = points[0].at;
    return (t, lines) => {
      drift(t);
      show(head, out3(seg(t, 0.05, 0.45)));
      axis.style.opacity = String(out3(seg(t, 0.1, 0.5)));
      // First line: the line reaches its first point. Second line: it runs the rest of the way.
      const firstLeg = out3(seg(t, 0.3, endOf(lines, 0) - 0.1));
      const secondLeg = out3(seg(t, startOf(lines, 1), endOf(lines, 1) - 0.5));
      const edge = box.left - 20 + (start + 30 - box.left + 20) * firstLeg + (box.right + 30 - start - 30) * secondLeg;
      clip.setAttribute('width', String(Math.max(0, edge)));
      for (const p of points) {
        const on = seg(edge, p.at, p.at + 30);
        p.dot.style.opacity = String(on);
        if (p.label) {
          p.label.style.opacity = String(on);
          p.label.setAttribute('transform', `translate(0, ${(1 - out3(on)) * 20})`);
        }
      }
    };
  },

  // One share of the world, as dots out of a hundred.
  people(scene, root, kit) {
    const { put, drift } = canvas(root, kit);
    const target = Number(String(scene.share).replace('%', ''));
    const dots = [];
    for (let i = 0; i < 100; i++) {
      dots.push(put({ left: `${160 + (i % 10) * 62}px`, top: `${150 + Math.floor(i / 10) * 62}px`, width: '42px', height: '42px', borderRadius: '50%', background: 'var(--track)' }));
    }
    const big = put({ left: '900px', top: '150px', fontSize: '280px', fontWeight: '800', color: 'var(--accent)', lineHeight: '300px', whiteSpace: 'nowrap' }, '');
    const caption = put({ left: '910px', top: '470px', fontSize: '60px', fontWeight: '700', whiteSpace: 'nowrap' }, scene.caption);
    put({ left: '910px', top: '580px', width: '760px', height: '20px', borderRadius: '10px', background: 'var(--track)' });
    const meter = put({ left: '910px', top: '580px', width: '0', height: '20px', borderRadius: '10px', background: 'var(--accent)' });
    meter.dataset.dfValue = String(target);
    footnote(put, scene.note);
    return (t, lines) => {
      drift(t);
      const p = out3(seg(t, 0.25, Math.max(1.2, endOf(lines, 0) - 0.6)));
      const lit = Math.round(target * p);
      dots.forEach((dot, i) => {
        const on = i < lit;
        css(dot, { background: on ? 'var(--accent)' : 'var(--track)', transform: `scale(${on ? 1 : 0.8})`, opacity: String(out3(seg(t, 0.02 + i * 0.004, 0.3 + i * 0.004))) });
      });
      big.textContent = `${lit}%`;
      if (lit < target) big.dataset.dfRole = 'animating';
      else delete big.dataset.dfRole;
      show(big, out3(seg(t, 0.15, 0.5)));
      show(caption, out3(seg(t, 0.3, 0.7)));
      meter.style.width = `${(760 * target * p) / 100}px`;
    };
  },

  // A few values as rising towers, with the ones the narration names picked out.
  towers(scene, root, kit) {
    const { put, drift } = canvas(root, kit);
    const items = scene.series;
    const strong = new Set(scene.strong || []);
    const max = Math.max(...items.map((it) => it.value));
    const head = put({ left: '140px', top: '80px', fontSize: '72px', fontWeight: '800', whiteSpace: 'nowrap' }, scene.title);
    const sub = scene.sub ? put({ left: '140px', top: '176px', fontSize: '34px', color: 'var(--muted)', whiteSpace: 'nowrap' }, scene.sub) : null;
    const base = 690;
    const tall = 390;
    const width = 170;
    const step = scene.badge ? 250 : 330;
    const first = scene.badge ? 160 : 300;
    const cols = items.map((it, i) => {
      const left = first + i * step;
      const bar = put({ left: `${left}px`, top: `${base}px`, width: `${width}px`, height: '0', borderRadius: '14px 14px 0 0', background: strong.has(it.label) ? 'var(--accent)' : 'var(--bar)' });
      bar.dataset.dfValue = String(it.value);
      const value = put({ left: `${left - 40}px`, top: '0', width: `${width + 80}px`, textAlign: 'center', fontSize: '60px', fontWeight: '800', lineHeight: '70px', color: strong.has(it.label) ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap' }, `${kit.fmt(it.value)}${scene.suffix}`);
      const label = put({ left: `${left - 60}px`, top: `${base + 18}px`, width: `${width + 120}px`, textAlign: 'center', fontSize: '34px', color: 'var(--muted)', whiteSpace: 'nowrap' }, it.label);
      return { it, bar, value, label };
    });
    const badge = scene.badge ? put({ left: '1250px', top: '300px', fontSize: '210px', fontWeight: '800', color: 'var(--accent)', lineHeight: '230px', whiteSpace: 'nowrap' }, scene.badge) : null;
    footnote(put, scene.note);
    return (t, lines) => {
      drift(t);
      show(head, out3(seg(t, 0.05, 0.45)));
      if (sub) show(sub, out3(seg(t, 0.15, 0.55)), 0);
      // The towers go up one after another across the first line of narration.
      const span = Math.max(1.2, endOf(lines, 0) - 0.5);
      cols.forEach((c, i) => {
        const p = out3(seg(t, 0.25 + (i * (span - 0.7)) / cols.length, 0.25 + (i * (span - 0.7)) / cols.length + 0.7));
        const h = Math.max(6, (c.it.value / max) * tall * p);
        css(c.bar, { top: `${base - h}px`, height: `${h}px`, opacity: String(Math.min(1, p * 4)) });
        css(c.value, { top: `${base - h - 84}px`, opacity: String(seg(p, 0.5, 1)) });
        c.label.style.opacity = String(Math.min(1, p * 4));
      });
      if (badge) pop(badge, seg(t, startOf(lines, 1), startOf(lines, 1) + 0.5));
    };
  },

  // Back to where it began: the models in a row, then the empty box waiting for the next question.
  close(scene, root, kit) {
    const { put, drift } = canvas(root, kit);
    const chips = scene.models.map((m, i) => {
      const chip = put({ left: `${140 + i * 420}px`, top: '110px', width: '380px', height: '150px', borderRadius: '24px', background: '#161d27', border: '2px solid #2a3542' });
      put({ left: '36px', top: '22px', fontSize: '30px', color: 'var(--muted)', whiteSpace: 'nowrap' }, m.when, chip);
      put({ left: '36px', top: '64px', fontSize: '56px', fontWeight: '800', whiteSpace: 'nowrap' }, m.label, chip);
      return chip;
    });
    const field = put({ left: '360px', top: '400px', width: '1200px', height: '120px', borderRadius: '60px', background: '#161d27', border: '3px solid var(--accent)' });
    const hint = put({ left: '64px', top: '32px', fontSize: '44px', color: 'var(--muted)', whiteSpace: 'nowrap' }, scene.placeholder, field);
    const caret = put({ left: '40px', top: '30px', width: '5px', height: '60px', background: 'var(--accent)' }, null, field);
    const head = put({ left: '0', top: '580px', width: '1920px', textAlign: 'center', fontSize: '110px', fontWeight: '800', whiteSpace: 'nowrap' }, scene.headline);
    footnote(put, scene.note);
    return (t, lines) => {
      drift(t);
      const span = Math.max(1, endOf(lines, 0) - 0.3);
      chips.forEach((chip, i) => {
        const p = out3(seg(t, 0.1 + (i * span) / chips.length, 0.1 + (i * span) / chips.length + 0.4));
        const lit = i === chips.length - 1 ? p : 0;
        css(chip, { opacity: String(p), transform: `translateY(${(1 - p) * 40}px)`, borderColor: lit > 0.9 ? 'var(--accent)' : '#2a3542' });
      });
      const second = startOf(lines, 1);
      const p = out3(seg(t, second - 0.1, second + 0.5));
      css(field, { opacity: String(p), transform: `scale(${0.9 + 0.1 * p})` });
      show(hint, out3(seg(t, second + 0.2, second + 0.6)), 0);
      caret.style.opacity = String(Math.floor(t / 0.45) % 2);
      show(head, out3(seg(t, second + 0.5, second + 1.0)));
    };
  },
};
