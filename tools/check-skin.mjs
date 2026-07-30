#!/usr/bin/env node
/**
 * Numeric skin-tone verification (§9.5).
 *
 * Upscalers and auto-correction routinely shift skin toward orange or grey, and
 * they fail hardest on darker skin. Eyeballing a contact sheet does not catch a
 * 4-degree hue rotation. This samples the face region of every portrait before
 * and after the grade and reports the shift in hue, saturation and luminance.
 *
 * Also checks the brightest region inside the mouth — teeth must not have been
 * lightened, because a digitally whitened tooth on a dental site is a
 * fabricated clinical outcome (§17).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = path.join(os.tmpdir(), 'lc-skin');

const PORTRAITS = [
  ['ludovic-altermatt', 'Dr. Ludovic Altermatt -Laclinic Dental.webp'],
  ['omid-hadadian-moghadam', 'Omid Hadadian Moghadam - Laclinic Dental.webp'],
  ['katrien-vr', 'Katrien - Laclinic Dental.webp'],
  ['annemie', 'Annemie - Laclinic Dental.webp'],
  ['ana-rita-marques-da-silva', 'Ana-Rita Marques Da Silva - Laclinic Dental.webp'],
  ['sina-esfandiari', 'Sina Esfandiari - Laclinic Dental.webp'],
];

/** Decodes to raw RGB at a small fixed size so sampling is cheap and aligned. */
async function raw(file, size = 128) {
  const out = path.join(TMP, path.basename(file).replace(/\W+/g, '_') + `.${size}.rgb`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file,
    '-vf', `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', out], { maxBuffer: 1 << 28 });
  return { buf: await readFile(out), size };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

/** Is this pixel plausibly skin? Deliberately wide so it works across the range. */
function isSkin(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  return r > g && g > b && (h <= 50 || h >= 330) && s > 0.12 && s < 0.72 && l > 0.15 && l < 0.92;
}

function analyse({ buf, size }) {
  // Face occupies roughly the central-upper third of these square crops.
  const x0 = Math.floor(size * 0.28), x1 = Math.floor(size * 0.72);
  const y0 = Math.floor(size * 0.10), y1 = Math.floor(size * 0.55);
  let n = 0, hx = 0, hy = 0, sSum = 0, lSum = 0;
  let brightest = 0, brightN = 0, brightSum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * size + x) * 3;
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      if (!isSkin(r, g, b)) continue;
      const [h, s, l] = rgbToHsl(r, g, b);
      // Average hue on the circle, so 359° and 1° do not average to 180°.
      const rad = (h * Math.PI) / 180;
      hx += Math.cos(rad); hy += Math.sin(rad);
      sSum += s; lSum += l; n++;
      if (l > brightest) brightest = l;
    }
  }
  // Near-neutral bright pixels inside the face box: teeth and specular highlights.
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * size + x) * 3;
      const [h, s, l] = rgbToHsl(buf[i], buf[i + 1], buf[i + 2]);
      if (s < 0.18 && l > 0.62) { brightSum += l; brightN++; }
    }
  }
  let hue = (Math.atan2(hy / n, hx / n) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return {
    n,
    hue,
    sat: sSum / n,
    lum: lSum / n,
    bright: brightN ? brightSum / brightN : 0,
    brightN,
  };
}

await mkdir(TMP, { recursive: true });
console.log('portrait                      hue Δ    sat Δ     lum Δ    bright Δ   verdict');
console.log('─'.repeat(84));

let worstHue = 0, worstBright = 0, fails = 0;

for (const [slug, filename] of PORTRAITS) {
  const before = analyse(await raw(path.join(ROOT, 'assets/source/portrait', filename)));
  const after = analyse(await raw(path.join(ROOT, 'assets/generated', `${slug}-768.avif`)));

  let dHue = after.hue - before.hue;
  if (dHue > 180) dHue -= 360;
  if (dHue < -180) dHue += 360;
  const dSat = after.sat - before.sat;
  const dLum = after.lum - before.lum;
  const dBright = after.bright - before.bright;

  worstHue = Math.max(worstHue, Math.abs(dHue));
  worstBright = Math.max(worstBright, dBright);

  const problems = [];
  // A hue rotation beyond ~3° is a visible cast on skin.
  if (Math.abs(dHue) > 2) problems.push(dHue > 0 ? 'HUE→yellow' : 'HUE→red');
  // Losing more than a fifth of skin saturation is the grey-skin failure.
  if (dSat < -0.05) problems.push('DESATURATED');
  if (dLum < -0.06) problems.push('DARKENED');
  // Teeth brighter after the grade than before is the one thing we must not do.
  if (dBright > 0.02) problems.push('TEETH BRIGHTENED');
  if (problems.length) fails++;

  console.log(
    `${slug.padEnd(28)} ${(dHue >= 0 ? '+' : '') + dHue.toFixed(2)}°`.padEnd(38) +
    `${(dSat >= 0 ? '+' : '') + dSat.toFixed(3)}`.padEnd(10) +
    `${(dLum >= 0 ? '+' : '') + dLum.toFixed(3)}`.padEnd(10) +
    `${(dBright >= 0 ? '+' : '') + dBright.toFixed(3)}`.padEnd(11) +
    (problems.length ? problems.join(' ') : 'ok'),
  );
}

console.log('─'.repeat(84));
console.log(`worst hue shift ${worstHue.toFixed(2)}°  ·  worst teeth brightening ${worstBright >= 0 ? '+' : ''}${worstBright.toFixed(3)}`);
if (fails) {
  console.error(`\nFAIL — ${fails} portrait(s) outside tolerance.`);
  process.exit(1);
}
console.log('\nPASS — skin tone held across the full range; teeth not brightened.');
