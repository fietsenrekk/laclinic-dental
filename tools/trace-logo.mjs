#!/usr/bin/env node
/**
 * Traces `laclinic black.png` into a layered SVG.
 *
 * A machine trace of a PNG is not a logo (§7.2), so this does not run a generic
 * curve-fitter over the bitmap. The mark is monolinear, flat-terminal and almost
 * entirely axis-aligned, so we recover it as exact polygons and only smooth the
 * one true diagonal — the N. Connected-component labelling separates the glyphs,
 * which is what gives us addressable per-letter layers rather than one blob path.
 *
 * Zero dependencies: PNG is inflate + per-scanline filters, and node has zlib.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../assets/source/brand/laclinic black.png');
const OUT = path.resolve(import.meta.dirname, '../assets/brand');

/* ------------------------------------------------------------------ decode */

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let w = 0, h = 0, depth = 0, colour = 0;
  const idat = [];
  let palette = null, trns = null;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colour = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`bit depth ${depth} not supported`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour];
  if (!channels) throw new Error(`colour type ${colour} not supported`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);

  // Undo the per-scanline filters. Each row is prefixed with its filter byte.
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }

  // Flatten to a single ink mask: true where the glyph is.
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, alpha = 255;
    if (colour === 0) r = g = b = out[i];
    else if (colour === 4) { r = g = b = out[i * 2]; alpha = out[i * 2 + 1]; }
    else if (colour === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else if (colour === 6) { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; alpha = out[i * 4 + 3]; }
    else if (colour === 3) {
      const idx = out[i];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) alpha = trns[idx];
    }
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    ink[i] = alpha > 128 && lum < 128 ? 1 : 0;
  }
  return { w, h, ink };
}

/* ------------------------------------------------- connected components */

/** 4-connected labelling. Each glyph becomes its own component → its own layer. */
function label(w, h, mask, target) {
  const lab = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (mask[s] !== target || lab[s] !== -1) continue;
    const id = comps.length;
    let sp = 0;
    stack[sp++] = s;
    lab[s] = id;
    const px = [];
    let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      px.push(p);
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      if (x > 0 && mask[p - 1] === target && lab[p - 1] === -1) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] === target && lab[p + 1] === -1) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] === target && lab[p - w] === -1) { lab[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] === target && lab[p + w] === -1) { lab[p + w] = id; stack[sp++] = p + w; }
    }
    comps.push({ id, px, minx, miny, maxx, maxy, area: px.length });
  }
  return { lab, comps };
}

/* ------------------------------------------------------------- contours */

/**
 * Walks the boundary between ink and paper on the pixel *lattice*, so every
 * edge lands exactly on an integer coordinate. For a rectilinear mark that
 * reproduces the original outline with no fitting error at all.
 */
function traceOutline(inside, minx, miny, maxx, maxy) {
  // Directions: 0=right 1=down 2=left 3=up, walking edges of the pixel grid.
  const edges = new Map();
  const key = (x, y) => `${x},${y}`;
  const add = (x1, y1, x2, y2) => {
    const k = key(x1, y1);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push([x2, y2]);
  };

  // For each ink pixel, emit the boundary edges it does not share with another
  // ink pixel, wound consistently so interior holes come out reversed.
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const loops = [];
  while (edges.size) {
    const startKey = edges.keys().next().value;
    let [cx, cy] = startKey.split(',').map(Number);
    const loop = [[cx, cy]];
    for (;;) {
      const k = key(cx, cy);
      const outs = edges.get(k);
      if (!outs || !outs.length) break;
      const [nx, ny] = outs.pop();
      if (!outs.length) edges.delete(k);
      cx = nx; cy = ny;
      if (cx === loop[0][0] && cy === loop[0][1]) break;
      loop.push([cx, cy]);
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

/** Drops points that sit on the straight line between their neighbours. */
function collapseCollinear(pts) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross !== 0) out.push(b);
  }
  return out.length >= 3 ? out : pts;
}

/**
 * The N's diagonal comes off the lattice as a staircase. This walks it back to
 * a straight run: any span whose points sit within `tol` of the chord between
 * its endpoints collapses to that chord.
 */
