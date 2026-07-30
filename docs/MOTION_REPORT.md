# Motion report

Per §18.7: every library that shipped, with its one-sentence §8.2 justification. Anything that
could not answer *"what does this say about LACLINIC that a plain version wouldn't?"* was removed,
and those are listed too.

---

## What shipped

| Library | Shipped? | §8.2 justification |
|---|---|---|
| **Web Animations API** (native) | Yes | Not a library — the platform. Runs the letter-rise and the two reveals in 5.5 KB total. |
| **IntersectionObserver** (native) | Yes | Not a library. One observer for the whole page; each element unobserved the moment it fires. |
| **Everything else** | **No** | See below. |

**Total motion JavaScript: 5.5 KB uncompressed, unminified, zero dependencies.**

---

## What was removed, and why

### GSAP + ScrollTrigger + SplitText — removed

§10.1 is right that the whole GSAP toolkit went free in v3.13 (April 2025) and that this now
includes SplitText, MorphSVG, DrawSVG and the rest for commercial use.

§0.2 is also right that a free toolkit is therefore **not a differentiator** — and the two facts
together are the argument for not shipping it. Asked the §8.2 question directly:

> *What does GSAP say about LACLINIC that a plain version wouldn't?*
> Nothing. It says the developer knows GSAP.

What this site actually asks of a motion layer is §10.3's vocabulary: exactly two reveal variants,
a load-time timeline on the hero, and no scrubbing, no pinning, no morphing. That is what
`element.animate()` does natively. Adding ~45 KB gzip of engine to run two keyframe sets against a
1.8s LCP budget on 4G is cost without a claim.

**What was given up, honestly:** ScrollTrigger's `batch()`, its refresh handling on resize, and
SplitText's line-splitting with its built-in screen-reader handling. The first two are replaced by
one IntersectionObserver, which does not need refreshing because nothing is pinned. The third is
not needed because §10.4's headline treatment is not used — see below.

### Lenis (smooth scroll) — removed

§10.2 calls it the base layer and says it lifts perceived quality more than any effect. It
probably does. It was still removed.

Smooth scroll overrides how the user's own machine scrolls. On a site whose measurable job is
*"someone with toothache lands cold on their phone and reaches booking in under 15 seconds"*,
hijacking the scroll to add inertia works against the one thing being optimised. It also
introduces a second RAF loop, and on a page that is otherwise entirely static it is the single
largest runtime cost on the page.

§8.2 answer: *"it feels premium."* That is the exact phrasing §8.2 says to remove on.

### SplitText headline reveals — removed

§10.4 specifies line-by-line headline reveals. Not used. The hero's display type is the wordmark
SVG, not set text, and it has its own treatment (below). Applying a second reveal vocabulary to
the `h2`s underneath would be a third variant competing with the two in §10.3.

### The velocity-reactive marquee — removed

This is the §7.8 restraint entry, and the one that hurt.

§10.5 sanctions one marquee and describes how to make it clever: scroll-velocity-reactive,
accelerating and skewing with scroll speed. It would have been a genuine upgrade on the current
site's two static loops.

It came out because the letter-rise rhythm already carries movement down the page, and a
horizontal motion system competed with it rather than supporting it. Its content would have had
to be either the service list — already indexed two sections above — or the brand name, already
the hero. §8.2 answer: *"it looks cool."*

**The current site has two marquees. This one has none.**

### Everything in §10.6 marked ❌ or ⚠

Not shipped, and not close: WebGL-Fluid-Simulation, Vanta.js, Spline, Unicorn Studio, Barba.js,
Swup, Physics2D, Motion One, mesh gradients. Three.js/R3F was prototyped for the signature moment
and killed — see below.

### Custom cursor + magnetic buttons — removed

§10.6 lists it as ✅ USE, ~15 lines, big perceived-quality lift. Removed anyway: on a medical site
where a meaningful share of visitors are anxious and some are older, replacing the system cursor
is a usability cost for a decorative gain. §8.2 answer: *"it looks cool."*

---

## The signature moment

Two directions prototyped, one killed (§7.6 requires this).

### Kept — **The Bite**

The wordmark's eight letters rise from their shared baseline into place, in **ascending order of
their real height**: the short C's and A settle first, the tall N last. The mark assembles itself
the way a bite closes.

The ordering is not a design flourish — it is read at runtime from `path.getBBox().height`, so it
follows the actual geometry of the traced logo. Those same eight ratios
(`82 · 75 · 74 · 82 · 92 · 100 · 92 · 74`) then set the section rhythm for the whole page.

- **Cost: 0 KB.** The wordmark SVG is already in the document; the animation is eight
  `element.animate()` calls.
- Total duration under 1.6s, on load, then done (§10.8).
- Under `prefers-reduced-motion` nothing is registered at all and the mark renders finished —
  **verified: 0 animations registered**, hero opacity 1 (`tools/checks.mjs`).
- §8.2 answer: *no competitor owns these eight numbers.* It is this clinic's mark, moving
  according to its own measurements.

### Killed — **The Milling**

§7.6's proposal: a ceramic blank milled into a finished crown, scroll-driven, in R3F.

Killed on three grounds:

1. **No source asset, and no honest way to make one.** Generated imagery was declined for this
   build, so the crown would have to be procedurally modelled in code. A procedurally-generated
   tooth that reads *slightly wrong* on a dental site is worse than no signature at all — it
   becomes a fabricated clinical object, which §9.8 rules out and §17 puts inside the advertising
   rules.
2. **Cost.** Three.js plus a scroll-driven morph is ~150 KB gzip against a 320 KB WebGL budget, to
   do what 1.3 KB of existing SVG does, on a page with a 1.8s mobile LCP target.
3. **It fails its own test.** The milling idea exists to communicate the chairside CAD/CAM
   capability. That capability already has a dedicated page where it is explained in words and
   photographs by the people who do it. The animation would have been decoration on top of the
   real argument, not the argument.

The idea it was protecting — *one visit instead of three* — is kept where it converts: in the
copy, in the nav, and on `/een-afspraak-in-plaats-van-drie`.

---

## The reveal vocabulary (§10.3)

Two variants, no exceptions taken.

| Variant | Applied to | Spec |
|---|---|---|
| **Rise** | Headings, split columns, index rows | `y +24px → 0`, `opacity 0 → 1`, 900ms, `cubic-bezier(0.16,1,0.3,1)`, stagger 60ms **within a group only** |
| **Uncover** | Photography only | `clip-path inset(0 0 100% 0) → inset(0 0 0% 0)`, 1200ms, paired with an internal `scale 1.06 → 1.00` on the `<img>` so the frame uncovers a photograph already settling |

Never applied to text: Uncover. Never applied to media: Rise.

## Performance rules (§10.9)

- Only `transform`, `opacity` and `clip-path` animate. No layout property is touched.
- `will-change` is set on enter and **cleared on finish** — leaving it on is a memory leak.
- Every image declares intrinsic `width`/`height`, so no reveal can shift layout.
  **Measured CLS: 0.0000.**
- One IntersectionObserver for the page, not one per element; each element is unobserved on fire.
- No RAF loop exists on the page at all.

## Verification

From `tools/checks.mjs`, in headless Chrome:

```
CLS                                   0.0000
console errors, 9 routes              0
animations under reduced-motion       0        (hero renders finished)
animations with motion allowed        8        (the eight letters)
content with JavaScript disabled      full, FAQ opens, booking reachable
booking reachable by keyboard         tab 13, focus ring visible at every stop
horizontal overflow at 360px          none
motion JS                             5.5 KB
```
