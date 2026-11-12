import { h, svgEl, reducedMotion } from './dom.js';

const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const fmtDay = (iso) => dayFmt.format(new Date(iso + 'T00:00:00Z'));
const fmtFull = (iso) => fullFmt.format(new Date(iso + 'T00:00:00Z'));

export function rangeText(series) {
  if (!series.length) return '';
  return `${fmtFull(series[0].date)} – ${fmtFull(series[series.length - 1].date)} (UTC)`;
}

function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

export function barChart(series, { name = 'Clicks per day' } = {}) {
  const W = 640, H = 220, L = 44, B = 26, T = 8, R = 4;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(0, ...series.map((d) => d.count));
  const step = max <= 4 ? 1 : niceStep(max / 4);
  const top = max <= 4 ? 4 : step * Math.ceil(max / step);
  const total = series.reduce((s, d) => s + d.count, 0);

  const svg = svgEl('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${name}: ${total} clicks over ${series.length} days. A data table follows.`,
  });
  for (let v = 0; v <= top; v += step) {
    const y = T + ph - (v / top) * ph;
    svg.append(svgEl('line', { class: v === 0 ? 'zero' : 'grid-line', x1: L, x2: W - R, y1: y, y2: y }));
    svg.append(svgEl('text', { class: 'axis-text', x: L - 6, y: y + 4, 'text-anchor': 'end' }, String(v)));
  }

  const slot = pw / Math.max(series.length, 1);
  const bw = Math.max(2, Math.min(28, slot * 0.68));
  const bars = [];
  const heights = series.map((d) => (d.count <= 0 ? 0 : Math.max(2, (d.count / top) * ph)));
  series.forEach((d, i) => {
    if (d.count <= 0) return;
    const bh = heights[i];
    const bar = svgEl('rect', { class: 'bar', x: L + i * slot + (slot - bw) / 2, y: T + ph - bh, width: bw, height: bh });
    svg.append(bar); bars.push(bar);
  });

  const tip = h('div', { class: 'chart-tip', 'aria-hidden': 'true' }, h('strong', {}), h('span', {}));
  const hits = series.map((d, i) => {
    const hit = svgEl('rect', { class: 'hit', x: L + i * slot, y: T, width: slot, height: ph, 'aria-hidden': 'true' });
    const show = () => {
      hits.forEach((other) => other.classList.remove('active'));
      hit.classList.add('active');
      tip.firstChild.textContent = `${d.count} ${d.count === 1 ? 'click' : 'clicks'}`;
      tip.lastChild.textContent = fmtFull(d.date);
      const left = Math.min(88, Math.max(12, ((L + i * slot + slot / 2) / W) * 100));
      tip.style.left = left + '%';
      tip.style.top = Math.max(26, ((T + ph - heights[i]) / H) * 100) + '%';
      tip.classList.add('show');
    };
    const hide = () => { hit.classList.remove('active'); tip.classList.remove('show'); };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);
    return hit;
  });
  hits.forEach((hit) => svg.append(hit));

  const labelIdx = new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]);
  if (series.length <= 8) series.forEach((_, i) => labelIdx.add(i));
  for (const i of labelIdx) {
    if (!series[i]) continue;
    const anchor = i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle';
    const x = i === 0 ? L : i === series.length - 1 ? W - R : L + i * slot + slot / 2;
    svg.append(svgEl('text', { class: 'axis-text', x, y: H - 6, 'text-anchor': anchor }, fmtDay(series[i].date)));
  }

  if (!reducedMotion()) {
    bars.forEach((bar, i) => bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
      { duration: 350, delay: Math.min(i * 10, 250), easing: 'cubic-bezier(0.2,0.7,0.2,1)', fill: 'backwards' }));
  }

  const table = h('details', { class: 'data-table' },
    h('summary', {}, 'View data as a table'),
    h('table', {}, h('caption', { class: 'sr-only' }, name),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Date (UTC)'), h('th', { scope: 'col' }, 'Clicks'))),
      h('tbody', {}, series.map((d) => h('tr', {}, h('td', {}, fmtDay(d.date)), h('td', {}, String(d.count)))))));

  return h('div', {},
    h('div', { class: 'chart-wrap' }, svg, tip),
    total === 0 ? h('p', { class: 'chart-empty' }, 'No clicks in this period yet.') : null,
    table);
}

export function rankList(items) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return h('ol', { class: 'rank' }, items.map((it) => {
    const fill = h('div', { class: 'bar-fill' });
    fill.style.width = Math.max(2, (it.count / max) * 100) + '%';
    return h('li', {},
      h('span', { class: 'name', title: it.title || '' }, it.label),
      h('span', { class: 'count' }, String(it.count)),
      h('div', { class: 'bar-track', 'aria-hidden': 'true' }, fill));
  }));
}
