#!/usr/bin/env node
/**
 * Colour grade, grain and responsive ladder.
 *
 * One grade, applied to every frame without exception, with the numeric values
 * written down here so they are reproducible and the clinic's next photographer
 * can match them (§9.4). Nothing is upscaled: every source is already a Webflow
 * derivative, and upscaling one recovers nothing that was thrown away.
 *
 * Requires ffmpeg on PATH.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets/source');
const OUT = path.join(ROOT, 'assets/generated');

/* ---------------------------------------------------------------- the grade */

/**
 * THE GRADE — numeric, reproducible, applied to every frame.
 *
 * A dental practice is lit with daylight, clinical LED and warm ambient at the
 * same time, so an ungraded set looks like a folder rather than a body of work.
 * These values pull everything to one target.
 *
 * Deliberate constraints:
 *  - Highlights roll off rather than clip. This environment is full of white
 *    surfaces and white teeth and it clips very easily.
 *  - Blacks lift to a matte floor (~7/255) instead of crushing. Crushed blacks
 *    read as a phone camera. This floor is also what --ink #111111 is matched to.
 *  - Saturation comes down globally but stays high enough that skin is not
 *    dragged grey. Skin is the hard constraint, verified per portrait (§9.5).
 *  - Teeth are never brightened. On a dental site a digitally whitened tooth is
 *    a fabricated clinical outcome, which §17 puts inside the advertising rules.
 */
const GRADE = {
  blackPoint: 0.027,     // lift ≈ 7/255 — matte floor, matched to --ink
  whitePoint: 0.965,     // pull highlights off the ceiling, ≈ 246/255
  gamma: 1.02,           // a hair open in the midtones
  contrast: 1.04,        // restrained S-curve; heavy contrast reads as fashion
  /**
   * No additional global saturation pull, and that is a measured decision.
   *
   * The desaturation this grade needs already comes from the lifted black point:
   * compressing the range costs ~0.04 of skin saturation on its own, which is
   * the matte look doing its job. Adding an `eq=saturation` pull on top of that
   * was measured across all six portraits and made things worse in both axes —
   * at 0.92 skin lost 0.075 saturation (grey faces, the §9.5 failure), and every
   * value between 0.92 and 0.96 also rotated skin +1.1° to +3.5° toward yellow.
   * At 1.0 the hue shift is under 1° and saturation loss stays at 0.04.
   *
   * Sweep and figures: docs/IMAGE_REPORT.md. Re-check with tools/check-skin.mjs
   * after any change here.
   */
  saturation: +(process.env.LC_SAT ?? 1.0),
  temperature: -0.012,   // a whisper of cool in the shadows
  sharpenAmount: 0.6,    // OUTPUT sharpening only, applied at final size
};

/** Grain, per §9.7. Monochromatic luminance only — chroma noise reads as a broken JPEG. */
const GRAIN = {
  strength: 3.2,         // ≈ 3% — if you can see it without looking, halve it
  minStrength: 1.8,      // small variants need proportionally less
};

/**
 * ffmpeg filter chain for the grade.
 *
 * `curves` does the black/white point and the S-curve in one pass; `eq` handles
 * saturation and gamma; `colorbalance` applies the cool shadow tint.
 */
function gradeChain() {
  const b = GRADE.blackPoint;
  const w = GRADE.whitePoint;
  // Anchor points for a restrained S-curve between the lifted floor and ceiling.
  const lo = (0.25 * (w - b) + b).toFixed(4);
  const hi = (0.75 * (w - b) + b).toFixed(4);
  const loOut = (0.25 - (GRADE.contrast - 1) * 0.16).toFixed(4);
  const hiOut = (0.75 + (GRADE.contrast - 1) * 0.16).toFixed(4);
  // Selective desaturation of just the environment was attempted with
  // `selectivecolor` and abandoned: its parameters are CMYK density
  // corrections, not saturation, so the bands warmed rather than drained and
  // every face rotated toward yellow. Doing this properly needs a masked grade
  // in a real grading tool against the camera originals — recorded in
  // CLIENT_ACTIONS.md rather than faked here.
  return [
    `curves=all='0/${b.toFixed(4)} 0.25/${lo} 0.75/${hi} 1/${w.toFixed(4)}'`,
    `curves=all='0/0 0.25/${loOut} 0.75/${hiOut} 1/1'`,
    `eq=saturation=${GRADE.saturation}:gamma=${GRADE.gamma}`,
    `colorbalance=rs=${GRADE.temperature}:bs=${(-GRADE.temperature).toFixed(4)}`,
  ].join(',');
}

