/*
  Motion layer.
  -------------
  No GSAP, no Lenis, no ScrollTrigger. That is a decision, not an omission —
  see docs/MOTION_REPORT.md. Everything here is the Web Animations API and one
  IntersectionObserver, which is ~3 KB and does exactly what §10.3's two-variant
  vocabulary requires. §10.1 is right that the GSAP toolkit is now free, and
  §0.2 is right that a free toolkit is therefore not a differentiator.

  Rules this file obeys:
  - Only transform, opacity and clip-path animate. Never a layout property.
  - will-change is set on enter and removed on finish.
  - Under prefers-reduced-motion NOTHING is registered. Elements are already in
    their final state in CSS; the class on <html> is simply never acted on.
  - The page is fully readable and usable if this file never loads.
*/

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/** The two reveal variants (§10.3). Anything else needs a written reason. */
const RISE = {
  keyframes: [
    { opacity: 0, transform: 'translate3d(0,24px,0)' },
    { opacity: 1, transform: 'translate3d(0,0,0)' },
  ],
  options: { duration: 900, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'both' },
};

const UNCOVER = {
  keyframes: [
    { clipPath: 'inset(0 0 100% 0)' },
    { clipPath: 'inset(0 0 0% 0)' },
  ],
  options: { duration: 1200, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'both' },
};

function play(el, spec, delay = 0) {
  el.style.willChange = spec === UNCOVER ? 'clip-path' : 'transform, opacity';
  const anim = el.animate(spec.keyframes, { ...spec.options, delay });
  anim.finished
    .then(() => {
      el.style.willChange = '';
      // Hand the final state back to CSS so nothing depends on the animation
      // object surviving — this is what keeps CLS at zero on re-layout.
      el.style.opacity = '';
      el.style.transform = '';
    })
    .catch(() => {});
  return anim;
}

function init() {
  if (reduced.matches) return;

  /*
    THE SIGNATURE MOMENT — the bite.

    The eight letters rise from their shared baseline in ascending order of
    height: the short molars settle first, the tall N last. Those rise values
    are the mark's real geometry (assets/brand/wordmark-metrics.json), which is
    why the timing feels like one object closing rather than eight things
    moving. Total under 1.6s, on load, then it is done (§10.8).
  */
  const mark = document.querySelector('[data-mark] svg');
  if (mark) {
    const letters = [...mark.querySelectorAll('path')];
    // Shortest first — ascending by rendered height.
    const order = letters
      .map((el) => ({ el, h: el.getBBox().height }))
      .sort((a, b) => a.h - b.h);

    order.forEach(({ el }, i) => {
      el.animate(
        [
          { transform: 'translateY(18%) scaleY(0.86)', opacity: 0 },
          { transform: 'translateY(0) scaleY(1)', opacity: 1 },
        ],
        {
          duration: 900,
          delay: 90 + i * 62,
          easing: 'cubic-bezier(0.16,1,0.3,1)',
          fill: 'both',
        },
      );
    });
  }

  /*
    Scroll reveals. One observer for the whole page rather than one per
    element, and each element is unobserved the moment it fires — `once: true`
    in ScrollTrigger terms.
  */
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        io.unobserve(el);

        if (el.hasAttribute('data-uncover')) {
          // The frame uncovers a photograph that is already settling, so the
          // image is not simply revealed — it arrives.
          const media = el.firstElementChild;
          if (media) {
            play(media, UNCOVER);
            const img = media.querySelector('img');
            if (img) {
              img.animate(
                [{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
                { duration: 1400, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'both' },
              );
            }
          }
          continue;
        }

        // Stagger applies WITHIN a group only, never across sections.
        const group = [...el.parentElement.querySelectorAll(':scope > [data-rise]')];
        const idx = Math.max(0, group.indexOf(el));
        play(el, RISE, Math.min(idx, 8) * 60);
      }
    },
    { rootMargin: '0px 0px -18% 0px', threshold: 0 },
  );

  for (const el of document.querySelectorAll('[data-rise], [data-uncover]')) io.observe(el);
}

/*
  Mark headings and index rows for the rise treatment here rather than in the
  generator, so the HTML stays clean and a JS-less page carries no dead
  attributes at all.
*/
if (!reduced.matches) {
  for (const sec of document.querySelectorAll('.section')) {
    const targets = sec.querySelectorAll(':scope > .wrap > h2, :scope > .wrap > .split > *, :scope > .wrap > .index > *');
    for (const el of targets) el.setAttribute('data-rise', '');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

/*
  The mobile menu closes on outside click and on Escape. <details> already
  handles toggling, keyboard operation and the JS-less case; this is only the
  polish on top.
*/
const menu = document.querySelector('.menu');
if (menu) {
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
}
