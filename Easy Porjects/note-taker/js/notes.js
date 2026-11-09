export const CATEGORIES = ['General', 'Personal', 'Work', 'Learning', 'Ideas'];
export const LIMITS = { title: 120, content: 20000 };

const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function isBlank({ title = '', content = '' }) {
  return title.trim() === '' && content.trim() === '';
}

export function isValidNote(n) {
  return Boolean(n) && typeof n === 'object'
    && typeof n.id === 'string' && n.id.length > 0 && n.id.length <= 64
    && typeof n.title === 'string' && n.title.length <= LIMITS.title
    && typeof n.content === 'string' && n.content.length <= LIMITS.content
    && !isBlank(n)
    && CATEGORIES.includes(n.category)
    && typeof n.isPinned === 'boolean'
    && isIso(n.createdAt) && isIso(n.updatedAt);
}

function clean(fields) {
  const note = {
    title: String(fields.title ?? '').slice(0, LIMITS.title),
    content: String(fields.content ?? '').slice(0, LIMITS.content),
    category: CATEGORIES.includes(fields.category) ? fields.category : 'General',
  };
  if (isBlank(note)) throw new Error('A note needs a title or content.');
  return note;
}

export function createNote(fields, now = new Date(), id = crypto.randomUUID()) {
  const iso = now.toISOString();
  return { id, ...clean(fields), isPinned: false, createdAt: iso, updatedAt: iso };
}

export function updateNote(note, fields, now = new Date()) {
  return { ...note, ...clean({ ...note, ...fields }), updatedAt: now.toISOString() };
}

export const togglePin = (note) => ({ ...note, isPinned: !note.isPinned });

export const deleteNote = (notes, id) => notes.filter((n) => n.id !== id);

export const sortNotes = (notes) =>
  [...notes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