/**
 * Grain is baked per variant at that variant's own size, after the resize and
 * after the grade. Grain baked once at 3840 and downscaled to 480 vanishes,
 * which is what makes small variants look plastic next to large ones.
 *
 * `c0s` targets plane 0 — luma — only. Using `alls` here would put noise into
 * the chroma planes too, which is colour noise: it reads as a broken JPEG
 * rather than as film, and it roughly quadruples the encoded size because the
 * chroma planes stop compressing.
 */
function grainChain(width) {
  const scale = Math.max(GRAIN.minStrength, GRAIN.strength * Math.min(1, width / 1600) ** 0.35);
  return `noise=c0s=${scale.toFixed(2)}:c0f=t+u`;
}

const LADDER = [480, 768, 1200, 1600, 2048, 2560, 3840];

async function ffprobe(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', file,
  ]);
  const s = JSON.parse(stdout).streams[0];
  return { w: s.width, h: s.height };
}

async function encode(src, dest, width, format, sharpen) {
  const filters = [
    `scale=${width}:-2:flags=lanczos`,
    gradeChain(),
    grainChain(width),
  ];
  // Output sharpening at final size only. Never before a resize.
  if (sharpen) filters.push(`unsharp=5:5:${GRADE.sharpenAmount}:5:5:0`);

  const args = ['-y', '-loglevel', 'error', '-i', src, '-vf', filters.join(','), '-frames:v', '1'];
  if (format === 'avif') {
    args.push('-c:v', 'libaom-av1', '-crf', '30', '-cpu-used', '4', '-still-picture', '1');
  } else if (format === 'webp') {
    // WebP is the legacy fallback — AVIF carries the quality path and encodes
    // this material 4-5x smaller. Holding the fallback at q82 costs ~120KB a
    // frame at 1600px for a shrinking minority of browsers, so large variants
    // step down. Small ones stay high because they cost almost nothing.
    args.push('-c:v', 'libwebp', '-quality', width >= 1200 ? '74' : '82', '-compression_level', '6');
  } else {
    args.push('-q:v', '4');
  }
  args.push(dest);
  await run('ffmpeg', args, { maxBuffer: 1 << 26 });
}

/* ------------------------------------------------------------------- main */

const manifest = JSON.parse(await readFile(path.join(ROOT, 'assets/assets.manifest.json'), 'utf8'));
const only = process.argv.slice(2).find((a) => !a.startsWith('-'));

await mkdir(OUT, { recursive: true });
const out = [];

for (const asset of manifest.assets) {
  if (asset.error || asset.group === 'brand') continue;
  if (only && !asset.filename.includes(only)) continue;

  const src = path.join(SRC, asset.group, asset.filename);
  if (!existsSync(src)) { console.error(`  missing source: ${asset.filename}`); continue; }

  const { w: srcW, h: srcH } = await ffprobe(src);
  const slug = asset.slug ?? asset.filename
    .replace(/\.[a-z]+$/i, '')
    .toLowerCase()
    .replace(/lacli?nic dental\s*-?/i, 'frame-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Portraits are 1620px and must never be shown above 810 CSS px, so their
  // ladder stops where the source does. Nothing here is ever upscaled.
  const widths = LADDER.filter((x) => x <= srcW);
  if (!widths.length) widths.push(srcW);

  const variants = [];
  for (const width of widths) {
    for (const fmt of ['avif', 'webp']) {
      const name = `${slug}-${width}.${fmt}`;
      const dest = path.join(OUT, name);
      if (!existsSync(dest)) {
        await encode(src, dest, width, fmt, width >= 1200);
      }
      const { size } = await import('node:fs').then((fs) => fs.promises.stat(dest));
      variants.push({ width, format: fmt, file: name, bytes: size });
    }
  }

  const ratio = +(srcW / srcH).toFixed(4);
  out.push({
    slug,
    source: asset.filename,
    group: asset.group,
    intrinsic: { w: srcW, h: srcH, ratio },
    maxWidth: srcW,
    provenance: 'webflow-derivative',
    variants,
  });
  const kb = variants.reduce((a, v) => a + v.bytes, 0) / 1024;
  console.log(`  ${slug.padEnd(28)} ${srcW}×${srcH}  ${widths.length} width(s) ×2 fmt  ${kb.toFixed(0)}KB total`);
}

await writeFile(
  path.join(ROOT, 'data/images.json'),
  JSON.stringify({ generated: new Date().toISOString(), grade: GRADE, grain: GRAIN, ladder: LADDER, images: out }, null, 2) + '\n',
);

console.log(`\n${out.length} images processed.`);
console.log(`grade: black ${GRADE.blackPoint} · white ${GRADE.whitePoint} · sat ${GRADE.saturation} · temp ${GRADE.temperature}`);
