"""Rebuild assets/fonts/ and css/fonts.css from the original font files (needs: pip install fonttools).
Example:
  python3 scripts/build_fonts.py --ofl-dir ~/fonts/ofl

Sources and licences (see docs/FONTS.md):
  Crimson Pro, Gloock       SIL OFL 1.1, no Reserved Font Name: subsetted to Latin and converted to WOFF.
  Libre Baskerville         SIL OFL 1.1 WITH Reserved Font Name: copied UNMODIFIED (subsetting would count as a
                            modified version and would require a new name).
WOFF2 would be smaller but needs the brotli module; WOFF works in every current browser."""
import argparse, pathlib, shutil
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(description='Rebuild assets/fonts/ and css/fonts.css from the original font files.')
ap.add_argument('--ofl-dir', required=True, type=pathlib.Path, help='folder with CrimsonPro-*.ttf, Gloock-Regular.ttf, LibreBaskerville-Regular.ttf and the matching *-OFL.txt files')
args = ap.parse_args()
CANVAS = args.ofl_dir
OUT = ROOT / 'assets' / 'fonts'; LIC = OUT / 'LICENSES'
LIC.mkdir(parents=True, exist_ok=True)

LATIN = ('U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2027,U+2030-203A,U+2044,U+20AC,U+2116,U+2122,U+2190-2193,'
         'U+2212,U+25C6,U+00B6,U+00A7')

def make(src, dst, unicodes):
    opts = subset.Options(); opts.flavor = 'woff'; opts.layout_features = ['*']; opts.name_IDs = ['*']
    opts.notdef_outline = True; opts.glyph_names = False; opts.hinting = False; opts.legacy_kern = True
    font = TTFont(src)
    sub = subset.Subsetter(opts); sub.populate(unicodes=subset.parse_unicodes(unicodes)); sub.subset(font)
    font.flavor = 'woff'; font.save(dst)
    print(f'{dst.name:34} {dst.stat().st_size / 1024:6.1f} KB')

make(CANVAS / 'CrimsonPro-Regular.ttf', OUT / 'CrimsonPro-Regular.latin.woff', LATIN)
make(CANVAS / 'CrimsonPro-Italic.ttf', OUT / 'CrimsonPro-Italic.latin.woff', LATIN)
make(CANVAS / 'Gloock-Regular.ttf', OUT / 'Gloock-Regular.latin.woff', LATIN)
shutil.copy(CANVAS / 'LibreBaskerville-Regular.ttf', OUT / 'LibreBaskerville-Regular.ttf')
print(f'{"LibreBaskerville-Regular.ttf":34} {(OUT / "LibreBaskerville-Regular.ttf").stat().st_size / 1024:6.1f} KB (unmodified)')
for n in ('CrimsonPro', 'Gloock', 'LibreBaskerville'):
    shutil.copy(CANVAS / f'{n}-OFL.txt', LIC / f'{n}-OFL.txt')

css = """@font-face { font-family: 'Crimson Pro'; src: url('../assets/fonts/CrimsonPro-Regular.latin.woff') format('woff'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Crimson Pro'; src: url('../assets/fonts/CrimsonPro-Italic.latin.woff') format('woff'); font-weight: 400; font-style: italic; font-display: swap; }
@font-face { font-family: 'Gloock'; src: url('../assets/fonts/Gloock-Regular.latin.woff') format('woff'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Libre Baskerville'; src: url('../assets/fonts/LibreBaskerville-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }
"""
(ROOT / 'css' / 'fonts.css').write_text(css)
print('wrote css/fonts.css')