function straightenDiagonals(pts, tol = 1.5) {
  const n = pts.length;
  if (n < 4) return pts;
  const keep = new Array(n).fill(false);
  keep[0] = true;
  let anchor = 0;
  for (let i = 1; i < n; i++) {
    const a = pts[anchor], c = pts[i];
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let maxDev = 0;
    for (let j = anchor + 1; j < i; j++) {
      const p = pts[j];
      maxDev = Math.max(maxDev, Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len);
    }
    if (maxDev > tol) { keep[i - 1] = true; anchor = i - 1; }
  }
  keep[n - 1] = true;
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : pts;
}

/**
 * The hand-correction pass.
 *
 * Thresholding an anti-aliased raster leaves 1px jogs, so stems that were drawn
 * on one axis come back a third of a unit apart. This clusters coordinates that
 * are within `tol` across the whole mark and snaps each cluster onto a single
 * value, which is what actually regularises the drawing — stems align to stems,
 * baselines to baselines. Diagonals are exempt: only points that already sit on
 * an axis-aligned run get snapped, so the N keeps its true slope.
 */
function regularise(allLoops, tol = 1.2) {
  /** Reduces the coords sitting on straight edges to a set of reference axes. */
  const buildAxes = (vals) => {
    const sorted = [...new Set(vals)].sort((a, b) => a - b);
    const axes = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] - sorted[i] <= tol) j++;
      // Take the cluster's most-used value, so a long straight edge outvotes
      // the 1px noise that created the cluster in the first place.
      const members = new Set(sorted.slice(i, j + 1));
      const freq = new Map();
      for (const v of vals) if (members.has(v)) freq.set(v, (freq.get(v) || 0) + 1);
      axes.push([...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
      i = j + 1;
    }
    return axes;
  };

  // Reference axes come only from points on straight edges — those are the ones
  // the drawing was actually constructed on.
  const axisPts = { x: [], y: [] };
  for (const loop of allLoops) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i], n = loop[(i + 1) % loop.length], v = loop[(i - 1 + loop.length) % loop.length];
      if (p[0] === n[0] || p[0] === v[0]) axisPts.x.push(p[0]);
      if (p[1] === n[1] || p[1] === v[1]) axisPts.y.push(p[1]);
    }
  }
  const ax = buildAxes(axisPts.x), ay = buildAxes(axisPts.y);
  // Every point snaps to a reference axis within tolerance, including corners
  // that sit on no straight edge — those are exactly the 1px jogs. A diagonal's
  // interior vertices land nowhere near an axis, so the N keeps its slope.
  const snap = (v, axes) => {
    let best = v, d = tol;
    for (const a of axes) {
      const dist = Math.abs(a - v);
      if (dist <= d) { d = dist; best = a; }
    }
    return best;
  };
  /**
   * A long edge that lands within a pixel of true vertical was drawn vertical;
   * the offset is threshold noise. Squares those up where no shared axis existed
   * to snap them to. The length guard keeps genuine diagonals out of it.
   */
  const squareUp = (loop) => {
    const pts = loop.map((p) => p.slice());
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
      if (dx > 0 && dx <= tol && dy > tol * 4) a[0] = b[0] = (a[0] + b[0]) / 2;
      else if (dy > 0 && dy <= tol && dx > tol * 4) a[1] = b[1] = (a[1] + b[1]) / 2;
    }
    return pts;
  };

  return allLoops.map((loop) => {
    const snapped = squareUp(loop.map(([x, y]) => [snap(x, ax), snap(y, ay)]));
    // Drop points that collapsed onto their neighbour, then re-flatten runs.
    const dedup = snapped.filter((p, i) => {
      const q = snapped[(i + 1) % snapped.length];
      return p[0] !== q[0] || p[1] !== q[1];
    });
    return dedup.length >= 3 ? collapseCollinear(dedup) : snapped;
  });
}

function toPath(loops, scale, ox, oy, precision = 2) {
  const r = (v) => {
    const s = v.toFixed(precision);
    return s.replace(/\.?0+$/, '') || '0';
  };
  return loops
    .map((loop) => {
      const p = loop.map(([x, y]) => [(x - ox) * scale, (y - oy) * scale]);
      return 'M' + p.map(([x, y]) => `${r(x)} ${r(y)}`).join('L') + 'Z';
    })
    .join('');
}

/* ------------------------------------------------------------------ main */

const png = decodePNG(await readFile(SRC));
const { w, h, ink } = png;
console.log(`source ${w}×${h}`);

// Glyph components. Anything tiny is speckle from the raster and gets dropped.
const { lab, comps } = label(w, h, ink, 1);
const glyphs = comps.filter((c) => c.area > 400).sort((a, b) => a.minx - b.minx);
console.log(`${comps.length} components, ${glyphs.length} above the speckle threshold`);

