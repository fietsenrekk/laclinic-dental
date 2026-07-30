# Findings

Everything below was verified against the live laclinicdental.com on 2026-07-30 by fetching the
raw HTML of all seven pages, not by reading the brief. Where the brief and the site disagree, the
site wins and the disagreement is recorded.

---

## B — Findings about the brief itself

These are listed first because they change what was built.

### B-001 · The brief describes a seventh team member who does not exist

The build brief (§4.2) lists **seven** team members and names *"Mahsid Salehi — Algemene
tandarts"* as the seventh, flagged as having no bio.

**There is no Mahsid Salehi on the site.** Three independent checks agree:

| Check | Result |
|---|---|
| Name occurrences across all 7 pages | `Mahsid` 0, `Salehi` 0 |
| Rendered team block on `/over-ons` | 6 entries |
| Portrait assets on the CDN | 6 files |

The site has **six** people: Ludovic Altermatt, Omid Hadadian Moghadam, Katrien V.R, Annemie,
Ana-Rita Marques Da Silva, Sina Esfandiari.

Nothing has been written for a seventh person. If someone has joined since the site was last
updated, see `CLIENT_ACTIONS.md` §4.

### B-002 · The bio the brief calls the site's best does not exist

The brief (§4.2, §13.3) describes Katrien's bio as *"The best-written bio on the whole site — it
mentions a life outside the clinic"*, says she has three years' experience and teaches spinning
classes, and instructs that the missing bios be written **to that standard**.

**Katrien has no bio.** The string `spinning` appears nowhere in any of the seven pages, and her
team entry is a name, a job title and a portrait.

The count is therefore **two of six** with bios (Ludovic, Omid), not three of seven. The
instruction to "write the others to Katrien's standard" has no referent, so the four bio-less
members instead carry a factual description of their specialty, and real bios are requested from
the people themselves.

### B-003 · Twelve clipart icons, not nine

The brief (§0.1, F-001) lists nine stock PNGs. The build actually references **twelve**:

`dentist.png` · `tooth (3).png` · `implant.png` · `spa.png` · `pin (1).png` · `time-left.png` ·
`heart.png` · `toothbrush.png` · `consultation (1).png` · **`tooth.png`** ·
**`location-pin (1).png`** · **`phone-call (1).png`**

The last three are additional. Two favicons also carry the artefact —
`Laclinic Favicon (1).png` and `Laclinic Favicon (2).png`.

All twelve are gone. `tools/audit.mjs` fails the build if any of them, or any filename containing
a space or a parenthesis, appears in `dist/`.

### B-004 · A fourteenth shoot frame, and a Lottie file, both unlisted

The brief lists thirteen photographic assets. The CDN also serves
**`LACLINIC DENTAL -62.webp`** (3000 × 2000) — extracted and used on
`/behandelingen/gebitsreconstructies`.

There is also a **`Scroll.lottie`** animation on the current site, which the brief's claim that
the marquee is "the only movement on the entire site" (§0.1) overlooks. It does not change the
diagnosis, but the current site has two motion mechanisms rather than one.

### B-005 · The §9.2 resolution spec is unreachable from the available material

The brief asks for ≥5120px heroes, ≥3840px bands and ≥2560px portraits. The largest asset the CDN
serves is **3000 × 2000**, and portraits are **1620 × 1620**.

§9.3 anticipates exactly this and gives the right answer: upscaling a Webflow derivative recovers
nothing that was discarded. Nothing has been upscaled. The layout is instead built to the real
ceiling — portraits are never rendered above 810 CSS px. Camera originals are the top item in
`CLIENT_ACTIONS.md`.

---

## F — Findings about the live site

### F-001 · Clipart icons — **fixed**
Twelve stock PNGs with duplicate-download artefacts in the filenames (`(1)`, `(3)`, spaces). The
loudest cheap signal on the site, appearing on the homepage, `/over-ons` and in the footer.
Replaced with no icons at all — a numbered typographic index (`docs/ART_DIRECTION.md` §3).
Enforced by CI.

### F-002 · Saturday is both open and closed — **resolved, needs confirmation**
Footer says `ZAT — Gesloten` on every page. The FAQ says *"ook op zaterdag"* twice, on the same
pages. Resolved to closed; both FAQ claims removed. Blocking item 1 in `CLIENT_ACTIONS.md`.

### F-003 · Two booking destinations on one page — **resolved**
The homepage renders two hero variants. Desktop points at `/afspraak-maken`; mobile points at the
Doctena listing. Same label, two destinations, depending on viewport.

