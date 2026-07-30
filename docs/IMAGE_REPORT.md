# Image report

## 1 · Provenance

Every frame came from the Webflow CDN (`cdn.prod.website-files.com/660ea309238277de52c19b4d/`),
requested at the URL **without** the `-p-NNN` responsive suffix, which is the largest variant
Webflow serves. Recorded in `assets/assets.manifest.json` with origin URL, dimensions and byte
size. Re-fetch with `node tools/fetch-assets.mjs`.

**All 23 assets are flagged `source:webflow-derivative`.** No camera originals were reachable.

| Group | Count | Dimensions |
|---|---|---|
| Shoot frames | 13 | 6 at 3000×2000 · 7 at ~2000×1450 |
| Team portraits | 6 | 1620×1620, all identical |
| Brand | 3 | logo 2709×1794, OG 1200×630 |
| Texture plate (`w-084`) | 1 | 1024×1024 |

### The resolution ceiling — and why nothing was upscaled

§9.2 asks for ≥5120px heroes, ≥3840px bands, ≥2560px portraits. The material tops out at 3000px,
and portraits at 1620px.

§9.3 answers this: a Webflow derivative has already been resized and recompressed, and upscaling
one recovers nothing that was thrown away — it invents plausible detail. §9.6 adds that faces are
where artefacts are most visible and least forgivable.

**So nothing was upscaled.** The ladder for each image stops at that image's own intrinsic width
(`tools/images.mjs` filters `LADDER` by `srcW`). The design was built to the real ceiling instead:
**portraits are capped at 810 CSS px anywhere they appear**, which keeps them at or under 2× DPR
on every device.

Camera originals are the top request in `CLIENT_ACTIONS.md`. Dropping them into `assets/source/`
and re-running `node tools/images.mjs` is the whole upgrade path.

---

## 2 · The grade — numeric and reproducible

One recipe, applied to every frame without exception. Lives in `tools/images.mjs` as `GRADE` so it
is versioned and the clinic's next photographer can match it.

```
blackPoint     0.027     lift to a matte floor (≈7/255)
whitePoint     0.965     highlights pulled off the ceiling (≈246/255)
gamma          1.02      a hair open in the midtones
contrast       1.04      restrained S-curve
saturation     1.00      no additional global pull — see below
temperature   -0.012     a whisper of cool in the shadows only
sharpenAmount  0.6       output sharpening, at final size, never before a resize
```

As an ffmpeg chain:

```
curves=all='0/0.0270 0.25/0.2615 0.75/0.7305 1/0.9650',
curves=all='0/0 0.25/0.2436 0.75/0.7564 1/1',
eq=saturation=1:gamma=1.02,
colorbalance=rs=-0.012:bs=0.012
```

**Why the highlights roll instead of clipping:** a dental practice is full of white surfaces and
white teeth and it clips very easily. **Why the blacks lift instead of crushing:** crushed blacks
read as a phone camera. The 0.027 floor is also what the `--ink #111111` token is matched to, so
type never punches darker than the photographs beside it.

### Saturation: the value that was measured, not chosen

The first pass used `saturation: 0.92` — an 8% global pull, to satisfy §9.4's *"environment pulled
down."* `tools/check-skin.mjs` measured what it actually did to faces:

| `eq=saturation` | skin hue Δ | skin saturation Δ | verdict |
|---|---|---|---|
| 0.92 | +2.1° to +2.3° | **−0.072 to −0.080** | grey faces — the §9.5 failure |
| 0.94 | +2.9° to +3.5° | −0.062 to −0.073 | worse in both axes |
| 0.96 | +1.1° to +1.6° | −0.050 to −0.060 | still out |
| **1.00** | **−0.29° to −0.80°** | **−0.037 to −0.046** | **shipped** |

The desaturation this grade needs already comes from the lifted black point — compressing the
range costs ~0.04 of skin saturation on its own, which is the matte look doing its job. Anything
added on top came straight off the faces.

**An attempt at selective desaturation was abandoned and is worth recording.** `selectivecolor`
was used to drain only the hue bands the environment occupies (the grey-green walls, the olive
scrubs) while leaving reds and yellows alone. Its parameters are CMYK *density* corrections, not
saturation: `greens=-0.14 0 +0.14 0` warms greens rather than draining them, and touching the
`neutrals` band rotated every measured face +1.5° toward yellow, because skin carries a neutral
component. Doing this properly needs a masked grade in a real grading tool against camera
originals — recorded in `CLIENT_ACTIONS.md` rather than faked here.

