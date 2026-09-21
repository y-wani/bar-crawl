# Phase P: Repositioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the landing page and social/search metadata off "discover bars near you" and onto the actual wedge — automatic shortest-route planning and live group coordination.

**Architecture:** Copy-only change. Three files, no logic, no new dependencies. Ships independently of every other phase and should go out first.

**Tech Stack:** React 19, TypeScript, static HTML meta tags.

**Spec:** `Docs/superpowers/specs/2026-09-21-guest-mode-design.md` (§11)

## Global Constraints

- The wedge is **automatic shortest-route planning + live group coordination**. "Discover bars" is demoted, never led with — a chatbot beats it.
- The word **free** stays prominent. It is a genuine differentiator.
- Travel planning surfaced organically as a use case on Reddit; include it where it fits naturally, do not force it.
- Do not restructure layout, components or styling. Copy only.
- Canonical domain is `https://www.gobarhop.app/`.

---

### Task 1: Landing hero copy

**Files:**
- Modify: `src/pages/Landing.tsx:238-242`

**Interfaces:**
- Consumes: nothing
- Produces: nothing (leaf change)

- [ ] **Step 1: Read the current hero**

Run: `sed -n '234,248p' src/pages/Landing.tsx`

Expected to see `bh-hero__title` = "Your Night, Your Route." and `bh-hero__subtitle` = "Discover, plan, and share the ultimate bar crawl."

- [ ] **Step 2: Replace the headline and subtitle**

Replace:

```tsx
          <h1 className="bh-hero__title">Your Night, Your Route.</h1>
          <p className="bh-hero__subtitle">Discover, plan, and share the ultimate bar crawl.</p>
```

With:

```tsx
          <h1 className="bh-hero__title">The Best Route. The Whole Crew.</h1>
          <p className="bh-hero__subtitle">
            BarHop maps the bars, builds the shortest walking route, and keeps
            everyone together on the night — free.
          </p>
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc -b`
Expected: `No errors found`

- [ ] **Step 4: Commit**

```bash
git add src/pages/Landing.tsx
git commit -m "Reposition landing hero on route planning + group coordination"
```

---

### Task 2: Search and social metadata

**Files:**
- Modify: `index.html:9-10` (title, description), `index.html:19-20` (OG), `index.html:31-32` (Twitter)

**Interfaces:**
- Consumes: nothing
- Produces: nothing (leaf change)

- [ ] **Step 1: Read the current metadata block**

Run: `sed -n '8,36p' index.html`

- [ ] **Step 2: Replace title and description**

Replace:

```html
    <title>BarHop — Free Bar Crawl &amp; Night Out Planner</title>
    <meta name="description" content="BarHop is a free bar crawl and night out planner. Use our interactive map to discover bars, build the perfect pub crawl route, and share it with friends." />
```

With:

```html
    <title>BarHop — Free Bar Crawl Route Planner &amp; Group Tracker</title>
    <meta name="description" content="BarHop plans the shortest walking route between bars and keeps your whole group together on the night. Free bar crawl route planner with live group tracking — great for bachelor parties, birthdays and trips." />
```

- [ ] **Step 3: Replace the Open Graph title and description**

Replace:

```html
    <meta property="og:title" content="BarHop — Free Bar Crawl &amp; Night Out Planner" />
    <meta property="og:description" content="Plan the perfect bar crawl on an interactive map. Discover bars, build a route, and share your night out with friends — free." />
```

With:

```html
    <meta property="og:title" content="BarHop — Free Bar Crawl Route Planner &amp; Group Tracker" />
    <meta property="og:description" content="Build the shortest walking route between bars, then track your whole group live on the night. Free — no ads." />
```

- [ ] **Step 4: Replace the Twitter title and description**

Replace:

```html
    <meta property="twitter:title" content="BarHop — Free Bar Crawl &amp; Night Out Planner" />
    <meta property="twitter:description" content="Plan the perfect bar crawl on an interactive map. Discover bars, build a route, and share your night out with friends — free." />
```

With:

```html
    <meta property="twitter:title" content="BarHop — Free Bar Crawl Route Planner &amp; Group Tracker" />
    <meta property="twitter:description" content="Build the shortest walking route between bars, then track your whole group live on the night. Free — no ads." />
```

- [ ] **Step 5: Update the JSON-LD description to match**

In the `application/ld+json` block, replace the `WebApplication` description:

```json
          "description": "BarHop is a free bar crawl and night out planner. Discover bars on an interactive map, build the optimal pub crawl route, save it, and share it with friends.",
```

With:

```json
          "description": "BarHop is a free bar crawl route planner. It builds the shortest walking route between bars and tracks your whole group live on the night.",
```

- [ ] **Step 6: Verify the JSON-LD still parses**

Run:
```bash
node -e "const h=require('fs').readFileSync('index.html','utf8');const m=h.match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/);JSON.parse(m[1]);console.log('JSON-LD valid')"
```
Expected: `JSON-LD valid`

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Reposition search and social metadata on route planning"
```

---

### Task 3: Hook section alignment

**Files:**
- Modify: `src/pages/Landing.tsx:254-258`

**Interfaces:**
- Consumes: nothing
- Produces: nothing (leaf change)

The "no more 'so where are we going' group chats" line is the strongest copy on the page and currently sits below the fold. Now that the hero leads on coordination, this section should reinforce the route angle rather than repeat the hero.

- [ ] **Step 1: Read the current hook section**

Run: `sed -n '252,264p' src/pages/Landing.tsx`

- [ ] **Step 2: Replace the hook subtitle**

Keep the `bh-hook__line` strikethrough line as-is. Replace the `bh-hook__sub` paragraph body with:

```tsx
            Pick your bars, and BarHop orders them into the shortest walk
            between them. Everyone sees the same plan, and each other, all night.
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc -b`
Expected: `No errors found`

- [ ] **Step 4: Verify the full production build**

Run: `npm run build`
Expected: `✓ built in <n>s`, no new warnings

- [ ] **Step 5: Commit**

```bash
git add src/pages/Landing.tsx
git commit -m "Align landing hook section with route planning message"
```

---

## Verification

This repo has no browser test harness, so verification is manual and visual.

- [ ] Run `npm run dev`, open `http://localhost:5173/`
- [ ] Hero reads "The Best Route. The Whole Crew." with the new subtitle
- [ ] No layout breakage at mobile width (375px) — the new headline is longer than the old one, so check it doesn't wrap into the scroll cue
- [ ] Paste the deployed URL into a social preview debugger and confirm the new OG title/description render

## Notes

The headline is deliberately six short words to survive a 375px viewport, which is 56% of traffic. If it still wraps badly, the fallback is "Better Routes. Together." — shorter, same wedge.
