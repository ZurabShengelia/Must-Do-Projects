import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const files = readdirSync(new URL('../js/', import.meta.url));
const sinks = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/;

for (const f of files) {
  test(`js/${f} contains no unsafe DOM or eval sinks`, () => {
    const src = readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, sinks);
  });
}
