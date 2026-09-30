/**
 * Redact live-looking demo credentials from documentation.
 *
 * A password committed to docs is a real credential in the repository. This
 * replaces them with a pointer to the environment variables that provide them,
 * preserving each file's exact bytes/encoding (no BOM injection, no re-encoding
 * of the surrounding text).
 *
 * Run: node scripts/redact-doc-credentials.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

const FILES = [
  '07_Demo_Login.md',
  '08_Live_Identity_Setup.md',
  '18_Final_Status_Production_Ready.md',
  '19_Executive_Summary_v1.0_Complete.md',
];

// Values that must never appear literally in committed documentation.
const SECRETS = [
  ['EllinesDemo2026!', '<set DEMO_PASSWORD>'],
  ['demo@ellines.co.ke', '<set DEMO_EMAIL>'],
];

let total = 0;
for (const name of FILES) {
  const path = join(DOCS, name);
  let src;
  try {
    src = readFileSync(path, 'utf8');
  } catch {
    console.log(`skip (missing): ${name}`);
    continue;
  }
  const before = src;
  for (const [secret, placeholder] of SECRETS) {
    // Split-join avoids regex escaping issues with special characters.
    src = src.split(secret).join(placeholder);
  }
  if (src !== before) {
    // utf8 without BOM: preserves the file exactly apart from the replacements.
    writeFileSync(path, src, 'utf8');
    const n = before.split('EllinesDemo2026!').length - 1;
    console.log(`redacted ${name} (${n} password occurrence(s))`);
    total += n;
  } else {
    console.log(`no change: ${name}`);
  }
}
console.log(`\nDone. ${total} password occurrence(s) redacted.`);
