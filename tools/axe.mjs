#!/usr/bin/env node
/**
 * axe-core accessibility scan (§3.2 requires zero violations).
 *
 *   node tools/axe.mjs
 *   AXE_ORIGIN=https://… node tools/axe.mjs
 *
 * axe is injected into the page from a local copy rather than a CDN, so the
 * scan does not itself add a third-party request to a site whose whole claim is
 * that it makes none.
 */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ORIGIN = process.env.AXE_ORIGIN ?? 'http://localhost:4214';

const ROUTES = [
  '/', '/behandelingen/', '/behandelingen/wortelkanaalbehandeling/',
  '/een-afspraak-in-plaats-van-drie/', '/team/', '/team/annemie/',
  '/veelgestelde-vragen/', '/afspraak-maken/', '/praktisch/', '/tarieven/',
  '/en/', '/en/treatments/veneers/', '/juridisch/toegankelijkheid/',
];

// Fetch axe-core once into a local cache.
const cache = path.join(ROOT, '.shots', 'axe.min.js');
if (!existsSync(cache)) {
  await mkdir(path.dirname(cache), { recursive: true });
  const tmp = path.join(os.tmpdir(), 'axe-dl');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  await run('npm', ['install', '--no-save', '--prefix', tmp, 'axe-core@4'], { shell: true, maxBuffer: 1 << 26 });
  const src = path.join(tmp, 'node_modules', 'axe-core', 'axe.min.js');
  await (await import('node:fs/promises')).copyFile(src, cache);
}
const axeSource = await readFile(cache, 'utf8');

const port = 9700 + Math.floor(Math.random() * 300);
const profile = path.join(os.tmpdir(), `lc-axe-${port}`);
await rm(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

async function endpoint() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Chrome did not start');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    ws.addEventListener('open', () => resolve({
      send(method, params = {}, sessionId) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
        });
      },
      close: () => ws.close(),
    }));
    ws.addEventListener('error', reject);
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    });
  });
}

const cdp = await connect(await endpoint());
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => cdp.send(m, p, sessionId);
await send('Page.enable');
await send('Runtime.enable');

let totalViolations = 0;
const details = [];

for (const route of ROUTES) {
  await send('Page.navigate', { url: ORIGIN + route });
  await new Promise((r) => setTimeout(r, 1100));
  await send('Runtime.evaluate', { expression: axeSource });
  const { result } = await send('Runtime.evaluate', {
    expression: `axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] } })
      .then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.map(n => n.target.join(" ")).slice(0,3) }))))`,
    awaitPromise: true,
    returnByValue: true,
  });
  const violations = JSON.parse(result.value);
  totalViolations += violations.reduce((a, v) => a + v.n, 0);
  const label = violations.length ? violations.map((v) => `${v.id}(${v.n})`).join(' ') : 'clean';
  console.log(`  ${route.padEnd(42)} ${label}`);
  if (violations.length) details.push({ route, violations });
}

cdp.close();
chrome.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});

console.log(`\n${ROUTES.length} routes · ${totalViolations} violation(s)`);
if (totalViolations) {
  for (const d of details) {
    console.error(`\n${d.route}`);
    for (const v of d.violations) {
      console.error(`  [${v.impact}] ${v.id} × ${v.n} — ${v.help}`);
      for (const t of v.targets ?? []) console.error(`      ${t}`);
    }
  }
  process.exit(1);
}
console.log('AXE PASS — zero violations');
