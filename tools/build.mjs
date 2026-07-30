#!/usr/bin/env node
/**
 * Static site generator. Zero dependencies.
 *
 * Emits every route in NL and EN from data/*.json. Fails the build rather than
 * emitting a broken page: a missing i18n key, an unresolved image or a booking
 * target that does not exist all stop the run.
 *
 *   node tools/build.mjs
 *   BASE_PATH=/laclinic node tools/build.mjs   # GitHub Pages project site
 */
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = (process.env.BASE_PATH ?? '').replace(/\/$/, '');
const ORIGIN = process.env.SITE_ORIGIN ?? 'https://laclinicdental.github.io';

const read = async (f) => JSON.parse(await readFile(path.join(ROOT, f), 'utf8'));
const site = await read('data/site.json');
const team = await read('data/team.json');
const treatments = await read('data/treatments.json');
const pages = await read('data/pages.json');
const ui = await read('data/ui.json');
const images = existsSync(path.join(ROOT, 'data/images.json')) ? await read('data/images.json') : { images: [] };

const wordmark = await readFile(path.join(ROOT, 'assets/brand/laclinic-wordmark-only.svg'), 'utf8');
const lockup = await readFile(path.join(ROOT, 'assets/brand/laclinic-wordmark.svg'), 'utf8');
const metrics = await read('assets/brand/wordmark-metrics.json');

const errors = [];
const fail = (m) => errors.push(m);

/* -------------------------------------------------------------- utilities */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const attr = (s) => esc(s).replace(/'/g, '&#39;');

/** Root-relative URL, base-path aware. */
const url = (p = '') => {
  const clean = String(p).replace(/^\/+|\/+$/g, '');
  return clean ? `${BASE}/${clean}/` : `${BASE}/`;
};
const asset = (p) => `${BASE}/${String(p).replace(/^\/+/, '')}`;

/** i18n lookup that fails the build rather than rendering an empty string. */
function makeT(lang) {
  const dict = ui[lang];
  return (key) => {
    const val = key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);
    if (val == null) {
      fail(`missing i18n key "${key}" for lang "${lang}"`);
      return `⟨${key}⟩`;
    }
    return val;
  };
}

/* --------------------------------------------------------------- pictures */

const imgBySlug = new Map(images.images.map((i) => [i.slug, i]));

