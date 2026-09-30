/**
 * Production-source audit: prevents fabricated business data returning to prod.
 *
 * EIP's core rule — real data, or an honest empty/unknown/error state. This
 * suite scans production source (excluding tests, fixtures and docs) and fails
 * on the specific patterns that previously let fake metrics through.
 *
 * Legitimate randomness (ID generation, retry jitter) is explicitly allowed:
 * a line is only a violation when randomness feeds a *business* value.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// __dirname is <repo>/apps/web/functions/__tests__ → repo root is 4 levels up.
const REPO = join(__dirname, '..', '..', '..', '..');
const ROOTS = [
  join(REPO, 'apps', 'web', 'functions'),
  join(REPO, 'apps', 'web', 'src'),
  join(REPO, 'packages'),
  join(REPO, 'services'),
];
const EXTS = new Set(['.ts', '.tsx']);
const SKIP = /node_modules|dist|\.next|coverage|\.kilo|__tests__|__mocks__|\.spec\.|\.test\.|prisma\/seed|test-support/;

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(p);
    else if (EXTS.has(name.slice(name.lastIndexOf('.')))) yield p;
  }
}

interface Violation {
  file: string;
  line: number;
  text: string;
  rule: string;
}

function scan(): Violation[] {
  const out: Violation[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = relative(REPO, file);
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((text, i) => {
        const push = (rule: string) => out.push({ file: rel, line: i + 1, text: text.trim(), rule });

        // 1. Dead demo enterprise payloads must never be imported.
        if (/from\s+['"].*demo-enterprise\.json['"]/.test(text)) {
          push('imports the deleted demo-enterprise.json payload');
        }
        // 2. Fabricated connection success with no real operation behind it.
        if (/Promise\.resolve\(\s*\{\s*connected:\s*true/.test(text)) {
          push('returns connected:true without performing a real connection');
        }
        // 3. Forced-minimum connected systems / health floors.
        if (/connectedSystems:\s*Math\.max\([^,]*,\s*1\s*\)/.test(text)) {
          push('forces connectedSystems to at least 1');
        }
        if (/Math\.max\(\s*10\s*,/.test(text) && /health/i.test(text)) {
          push('applies an artificial health floor of 10');
        }
        // 4. Invented health baselines.
        if (/(?:derived|baseline)\s*=\s*75\b/.test(text) && /health/i.test(text)) {
          push('uses a fabricated 75 health baseline');
        }
        // 5. Randomness feeding a *business* metric (not IDs or jitter).
        if (/Math\.random\(\)/.test(text)) {
          const isBusinessMetric =
            /(cpuUsage|memoryUsage|errorRate|responseTime|cpuPercent|memoryPercent|openConnections|latency|executionTime|healthScore|revenue|recordCount|score|value)\s*[:=]/.test(
              text,
            );
          const isIdOrJitter =
            /_\$\{|jitter|Date\.now\(\)|toString\(36\)|toString\(16\)|hash|nonce|token|shuffle|backoff/i.test(text);
          if (isBusinessMetric && !isIdOrJitter) {
            push('generates a business metric with Math.random()');
          }
        }
      });
    }
  }
  return out;
}

describe('production source contains no fabricated business data', () => {
  const violations = scan();

  it('actually scans production files (guards against a vacuous pass)', () => {
    // A wrong REPO path makes every root unreadable, so scan() would return []
    // and the suite would pass while checking nothing. Assert coverage.
    let fileCount = 0;
    for (const root of ROOTS) {
      for (const _ of walk(root)) fileCount++;
    }
    expect(fileCount).toBeGreaterThan(50);
  });

  it('reports what it found (informational, always runs)', () => {
    if (violations.length) {
      const lines = violations
        .map((v) => `  ${v.file}:${v.line}  [${v.rule}]\n      ${v.text.slice(0, 110)}`)
        .join('\n');
      // eslint-disable-next-line no-console
      console.error(`\nFabricated-data violations found (${violations.length}):\n${lines}\n`);
    }
    expect(Array.isArray(violations)).toBe(true);
  });

  it('has zero fabricated-data violations', () => {
    expect(violations).toEqual([]);
  });
});

describe('mojibake guard', () => {
  it('production source is free of corrupted UTF-8 sequences', () => {
    const bad: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8');
        if (/[\u00C2-\u00C3\u00E2-\u00EF\u00F0-\u00F4][\u0080-\u00BF\u20AC\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u2026]/.test(src)) {
          bad.push(relative(REPO, file));
        }
        if (src.includes('\uFFFD')) bad.push(`${relative(REPO, file)} (replacement char)`);
      }
    }
    expect(bad).toEqual([]);
  });
});
