import { reducedMotion } from './dom.js';

const KEY = 'theme';
const mq = window.matchMedia('(prefers-color-scheme: dark)');

export function getChoice() {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v; } catch { }
  return 'system';
}

function resolve(choice) { return choice === 'dark' || (choice === 'system' && mq.matches) ? 'dark' : 'light'; }

function applyTheme(choice, animate = false) {
  const root = document.documentElement;
  if (animate && !reducedMotion()) {
    root.classList.add('theme-anim');
    setTimeout(() => root.classList.remove('theme-anim'), 300);
  }
  root.dataset.theme = choice;
  root.dataset.mode = resolve(choice);
  document.dispatchEvent(new CustomEvent('themechange'));
}

export function setTheme(choice) {
  try { if (choice === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch { }
  applyTheme(choice, true);
}

export function initTheme() {
  applyTheme(getChoice());
  mq.addEventListener('change', () => { if (getChoice() === 'system') applyTheme('system', true); });
}

export function cycleTheme() {
  const order = ['light', 'dark', 'system'];
  const next = order[(order.indexOf(getChoice()) + 1) % order.length];
  setTheme(next);
  return next;
}
