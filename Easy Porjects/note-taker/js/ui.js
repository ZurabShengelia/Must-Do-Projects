import { CATEGORIES } from './notes.js';

const $ = (id) => document.getElementById(id);

export const refs = {
  app: $('app'), filters: $('filters'), search: $('search'),
  newNote: $('new-note'), list: $('list'), back: $('back'), status: $('status'), statusText: $('status-text'),
  pin: $('pin'), del: $('delete'), body: $('editor-body'), emptyEditor: $('empty-editor'),
  title: $('title'), category: $('category'), written: $('written'), amended: $('amended'), chars: $('chars'),
  content: $('content'), dialog: $('confirm'), shortcuts: $('shortcuts'), openShortcuts: $('open-shortcuts'),
  theme: $('theme'), copy: $('copy'), ribbon: $('page-ribbon'),
  printTitle: $('print-title'), printMeta: $('print-meta'), printBody: $('print-body'),
};

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (iso) => dateFmt.format(new Date(iso));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initCategoryOptions() {
  for (const c of CATEGORIES) {
    const opt = el('option', '', c);
    opt.value = c;
    refs.category.append(opt);
  }
}

export function renderFilters(notes, active, onSelect) {
  const make = (key, label, n) => {
    const li = el('li');
    const btn = el('button', 'tab');
    btn.type = 'button';
    if (key === active) btn.setAttribute('aria-current', 'true');
    btn.append(el('span', 'label', label), el('span', 'count', String(n)));
    btn.addEventListener('click', () => onSelect(key));
    li.append(btn);
    return li;
  };
  const gap = el('li', 'tabs-gap');
  gap.setAttribute('aria-hidden', 'true');
  refs.filters.replaceChildren(
    make('all', 'All', notes.length),
    make('pinned', 'Bookmarked', notes.filter((x) => x.isPinned).length),
    gap,
    ...CATEGORIES.map((c) => make(c, c, notes.filter((x) => x.category === c).length)),
  );
}

function noteButton(note, selectedId, onSelect) {
  const btn = el('button', 'row');
  btn.type = 'button';
  btn.dataset.id = note.id;
  if (note.id === selectedId) btn.setAttribute('aria-current', 'true');
  const preview = note.content.replace(/\s+/g, ' ').slice(0, 120);
  const meta = el('span', 'row-meta');
  const time = el('time', '', formatDate(note.updatedAt));
  time.dateTime = note.updatedAt;
  meta.append(el('span', '', note.category), time);
  if (note.isPinned) {
    btn.append(el('span', 'ribbon'), el('span', 'visually-hidden', 'Bookmarked. '));
    btn.firstChild.setAttribute('aria-hidden', 'true');
  }
  btn.append(el('span', 'row-title', note.title.trim() || 'Untitled'), el('span', 'row-preview', preview), meta);
  btn.addEventListener('click', () => onSelect(note.id));
  return btn;
}

function emptyMessage(view) {
  const wrap = el('div', 'note-state');
  const head = el('strong');
  const line = el('p');
  const lead = el('p');
  lead.append(head);
  if (view.query.trim()) {
    head.textContent = `No entry mentions \u201C${view.query.trim()}\u201D.`;
    line.textContent = 'Check the spelling, or clear the search to see every entry.';
  } else if (view.filter === 'pinned') {
    head.textContent = 'Nothing is bookmarked yet.';
    line.textContent = 'Open an entry and choose Bookmark to keep it at the top.';
  } else if (view.filter === 'all') {
    head.textContent = 'No entries yet.';
    line.textContent = 'New entry starts the first one.';
  } else {
    head.textContent = `Nothing filed under ${view.filter} yet.`;
    line.textContent = 'New entry starts one here.';
  }
  wrap.append(lead, line);
  return wrap;
}

export function renderList(notes, selectedId, view, onSelect) {
  if (notes.length === 0) {
    refs.list.replaceChildren(emptyMessage(view));
    return;
  }
  const ordered = [...notes.filter((n) => n.isPinned), ...notes.filter((n) => !n.isPinned)];
  refs.list.replaceChildren(...ordered.map((n) => noteButton(n, selectedId, onSelect)));
}

