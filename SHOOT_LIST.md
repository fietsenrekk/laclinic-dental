# Shoot list

What the rebuilt site needs photographically that the existing shoot does not cover. Ordered by
what the site gains from it.

The existing shoot is good and is used throughout — this is the gap list, not a criticism of it.

---

## 0 · Before shooting anything: find the original files

The single biggest improvement available is not a new shoot. It is the **existing** shoot at full
resolution. Everything on the CDN is a Webflow derivative capped at 3000px, with portraits at
1620px. See `CLIENT_ACTIONS.md` §3.

Ask the photographer for the RAW files or the full-resolution exports first.

---

## 1 · The chairside CAD/CAM unit — **highest value**

`/een-afspraak-in-plaats-van-drie` is the site's second-strongest page and the clinic's most
defensible commercial argument, and there is currently **no photograph of the machine that makes
the argument true.**

| | |
|---|---|
| **Purpose** | Hero and step imagery for the chairside page; also the strongest candidate for the Awwwards submission thumbnail |
| **Aspect** | One 3:2 landscape hero, three to four 4:5 portrait detail frames |
| **Minimum** | 4000px long edge |
| **Lighting** | Shoot it like a precision instrument, not like equipment. Single soft key from high side, deep falloff, dark ground. The reference is a watch or jewellery product shot — see `docs/ART_DIRECTION.md` §5 and the Cartier reference in the brief's Tier 2 |
| **Frames needed** | (a) the milling unit whole, (b) a ceramic blank before milling, (c) the mill mid-cut with the chamber wet, (d) a finished crown held in fingers, (e) the intraoral scanner in use |

**Do not** shoot a fitted crown in a patient's mouth, or anything that reads as a treatment
outcome. §17.

## 2 · The co-working space in the waiting room

Flagged in the brief as a genuine differentiator. It does not appear anywhere on the current site
and could not be verified, so **nothing has been written about it** — see `CLIENT_ACTIONS.md` §9.

If it exists, it is odd, specific and memorable, and nobody else in Antwerp dental has it.

| | |
|---|---|
| **Purpose** | A section on `/de-praktijk`, and a reason to book a morning appointment |
| **Aspect** | One 3:2 wide establishing frame, one 4:5 detail |
| **Minimum** | 3840px long edge |
| **Note** | Shoot it in use — a laptop open, a coffee — not as an empty room. An empty room reads as a stock waiting area |

## 3 · A true hero frame at full-bleed resolution

The homepage full-bleed currently uses `LACLINIC DENTAL -31` at 3000px. It works, but it is a
treatment-room frame doing a job it was not shot for, and 3000px is below what a 2560px display
wants at 2× DPR.

| | |
|---|---|
| **Purpose** | Homepage full-bleed band |
| **Aspect** | 3:2 or wider, composed with generous empty space on the left third for type |
| **Minimum** | 5120px long edge |
| **Content** | The practice interior with a person in it at working distance — not a portrait, not an empty room |

## 4 · Portrait re-shoot — only if originals cannot be found

The six existing portraits are **already one photographic system**: same backdrop, wardrobe,
lighting, crop and eye line. One photographer, one session. They grade to a single look with a
worst-case hue drift of 0.80° (`docs/IMAGE_REPORT.md` §5).

**They do not need re-shooting for consistency.** They need re-shooting only if the 1620px
originals are genuinely lost, because 1620px is what caps portrait display at 810 CSS px across
the whole site.

| | |
|---|---|
| **Minimum** | 3000px square |
| **Requirement** | All members in one session, same backdrop, same wardrobe, same key |
| **Note** | If a seventh person has joined since (see `docs/FINDINGS.md` B-001), they must be shot to match the existing six or the whole set stops reading as one system |

## 5 · Frames for treatment pages that currently share imagery

Twelve treatment pages draw on thirteen shoot frames, so several reuse the same photograph as
their service line. It is not wrong, but these five carry the most search traffic and would each
benefit from their own frame:

- `facings` — the milling and shade-matching step
- `tanden-bleken` — the custom tray being made, **never a whitened result**
- `aligners` — a tray in hand, or the case
- `tandimplantaten` — the planning scan on screen
- `wortelkanaalbehandeling` — the endodontic setup, shot calm and clean

| | |
|---|---|
| **Aspect** | 3:4 portrait, to match the existing treatment-page frame |
| **Minimum** | 2560px long edge |

---

## Constraints for every frame

- **No before/after imagery of any kind.** Legally fraught in Belgium and cheap regardless.
- **No digitally whitened teeth**, at capture or in post. The grade in `tools/images.mjs` measures
  and enforces this on every frame it processes.
- **Publication consent** from everyone identifiable, including staff. See `CLIENT_ACTIONS.md`.
- Shoot to the existing look: soft key, deep but never crushed shadows, no clipped highlights on
  white surfaces. The full grade with numeric targets is in `docs/IMAGE_REPORT.md` §2 — hand it to
  the photographer.
