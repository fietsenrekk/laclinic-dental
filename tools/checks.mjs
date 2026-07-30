#!/usr/bin/env node
/**
 * Runtime checks in headless Chrome — the §15 items that need a live page.
 *
 *   node tools/checks.mjs                    # against the local dev server
 *   CHECK_ORIGIN=https://… node tools/checks.mjs
 *
 * Verifies: console cleanliness, that the page is complete with JavaScript
 * disabled, that reduced-motion registers no animation, that the FAQ opens
 * without JS, keyboard reachability of the booking path, and CLS.
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ORIGIN = process.env.CHECK_ORIGIN ?? 'http://localhost:4214';

const ROUTES = ['/', '/behandelingen/', '/behandelingen/wortelkanaalbehandeling/', '/team/', '/team/sina-esfandiari/', '/veelgestelde-vragen/', '/afspraak-maken/', '/en/', '/en/treatments/'];

const port = 9500 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), `lc-chk-${port}`);
await rm(profile, { recursive: true, force: true });

const chromeArgs = (extra = []) => [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--disable-gpu',
  ...extra,
  'about:blank',
];

let chrome = spawn(CHROME, chromeArgs(), { stdio: 'ignore' });

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
    const listeners = [];
    let id = 0;
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}, sessionId) {
          return new Promise((res, rej) => {
            const mid = ++id;
            pending.set(mid, { res, rej });
            ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
          });
        },
        on(fn) { listeners.push(fn); },
        close: () => ws.close(),
      }));
    ws.addEventListener('error', reject);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else listeners.forEach((f) => f(msg));
    });
  });
}

const cdp = await connect(await endpoint());
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => cdp.send(m, p, sessionId);

const problems = [];
const bad = (r, m) => problems.push(`${r}  ${m}`);

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');

let consoleErrors = [];
let failedRequests = [];
cdp.on((msg) => {
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    consoleErrors.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(`exception: ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ''}`);
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    consoleErrors.push(`log: ${msg.params.entry.text}`);
  }
  if (msg.method === 'Network.loadingFailed') failedRequests.push(msg.params.errorText);
});

async function load(route, ms = 1400) {
  consoleErrors = [];
  failedRequests = [];
  await send('Page.navigate', { url: ORIGIN + route });
  await new Promise((r) => setTimeout(r, ms));
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }).catch(() => {});
}

const evaluate = async (expr) => {
  const { result } = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return result.value;
};

/* ---- 1 · console + network, JS enabled ---- */

console.log('console + network');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
for (const route of ROUTES) {
  await load(route);
  if (consoleErrors.length) bad(route, `console: ${[...new Set(consoleErrors)].join(' | ')}`);
  if (failedRequests.length) bad(route, `failed requests: ${[...new Set(failedRequests)].join(' | ')}`);
  const t = await evaluate('document.title');
  if (!t) bad(route, 'no title — page may not have loaded');
}
console.log(`  ${ROUTES.length} routes checked`);

/* ---- 2 · CLS ---- */

console.log('layout stability');
await load('/', 2600);
const cls = await evaluate(`new Promise(res => {
  let total = 0;
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value;
  }).observe({type:'layout-shift', buffered:true});
  setTimeout(() => res(total), 400);
})`);
console.log(`  CLS ${Number(cls).toFixed(4)}`);
if (cls > 0.05) bad('/', `CLS ${Number(cls).toFixed(4)} exceeds 0.05`);

/* ---- 3 · reduced motion registers nothing ---- */

console.log('prefers-reduced-motion');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await load('/', 2200);
const anims = await evaluate('document.getAnimations().length');
if (anims > 0) bad('/', `${anims} animation(s) registered under prefers-reduced-motion — must be zero`);
const heroVisible = await evaluate(`(() => {
  const p = document.querySelector('[data-mark] path');
  if (!p) return 'no mark';
  const s = getComputedStyle(p);
  return s.opacity === '1' ? 'ok' : 'opacity=' + s.opacity;
})()`);
if (heroVisible !== 'ok') bad('/', `hero not in final state under reduced motion: ${heroVisible}`);
console.log(`  animations registered: ${anims} · hero: ${heroVisible}`);
await send('Emulation.setEmulatedMedia', { features: [] });

/* ---- 4 · motion actually runs when allowed ---- */

console.log('motion active (no reduced-motion)');
await load('/', 300);
const running = await evaluate('document.getAnimations().length');
console.log(`  animations registered: ${running}`);
if (running === 0) bad('/', 'no animations registered with motion allowed — the signature moment is not running');