export function showEditor(note) {
  const open = note !== undefined;
  refs.body.hidden = !open;
  refs.emptyEditor.hidden = open;
  refs.pin.disabled = !note;
  refs.del.disabled = !note;
  if (!open) { refs.ribbon.hidden = true; return; }
  refs.title.value = note?.title ?? '';
  refs.content.value = note?.content ?? '';
  refs.category.value = note?.category ?? 'General';
  updateMeta(note);
  updateCharCount();
}

export function updateMeta(note) {
  refs.written.textContent = note ? `Written ${formatDate(note.createdAt)}` : 'New entry';
  refs.amended.textContent = note ? `Amended ${formatDate(note.updatedAt)}` : '';
  const pinned = Boolean(note?.isPinned);
  refs.pin.querySelector('.label').textContent = pinned ? 'Bookmarked' : 'Bookmark';
  refs.pin.setAttribute('aria-pressed', String(pinned));
  refs.ribbon.hidden = !pinned;
  refs.pin.disabled = !note;
  refs.del.disabled = !note;
}

export function updateCharCount() {
  refs.chars.textContent = `${refs.content.value.length.toLocaleString()} of ${refs.content.maxLength.toLocaleString()} characters`;
}

export function setStatus(text, kind = '') {
  refs.statusText.textContent = text;
  refs.status.dataset.state = kind;
  refs.status.classList.remove('just-saved');
  if (kind === 'saved') { void refs.status.offsetWidth; refs.status.classList.add('just-saved'); }
}

export function setView(view) {
  refs.app.dataset.view = view;
}

export function fillPrint() {
  refs.printTitle.textContent = refs.title.value.trim() || 'Untitled';
  refs.printMeta.textContent = `${refs.category.value}. ${refs.written.textContent}${refs.amended.textContent ? `, ${refs.amended.textContent.charAt(0).toLowerCase()}${refs.amended.textContent.slice(1)}` : ''}.`;
  refs.printBody.textContent = refs.content.value;
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  refs.theme.setAttribute('aria-pressed', String(theme === 'dark'));
}

export function flashCopied() {
  const label = refs.copy.querySelector('.label');
  label.textContent = 'Copied';
  clearTimeout(flashCopied.timer);
  flashCopied.timer = setTimeout(() => { label.textContent = 'Copy text'; }, 2000);
}

export function confirmDelete() {
  return new Promise((resolve) => {
    refs.dialog.addEventListener('close', () => resolve(refs.dialog.returnValue === 'ok'), { once: true });
    refs.dialog.showModal();
  });
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function turnPage() {
  if (reduced()) return;
  const page = document.getElementById('page');
  page.classList.remove('turning');
  void page.offsetWidth;
  page.classList.add('turning');
  page.addEventListener('animationend', (e) => {
    if (e.target === page && e.animationName === 'turn') page.classList.remove('turning');
  });
}

export function animateRibbon(pinned) {
  const r = refs.ribbon;
  if (reduced()) return;
  r.classList.remove('unfurl', 'rollup');
  void r.offsetWidth;
  if (pinned) {
    r.classList.add('unfurl');
    r.addEventListener('animationend', () => r.classList.remove('unfurl'), { once: true });
  } else {
    r.hidden = false;
    r.classList.add('rollup');
    r.addEventListener('animationend', () => {
      if (!r.classList.contains('rollup')) return;
      r.hidden = true;
      r.classList.remove('rollup');
    }, { once: true });
  }
}

export function rowFor(id) {
  return [...refs.list.children].find((el) => el.dataset && el.dataset.id === id);
}

export function foldGhost(ghost, index, height) {
  if (reduced() || !ghost) return;
  ghost.classList.add('row-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.tabIndex = -1;
  ghost.removeAttribute('aria-current');
  ghost.style.setProperty('--h', `${height}px`);
  refs.list.insertBefore(ghost, refs.list.children[index] ?? null);
  ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
}
