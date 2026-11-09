import { createNote, updateNote, togglePin, deleteNote, isBlank } from './notes.js';
import { filterNotes, resetViewForNewNote } from './view.js';
import { loadNotes, saveNotes } from './storage.js';
import * as ui from './ui.js';

const SAVE_DELAY_MS = 600;
const { refs } = ui;

const state = {
  notes: [],
  selectedId: null, 
  filter: 'all',
  query: '',
  dirty: false,
  timer: null,
};

const selected = () => state.notes.find((n) => n.id === state.selectedId);

function renderAll() {
  ui.renderFilters(state.notes, state.filter, (key) => { state.filter = key; renderAll(); });
  ui.renderList(filterNotes(state.notes, state), state.selectedId, state, openNote);
}

function persist() {
  const result = saveNotes(state.notes);
  if (result.ok) {
    state.dirty = false;
    ui.setStatus('Saved in this browser', 'saved');
  } else {
    ui.setStatus(result.error, 'error');
  }
  return result.ok;
}

function commitEditor() {
  clearTimeout(state.timer);
  if (!state.dirty) return;
  const fields = {
    title: refs.title.value.replace(/\s+/g, ' ').trim(),
    content: refs.content.value.replace(/\r\n?/g, '\n').trimEnd(),
    category: refs.category.value,
  };
  const current = selected();
  if (isBlank(fields)) {
    if (!current) state.dirty = false;
    ui.setStatus(current ? 'An entry needs a title or some text' : '', current ? 'error' : '');
    return;
  }
  if (current) {
    state.notes = state.notes.map((n) => (n.id === current.id ? updateNote(n, fields) : n));
  } else {
    const note = createNote(fields);
    state.notes = [...state.notes, note];
    state.selectedId = note.id;
  }
  persist();
  ui.updateMeta(selected());
  renderAll();
}

function scheduleSave() {
  state.dirty = true;
  ui.setStatus('Unsaved changes', 'unsaved');
  clearTimeout(state.timer);
  state.timer = setTimeout(() => { ui.setStatus('Saving', 'saving'); commitEditor(); }, SAVE_DELAY_MS);
}

function openNote(id) {
  commitEditor();
  state.selectedId = id;
  ui.showEditor(selected());
  ui.setStatus('');
  ui.setView('editor');
  renderAll();
  ui.turnPage();
}

function newNote() {
  commitEditor();
  Object.assign(state, resetViewForNewNote(state));
  refs.search.value = '';
  state.selectedId = null;
  ui.showEditor(null);
  ui.setStatus('');
  ui.setView('editor');
  refs.title.focus();
  renderAll();
  ui.turnPage();
}

function toggleBookmark() {
  const note = selected();
  if (!note) return;
  commitEditor();
  state.notes = state.notes.map((n) => (n.id === note.id ? togglePin(n) : n));
  persist();
  ui.updateMeta(selected());
  renderAll();
  ui.animateRibbon(Boolean(selected()?.isPinned));
}

const THEME_KEY = 'notetaker-theme';
function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch {}
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  ui.setTheme(theme);
  refs.theme.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    ui.setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  });
}

async function copyText() {
  try { await navigator.clipboard.writeText(refs.content.value); } catch {}
  ui.flashCopied();
}

async function removeNote() {
  const note = selected();
  if (!note || !(await ui.confirmDelete())) return;
  clearTimeout(state.timer);
  state.dirty = false;
  const row = ui.rowFor(note.id);
  const ghost = row ? row.cloneNode(true) : null;
  const index = row ? [...refs.list.children].indexOf(row) : -1;
  const height = row ? row.offsetHeight : 0;
  state.notes = deleteNote(state.notes, note.id);
  state.selectedId = null;
  persist();
  ui.showEditor(undefined);
  ui.setView('list');
  renderAll();
  if (ghost && index >= 0) ui.foldGhost(ghost, index, height);
}

function init() {
  initTheme();
  ui.initCategoryOptions();
  const { notes, error } = loadNotes();
  state.notes = notes;
  ui.showEditor(undefined);
  renderAll();
  if (error) ui.setStatus(error, 'error');

  refs.search.addEventListener('input', () => { state.query = refs.search.value; renderAll(); });
  refs.newNote.addEventListener('click', newNote);
  refs.back.addEventListener('click', () => { commitEditor(); ui.setView('list'); });
  refs.pin.addEventListener('click', toggleBookmark);
  refs.del.addEventListener('click', removeNote);
  for (const field of [refs.title, refs.content, refs.category]) field.addEventListener('input', scheduleSave);
  refs.content.addEventListener('input', ui.updateCharCount);

  refs.copy.addEventListener('click', copyText);
  refs.openShortcuts.addEventListener('click', () => refs.shortcuts.showModal());
  window.addEventListener('beforeprint', ui.fillPrint);

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const t = e.target;
    const typing = t instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
    if (mod && key === 'k') { e.preventDefault(); refs.search.focus(); }
    else if (mod && key === 's') { e.preventDefault(); commitEditor(); }
    else if (e.altKey && e.code === 'KeyN') { e.preventDefault(); newNote(); }
    else if (e.altKey && e.code === 'KeyB') { e.preventDefault(); toggleBookmark(); }
    else if (e.key === '?' && !typing && !refs.shortcuts.open) { e.preventDefault(); refs.shortcuts.showModal(); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && t instanceof HTMLElement && t.classList.contains('row')) {
      const next = e.key === 'ArrowDown' ? t.nextElementSibling : t.previousElementSibling;
      if (next instanceof HTMLElement) { e.preventDefault(); next.focus(); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) commitEditor(); });
  window.addEventListener('beforeunload', (e) => {
    commitEditor();
    if (state.dirty) e.preventDefault();
  });
}

init();
