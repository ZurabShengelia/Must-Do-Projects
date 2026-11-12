import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { shortenForm } from '../shorten.js';
import { linkTable } from '../linktable.js';
import { pixelLoader, logoMark } from '../pixel.js';
import { formatNumber, toast, animateIn } from '../ui.js';
import { session } from '../state.js';

export function render() {
  const statValues = {};
  const stat = (key, label, note) => {
    const value = h('div', { class: 'value num' }, '–');
    statValues[key] = value;
    return h('div', { class: 'stat' }, h('div', { class: 'label' }, label), value, h('div', { class: 'note' }, note));
  };
  const recent = h('div', {}, h('div', { class: 'loading-block' }, pixelLoader(), 'Loading your links…'));

  let seq = 0;
  const loadAll = async () => {
    const mine = ++seq;
    try {
      const [sum, list] = await Promise.all([api.summary(30), api.listLinks({ limit: 5 })]);
      if (mine !== seq) return;
      const set = (k, v) => { statValues[k].textContent = formatNumber(v); statValues[k].classList.remove('updated'); void statValues[k].offsetWidth; statValues[k].classList.add('updated'); };
      set('links', sum.total_links); set('clicks', sum.total_clicks); set('active', sum.active_links);
      clear(recent);
      if (list.data.length === 0) {
        recent.append(h('div', { class: 'empty' }, logoMark(), h('h3', {}, 'No links yet'), h('p', {}, 'Paste a URL above to create your first short link. It will show up here.')));
      } else {
        const table = linkTable(list.data, { onRemoved: loadAll });
        recent.append(table);
        animateIn(table);
      }
    } catch (err) {
      if (mine !== seq) return;
      clear(recent);
      recent.append(h('div', { class: 'callout error', role: 'alert' }, err.message));
      toast(err.message, 'error');
    }
  };

  const form = shortenForm({ onCreated: loadAll, withResult: true });
  const page = h('div', { class: 'container page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Dashboard'),
      h('p', {}, session.me.authenticated ? 'Your links and how they are doing.' : 'Links made in this browser. Create an account to keep them on every device.'))),
    form.el,
    h('section', { class: 'section', 'aria-labelledby': 'ov' },
      h('div', { class: 'section-head' }, h('h2', { id: 'ov' }, 'Overview')),
      h('div', { class: 'stats' },
        stat('links', 'Total links', 'currently active'),
        stat('clicks', 'Total clicks', 'all time'),
        stat('active', 'Active links', 'clicked in the last 30 days'))),
    h('section', { class: 'section', 'aria-labelledby': 'rc' },
      h('div', { class: 'section-head' }, h('h2', { id: 'rc' }, 'Recent links'), h('a', { href: '#/links' }, 'View all')),
      recent));
  loadAll();
  return page;
}
