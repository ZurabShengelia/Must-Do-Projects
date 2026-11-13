import jsQR from 'jsqr';

export function decode(matrix, { scale = 6, margin = 4 } = {}) {
  const total = matrix.size + margin * 2;
  const width = total * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.isDark(row, col)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const index = (((row + margin) * scale + y) * width + (col + margin) * scale + x) * 4;
          data[index] = data[index + 1] = data[index + 2] = 0;
        }
      }
    }
  }
  return jsQR(data, width, width)?.data ?? null;
}

export function fakeCanvas({ failBlob = false, noContext = false } = {}) {
  const calls = [];
  const context = {
    fillRect: (...args) => calls.push({ fill: context.fillStyle, rect: args }),
  };
  const canvas = {
    width: 0,
    height: 0,
    calls,
    getContext: () => (noContext ? null : context),
    toBlob: (callback, type) => callback(failBlob ? null : new Blob(['png'], { type })),
  };
  return canvas;
}
