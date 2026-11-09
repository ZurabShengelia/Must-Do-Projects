"""Contrast ratios (WCAG 2.x) for the NoteTaker palette. Prints a markdown table."""
def lum(h):
    h = h.lstrip('#'); r, g, b = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    f = lambda c: c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la+0.05)/(lb+0.05)
THEMES = {
 'Victorian parchment (light)': dict(page='#F6EEDC', sunk='#E8D8B8', leather='#35251C', leather_hover='#46321F',
   on_leather='#EFE4CB', brass='#B49A65', ink='#39281D', heading='#2B1D14', muted='#6B563F', rule_strong='#6B563F',
   oxblood='#702332', on_oxblood='#F8F1DF', oxblood_hover='#511722', gilt='#8C7040', ribbon='#702332',
   focus='#702332', focus_leather='#F6EEDC'),
 'Candlelit library (dark)': dict(page='#2B231C', sunk='#382E25', leather='#1A1310', leather_hover='#2A1F18',
   on_leather='#E9DDC3', brass='#C2A96E', ink='#EEE4CD', heading='#F4EBD6', muted='#BBAD92', rule_strong='#8F8068',
   oxblood='#8E2C3C', on_oxblood='#FAF1DF', oxblood_hover='#A33447', gilt='#C9A55A', ribbon='#C04558',
   focus='#E6A3AD', focus_leather='#F4EBD6'),
}
def rows(t):
    r = [
     ('Ink on page', t['ink'], t['page'], 4.5, 'note text, titles'),
     ('Heading ink on page', t['heading'], t['page'], 4.5, 'entry title, dialog titles'),
     ('Ink on selected row', t['ink'], t['sunk'], 4.5, 'selected and hovered rows'),
     ('Muted ink on page', t['muted'], t['page'], 4.5, 'dates, categories, counts, placeholders'),
     ('Muted ink on selected row', t['muted'], t['sunk'], 4.5, 'meta line of the selected row'),
     ('Cream on leather', t['on_leather'], t['leather'], 4.5, 'index tabs, wordmark'),
     ('Cream on leather, hovered tab', t['on_leather'], t['leather_hover'], 4.5, 'index tab hover'),
     ('Page color on oxblood', t['on_oxblood'], t['oxblood'], 4.5, 'New entry label'),
     ('Page color on oxblood, hovered', t['on_oxblood'], t['oxblood_hover'], 4.5, 'New entry hover'),
     ('Button and input border on page', t['rule_strong'], t['page'], 3.0, 'non-text, 1px borders'),
     ('Focus ring on page', t['focus'], t['page'], 3.0, 'non-text'),
     ('Focus ring on leather', t['focus_leather'], t['leather'], 3.0, 'non-text'),
     ('Bookmark ribbon on page', t['ribbon'], t['page'], 3.0, 'non-text'),
     ('Gilt ornaments on page', t['gilt'], t['page'], 3.0, 'corners, dividers: decorative only, never text'),
     ('Brass stitching on leather', t['brass'], t['leather'], 3.0, 'decorative only, never text'),
    ]
    return [(n, f, b, ratio(f, b), need, use) for n, f, b, need, use in r]
if __name__ == '__main__':
    for name, t in THEMES.items():
        print(f'\n### {name}\n\n| Pair | Foreground | Background | Ratio | Needs | Result | Used for |\n|---|---|---|---|---|---|---|')
        for n, f, b, r, need, use in rows(t):
            res = 'pass' if r >= need else 'fail'
            print(f'| {n} | {f} | {b} | {r:.2f}:1 | {need}:1 | {res} | {use} |')
