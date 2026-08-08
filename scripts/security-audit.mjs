#!/usr/bin/env node
/**
 * Local security audit script — runs a subset of CI checks without
 * requiring Snyk/OWASP/CodeQL credentials.
 *
 * Usage:  node scripts/security-audit.mjs
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';

let exitCode = 0;

function run(label, cmd, opts = {}) {
  console.log(`\n${BOLD}${CYAN}▶ ${label}${RESET}`);
  console.log(`  ${cmd}\n`);
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    if (out.trim()) console.log(out.trim());
    console.log(`${GREEN}✓ ${label} passed${RESET}`);
    return { ok: true, output: out };
  } catch (err) {
    const output = err.stdout || err.message || '';
    if (output.trim()) console.log(output.trim());
    if (err.stderr?.trim()) console.error(err.stderr.trim());

    if (opts.failOnError !== false) {
      console.error(`${RED}✗ ${label} FAILED${RESET}`);
      exitCode = 1;
    } else {
      console.warn(`${YELLOW}⚠ ${label} completed with warnings${RESET}`);
    }
    return { ok: false, output };
  }
}

console.log(`\n${BOLD}═══════════════════════════════════════${RESET}`);
console.log(`${BOLD}  Ellines EIP — Security Audit${RESET}`);
console.log(`${BOLD}═══════════════════════════════════════${RESET}`);

// 1. npm audit
const auditResult = run(
  'npm audit (high+critical)',
  'npm audit --audit-level=high --json',
  { failOnError: false },
);

// Parse and print summary
try {
  const auditData = JSON.parse(auditResult.output || '{}');
  const vuln = auditData.metadata?.vulnerabilities || {};
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'reports', 'npm-audit.json'), JSON.stringify(auditData, null, 2));

  console.log('\n  Vulnerability summary:');
  for (const [sev, count] of Object.entries(vuln)) {
    const color = sev === 'critical' ? RED : sev === 'high' ? YELLOW : RESET;
    console.log(`  ${color}${sev}: ${count}${RESET}`);
    if ((sev === 'critical' || sev === 'high') && count > 0) exitCode = 1;
  }
} catch {
  // npm audit returned non-JSON (e.g., no vulnerabilities)
}

// 2. Check for obvious secret patterns in source files
run(
  'Secret pattern scan (basic)',
  `node -e "
    const fs = require('fs');
    const path = require('path');
    const patterns = [
      /api[_-]?key\\s*=\\s*['\\\`][A-Za-z0-9_\\-]{20,}/gi,
      /secret\\s*=\\s*['\\\`][A-Za-z0-9_\\-]{20,}/gi,
      /password\\s*=\\s*['\\\`][A-Za-z0-9_!@#$]{12,}/gi,
      /BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/g,
    ];
    const skipDirs = new Set(['node_modules', '.git', '.next', '.next-dev', 'dist', 'coverage', 'reports']);
    const skipFiles = new Set(['.env', '.env.local', '.env.example', '.env.supabase.backup', '.env.cloudflare']);
    let found = 0;
    function scan(dir) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (skipDirs.has(e.name) || e.name.startsWith('.')) {
          if (!['src','functions','scripts','packages','services','apps'].includes(e.name)) continue;
        }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { scan(full); continue; }
        if (skipFiles.has(e.name)) continue;
        if (!/\\.(ts|tsx|js|mjs|json|yml|yaml|toml)$/.test(e.name)) continue;
        let content;
        try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
        for (const p of patterns) {
          const matches = content.match(p);
          if (matches) {
            console.error('POTENTIAL SECRET in ' + full + ': ' + matches[0].substring(0, 60));
            found++;
          }
        }
      }
    }
    scan('.');
    if (found === 0) console.log('No obvious secrets found in source files.');
    else { console.error(found + ' potential secret(s) found — review above files'); process.exit(1); }
  "`,
);

// 3. Check .gitignore covers sensitive files
run(
  '.gitignore coverage check',
  `node -e "
    const fs = require('fs');
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    const required = ['.env', '.env.local', 'node_modules', '*.pem', '*.key'];
    const missing = required.filter(r => !gitignore.includes(r));
    if (missing.length === 0) {
      console.log('.gitignore covers all required patterns.');
    } else {
      console.error('Missing from .gitignore: ' + missing.join(', '));
      process.exit(1);
    }
  "`,
);

// 4. Check for known-bad dependency patterns
run(
  'Dependency health check',
  `node -e "
    const pkg = require('./package.json');
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const issues = [];
    // Check for wildcard versions in critical packages
    for (const [name, ver] of Object.entries(allDeps)) {
      if (ver === '*' || ver === 'latest') {
        issues.push(name + ': unpinned version (' + ver + ')');
      }
    }
    if (issues.length === 0) console.log('All root dependencies are pinned.');
    else { issues.forEach(i => console.warn('WARN: ' + i)); }
  "`,
  { failOnError: false },
);

// Done
console.log(`\n${BOLD}═══════════════════════════════════════${RESET}`);
if (exitCode === 0) {
  console.log(`${GREEN}${BOLD}  All security checks passed ✓${RESET}`);
} else {
  console.log(`${RED}${BOLD}  Security issues found — review above${RESET}`);
}
console.log(`${BOLD}═══════════════════════════════════════${RESET}\n`);
console.log(`  Full npm audit: reports/npm-audit.json`);
console.log(`  CI scans: .github/workflows/security-scan.yml\n`);

process.exit(exitCode);
