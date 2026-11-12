import { svgEl } from './dom.js';
import { CHAIN_ROWS } from './pixel.js';

const K = 1;
const C = Math.cos(Math.PI / 6), S = 0.5;
const P = (x, y, z, ox, oy) => [ox + (x - y) * C * K, oy + (x + y) * S * K - z * K];
const pts = (list) => list.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');

function box(g, { x, y, w, d, h: ht, ox, oy, cls }) {
  const p = (a, b, c) => P(a + x, b + y, c, ox, oy);
  g.append(svgEl('polygon', { class: `left-${cls} edge`, points: pts([p(0, d, 0), p(w, d, 0), p(w, d, ht), p(0, d, ht)]) }));
  g.append(svgEl('polygon', { class: `right-${cls} edge`, points: pts([p(w, 0, 0), p(w, d, 0), p(w, d, ht), p(w, 0, ht)]) }));
  g.append(svgEl('polygon', { class: `top-${cls} edge`, points: pts([p(0, 0, ht), p(w, 0, ht), p(w, d, ht), p(0, d, ht)]) }));
}

function flat(g, cls, x, y, z, w, d, ox, oy) {
  g.append(svgEl('polygon', { class: cls, points: pts([P(x, y, z, ox, oy), P(x + w, y, z, ox, oy), P(x + w, y + d, z, ox, oy), P(x, y + d, z, ox, oy)]) }));
}

export function isoIllustration() {
  const svg = svgEl('svg', { class: 'iso', viewBox: '0 0 440 300', role: 'img',
    'aria-label': 'Illustration: a long navy slab representing a long URL, next to a small yellow cube carrying a chain-link icon, representing the short link.' });
  const ox = 40, oy = 70;

  const slab = svgEl('g', { class: 'slab' });
  box(slab, { x: 0, y: 0, w: 230, d: 56, h: 26, ox, oy, cls: 'slab' });
  [[12, 12, 70], [90, 12, 40], [138, 12, 62], [12, 34, 34], [54, 34, 90], [152, 34, 30]].forEach(([x, y, w]) => flat(slab, 'dash', x, y, 26, w, 8, ox, oy));
  svg.append(slab);

  const steps = svgEl('g', {});
  [[242, 22, 14], [264, 25, 10], [284, 28, 6]].forEach(([x, y, s]) => flat(steps, 'step', x, y, 0, s, s, ox, oy));
  svg.append(steps);

  const cube = svgEl('g', { class: 'cube' });
  const cx = 318, cy = 0, size = 64;
  box(cube, { x: cx, y: cy, w: size, d: size, h: size, ox, oy, cls: 'cube' });
  const cell = (size * 0.8) / 16;
  const [e, f] = P(cx + size * 0.1, cy + size * 0.1, size, ox, oy);
  const sp = svgEl('g', { transform: `matrix(${C * cell} ${S * cell} ${-C * cell} ${S * cell} ${e.toFixed(1)} ${f.toFixed(1)})` });
  CHAIN_ROWS.forEach((row, yy) => [...row].forEach((c, xx) => {
    if (c !== '.') sp.append(svgEl('rect', { x: xx, y: yy + 4, width: 1.05, height: 1.05, fill: c === 'n' ? '#172B4D' : '#FFFFFF' }));
  }));
  cube.append(sp);
  svg.append(cube);
  return svg;
}

export function bounceCube(svg) {
  const cube = svg && svg.querySelector('.cube');
  if (!cube || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cube.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }],
    { duration: 420, easing: 'cubic-bezier(0.2,0.7,0.2,1)' });
}