function frameSlug(filename) {
  return filename
    .replace(/\.[a-z]+$/i, '')
    .toLowerCase()
    .replace(/lacli?nic dental\s*-?/i, 'frame-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Responsive <picture>. AVIF first, WebP as the legacy fallback, intrinsic
 * dimensions always declared so a reveal can never shift layout.
 *
 * `sizes` must describe the real rendered width — getting it wrong is how a
 * responsive image quietly downloads the 2560px variant into a 400px slot.
 */
function picture(source, { alt, sizes, className = '', loading = 'lazy', priority = false, ratio }) {
  const slug = typeof source === 'string' ? frameSlug(source) : source;
  const img = imgBySlug.get(slug);
  if (!img) {
    fail(`no processed image for "${slug}" — run: node tools/images.mjs`);
    return `<!-- missing image ${esc(slug)} -->`;
  }
  const byFmt = (fmt) =>
    img.variants
      .filter((v) => v.format === fmt)
      .sort((a, b) => a.width - b.width)
      .map((v) => `${asset('img/' + v.file)} ${v.width}w`)
      .join(', ');

  const fallbacks = img.variants.filter((v) => v.format === 'webp').sort((a, b) => a.width - b.width);
  const mid = fallbacks[Math.min(2, fallbacks.length - 1)];
  const [rw, rh] = ratio ? ratio.split('/').map(Number) : [img.intrinsic.w, img.intrinsic.h];

  return `<picture class="${attr(className)}">
<source type="image/avif" srcset="${byFmt('avif')}" sizes="${attr(sizes)}">
<source type="image/webp" srcset="${byFmt('webp')}" sizes="${attr(sizes)}">
<img src="${asset('img/' + mid.file)}" alt="${attr(alt)}" width="${rw}" height="${rh}"
 ${priority ? 'fetchpriority="high" decoding="sync"' : `loading="${loading}" decoding="async"`}></picture>`;
}

/* ------------------------------------------------------------- components */

/** The single booking component. One file changes if the clinic changes system. */
function bookingCta(lang, { variant = 'primary', label } = {}) {
  const t = makeT(lang);
  const href = url(lang === 'nl' ? site.booking.canonicalPath : 'en/' + site.booking.canonicalPath);
  const cls = variant === 'ghost' ? 'cta cta--ghost' : 'cta';
  return `<a class="${cls}" href="${href}">${esc(label ?? t('book'))}<svg class="cta__arrow" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 9L9 1M9 1H3M9 1v6"/></svg></a>`;
}

const NAV = [
  ['treatments', 'behandelingen', 'treatments'],
  ['chairside', 'een-afspraak-in-plaats-van-drie', 'one-appointment-not-three'],
  ['team', 'team', 'team'],
  ['practice', 'de-praktijk', 'the-practice'],
  ['practical', 'praktisch', 'practical'],
  ['pricing', 'tarieven', 'fees'],
  ['faq', 'veelgestelde-vragen', 'questions'],
  ['jobs', 'jobs', 'jobs'],
  ['contact', 'contact', 'contact'],
];

const navPath = (lang, nl, en) => (lang === 'nl' ? url(nl) : url('en/' + en));

function nav(lang, current) {
  const t = makeT(lang);
  const links = NAV.map(([key, nl, en]) => {
    const href = navPath(lang, nl, en);
    const cur = current === href ? ' aria-current="page"' : '';
    return `<a href="${href}"${cur}>${esc(t('nav.' + key))}</a>`;
  }).join('');

  const other = lang === 'nl' ? 'en' : 'nl';
  const tOther = makeT(other);

  return `<header class="nav">
<div class="wrap nav__in">
<a class="nav__mark" href="${lang === 'nl' ? url() : url('en')}" aria-label="LACLINIC DENTAL — ${lang === 'nl' ? 'home' : 'home'}">${wordmark}</a>
<nav class="nav__links" aria-label="${attr(t('menu'))}">
${links}
<a href="${swapLang(current, lang)}" hreflang="${other}" lang="${other}">${esc(tOther('langSwitch') === 'English' ? 'Nederlands' : 'English')}</a>
${bookingCta(lang, { variant: 'ghost', label: t('bookShort') })}
</nav>
<details class="menu nav__toggle">
<summary class="nav__toggle" aria-label="${attr(t('menu'))}">${esc(t('menu'))}</summary>
<div class="menu__panel">
${links}
<a href="${swapLang(current, lang)}" hreflang="${other}" lang="${other}">${esc(other === 'en' ? 'English' : 'Nederlands')}</a>
</div>
</details>
</div>
</header>`;
}

/** Maps a path to its counterpart in the other language, preserving the page. */
const langPairs = new Map();
function swapLang(currentUrl, lang) {
  const pair = langPairs.get(currentUrl);
  if (pair) return pair;
  return lang === 'nl' ? url('en') : url();
}

function footer(lang) {
  const t = makeT(lang);
  const hours = site.hours.days
    .filter((d) => d.schema !== 'Sunday')
    .map((d) => {
      const name = lang === 'nl' ? d.day : d.dayEn;
      const val = d.closed ? esc(t('closed')) : `${d.open}–${d.close}`;
      return `<div class="hours__row${d.closed ? ' hours__row--closed' : ''}"><span>${esc(name)}</span><span>${val}</span></div>`;
    })
    .join('');

  const navList = NAV.map(([key, nl, en]) => `<li><a href="${navPath(lang, nl, en)}">${esc(t('nav.' + key))}</a></li>`).join('');
  const social = site.social.map((s) => `<li><a href="${s.url}" rel="noopener noreferrer nofollow" target="_blank">${esc(s.name)}</a></li>`).join('');

  return `<footer class="footer">
<div class="wrap">
<div class="footer__grid">
<div>
<h2 class="footer__h">${esc(t('address'))}</h2>
<address style="font-style:normal;font-size:var(--t-small);line-height:1.7">
${esc(site.address.street)}<br>${esc(site.address.postalCode)} ${esc(site.address.city)}<br>
<a href="${site.phoneHref}" class="num">${esc(site.phone)}</a><br>
<a href="mailto:${site.email}">${esc(site.email)}</a>
</address>
</div>
<div>
<h2 class="footer__h">${esc(t('openingHours'))}</h2>
${hours}
</div>
<div>
<h2 class="footer__h">${esc(t('menu'))}</h2>
<ul>${navList}</ul>
</div>
<div>
<h2 class="footer__h">Social</h2>
<ul>${social}</ul>
<h2 class="footer__h" style="margin-top:2rem">${esc(t('legal'))}</h2>
<ul>
<li><a href="${lang === 'nl' ? url('juridisch/privacy') : url('en/legal/privacy')}">${esc(t('privacy'))}</a></li>
<li><a href="${lang === 'nl' ? url('juridisch/toegankelijkheid') : url('en/legal/accessibility')}">${esc(t('accessibility'))}</a></li>
</ul>
</div>
</div>
<div class="footer__mark" aria-hidden="true">${lockup}</div>
<div class="footer__legal">
<span>${esc(site.legalName)}</span>
<span class="num">${esc(t('vat'))} ${esc(site.vat)}</span>
<span>© LACLINIC DENTAL ${new Date().getFullYear()}</span>
<span>${esc(t('colophon'))}</span>
</div>
</div>
</footer>`;
}

function actionBar(lang) {
  const t = makeT(lang);
  return `<div class="actionbar">
<a href="${url(lang === 'nl' ? site.booking.canonicalPath : 'en/' + site.booking.canonicalPath)}">${esc(t('book'))}</a>
<a href="${site.phoneHref}">${esc(t('call'))}</a>
</div>`;
}

/* ---------------------------------------------------------- structured data */

function jsonLd(lang, page) {
  const t = makeT(lang);
  const graph = [];

  const openingHours = site.hours.days
    .filter((d) => !d.closed)
    .map((d) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${d.schema}`,
      opens: d.open,
      closes: d.close,
    }));

  graph.push({
    '@type': ['Dentist', 'MedicalBusiness'],
    '@id': `${ORIGIN}${url()}#practice`,
    name: site.name,
    legalName: site.legalName,
    vatID: site.vat,
    url: `${ORIGIN}${url()}`,
    telephone: site.phone,
    email: site.email,
    foundingDate: site.founded,
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      postalCode: site.address.postalCode,
      addressLocality: site.address.city,
      addressCountry: site.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: site.address.lat, longitude: site.address.lon },
    openingHoursSpecification: openingHours,
    sameAs: site.social.map((s) => s.url),
    availableService: treatments.treatments.map((x) => ({
      '@type': 'MedicalProcedure',
      name: lang === 'nl' ? x.titleNl : x.titleEn,
      url: `${ORIGIN}${treatmentUrl(lang, x)}`,
    })),
  });

  if (page.persons) {
    for (const m of page.persons) {
      graph.push({
        '@type': 'Person',
        '@id': `${ORIGIN}${personUrl(lang, m)}#person`,
        name: m.name,
        jobTitle: lang === 'nl' ? m.roleNl : m.roleEn,
        url: `${ORIGIN}${personUrl(lang, m)}`,
        worksFor: { '@id': `${ORIGIN}${url()}#practice` },
      });
    }
  }

  if (page.faq) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: page.faq.map((f) => ({
        '@type': 'Question',
        name: lang === 'nl' ? f.qNl : f.qEn,
        acceptedAnswer: { '@type': 'Answer', text: lang === 'nl' ? f.aNl : f.aEn },
      })),
    });
  }

  if (page.crumbs?.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('home'), item: `${ORIGIN}${lang === 'nl' ? url() : url('en')}` },
        ...page.crumbs.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 2,
          name: c.label,
          item: `${ORIGIN}${c.href}`,
        })),
      ],
    });
  }

  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

/* ------------------------------------------------------------------ layout */

const routes = [];

