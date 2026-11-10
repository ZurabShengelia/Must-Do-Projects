import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from 'node:fs';
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
test('css braces are balanced',()=>{
  let d=0;for(const ch of css.replace(/url\([^)]*\)/g,'')){if(ch==='{')d++;if(ch==='}')d--;assert.ok(d>=0,'extra }')}
  assert.equal(d,0,'unclosed {');
});
test('css has key rules',()=>{for(const s of['.bg{','.recent{','.skel{','@font-face'])assert.ok(css.includes(s),s)});
test('no rule is nested inside a stray @media',()=>{assert.ok(!/@media[^{]*\{[^{}]*@media/.test(css),'nested @media')});
test('light and dark themes define the same colour tokens',()=>{
  const names=b=>new Set([...b.matchAll(/(--[a-z0-9-]+):/g)].map(m=>m[1]));
  const dark=css.match(/\n:root\{([^}]*)\}/)[1],light=css.match(/:root\[data-theme=light\]\{([^}]*)\}/)[1];
  const d=names(dark),l=names(light);
  for(const k of['--bg','--glass','--glass-2','--fill','--line','--text','--mute','--acc','--shade'])assert.ok(d.has(k)&&l.has(k),k+' missing in a theme');
});
test('every weather condition has an atmosphere tint in both themes',()=>{
  for(const w of['clear','cloud','rain','snow','storm','fog'])assert.ok(css.includes(':root[data-wx='+w+']')&&css.includes(':root[data-theme=light][data-wx='+w+']'),w)});
test('reduced motion is respected and body uses tabular numbers',()=>{assert.ok(/prefers-reduced-motion:reduce/.test(css));assert.ok(css.includes('tabular-nums'))});
