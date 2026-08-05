/**
 * Fix UTF-8 mojibake in TSX/TS source files.
 * Run: node scripts/fix-encoding.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src');

// Map of mojibake sequences → correct Unicode characters
const REPLACEMENTS = [
  ['\u00e2\u0080\u0099', '\u2019'], // â€™ → '
  ['\u00e2\u0080\u0098', '\u2018'], // â€˜ → '
  ['\u00e2\u0080\u009c', '\u201c'], // â€œ → "
  ['\u00e2\u0080\u009d', '\u201d'], // â€ → "
  ['\u00e2\u0080\u0094', '\u2014'], // â€" → —
  ['\u00e2\u0080\u0093', '\u2013'], // â€" → –
  ['\u00e2\u0086\u0092', '\u2192'], // â†' → →
  ['\u00c2\u00b7', '\u00b7'],       // Â· → ·
  ['\u00e2\u0080\u00a6', '\u2026'], // â€¦ → …
  ['\u00e2\u0080\u00a2', '\u2022'], // â€¢ → •
  ['\u00e2\u0096\u00b2', '\u25b2'], // â–² → ▲
  ['\u00e2\u0096\u00bc', '\u25bc'], // â–¼ → ▼
  ['\u00e2\u009c\u00a6', '\u2726'], // âœ¦ → ✦
  ['\u00f0\u009f\u0093\u00a1', '\ud83d\udce1'], // ðŸ"¡ → 📡
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

let fixed = 0;
for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [bad, good] of REPLACEMENTS) {
    if (src.includes(bad)) {
      src = src.split(bad).join(good);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('Fixed:', path.relative(process.cwd(), file));
    fixed++;
  }
}
console.log(`\nDone. Fixed ${fixed} file(s).`);
