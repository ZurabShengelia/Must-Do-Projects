import { h, clear, safeHref } from '../dom.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { barChart, rankList, rangeText } from '../charts.js';
import { pixelLoader } from '../pixel.js';
import { copyButton, confirmDialog, toast, formatNumber, formatDateTime, stripScheme } from '../ui.js';

export function render({ params, navigate }) {
  const id = params[0];
  let days = 30;
  let seq = 0;
  const root = h('div', { class: 'container page' }, h('div', { class: 'loading-block' }, pixelLoader(), 'Loading link…'));

  async function load() {
    const mine = ++seq;
    try {
      const data = await api.linkAnalytics(id, days);
      if (mine !== seq) return;
      draw(data);
    } catch (err) {
      if (mine !== seq) return;
      clear(root);
      root.append(h('a', { class: 'crumb', href: '#/links' }, '← My links'),
        h('div', { class: 'empty' }, h('h1', {}, err.status === 404 ? 'Link not found' : 'Could not load this link'),
          h('p', {}, err.status === 404 ? 'It may have been deleted, or it belongs to a different account or browser.' : err.message),
          h('a', { class: 'btn btn-primary', href: '#/links' }, 'Back to my links')));
    }
  }

  function draw(data) {
    const link = data.link, dest = safeHref(link.destination);
    const range = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Time range' },
      [7, 30, 90].map((d) => h('label', {}, h('input', { type: 'radio', name: 'range', value: String(d), checked: d === days, onchange: () => { days = d; load(); } }), h('span', {}, `${d}d`))));

    const refs = data.referrers.map((r) => ({ label: r.host, count: r.count, title: r.host }));
    const refBlock = h('div', {},
      data.referrers.length ? rankList(refs) : h('p', { class: 'chart-empty' }, 'No referrer information yet.'),
      h('p', { class: 'note-small' }, `${formatNumber(data.no_referrer)} click${data.no_referrer === 1 ? '' : 's'} had no referrer (typed or pasted links, many apps, privacy settings). Referrers are hostnames only.`));

    clear(root);
    root.append(
      h('a', { class: 'crumb', href: '#/links' }, '← My links'),
      h('div', { class: 'detail-head' },
        h('span', { class: 'label' }, 'Short link'),
        h('div', { class: 'detail-short' }, stripScheme(link.short_url)),
        h('div', { class: 'form-actions' },
          copyButton(() => link.short_url, { label: 'Copy link' }),
          h('a', { class: 'btn', href: link.short_url, target: '_blank', rel: 'noopener' }, icon('external'), 'Open'),
          h('button', { class: 'btn btn-danger', type: 'button', onclick: remove }, icon('trash'), 'Delete'))),
      h('dl', { class: 'meta-list' },
        h('div', {}, h('dt', { class: 'label' }, 'Destination'), h('dd', {}, dest ? h('a', { href: dest, target: '_blank', rel: 'noopener noreferrer nofollow' }, link.destination) : link.destination)),
        h('div', {}, h('dt', { class: 'label' }, 'Created'), h('dd', {}, h('time', { datetime: link.created_at }, formatDateTime(link.created_at)))),
        h('div', {}, h('dt', { class: 'label' }, 'Status'), h('dd', {}, h('span', { class: 'badge ok' }, icon('check'), 'Active')))),
      h('section', { class: 'section', 'aria-labelledby': 'ck' },
        h('div', { class: 'chart-panel' },
          h('div', { class: 'chart-head' },
            h('div', {}, h('div', { class: 'label', id: 'ck' }, `Clicks, last ${days} days`), h('div', { class: 'big num' }, formatNumber(data.total)),
              h('div', { class: 'note-small' }, `${rangeText(data.series)} · ${formatNumber(link.clicks)} clicks all time`)),
            range),
          barChart(data.series, { name: `Clicks per day for ${stripScheme(link.short_url)}` }))),
      h('section', { class: 'section', 'aria-labelledby': 'rf' },
        h('div', { class: 'section-head' }, h('h2', { id: 'rf' }, 'Referrers')), refBlock));
  }

  async function remove() {
    if (!(await confirmDialog({ title: 'Delete this link?', message: 'The short link will stop working and its click data will be erased. This cannot be undone.' }))) return;
    try { await api.deleteLink(id); toast('Link deleted.'); navigate('/links'); }
    catch (err) { toast(err.message, 'error'); }
  }

  load();
  return root;
}
