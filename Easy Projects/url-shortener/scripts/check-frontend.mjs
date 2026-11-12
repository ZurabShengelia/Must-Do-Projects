import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../web/static/', import.meta.url));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (p.includes('/vendor/') || p.includes('/fonts/')) continue;
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(root);

const problems = [];
const rules = [
  [/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\(/, 'unsafe HTML injection API'],
  [/\beval\(|new Function\(/, 'eval is not allowed'],
  [/setAttribute\(\s*['"]style['"]/, 'inline style attribute (blocked by the CSP)'],
  [/document\.cookie/, 'the frontend must not touch cookies'],
  [/\b(?:fetch|import|src|href)\b[^\n]{0,40}['"`]https?:\/\/(?!www\.w3\.org|opensource\.org)/, 'external network resource'],
  [/@import\s+url\(\s*['"]?https?:/, 'external stylesheet import'],
  [/localStorage\.(?:setItem|getItem|removeItem)\(\s*['"](?!theme['"])/, 'only the theme preference may be stored locally'],
];

let jsCount = 0;
for (const f of files) {
  const ext = extname(f), text = readFileSync(f, 'utf8'), rel = f.slice(root.length);
  if (ext === '.js') {
    jsCount++;
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { problems.push(`${rel}: syntax error\n${e.stderr}`); }
  }
  if (ext === '.js' || ext === '.css' || ext === '.html') {
    for (const [re, msg] of rules) if (re.test(text)) problems.push(`${rel}: ${msg} (${re})`);
  }
  if (ext === '.html') {
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) problems.push(`${rel}: inline <script>`);
    if (/<style[\s>]/i.test(text)) problems.push(`${rel}: inline <style>`);
    if (/\sstyle\s*=/i.test(text)) problems.push(`${rel}: inline style attribute`);
    if (/\son[a-z]+\s*=/i.test(text)) problems.push(`${rel}: inline event handler`);
    if (/(?:src|href)=["']https?:\/\/(?!opensource\.org)/i.test(text)) problems.push(`${rel}: external resource`);
  }
}
if (problems.length) { console.error('Frontend check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log(`Frontend check passed: ${files.length} files, ${jsCount} JavaScript modules, no rule violations.`);
