import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { barChart, rankList, rangeText } from '../charts.js';
import { pixelLoader, logoMark } from '../pixel.js';
import { formatNumber, toast, stripScheme } from '../ui.js';

export function render() {
  let days = 30;
  let seq = 0;
  const body = h('div', {}, h('div', { class: 'loading-block' }, pixelLoader(), 'Loading analytics…'));

  async function load() {
    const mine = ++seq;
    try {
      const d = await api.summary(days);
      if (mine !== seq) return;
      clear(body);
      if (d.total_links === 0) {
        body.append(h('div', { class: 'empty' }, logoMark(), h('h3', {}, 'Nothing to analyse yet'), h('p', {}, 'Create a link and share it. Real click statistics will appear here.'), h('a', { class: 'btn btn-primary', href: '#/' }, 'Create a link')));
        return;
      }
      const top = d.top_links.map((l) => ({ label: h('a', { href: `#/links/${encodeURIComponent(l.id)}` }, stripScheme(`/${l.code}`)), count: l.clicks, title: l.destination }));
      body.append(
        h('div', { class: 'chart-panel' },
          h('div', { class: 'chart-head' }, h('div', {}, h('div', { class: 'label' }, `Total clicks, last ${days} days`), h('div', { class: 'big num' }, formatNumber(d.total)), h('div', { class: 'note-small' }, rangeText(d.series))), rangeControl()),
          barChart(d.series)),
        h('div', { class: 'two-col section' },
          h('section', { 'aria-labelledby': 'tl' }, h('div', { class: 'section-head' }, h('h2', { id: 'tl' }, 'Top-performing links')),
            top.length ? rankList(top) : h('p', { class: 'chart-empty' }, 'No clicks in this period yet.')),
          h('section', { 'aria-labelledby': 'rf' }, h('div', { class: 'section-head' }, h('h2', { id: 'rf' }, 'Referrers')),
            d.referrers.length ? rankList(d.referrers.map((r) => ({ label: r.host, count: r.count, title: r.host }))) : h('p', { class: 'chart-empty' }, 'No referrer information yet.'),
            h('p', { class: 'note-small' }, `${formatNumber(d.no_referrer)} clicks had no referrer. Hostnames only. These are click counts, not unique visitors: we do not track visitors.`))));
    } catch (err) {
      if (mine !== seq) return;
      clear(body); body.append(h('div', { class: 'callout error', role: 'alert' }, err.message)); toast(err.message, 'error');
    }
  }

  const rangeControl = () => h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Time range' },
    [7, 30, 90].map((n) => h('label', {}, h('input', { type: 'radio', name: 'range', value: String(n), checked: n === days, onchange: () => { days = n; load(); } }), h('span', {}, `${n}d`))));

  load();
  return h('div', { class: 'container page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Analytics'), h('p', {}, 'Click counts and referrer hostnames across all of your links.'))), body);
}
