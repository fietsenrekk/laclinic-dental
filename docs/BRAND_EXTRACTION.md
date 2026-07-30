# Brand extraction — sampled, not assumed

Every value below was read out of the live site's own stylesheet
(`laclinic.webflow.shared.33c36cb1a.min.css`, 210,115 bytes, fetched 2026-07-30) or measured
off the source logo bitmap. Nothing here is a preference.

Method: parse every colour literal and custom property in the stylesheet, normalise to 6-digit
hex, and count occurrences with the declaration each appeared in. Script:
`scratchpad/palette.mjs` (reproduced in this repo's history).

---

## 1 · What the sampling found

### The site is a black-and-white system with no brand accent

| Sampled hex | Uses | Declared as | Read |
|---|---|---|---|
| `#ffffff` | 86 | background, color, border | Paper |
| `#000000` | 36 | color, background, border | Ink |
| `#161616` | 8 | `--dark-gray` | Near-black surface |
| `#333333` | 6 | color | Body text |
| `#dddddd` | 6 | background | Hairline / rule |
| `#222222` | 6 | background, color | Dark surface |
| `#464646` | 6 | `--dim-grey` | Secondary text |
| `#e9e8e8` | 6 | background, border | Light rule |
| `#111111` | 4 | color | Strong text |
| `#6e6e6e` | 4 | color, border | Muted text |
| `#f5f5f5` `#f0f0f0` `#fafafa` `#f1f1f1` | 3–4 each | background | Off-white grounds |

**Every saturated value in the stylesheet is a Webflow default, not a brand decision:**

| Hex | Where it comes from |
|---|---|
| `#3898ec` | Webflow's stock link/focus blue, shipped in every Webflow project |
| `#ff715b` | Webflow UI component default |
| `#0082f3` | Webflow default |
| `#9290f3` `#b1b0eb` | `--cornflower-blue`, `--light-steel-blue` — unused starter tokens |
| `#dfe7e4` `#ebf5dd` `#e9f8ff` `#ecf0f7` | `--mint-green`, `--light-green`, `--light-blue`, `--alice-blue` — unused starter tokens |

None of these appear on any rendered surface. The clinic has **no accent colour**. That is a
finding, not a gap — and it is what makes the Halo Dental discipline (§5) directly applicable.

### Two warm neutrals were declared but never applied

`--gray-300: #dbd4c3` and `--light-gray: #f6f1f1` are the only warm values in the file. Both are
unused. They are the closest thing to evidence that someone once considered warming the palette.

---

## 2 · The logo, measured

Source: `660ea36cd1d9cf3b6f6c44a6_laclinic black.png` — **2709 × 1794**, 35 KB, pure black on
white, no anti-aliasing beyond edge softening.

Vectorised by `tools/trace-logo.mjs` and verified pixel-for-pixel against the source by
`tools/verify-trace.mjs` — **0.306% disagreement over 1,970,402 ink pixels**, which is the
sub-pixel boundary band from thresholding an anti-aliased raster.

Output: `assets/brand/laclinic-wordmark-only.svg` (1,261 bytes) and
`assets/brand/laclinic-wordmark.svg` (2,290 bytes, includes the DENTAL sublabel).
Eight addressable letter paths (`#lcw-l`, `#lcw-a`, …), each one layer, counters as reversed
subpaths under `fill-rule="evenodd"`.

### Construction

- **Monolinear.** One stroke weight throughout; no thick/thin contrast anywhere.
- **Rectilinear.** Flat terminals, square corners. The squared `C` has no curve at all.
- **Compressed.** Stems are ~49 units wide against letter heights of 340–622.
- **One diagonal.** The `N` is the only non-axis-aligned form in the mark, and it is dramatic.
- **Square tittles.** Both `i` dots are detached squares, not circles — they trace as separate
  components, which is why `tools/trace-logo.mjs` re-merges them onto their stems.
- **Asymmetric by design.** The two `I`s differ (419 vs 512 units). This is in the original; it
  is not a trace artefact.

### The letter rises — the number the whole layout is keyed to

Height above the shared baseline, as a percentage of the tallest letter:

| Letter | L | A | C | L | I | N | I | C |
|---|---|---|---|---|---|---|---|---|
| **Rise** | 81.8 | 74.5 | 74.3 | 81.9 | 91.6 | **100** | 91.6 | 74.3 |

Eight letters, eight different heights, one baseline, no two adjacent values equal.

**This is an occlusal profile.** A row of teeth is exactly this: adjacent vertical elements of
differing heights sharing a gum line — tall canines, short molars. The clinic's own wordmark is
already an abstracted bite, and nothing on the current site uses that.

See `ART_DIRECTION.md` for what is built on top of it.

---

## 3 · Typography on the live site

Eight families are downloaded. **Four are never applied to anything.**

| Family | Applied to | Verdict |
|---|---|---|
| `Bdogrotesk Vf` | body, h3, h4, paragraphs, most headings | The workhorse |
| `Hauora` | **h1, h5 only** | h1 in a different family from h3/h4 |
| `Gambarino` | `.serif`, `.span-serif` | Accent serif |
| `Merriweather` | `.medium-paragraph`, `.large-paragraph` | Third text voice |
| `Inter` | 2 utility classes | Fourth text voice |
| `Mangogrotesque` | — | **5 weights downloaded, never used** |
| `Switzer` | — | **9 weights downloaded, never used** |
| `Velasans` | — | **1 weight downloaded, never used** |
| `Pramukhrounded` | — | **2 weights downloaded, never used** |

Seventeen font files are fetched for zero rendered glyphs. Recorded as **F-013** in
`FINDINGS.md`; it is a real performance cost and a clear sign of template accumulation.

The rebuild ships **one** family (see `ART_DIRECTION.md` §2).

---

## 4 · Confirmed business facts

Re-derived from the live pages on 2026-07-30, not copied from the brief.

| Fact | Value | Source |
|---|---|---|
| Legal entity | Tandarts Altermatt SRL | footer, every page |
| BTW | BE 0800.949.487 | footer |
| Address | 86b Frankrijklei, 2000 Antwerpen | footer |
| Phone | +32 3 430 68 28 | footer, FAQ |
| Email | laclinicdental@gmail.com | `/afspraak-maken` |
| Hours | MA–VRIJ 08:30–18:00 · ZAT Gesloten | footer — **contradicted in the FAQ, see F-002** |
| Conventie | Niet geconventioneerd | FAQ |
| Payment | Bancontact or cash | FAQ |
| Cancellation | 48h notice, else €45 | FAQ |
| Parking | Hopland · Inno · Horta, 3 min walk | FAQ, `/afspraak-maken` |
| Transit | Centraal 15 min · Opera + Stadspark 4 min | FAQ |
| Booking (internal) | `/afspraak-maken` — a **callback request form**, not a scheduler | page copy |
| Booking (external) | `doctena.be/nl/praktijk/antwerpen/la-clinic-dental-430359` | homepage mobile hero |
| Analytics | GTM-T98K5QDK | `<head>`, plus a noscript iframe |

Team roster and the brief's discrepancies against it: see `FINDINGS.md` B-001.