/* ---- 5 · JavaScript disabled ---- */

console.log('JavaScript disabled');
await send('Emulation.setScriptExecutionDisabled', { value: true });
for (const route of ['/', '/veelgestelde-vragen/', '/behandelingen/facings/']) {
  await load(route, 900);
  const res = await evaluate(`(() => {
    const text = document.body.innerText.replace(/\\s+/g,' ').trim();
    const faq = document.querySelectorAll('details').length;
    const imgs = [...document.images].filter(i => i.getAttribute('src')).length;
    const cta = [...document.querySelectorAll('a')].some(a => /afspraak|book/i.test(a.getAttribute('href')||''));
    const hidden = getComputedStyle(document.querySelector('h1,.mark') || document.body).opacity;
    return JSON.stringify({ len: text.length, faq, imgs, cta, hidden });
  })()`);
  const r = JSON.parse(res);
  if (r.len < 400) bad(route, `only ${r.len} chars of text with JS off`);
  if (!r.cta) bad(route, 'no booking link with JS off');
  if (r.hidden !== '1') bad(route, `content hidden with JS off (opacity ${r.hidden})`);
  if (route.includes('vragen') && r.faq < 8) bad(route, `FAQ disclosure missing with JS off (${r.faq} details)`);
}
console.log('  content, FAQ and booking link all present');
await send('Emulation.setScriptExecutionDisabled', { value: false });

/* ---- 6 · keyboard path to booking ---- */

console.log('keyboard');
await load('/', 1500);

/*
 * Real Tab presses, not element.focus(). Programmatic focus does not match
 * :focus-visible on links and buttons, so testing that way reports every link
 * as unfocusable — it measures the test, not the page.
 */
const tab = async () => {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  }
  await new Promise((r) => setTimeout(r, 45));
};

await evaluate('document.body.focus()');
let bookingTab = -1;
let noOutline = [];
let seen = 0;

for (let i = 1; i <= 26; i++) {
  await tab();
  const info = JSON.parse(await evaluate(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return JSON.stringify({ none: true });
    const s = getComputedStyle(el);
    const visible = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    return JSON.stringify({
      tag: el.tagName,
      href: el.getAttribute('href') || '',
      label: (el.textContent||'').trim().slice(0,32),
      cls: el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className||''),
      visible,
    });
  })()`));
  if (info.none) continue;
  seen++;
  if (i === 1 && !/skip/i.test(info.cls)) bad('/', `first Tab reaches "${info.label}", not the skip link`);
  if (!info.visible) noOutline.push(`${info.tag}.${info.cls || '—'} "${info.label}"`);
  if (bookingTab < 0 && /afspraak-maken|book-appointment/.test(info.href)) bookingTab = i;
}

if (bookingTab < 0) bad('/', 'booking link not reached within 26 tabs');
else if (bookingTab > 16) bad('/', `booking is ${bookingTab} tabs deep`);
if (noOutline.length) bad('/', `no visible focus ring on: ${noOutline.slice(0, 4).join(', ')}`);
console.log(`  ${seen} stops walked · skip link first · booking at tab ${bookingTab} · all focus rings visible: ${!noOutline.length}`);

/* ---- 7 · 360px, no horizontal overflow ---- */

console.log('narrow viewport');
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
for (const route of ['/', '/behandelingen/', '/team/']) {
  await load(route, 1200);
  const ov = await evaluate('JSON.stringify({sw: document.documentElement.scrollWidth, iw: window.innerWidth})');
  const o = JSON.parse(ov);
  if (o.sw > o.iw + 1) bad(route, `horizontal overflow at 360px (${o.sw} > ${o.iw})`);
  // The fixed action bar must not sit over the last of the content.
  const covered = await evaluate(`(() => {
    const bar = document.querySelector('.actionbar');
    if (!bar) return 'no bar';
    const bs = getComputedStyle(bar);
    if (bs.display === 'none') return 'hidden';
    const pad = parseFloat(getComputedStyle(document.body).paddingBottom);
    return pad >= bar.getBoundingClientRect().height - 1 ? 'ok' : 'body padding ' + pad + ' < bar ' + bar.getBoundingClientRect().height;
  })()`);
  if (covered !== 'ok') bad(route, `action bar overlap: ${covered}`);
}
console.log('  no overflow, action bar clear of content');

/* ---- report ---- */

cdp.close();
chrome.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log('\nCHECKS PASS');
