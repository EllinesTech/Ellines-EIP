/**
 * Generate Next.js Route Handler shims for every Cloudflare Pages Function.
 *
 * WHY
 * ---
 * In production Cloudflare Pages serves `functions/api/**` natively. Locally,
 * `apps/web/next.config.ts` rewrites all `/api/v1/*` to the NestJS identity
 * service and ASSUMES Next.js Route Handlers shadow that rewrite for
 * Pages-only routes. Those handlers never existed, so routes like
 * `/api/v1/dashboards` and `/api/v1/connectors/health` returned 404 locally
 * while working in production.
 *
 * Next.js matches filesystem routes BEFORE rewrites, so generating a thin shim
 * per Pages Function makes local behaviour match production. Each shim imports
 * and runs the ORIGINAL handler — there is no second implementation, and
 * `functions/` remains the single source of truth. Paths with no Pages Function
 * still fall through to the NestJS rewrite, exactly as intended.
 *
 * Usage:
 *   node scripts/generate-pages-shims.mjs            # write/update shims
 *   node scripts/generate-pages-shims.mjs --check    # verify nothing is stale
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_API = join(root, 'apps', 'web', 'functions', 'api');
const APP_API = join(root, 'apps', 'web', 'src', 'app', 'api');
const checkOnly = process.argv.includes('--check');
const cleanOnly = process.argv.includes('--clean');

/** Delete every generated shim (and prune the empty directories they leave). */
function cleanAll() {
  if (!existsSync(APP_API)) return 0;
  let n = 0;
  for (const f of walk(APP_API)) {
    if (f.endsWith('route.ts') && readFileSync(f, 'utf8').includes('GENERATED FILE')) {
      rmSync(f, { force: true });
      n += 1;
    }
  }
  const prune = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return false;
    }
    let allEmpty = true;
    for (const e of entries) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) {
        if (!prune(full)) allEmpty = false;
      } else {
        allEmpty = false;
      }
    }
    if (allEmpty && dir !== APP_API) {
      try {
        rmSync(dir, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    }
    return allEmpty;
  };
  prune(APP_API);
  return n;
}

// Production builds run `output: 'export'`, which ignores API Route Handlers —
// but Next still parses and compiles them, and a few of the Pages Functions are
// not statically analysable by webpack. The shims are therefore DEV-ONLY and the
// web `prebuild` step removes them before the production bundle.
if (cleanOnly) {
  const n = cleanAll();
  process.stdout.write(`Removed ${n} generated Pages shim(s) (production builds serve /api via Cloudflare Pages).\n`);
  process.exit(0);
}

/** Recursively collect every candidate .ts file under a directory. */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'test-support') continue;
      walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Map a Pages Function file to its Next.js route path.
 *
 *   api/v1/dashboards/index.ts               -> v1/dashboards
 *   api/v1/dashboards/[id].ts                -> v1/dashboards/[id]
 *   api/v1/dashboards/[id]/widgets/index.ts  -> v1/dashboards/[id]/widgets
 *   api/v1/dashboards/[id]/widgets/[wid].ts  -> v1/dashboards/[id]/widgets/[wid]
 */
function toRoutePath(file) {
  const rel = relative(FUNCTIONS_API, file).replace(/\\/g, '/');
  let p = rel.replace(/\.ts$/, '');
  p = p.replace(/\/index$/, '').replace(/^index$/, '');
  return p;
}

/** True when the module actually exports a Pages `onRequest` handler. */
function exportsOnRequest(file) {
  try {
    const src = readFileSync(file, 'utf8');
    return /export\s+(const|async\s+function|let)\s+onRequest\b/.test(src);
  } catch {
    return false;
  }
}

/**
 * Normalise dynamic segments to a single name per path position.
 *
 * Next.js rejects siblings that use different dynamic names
 * (`inbox/[accountId]/*` vs `inbox/[messageId]/*`), while Cloudflare Pages
 * allows it. For each "shape" (route with every dynamic segment replaced by `*`)
 * we pick one canonical name and record the aliases, so the generated shim can
 * re-publish the value under the original names.
 */
function buildSegmentAliases(routes) {
  // Group by PARENT path: Next.js requires every dynamic child of a given
  // directory to use the same name, regardless of what sits below it. So
  // `inbox/[accountId]/sync` and `inbox/[messageId]/read` conflict even though
  // their full shapes differ.
  const namesByParent = new Map(); // parentPath -> Set<names>
  const positionByParent = new Map();
  for (const r of routes) {
    const segs = r.split('/');
    segs.forEach((s, i) => {
      if (!s.startsWith('[')) return;
      const parent = segs.slice(0, i).join('/');
      if (!namesByParent.has(parent)) {
        namesByParent.set(parent, new Set());
        positionByParent.set(parent, i);
      }
      namesByParent.get(parent).add(s);
    });
  }
  const canonical = new Map(); // `${parent}#${i}` -> chosen name
  const aliases = new Map(); // chosen name -> [other names]
  for (const [parent, nameSet] of namesByParent) {
    const names = [...nameSet].sort();
    const chosen = names[0];
    const i = positionByParent.get(parent);
    canonical.set(`${parent}#${i}`, chosen);
    for (const n of names) {
      if (n === chosen) continue;
      if (!aliases.has(chosen)) aliases.set(chosen, []);
      aliases.get(chosen).push(n);
    }
  }
  return { canonical, aliases };
}

