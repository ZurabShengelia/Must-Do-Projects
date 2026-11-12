import { h, safeHref } from './dom.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { copyButton, confirmDialog, toast, formatNumber, formatDate, formatDateTime, stripScheme } from './ui.js';
import { reducedMotion } from './dom.js';

function linkRow(link, { onRemoved } = {}) {
  const dest = safeHref(link.destination);
  const tr = h('tr', {},
    h('td', { class: 'cell-main' }, h('div', { class: 'cell-short' },
      h('a', { href: `#/links/${encodeURIComponent(link.id)}`, title: 'View details and analytics' }, stripScheme(link.short_url)),
      copyButton(() => link.short_url, { label: `Copy ${stripScheme(link.short_url)}`, iconOnly: true }))),
    h('td', { class: 'dest-cell', 'data-label': 'To' },
      dest ? h('a', { class: 'dest-link', href: dest, target: '_blank', rel: 'noopener noreferrer nofollow', title: link.destination }, link.destination)
           : h('span', { class: 'dest-link' }, link.destination)),
    h('td', { class: 'col-num num', 'data-label': 'Clicks' }, formatNumber(link.clicks)),
    h('td', { 'data-label': 'Created' }, h('time', { datetime: link.created_at, title: formatDateTime(link.created_at) }, formatDate(link.created_at))),
    h('td', { class: 'col-actions' },
      h('a', { class: 'btn btn-ghost', href: `#/links/${encodeURIComponent(link.id)}` }, icon('chart'), 'Analytics'),
      h('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': `Delete ${stripScheme(link.short_url)}`, onclick: () => remove() }, icon('trash'), 'Delete')));

  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete this link?',
      message: `${stripScheme(link.short_url)} will stop working and its click data will be erased. This cannot be undone.`,
    });
    if (!ok) return;
    try {
      await api.deleteLink(link.id);
    } catch (err) {
      if (err.status !== 404) { toast(err.message, 'error'); return; }
    }
    toast('Link deleted.');
    if (!reducedMotion()) {
      const a = tr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
      await a.finished.catch(() => {});
    }
    tr.remove();
    if (onRemoved) onRemoved(link);
  }
  return tr;
}

export function linkTable(links, opts) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'links' },
    h('caption', { class: 'sr-only' }, 'Your short links'),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col' }, 'Short link'), h('th', { scope: 'col' }, 'Destination'),
      h('th', { scope: 'col', class: 'col-num' }, 'Clicks'), h('th', { scope: 'col' }, 'Created'),
      h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
    h('tbody', {}, links.map((l) => linkRow(l, opts)))));
}
