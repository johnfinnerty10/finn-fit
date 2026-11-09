// Finn Fit — tiny SVG charts. Single series, accent colour, thin marks,
// recessive grid, hover tooltip on every mark. Drawn at the container's real
// pixel width so text never scales down on phones.

const specs = new Map();
let n = 0;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Returns a placeholder; call hydrate() after it is in the DOM. */
export function chart(spec) {
  const id = `c${++n}`;
  specs.set(id, spec);
  return `<div class="chart" data-chart="${id}" style="height:${spec.height || 160}px" role="img" aria-label="${esc(spec.label || 'Chart')}"></div>`;
}

export function hydrate(root = document) {
  root.querySelectorAll('[data-chart]').forEach((el) => {
    const spec = specs.get(el.dataset.chart);
    if (!spec) return;
    const w = Math.max(240, el.clientWidth);
    el.innerHTML = spec.type === 'line' ? line(spec, w) : bars(spec, w);
  });
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function bars({ data, height = 160, target, fmt = (v) => v, max }, w) {
  const padL = 34, padR = 8, padT = 12, padB = 24;
  const ih = height - padT - padB;
  const iw = w - padL - padR;
  const vals = data.map((d) => d.value ?? 0);
  const top = niceMax(max ?? Math.max(...vals, target || 0, 1));
  const y = (v) => padT + ih - (v / top) * ih;
  const slot = iw / data.length;
  const bw = Math.min(28, Math.max(6, slot - 6));
  let s = `<svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}">`;
  for (const g of [0, 0.5, 1]) {
    const gy = y(top * g);
    s += `<line x1="${padL}" x2="${w - padR}" y1="${gy}" y2="${gy}" class="grid"/>`;
    s += `<text x="${padL - 6}" y="${gy + 4}" class="axis" text-anchor="end">${esc(fmt(top * g))}</text>`;
  }
  if (target) {
    s += `<line x1="${padL}" x2="${w - padR}" y1="${y(target)}" y2="${y(target)}" class="target"/>`;
  }
  data.forEach((d, i) => {
    const cx = padL + slot * i + slot / 2;
    const x = cx - bw / 2;
    if (d.value != null && d.value > 0) {
      const h = Math.max(2, (d.value / top) * ih);
      const yy = padT + ih - h;
      const r = Math.min(4, bw / 2, h);
      // rounded top, square base anchored to the baseline
      s += `<path class="bar${d.dim ? ' dim' : ''}" d="M${x},${yy + h} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${yy + h} Z"/>`;
    } else {
      s += `<line x1="${x}" x2="${x + bw}" y1="${padT + ih}" y2="${padT + ih}" class="empty"/>`;
    }
    s += `<text x="${cx}" y="${height - 6}" class="axis" text-anchor="middle">${esc(d.label)}</text>`;
    s += `<rect x="${cx - slot / 2}" y="${padT}" width="${slot}" height="${ih}" class="hit" data-tip="${esc(d.tip ?? `${d.label}: ${d.value == null ? 'no data' : fmt(d.value)}`)}"/>`;
  });
  return s + '</svg>';
}

function line({ points, height = 180, fmt = (v) => v, baseline }, w) {
  const padL = 40, padR = 12, padT = 14, padB = 24;
  const ih = height - padT - padB;
  const iw = w - padL - padR;
  if (!points.length) return `<div class="chart-empty">No data yet</div>`;
  const vals = points.map((p) => p.y);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 5; hi += 5; }
  const padV = (hi - lo) * 0.15;
  lo = Math.max(0, lo - padV); hi += padV;
  const x = (i) => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  let s = `<svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}">`;
  for (const g of [0, 0.5, 1]) {
    const v = lo + (hi - lo) * g;
    s += `<line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
    s += `<text x="${padL - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  if (baseline != null && baseline >= lo && baseline <= hi) {
    s += `<line x1="${padL}" x2="${w - padR}" y1="${y(baseline)}" y2="${y(baseline)}" class="target"/>`;
  }
  if (points.length > 1) {
    s += `<polyline class="line" points="${points.map((p, i) => `${x(i)},${y(p.y)}`).join(' ')}"/>`;
  }
  // label first, last and (if room) a middle tick
  const labelIdx = new Set([0, points.length - 1]);
  if (points.length > 4 && iw > 300) labelIdx.add(Math.floor(points.length / 2));
  points.forEach((p, i) => {
    s += `<circle cx="${x(i)}" cy="${y(p.y)}" r="4" class="dot"/>`;
    if (labelIdx.has(i)) {
      const anchor = i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle';
      s += `<text x="${x(i)}" y="${height - 6}" class="axis" text-anchor="${anchor}">${esc(p.label)}</text>`;
    }
    const hw = Math.max(16, iw / Math.max(1, points.length) / 2);
    s += `<rect x="${x(i) - hw}" y="${padT}" width="${hw * 2}" height="${ih}" class="hit" data-tip="${esc(p.tip ?? `${p.label}: ${fmt(p.y)}`)}"/>`;
  });
  return s + '</svg>';
}

/** Progress ring for a single headline value. */
export function ring({ value, max, size = 120, stroke = 10, center = '', sub = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-width="${stroke}"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-label"><strong>${center}</strong><span>${sub}</span></div>
  </div>`;
}
