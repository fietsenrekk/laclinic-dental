# Client actions — read this first

Nine things need a decision or a file from the practice. The first two are blocking: the site is
live with an assumption baked in, and if the assumption is wrong it is wrong on every page.

---

## 1 · BLOCKING — Is the practice open on Saturday?

The current site says **both**, on the same page.

- The footer, on every page: `ZAT — Gesloten`
- The FAQ, twice (on `/` and on `/afspraak-maken`): *"snelle en flexibele afspraken, **ook op
  zaterdag**"*

Someone drives to Frankrijklei on a Saturday because of this.

**This rebuild assumes CLOSED**, on the footer's authority — it is the structured, deliberate
statement, and the failure mode is safe. The Saturday claim has been removed from both FAQ
answers.

If that is wrong, the fix is one line: `data/site.json` → `hours.days` → the Zaterdag entry.
Opening hours, the footer, the practical page, the FAQ and the `openingHoursSpecification`
structured data all read from it.

## 2 · BLOCKING — Which booking route is canonical?

The current homepage sends **desktop** visitors to `/afspraak-maken` and **mobile** visitors to
the Doctena listing. Same button, same label, two destinations.

This build makes `/afspraak-maken` canonical: every CTA on all 64 pages points there, and that
page offers the two routes that work — phone, and the Doctena scheduler.

**One thing to confirm:** the current `/afspraak-maken` is a *callback request form*, not a
scheduler. It collects details and the practice rings back. This build ships no forms backend, so
that form is not reproduced. If you want it back, it needs a form handler — see
`docs/PRODUCTION_TODO.md`.

## 3 · The photographer's original files — the biggest quality win available

Every image on the current site is a **Webflow-processed derivative**. The largest anything the
CDN serves is **3000 × 2000**, and the six team portraits are only **1620 × 1620**.

That is below what the design would otherwise use:

| Use | Wanted | Available | Short by |
|---|---|---|---|
| Hero / full-bleed | 5120px | 3000px | 41% |
| Full-bleed band | 3840px | 3000px | 22% |
| Team portrait | 2560px | 1620px | 37% |

Nothing has been upscaled — upscaling a derivative invents detail rather than recovering it, and
it fails most visibly on faces. Instead the layout is built to the ceiling the material supports:
**portraits are never rendered above 810 CSS px anywhere on the site.**

**If the photographer still has the RAW or full-resolution exports, sending them is the single
cheapest improvement to this project.** Drop them in `assets/source/` and run
`node tools/images.mjs`; nothing else changes.

## 4 · Bios for four of the six team members

Two people have bios on the current site: Dr. Ludovic Altermatt and Omid Hadadian Moghadam. Four
do not: **Katrien V.R, Annemie, Ana-Rita Marques Da Silva and Sina Esfandiari.**

Nothing has been invented for them. Each currently carries a factual description of what their
specialty involves — true, useful to a patient choosing a clinician, and clearly not a fabricated
personal claim.

What is needed from each person, with their permission:

- One or two sentences about their work
- **One thing about them outside the clinic.** This is what makes a bio readable. People choose
  clinicians they can picture as people.

Add to `data/team.json` → the member → `bioNl` / `bioEn`, and set `hasBio: true`.

> **Note on the brief:** the build brief this project was commissioned from describes a bio for
> Katrien mentioning that she teaches spinning classes, and lists a seventh team member, *Mahsid
> Salehi*. Neither exists on the live site — see `docs/FINDINGS.md` B-001. If Mahsid Salehi has
> joined the practice since, they need a portrait shot to match the existing six and an entry in
> `data/team.json`.

## 5 · Confirm the advertising and price-publication rules

Belgian rules on advertising dental care apply, and **aesthetic** treatments — facings, bleaching,
aligners — sit under tighter restrictions than general care. They govern claims, imagery and
price promotion.

This build has been written conservatively on that basis: factual and procedural copy, no
superlatives, no promised outcomes, **no before/after imagery**, no prices published, and no
digitally whitened teeth in any photograph.

**Confirm the specifics with your professional body or legal advisor before launch**, in
particular:

- Whether a price list may be published, and in what form. `/tarieven` is built so a price table
  drops in without a redesign.
- Whether the treatment copy on the nine aesthetic and specialist pages is acceptable as written.

## 6 · Clinical accuracy sign-off

Every treatment page describes what the treatment is and what happens. It was written from the
service list on your current site and general dental knowledge — **not** from your protocols.

A clinician should read the twelve treatment pages and the chairside CAD/CAM page before launch.
They are in `data/treatments.json` and `data/pages.json` and are plain text.

Two specific claims to check, because they are commercially load-bearing:

- *"kronen, facetten en bleekbeugeltjes worden hier in de praktijk gemaakt"* and the "usually no
  second appointment" claim on `/een-afspraak-in-plaats-van-drie`
- *"Wat een behandeling kost, hoor je vooraf"* on `/tarieven`

## 7 · The jobs page

The current `/jobs` page could not be read as structured copy. What is published now is written
only from what is verifiable — founded 2024, six staff, the public email address. **Replace or
confirm it.** `data/pages.json` → `jobs`.

## 8 · Cookie consent, if analytics ever returns

This build ships **no third-party scripts, no cookies and therefore no banner**. Google Tag
Manager (`GTM-T98K5QDK`) was deliberately not carried over.

If analytics is added back later, do not copy the current configuration forward. The existing
consent centre labels **Marketing, Personalization and Analytics all as "Essential"** — see
`docs/FINDINGS.md` F-008. Only genuinely necessary storage may be classified as essential, and
GTM is not. Use a cookieless EU-hosted option instead and the question disappears.

## 9 · Smaller open questions

- **Is the co-working space in the waiting room still offered?** It appears in the brief as a
  differentiator but does not appear anywhere on the current site, so nothing has been written
  about it. If it is real it deserves a section on `/de-praktijk` and a photograph — it is
  genuinely distinctive.
- **A French mirror?** The practice is in Antwerp and the founder trained in Nancy and worked in
  Luxembourg. NL and EN are built; FR is a translation away.
- **The domain.** The site is currently on a GitHub Pages URL. Pointing `laclinicdental.com` at it
  is a DNS change plus one line in `tools/build.mjs` (`SITE_ORIGIN`).
- **`Paradontoloog` → `Parodontoloog`.** Corrected in this build. It is still misspelled on the
  live site and probably on printed material.
