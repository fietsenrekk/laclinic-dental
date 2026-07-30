#!/usr/bin/env node
/**
 * Structural audit over dist/. Fails the build on anything in §15's mandatory
 * checks that can be verified without a browser.
 *
 *   node tools/audit.mjs
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

/** The stock icon set that must not survive anywhere in the build (F-001). */
const CLIPART = [
  'dentist', 'tooth', 'implant', 'spa', 'pin', 'time-left', 'heart',
  'toothbrush', 'consultation', 'location-pin', 'phone-call',
];

const problems = [];
const note = (file, msg) => problems.push({ file, msg });

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = await walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const rel = (f) => path.relative(DIST, f).replace(/\\/g, '/');

/* ---- 1 · clipart and bad filenames (§15.9) ---- */

for (const f of files) {
  const base = path.basename(f);
  const stem = base.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  if (/[()]/.test(base) || /\s/.test(base)) note(rel(f), 'filename contains a space or parenthesis');
  // Match whole stems only, so "frame-06" is safe and "tooth" is not.
  if (CLIPART.includes(stem)) note(rel(f), `clipart asset "${base}" present in build`);
}

/* ---- 2 · per-page HTML checks ---- */

const routeSet = new Set(htmlFiles.map((f) => '/' + rel(f).replace(/index\.html$/, '')));
const internalLinks = new Map();
const titles = new Map();
let navSignature = null;
let footerSignature = null;

for (const f of htmlFiles) {
  const html = await readFile(f, 'utf8');
  const r = rel(f);

  // Head essentials
  if (!/<title>[^<]{10,}<\/title>/.test(html)) note(r, 'missing or too-short <title>');
  if (!/<meta name="description" content="[^"]{40,}"/.test(html)) note(r, 'missing or too-short meta description');
  if (!/<link rel="canonical"/.test(html)) note(r, 'missing canonical');
  // Region subtags are uppercase — nl-BE must match.
  if (!/<html lang="[a-zA-Z-]+"/.test(html)) note(r, 'missing lang attribute');

  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  if (title) {
    if (titles.has(title) && !r.startsWith('404')) note(r, `duplicate <title> shared with ${titles.get(title)}`);
    else titles.set(title, r);
  }

  // hreflang — every page except 404 must declare both languages
  if (!r.startsWith('404')) {
    const hreflangs = [...html.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]);
    const hasNl = hreflangs.some((h) => h.startsWith('nl'));
    const hasEn = hreflangs.some((h) => h === 'en');
    if (!hasNl || !hasEn) note(r, `hreflang incomplete (found: ${hreflangs.join(', ') || 'none'})`);
  }

  // Headings: exactly one h1, and no level skipped
  const heads = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
  const h1s = heads.filter((h) => h === 1).length;
  if (h1s !== 1) note(r, `expected exactly one <h1>, found ${h1s}`);
  for (let i = 1; i < heads.length; i++) {
    if (heads[i] > heads[i - 1] + 1) note(r, `heading level jumps h${heads[i - 1]} → h${heads[i]}`);
  }

  // Images must have alt and intrinsic dimensions (CLS)
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\salt="/.test(tag)) note(r, 'img without alt');
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) note(r, 'img without intrinsic width/height');
  }

  // No dead anchors (F-004)
  if (/href="#"/.test(html)) note(r, 'href="#" present');

  // External links need rel protection
  for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) note(r, 'target="_blank" without rel=noopener');
  }

  // No third-party requests at all (§16 preview allowances). Our own origin
  // appears in canonical/og:url/JSON-LD and is not a third party; the social
  // and scheduler hosts are outbound links, never fetched.
  const OWN = new URL(process.env.SITE_ORIGIN ?? 'https://laclinicdental.github.io').host;
  for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    const host = new URL(m[1]).host;
    if (host === OWN) continue;
    if (!/doctena\.be$|instagram\.com$|tiktok\.com$|linkedin\.com$|schema\.org$/.test(host)) {
      note(r, `third-party asset reference: ${host}`);
    }
  }
  if (/googletagmanager|google-analytics|gtag\(/.test(html)) note(r, 'analytics present — this build ships none');

  // Nav and footer must be byte-identical across every page of a language (F-011)
  const lang = /\/en\//.test('/' + r) || r.startsWith('en/') ? 'en' : 'nl';
  const navHtml = html.match(/<header class="nav">[\s\S]*?<\/header>/)?.[0] ?? '';
  const footHtml = html.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0] ?? '';
  // Strip the parts that legitimately vary per page.
  const norm = (s) => s.replace(/ aria-current="page"/g, '').replace(/href="[^"]*"/g, 'href');
  navSignature ??= {};
  footerSignature ??= {};
  if (!r.startsWith('404')) {
    if (navSignature[lang] && navSignature[lang].sig !== norm(navHtml)) {
      note(r, `nav differs from ${navSignature[lang].from}`);
    } else navSignature[lang] ??= { sig: norm(navHtml), from: r };
    if (footerSignature[lang] && footerSignature[lang].sig !== norm(footHtml)) {
      note(r, `footer differs from ${footerSignature[lang].from}`);
    } else footerSignature[lang] ??= { sig: norm(footHtml), from: r };
  }

  /*
   * Booking: one destination sitewide (F-003). Every CTA must point at the
   * internal page; only that page may hand off to the scheduler. The head's
   * preconnect is a connection hint, not a link, so it is excluded.
   */
  const body = html.slice(html.indexOf('<body'));
  const doctenaLinks = [...body.matchAll(/<a\b[^>]*href="(https:\/\/www\.doctena\.be[^"]*)"/g)];
  if (doctenaLinks.length && !/(^|\/)(afspraak-maken|book-appointment)\//.test(r)) {
    note(r, 'links straight to Doctena — the internal booking page is canonical (F-003)');
  }

  // Structured data must parse
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch (e) {
      note(r, `invalid JSON-LD: ${e.message}`);
    }
  }

  // Saturday must say the same thing everywhere (F-002)
  if (/zaterdag/i.test(html) && /(ook op zaterdag|open op zaterdag)/i.test(html)) {
    note(r, 'claims Saturday opening — contradicts the resolved hours (F-002)');
  }

  // Collect internal links for the link check
  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    if (!internalLinks.has(m[1])) internalLinks.set(m[1], r);
  }
}

