import { h } from '../dom.js';
import { api, ApiError } from '../api.js';
import { session } from '../state.js';
import { getChoice, setTheme } from '../theme.js';
import { fieldError, toast } from '../ui.js';
import { icon } from '../icons.js';

function themeBlock() {
  const current = getChoice();
  const opt = (value, label) => h('label', {}, h('input', { type: 'radio', name: 'theme', value, checked: current === value, onchange: () => { setTheme(value); toast(`Theme: ${label.toLowerCase()}.`); } }), h('span', {}, label));
  return h('section', { class: 'setting-block', 'aria-labelledby': 'theme-h' },
    h('h2', { id: 'theme-h' }, 'Appearance'),
    h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Theme' }, opt('light', 'Light'), opt('dark', 'Dark'), opt('system', 'System')),
    h('p', { class: 'hint note-small' }, 'System follows your device setting. Your choice is saved in this browser only.'));
}

function accountBlock() {
  const me = session.me;
  if (!me.authenticated) {
    return h('section', { class: 'setting-block', 'aria-labelledby': 'acct-h' },
      h('h2', { id: 'acct-h' }, 'Account'),
      h('div', { class: 'callout' }, icon('info'), h('div', {},
        h('p', {}, 'You are using url-shortener as a guest. Your links belong to a private, random token stored in this browser (an HttpOnly cookie, kept for up to 180 days of inactivity).'),
        h('p', {}, 'Clearing cookies or switching browsers means you lose access to those links, and they are deleted after the guest session expires. An account avoids that.'))),
      h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-primary', href: '#/register' }, 'Create an account'), h('a', { class: 'btn', href: '#/login' }, 'Log in')));
  }
  return h('section', { class: 'setting-block', 'aria-labelledby': 'acct-h' },
    h('h2', { id: 'acct-h' }, 'Account'),
    h('dl', { class: 'kv' }, h('dt', {}, 'Email'), h('dd', {}, me.email)));
}

function securityBlock() {
  if (!session.me.authenticated) return null;
  const field = (id, label, autocomplete, hint) => {
    const input = h('input', { class: 'input', id, type: 'password', autocomplete, required: true, maxlength: '128', 'aria-describedby': hint ? `${id}-hint` : null });
    const slot = h('div');
    return { input, slot, el: h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null, slot) };
  };
  const cur = field('pw-cur', 'Current password', 'current-password');
  const nw = field('pw-new', 'New password', 'new-password', 'At least 10 characters. Other devices will be signed out.');
  const conf = field('pw-conf', 'Confirm new password', 'new-password');
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Change password');
  const setErr = (f, msg) => { f.slot.replaceChildren(...(msg ? [fieldError(f.input.id + '-msg', msg)] : [])); f.input.setAttribute('aria-invalid', msg ? 'true' : 'false'); };

  const form = h('form', { novalidate: true }, cur.el, nw.el, conf.el, h('div', { class: 'form-actions' }, submit));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    [cur, nw, conf].forEach((f) => setErr(f, ''));
    if (!cur.input.value) { setErr(cur, 'Enter your current password.'); cur.input.focus(); return; }
    if (nw.input.value.length < 10) { setErr(nw, 'Use at least 10 characters.'); nw.input.focus(); return; }
    if (nw.input.value === cur.input.value) { setErr(nw, 'Choose a password different from the current one.'); nw.input.focus(); return; }
    if (conf.input.value !== nw.input.value) { setErr(conf, 'The passwords do not match.'); conf.input.focus(); return; }
    submit.disabled = true; submit.setAttribute('aria-busy', 'true');
    try { await api.changePassword(cur.input.value, nw.input.value); form.reset(); toast('Password changed. Other devices were signed out.'); }
    catch (err) {
      if (err instanceof ApiError && err.fields.current_password) { setErr(cur, err.fields.current_password); cur.input.focus(); }
      else if (err instanceof ApiError && err.fields.new_password) { setErr(nw, err.fields.new_password); nw.input.focus(); }
      else toast(err.message, 'error');
    } finally { submit.disabled = false; submit.removeAttribute('aria-busy'); }
  });

  return h('section', { class: 'setting-block', 'aria-labelledby': 'sec-h' },
    h('h2', { id: 'sec-h' }, 'Security'),
    h('p', { class: 'lead' }, 'Change your password. Every other signed-in device is logged out.'),
    form);
}

export function render() {
  return h('div', { class: 'container page' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Settings')),
    h('div', { class: 'settings-grid' }, accountBlock(), themeBlock(), securityBlock()));
}
