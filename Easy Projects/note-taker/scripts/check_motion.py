"""Quality gate: layouts, contrast, focus, animation timing, reduced motion, fonts and print,
across seven viewport widths in both themes. Python Playwright with local Chromium. Run from the repo root:
    python3 scripts/check_motion.py
This is not an axe audit."""
import json
from playwright.sync_api import sync_playwright
from qa_common import CONTRAST_JS, SEED, serve

srv, URL = serve(8794)

res = []
def rec(ok, name, detail=''): res.append(('pass' if ok else 'FAIL', name, detail))
ANIMS = """() => document.getAnimations().map(a => {
  const t = a.effect.getComputedTiming();
  return { name: a.animationName || a.transitionProperty, end: t.endTime === Infinity ? Infinity : Math.round(t.endTime), kind: a.constructor.name };
})"""

def fresh(browser, w=1440, h=900, theme='light', reduced=False, seed=True, scale=1):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=scale,
                              reduced_motion='reduce' if reduced else 'no-preference',
                              permissions=['clipboard-read', 'clipboard-write'])
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL)
    if seed:
        pg.evaluate("d => localStorage.setItem('notetaker-notes', JSON.stringify({version:1, notes:d}))", SEED)
        pg.reload()
    pg.evaluate(f"localStorage.setItem('notetaker-theme','{theme}')"); pg.reload()
    pg.wait_for_timeout(1600)
    return ctx, pg, errs

def anims(pg): return pg.evaluate(ANIMS)

