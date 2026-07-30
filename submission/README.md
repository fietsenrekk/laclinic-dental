# Awwwards submission package

**Live:** https://fietsenrekk.github.io/laclinic-dental/
**Repo:** https://github.com/fietsenrekk/laclinic-dental

Regenerate everything here with `node tools/submission.mjs`.

---

## Files

| File | Size | What it is |
|---|---|---|
| `thumbnail-desktop.png` | 1200×900 @2x | **The signature moment mid-transition**, not a hero screenshot. Animations are frozen at 800ms: the short letters have settled, the N is still rising. |
| `thumbnail-mobile.png` | 600×900 @2x | Purpose-built at mobile width — not a squashed desktop crop. |
| `element-01-wordmark-settled.png` | 1200×900 | The mark after it lands. |
| `element-02-index.png` | 1200×760 | The typographic index that replaced the icon grid. |
| `element-03-team.png` | 1200×900 | The six practitioners, one graded photographic system. |
| `element-04-faq.png` | 1200×820 | The disclosure pattern — works with JavaScript disabled. |
| `element-05-chairside.png` | 1200×900 | The chairside CAD/CAM page. |

The timing on the desktop thumbnail is deliberate. Letters animate in ascending order of their
real height (90 + i×62 ms), so the N — the tallest letter and the only diagonal in the mark —
does not start until 524ms. Capturing earlier produces a frame with the most distinctive glyph
missing.

---

## Description

> LACLINIC DENTAL is a dental practice on the Frankrijklei in Antwerp. Its logo is eight letters
> of eight different heights sharing one baseline — which is, if you look at it, an occlusal
> profile: a row of teeth. Nobody had noticed. We vectorised the mark, measured the eight rises,
> and used them as the layout law for the entire site, so no two sections share a height and a
> uniform grid is structurally impossible. The signature moment is the wordmark assembling itself
> as a bite closing, in zero kilobytes. The previous site was a Webflow build carrying twelve
> stock clipart icons and eight typefaces, four of which rendered nothing. This one ships one
> variable typeface, no icons at all, no cookies, no third-party scripts, and 5.5 KB of
> JavaScript.

## Categories

- Health & Wellness
- Business & Corporate
- Typography
- Animation

Not submitted under 3D — there is no WebGL, and claiming it would be dishonest.

## Technologies

Hand-written HTML/CSS · Web Animations API · IntersectionObserver · Node.js (static generator,
zero dependencies) · ffmpeg (colour grade + AVIF/WebP ladder) · Archivo Variable (self-hosted, OFL)

**No framework. No GSAP. No Lenis. No build tooling beyond Node.** See `docs/MOTION_REPORT.md` for
why each was considered and dropped.

## Elements to submit separately (§14.6)

1. **The wordmark assembling** — the signature. Eight letters rising from a shared baseline in
   ascending height order, timed from the mark's own geometry.
2. **The occlusal section rhythm** — a layout system where section heights are read from a logo.
3. **The typographic index** — what replaced twelve clipart icons.
4. **The disclosure FAQ** — native `<details>`, fully functional with JavaScript off.
5. **The colour-graded portrait set** — one reproducible grade, verified numerically for skin-tone
   accuracy across the full range.

Capture each as a screen recording before submitting.

---

## Pre-submission checklist — run against the LIVE url

| Check | Result |
|---|---|
| Lighthouse mobile — Performance | **99** |
| Lighthouse mobile — Accessibility | **100** |
| Lighthouse mobile — Best Practices | **100** |
| Lighthouse mobile — SEO | **100** |
| Lighthouse desktop — all four | **100 / 100 / 100 / 100** |
| LCP (mobile) | **1.5s** (budget 1.8s) |
| CLS | **0** (budget 0.05) |
| TBT | **80ms** |
| TTFB | **10ms** (budget 400ms) |
| axe-core, 13 routes | **0 violations** |
| Console errors, 9 routes | **0** |
| Initial JS | **5.5 KB** (budget 150 KB) |
| CSS | 17.6 KB |
| Reduced motion | **0 animations registered** |
| JavaScript disabled | full content, FAQ opens, booking reachable |
| Keyboard | booking at tab 13, focus ring visible at every stop |
| Horizontal overflow at 360px | none |
| Clipart icons remaining | **0** — CI-enforced |

Reproduce:

```bash
CHECK_ORIGIN=https://fietsenrekk.github.io/laclinic-dental node tools/checks.mjs
AXE_ORIGIN=https://fietsenrekk.github.io/laclinic-dental node tools/axe.mjs
```
