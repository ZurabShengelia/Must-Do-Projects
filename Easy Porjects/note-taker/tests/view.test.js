import test from 'node:test';
import assert from 'node:assert/strict';
import { createNote, togglePin } from '../js/notes.js';
import { filterNotes, resetViewForNewNote } from '../js/view.js';

const work = createNote({ title: 'Standup', content: 'sprint', category: 'Work' }, new Date('2026-01-01'));
const idea = togglePin(createNote({ title: 'App idea', content: 'notes', category: 'Ideas' }, new Date('2026-01-02')));
const notes = [work, idea];

test('filterNotes applies category, pinned and search together, newest first', () => {
  assert.deepEqual(filterNotes(notes, { filter: 'all', query: '' }).map((n) => n.id), [idea.id, work.id]);
  assert.deepEqual(filterNotes(notes, { filter: 'Work', query: '' }), [work]);
  assert.deepEqual(filterNotes(notes, { filter: 'pinned', query: '' }), [idea]);
  assert.deepEqual(filterNotes(notes, { filter: 'all', query: 'SPRINT' }), [work]);
  assert.deepEqual(filterNotes(notes, { filter: 'Work', query: 'idea' }), []);
});

test('a new note stays visible after the view is reset for creation', () => {
  const fresh = createNote({ title: 'Fresh', content: 'y' });
  const stale = { filter: 'Work', query: 'zzz' };
  assert.equal(filterNotes([...notes, fresh], stale).includes(fresh), false);
  const view = resetViewForNewNote(stale);
  assert.deepEqual(view, { filter: 'all', query: '' });
  assert.ok(filterNotes([...notes, fresh], view).includes(fresh));
});
