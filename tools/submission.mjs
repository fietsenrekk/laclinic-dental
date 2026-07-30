#!/usr/bin/env node
/**
 * Builds the Awwwards submission thumbnails (§14).
 *
 * The desktop thumbnail is deliberately NOT a raw hero screenshot: it is
 * captured mid-transition, while the wordmark's letters are still rising, so
 * the frame shows the signature moment rather than its finished state.
 *
 *   node tools/submission.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'submission');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ORIGIN = process.env.SUB_ORIGIN ?? 'https://fietsenrekk.github.io/laclinic-dental';

await mkdir(OUT, { recursive: true });

const port = 9900 + Math.floor(Math.random() * 90);
const profile = path.join(os.tmpdir(), `lc-sub-${port}`);
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

/**
 * Freezes every running animation at a chosen point on its timeline, so the
 * capture is deterministic rather than a race against a screenshot.
 */
async function captureAt(route, { width, height, atMs, file, fullFrom }) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 700 });
  await send('Page.navigate', { url: ORIGIN + route });
  await new Promise((r) => setTimeout(r, 220));
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }).catch(() => {});

  if (atMs != null) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const as = document.getAnimations();
        for (const a of as) { a.pause(); a.currentTime = ${atMs}; }
        return as.length;
      })()`,
      returnByValue: true,
    });
  } else {
    await new Promise((r) => setTimeout(r, 1800));
  }
  await new Promise((r) => setTimeout(r, 260));

  const clip = { x: 0, y: fullFrom ?? 0, width, height, scale: 1 };
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
  await writeFile(path.join(OUT, file), Buffer.from(data, 'base64'));
  console.log(`  ${file.padEnd(30)} ${width}×${height} @2x`);
}

/*
 * Desktop 1200×900, caught mid-rise. The timing matters: letters start at
 * 90 + i*62 ms in ascending height order, so the N — the tallest letter and
 * the only diagonal in the mark — does not begin until 524ms. Freezing earlier
 * than that gives a frame with the most distinctive glyph missing entirely.
 * 800ms has the short letters settled and the N a third of the way up.
 */
await captureAt('/', { width: 1200, height: 900, atMs: 800, file: 'thumbnail-desktop.png' });

// Mobile 600×900 — purpose-built, not a squashed desktop crop.
await captureAt('/', { width: 600, height: 900, atMs: 840, file: 'thumbnail-mobile.png' });

// Element captures.
await captureAt('/', { width: 1200, height: 900, atMs: 1600, file: 'element-01-wordmark-settled.png' });
await captureAt('/', { width: 1200, height: 760, file: 'element-02-index.png', fullFrom: 900 });
await captureAt('/team/', { width: 1200, height: 900, file: 'element-03-team.png', fullFrom: 420 });
await captureAt('/veelgestelde-vragen/', { width: 1200, height: 820, file: 'element-04-faq.png', fullFrom: 380 });
await captureAt('/een-afspraak-in-plaats-van-drie/', { width: 1200, height: 900, file: 'element-05-chairside.png', fullFrom: 1100 });

cdp.close();
chrome.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});
console.log('\nsubmission/ written');