/* ---- 3 · internal link integrity ---- */

const assetPaths = new Set(files.map((f) => '/' + rel(f)));
for (const [href, from] of internalLinks) {
  const asDir = href.endsWith('/') ? href + 'index.html' : href;
  if (assetPaths.has(asDir.slice(0)) || assetPaths.has(asDir.replace(/^\//, '/'))) continue;
  const normalised = asDir.replace(/^\//, '');
  if (files.some((f) => rel(f) === normalised)) continue;
  note(from, `dead internal link → ${href}`);
}

/* ---- 4 · i18n parity ---- */

const nlRoutes = [...routeSet].filter((r) => !r.startsWith('/en/') && r !== '/404.html');
const enRoutes = [...routeSet].filter((r) => r.startsWith('/en/'));
if (nlRoutes.length !== enRoutes.length + 0) {
  // The NL set includes '/', the EN set includes '/en/'; counts should match.
  if (Math.abs(nlRoutes.length - enRoutes.length) !== 0) {
    note('(routes)', `NL/EN route count mismatch: ${nlRoutes.length} NL vs ${enRoutes.length} EN`);
  }
}

// Untranslated placeholder markers from the i18n helper
for (const f of htmlFiles) {
  const html = await readFile(f, 'utf8');
  if (/⟨[a-z.]+⟩/.test(html)) note(rel(f), 'unresolved i18n key in output');
}

/* ---- 5 · required files ---- */

for (const req of ['robots.txt', 'sitemap.xml', '404.html', 'styles.css', 'motion.js', 'favicon.svg']) {
  if (!files.some((f) => rel(f) === req)) note('(build)', `missing ${req}`);
}

/* ---- 6 · weight budget for a first view ---- */

const css = files.find((f) => rel(f) === 'styles.css');
const js = files.find((f) => rel(f) === 'motion.js');
const cssSize = css ? (await stat(css)).size : 0;
const jsSize = js ? (await stat(js)).size : 0;
if (jsSize > 150 * 1024) note('(budget)', `motion.js ${(jsSize / 1024).toFixed(0)}KB exceeds the 150KB JS budget`);

/* ---- report ---- */

console.log(`${htmlFiles.length} pages · ${files.length} files`);
console.log(`css ${(cssSize / 1024).toFixed(1)}KB · js ${(jsSize / 1024).toFixed(1)}KB`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  const byMsg = new Map();
  for (const p of problems) {
    const key = p.msg.replace(/→ \S+/, '→ …').replace(/"[^"]*"/g, '"…"');
    if (!byMsg.has(key)) byMsg.set(key, []);
    byMsg.get(key).push(p);
  }
  for (const [msg, list] of [...byMsg].sort((a, b) => b[1].length - a[1].length)) {
    console.error(`  ${list.length}×  ${msg}`);
    for (const p of list.slice(0, 4)) console.error(`        ${p.file}${p.msg !== msg ? '  — ' + p.msg : ''}`);
    if (list.length > 4) console.error(`        …and ${list.length - 4} more`);
  }
  process.exit(1);
}

console.log('\nAUDIT PASS');
