import { svgEl, h } from './dom.js';

const PALETTE = { n: '#172B4D', y: '#FFD84D', w: '#FFFFFF', g: '#1B6E41', r: '#B3261E', m: '#496A91' };

export function sprite(rows, { cell = 2, palette = PALETTE, label = null, className = 'pix' } = {}) {
  const width = Math.max(...rows.map((r) => r.length));
  const svg = svgEl('svg', {
    class: className, width: width * cell, height: rows.length * cell,
    viewBox: `0 0 ${width} ${rows.length}`, 'shape-rendering': 'crispEdges',
    role: label ? 'img' : null, 'aria-label': label, 'aria-hidden': label ? null : 'true',
  });
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '.' && palette[c]) svg.append(svgEl('rect', { x, y, width: 1, height: 1, fill: palette[c] }));
  }));
  return svg;
}

const RING = [
  '..nnnnnn..', '.nyyyyyyn.', 'nyynnnnyyn', 'nyn....nyn', 'nyn....nyn', 'nyynnnnyyn', '.nyyyyyyn.', '..nnnnnn..',
];
function chain() {
  const W = 16, H = 8, grid = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (x0, rowsFrom, rowsTo, colsFrom, colsTo) => RING.forEach((row, j) => [...row].forEach((c, i) => {
    if (c !== '.' && j >= rowsFrom && j < rowsTo && i >= colsFrom && i < colsTo) grid[j][x0 + i] = c;
  }));
  put(0, 0, 8, 0, 10); put(6, 0, 8, 0, 10); put(0, 0, 4, 6, 10);
  return grid.map((r) => r.join(''));
}
export const CHAIN_ROWS = chain();

export function logoMark() {
  return sprite(CHAIN_ROWS, { cell: 2 });
}
export function brandMark() {
  const svg = svgEl('svg', { class: 'pixel', viewBox: '0 0 16 16', 'shape-rendering': 'crispEdges', 'aria-hidden': 'true' });
  svg.append(svgEl('rect', { width: 16, height: 16, fill: '#FFFFFF' }));
  CHAIN_ROWS.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '.') svg.append(svgEl('rect', { x, y: y + 4, width: 1, height: 1, fill: PALETTE[c] }));
  }));
  return svg;
}

const TICK = ['.......g', '......gg', 'g....gg.', 'gg..gg..', '.gggg...', '..gg....'];
const CROSS = ['r.....r', '.r...r.', '..r.r..', '...r...', '..r.r..', '.r...r.', 'r.....r'];
export const successMark = (cell = 2) => sprite(TICK, { cell });
export const errorMark = (cell = 2) => sprite(CROSS, { cell });

export function pixelLoader() {
  return h('span', { class: 'pix-loader', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
}
