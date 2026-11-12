import { h, clear, reducedMotion } from './dom.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { brandMark } from './pixel.js';
import { session } from './state.js';
import { initTheme, cycleTheme, getChoice } from './theme.js';
import { toast } from './ui.js';

const routes = [
  { re: /^\/$/, nav: 'home', title: 'Short links, no tracking', load: () => import('./pages/landing.js') },
  { re: /^\/dashboard$/, nav: 'dashboard', title: 'Dashboard', load: () => import('./pages/dashboard.js') },
  { re: /^\/links$/, nav: 'links', title: 'My links', load: () => import('./pages/links.js') },
  { re: /^\/links\/([0-9a-f-]{36})$/i, nav: 'links', title: 'Link details', load: () => import('./pages/link-detail.js') },
  { re: /^\/analytics$/, nav: 'analytics', title: 'Analytics', load: () => import('./pages/analytics.js') },
  { re: /^\/login$/, nav: 'login', title: 'Log in', load: () => import('./pages/auth.js').then((m) => ({ render: (c) => m.renderAuth(c, 'login') })) },
  { re: /^\/register$/, nav: 'register', title: 'Create account', load: () => import('./pages/auth.js').then((m) => ({ render: (c) => m.renderAuth(c, 'register') })) },
  { re: /^\/settings$/, nav: 'settings', title: 'Settings', load: () => import('./pages/settings.js') },
];

const headerEl = document.getElementById('site-header');
const mainEl = document.getElementById('main');
let currentNav = 'home';
let menuOpen = false;
let navToken = 0;

export function navigate(path) { location.hash = '#' + path; }

const THEME_ICON = { light: 'sun', dark: 'moon', system: 'monitor' };

function renderHeader() {
  const me = session.me;
  const link = (path, key, label) => h('a', { class: 'nav-link', href: '#' + path, 'aria-current': currentNav === key ? 'page' : null }, label);

  const themeBtn = h('button', { class: 'nav-btn icon-btn', type: 'button', 'aria-label': `Theme: ${getChoice()}. Click to change.`,
    onclick: () => { cycleTheme(); } }, icon(THEME_ICON[getChoice()]));

  const nav = h('nav', { class: 'nav' + (menuOpen ? ' open' : ''), id: 'primary-nav', 'aria-label': 'Primary' },
    h('div', { class: 'nav-links' },
      link('/', 'home', 'Shorten'), link('/dashboard', 'dashboard', 'Dashboard'),
      link('/links', 'links', 'My links'), link('/analytics', 'analytics', 'Analytics')),
    h('span', { class: 'nav-sep', 'aria-hidden': 'true' }),
    me.authenticated
      ? [h('span', { class: 'account-email', title: me.email }, me.email), link('/settings', 'settings', 'Settings'),
         h('button', { class: 'nav-btn', type: 'button', onclick: logout }, icon('logout'), 'Log out')]
      : [link('/login', 'login', 'Log in'), link('/register', 'register', 'Sign up'), link('/settings', 'settings', 'Settings')],
    themeBtn);

  const toggle = h('button', { class: 'nav-btn icon-btn menu-toggle', type: 'button', 'aria-expanded': String(menuOpen), 'aria-controls': 'primary-nav', 'aria-label': menuOpen ? 'Close menu' : 'Open menu',
    onclick: () => { menuOpen = !menuOpen; renderHeader(); } }, icon(menuOpen ? 'x' : 'menu'));

  headerEl.replaceChildren(h('div', { class: 'container bar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'url-shortener home' }, brandMark(), h('span', { class: 'brand-text' }, 'url', h('span', {}, '-'), 'shortener')),
    toggle, nav));
}

async function logout() {
  try {
    await api.logout();
    session.set({ authenticated: false, email: '', guest: false });
    toast('You have been logged out.');
    navigate('/');
  } catch (err) { toast(err.message, 'error'); }
}

async function route() {
  const token = ++navToken;
  const path = (location.hash.slice(1) || '/').split('?')[0];
  let match = null, params = [];
  for (const r of routes) { const m = r.re.exec(path); if (m) { match = r; params = m.slice(1); break; } }

  menuOpen = false;
  currentNav = match ? match.nav : '';
  renderHeader();

  let pageEl;
  if (!match) {
    pageEl = h('div', { class: 'container page' }, h('div', { class: 'empty' }, h('h1', {}, 'Page not found'), h('p', {}, 'That page does not exist.'), h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to start')));
    document.title = 'Not found · url-shortener';
  } else {
    try {
      const mod = await match.load();
      if (token !== navToken) return;
      pageEl = mod.render({ params, navigate, session });
      document.title = `${match.title} · url-shortener`;
    } catch {
      if (token !== navToken) return;
      pageEl = h('div', { class: 'container page' }, h('div', { class: 'empty' }, h('h1', {}, 'Could not load this page'), h('p', {}, 'Check your connection and try again.'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => route() }, 'Try again')));
    }
  }
  pageEl.classList.add('page-in');

  const swap = () => { clear(mainEl); mainEl.append(pageEl); window.scrollTo(0, 0); };
  if (document.startViewTransition && !reducedMotion()) document.startViewTransition(swap); else swap();
  mainEl.focus({ preventScroll: true });
}

async function boot() {
  initTheme();
  renderHeader();
  try { session.set(await api.me()); } catch { }
  session.subscribe(renderHeader);
  document.addEventListener('themechange', renderHeader);
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) { menuOpen = false; renderHeader(); } });
  route();
}
boot();
