import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { linkTable } from '../linktable.js';
import { pixelLoader, logoMark } from '../pixel.js';
import { toast, animateIn } from '../ui.js';

const PAGE = 10;

export function render() {
  const state = { q: '', filter: 'all', sort: 'newest', offset: 0 };
  const body = h('div', {}, h('div', { class: 'loading-block' }, pixelLoader(), 'Loading…'));
  const pager = h('div', { class: 'pager' });
  let seq = 0, timer = null;

  async function load() {
    const mine = ++seq;
    try {
      const { data, meta } = await api.listLinks({ q: state.q, filter: state.filter === 'all' ? '' : state.filter, sort: state.sort, limit: PAGE, offset: state.offset });
      if (mine !== seq) return;
      clear(body); clear(pager);
      if (data.length === 0 && state.offset > 0) { state.offset = Math.max(0, state.offset - PAGE); return load(); }
      if (data.length === 0) {
        const filtered = state.q || state.filter !== 'all';
        body.append(h('div', { class: 'empty' }, logoMark(),
          h('h3', {}, filtered ? 'No links match' : 'No links yet'),
          h('p', {}, filtered ? 'Try a different search or filter.' : 'Links you create show up here.'),
          filtered ? null : h('a', { class: 'btn btn-primary', href: '#/' }, 'Create a link')));
        return;
      }
      const table = linkTable(data, { onRemoved: () => load() });
      body.append(table); animateIn(table);
      const from = meta.offset + 1, to = meta.offset + data.length;
      pager.append(h('span', { class: 'num' }, `${from}–${to} of ${meta.total}`),
        h('div', { class: 'btns' },
          h('button', { class: 'btn', type: 'button', disabled: meta.offset === 0, onclick: () => { state.offset = Math.max(0, state.offset - PAGE); load(); } }, 'Previous'),
          h('button', { class: 'btn', type: 'button', disabled: to >= meta.total, onclick: () => { state.offset += PAGE; load(); } }, 'Next')));
    } catch (err) {
      if (mine !== seq) return;
      clear(body); body.append(h('div', { class: 'callout error', role: 'alert' }, err.message));
      toast(err.message, 'error');
    }
  }

  const search = h('input', { class: 'input', type: 'search', id: 'link-search', placeholder: 'Search links', 'aria-label': 'Search links', autocomplete: 'off', maxlength: '100',
    oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); state.offset = 0; load(); }, 250); } });
  const select = (label, key, options) => h('select', { class: 'select', 'aria-label': label,
    onchange: (e) => { state[key] = e.target.value; state.offset = 0; load(); } },
    options.map(([v, t]) => h('option', { value: v }, t)));

  const page = h('div', { class: 'container page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'My links')),
      h('a', { class: 'btn btn-primary', href: '#/' }, icon('plus'), 'New link')),
    h('div', { class: 'toolbar', role: 'search' },
      h('div', { class: 'search' }, icon('search'), search),
      select('Filter by clicks', 'filter', [['all', 'All links'], ['clicked', 'With clicks'], ['unclicked', 'No clicks yet']]),
      select('Sort', 'sort', [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['clicks', 'Most clicks']])),
    body, pager);
  load();
  return page;
}
