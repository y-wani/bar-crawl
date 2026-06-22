# BarHop Scrolling Landing Page — Design

**Date:** 2026-06-22
**Status:** Approved (pending spec review)
**Goal:** Reduce the high landing-page bounce rate by turning the single-screen
hero into an informative, scrollable parallax landing page — while keeping the
existing "Your Night, Your Route." hero visually unchanged.

## Problem

The current `Landing.tsx` is a single centered hero with a tagline and two CTAs.
Visitors don't learn *what BarHop does* or *why to sign up* before leaving, which
drives a high bounce rate. We want more content, presented with subtle, classy
scroll motion, plus the SEO benefit of real on-page text (FAQ mirrors the JSON-LD
already added to `index.html`).

## Non-goals

- No redesign of the hero's look (keep brand wordmark, title, subtitle, CTAs).
- No Tailwind adoption — the project uses plain CSS files; we extend `Landing.css`.
- No new routing; this is all on `/`.
- No backend changes.

## Architecture

Keep the existing fixed `SwirlBackground` (already `position: fixed; z-index: -1`)
as the stationary backdrop — it provides backdrop parallax for free as content
scrolls over it. The page body becomes scrollable (remove the hero's forced
single-viewport lock where it prevents scrolling, but keep the hero sized to fill
the first viewport).

New/changed files:

- `src/pages/Landing.tsx` — composes hero + the new sections. Stays thin.
- `src/components/landing/FeatureRow.tsx` — one reusable alternating image/text
  row. Props: `headline`, `body`, `imgSrc`, `imgAlt`, `reverse`. Handles its own
  scroll reveal (fade + slide-up via `whileInView`), a clip-path wipe on the
  image, and a gentle parallax `y` drift on the image.
- `src/components/landing/HowItWorks.tsx` — sticky-pinned 3-step section with a
  gold progress line that fills on scroll; each step activates as the line
  reaches it.
- `src/components/landing/FaqSection.tsx` — lightweight accordion Q&A; fade-in
  on view. Content mirrors the JSON-LD FAQ in `index.html` plus an "Is BarHop
  free?" entry.
- `src/components/landing/FinalCta.tsx` — closing sign-up banner, fade-up, gold
  glow button reusing `.btn-primary-landing`.
- `src/components/landing/ScrollCue.tsx` (or inline in Landing) — animated
  chevron at the bottom of the hero signalling "there's more below".
- `src/styles/Landing.css` — extended with section styles (no rewrite of
  existing hero rules).

Motion library: `framer-motion` (already a dependency). Scroll-linked effects use
`useScroll` + `useTransform`; entrance effects use `whileInView` with
`viewport={{ once: true }}`.

## Content

### Hero (unchanged + scroll cue)
Existing hero. Add an animated chevron / "See how it works ↓" cue at the bottom.

### Feature highlights — 5 alternating rows
Each row uses a real screenshot already in `public/`. Image side alternates
(`reverse` prop). Narrative arc: discover → route → vote → live → recap.

1. **Find every bar on one map** — Explore bars and pubs around you on a live
   interactive map and build your shortlist. (`/Home_Page.png`)
2. **The smartest route, instantly** — Pick your stops and BarHop orders them
   into the perfect walkable crawl — with distance and walking time. (`/Route_Page.png`)
3. **Let the group decide** — Invite friends to vote on the lineup so everyone's
   in before you head out. (`/Friend_Vote.png`)
4. **Crawl together, live** — Start a Live Crawl and your whole group sees the
   current stop, check-ins, and what's next in real time. (`/Live_Crawl.png`)
5. **Share the recap** — End the night with an auto-generated recap card you can
   share or download. (`/Crawl_recap.png`)

All five screenshots are landscape desktop captures, so rows use a consistent
landscape image frame (rounded corners, subtle neon border/glow).

### How it works — 3 steps (sticky progress line)
Section pins to the viewport while a vertical gold line fills top→bottom with
scroll progress. Each step brightens + slides in as the line reaches its node.

1. **Drop your bars** — find them on the map.
2. **Get your route** — BarHop builds the perfect order.
3. **Share & go** — send it to your group and head out.

On mobile (or reduced motion), this degrades to a normal vertical stacked list
with a static line — no pinning.

### FAQ — accordion
1. **What is the best free app to plan a bar crawl?** — BarHop: free, map-based,
   builds your route, save & share, no download.
2. **How do I plan a bar crawl route?** — Search your area, add bars, BarHop
   orders them into a walkable route you can reorder, save, and share.
3. **Can I plan a night out with friends in real time?** — Yes — Live Crawl lets
   a group follow the same crawl together.
4. **Is BarHop free?** — Yes, completely free.

### Final CTA
Headline: "Your night's not going to plan itself." + **Get Started for Free**
button → `/signup`. The existing legal footer (Privacy / Terms links) moves out
of the hero and renders at the true bottom of the page, directly after the Final
CTA, so it sits at the end of the scroll rather than floating mid-page.

## Motion, responsiveness, accessibility

- **Feature rows:** `whileInView` fade + slide-up; clip-path image wipe; subtle
  parallax `y` on image via `useScroll`/`useTransform`.
- **How it works:** sticky pin + gold progress line filled by scroll progress;
  per-step activation.
- **FAQ / Final CTA:** fade-up on view.
- **Mobile:** rows single-column; sticky section becomes stacked; large tap
  targets; images responsive.
- **Accessibility:** a single `prefers-reduced-motion: reduce` guard disables
  transforms, parallax, and pinning, leaving instant fades. Semantic structure:
  one `h1` (hero), `h2` per section, accordion buttons keyboard-operable with
  proper `aria-expanded`/`aria-controls`. This semantic text also aids SEO.

## Inspiration

Technique adapted (not copied) from 21st.dev components:
- "Parallax scroll feature section" — alternating rows with clip-path reveal +
  translate via framer-motion `useScroll`/`useTransform`.
- "Text Parallax Content (scroll)" — sticky image + overlay parallax pattern.

Both are Tailwind-based; we re-implement the technique in the project's plain-CSS
style and gold/purple neon aesthetic.

## Success criteria

- Landing page scrolls and presents all four sections below an unchanged hero.
- Scroll effects are smooth on desktop and degrade cleanly on mobile and under
  reduced-motion.
- Feature rows display the five real screenshots already in `public/`
  (`Home_Page.png`, `Route_Page.png`, `Friend_Vote.png`, `Live_Crawl.png`,
  `Crawl_recap.png`).
- `npm run build` passes; no console errors on the page.
- Visible FAQ text matches the JSON-LD already in `index.html`.
