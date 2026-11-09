import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNotes, saveNotes, STORAGE_KEY } from '../js/storage.js';
import { createNote } from '../js/notes.js';

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
};

test('save then load restores notes (simulated reload)', () => {
  const s = fakeStorage();
  const notes = [createNote({ title: 'A', content: 'B' })];
  assert.equal(saveNotes(notes, s).ok, true);
  assert.deepEqual(loadNotes(s), { notes, error: null });
});

test('missing storage data yields an empty list without error', () => {
  assert.deepEqual(loadNotes(fakeStorage()), { notes: [], error: null });
});

test('malformed JSON is handled', () => {
  const r = loadNotes(fakeStorage({ [STORAGE_KEY]: '{oops' }));
  assert.deepEqual(r.notes, []);
  assert.ok(r.error);
});

test('unknown schema is not loaded', () => {
  const r = loadNotes(fakeStorage({ [STORAGE_KEY]: JSON.stringify([1, 2]) }));
  assert.deepEqual(r.notes, []);
  assert.ok(r.error);
});

test('invalid and duplicate notes are dropped, valid ones kept', () => {
  const good = createNote({ title: 'ok' });
  const bad = [{ id: 1 }, null, { ...good, id: 'x', isPinned: 'yes' }, { ...good, id: 'y', category: 'Hacked' }, { ...good, id: 'z', createdAt: 'nope' }];
  const raw = JSON.stringify({ version: 1, notes: [good, good, ...bad] });
  const r = loadNotes(fakeStorage({ [STORAGE_KEY]: raw }));
  assert.deepEqual(r.notes, [good]);
  assert.match(r.error, /invalid/);
});

test('quota errors are reported, not thrown', () => {
  const s = { setItem() { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } };
  const r = saveNotes([], s);
  assert.equal(r.ok, false);
  assert.match(r.error, /full/i);
});

test('unavailable storage is reported on load', () => {
  const s = { getItem() { throw new Error('denied'); } };
  assert.ok(loadNotes(s).error);
});
