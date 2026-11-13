import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { initApp } from '../js/app.js';

let win;
let doc;
const $ = (id) => doc.getElementById(id);

function type(name, value) {
  const input = doc.querySelector(`[name="${name}"]`);
  input.value = value;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}

function choose(value) {
  const radio = doc.querySelector(`input[name="type"][value="${value}"]`);
  radio.checked = true;
  radio.dispatchEvent(new win.Event('change', { bubbles: true }));
}

beforeEach(() => {
  win = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).window;
  doc = win.document;
  initApp(doc);
});

test('starts with an empty state and disabled actions', () => {
  assert.equal($('empty').hidden, false);
  assert.equal($('preview').hidden, true);
  assert.ok(['download-png', 'download-svg', 'copy-content'].every((id) => $(id).disabled));
});

test('typing a valid URL shows a real QR code and enables actions', () => {
  type('url', 'example.com');
  assert.equal($('preview').hidden, false);
  assert.ok($('preview').querySelector('svg path'));
  assert.equal($('download-png').disabled, false);
  assert.match($('meta').textContent, /characters encoded/);
});

test('invalid input shows an error and no code', () => {
  type('url', 'javascript:alert(1)');
  assert.equal($('error').hidden, false);
  assert.match($('error').textContent, /http/);
  assert.equal($('preview').hidden, true);
  assert.equal($('download-svg').disabled, true);
});

test('very long text shows the too-long message', () => {
  choose('text');
  type('text', 'x'.repeat(5000));
  assert.match($('error').textContent, /too long/);
});

test('switching type swaps the visible form panel', () => {
  choose('wifi');
  const visible = [...doc.querySelectorAll('[data-panel]')].filter((p) => !p.hidden).map((p) => p.dataset.panel);
  assert.deepEqual(visible, ['wifi']);
});

test('changing the code color updates the preview, and bad contrast is blocked', () => {
  type('url', 'example.com');
  $('foreground').value = '#aa0000';
  $('foreground').dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.ok($('preview').innerHTML.includes('#aa0000'));

  $('foreground').value = '#f3eee3';
  $('foreground').dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal($('error').hidden, false);
});

test('clear input empties the form and returns to the empty state', () => {
  type('url', 'example.com');
  $('clear-input').click();
  assert.equal(doc.querySelector('[name="url"]').value, '');
  assert.equal($('empty').hidden, false);
});

test('reset appearance restores the defaults', () => {
  $('size').value = '256';
  $('level').value = 'H';
  $('foreground').value = '#334455';
  $('reset-settings').click();
  assert.equal($('size').value, '512');
  assert.equal($('level').value, 'M');
  assert.equal($('foreground').value, '#111111');
  assert.equal($('size-output').textContent, '512');
});

test('copy reports a clear message when the clipboard is blocked', async () => {
  type('url', 'example.com');
  $('copy-content').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match($('status').textContent, /blocked/);
});

test('user text is never injected as markup', () => {
  choose('text');
  type('text', '<img src=x onerror=alert(1)>');
  assert.equal($('preview').querySelector('img'), null);
  assert.equal(doc.querySelectorAll('img').length, 0);
});
