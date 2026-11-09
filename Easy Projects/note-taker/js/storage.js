import { isValidNote } from './notes.js';

export const STORAGE_KEY = 'notetaker-notes';
const VERSION = 1;

export function loadNotes(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { notes: [], error: 'Browser storage is unavailable. Notes will not be saved.' };
  }
  if (raw === null) return { notes: [], error: null };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { notes: [], error: 'Saved notes were unreadable and could not be loaded.' };
  }
  if (!data || data.version !== VERSION || !Array.isArray(data.notes)) {
    return { notes: [], error: 'Saved notes have an unknown format and were not loaded.' };
  }
  const seen = new Set();
  const notes = data.notes.filter((n) => {
    if (!isValidNote(n) || seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
  const dropped = data.notes.length - notes.length;
  return { notes, error: dropped ? `${dropped} invalid note(s) were skipped.` : null };
}

export function saveNotes(notes, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, notes }));
    return { ok: true, error: null };
  } catch (err) {
    const full = err && (err.name === 'QuotaExceededError' || err.code === 22);
    return { ok: false, error: full ? 'Storage is full. Free some space.' : 'Could not save to browser storage.' };
  }
}
