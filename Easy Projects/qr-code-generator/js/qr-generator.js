import qrcode from './vendor/qrcode.mjs';
import { stringToBytes } from './vendor/qrcode_utf8.mjs';

qrcode.stringToBytes = stringToBytes;

export const ERROR_LEVELS = ['L', 'M', 'Q', 'H'];
export const MAX_INPUT_LENGTH = 4000;

export const DEFAULTS = Object.freeze({
  foreground: '#111111',
  background: '#F3EEE3',
  size: 512,
  margin: 4,
  level: 'M',
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export class QrError extends Error {}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeSettings(raw = {}) {
  const size = Number.parseInt(raw.size, 10);
  const margin = Number.parseInt(raw.margin, 10);
  return {
    foreground: HEX_COLOR.test(raw.foreground) ? raw.foreground : DEFAULTS.foreground,
    background: HEX_COLOR.test(raw.background) ? raw.background : DEFAULTS.background,
    size: Number.isNaN(size) ? DEFAULTS.size : clamp(size, 128, 1024),
    margin: Number.isNaN(margin) ? DEFAULTS.margin : clamp(margin, 0, 10),
    level: ERROR_LEVELS.includes(raw.level) ? raw.level : DEFAULTS.level,
  };
}

export function createMatrix(text, level = DEFAULTS.level) {
  if (!text) throw new QrError('There is nothing to encode yet.');
  if (!ERROR_LEVELS.includes(level)) throw new QrError('Unknown error correction level.');
  if (text.length > MAX_INPUT_LENGTH) {
    throw new QrError('This content is too long for a QR code. Shorten it and try again.');
  }

  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  try {
    qr.make();
  } catch {
    throw new QrError(
      'This content is too long for a QR code. Shorten it or choose a lower error correction level.',
    );
  }
  return { size: qr.getModuleCount(), isDark: (row, col) => qr.isDark(row, col) };
}

export function darkModuleRuns(matrix) {
  const runs = [];
  for (let row = 0; row < matrix.size; row += 1) {
    let start = -1;
    for (let col = 0; col <= matrix.size; col += 1) {
      const dark = col < matrix.size && matrix.isDark(row, col);
      if (dark && start === -1) start = col;
      if (!dark && start !== -1) {
        runs.push({ row, col: start, length: col - start });
        start = -1;
      }
    }
  }
  return runs;
}

export function toSvg(matrix, { foreground, background, margin, size }) {
  if (!HEX_COLOR.test(foreground) || !HEX_COLOR.test(background)) {
    throw new QrError('Colors must be six-digit hex values.');
  }
  const total = matrix.size + margin * 2;
  const path = darkModuleRuns(matrix)
    .map(({ row, col, length }) => `M${col + margin} ${row + margin}h${length}v1h-${length}z`)
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
    `width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${background}"/>` +
    `<path fill="${foreground}" d="${path}"/></svg>`
  );
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(colorA, colorB) {
  const [lighter, darker] = [luminance(colorA), luminance(colorB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export function checkColors(foreground, background) {
  if (luminance(foreground) > luminance(background)) {
    return 'Use a foreground color that is darker than the background. Many scanners cannot read inverted codes.';
  }
  if (contrastRatio(foreground, background) < 3) {
    return 'These colors are too close together. Choose colors with more contrast so phones can read the code.';
  }
  return null;
}
