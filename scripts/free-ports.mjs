/**
 * Free a TCP listen port before local `npm run dev`.
 * Stops EADDRINUSE from leftover next/nest processes after crashed or killed sessions.
 */
import { execSync } from 'node:child_process';

const ports = process.argv.slice(2).map(Number).filter((p) => Number.isInteger(p) && p > 0);
if (ports.length === 0) {
  console.error('Usage: node scripts/free-ports.mjs <port> [port...]');
  process.exit(1);
}

function pidsListeningOnWindows(port) {
  try {
    const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      // e.g. TCP    0.0.0.0:3100    0.0.0.0:0    LISTENING    18436
      const m = line.trim().split(/\s+/);
      if (m.length < 5) continue;
      const local = m[1] || '';
      if (!local.endsWith(`:${port}`)) continue;
      const pid = Number(m[m.length - 1]);
      if (pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function pidsListeningOnUnix(port) {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out
      .split(/\r?\n/)
      .map((s) => Number(s.trim()))
      .filter((pid) => pid > 0);
  } catch {
    return [];
  }
}

const isWin = process.platform === 'win32';
for (const port of ports) {
  const pids = isWin ? pidsListeningOnWindows(port) : pidsListeningOnUnix(port);
  for (const pid of pids) {
    try {
      if (isWin) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      else process.kill(pid, 'SIGKILL');
      console.log(`freed :${port} (pid ${pid})`);
    } catch {
      console.warn(`could not kill pid ${pid} on :${port}`);
    }
  }
}
