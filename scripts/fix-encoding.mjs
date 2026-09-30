/**
 * Fix UTF-8 mojibake in source files.
 *
 * Root cause: text was written as UTF-8, then decoded as **cp1252** (the
 * Windows-1252 code page), so the three UTF-8 bytes for an em dash (E2 80 94)
 * became the three characters `â € ”`. The repair encodes each character back
 * to its cp1252 byte and re-decodes the run as UTF-8.
 *
 * Safety: a repair is only accepted when the run re-decodes as valid UTF-8 and
 * produces no replacement/control characters. Legitimate text (Swahili, accented
 * Latin, CJK, currency, emoji) never matches the mojibake signature and is
 * therefore never touched. `--check` reports without writing.
 *
 * Run:   node scripts/fix-encoding.mjs
 * Check: node scripts/fix-encoding.mjs --check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const CHECK_ONLY = process.argv.includes('--check');

/** Directories to scan. Explicit, so vendor/generated trees are excluded. */
const ROOTS = [
  path.join(REPO, 'apps', 'web', 'src'),
  path.join(REPO, 'apps', 'web', 'functions'),
  path.join(REPO, 'packages'),
  path.join(REPO, 'services'),
  path.join(REPO, 'scripts'),
  path.join(REPO, 'docs'),
];
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.css', '.prisma', '.yml', '.yaml']);
const SKIP = /(node_modules|dist|\.next|coverage|\.kilo|\.git|__tests__|\.dev-logs)/;

/** cp1252 bytes 0x80-0x9F map to these characters (not their Latin-1 values). */
const CP1252_HIGH = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};
const CP1252_REVERSE = new Map(Object.entries(CP1252_HIGH).map(([cp, b]) => [Number(cp), b]));

/**
 * A mojibake run: a cp1252 lead byte (0xC2-0xC3, 0xE2-0xEF) followed by
 * continuation bytes, which appear either as C1 controls (0x80-0x9F if the
 * file was read as latin-1) or as cp1252 punctuation (0x20AC, 0x201C, ...).
 */
const LEAD = '\\u00C2-\\u00C3\\u00E2-\\u00EF\\u00F0-\\u00F4';
const CONT =
  '\\u0080-\\u009F' + // latin-1 C1 controls
  '\\u00A0-\\u00BF' + // latin-1 supplement
  '\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160' +
  '\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014' +
  '\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178';
const MOJIBAKE = new RegExp(`[${LEAD}][${CONT}]*`, 'g');

/** Map a character back to the byte it was decoded from. */
function toByte(ch) {
  const cp = ch.codePointAt(0) ?? 0;
  if (CP1252_REVERSE.has(cp)) return CP1252_REVERSE.get(cp);
  if (cp <= 0xff) return cp;
  return null;
}

/** Re-decode a latin-1/cp1252-mangled run back to its original UTF-8 text. */
function repairRun(run) {
  const bytes = [];
  for (const ch of run) {
    const b = toByte(ch);
    if (b === null) return null; // not a mojibake run — leave it alone
    bytes.push(b);
  }
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return null; // not valid UTF-8, so this was real text
  }
  if (/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(decoded)) return null;
  return decoded;
}

function fixText(src) {
  let changed = false;
  const out = src.replace(MOJIBAKE, (run) => {
    const fixed = repairRun(run);
    if (fixed === null || fixed === run) return run;
    changed = true;
    return fixed;
  });
  return { out, changed };
}

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) yield* walk(p);
    else if (EXTS.has(path.extname(e.name))) yield p;
  }
}

let fixed = 0;
const remaining = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    const { out, changed } = fixText(src);
    if (!changed) continue;
    if (CHECK_ONLY) remaining.push(path.relative(REPO, file));
    else {
      fs.writeFileSync(file, out, 'utf8');
      console.log('Fixed:', path.relative(REPO, file));
    }
    fixed++;
  }
}

if (CHECK_ONLY) {
  if (remaining.length) {
    console.error(`\n${remaining.length} file(s) still contain mojibake:`);
    for (const f of remaining) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('No mojibake found.');
} else {
  console.log(`\nDone. Fixed ${fixed} file(s).`);
}