Resolved to the internal page as canonical. **Additional finding:** `/afspraak-maken` is not a
scheduler — it is a Webflow form with Turnstile that submits a callback request
(*"nemen wij zo snel mogelijk telefonisch contact met je op"*). The rebuilt page carries phone and
the Doctena scheduler instead, since this build ships no forms backend.

### F-004 · Every FAQ item is `href="#"` — **fixed**
All eight accordion items on the live site are dead anchors, JS-dependent, with no `FAQPage`
structured data. Rebuilt as native `<details>/<summary>`: keyboard-operable, works with JavaScript
disabled (verified — `tools/checks.mjs`), with valid `FAQPage` JSON-LD.

### F-005 · Duplicated content on `/over-ons` — **fixed**
The four "why us" blocks appear twice on the same page: once as headed sections with photography,
once again as icon cards with identical copy. The rebuild states each fact once.

### F-006 · Typo in a specialist's job title — **fixed**
`Paradontoloog` → **`Parodontoloog`** (from *parodontium*, the tissue around the tooth). On a
medical site a misspelled specialty is a credibility hit. Still wrong on the live site.

### F-007 · Four service lines on one page, zero per-treatment routes — **fixed**
The biggest SEO loss on the site. Antwerp dental search is treatment-specific and none of it had a
landing page. **Twelve indexable treatment routes** now exist in each language, targeting *facings
Antwerpen*, *tandimplantaat Antwerpen*, *tanden bleken Antwerpen*, *wortelkanaalbehandeling
Antwerpen*, *aligners Antwerpen* and the rest. Six per-person routes as well — patients search
practitioner names.

### F-008 · Cookie consent categories are mislabelled — **not carried forward**
The live preference centre lists **Marketing, Personalization and Analytics all labelled
"Essential."** Only genuinely necessary storage may be classified as essential, and GTM
(`GTM-T98K5QDK`) is not. This looks like a misconfigured Finsweet/Webflow component rather than a
deliberate choice.

This build ships no third-party scripts and therefore no banner at all. Flagged because **if
analytics is re-added later, this configuration must not be copied forward** —
`CLIENT_ACTIONS.md` §8.

### F-009 · Dutch-only, with accidental English — **fixed**
No EN version, no `hreflang`, no `og:locale`, on a street five minutes from the diamond district.
Meanwhile the only English on the site was `WHAT WE DO` and `APPOINTMENT` scrolling past in a
marquee — which nobody decided.

A full EN mirror now exists: **32 routes in each language**, correct `hreflang` including
`x-default`, and a language switch that preserves the current page rather than dumping you on the
homepage.

### F-010 · Raster logo with spaces in the filename — **fixed**
`laclinic black.png` / `laclinic white.png`. Vectorised to a layered SVG with one addressable path
per letter, verified pixel-faithful against the source (0.306% disagreement over 1.97M ink
pixels). **1,261 bytes.** Delivered as a reusable brand asset.

### F-011 · Inconsistent nav and footer between pages — **fixed**
`/over-ons` was missing the Jobs link that appears on `/` and `/diensten`, and its footer social
block had only Instagram where other pages had all three. One nav component, one footer component;
`tools/audit.mjs` compares them byte-for-byte across all 64 routes and fails on any difference.

### F-012 · Open questions — **collected, not guessed**
All carried into `CLIENT_ACTIONS.md` rather than answered by assumption.

### F-013 · Seventeen font files downloaded, four families never used — **new**
The live site loads **eight** typeface families. Four of them —
**Mangogrotesque** (5 weights), **Switzer** (9 weights), **Velasans** (1), **Pramukhrounded** (2)
— are declared in `@font-face` and applied to **nothing**. Seventeen files fetched for zero
rendered glyphs.

Of the four that are used, `h1` and `h5` are set in Hauora while `h3`, `h4` and body are set in
Bdogrotesk, with Merriweather and Inter as third and fourth text voices.

The rebuild ships **one** family — Archivo Variable, one 88 KB file covering every weight and
width via axes.

### F-014 · No `<h1>` on the homepage — **new, fixed**
The live homepage's largest text is inside a hero image; there is no `h1` element. The rebuild
makes the wordmark itself the `h1`, carrying "LACLINIC DENTAL — tandarts in Antwerpen" as real
text for screen readers with the SVG marked `aria-hidden`.

*(Caught by `tools/audit.mjs` against this rebuild's first output, which had inherited the same
omission.)*

### F-015 · An eager Google Maps iframe on the booking page — **not carried forward**
`/afspraak-maken` embeds Google Maps in an iframe that loads on page view, which is a third-party
request with cookies before any consent. The rebuild uses a text address and a link; §16 permits
a static image or click-to-load if a map is wanted later.