/** Apply the canonical segment names to a route path. */
function applyCanonical(routePath, canonical) {
  const segs = routePath.split('/');
  return segs
    .map((s, i) => {
      if (!s.startsWith('[')) return s;
      const parent = segs.slice(0, i).join('/');
      return canonical.get(`${parent}#${i}`) ?? s;
    })
    .join('/');
}

function renderShim(importPath, aliasMap) {
  const hasAliases = aliasMap && Object.keys(aliasMap).length > 0;
  const aliasesLiteral = hasAliases ? JSON.stringify(aliasMap, null, 2).replace(/\n/g, '\n') : '{}';
  return `// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run generate:pages-shims
//
// Runs the Cloudflare Pages Function for this route so local development matches
// the production Pages deployment. See src/lib/pages-fn-adapter.ts for why.

import { onRequest } from '${importPath}';
import { PAGE_HANDLER_META, expandParams, runPagesFunction } from '@/lib/pages-fn-adapter';

export const dynamic = PAGE_HANDLER_META.dynamic;
export const runtime = PAGE_HANDLER_META.runtime;

// Sibling dynamic segments are normalised to one Next.js name; re-publish the
// value under every name the original Cloudflare handler may read.
const PARAM_ALIASES: Record<string, string[]> = ${aliasesLiteral};

type Ctx = { params: Promise<Record<string, string>> };

async function handle(request: Request, ctx: Ctx) {
  const params = expandParams(await ctx.params, PARAM_ALIASES);
  return runPagesFunction(onRequest as never, request, params);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
`;
}

const files = walk(FUNCTIONS_API);
const targets = [];
const skipped = [];

for (const file of files) {
  const base = file.split(/[\\/]/).pop();
  // Cloudflare special files: _middleware, _worker, etc.
  if (base.startsWith('_')) {
    skipped.push(`${relative(FUNCTIONS_API, file)} (special file)`);
    continue;
  }
  if (!exportsOnRequest(file)) {
    skipped.push(`${relative(FUNCTIONS_API, file)} (no onRequest export)`);
    continue;
  }
  targets.push(file);
}

// Cloudflare Pages routing precedence: for a given URL it checks `<name>.ts`
// BEFORE `<name>/index.ts`, so a sibling file SHADOWS the directory index.
// Reproduce that exactly, otherwise the shim would serve a handler that
// production never runs.
const withRoute = targets.map((file) => ({ file, route: toRoutePath(file) }));
const shadowed = [];
const effective = [];
for (const entry of withRoute) {
  const dir = entry.file.split(/[\\/]/);
  const isIndex = dir.pop() === 'index.ts';
  if (isIndex) {
    const sibling = withRoute.find(
      (o) => o !== entry && o.route === entry.route && !o.file.split(/[\\/]/).pop().startsWith('index'),
    );
    if (sibling) {
      shadowed.push({
        index: relative(FUNCTIONS_API, entry.file),
        winner: relative(FUNCTIONS_API, sibling.file),
        route: entry.route,
      });
      continue;
    }
  }
  effective.push(entry.file);
}

// Next.js forbids two different dynamic-segment names at the same path position
// (Cloudflare does not), so normalise siblings to one name and re-publish the
// value under the original names inside the shim.
const { canonical, aliases } = buildSegmentAliases(effective.map(toRoutePath));
const normalisedRoutes = new Map();
for (const file of effective) normalisedRoutes.set(file, applyCanonical(toRoutePath(file), canonical));

// Normalisation can make two DISTINCT Cloudflare routes collapse onto one Next
// route — e.g. `inbox/[accountId]` and `inbox/[messageId]` both answer
// `/api/v1/inbox/<id>`. In production Cloudflare already resolves that ambiguity
// and only one ever runs, so we pick deterministically (alphabetically first,
// matching Cloudflare's ordering) and report it rather than flip-flopping.
const byOutput = new Map();
for (const file of effective) {
  const routePath = normalisedRoutes.get(file);
  if (!byOutput.has(routePath)) byOutput.set(routePath, []);
  byOutput.get(routePath).push(file);
}
const ambiguous = [];
const resolved = [];
for (const [routePath, files] of byOutput) {
  if (files.length === 1) {
    resolved.push(files[0]);
    continue;
  }
  const sorted = [...files].sort();
  const winner = sorted[0];
  resolved.push(winner);
  ambiguous.push({
    route: routePath,
    winner: relative(FUNCTIONS_API, winner),
    losers: sorted.slice(1).map((f) => relative(FUNCTIONS_API, f)),
  });
}

