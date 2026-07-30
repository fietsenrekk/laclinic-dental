# Art direction — LACLINIC DENTAL

Every decision here traces to a sampled value in `BRAND_EXTRACTION.md` or to a written argument.
Nothing was chosen because it looked nice.

---

## 0 · The concept

**An occlusal profile.**

The wordmark is eight letters of eight different heights on one shared baseline, no two adjacent
values equal: `82 · 75 · 74 · 82 · 92 · 100 · 92 · 74`. That is what a row of teeth is — tall
canines, short molars, one gum line. The clinic has been carrying an abstracted bite as its
logo since 2024 and has never used it as anything but a picture in the corner.

So the layout law is **irregular vertical rhythm on a constant baseline.** Sections take their
heights from the letter rises, in order, and the sequence never repeats a value twice running.

Why this and not something imported:

- It is derived from the client's own mark, so no competitor can run it.
- It structurally defeats two of the ten slop tells at once — §8.1 #3 (card-grid everything) and
  §8.1 #10 (uniform section rhythm) — because the grid *cannot* come out uniform.
- It needs no library, no WebGL, and no asset. It is a set of numbers in a JSON file.

The strategic register underneath it is §7.1's: **hospitality with clinical precision**, not a
clinic with soft edges. Precision is carried by the rectilinear construction and the tabular
figures; hospitality by the photography, the warm off-white ground, and the generous measure.

---

## 1 · Palette — 6 values, at the ceiling

The sampling found **no brand accent colour**; every saturated hex in the live stylesheet is an
unused Webflow default. That is not a gap to fill. Halo Dental took Site of the Day in this exact
category on two colours, and the photography here is meant to supply the warmth (§7.3).

| Token | Value | Derivation |
|---|---|---|
| `--paper` | `#FFFFFF` | Sampled, n=86. The dominant ground. |
| `--surface` | `#F3F1EE` | Warm off-white. Extends sampled `--light-gray #f6f1f1` and `--gray-300 #dbd4c3` — the only two warm neutrals the clinic ever declared — toward a usable ground. Carries the hospitality half of the concept. |
| `--ink` | `#111111` | Sampled, n=4. Not pure black: it matches the lifted matte floor the photography is graded to (`IMAGE_REPORT.md`), so type never punches darker than the photographs beside it. |
| `--ink-60` | `#6E6E6E` | Sampled, n=4. Secondary text. 4.9:1 on paper — passes AA for body. |
| `--rule` | `#DCD9D4` | Warm-neutral hairline, temperature-matched to `--surface` rather than the sampled neutral `#dddddd`, which reads cold against it. |
| `--ink-deep` | `#0B0B0B` | Inverted full-bleed sections. |

**No accent.** Focus indicators are drawn in `--ink` at 2px with a 2px offset — a colour-independent
indicator, which is also the more robust accessibility choice.

If a seventh value is ever needed, the design is not resolved (§7.3).

---

## 2 · Typography — one family, two axes

**Archivo Variable** (OFL, SIL Open Font License 1.1), self-hosted.
`font-weight: 100 900` and `font-stretch: 62% 125%` in a single 88 KB woff2 (latin), with an
86 KB latin-ext file that `unicode-range` only fetches when a latin-ext glyph is actually used.

The argument for it, in one line: **the logo is condensed, so the type is wide.** Contrast, not
imitation. §7.5 calls for "a restrained wide grotesk" where the letterforms are monolinear rather
than contrasted — and the mark has no thick/thin contrast anywhere.

This replaces eight families (four of which rendered nothing — F-013) with one.

| Role | Axes | Treatment |
|---|---|---|
| Display | `wdth 118` `wght 400` | `clamp()` fluid, tracking `-0.02em`, measured in the wordmark's own proportions |
| Section head | `wdth 110` `wght 500` | tracking `-0.01em` |
| Body | `wdth 100` `wght 400` | measure 62–70ch, `line-height 1.6` |
| Eyebrow / label | `wdth 100` `wght 600` | uppercase, tracking `0.3em`, 11–13px, section labels only — never body |
| Data | `wdth 100` `wght 500` | `font-variant-numeric: tabular-nums` for hours, the €45 fee, walking distances, phone |

The wordmark itself is the only display *voice* — it appears as SVG, never as set text.

---

## 3 · Iconography — direction C: none

§7.4 offers three directions. This build takes **C — no icons at all.**

Twelve stock PNGs come out (`dentist.png`, `tooth (3).png`, `implant.png`, `spa.png`, `pin (1).png`,
`time-left.png`, `heart.png`, `toothbrush.png`, `consultation (1).png`, `tooth.png`,
`location-pin (1).png`, `phone-call (1).png`) and **nothing goes in.**

Their replacement is the numbering and the rule system: sections are indexed in tabular figures
against hairlines, in the wordmark's own rectilinear logic. Halo Dental won this category on
typographic hierarchy with no icon set at all, and direction C is the only one of the three with
nothing left to get wrong — no second-guessing stroke weight, no drift between the twelfth icon
and the first.

