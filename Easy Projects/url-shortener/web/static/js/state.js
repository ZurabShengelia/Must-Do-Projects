export const session = {
  me: { authenticated: false, email: '', guest: false },
  listeners: new Set(),
  set(me) { this.me = me; this.listeners.forEach((fn) => fn(me)); },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};
