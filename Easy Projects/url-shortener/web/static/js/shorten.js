import { h, safeHref, reducedMotion } from './dom.js';
import { api, ApiError } from './api.js';
import { icon } from './icons.js';
import { successMark, pixelLoader } from './pixel.js';
import { copyButton, fieldError, toast, stripScheme } from './ui.js';
import { session } from './state.js';

let uid = 0;

export function shortenForm({ onCreated, withResult = true } = {}) {
  const id = ++uid;
  const urlId = `url-${id}`, aliasId = `alias-${id}`, aliasWrap = `alias-wrap-${id}`;
  const host = location.host;

  const urlInput = h('input', { class: 'input', id: urlId, name: 'url', type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://example.com/a/very/long/link', 'aria-describedby': `${urlId}-err` });
  const aliasInput = h('input', { class: 'input', id: aliasId, name: 'alias', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'my-link', maxlength: '32', 'aria-describedby': `${aliasId}-hint ${aliasId}-err` });
  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Shorten');
  const urlErr = h('div', { id: `${urlId}-err` });
  const aliasErr = h('div', { id: `${aliasId}-err` });
  const resultHost = h('div', { 'aria-live': 'polite' });

  const toggle = h('button', { type: 'button', class: 'alias-toggle', 'aria-expanded': 'false', 'aria-controls': aliasWrap },
    h('span', { class: 'caret' }, icon('caret')), 'Custom alias (optional)');
  const aliasField = h('div', { class: 'field', id: aliasWrap, hidden: true },
    h('label', { for: aliasId }, 'Custom alias'),
    h('div', { class: 'input-prefix' }, h('span', { class: 'prefix', 'aria-hidden': 'true' }, host + '/'), aliasInput),
    h('p', { class: 'hint', id: `${aliasId}-hint` }, '3–32 letters, numbers, hyphens or underscores. Aliases are not case-sensitive.'),
    aliasErr);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    aliasField.hidden = !open;
    if (open) aliasInput.focus();
  });

  const showError = (input, slot, msg) => {
    slot.replaceChildren(...(msg ? [fieldError(`${input.id}-msg`, msg)] : []));
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  urlInput.addEventListener('input', () => showError(urlInput, urlErr, ''));
  aliasInput.addEventListener('input', () => showError(aliasInput, aliasErr, ''));

  const form = h('form', { class: 'shorten', novalidate: true },
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', { for: urlId }, 'Paste a long URL'), urlInput, urlErr),
      submit),
    toggle, aliasField,
    h('p', { class: 'limits' }, 'Only http:// and https:// links. Links are validated, never fetched.'));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showError(urlInput, urlErr, ''); showError(aliasInput, aliasErr, '');
    const url = urlInput.value.trim();
    const alias = aliasInput.value.trim();
    if (!url) { showError(urlInput, urlErr, 'Enter a URL to shorten.'); urlInput.focus(); return; }
    if (!/^https?:\/\//i.test(url)) { showError(urlInput, urlErr, 'Start the URL with http:// or https://.'); urlInput.focus(); return; }

    submit.disabled = true; submit.setAttribute('aria-busy', 'true');
    submit.replaceChildren(pixelLoader(), 'Shortening…');
    try {
      const link = await api.createLink(url, alias);
      if (withResult) renderResult(resultHost, link, url);
      urlInput.value = ''; aliasInput.value = '';
      document.dispatchEvent(new CustomEvent('link:created', { detail: link }));
      if (onCreated) onCreated(link);
      if (!session.me.authenticated && !session.me.guest) session.set({ ...session.me, guest: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields.url) { showError(urlInput, urlErr, err.fields.url); urlInput.focus(); }
      else if (err instanceof ApiError && err.fields.alias) {
        toggle.setAttribute('aria-expanded', 'true'); aliasField.hidden = false;
        showError(aliasInput, aliasErr, err.fields.alias); aliasInput.focus();
      } else toast(err.message || 'Could not shorten that link.', 'error');
    } finally {
      submit.disabled = false; submit.removeAttribute('aria-busy');
      submit.replaceChildren('Shorten');
    }
  });

  return { el: h('div', {}, form, resultHost), input: urlInput };
}

function renderResult(host, link, originalUrl) {
  const copy = copyButton(() => link.short_url, { label: 'Copy link' });
  const dest = safeHref(link.destination);
  const card = h('section', { class: 'result', 'aria-label': 'Your short link' },
    h('div', { class: 'result-head' }, successMark(2), h('span', { class: 'label' }, 'Link created')),
    h('div', { class: 'short' },
      h('a', { class: 'short-url', href: link.short_url, target: '_blank', rel: 'noopener' }, stripScheme(link.short_url)), copy),
    h('p', { class: 'dest' }, 'Redirects to ', dest ? h('a', { href: dest, target: '_blank', rel: 'noopener noreferrer nofollow' }, link.destination) : link.destination),
    h('div', { class: 'form-actions' },
      h('a', { class: 'btn btn-ghost', href: `#/links/${encodeURIComponent(link.id)}` }, icon('chart'), 'Analytics')),
    !session.me.authenticated ? h('p', { class: 'note-small' }, 'Saved in this browser. ', h('a', { href: '#/register' }, 'Create an account'), ' to keep your links on every device.') : null);

  host.replaceChildren(card);
  if (reducedMotion()) return;

  const ghost = h('div', { class: 'ghost', 'aria-hidden': 'true' }, h('span', {}, originalUrl));
  card.append(ghost);
  const long = ghost.firstElementChild;
  ghost.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
  long.style.transformOrigin = 'left center';
  long.animate([{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(0.12)', opacity: 0.2 }],
    { duration: 380, easing: 'cubic-bezier(0.6,0,0.3,1)', fill: 'forwards' })
    .onfinish = () => ghost.remove();
  card.querySelector('.short').animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
    { duration: 380, delay: 120, easing: 'steps(12, end)', fill: 'backwards' });
}