---

## 3 · Grain (§9.7)

```
Type          monochromatic luminance only — ffmpeg `noise=c0s=N:c0f=t+u`
              c0 is the luma plane. Using `alls` would put noise in the chroma
              planes, which reads as a broken JPEG rather than as film.
Strength      3.2 at 1600px, scaled by (width/1600)^0.35, floor 1.8
Applied       AFTER the resize and AFTER the grade, per variant at its own size
Page overlay  128×128 tiled SVG, fixed position, 2.5% opacity, overlay blend
```

Baked **per responsive variant**: grain applied once at 3000px and downscaled to 480px vanishes,
which is what makes small variants look plastic beside large ones.

The page overlay uses a fixed 128px `background-size` and `image-rendering: pixelated`, so it does
**not** scale with zoom or DPR — grain that grows on retina is the classic tell.

Grain costs ~4 KB per 1600px frame in WebP (measured: 177.7 KB plain vs 181.5 KB grained). It is
not the compression problem it is often assumed to be.

---

## 4 · Encoding ladder

`480 / 768 / 1200 / 1600 / 2048 / 2560 / 3840`, filtered per image to its intrinsic width.
AVIF and WebP for each step, `<picture>` with AVIF first.

- **AVIF** — `libaom-av1`, CRF 30, cpu-used 4. The quality path. ~31 KB at 1200px, ~56 KB at 1600px.
- **WebP** — quality 74 at ≥1200px, 82 below. The legacy fallback only. Holding it at 82 cost
  ~120 KB per frame at 1600px for a shrinking minority of browsers.

Output sharpening (`unsharp 5:5:0.6`) applies only at ≥1200px, at final size, never before a
resize.

Total generated: **20 images, 248 variants.** Any single page loads 1–6 AVIFs.

---

## 5 · QA verdicts — per portrait

`node tools/check-skin.mjs` samples the face region of every portrait before and after the grade
and reports the drift. It fails the run if hue moves more than 2°, skin loses more than 0.05
saturation, or **teeth get brighter**.

| Portrait | hue Δ | sat Δ | lum Δ | teeth Δ | verdict |
|---|---|---|---|---|---|
| ludovic-altermatt | −0.59° | −0.038 | +0.001 | +0.000 | ok |
| omid-hadadian-moghadam | −0.80° | −0.044 | −0.001 | +0.000 | ok |
| katrien-vr | −0.50° | −0.042 | −0.003 | +0.000 | ok |
| annemie | −0.65° | −0.041 | −0.001 | +0.000 | ok |
| ana-rita-marques-da-silva | −0.30° | −0.046 | +0.001 | +0.000 | ok |
| sina-esfandiari | −0.29° | −0.037 | +0.006 | −0.635 | ok |

**Worst hue shift across the full range: 0.80°. Worst teeth brightening: +0.000.**

Two hard constraints, both held:

- **Skin tone across the range.** The team is visibly diverse; the darkest-skinned subjects were
  checked first and most carefully, because upscalers and auto-correction fail hardest there. No
  portrait shifted more than a degree.
- **Teeth were not brightened.** On a dental site a digitally whitened tooth is a fabricated
  clinical result, and in Belgium that sits inside the rules on advertising dental care (§17). The
  grade touches the frame; it does not touch the teeth. The −0.635 figure on Sina is a sampling
  artefact (the count of near-neutral bright pixels changed between the two crops), and its sign
  is negative — darker, never lighter.

### The portraits are already one photographic system

Better than §9.6 feared: all six share a backdrop, wardrobe (green scrubs), lighting, crop, eye
line and the LACLINIC watermark. One photographer, one session. They needed unifying white balance
rather than rescuing.

---

## 6 · Generated imagery

**None.** Zero credits spent, on instruction. Every photograph on this site is the clinic's own.
No face, no clinical image, no before/after, and no texture plate was generated. The page grain is
a procedurally-drawn SVG tile emitted by `tools/build.mjs` — geometry, not imagery.

All EXIF, including any GPS, is dropped by re-encoding through ffmpeg.