function layout(page) {
  const { lang, path: routePath } = page;
  const t = makeT(lang);
  const self = `${ORIGIN}${routePath}`;
  const alt = page.altPath ? `${ORIGIN}${page.altPath}` : null;

  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${attr(page.description)}">
<link rel="canonical" href="${self}">
${alt ? `<link rel="alternate" hreflang="${lang === 'nl' ? 'en' : 'nl-BE'}" href="${alt}">` : ''}
<link rel="alternate" hreflang="${lang === 'nl' ? 'nl-BE' : 'en'}" href="${self}">
${alt ? `<link rel="alternate" hreflang="x-default" href="${lang === 'nl' ? self : alt}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${attr(page.title)}">
<meta property="og:description" content="${attr(page.description)}">
<meta property="og:url" content="${self}">
<meta property="og:locale" content="${t('locale')}">
<meta property="og:site_name" content="${attr(site.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#111111">
<link rel="icon" href="${asset('favicon.svg')}" type="image/svg+xml">
<link rel="preload" href="${asset('fonts/archivo-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="${site.booking.doctenaHost}">
<link rel="stylesheet" href="${asset('styles.css')}">
${jsonLd(lang, page)}`;

  return `<!doctype html>
<html lang="${t('lang')}">
<head>
${head}
</head>
<body>
<script>document.documentElement.classList.add('js')</script>
<a class="skip" href="#main">${esc(t('skip'))}</a>
${nav(lang, routePath)}
<main id="main">
${page.body}
</main>
${footer(lang)}
${actionBar(lang)}
<div class="grain" aria-hidden="true"></div>
<script type="module" src="${asset('motion.js')}"></script>
</body>
</html>
`;
}

/* -------------------------------------------------------------- url helpers */

const treatmentUrl = (lang, x) =>
  lang === 'nl' ? url(`behandelingen/${x.slug}`) : url(`en/treatments/${x.slugEn}`);
const personUrl = (lang, m) => (lang === 'nl' ? url(`team/${m.slug}`) : url(`en/team/${m.slug}`));

/** Section rhythm: cycle the wordmark's letter rises so no two adjacent match. */
const RISES = metrics.letters.map((l) => l.rise);
const riseFor = (i) => RISES[i % RISES.length];

function section(i, inner, { tone = '', id = '' } = {}) {
  const cls = ['section', tone && `section--${tone}`].filter(Boolean).join(' ');
  return `<section class="${cls}" style="--rise:${riseFor(i)}"${id ? ` id="${id}"` : ''}><div class="wrap">${inner}</div></section>`;
}

function eyebrow(n, label) {
  return `<p class="eyebrow"><span class="eyebrow__n">${esc(n)}</span><span>${esc(label)}</span></p>`;
}

/* ------------------------------------------------------------------- pages */

function addRoute(page) {
  routes.push(page);
  return page;
}

function pairRoutes(nlPage, enPage) {
  nlPage.altPath = enPage.path;
  enPage.altPath = nlPage.path;
  langPairs.set(nlPage.path, enPage.path);
  langPairs.set(enPage.path, nlPage.path);
  addRoute(nlPage);
  addRoute(enPage);
}

/* --- home --- */

function homeBody(lang) {
  const t = makeT(lang);
  const nl = lang === 'nl';
  const d = site.differentiators;

  let i = 0;
  const out = [];

  // Hero: the wordmark IS the display type and therefore the page heading.
  // It carries the accessible name as real text so a screen reader announces
  // the practice and its discipline, not just a logo.
  out.push(`<section class="section hero" style="--rise:100">
<div class="wrap">
<h1 class="mark" data-mark>
<span class="vh">LACLINIC DENTAL — ${esc(nl ? 'tandarts in Antwerpen' : 'dentist in Antwerp')}</span>
${wordmark.replace('role="img" aria-label="LACLINIC"', 'aria-hidden="true"')}
</h1>
<div class="hero__meta">
<span class="hero__claim">${esc(nl ? d.noWaitlist.nl : d.noWaitlist.en)}</span>
<span>${esc(nl ? 'Tandarts in hartje Antwerpen' : 'Dentist in central Antwerp')}</span>
<span class="num">${esc(site.address.street)}</span>
</div>
<div class="cta-row" style="margin-top:2.5rem">
${bookingCta(lang)}
<a class="cta cta--ghost" href="${site.phoneHref}">${esc(t('call'))} <span class="num">${esc(site.phone)}</span></a>
</div>
</div>
</section>`);

  // The three facts, as an index rather than icon cards.
  const facts = [
    [nl ? d.chairside.nl : d.chairside.en,
     nl ? 'Kronen en facetten worden hier gefreesd terwijl je er bent. Meestal geen tweede afspraak, geen tijdelijke kroon.'
        : 'Crowns and veneers are milled here while you wait. Usually no second appointment, no temporary crown.',
     nl ? url('een-afspraak-in-plaats-van-drie') : url('en/one-appointment-not-three')],
    [nl ? d.noWaitlist.nl : d.noWaitlist.en,
     nl ? 'Afspraken worden kort op elkaar gepland. Je hoeft geen maanden te wachten om patiënt te worden.'
        : 'Appointments are scheduled close together. You do not wait months to become a patient.',
     nl ? url(site.booking.canonicalPath) : url('en/' + site.booking.canonicalPath)],
    [nl ? d.central.nl : d.central.en,
     nl ? 'Parkeergarages Hopland, Inno en Horta op drie minuten. Antwerpen Centraal op vijftien.'
        : 'The Hopland, Inno and Horta car parks are three minutes away. Antwerpen Centraal fifteen.',
     nl ? url('praktisch') : url('en/practical')],
  ];
  out.push(section(i++, `${eyebrow('01', nl ? 'Waarom hier' : 'Why here')}
<div class="index">
${facts.map(([title, desc, href], n) => `<a class="index__row" href="${href}">
<span class="index__n">${String(n + 1).padStart(2, '0')}</span>
<span><span class="index__t">${esc(title)}</span><span class="index__d">${esc(desc)}</span></span>
<span class="index__go" aria-hidden="true">→</span>
</a>`).join('')}
</div>`, { tone: 'surface' }));

  // A full-bleed frame, uncovered on scroll.
  out.push(`<section class="section" style="--rise:${riseFor(i++)}">
<figure class="bleed" data-uncover><div class="frame frame--wide">${picture('LACLINIC DENTAL -31.webp', {
    alt: nl ? 'Behandelkamer bij LACLINIC DENTAL aan de Frankrijklei in Antwerpen.'
            : 'Treatment room at LACLINIC DENTAL on Frankrijklei in Antwerp.',
    sizes: '100vw',
  })}</div></figure>
</section>`);

  // Treatments index.
  out.push(section(i++, `${eyebrow('02', nl ? 'Behandelingen' : 'Treatments')}
<div class="split">
<div><h2>${esc(nl ? 'Van controle tot reconstructie' : 'From check-up to reconstruction')}</h2></div>
<div>
<div class="index">
${treatments.lines.map((line, n) => `<a class="index__row" href="${nl ? url('behandelingen') : url('en/treatments')}#${line.slug}">
<span class="index__n">${String(n + 1).padStart(2, '0')}</span>
<span><span class="index__t">${esc(nl ? line.titleNl : line.titleEn)}</span><span class="index__d">${esc(nl ? line.introNl : line.introEn)}</span></span>
<span class="index__go" aria-hidden="true">→</span>
</a>`).join('')}
</div>
<div class="cta-row" style="margin-top:2rem"><a class="cta cta--ghost" href="${nl ? url('behandelingen') : url('en/treatments')}">${esc(t('allTreatments'))}</a></div>
</div>
</div>`));

  // Team.
  out.push(section(i++, `${eyebrow('03', t('meetTeam'))}
<div class="split" style="margin-bottom:3rem">
<div><h2>${esc(nl ? 'Zes mensen' : 'Six people')}</h2></div>
<div class="prose"><p>${esc(nl
    ? 'Twee behandelaars met een eigen specialisatie, een mondhygiënist, een endodontoloog, een parodontoloog, een assistente en een praktijkmanager.'
    : 'Practitioners with their own specialisations, a dental hygienist, an endodontist, a periodontist, an assistant and a practice manager.')}</p></div>
</div>
<div class="team">
${team.members.map((m) => personCard(lang, m)).join('')}
</div>`, { tone: 'surface' }));

  // Practical, plus the booking close.
  out.push(section(i++, `${eyebrow('04', t('practical'))}
<div class="split">
<div class="stack">
<h2>${esc(nl ? 'Zo raak je er' : 'Getting here')}</h2>
<div class="deflist">
${site.practical.parking.map((p) => `<div class="deflist__row"><span class="deflist__k">${esc(t('parking'))}</span><span class="deflist__v">${esc(p.name)} — ${p.walk} ${esc(t('minWalk'))}</span></div>`).join('')}
${site.practical.transit.map((p) => `<div class="deflist__row"><span class="deflist__k">${esc(nl ? p.mode : p.modeEn)}</span><span class="deflist__v">${esc(p.name)} — ${p.walk} ${esc(t('minWalk'))}</span></div>`).join('')}
</div>
</div>
<div class="stack">
<h2>${esc(nl ? 'Een afspraak maken' : 'Making an appointment')}</h2>
<p class="lead">${esc(nl ? site.differentiators.noWaitlist.nl : site.differentiators.noWaitlist.en)}</p>
<div class="cta-row">${bookingCta(lang)}<span class="cta-note">${esc(nl ? 'of bel' : 'or call')} <a href="${site.phoneHref}" class="num">${esc(site.phone)}</a></span></div>
</div>
</div>`, { tone: 'deep' }));

  return out.join('\n');
}

function personCard(lang, m) {
  const nl = lang === 'nl';
  return `<a class="person" href="${personUrl(lang, m)}">
<div class="frame frame--square">${picture(m.slug, {
    alt: `${m.name} — ${nl ? m.roleNl : m.roleEn}, LACLINIC DENTAL`,
    sizes: '(min-width: 55rem) 22vw, 45vw',
  })}</div>
<span class="person__n">${esc(m.name)}</span>
<span class="person__r">${esc(nl ? m.roleNl : m.roleEn)}</span>
</a>`;
}

for (const lang of ['nl', 'en']) {
  const nl = lang === 'nl';
  const p = {
    lang,
    path: nl ? url() : url('en'),
    title: nl
      ? 'LACLINIC DENTAL — Tandarts in Antwerpen, zonder wachtlijst'
      : 'LACLINIC DENTAL — Dentist in Antwerp, no waiting list',
    description: nl
      ? 'Tandarts aan de Frankrijklei in Antwerpen. Geen patiëntenstop, kronen en facetten in de praktijk gemaakt. Maak een afspraak.'
      : 'Dentist on Frankrijklei in Antwerp. No patient stop, crowns and veneers made in the practice. Book an appointment.',
    persons: team.members,
    body: homeBody(lang),
  };
  if (nl) var homeNl = p; else pairRoutes(homeNl, p);
}

/* --- treatments overview + per-treatment --- */

function treatmentsOverview(lang) {
  const nl = lang === 'nl';
  const t = makeT(lang);
  let i = 0;
  const head = `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">${esc(nl ? 'Behandelingen' : 'Treatments')}</h1>
<p class="lead" style="margin-top:1.5rem">${esc(nl
    ? 'Van preventieve zorg tot esthetische en specialistische ingrepen.'
    : 'From preventive care to aesthetic and specialist procedures.')}</p>
</div></section>`;

  const lines = treatments.lines.map((line, n) => {
    const kids = treatments.treatments.filter((x) => x.line === line.slug);
    return section(i++, `${eyebrow(String(n + 1).padStart(2, '0'), nl ? line.titleNl : line.titleEn)}
<div class="split${n % 2 ? ' split--flip' : ''}">
<div class="stack">
<h2>${esc(nl ? line.leadNl : line.leadEn)}</h2>
<p class="prose">${esc(nl ? line.introNl : line.introEn)}</p>
</div>
<div>
<figure data-uncover><div class="frame frame--wide">${picture(line.frame, {
      alt: nl ? `${line.titleNl} bij LACLINIC DENTAL` : `${line.titleEn} at LACLINIC DENTAL`,
      sizes: '(min-width: 55rem) 55vw, 100vw',
    })}</div></figure>
<div class="index" style="margin-top:2rem">
${kids.map((x, k) => `<a class="index__row" href="${treatmentUrl(lang, x)}">
<span class="index__n">${String(k + 1).padStart(2, '0')}</span>
<span class="index__t">${esc(nl ? x.titleNl : x.titleEn)}</span>
<span class="index__go" aria-hidden="true">→</span>
</a>`).join('')}
</div>
</div>
</div>`, { tone: n % 2 ? 'surface' : '', id: line.slug });
  }).join('\n');

  return head + lines + section(i++, `<div class="split">
<div><h2>${esc(nl ? 'Vragen over een behandeling?' : 'Questions about a treatment?')}</h2></div>
<div class="stack"><div class="cta-row">${bookingCta(lang)}<span class="cta-note">${esc(nl ? 'of bel' : 'or call')} <a href="${site.phoneHref}" class="num">${esc(site.phone)}</a></span></div></div>
</div>`, { tone: 'deep' });
}

for (const lang of ['nl', 'en']) {
  const nl = lang === 'nl';
  const p = {
    lang,
    path: nl ? url('behandelingen') : url('en/treatments'),
    title: nl ? 'Behandelingen — LACLINIC DENTAL Antwerpen' : 'Treatments — LACLINIC DENTAL Antwerp',
    description: nl
      ? 'Preventieve zorg, esthetische tandheelkunde, implantologie en restauratieve behandelingen in Antwerpen.'
      : 'Preventive care, aesthetic dentistry, implantology and restorative treatment in Antwerp.',
    crumbs: [{ label: nl ? 'Behandelingen' : 'Treatments', href: nl ? url('behandelingen') : url('en/treatments') }],
    body: treatmentsOverview(lang),
  };
  if (nl) var tovNl = p; else pairRoutes(tovNl, p);
}

for (const x of treatments.treatments) {
  const built = {};
  for (const lang of ['nl', 'en']) {
    const nl = lang === 'nl';
    const t = makeT(lang);
    const line = treatments.lines.find((l) => l.slug === x.line);
    const siblings = treatments.treatments.filter((s) => s.line === x.line && s.slug !== x.slug);
    const person = x.person ? team.members.find((m) => m.slug === x.person) : null;
    let i = 0;

    const body = `<section class="section" style="--rise:100"><div class="wrap">
<p class="eyebrow"><span>${esc(nl ? line.titleNl : line.titleEn)}</span></p>
<h1 class="page-title">${esc(nl ? x.titleNl : x.titleEn)}</h1>
</div></section>
${section(i++, `<div class="split">
<div>
<figure data-uncover><div class="frame frame--tall">${picture(x.frame, {
      alt: nl ? `${x.titleNl} bij LACLINIC DENTAL in Antwerpen` : `${x.titleEn} at LACLINIC DENTAL in Antwerp`,
      sizes: '(min-width: 55rem) 40vw, 100vw',
      priority: true,
    })}</div></figure>
</div>
<div class="stack prose">
${(nl ? x.bodyNl : x.bodyEn).map((para) => `<p>${esc(para)}</p>`).join('')}
${x.anxious ? `<p class="note">${esc(t('anxiousNote'))}</p>` : ''}
${x.aesthetic ? `<p class="note">${esc(t('aestheticNote'))}</p>` : ''}
${person ? `<p class="note"><a href="${personUrl(lang, person)}">${esc(person.name)}</a> — ${esc(nl ? person.roleNl : person.roleEn)}</p>` : ''}
<div class="cta-row" style="margin-top:1rem">${bookingCta(lang)}</div>
</div>
</div>`)}
${siblings.length ? section(i++, `${eyebrow('', t('inThisLine'))}
<div class="index">
${siblings.map((s, k) => `<a class="index__row" href="${treatmentUrl(lang, s)}">
<span class="index__n">${String(k + 1).padStart(2, '0')}</span>
<span class="index__t">${esc(nl ? s.titleNl : s.titleEn)}</span>
<span class="index__go" aria-hidden="true">→</span>
</a>`).join('')}
</div>
<p style="margin-top:2rem"><a href="${nl ? url('behandelingen') : url('en/treatments')}">${esc(t('allTreatments'))}</a></p>`, { tone: 'surface' }) : ''}`;

    built[lang] = {
      lang,
      path: treatmentUrl(lang, x),
      title: `${nl ? x.titleNl : x.titleEn} — LACLINIC DENTAL ${nl ? 'Antwerpen' : 'Antwerp'}`,
      description: nl ? x.metaNl : x.metaEn,
      crumbs: [
        { label: nl ? 'Behandelingen' : 'Treatments', href: nl ? url('behandelingen') : url('en/treatments') },
        { label: nl ? x.titleNl : x.titleEn, href: treatmentUrl(lang, x) },
      ],
      body,
    };
  }
  pairRoutes(built.nl, built.en);
}

/* --- team + person pages --- */

for (const lang of ['nl', 'en']) {
  const nl = lang === 'nl';
  const t = makeT(lang);
  let i = 0;
  const body = `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">${esc(nl ? 'Het team' : 'The team')}</h1>
<p class="lead" style="margin-top:1.5rem">${esc(nl ? 'Zes mensen aan de Frankrijklei.' : 'Six people on Frankrijklei.')}</p>
</div></section>
${section(i++, `<div class="team">${team.members.map((m) => personCard(lang, m)).join('')}</div>`)}`;
  const p = {
    lang,
    path: nl ? url('team') : url('en/team'),
    title: nl ? 'Het team — LACLINIC DENTAL Antwerpen' : 'The team — LACLINIC DENTAL Antwerp',
    description: nl
      ? 'De zes mensen achter LACLINIC DENTAL in Antwerpen: tandarts, mondhygiënist, endodontoloog, parodontoloog, assistente en praktijkmanager.'
      : 'The six people behind LACLINIC DENTAL in Antwerp: dentist, hygienist, endodontist, periodontist, assistant and practice manager.',
    persons: team.members,
    crumbs: [{ label: nl ? 'Team' : 'Team', href: nl ? url('team') : url('en/team') }],
    body,
  };
  if (nl) var teamNl = p; else pairRoutes(teamNl, p);
}

for (const m of team.members) {
  const built = {};
  for (const lang of ['nl', 'en']) {
    const nl = lang === 'nl';
    const t = makeT(lang);
    const role = nl ? m.roleNl : m.roleEn;
    const bio = m.hasBio ? (nl ? m.bioNl : m.bioEn) : null;
    const about = nl ? m.roleAboutNl : m.roleAboutEn;
    const facts = nl ? m.factsNl : m.factsEn;
    const others = team.members.filter((o) => o.slug !== m.slug);
    let i = 0;

    const body = `<section class="section" style="--rise:100"><div class="wrap">
<p class="eyebrow"><span>${esc(role)}</span></p>
<h1 class="page-title">${esc(m.name)}</h1>
</div></section>
${section(i++, `<div class="split">
<div><figure><div class="frame frame--square" style="max-width:810px">${picture(m.slug, {
      alt: `${m.name} — ${role}, LACLINIC DENTAL`,
      sizes: '(min-width: 55rem) 40vw, 100vw',
      priority: true,
    })}</div></figure></div>
<div class="stack prose">
${bio ? `<p class="lead">${esc(bio)}</p>` : `<h2 class="h3">${esc(t('aboutRole'))}</h2><p>${esc(about)}</p><p class="muted" style="font-size:var(--t-small)">${esc(t('bioPending'))}</p>`}
${facts ? `<ul class="facts">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
<div class="cta-row" style="margin-top:1rem">${bookingCta(lang)}</div>
</div>
</div>`)}
${section(i++, `${eyebrow('', t('meetTeam'))}<div class="team">${others.map((o) => personCard(lang, o)).join('')}</div>`, { tone: 'surface' })}`;

    built[lang] = {
      lang,
      path: personUrl(lang, m),
      title: `${m.name} — ${role}, LACLINIC DENTAL`,
      description: nl
        ? `${m.name}, ${role.toLowerCase()} bij LACLINIC DENTAL in Antwerpen.`
        : `${m.name}, ${role.toLowerCase()} at LACLINIC DENTAL in Antwerp.`,
      persons: [m],
      crumbs: [
        { label: nl ? 'Team' : 'Team', href: nl ? url('team') : url('en/team') },
        { label: m.name, href: personUrl(lang, m) },
      ],
      body,
    };
  }
  pairRoutes(built.nl, built.en);
}

/* --- chairside CAD/CAM --- */

for (const lang of ['nl', 'en']) {
  const nl = lang === 'nl';
  const c = pages.chairside;
  let i = 0;
  const body = `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">${esc(nl ? c.titleNl : c.titleEn)}</h1>
<p class="lead" style="margin-top:1.5rem">${esc(nl ? c.leadNl : c.leadEn)}</p>
</div></section>
${section(i++, `<div class="split">
<div><figure data-uncover><div class="frame frame--tall">${picture(c.frame, {
    alt: nl ? 'Kroon die in de praktijk wordt vervaardigd bij LACLINIC DENTAL.'
            : 'A crown being made in the practice at LACLINIC DENTAL.',
    sizes: '(min-width: 55rem) 40vw, 100vw',
    priority: true,
  })}</div></figure></div>
<div class="stack prose">${(nl ? c.bodyNl : c.bodyEn).map((x) => `<p>${esc(x)}</p>`).join('')}</div>
</div>`)}
${section(i++, `${eyebrow('', nl ? 'Hoe het gaat' : 'How it works')}
<div class="index">
${(nl ? c.stepsNl : c.stepsEn).map((s) => `<div class="index__row">
<span class="index__n">${esc(s.n)}</span>
<span><span class="index__t">${esc(s.t)}</span><span class="index__d">${esc(s.d)}</span></span>
<span></span>
</div>`).join('')}
</div>
<p class="note" style="margin-top:2.5rem">${esc(nl ? c.caveatNl : c.caveatEn)}</p>`, { tone: 'surface' })}
${section(i++, `<div class="split"><div><h2>${esc(nl ? 'Een afspraak maken' : 'Book an appointment')}</h2></div>
<div class="cta-row">${bookingCta(lang)}</div></div>`, { tone: 'deep' })}`;

  const p = {
    lang,
    path: nl ? url('een-afspraak-in-plaats-van-drie') : url('en/one-appointment-not-three'),
    title: `${nl ? c.titleNl : c.titleEn} — LACLINIC DENTAL`,
    description: nl ? c.metaNl : c.metaEn,
    crumbs: [{ label: nl ? c.titleNl : c.titleEn, href: nl ? url('een-afspraak-in-plaats-van-drie') : url('en/one-appointment-not-three') }],
    body,
  };
  if (nl) var csNl = p; else pairRoutes(csNl, p);
}

/* --- simple prose pages --- */

function prosePage(lang, { title, lead, paras, frames = [], tone }) {
  let i = 0;
  return `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">${esc(title)}</h1>
${lead ? `<p class="lead" style="margin-top:1.5rem">${esc(lead)}</p>` : ''}
</div></section>
${section(i++, `<div class="prose stack">${paras.map((x) => `<p>${esc(x)}</p>`).join('')}</div>`, { tone })}
${frames.length ? section(i++, `<div class="split">${frames.map((f, n) => `<figure data-uncover><div class="frame frame--wide">${picture(f, {
    alt: `LACLINIC DENTAL — ${title} (${n + 1})`,
    sizes: '(min-width: 55rem) 45vw, 100vw',
  })}</div></figure>`).join('')}</div>`, { tone: 'surface' }) : ''}`;
}

const SIMPLE = [
  ['practice', 'de-praktijk', 'the-practice'],
  ['firstVisit', 'eerste-afspraak', 'first-appointment'],
  ['pricing', 'tarieven', 'fees'],
  ['jobs', 'jobs', 'jobs'],
];

for (const [key, nlSlug, enSlug] of SIMPLE) {
  const c = pages[key];
  const built = {};
  for (const lang of ['nl', 'en']) {
    const nl = lang === 'nl';
    built[lang] = {
      lang,
      path: nl ? url(nlSlug) : url('en/' + enSlug),
      title: `${nl ? c.titleNl : c.titleEn} — LACLINIC DENTAL`,
      description: nl ? c.metaNl : c.metaEn,
      crumbs: [{ label: nl ? c.titleNl : c.titleEn, href: nl ? url(nlSlug) : url('en/' + enSlug) }],
      body: prosePage(lang, {
        title: nl ? c.titleNl : c.titleEn,
        lead: nl ? c.leadNl : c.leadEn,
        paras: nl ? c.bodyNl : c.bodyEn,
        frames: c.frames ?? [],
      }),
    };
  }
  pairRoutes(built.nl, built.en);
}

/* --- FAQ --- */

for (const lang of ['nl', 'en']) {
  const nl = lang === 'nl';
  const t = makeT(lang);
  const body = `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">${esc(t('faqTitle'))}</h1>
</div></section>
${section(0, `<div class="faq">
${pages.faq.map((f) => `<details>
<summary>${esc(nl ? f.qNl : f.qEn)}<span class="faq__sign" aria-hidden="true"></span></summary>
<div class="faq__a"><p>${esc(nl ? f.aNl : f.aEn)}</p></div>
</details>`).join('')}
</div>`)}
${section(1, `<div class="split"><div><h2>${esc(nl ? 'Staat je vraag er niet bij?' : 'Question not answered here?')}</h2></div>
<div class="cta-row">${bookingCta(lang)}<span class="cta-note">${esc(nl ? 'of bel' : 'or call')} <a href="${site.phoneHref}" class="num">${esc(site.phone)}</a></span></div></div>`, { tone: 'deep' })}`;

  const p = {
    lang,
    path: nl ? url('veelgestelde-vragen') : url('en/questions'),
    title: `${t('faqTitle')} — LACLINIC DENTAL`,
    description: nl
      ? 'Afspraken, wachttijden, betaalmethoden, annuleren en conventie — de vragen die we het vaakst krijgen.'
      : 'Appointments, waiting times, payment, cancellation and conventioning — the questions we are asked most.',
    faq: pages.faq,
    crumbs: [{ label: t('faqTitle'), href: nl ? url('veelgestelde-vragen') : url('en/questions') }],
    body,
  };
  if (nl) var faqNl = p; else pairRoutes(faqNl, p);
}

/* --- practical --- */

for (const lang of ['nl', 'en']) {
  const nl = lang === 'nl';
  const t = makeT(lang);
  const pr = site.practical;
  let i = 0;
  const body = `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">${esc(t('practical'))}</h1>
<p class="lead" style="margin-top:1.5rem">${esc(nl ? 'Adres, openingsuren, parkeren en betalen.' : 'Address, opening hours, parking and payment.')}</p>
</div></section>
${section(i++, `<div class="split">
<div class="stack">
<h2>${esc(t('gettingHere'))}</h2>
<div class="deflist">
${pr.parking.map((x) => `<div class="deflist__row"><span class="deflist__k">${esc(t('parking'))}</span><span class="deflist__v">${esc(x.name)} — ${x.walk} ${esc(t('minWalk'))}</span></div>`).join('')}
${pr.transit.map((x) => `<div class="deflist__row"><span class="deflist__k">${esc(nl ? x.mode : x.modeEn)}</span><span class="deflist__v">${esc(x.name)} — ${x.walk} ${esc(t('minWalk'))}</span></div>`).join('')}
</div>
</div>
<div class="stack">
<h2>${esc(nl ? 'Goed om te weten' : 'Good to know')}</h2>
<div class="deflist">
<div class="deflist__row"><span class="deflist__k">${esc(nl ? 'Meenemen' : 'Bring')}</span><span>${esc((nl ? pr.bring : pr.bringEn).join(', '))}</span></div>
<div class="deflist__row"><span class="deflist__k">${esc(nl ? 'Betalen' : 'Payment')}</span><span>${esc((nl ? pr.payment : pr.paymentEn).join(', '))} — ${esc(nl ? pr.paymentNote : pr.paymentNoteEn)}</span></div>
<div class="deflist__row"><span class="deflist__k">${esc(nl ? 'Annuleren' : 'Cancelling')}</span><span class="deflist__v">${pr.cancellation.hours}u — €${pr.cancellation.fee}</span></div>
<div class="deflist__row"><span class="deflist__k">${esc(nl ? 'Conventie' : 'Conventioned')}</span><span>${esc(nl ? 'Niet geconventioneerd' : 'Not conventioned')}</span></div>
</div>
<p><a href="${nl ? url('tarieven') : url('en/fees')}">${esc(nl ? 'Wat dat voor je rekening betekent' : 'What that means for your bill')}</a></p>
</div>
</div>`)}
${section(i++, `<div class="split"><div><h2>${esc(nl ? 'Openingsuren' : 'Opening hours')}</h2></div>
<div class="deflist">
${site.hours.days.map((d) => `<div class="deflist__row"><span class="deflist__k">${esc(nl ? d.day : d.dayEn)}</span><span class="deflist__v">${d.closed ? esc(t('closed')) : `${d.open}–${d.close}`}</span></div>`).join('')}
</div></div>`, { tone: 'surface' })}`;

  const p = {
    lang,
    path: nl ? url('praktisch') : url('en/practical'),
    title: `${t('practical')} — LACLINIC DENTAL Antwerpen`,
    description: nl
      ? 'Parkeren bij Hopland, Inno of Horta op drie minuten. Openingsuren, betaalmethoden en wat je meebrengt.'
      : 'Parking at Hopland, Inno or Horta three minutes away. Opening hours, payment methods and what to bring.',
    crumbs: [{ label: t('practical'), href: nl ? url('praktisch') : url('en/practical') }],
    body,
  };
  if (nl) var prNl = p; else pairRoutes(prNl, p);
}

/* --- booking (canonical) + contact --- */

for (const lang of ['nl', 'en']) {
  const nl = lang === 'nl';
  const t = makeT(lang);
  let i = 0;
  const body = `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">${esc(t('book'))}</h1>
<p class="lead" style="margin-top:1.5rem">${esc(nl ? site.differentiators.noWaitlist.nl : site.differentiators.noWaitlist.en)}</p>
</div></section>
${section(i++, `<div class="split">
<div class="stack">
<h2>${esc(nl ? 'Online' : 'Online')}</h2>
<p class="prose">${esc(nl
    ? 'Kies zelf een moment in het afsprakenportaal. Je ziet meteen wat vrij is.'
    : 'Pick a time yourself in the appointment portal. You see what is free straight away.')}</p>
<div class="cta-row">
<a class="cta" href="${site.booking.doctena}" target="_blank" rel="noopener noreferrer">${esc(nl ? 'Open het afsprakenportaal' : 'Open the appointment portal')}<svg class="cta__arrow" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 9L9 1M9 1H3M9 1v6"/></svg><span class="vh">(${esc(t('newTab'))})</span></a>
</div>
</div>
<div class="stack">
<h2>${esc(nl ? 'Of bel' : 'Or call')}</h2>
<p class="prose">${esc(nl
    ? 'Liever iemand spreken, of gaat het om pijn? Bel de praktijk tijdens de openingsuren.'
    : 'Rather speak to someone, or is it about pain? Call the practice during opening hours.')}</p>
<div class="cta-row">
<a class="cta cta--ghost num" href="${site.phoneHref}">${esc(site.phone)}</a>
<span class="cta-note">${esc(nl ? site.hours.summaryNl : site.hours.summaryEn)}</span>
</div>
</div>
</div>`)}
${section(i++, `<div class="split">
<div class="stack">
<h2>${esc(nl ? 'Voor je komt' : 'Before you come')}</h2>
<div class="deflist">
<div class="deflist__row"><span class="deflist__k">${esc(nl ? 'Meenemen' : 'Bring')}</span><span>${esc((nl ? site.practical.bring : site.practical.bringEn).join(', '))}</span></div>
<div class="deflist__row"><span class="deflist__k">${esc(nl ? 'Betalen' : 'Payment')}</span><span>${esc((nl ? site.practical.payment : site.practical.paymentEn).join(', '))}</span></div>
<div class="deflist__row"><span class="deflist__k">${esc(nl ? 'Annuleren' : 'Cancelling')}</span><span class="deflist__v">${site.practical.cancellation.hours}u — €${site.practical.cancellation.fee}</span></div>
</div>
<p><a href="${nl ? url('eerste-afspraak') : url('en/first-appointment')}">${esc(nl ? 'Wat gebeurt er op een eerste afspraak?' : 'What happens at a first appointment?')}</a></p>
</div>
<div class="stack">
<h2>${esc(t('gettingHere'))}</h2>
<address style="font-style:normal">${esc(site.address.street)}<br>${esc(site.address.postalCode)} ${esc(site.address.city)}</address>
<p class="muted" style="font-size:var(--t-small)">${esc(site.practical.parkingNote)} ${esc(nl ? 'Antwerpen Centraal op vijftien minuten wandelen.' : 'Antwerpen Centraal is a fifteen-minute walk.')}</p>
</div>
</div>`, { tone: 'surface' })}`;

  const p = {
    lang,
    path: url(nl ? site.booking.canonicalPath : 'en/' + site.booking.canonicalPath),
    title: `${t('book')} — LACLINIC DENTAL Antwerpen`,
    description: nl
      ? 'Maak online een afspraak of bel +32 3 430 68 28. Geen wachtlijst, geen patiëntenstop.'
      : 'Book online or call +32 3 430 68 28. No waiting list, no patient stop.',
    crumbs: [{ label: t('book'), href: url(nl ? site.booking.canonicalPath : 'en/' + site.booking.canonicalPath) }],
    body,
  };
  if (nl) var bkNl = p; else pairRoutes(bkNl, p);
}

for (const lang of ['nl', 'en']) {
  const nl = lang === 'nl';
  const t = makeT(lang);
  const body = `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">${esc(t('nav.contact'))}</h1>
</div></section>
${section(0, `<div class="split">
<div class="stack">
<h2>${esc(site.name)}</h2>
<address style="font-style:normal;line-height:1.9">
${esc(site.address.street)}<br>${esc(site.address.postalCode)} ${esc(site.address.city)}<br>
<a href="${site.phoneHref}" class="num">${esc(site.phone)}</a><br>
<a href="mailto:${site.email}">${esc(site.email)}</a>
</address>
<div class="cta-row">${bookingCta(lang)}</div>
</div>
<div class="stack">
<h2>${esc(t('openingHours'))}</h2>
<div class="deflist">
${site.hours.days.map((d) => `<div class="deflist__row"><span class="deflist__k">${esc(nl ? d.day : d.dayEn)}</span><span class="deflist__v">${d.closed ? esc(t('closed')) : `${d.open}–${d.close}`}</span></div>`).join('')}
</div>
<p class="muted" style="font-size:var(--t-small)">${esc(site.legalName)} — ${esc(t('vat'))} ${esc(site.vat)}</p>
</div>
</div>`)}`;
  const p = {
    lang,
    path: nl ? url('contact') : url('en/contact'),
    title: nl
      ? 'Contact — LACLINIC DENTAL Antwerpen'
      : 'Contact — LACLINIC DENTAL Antwerp',
    description: nl
      ? 'LACLINIC DENTAL, Frankrijklei 86b, 2000 Antwerpen. Bel +32 3 430 68 28 of maak online een afspraak.'
      : 'LACLINIC DENTAL, Frankrijklei 86b, 2000 Antwerp. Call +32 3 430 68 28 or book an appointment online.',
    crumbs: [{ label: 'Contact', href: nl ? url('contact') : url('en/contact') }],
    body,
  };
  if (nl) var ctNl = p; else pairRoutes(ctNl, p);
}

/* --- legal --- */

const LEGAL = {
  privacy: {
    nlSlug: 'juridisch/privacy',
    enSlug: 'en/legal/privacy',
    titleNl: 'Privacybeleid',
    titleEn: 'Privacy policy',
    metaNl: 'Deze website plaatst geen cookies, gebruikt geen analytics en laadt geen scripts van derden. Privacybeleid van LACLINIC DENTAL.',
    metaEn: 'This website sets no cookies, uses no analytics and loads no third-party scripts. Privacy policy of LACLINIC DENTAL.',
    bodyNl: [
      'Deze website plaatst geen cookies, gebruikt geen analytics en laadt geen scripts van derden. Er wordt op deze site niets over je bijgehouden en er is dus ook geen cookiebanner.',
      'Wanneer je op de knop naar het afsprakenportaal klikt, verlaat je deze website. Vanaf dat moment geldt het privacybeleid van die dienst.',
      'Voor vragen over je patiëntgegevens in de praktijk zelf: neem contact op via ' + site.email + ' of bel ' + site.phone + '.',
      'Verwerkingsverantwoordelijke: ' + site.legalName + ', ' + site.address.street + ', ' + site.address.postalCode + ' ' + site.address.city + ', ' + site.vat + '.',
    ],
    bodyEn: [
      'This website sets no cookies, uses no analytics and loads no third-party scripts. Nothing about you is tracked here, which is also why there is no cookie banner.',
      'When you click through to the appointment portal you leave this website. From that point the privacy policy of that service applies.',
      'For questions about your patient records at the practice itself, contact ' + site.email + ' or call ' + site.phone + '.',
      'Data controller: ' + site.legalName + ', ' + site.address.street + ', ' + site.address.postalCode + ' ' + site.address.city + ', ' + site.vat + '.',
    ],
  },
  accessibility: {
    nlSlug: 'juridisch/toegankelijkheid',
    enSlug: 'en/legal/accessibility',
    titleNl: 'Toegankelijkheidsverklaring',
    titleEn: 'Accessibility statement',
    metaNl: 'LACLINIC DENTAL is gebouwd om te voldoen aan WCAG 2.2 niveau AA: bedienbaar met het toetsenbord, werkt zonder JavaScript, respecteert reduced motion.',
    metaEn: 'LACLINIC DENTAL is built to meet WCAG 2.2 level AA: keyboard operable, works without JavaScript, respects reduced motion.',
    bodyNl: [
      'Deze site is gebouwd om te voldoen aan WCAG 2.2 niveau AA, de norm waar de European Accessibility Act naar verwijst.',
      'Concreet: alle inhoud is bereikbaar met het toetsenbord, focus is altijd zichtbaar, de site werkt volledig zonder JavaScript, en wie beweging heeft uitgezet in het systeem krijgt geen animaties te zien.',
      'Kom je toch iets tegen dat niet werkt? Laat het weten via ' + site.email + '. Dat wordt rechtgezet.',
    ],
    bodyEn: [
      'This site is built to meet WCAG 2.2 level AA, the standard the European Accessibility Act refers to.',
      'In practice: all content is reachable by keyboard, focus is always visible, the site works fully without JavaScript, and anyone who has reduced motion enabled in their system sees no animation.',
      'If you do run into something that does not work, let us know at ' + site.email + '. It will be put right.',
    ],
  },
};

for (const [, c] of Object.entries(LEGAL)) {
  const built = {};
  for (const lang of ['nl', 'en']) {
    const nl = lang === 'nl';
    built[lang] = {
      lang,
      path: url(nl ? c.nlSlug : c.enSlug),
      title: `${nl ? c.titleNl : c.titleEn} — LACLINIC DENTAL`,
      description: nl ? c.metaNl : c.metaEn,
      crumbs: [{ label: nl ? c.titleNl : c.titleEn, href: url(nl ? c.nlSlug : c.enSlug) }],
      body: prosePage(lang, { title: nl ? c.titleNl : c.titleEn, paras: nl ? c.bodyNl : c.bodyEn }),
    };
  }
  pairRoutes(built.nl, built.en);
}

/* ------------------------------------------------------------------ emit */

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const page of routes) {
  const rel = page.path.replace(BASE, '').replace(/^\/+|\/+$/g, '');
  const dir = path.join(DIST, rel);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), layout(page));
}

// Static assets. The stylesheet carries absolute asset URLs (fonts, the grain
// tile) written as __BASE__/… so they resolve on a project site as well as at
// a domain root — a plain /fonts/… would 404 under a base path.
await cp(path.join(ROOT, 'src/motion.js'), path.join(DIST, 'motion.js'));
await cp(path.join(ROOT, 'assets/fonts'), path.join(DIST, 'fonts'), { recursive: true });
await cp(path.join(ROOT, 'assets/brand'), path.join(DIST, 'brand'), { recursive: true });
if (existsSync(path.join(ROOT, 'assets/generated'))) {
  await mkdir(path.join(DIST, 'img'), { recursive: true });
  for (const f of await readdir(path.join(ROOT, 'assets/generated'))) {
    await cp(path.join(ROOT, 'assets/generated', f), path.join(DIST, 'img', f));
  }
}

// Favicon: the N — the tallest letter and the only diagonal in the mark.
const nPath = wordmark.match(/id="lcw-n" d="([^"]+)"/)[1];
await writeFile(
  path.join(DIST, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="560 -30 240 680"><rect x="560" y="-30" width="240" height="680" fill="#111"/><path d="${nPath}" fill="#fff"/></svg>`,
);

// Grain tile, generated rather than shipped as a binary.
const tile = (() => {
  let rects = '';
  let seed = 20240;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 2400; i++) {
    rects += `<rect x="${(rnd() * 128) | 0}" y="${(rnd() * 128) | 0}" width="1" height="1" opacity="${rnd().toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><g fill="#808080">${rects}</g></svg>`;
})();
await writeFile(path.join(DIST, 'grain.svg'), tile);

const cssOut = (await readFile(path.join(ROOT, 'src/styles.css'), 'utf8')).replaceAll('__BASE__', BASE);
if (cssOut.includes('__BASE__')) fail('unsubstituted __BASE__ left in styles.css');
await writeFile(path.join(DIST, 'styles.css'), cssOut);

// robots + sitemap
await writeFile(
  path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}${asset('sitemap.xml')}\n`,
);
await writeFile(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${routes.map((r) => `<url><loc>${ORIGIN}${r.path}</loc>${r.altPath ? `<xhtml:link rel="alternate" hreflang="${r.lang === 'nl' ? 'en' : 'nl-BE'}" href="${ORIGIN}${r.altPath}"/>` : ''}</url>`).join('\n')}
</urlset>
`,
);

// 404
await writeFile(
  path.join(DIST, '404.html'),
  layout({
    lang: 'nl',
    path: url('404'),
    title: 'Pagina niet gevonden — LACLINIC DENTAL',
    description: 'Deze pagina bestaat niet of is verplaatst. Ga naar de homepage van LACLINIC DENTAL of maak meteen een afspraak.',
    body: `<section class="section" style="--rise:100"><div class="wrap">
<h1 class="page-title">404</h1>
<p class="lead" style="margin-top:1.5rem">Deze pagina bestaat niet (meer).</p>
<div class="cta-row" style="margin-top:2rem"><a class="cta" href="${url()}">Naar de homepage</a>${bookingCta('nl', { variant: 'ghost' })}</div>
</div></section>`,
  }),
);

if (errors.length) {
  console.error('\nBUILD FAILED');
  for (const e of [...new Set(errors)]) console.error(`  · ${e}`);
  process.exit(1);
}

const nlCount = routes.filter((r) => r.lang === 'nl').length;
console.log(`${routes.length} routes (${nlCount} NL · ${routes.length - nlCount} EN) → dist/`);
console.log(`base path: ${BASE || '/'}   origin: ${ORIGIN}`);