// Routes that ALREADY have a hand-written local-dev handler must not be
// regenerated: `src/pages/api/**` contains bespoke dev implementations (they use
// the `dev-auth` helper rather than delegating to a Pages Function), and having
// two handlers resolve the same path makes Next.js fail the build.
const EXISTING_DEV_ROUTES = new Set();
for (const [label, dir] of [
  ['src/pages/api', join(root, 'apps', 'web', 'src', 'pages', 'api')],
  ['src/app/api (hand-written)', APP_API],
]) {
  if (!existsSync(dir)) continue;
  for (const f of walk(dir)) {
    const rel = relative(dir, f).replace(/\\/g, '/');
    if (label.startsWith('src/app')) {
      if (!existsSync(f) || !readFileSync(f, 'utf8').includes('GENERATED FILE')) {
        EXISTING_DEV_ROUTES.add(rel.replace(/\.tsx?$/, '').replace(/\/index$/, ''));
      }
    } else {
      EXISTING_DEV_ROUTES.add(rel.replace(/\.tsx?$/, '').replace(/\/index$/, ''));
    }
  }
}

let written = 0;
let unchanged = 0;
let stale = 0;

for (const file of resolved) {
  const routePath = normalisedRoutes.get(file);
  if (EXISTING_DEV_ROUTES.has(routePath)) {
    skipped.push(`${relative(FUNCTIONS_API, file)} -> ${routePath} (hand-written dev route exists)`);
    continue;
  }
  const outFile = join(APP_API, `${routePath}/route.ts`);
  const importPath = relative(dirname(outFile), file).replace(/\\/g, '/').replace(/\.ts$/, '');
  const normalised = importPath.startsWith('.') ? importPath : `./${importPath}`;

  // Only the aliases relevant to THIS route's own dynamic segments.
  const segs = routePath.split('/');
  const aliasMap = {};
  segs.forEach((s) => {
    if (!s.startsWith('[')) return;
    const extra = aliases.get(s);
    if (extra && extra.length) aliasMap[s] = extra;
  });

  const content = renderShim(normalised, aliasMap);
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';

  if (current === content) {
    unchanged += 1;
    continue;
  }
  if (checkOnly) {
    stale += 1;
    process.stdout.write(`STALE  ${routePath}/route.ts\n`);
    continue;
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, content, 'utf8');
  written += 1;
}
// Remove shims whose Pages Function no longer exists.
let removed = 0;
if (existsSync(APP_API) && !checkOnly) {
  const wanted = new Set([...normalisedRoutes.values()].filter((r) => !EXISTING_DEV_ROUTES.has(r)));
  for (const routeFile of walk(APP_API)) {
    if (!routeFile.endsWith('route.ts')) continue;
    const rel = relative(APP_API, routeFile).replace(/\\/g, '/').replace(/\/?route\.ts$/, '');
    if (!wanted.has(rel) && readFileSync(routeFile, 'utf8').includes('GENERATED FILE')) {
      rmSync(routeFile, { force: true });
      removed += 1;
    }
  }
  // Prune directories left empty by the removals. Next.js refuses to boot when
  // an orphaned dynamic folder survives (e.g. a leftover `[messageId]/`) even
  // when it holds no route, so the tree must be cleaned, not just the files.
  const pruneEmpty = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return false;
    }
    let allEmpty = true;
    for (const e of entries) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) {
        if (!pruneEmpty(full)) allEmpty = false;
      } else {
        allEmpty = false;
      }
    }
    if (allEmpty && dir !== APP_API) {
      try {
        rmSync(dir, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    }
    return allEmpty;
  };
  pruneEmpty(APP_API);
}

process.stdout.write(`Pages Functions found: ${targets.length}\n`);
process.stdout.write(`  effective:  ${effective.length} (routed)\n`);
process.stdout.write(`  written:   ${written}\n`);
process.stdout.write(`  unchanged: ${unchanged}\n`);
if (removed) process.stdout.write(`  removed:   ${removed} (orphaned shims)\n`);
if (shadowed.length) {
  process.stdout.write(
    `  shadowed:  ${shadowed.length} — Cloudflare resolves <name>.ts before <name>/index.ts,\n` +
    `              so these index handlers are unreachable in production too:\n`,
  );
  for (const s of shadowed) {
    process.stdout.write(`    - ${s.route}: ${s.index} shadowed by ${s.winner}\n`);
  }
}
if (ambiguous.length) {
  process.stdout.write(
    `  ambiguous: ${ambiguous.length} — distinct Cloudflare routes that answer the SAME URL;\n` +
    `              Cloudflare already resolves these, so only the winner is served:\n`,
  );
  for (const a of ambiguous) {
    process.stdout.write(`    - ${a.route}: serving ${a.winner}; also shadowed: ${a.losers.join(', ')}\n`);
  }
}
if (skipped.length) {
  process.stdout.write(`  skipped:   ${skipped.length}\n`);
  for (const s of skipped.slice(0, 12)) process.stdout.write(`    - ${s}\n`);
}
if (checkOnly && stale > 0) {
  process.stdout.write(`\n${stale} shim(s) are stale. Run: npm run generate:pages-shims\n`);
  process.exit(1);
}
process.stdout.write(`\nLocal dev now serves ${effective.length} Pages Function route(s) directly, matching production.\n`);

