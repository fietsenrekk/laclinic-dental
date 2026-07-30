#!/usr/bin/env node
/**
 * Pulls every source asset from the Webflow CDN at the largest variant served.
 *
 * Webflow appends `-p-500`, `-p-800` etc. to responsive derivatives. The URL
 * without that suffix is the upload original, so we always request that form
 * and record what we actually got. Nothing here upscales or edits — this is
 * the provenance step, and the manifest it writes is what the grade pipeline
 * and the image report both read from.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CDN = 'https://cdn.prod.website-files.com/660ea309238277de52c19b4d';
const OUT = path.resolve(import.meta.dirname, '../assets/source');

/** Shoot frames, in the photographer's own numbering. */
const SHOOT = [
  ['679de7fa88bb741fd83043e8', 'LACLINIC DENTAL -06.webp'],
  ['679de7fa2374ac73ed9316a6', 'LACLINIC DENTAL -08.webp'],
  ['679de7fa839d85f8cf0d408c', 'LACLINIC DENTAL -09.webp'],
  ['679de7fa9692e37939aa4ec9', 'LACLINIC DENTAL -10.webp'],
  ['679de7c73f7f3ff9adeee023', 'LACLINIC DENTAL -23.webp'],
  ['679de7fad5f7c58a2cfcf63b', 'LACLINIC DENTAL -25.webp'],
  ['679de7c869c32a89df8fc7ce', 'LACLINIC DENTAL -26.webp'],
  ['679de7c7eeb6bb71c7c5c623', 'LACLINIC DENTAL -29.webp'],
  ['679de7c9ffc1726ff60a7694', 'LACLINIC DENTAL -31.webp'],
  ['679de7c8d61929b9538143d5', 'LACLINIC DENTAL -38.webp'],
  ['679de7c769c32a89df8fc735', 'LACLINIC DENTAL -53.webp'],
  ['679de7c94485cc2f9b3df7cc', 'LACLINIC DENTAL -59.webp'],
  ['679de7c86da6369dbf7f66c3', 'LACLINIC DENTAL -62.webp'],
  ['660ea309238277de52c19d5c', 'w-084.webp'],
];

/** Six portraits. There is no seventh — see docs/FINDINGS.md B-001. */
const PORTRAITS = [
  ['6992e2c8afc583155dc8a15e', 'Dr. Ludovic Altermatt -Laclinic Dental.webp', 'ludovic-altermatt'],
  ['6992e2c82ffa2160d0de2af7', 'Omid Hadadian Moghadam - Laclinic Dental.webp', 'omid-hadadian-moghadam'],
  ['6992e2c886999dec4e22bb4e', 'Katrien - Laclinic Dental.webp', 'katrien-vr'],
  ['6992e2c851bacfdc67375903', 'Annemie - Laclinic Dental.webp', 'annemie'],
  ['6992e2c9b1d88b0e129045fe', 'Ana-Rita Marques Da Silva - Laclinic Dental.webp', 'ana-rita-marques-da-silva'],
  ['6992e2c96a746a5afc8e278a', 'Sina Esfandiari - Laclinic Dental.webp', 'sina-esfandiari'],
];

/** Brand marks. Both are rasters with spaces in the filename — F-010. */
const BRAND = [
  ['660ea36cd1d9cf3b6f6c44a6', 'laclinic black.png'],
  ['660ea39c6c27f1cb68d89789', 'laclinic white.png'],
  ['661fded564e079c8a0d7a425', 'Laclinic Opengraph.jpg'],
];

/** Reads intrinsic dimensions straight from the container header. */
function dimensions(buf) {
  // PNG: IHDR is always the first chunk.
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), kind: 'png' };
  }
  // WebP: RIFF container, then a VP8/VP8L/VP8X chunk that stores size differently.
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8X') {
      return {
        w: (buf.readUIntLE(24, 3) & 0xffffff) + 1,
        h: (buf.readUIntLE(27, 3) & 0xffffff) + 1,
        kind: 'webp/extended',
      };
    }
    if (fourcc === 'VP8 ') {
      return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, kind: 'webp/lossy' };
    }
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, kind: 'webp/lossless' };
    }
  }
  // JPEG: walk the segment chain to the SOF marker.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), kind: 'jpeg' };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { w: 0, h: 0, kind: 'unknown' };
}

async function grab(id, filename, group, slug) {
  const url = `${CDN}/${id}_${encodeURIComponent(filename).replace(/%20/g, '%20')}`;
  const dest = path.join(OUT, group, filename);
  if (existsSync(dest)) {
    const buf = await readFile(dest);
    return { ...dimensions(buf), filename, group, slug, url, bytes: buf.length, cached: true };
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  ✗ ${res.status}  ${filename}`);
    return { filename, group, slug, url, error: res.status };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  const d = dimensions(buf);
  console.log(`  ✓ ${String(d.w).padStart(5)}×${String(d.h).padEnd(5)} ${(buf.length / 1024).toFixed(0).padStart(5)}KB  ${filename}`);
  return { ...d, filename, group, slug, url, bytes: buf.length, cached: false };
}

const manifest = [];
console.log('\nShoot frames');
for (const [id, f] of SHOOT) manifest.push(await grab(id, f, 'shoot'));
console.log('\nPortraits');
for (const [id, f, slug] of PORTRAITS) manifest.push(await grab(id, f, 'portrait', slug));
console.log('\nBrand');
for (const [id, f] of BRAND) manifest.push(await grab(id, f, 'brand'));

await writeFile(
  path.join(OUT, '..', 'assets.manifest.json'),
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      note:
        'Every entry is a Webflow-processed derivative unless the client supplies camera originals. ' +
        'See CLIENT_ACTIONS.md — original files are the single cheapest quality win available.',
      provenance: 'source:webflow-derivative',
      assets: manifest,
    },
    null,
    2,
  ) + '\n',
);

const ok = manifest.filter((m) => !m.error);
const px = ok.map((m) => Math.max(m.w || 0, m.h || 0));
console.log(`\n${ok.length}/${manifest.length} assets fetched.`);
console.log(`Long edge: min ${Math.min(...px)}px · max ${Math.max(...px)}px`);
console.log(`Total ${(ok.reduce((a, m) => a + m.bytes, 0) / 1024 / 1024).toFixed(1)} MB`);
