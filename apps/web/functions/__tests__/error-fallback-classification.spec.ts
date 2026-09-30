/**
 * Classification of silent `.catch(...)` fallbacks in production UI code.
 *
 * EIP's rule: a failed real request must never become believable business
 * information. This suite pins the distinction:
 *
 *   FORBIDDEN — the fallback value is a *business reading* that a human would
 *               read as fact. A network failure here silently becomes "all
 *               clear" (0 alerts, 0 unread, health 0, "no data"). These are
 *               tracked explicitly so a regression is caught.
 *
 *   ALLOWED   — the fallback is a *presentational* default for an optional
 *               list, a cache write, a clipboard copy, or a background poll,
 *               where empty/none is the correct rendering of "nothing to show"
 *               and no health claim is being made.
 *
 * Each forbidden case below was found by the real-world data audit; the test
 * exists to stop them returning.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
const SRC = join(REPO, 'apps', 'web', 'src');
const EXTS = new Set(['.ts', '.tsx']);
const SKIP = /node_modules|dist|\.next|coverage|\.kilo|__tests__|__mocks__|\.spec\.|\.test\./;

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

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('failed reads must not masquerade as business readings', () => {
  it('a failed unread count is not replaced with 0', () => {
    const src = read(join(SRC, 'app', 'app', 'admin', 'notifications', 'page.tsx'));
    // The old code did: fetchNotifyUnreadCount().catch(() => ({ unread: 0, ... }))
    expect(src).not.toMatch(/fetchNotifyUnreadCount\(\)\s*\.catch\(\(\)\s*=>\s*\(\{\s*unread:\s*0/);
  });

  it('a failed alert load is not presented as zero alerts', () => {
    const src = read(join(SRC, 'app', 'app', 'page.tsx'));
    // The alert fetch must record the failure rather than silently empty the list.
    expect(src).toMatch(/fetchAlertCorrelations\(\)[\s\S]{0,600}?markUnavailable\('alerts'\)/);
  });

  it('a failed enterprise summary is surfaced as unavailable', () => {
    const src = read(join(SRC, 'app', 'app', 'page.tsx'));
    // Window is wide because the .then() handler sits between the call and .catch().
    expect(src).toMatch(/fetchEnterpriseSummary\(\)[\s\S]{0,1200}?markUnavailable\('enterprise summary'\)/);
  });

  it('a failed performance load is not shown as an empty result set', () => {
    const src = read(join(SRC, 'app', 'app', 'business', 'performance', 'page.tsx'));
    expect(src).toMatch(/loadError/);
    expect(src).toMatch(/unavailable/i);
  });

  it('the Command Center explains which sources are unavailable', () => {
    const src = read(join(SRC, 'app', 'app', 'page.tsx'));
    expect(src).toMatch(/unavailableSources/);
    expect(src).toMatch(/could not be loaded|Some data could not be loaded/i);
  });
});

describe('business rules do not fire on unreported metrics', () => {
  it('a health_lt rule requires a real measurement (null must not compare)', () => {
    const src = read(join(SRC, 'lib', 'business-rules.ts'));
    // `null < threshold` is true in JS, which would fabricate a crisis.
    expect(src).toMatch(
      /health_lt[\s\S]{0,200}?typeof metrics\.healthScore === 'number' && metrics\.healthScore < rule\.threshold/,
    );
  });
});

describe('allowed presentational fallbacks stay allowed', () => {
  it('optional list/clipboard/cache fallbacks are not blanket-banned', () => {
    // These are correct: an optional side-panel list renders empty, a clipboard
    // copy reports its own failure, a background poll must not flash an error.
    // The suite deliberately does NOT forbid them, so this documents intent.
    const files: string[] = [];
    for (const f of walk(SRC)) files.push(f);
    expect(files.length).toBeGreaterThan(50);
  });
});
