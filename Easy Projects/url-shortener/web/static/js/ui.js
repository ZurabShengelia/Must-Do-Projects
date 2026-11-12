import { h, reducedMotion } from './dom.js';
import { icon } from './icons.js';
import { successMark, errorMark } from './pixel.js';

export function toast(message, type = 'success') {
  const host = document.getElementById('toasts');
  const mark = type === 'error' ? errorMark(2) : successMark(2);
  const el = h('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' },
    mark, h('div', { class: 'toast-msg' }, message),
    h('button', { type: 'button', 'aria-label': 'Dismiss notification', onclick: () => remove() }, icon('x')));
  let timer = setTimeout(() => remove(), type === 'error' ? 7000 : 4000);
  function remove() {
    clearTimeout(timer);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 160);
  }
  host.append(el);
  while (host.children.length > 3) host.firstElementChild.remove();
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  const dlg = document.getElementById('confirm-dialog');
  dlg.querySelector('#confirm-title').textContent = title;
  dlg.querySelector('#confirm-message').textContent = message;
  const ok = dlg.querySelector('#confirm-ok');
  ok.textContent = confirmLabel;
  ok.className = danger ? 'btn btn-danger-solid' : 'btn btn-primary';
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'confirm'), { once: true });
    dlg.returnValue = 'cancel';
    dlg.showModal();
    dlg.querySelector('#confirm-cancel').focus();
  });
}

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch { }
  }
  const ta = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', readonly: true });
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

function burst(button) {
  if (reducedMotion()) return;
  const dirs = [[-14, -16], [0, -20], [14, -16], [-18, -4], [18, -4], [0, 14]];
  const rect = button.getBoundingClientRect();
  for (const [dx, dy] of dirs) {
    const p = h('span', { class: 'burst', 'aria-hidden': 'true' });
    p.style.left = rect.width / 2 - 2 + 'px';
    p.style.top = rect.height / 2 - 2 + 'px';
    button.append(p);
    p.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px)`, opacity: 0 }],
      { duration: 380, easing: 'steps(5, end)' }).onfinish = () => p.remove();
  }
}

export function copyButton(getText, { label = 'Copy', iconOnly = false, className = '' } = {}) {
  const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: `btn copy-btn ${iconOnly ? 'icon-btn btn-ghost' : ''} ${className}`.trim(), 'aria-label': iconOnly ? label : null });
  const render = (copied) => {
    btn.dataset.copied = copied ? 'true' : 'false';
    btn.replaceChildren(icon(copied ? 'check' : 'copy'), iconOnly ? '' : h('span', {}, copied ? 'Copied' : label), live);
  };
  let timer = null;
  btn.addEventListener('click', async () => {
    const ok = await writeClipboard(getText());
    if (!ok) { toast('Could not copy automatically. Select the link and copy it manually.', 'error'); return; }
    render(true);
    live.textContent = 'Copied to clipboard';
    burst(btn);
    clearTimeout(timer);
    timer = setTimeout(() => { render(false); live.textContent = ''; }, 1800);
  });
  render(false);
  return btn;
}

const nf = new Intl.NumberFormat();
export const formatNumber = (n) => nf.format(n);
export const formatDate = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
export const formatDateTime = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
export const stripScheme = (u) => u.replace(/^https?:\/\//i, '');

export function fieldError(id, message) {
  return h('p', { class: 'field-error', id, role: 'alert' }, errorMark(2), h('span', {}, message));
}

export function animateIn(el, delay = 0) {
  if (reducedMotion()) return;
  el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
    { duration: 250, delay, easing: 'cubic-bezier(0.2,0.7,0.2,1)', fill: 'backwards' });
}
