import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, checkColors, createMatrix, normalizeSettings, toSvg } from '../js/qr-generator.js';
import { buildFilename, pngDimension, renderPng, saveBlob, svgBlob } from '../js/downloads.js';
import { fakeCanvas } from './helpers.js';

const matrix = createMatrix('https://example.com');

test('defaults use the brand palette', () => {
  assert.equal(DEFAULTS.foreground, '#111111');
  assert.equal(DEFAULTS.background, '#F3EEE3');
});

test('settings are clamped and invalid values fall back to defaults', () => {
  const settings = normalizeSettings({ foreground: 'red', background: '#abcdef', size: '99999', margin: '-3', level: 'Z' });
  assert.deepEqual(settings, { ...DEFAULTS, background: '#abcdef', size: 1024, margin: 0 });
  assert.deepEqual(normalizeSettings({}), { ...DEFAULTS });
});

test('resetting customization restores the defaults', () => {
  const changed = normalizeSettings({ foreground: '#222222', size: 256, margin: 8, level: 'H' });
  assert.notDeepEqual(changed, { ...DEFAULTS });
  assert.deepEqual(normalizeSettings(DEFAULTS), { ...DEFAULTS });
});

test('unreadable color choices are caught', () => {
  assert.equal(checkColors('#111111', '#F3EEE3'), null);
  assert.match(checkColors('#F3EEE3', '#111111'), /darker/);
  assert.match(checkColors('#777777', '#888888'), /too close/);
});

test('SVG output is valid, uses the chosen colors and encodes the same modules', async () => {
  const settings = { foreground: '#222222', background: '#EEEEEE', size: 300, margin: 2 };
  const svg = toSvg(matrix, settings);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
  assert.match(svg, /width="300" height="300"/);
  assert.ok(svg.includes('fill="#222222"') && svg.includes('fill="#EEEEEE"'));
  assert.equal((await svgBlob(matrix, settings).text()), svg);

  const { JSDOM } = await import('jsdom');
  const parsed = new new JSDOM().window.DOMParser().parseFromString(svg, 'image/svg+xml');
  assert.equal(parsed.getElementsByTagName('parsererror').length, 0);
});

test('SVG rejects colors that are not six-digit hex', () => {
  assert.throws(() => toSvg(matrix, { foreground: '"><script>', background: '#FFFFFF', margin: 4, size: 200 }));
});

test('PNG export draws the background and every dark module at whole-pixel scale', async () => {
  const canvas = fakeCanvas();
  const settings = { foreground: '#111111', background: '#F3EEE3', size: 512, margin: 4 };
  const blob = await renderPng(matrix, settings, () => canvas);

  let darkCount = 0;
  for (let r = 0; r < matrix.size; r += 1) for (let c = 0; c < matrix.size; c += 1) darkCount += matrix.isDark(r, c);

  assert.equal(blob.type, 'image/png');
  assert.equal(canvas.width, pngDimension(matrix, settings));
  assert.ok(canvas.width <= 512 && canvas.width > 400);
  assert.equal(canvas.calls.length, darkCount + 1);
  assert.equal(canvas.calls[0].fill, '#F3EEE3');
  assert.ok(canvas.calls.slice(1).every((call) => call.fill === '#111111'));
});

test('PNG export reports failures', async () => {
  const settings = normalizeSettings({});
  await assert.rejects(renderPng(matrix, settings, () => fakeCanvas({ failBlob: true })));
  await assert.rejects(renderPng(matrix, settings, () => fakeCanvas({ noContext: true })));
});

test('filenames are meaningful and safe', () => {
  assert.equal(buildFilename('url', 'example.com', 'png'), 'qr-url-example-com.png');
  assert.equal(buildFilename('text', '../../etc/passwd!', 'svg'), 'qr-text-etc-passwd.svg');
  assert.equal(buildFilename('text', '👋', 'png'), 'qr-text-code.png');
});

test('saveBlob triggers a download and releases the object URL', () => {
  const clicks = [];
  const doc = {
    body: { append() {} },
    createElement: () => ({ click() { clicks.push(this.download); }, remove() {} }),
  };
  saveBlob(new Blob(['x']), 'file.png', doc);
  assert.deepEqual(clicks, ['file.png']);
});
