#!/usr/bin/env node
/**
 * Rasterises the traced SVG back to a bitmap and diffs it against the source
 * ink mask. A visual side-by-side hides sub-pixel drift; this does not. Fails
 * loudly if the vector does not reproduce the original.
 */
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../assets/source/brand/laclinic black.png');
const SVG = path.resolve(import.meta.dirname, '../assets/brand/laclinic-wordmark.svg');

// Same decoder as trace-logo.mjs, reduced to what the diff needs.
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, colour = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colour = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      if (ft === 1) v += a; else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, al = 255;
    if (colour === 0) r = g = b = out[i];
    else if (colour === 4) { r = g = b = out[i * 2]; al = out[i * 2 + 1]; }
    else if (colour === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; al = out[i * 4 + 3]; }
    ink[i] = al > 128 && 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 1 : 0;
  }
  return { w, h, ink };
}

/** Our generator only emits M/L/Z, so the parser only needs those. */
function parsePath(d) {
  const loops = [];
  let cur = null;
  const re = /([MLZ])([^MLZ]*)/gi;
  for (const m of d.matchAll(re)) {
    const cmd = m[1].toUpperCase();
    if (cmd === 'Z') { if (cur && cur.length > 2) loops.push(cur); cur = null; continue; }
    const nums = (m[2].match(/-?[\d.]+/g) || []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      if (cmd === 'M' && i === 0) { if (cur && cur.length > 2) loops.push(cur); cur = []; }
      cur.push([nums[i], nums[i + 1]]);
    }
  }
  if (cur && cur.length > 2) loops.push(cur);
  return loops;
}

const png = decodePNG(await readFile(SRC));
const svg = await readFile(SVG, 'utf8');
const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
const [vbW, vbH] = [parseFloat(vb[1]), parseFloat(vb[2])];

const allLoops = [];
for (const m of svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)) allLoops.push(...parsePath(m[1]));
console.log(`${allLoops.length} loops parsed from the SVG`);

// The SVG is normalised to the lockup bbox, so map back to source pixels.
const { w, h, ink } = png;
let minx = w, miny = h, maxx = 0, maxy = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) {
  if (x < minx) minx = x; if (x > maxx) maxx = x;
  if (y < miny) miny = y; if (y > maxy) maxy = y;
}
const scale = (maxx - minx + 1) / vbW;

// Even-odd scanline fill at source resolution.
const rast = new Uint8Array(w * h);
const edges = [];
for (const loop of allLoops) {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const ax = a[0] * scale + minx, ay = a[1] * scale + miny;
    const bx = b[0] * scale + minx, by = b[1] * scale + miny;
    if (ay !== by) edges.push([ax, ay, bx, by]);
  }
}
for (let y = 0; y < h; y++) {
  const sy = y + 0.5;
  const xs = [];
  for (const [ax, ay, bx, by] of edges) {
    if ((sy >= ay && sy < by) || (sy >= by && sy < ay)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
  }
  xs.sort((p, q) => p - q);
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const x0 = Math.max(0, Math.ceil(xs[i] - 0.5)), x1 = Math.min(w - 1, Math.floor(xs[i + 1] - 0.5));
    for (let x = x0; x <= x1; x++) rast[y * w + x] = 1;
  }
}

let inkPx = 0, rastPx = 0, missing = 0, extra = 0;
for (let i = 0; i < w * h; i++) {
  if (ink[i]) inkPx++;
  if (rast[i]) rastPx++;
  if (ink[i] && !rast[i]) missing++;
  if (!ink[i] && rast[i]) extra++;
}
const disagree = missing + extra;
const pct = (disagree / inkPx) * 100;

console.log(`source ink   ${inkPx.toLocaleString()} px`);
console.log(`traced fill  ${rastPx.toLocaleString()} px`);
console.log(`missing      ${missing.toLocaleString()} px  (in source, not in trace)`);
console.log(`extra        ${extra.toLocaleString()} px  (in trace, not in source)`);
console.log(`disagreement ${pct.toFixed(3)}% of ink area`);

// A 1px boundary band over a mark this size is well under 1%; anything above
// 2% means a counter was dropped or a contour wound the wrong way.
if (pct > 2) {
  console.error('\nFAIL — trace does not reproduce the source.');
  process.exit(1);
}
console.log('\nPASS — trace reproduces the source within tolerance.');
