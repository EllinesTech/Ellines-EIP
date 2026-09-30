/**
 * Minimal Chrome DevTools Protocol driver — no npm dependencies.
 *
 * Node 22+ ships a native WebSocket, and Chrome is already installed on most
 * developer machines, so real browser verification needs no extra tooling.
 * This launches headless Chrome, attaches to the page target, and exposes
 * navigate/evaluate/click/screenshot primitives over CDP.
 */

import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try {
      accessSync(p);
      return p;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchBrowser({ port = 9222, headless = true } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome/Chromium binary found. Set CHROME_PATH.');

  const userDataDir = mkdtempSync(join(tmpdir(), 'eip-cdp-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');

  const proc = spawn(chrome, args, { stdio: 'ignore' });

  // Wait for the debugger endpoint.
  let wsUrl = null;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const info = await res.json();
      wsUrl = info.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  if (!wsUrl) {
    proc.kill();
    throw new Error('Chrome DevTools endpoint did not become available');
  }

  return new Browser(proc, port, userDataDir, wsUrl);
}

class Browser {
  constructor(proc, port, userDataDir, browserWsUrl) {
    this.proc = proc;
    this.port = port;
    this.userDataDir = userDataDir;
    this.browserWsUrl = browserWsUrl;
  }

  async newPage() {
    const res = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' });
    const target = await res.json();
    return Page.connect(target.webSocketDebuggerUrl, target.id, this.port);
  }

  async close() {
    try {
      this.proc.kill();
    } catch {
      /* already gone */
    }
    try {
      rmSync(this.userDataDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

class Page {
  constructor(ws, id, port) {
    this.ws = ws;
    this.id = id;
    this.port = port;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  static async connect(wsUrl, id, port) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP socket error')), { once: true });
    });
    const page = new Page(ws, id, port);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    return page;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  async goto(url, { waitMs = 1200 } = {}) {
    await this.send('Page.navigate', { url });
    await sleep(waitMs);
    return this.evaluate(() => ({
      url: location.href,
      title: document.title,
    }));
  }

  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'evaluate threw');
    }
    return res.result.value;
  }

  async close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
