import { svgEl } from './dom.js';

const ICONS = {
  copy: [{ rect: [9, 9, 11, 11] }, 'M5 15V5h10'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  chart: ['M4 20v-8', 'M10 20V5', 'M16 20v-11', 'M22 20H2'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5H5V6h5'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  sun: [{ circle: [12, 12, 4] }, 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M5 5l2 2', 'M17 17l2 2', 'M19 5l-2 2', 'M7 17l-2 2'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
  monitor: [{ rect: [3, 5, 18, 11] }, 'M8 20h8', 'M12 16v4'],
  search: [{ circle: [11, 11, 6] }, 'M16 16l5 5'],
  logout: ['M10 4H5v16h5', 'M15 8l4 4-4 4', 'M19 12H9'],
  info: [{ circle: [12, 12, 9] }, 'M12 11v5', 'M12 8h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  caret: ['M9 6l6 6-6 6'],
};

export function icon(name, label) {
  const parts = ICONS[name];
  if (!parts) throw new Error('unknown icon ' + name);
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
  for (const p of parts) {
    if (typeof p === 'string') svg.append(svgEl('path', { d: p }));
    else if (p.circle) svg.append(svgEl('circle', { cx: p.circle[0], cy: p.circle[1], r: p.circle[2] }));
    else if (p.rect) svg.append(svgEl('rect', { x: p.rect[0], y: p.rect[1], width: p.rect[2], height: p.rect[3] }));
  }
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.append(svg);
  if (label) wrap.setAttribute('aria-label', label);
  return wrap;
}