The one exception is genuinely functional glyphs — the external-link cue on the booking CTA and
the disclosure chevron — which are inline SVG drawn from the same 2px rectilinear construction as
the mark, not an icon set.

CI enforces this: `tools/audit.mjs` fails the build if any asset filename matches the stock set, or
contains a parenthesised number or a space.

---

## 4 · Layout

Eight section-height ratios, taken from the letter rises in order and reused down the page:

```
L 82   A 75   C 74   L 82   I 92   N 100   I 92   C 74
```

Rules that fall out of it:

- No two consecutive sections share a height. Enforced by construction.
- No three consecutive sections share a layout (§8.1 #3). Sections alternate between full-bleed
  photograph, editorial two-column, and typographic index.
- The baseline is constant across the whole page — the "gum line". Section content aligns to it
  regardless of section height, which is what makes the varying heights read as rhythm rather
  than as inconsistency.
- Measure is capped at 70ch, but the *grid* is not centred: content hangs off the baseline
  column, mirroring how the wordmark hangs off its own left edge.

---

## 5 · Photography

Full treatment in `IMAGE_REPORT.md`. The two decisions that affect layout:

- **Resolution ceiling is 3000px**, not the 5120px §9.2 asks for. Every asset on the CDN is a
  Webflow derivative; camera originals do not exist in anything we can reach. Upscaling a
  derivative recovers nothing that was discarded (§9.3), so the design is built to the ceiling
  the material actually supports rather than faking headroom.
- **Portraits are 1620 × 1620.** They are therefore never displayed above 810 CSS px, so they
  stay at or under 2× DPR and no face is ever upscaled (§9.6).

Both are recorded at the top of `CLIENT_ACTIONS.md` — original camera files are the single
cheapest quality win available on this project.

---

## 6 · The signature moment

Two directions were prototyped. One was killed. Evidence in `MOTION_REPORT.md`; the summary:

### Kept — **The Bite**

The wordmark performs. On load, the eight letters rise from the shared baseline into place in
their real height order — the mark assembling itself as a bite closing. The same eight ratios then
govern section rhythm down the page, and the mark draws and undraws across page transitions.

- Pure SVG. **1,261 bytes of geometry.** No WebGL, no 3D asset, no texture.
- Degrades to the finished wordmark under `prefers-reduced-motion` — which is just the logo,
  correctly placed, so the static fallback is the design rather than a stripped version of it.
- Passes §8.2: it says *this clinic, specifically* — no competitor owns these eight numbers.

### Killed — **The Milling**

Scroll-driven chairside CAD/CAM: a ceramic blank milled into a finished crown (§7.6's proposal).
Killed on three measured grounds, not on taste:

1. **No source asset.** Generated imagery was declined for this build, so the crown would have to
   be procedurally modelled. A procedurally-generated tooth that reads *slightly wrong* on a
   dental site is worse than no signature at all — it becomes a fabricated clinical object,
   which §9.8 rules out for good reason.
2. **Cost.** Three.js + a scroll-driven morph lands ~150 KB gzip against a 320 KB WebGL budget,
   to do what 1.3 KB of SVG does — on a site whose LCP target is 1.8s on 4G.
3. **It fails its own test.** The milling idea is *about* the CAD/CAM capability. That capability
   already gets a dedicated page (`/een-afspraak-in-plaats-van-drie`), where it is explained in
   words and photographs by people who actually do it. The animation would be decoration on top
   of the real argument.

The concept it was protecting — "one visit instead of three" — is kept, in the copy, where it
converts.

---

## 7 · Restraint (§7.8)

**Removed before shipping: the velocity-reactive marquee.**

§10.5 sanctions one, and it would have been the cleverest version of the current site's laziest
element. It came out anyway. With the letter-rise rhythm already carrying movement down the page,
a second horizontal motion system competed with it, and the marquee's content would have been
either the service list (already indexed two sections above) or the brand name (already the hero).
It answered §8.2 with "it looks cool."

The site ships with no marquee at all. The current site has two.

---

## 8 · The §7.7 sign-off gate

| # | Gate item | Status | Evidence |
|---|---|---|---|
| 1 | Logo vectorised, layered, inline SVG | **PASS** | `assets/brand/*.svg`, 8 addressable paths, 0.306% pixel disagreement vs source |
| 2 | Palette sampled and documented, ≤ 6 values | **PASS** | §1 above; 6 values, each with derivation; `BRAND_EXTRACTION.md` §1 |
| 3 | Type scale built, rendering at all 10 breakpoints | **PASS** | §2 above; verified 360→3440 in `audit.mjs` |
| 4 | Icon direction chosen and set produced to one spec | **PASS** | Direction C — none. §3 above |
| 5 | Zero clipart PNGs in the build | **PASS** | `tools/audit.mjs` fails the build on any match |
| 6 | Layout concept resolved — not a card grid | **PASS** | §4 above; eight-ratio occlusal rhythm |
| 7 | Two signature directions prototyped, one killed | **PASS** | §6 above; `MOTION_REPORT.md` |

**Gate signed off — motion work (Agent F / task #7) is unblocked.**

Signed: 2026-07-30, before any motion library was added to the project.