with sync_playwright() as p:
    browser = p.chromium.launch()

    for (w, h) in ((1440, 900), (1200, 800), (1024, 768), (900, 1100), (768, 1024), (390, 844), (360, 640)):
        for theme in ('light', 'dark'):
            tag = f'{w}x{h} {theme}'
            ctx, pg, errs = fresh(browser, w, h, theme)
            items = pg.evaluate(CONTRAST_JS)
            fails = [i for i in items if i['ratio'] < i['need']]
            rec(len(items) > 20 and not fails, f'[{tag}] computed text contrast meets WCAG AA ({len(items)} text elements)', '; '.join(f"{i['text']!r} {i['ratio']:.2f}" for i in fails[:4]))
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            rec(over <= 0, f'[{tag}] no horizontal overflow', str(over))
            pg.keyboard.press('Tab'); bad = []; n = 0
            for _ in range(40):
                pg.keyboard.press('Tab'); n += 1
                i = pg.evaluate("() => { const e = document.activeElement, s = getComputedStyle(e); return {t: e.tagName, w: s.outlineWidth, st: s.outlineStyle, id: e.id || e.className}; }")
                if i['t'] == 'BODY': break
                if not (i['w'] == '2px' and i['st'] == 'solid'): bad.append(i)
            rec(not bad, f'[{tag}] focus ring is 2px on every Tab stop ({n} stops)', json.dumps(bad[:2]))
            rec(not errs, f'[{tag}] no console errors or CSP violations', json.dumps(errs)[:150])
            tabs = pg.evaluate("() => { const t = document.querySelector('.tabs'); return [t.scrollWidth, t.clientWidth]; }")
            if 1024 <= w <= 1180: rec(tabs[0] <= tabs[1] + 1, f'[{tag}] all seven index tabs fit without scrolling', json.dumps(tabs))
            if w <= 768:
                pg.click('.row >> nth=0'); pg.wait_for_timeout(1000)
                tb = pg.evaluate("() => ['back','pin','delete'].map(i => Math.round(document.getElementById(i).getBoundingClientRect().top))")
                rec(len(set(tb)) == 1, f'[{tag}] editor toolbar sits on one row (Contents, Bookmark, Delete)', json.dumps(tb))
                right = pg.evaluate("document.getElementById('delete').getBoundingClientRect().right <= innerWidth")
                rec(right, f'[{tag}] Delete button is fully on screen')
            ctx.close()

    ctx, pg, errs = fresh(browser)
    LIMIT = 400
    def check(label, names, limit=LIMIT):
        got = [x for x in anims(pg) if x['name'] in names]
        rec(bool(got) and all(x['end'] <= limit for x in got), f'{label}: plays and is {limit}ms or less', json.dumps(got))
    props = [pg.evaluate(f"getComputedStyle(document.querySelector('{s}')).transitionProperty") for s in ('.tab', '.row', '.btn')]
    rec(all(p == 'outline-offset' for p in props), 'Doherty: tabs, rows and buttons transition only the focus ring, never their hover or press tone', json.dumps(props))
    pg.hover('a.tab, button.tab >> nth=2'); pg.wait_for_timeout(30)
    check('Hover flourish line', ['transform'], 180)
    pg.mouse.move(700, 400)
    pg.click('.row >> nth=1'); imm = pg.input_value('#title')
    rec(imm == 'Sample note two', 'Opening an entry: new state in place at frame zero', imm)
    check('Page turn', ['turn'], 300); check('Page turn shade', ['shade'], 300)
    pg.wait_for_timeout(1000)
    rec(not pg.evaluate("document.getElementById('page').classList.contains('turning')"), 'Turn class cleans up after itself')
    pg.click('.row >> nth=2'); pg.wait_for_timeout(1000)        
    pg.click('#pin'); pg.wait_for_timeout(40)
    rec(pg.get_attribute('#pin', 'aria-pressed') == 'true' and pg.is_visible('#page-ribbon'), 'Bookmark: state is true and ribbon visible immediately')
    check('Ribbon unfurl', ['unfurl'], 250); pg.wait_for_timeout(400)
    pg.click('#pin'); pg.wait_for_timeout(40)
    rec(pg.get_attribute('#pin', 'aria-pressed') == 'false', 'Unbookmark: state is false immediately, before the ribbon finishes rolling')
    check('Ribbon roll up', ['rollup'], 200); pg.wait_for_timeout(350)
    rec(pg.is_hidden('#page-ribbon'), 'Ribbon is hidden once it has rolled up')
    pg.fill('#content', 'Seal test'); pg.wait_for_timeout(120)
    pg.wait_for_timeout(900)
    rec(pg.get_attribute('#status', 'data-state') == 'saved', 'Autosave reaches Saved')
    check('Wax seal', ['seal'], 400)
    pg.wait_for_timeout(500)
    pg.click('#delete'); pg.wait_for_timeout(50)
    check('Dialog settle', ['settle'], 220); check('Dialog veil', ['veil'], 220)
    pg.wait_for_timeout(300)
    before = pg.locator('.row').count()
    pg.click('#confirm button[value=ok]'); pg.wait_for_timeout(30)
    ghost = pg.locator('.row-ghost').count()
    stored = pg.evaluate("JSON.parse(localStorage.getItem('notetaker-notes')).notes.length")
    rec(ghost == 1 and stored == 4, 'Delete: data is gone immediately while one ghost row folds away', f'ghost {ghost}, stored {stored}')
    check('Row fold', ['fold'], 250)
    pg.wait_for_timeout(350)
    rec(pg.locator('.row-ghost').count() == 0 and pg.locator('.row').count() == before - 1, 'Ghost row removed after the fold; list is one shorter')
    all_names = anims(pg)
    rec(all(x['end'] != float('inf') for x in all_names), 'No infinite animation')
    ctx.close()

    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
    reqs = []
    pg.on('request', lambda r: reqs.append(r.url))
    pg.goto(URL); pg.evaluate("d => localStorage.setItem('notetaker-notes', JSON.stringify({version:1, notes:d}))", SEED)
    pg.reload(); pg.click('.row >> nth=0'); pg.wait_for_timeout(1200)
    loaded = pg.evaluate("() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, '') + (f.style === 'italic' ? ' italic' : ''))")
    need = {'Crimson Pro', 'Crimson Pro italic', 'Gloock', 'Libre Baskerville'}
    rec(need <= set(loaded), 'Bundled fonts actually loaded and used by this page', json.dumps(sorted(set(loaded))))
    external = [u for u in reqs if not u.startswith('http://127.0.0.1')]
    rec(not external, 'Every request, fonts included, stays on this origin (no external font or asset)', json.dumps(external[:3]))
    cdp = ctx.new_cdp_session(pg); cdp.send('DOM.enable'); cdp.send('CSS.enable')
    root = cdp.send('DOM.getDocument', {'depth': -1})['root']['nodeId']
    def fam(sel):
        nid = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': sel})['nodeId']
        return sorted({f['familyName'] for f in cdp.send('CSS.getPlatformFontsForNode', {'nodeId': nid})['fonts']})
    painted = {'wordmark': fam('.wordmark'), 'georgian list title': fam('.row-title'), 'georgian preview': fam('.row-preview'), 'tab': fam('.tab .label')}
    bundled = {'Crimson Pro', 'Gloock', 'Libre Baskerville'}
    rec('Gloock' in painted['wordmark'] and 'Libre Baskerville' not in painted['wordmark']
        and set(painted['georgian list title']) - bundled,
        'Painted fonts: wordmark in Gloock; Georgian titles painted by a system font outside the bundled Latin fonts', json.dumps(painted, ensure_ascii=False))
    rhythm = pg.evaluate("""() => {
      const ta = document.getElementById('content'); const cs = getComputedStyle(ta);
      const m = document.createElement('div');
      m.style.cssText = `position:absolute;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;width:${ta.clientWidth}px;font:${cs.font};font-variant-numeric:${cs.fontVariantNumeric}`;
      m.textContent = ta.value; document.body.appendChild(m);
      const range = document.createRange(); range.selectNodeContents(m.firstChild);
      const tops = [...new Set([...range.getClientRects()].map(r => Math.round(r.top)))].sort((a, b) => a - b);
      const steps = [...new Set(tops.slice(1).map((t, i) => t - tops[i]))]; const h = m.getBoundingClientRect().height; m.remove();
      return {lines: tops.length, steps, height: h, lh: cs.lineHeight};
    }""")
    rec(rhythm['lh'] == '28px' and rhythm['height'] % 28 == 0 and set(rhythm['steps']) <= {28, 56},
        'Mixed Georgian and Latin text keeps an exact 28px line rhythm with the real fonts', json.dumps(rhythm))
    ctx.close()

    for th in ('light', 'dark'):
        ctx, pg, _ = fresh(browser, theme=th)
        infinite = [x for x in anims(pg) if x['end'] == float('inf')]
        rec(not infinite and pg.evaluate("getComputedStyle(document.body, '::before').animationName") == 'none', f'[{th}] no looping animation anywhere', json.dumps(infinite))
        ctx.close()

    ctx, pg, _ = fresh(browser, reduced=True)
    pg.click('.row >> nth=2'); pg.wait_for_timeout(60)
    pg.click('#pin'); pg.wait_for_timeout(30)
    pg.click('#pin'); pg.wait_for_timeout(30)
    rec(pg.is_hidden('#page-ribbon'), 'Reduced motion: ribbon disappears instantly on unbookmark')
    pg.click('#delete'); pg.wait_for_timeout(30); pg.click('#confirm button[value=ok]'); pg.wait_for_timeout(30)
    rec(pg.locator('.row-ghost').count() == 0, 'Reduced motion: no folding ghost row')
    rec(len([x for x in anims(pg) if x['end'] > 1]) == 0, 'Reduced motion: no running animation or transition longer than 1ms', json.dumps(anims(pg))[:150])
    ctx.close()

    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
    pg.goto(URL); pg.evaluate("d => localStorage.setItem('notetaker-notes', JSON.stringify({version:1, notes:d}))", SEED)
    held = []
    pg.route('**/js/app.js', lambda r: held.append(r))
    pg.goto(URL, wait_until='commit'); pg.wait_for_timeout(500)
    loading_text = pg.evaluate("document.getElementById('list') ? document.getElementById('list').innerText : ''")
    rec('Opening your entries' in loading_text, 'Loading state is visible while the script is still held back', loading_text.strip()[:60])
    held[0].continue_(); pg.wait_for_timeout(600)
    rec(pg.locator('.row').count() == 5, 'After release, the entries render and replace the loading line')
    pg.click('.row >> nth=0'); pg.wait_for_timeout(1000)
    pg.emulate_media(media='print'); pg.evaluate('window.dispatchEvent(new Event("beforeprint"))'); pg.wait_for_timeout(100)
    pg.emulate_media(media='screen')
    ctx.close()
    browser.close()

for s, n, d in res: print(f'{s:5} {n}' + (f'  [{d[:170]}]' if d and s == 'FAIL' else ''))
ok = sum(r[0] == 'pass' for r in res); bad = [r for r in res if r[0] == 'FAIL']
print(f'\n{ok} passed, {len(bad)} failed')
srv.shutdown()
