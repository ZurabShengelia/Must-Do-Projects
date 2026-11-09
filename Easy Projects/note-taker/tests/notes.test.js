import test from 'node:test';
import assert from 'node:assert/strict';
import { createNote, updateNote, togglePin, deleteNote, isValidNote, LIMITS } from '../js/notes.js';
import { searchNotes } from '../js/search.js';

const t0 = new Date('2026-01-01T10:00:00Z');
const t1 = new Date('2026-01-02T10:00:00Z');

test('creates a valid note with timestamps and unique ids', () => {
  const a = createNote({ title: 'Hi', content: 'x', category: 'Work' }, t0);
  const b = createNote({ title: 'Hi', content: 'x' }, t0);
  assert.ok(isValidNote(a));
  assert.equal(a.createdAt, a.updatedAt);
  assert.equal(a.isPinned, false);
  assert.notEqual(a.id, b.id);
  assert.equal(b.category, 'General');
});

test('rejects empty and whitespace-only notes', () => {
  assert.throws(() => createNote({ title: '', content: '' }));
  assert.throws(() => createNote({ title: '  ', content: '\n' }));
});

test('truncates oversized input to the limits', () => {
  const n = createNote({ title: 'a'.repeat(500), content: 'b'.repeat(LIMITS.content + 5) });
  assert.equal(n.title.length, LIMITS.title);
  assert.equal(n.content.length, LIMITS.content);
});

test('edit keeps createdAt and id, changes updatedAt', () => {
  const n = createNote({ title: 'A', content: 'B' }, t0);
  const e = updateNote(n, { title: 'C', category: 'Ideas' }, t1);
  assert.equal(e.createdAt, n.createdAt);
  assert.equal(e.id, n.id);
  assert.equal(e.updatedAt, t1.toISOString());
  assert.equal(e.title, 'C');
  assert.equal(e.content, 'B');
  assert.throws(() => updateNote(n, { title: '', content: '' }, t1));
});

test('pin toggles and delete removes only the target', () => {
  const n = createNote({ title: 'A' });
  assert.equal(togglePin(n).isPinned, true);
  assert.equal(togglePin(togglePin(n)).isPinned, false);
  const m = createNote({ title: 'B' });
  assert.deepEqual(deleteNote([n, m], n.id), [m]);
});

test('search matches title and content case-insensitively', () => {
  const a = createNote({ title: 'Groceries', content: 'milk' });
  const b = createNote({ title: 'Plan', content: 'Learn JAVASCRIPT' });
  const all = [a, b];
  assert.deepEqual(searchNotes(all, 'GROCER'), [a]);
  assert.deepEqual(searchNotes(all, 'javascript'), [b]);
  assert.deepEqual(searchNotes(all, '   '), all);
  assert.deepEqual(searchNotes(all, 'zzz'), []);
});
