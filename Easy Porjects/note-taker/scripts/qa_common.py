"""Shared helpers for the browser checks (Python Playwright). Imported by check_app.py and check_motion.py."""
import http.server
import pathlib
import socketserver
import tempfile
import threading

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(tempfile.gettempdir()) / 'notetaker-qa'
OUT.mkdir(exist_ok=True)

STORAGE_KEY = 'notetaker-notes'
THEME_KEY = 'notetaker-theme'


def serve(port):
    """Serve the repository on localhost. Returns (server, base_url_of_index)."""
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{port}/index.html'


def note(note_id, title, content, category, pinned, day):
    iso = f'2026-11-{day:02d}T10:00:00.000Z'
    return dict(id=note_id, title=title, content=content, category=category, isPinned=pinned, createdAt=iso, updatedAt=iso)


SEED = [
    note('a1', 'ქართული ანბანი', 'ა ბ გ დ ე ვ ზ თ ი კ ლ მ ნ ო პ ჟ რ ს ტ უ ფ ქ ღ ყ შ ჩ ც ძ წ ჭ ხ ჯ ჰ', 'Learning', True, 7),
    note('a2', 'Sample note two', 'Placeholder text.', 'Personal', True, 5),
    note('a3', 'Sample note three', 'Placeholder text.', 'Work', False, 6),
    note('a4', 'Sample note four', 'Placeholder text.', 'Ideas', False, 4),
    note('a5', 'Sample note five', 'Placeholder text.', 'General', False, 1),
]

CONTRAST_JS = r"""
() => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(',').map(s => parseFloat(s)); return {r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1}; };
  const lin = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  const L = c => 0.2126*lin(c.r) + 0.7152*lin(c.g) + 0.0722*lin(c.b);
  const bgOf = el => { for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.99) return {c, el: e}; } return null; };
  const out = []; const desk = parse(getComputedStyle(document.body).backgroundColor);
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (w.nextNode()) {
    const n = w.currentNode; if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    if (el.closest('dialog:not([open])') || el.closest('.visually-hidden') || el.closest('.print-only')) continue;
    const fg = parse(cs.color); const b = bgOf(el); if (!fg || !b) continue;
    const a = L(fg), z = L(b.c); const ratio = (Math.max(a,z)+0.05)/(Math.min(a,z)+0.05);
    const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
    const onDesk = b.c.r === desk.r && b.c.g === desk.g && b.c.b === desk.b;
    out.push({text: n.textContent.trim().slice(0, 30), ratio, need: large ? 3 : 4.5, onDesk,
              fg: cs.color, bg: b.el.className || b.el.tagName});
  }
  return out;
}
"""
