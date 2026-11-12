import { h } from '../dom.js';
import { api, ApiError } from '../api.js';
import { session } from '../state.js';
import { fieldError, toast } from '../ui.js';
import { pixelLoader } from '../pixel.js';

export function renderAuth({ navigate }, mode) {
  const isLogin = mode === 'login';
  const email = h('input', { class: 'input', id: 'auth-email', name: 'email', type: 'email', autocomplete: 'email', required: true, 'aria-describedby': 'auth-email-err', autocapitalize: 'off', spellcheck: 'false' });
  const password = h('input', { class: 'input', id: 'auth-password', name: 'password', type: 'password', autocomplete: isLogin ? 'current-password' : 'new-password', required: true, 'aria-describedby': 'auth-password-hint auth-password-err', maxlength: '128' });
  const emailErr = h('div', { id: 'auth-email-err' }), passErr = h('div', { id: 'auth-password-err' }), formErr = h('div', { 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, isLogin ? 'Log in' : 'Create account');

  const setErr = (input, slot, msg) => { slot.replaceChildren(...(msg ? [fieldError(input.id + '-msg', msg)] : [])); input.setAttribute('aria-invalid', msg ? 'true' : 'false'); };

  const form = h('form', { class: 'auth-card', novalidate: true },
    h('h1', {}, isLogin ? 'Log in' : 'Create your account'),
    isLogin ? null : h('p', { class: 'alt' }, 'Optional. Accounts let you reach your links from any device. Links you already made in this browser move into your account.'),
    h('div', { class: 'field' }, h('label', { for: 'auth-email' }, 'Email'), email, emailErr),
    h('div', { class: 'field' }, h('label', { for: 'auth-password' }, 'Password'), password,
      isLogin ? null : h('p', { class: 'hint', id: 'auth-password-hint' }, 'At least 10 characters. A few random words work well.'), passErr),
    formErr, submit,
    h('p', { class: 'alt' }, isLogin ? 'No account yet? ' : 'Already registered? ', h('a', { href: isLogin ? '#/register' : '#/login' }, isLogin ? 'Create one' : 'Log in')));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setErr(email, emailErr, ''); setErr(password, passErr, ''); formErr.replaceChildren();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { setErr(email, emailErr, 'Enter a valid email address.'); email.focus(); return; }
    if (!password.value) { setErr(password, passErr, 'Enter your password.'); password.focus(); return; }
    if (!isLogin && password.value.length < 10) { setErr(password, passErr, 'Use at least 10 characters.'); password.focus(); return; }
    submit.disabled = true; submit.setAttribute('aria-busy', 'true'); submit.replaceChildren(pixelLoader(), 'Please wait…');
    try {
      const me = await (isLogin ? api.login : api.register)(email.value.trim(), password.value);
      session.set({ authenticated: true, email: me.email, guest: false });
      toast(isLogin ? 'Welcome back.' : 'Account created.');
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.fields.email) { setErr(email, emailErr, err.fields.email); email.focus(); }
      else if (err instanceof ApiError && err.fields.password) { setErr(password, passErr, err.fields.password); password.focus(); }
      else formErr.replaceChildren(fieldError('auth-form-err', err.message));
    } finally {
      submit.disabled = false; submit.removeAttribute('aria-busy'); submit.replaceChildren(isLogin ? 'Log in' : 'Create account');
    }
  });
  return h('div', { class: 'container auth-wrap' }, form);
}