// The wordmark sits above the "DENTAL" lockup; split on vertical position.
const wordTop = Math.min(...glyphs.map((g) => g.miny));
const wordBot = Math.max(...glyphs.map((g) => g.maxy));
const split = wordTop + (wordBot - wordTop) * 0.82;

/**
 * Both dotted i's carry a detached square tittle, so the raster yields ten
 * components for eight letters. Fold each floating mark into the stem it sits
 * over, so one letter stays one addressable layer.
 */
function mergeTittles(list) {
  const parts = list.slice().sort((a, b) => a.minx - b.minx);
  const tall = Math.max(...parts.map((p) => p.maxy - p.miny));
  const letters = [];
  for (const p of parts) {
    if (p.maxy - p.miny >= tall * 0.25) { letters.push(p); continue; }
    // A tittle matches its own stem's width, so score candidates by horizontal
    // intersection-over-union rather than taking the first overlap — the wider
    // neighbouring L overlaps too, and sorting by x reaches it first.
    let host = null, best = 0;
    for (const q of parts) {
      if (q === p || q.miny <= p.maxy) continue;
      const inter = Math.min(q.maxx, p.maxx) - Math.max(q.minx, p.minx);
      if (inter <= 0) continue;
      const iou = inter / (Math.max(q.maxx, p.maxx) - Math.min(q.minx, p.minx));
      if (iou > best) { best = iou; host = q; }
    }
    if (host) (host.extra = host.extra || []).push(p);
    else letters.push(p); // an unhosted mark is a real glyph, keep it
  }
  return letters.sort((a, b) => a.minx - b.minx);
}

const main = mergeTittles(glyphs.filter((g) => g.miny < split));
const sub = mergeTittles(glyphs.filter((g) => g.miny >= split));
console.log(`wordmark: ${main.length} letter(s) · sublabel: ${sub.length} letter(s)`);

// Interior counters (the A's bar, the D and R of DENTAL) are background
// components fully enclosed by ink — they must become reversed subpaths.
const { comps: bg } = label(w, h, ink, 0);
const holes = bg.filter((c) => c.minx > 0 && c.miny > 0 && c.maxx < w - 1 && c.maxy < h - 1 && c.area > 50);
console.log(`${holes.length} enclosed counter(s)`);

const holeFor = (g) => holes.filter((hl) => hl.minx >= g.minx && hl.maxx <= g.maxx && hl.miny >= g.miny && hl.maxy <= g.maxy);

// Normalise to a 1000-unit-wide viewBox anchored on the full lockup.
const bbox = {
  minx: Math.min(...glyphs.map((g) => g.minx)),
  miny: Math.min(...glyphs.map((g) => g.miny)),
  maxx: Math.max(...glyphs.map((g) => g.maxx)) + 1,
  maxy: Math.max(...glyphs.map((g) => g.maxy)) + 1,
};
const scale = 1000 / (bbox.maxx - bbox.minx);
const vbH = +((bbox.maxy - bbox.miny) * scale).toFixed(2);

// LACLINIC + DENTAL, left to right, so ids are meaningful to animate against.
const NAMES = ['l', 'a', 'c', 'l2', 'i', 'n', 'i2', 'c2'];
const SUBNAMES = ['d', 'e', 'n', 't', 'a', 'l'];

/**
 * Outlines a letter plus its tittle if it has one.
 *
 * Counters need no special handling: tracing the glyph's own pixel set already
 * emits the interior contour, wound opposite to the outer one. Adding the hole
 * separately would draw it twice, and under even-odd that fills it back in.
 */
function outlinesFor(g) {
  let loops = [];
  for (const part of [g, ...(g.extra || [])]) {
    const set = new Set(part.px);
    const inPart = (x, y) => x >= 0 && y >= 0 && x < w && y < h && set.has(y * w + x);
    loops = loops.concat(traceOutline(inPart, part.minx, part.miny, part.maxx, part.maxy));
  }
  return loops.map((l) => straightenDiagonals(collapseCollinear(l)));
}

/**
 * Builds a whole set of glyphs together. Regularisation has to see every loop
 * in the mark at once — snapping letter by letter would align each letter to
 * itself but leave the stems misaligned against each other.
 */
