import { searchNotes } from './search.js';
import { sortNotes } from './notes.js';

export function filterNotes(notes, { filter, query }) {
  let list = notes;
  if (filter === 'pinned') list = list.filter((n) => n.isPinned);
  else if (filter !== 'all') list = list.filter((n) => n.category === filter);
  return sortNotes(searchNotes(list, query));
}

export const resetViewForNewNote = (view) => ({ ...view, filter: 'all', query: '' });
