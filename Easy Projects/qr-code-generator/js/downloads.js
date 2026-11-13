import { QrError, toSvg } from './qr-generator.js';

export function pixelsPerModule(matrix, { size, margin }) {
  return Math.max(1, Math.floor(size / (matrix.size + margin * 2)));
}

export function pngDimension(matrix, settings) {
  return pixelsPerModule(matrix, settings) * (matrix.size + settings.margin * 2);
}

export function svgBlob(matrix, settings) {
  return new Blob([toSvg(matrix, settings)], { type: 'image/svg+xml' });
}

export function renderPng(matrix, settings, createCanvas = () => document.createElement('canvas')) {
  const scale = pixelsPerModule(matrix, settings);
  const dimension = pngDimension(matrix, settings);
  const canvas = createCanvas();
  canvas.width = dimension;
  canvas.height = dimension;

  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new QrError('This browser cannot draw the image.'));

  context.fillStyle = settings.background;
  context.fillRect(0, 0, dimension, dimension);
  context.fillStyle = settings.foreground;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.isDark(row, col)) {
        context.fillRect((col + settings.margin) * scale, (row + settings.margin) * scale, scale, scale);
      }
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new QrError('The PNG could not be created.'));
    }, 'image/png');
  });
}

export function buildFilename(type, label, extension) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return `qr-${type}-${slug || 'code'}.${extension}`;
}

export function saveBlob(blob, filename, doc = document) {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
