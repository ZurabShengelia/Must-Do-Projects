import { h } from '../dom.js';
import { shortenForm } from '../shorten.js';
import { isoIllustration, bounceCube } from '../iso.js';
import { successMark } from '../pixel.js';

const FEATURES = [
  ['No account needed', 'Shorten a link right away. A private, HttpOnly cookie in your browser remembers which links are yours.'],
  ['Counts you can trust', 'Every click is counted once per redirect. No guessing, no made-up visitor numbers.'],
  ['Private by design', 'We store a timestamp and the referring hostname. Never IP addresses, never fingerprints.'],
  ['Open source', 'MIT licensed, runs on Go and PostgreSQL, and makes no third-party requests.'],
];

export function render() {
  const art = h('div', { class: 'hero-art' }, isoIllustration());
  const onCreated = () => bounceCube(art.querySelector('svg'));
  const form = shortenForm({ onCreated });

  const hero = h('section', { class: 'hero' },
    h('div', { class: 'container hero-grid' },
      h('div', {},
        h('p', { class: 'eyebrow label' }, successMark(2), 'Free · open source · no tracking'),
        h('h1', {}, 'Long links in. ', h('span', { class: 'mark' }, 'Short links out.')),
        h('p', { class: 'lede' }, 'Paste a URL, get a short link you can copy and share. No sign-up required.'),
        form.el),
      art));

  const features = h('section', { class: 'features', 'aria-labelledby': 'why' },
    h('div', { class: 'container' },
      h('h2', { id: 'why', class: 'sr-only' }, 'Why url-shortener'),
      h('ol', { class: 'feature-list' }, FEATURES.map(([title, text], i) =>
        h('li', { class: 'feature' }, h('span', { class: 'n', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
          h('div', {}, h('h3', {}, title), h('p', {}, text)))))));

  return h('div', {}, hero, h('div', { class: 'dither', 'aria-hidden': 'true' }), features);
}
