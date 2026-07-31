/**
 * Fail fast if any Cloudflare Pages Function relative import does not resolve.
 * Broken import depths break production /api/v1 at runtime even when Next build passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'functions');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const importRe = /from\s+['"](\.[^'"]+)['"]/g;
const files = walk(root);
const missing = [];
let ok = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = importRe.exec(src))) {
    const rel = match[1];
    const base = path.resolve(path.dirname(file), rel);
    const candidates = [base, `${base}.ts`, `${base}.js`, `${base}.json`, path.join(base, 'index.ts')];
    if (!candidates.some((c) => fs.existsSync(c))) {
      missing.push(`${path.relative(process.cwd(), file).replace(/\\/g, '/')} -> ${rel}`);
    } else {
      ok += 1;
    }
  }
}

if (missing.length) {
  console.error('Pages Functions import check FAILED:');
  for (const line of missing) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`Pages Functions import check OK (${files.length} files, ${ok} relative imports).`);