function buildSet(glyphList, names, s, ox, oy) {
  const perGlyph = glyphList.map((g) => outlinesFor(g).map((loop) => loop.map(([x, y]) => [(x - ox) * s, (y - oy) * s])));
  const flat = perGlyph.flat();
  const fixed = regularise(flat);
  let k = 0;
  return perGlyph.map((loops, i) => {
    const mine = fixed.slice(k, k + loops.length);
    k += loops.length;
    return {
      name: names[i] ?? `g${i}`,
      d: toPath(mine, 1, 0, 0),
      pts: mine.reduce((a, l) => a + l.length, 0),
      area: glyphList[i].area,
    };
  });
}

/** Full extent of a letter including its tittle. */
const extent = (g) => ({
  minx: Math.min(g.minx, ...(g.extra || []).map((e) => e.minx)),
  miny: Math.min(g.miny, ...(g.extra || []).map((e) => e.miny)),
  maxx: Math.max(g.maxx, ...(g.extra || []).map((e) => e.maxx)),
  maxy: Math.max(g.maxy, ...(g.extra || []).map((e) => e.maxy)),
});

// The lockup regularises as one drawing so "DENTAL" aligns to the wordmark.
const lockup = buildSet(
  [...main, ...sub],
  [...main.map((_, i) => NAMES[i] ?? `g${i}`), ...sub.map((_, i) => `sub-${SUBNAMES[i] ?? i}`)],
  scale,
  bbox.minx,
  bbox.miny,
);
const mainPaths = lockup.slice(0, main.length);
const subPaths = lockup.slice(main.length);

for (const p of [...mainPaths, ...subPaths]) console.log(`  ${p.name.padEnd(8)} ${String(p.pts).padStart(4)} pts`);

await mkdir(OUT, { recursive: true });

const layered = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${vbH}" fill="currentColor" fill-rule="evenodd" role="img" aria-label="LACLINIC DENTAL">
  <title>LACLINIC DENTAL</title>
  <g data-part="wordmark">
${mainPaths.map((p) => `    <path id="lc-${p.name}" d="${p.d}"/>`).join('\n')}
  </g>
  <g data-part="sublabel">
${subPaths.map((p) => `    <path id="lc-${p.name}" d="${p.d}"/>`).join('\n')}
  </g>
</svg>
`;
await writeFile(path.join(OUT, 'laclinic-wordmark.svg'), layered);

// Wordmark on its own, re-normalised — this is the one the site actually uses.
const me = main.map(extent);
const mb = {
  minx: Math.min(...me.map((e) => e.minx)),
  miny: Math.min(...me.map((e) => e.miny)),
  maxx: Math.max(...me.map((e) => e.maxx)) + 1,
  maxy: Math.max(...me.map((e) => e.maxy)) + 1,
};
const ms = 1000 / (mb.maxx - mb.minx);
const mvbH = +((mb.maxy - mb.miny) * ms).toFixed(2);
const wordOnly = buildSet(main, main.map((_, i) => NAMES[i] ?? `g${i}`), ms, mb.minx, mb.miny);

await writeFile(
  path.join(OUT, 'laclinic-wordmark-only.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${mvbH}" fill="currentColor" fill-rule="evenodd" role="img" aria-label="LACLINIC">
  <title>LACLINIC</title>
${wordOnly.map((p) => `  <path id="lcw-${p.name}" d="${p.d}"/>`).join('\n')}
</svg>
`,
);

// The per-letter geometry is what the motion layer and the layout grid both
// read from, so publish it as data rather than re-deriving it in two places.
const metrics = main.map((g, i) => {
  const e = me[i];
  return {
    name: NAMES[i] ?? `g${i}`,
    x: +((e.minx - mb.minx) * ms).toFixed(2),
    y: +((e.miny - mb.miny) * ms).toFixed(2),
    w: +((e.maxx - e.minx + 1) * ms).toFixed(2),
    h: +((e.maxy - e.miny + 1) * ms).toFixed(2),
    // Height measured up from the shared baseline — this is the ratio the
    // layout rhythm and the hero reveal are both keyed to.
    rise: +(((mb.maxy - e.miny) / (mb.maxy - mb.miny)) * 100).toFixed(1),
  };
});
await writeFile(path.join(OUT, 'wordmark-metrics.json'), JSON.stringify({ viewBox: [1000, mvbH], letters: metrics }, null, 2) + '\n');

console.log(`\nviewBox 0 0 1000 ${vbH} (lockup) · 1000 ${mvbH} (wordmark)`);
console.log('letter heights:', metrics.map((m) => `${m.name}=${m.h.toFixed(0)}`).join(' '));
