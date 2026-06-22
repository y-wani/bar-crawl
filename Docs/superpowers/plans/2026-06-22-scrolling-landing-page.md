# Scrolling Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert BarHop's single-screen landing hero into an informative, scrollable parallax landing page (hero unchanged) with 5 feature rows, an animated "How it works" section, an FAQ accordion, and a final CTA — to reduce bounce rate.

**Architecture:** Keep the existing fixed `SwirlBackground` as a stationary backdrop (free parallax). `Landing.tsx` becomes a thin composer of small section components under `src/components/landing/`. Scroll motion uses `framer-motion` (`useScroll`/`useTransform` for scroll-linked effects, `whileInView` for entrance reveals). All motion is gated by `useReducedMotion()`.

**Tech Stack:** React 19, TypeScript (strict), React Router v7, framer-motion v12, plain CSS (`src/styles/Landing.css`). No test runner exists; verification is `npm run build` (runs `tsc -b && vite build`) plus a visual check in the final task.

## Global Constraints

- Plain CSS only — extend `src/styles/Landing.css`; do NOT introduce Tailwind. (verbatim from spec: "No Tailwind adoption")
- Do NOT change the hero's look: brand wordmark "BarHop", title "Your Night, Your Route.", subtitle "Discover, plan, and share the ultimate bar crawl.", and the two existing CTA buttons/links must remain.
- Brand accent gold is `#ecb256`; base dark is `#0B0A12`; display font `'Rajdhani'`, body font `'Poppins'`.
- All scroll/parallax motion MUST be disabled under `prefers-reduced-motion` via framer-motion's `useReducedMotion()`.
- Semantic structure: exactly one `<h1>` (hero); each section uses `<h2>`; feature/step headings use `<h3>`.
- Feature screenshots live in `public/` and are referenced by absolute path: `/Home_Page.png`, `/Route_Page.png`, `/Friend_Vote.png`, `/Live_Crawl.png`, `/Crawl_recap.png`.
- TypeScript is strict; every file must typecheck. Verification command for every task: `npm run build` (expected: `✓ built` with no TS errors).

---

### Task 1: Scrollable foundation — hero refactor, scroll cue, bottom footer, commit screenshots

**Files:**
- Modify: `src/pages/Landing.tsx`
- Modify: `src/styles/Landing.css`
- Create: `src/components/landing/ScrollCue.tsx`
- Commit (assets): `public/Home_Page.png`, `public/Route_Page.png`, `public/Friend_Vote.png`, `public/Live_Crawl.png`, `public/Crawl_recap.png`

**Interfaces:**
- Consumes: existing `SwirlBackground` from `../components/SwirlBackground`.
- Produces: `ScrollCue` default export (no props); `Landing.tsx` renders `<section className="landing-hero">` (relative positioned) and a `<main className="landing-sections">` placeholder for later tasks, plus a bottom `<footer className="landing-footer landing-footer--bottom">`.

- [ ] **Step 1: Create `src/components/landing/ScrollCue.tsx`**

```tsx
// src/components/landing/ScrollCue.tsx
import React from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Animated "there's more below" cue at the bottom of the hero. */
const ScrollCue: React.FC = () => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="scroll-cue"
      aria-hidden="true"
      animate={reduce ? {} : { y: [0, 10, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <span>See how it works</span>
      <span className="scroll-cue__chev">&#8964;</span>
    </motion.div>
  );
};

export default ScrollCue;
```

- [ ] **Step 2: Rewrite `src/pages/Landing.tsx`**

Replace the entire file with the composer below. Later tasks fill `landing-sections`.

```tsx
// src/pages/Landing.tsx

import React from "react";
import { Link } from "react-router-dom";
import SwirlBackground from "../components/SwirlBackground";
import ScrollCue from "../components/landing/ScrollCue";
import "../styles/Landing.css";

const Landing: React.FC = () => {
  return (
    <>
      <SwirlBackground />
      <section className="landing-hero">
        <div className="landing-brand">BarHop</div>
        <div className="landing-content">
          <h1 className="landing-title">Your Night, Your Route.</h1>
          <p className="landing-subtitle">
            Discover, plan, and share the ultimate bar crawl.
          </p>
          <div className="landing-cta">
            <Link to="/signup" className="btn btn-primary-landing">
              Get Started for Free
            </Link>
            <Link to="/signin" className="btn btn-secondary-landing">
              I have an account
            </Link>
          </div>
        </div>
        <ScrollCue />
      </section>

      <main className="landing-sections">
        {/* Feature rows, How it works, FAQ, and Final CTA added in later tasks. */}
      </main>

      <footer className="landing-footer landing-footer--bottom">
        <Link to="/privacy">Privacy Policy</Link>
        <span>&middot;</span>
        <Link to="/terms">Terms &amp; Conditions</Link>
      </footer>
    </>
  );
};

export default Landing;
```

- [ ] **Step 3: Append foundation styles to `src/styles/Landing.css`**

Add at the END of the file (keeps existing hero rules intact; `.landing-hero` mirrors the old `.landing-container` centering but no longer locks the page to one screen):

```css
/* ===================================================================
   Scrolling landing page (added 2026-06-22)
   =================================================================== */
html { scroll-behavior: smooth; }

.landing-hero {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  color: #fff;
}

.scroll-cue {
  position: absolute;
  bottom: max(2rem, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  font-family: 'Poppins', sans-serif;
  font-size: 0.8rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
}
.scroll-cue__chev { font-size: 1.4rem; line-height: 1; color: #ecb256; }

.landing-sections { position: relative; z-index: 1; }

.section-title {
  font-family: 'Rajdhani', sans-serif;
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  color: #fff;
  margin: 0 0 2.5rem;
  text-shadow: 0 0 18px rgba(236, 178, 86, 0.25);
}

/* Bottom legal footer (overrides the absolute hero-pinned .landing-footer) */
.landing-footer--bottom {
  position: relative;
  left: auto;
  bottom: auto;
  transform: none;
  justify-content: center;
  padding: 2rem 1rem 3rem;
  z-index: 1;
}

@media (max-width: 768px) {
  .section-title { font-size: 2rem; }
}
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: `✓ built in ...` with no TypeScript errors.

- [ ] **Step 5: Commit (including screenshots)**

```bash
git add public/Home_Page.png public/Route_Page.png public/Friend_Vote.png public/Live_Crawl.png public/Crawl_recap.png src/pages/Landing.tsx src/styles/Landing.css src/components/landing/ScrollCue.tsx
git commit -m "Make landing page scrollable: hero refactor, scroll cue, screenshots"
```

---

### Task 2: Feature rows (5 alternating image/text rows)

**Files:**
- Create: `src/components/landing/featureData.ts`
- Create: `src/components/landing/FeatureRow.tsx`
- Modify: `src/pages/Landing.tsx`
- Modify: `src/styles/Landing.css`

**Interfaces:**
- Produces:
  - `featureData.ts` exports `interface Feature { headline: string; body: string; imgSrc: string; imgAlt: string; }` and `export const features: Feature[]` (length 5).
  - `FeatureRow.tsx` default export with props `{ headline: string; body: string; imgSrc: string; imgAlt: string; reverse?: boolean }`.
- Consumes: rendered inside `<main className="landing-sections">` from Task 1.

- [ ] **Step 1: Create `src/components/landing/featureData.ts`**

```ts
// src/components/landing/featureData.ts

export interface Feature {
  headline: string;
  body: string;
  imgSrc: string;
  imgAlt: string;
}

export const features: Feature[] = [
  {
    headline: "Find every bar on one map",
    body: "Explore bars and pubs around you on a live interactive map and build your shortlist.",
    imgSrc: "/Home_Page.png",
    imgAlt: "BarHop map showing bar pins across a city with a shortlist of bars in the sidebar",
  },
  {
    headline: "The smartest route, instantly",
    body: "Pick your stops and BarHop orders them into the perfect walkable crawl — with distance and walking time.",
    imgSrc: "/Route_Page.png",
    imgAlt: "BarHop optimized walking route connecting four bars with total distance and time",
  },
  {
    headline: "Let the group decide",
    body: "Invite friends to vote on the lineup so everyone’s in before you head out.",
    imgSrc: "/Friend_Vote.png",
    imgAlt: "BarHop group voting panel where friends vote on which bars make the crawl",
  },
  {
    headline: "Crawl together, live",
    body: "Start a Live Crawl and your whole group sees the current stop, check-ins, and what’s next in real time.",
    imgSrc: "/Live_Crawl.png",
    imgAlt: "BarHop Live Crawl view showing the next stop and real-time progress",
  },
  {
    headline: "Share the recap",
    body: "End the night with an auto-generated recap card you can share or download.",
    imgSrc: "/Crawl_recap.png",
    imgAlt: "BarHop crawl recap card showing stops visited, distance, and share and download buttons",
  },
];
```

- [ ] **Step 2: Create `src/components/landing/FeatureRow.tsx`**

```tsx
// src/components/landing/FeatureRow.tsx
import React, { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

export interface FeatureRowProps {
  headline: string;
  body: string;
  imgSrc: string;
  imgAlt: string;
  reverse?: boolean;
}

/** One alternating image/text feature row with a scroll reveal + image wipe. */
const FeatureRow: React.FC<FeatureRowProps> = ({
  headline,
  body,
  imgSrc,
  imgAlt,
  reverse = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, -40]);

  return (
    <div ref={ref} className={`feature-row${reverse ? " feature-row--reverse" : ""}`}>
      <motion.div
        className="feature-row__text"
        initial={reduce ? false : { opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h3 className="feature-row__headline">{headline}</h3>
        <p className="feature-row__body">{body}</p>
      </motion.div>

      <motion.div
        className="feature-row__media"
        initial={reduce ? false : { opacity: 0, clipPath: "inset(0 100% 0 0)" }}
        whileInView={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <motion.img src={imgSrc} alt={imgAlt} loading="lazy" style={{ y }} />
      </motion.div>
    </div>
  );
};

export default FeatureRow;
```

- [ ] **Step 3: Wire rows into `src/pages/Landing.tsx`**

Add imports at the top (after the `ScrollCue` import):

```tsx
import FeatureRow from "../components/landing/FeatureRow";
import { features } from "../components/landing/featureData";
```

Replace the placeholder comment inside `<main className="landing-sections">` with:

```tsx
        <section className="features" aria-label="What you can do with BarHop">
          {features.map((f, i) => (
            <FeatureRow
              key={f.headline}
              headline={f.headline}
              body={f.body}
              imgSrc={f.imgSrc}
              imgAlt={f.imgAlt}
              reverse={i % 2 === 1}
            />
          ))}
        </section>
```

- [ ] **Step 4: Append feature-row styles to `src/styles/Landing.css`**

```css
/* Feature rows */
.features {
  max-width: 1100px;
  margin: 0 auto;
  padding: 5rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 6rem;
}
.feature-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 3rem;
}
.feature-row--reverse .feature-row__text { order: 2; }
.feature-row--reverse .feature-row__media { order: 1; }
.feature-row__headline {
  font-family: 'Rajdhani', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  color: #ecb256;
  margin: 0 0 1rem;
}
.feature-row__body {
  font-family: 'Poppins', sans-serif;
  font-size: 1.15rem;
  line-height: 1.6;
  color: #d8d2e6;
  margin: 0;
}
.feature-row__media {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(236, 178, 86, 0.25);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45), 0 0 30px rgba(140, 60, 200, 0.15);
}
.feature-row__media img { display: block; width: 100%; height: auto; }

@media (max-width: 768px) {
  .features { gap: 3.5rem; }
  .feature-row { grid-template-columns: 1fr; gap: 1.5rem; }
  .feature-row--reverse .feature-row__text,
  .feature-row--reverse .feature-row__media { order: initial; }
  .feature-row__headline { font-size: 1.6rem; }
}
```

- [ ] **Step 5: Verify the build passes**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/featureData.ts src/components/landing/FeatureRow.tsx src/pages/Landing.tsx src/styles/Landing.css
git commit -m "Add feature highlight rows to landing page"
```

---

### Task 3: "How it works" sticky progress-line section

**Files:**
- Create: `src/components/landing/HowItWorks.tsx`
- Modify: `src/pages/Landing.tsx`
- Modify: `src/styles/Landing.css`

**Interfaces:**
- Produces: `HowItWorks` default export (no props). Renders a `<section className="how">` ~220vh tall containing a sticky inner block; degrades to a static `<section className="how">` with a `.how-static` list under reduced motion.
- Consumes: rendered after the `.features` section in `landing-sections`.

- [ ] **Step 1: Create `src/components/landing/HowItWorks.tsx`**

```tsx
// src/components/landing/HowItWorks.tsx
import React, { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";

interface Step {
  n: number;
  title: string;
  body: string;
}

const steps: Step[] = [
  { n: 1, title: "Drop your bars", body: "Find them on the map and build your shortlist." },
  { n: 2, title: "Get your route", body: "BarHop builds the perfect walkable order." },
  { n: 3, title: "Share & go", body: "Send it to your group and head out." },
];

const StepItem: React.FC<{
  step: Step;
  progress: MotionValue<number>;
  start: number;
  end: number;
}> = ({ step, progress, start, end }) => {
  const opacity = useTransform(progress, [start, end], [0.35, 1]);
  const x = useTransform(progress, [start, end], [20, 0]);
  const dotScale = useTransform(progress, [start, end], [0.8, 1.15]);
  return (
    <motion.li className="how__step" style={{ opacity }}>
      <motion.span className="how__dot" style={{ scale: dotScale }} />
      <motion.div className="how__step-content" style={{ x }}>
        <h3>
          {step.n}. {step.title}
        </h3>
        <p>{step.body}</p>
      </motion.div>
    </motion.li>
  );
};

/** Sticky-pinned 3-step section with a gold progress line that fills on scroll. */
const HowItWorks: React.FC = () => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  if (reduce) {
    return (
      <section className="how how--static" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">How it works</h2>
        <ol className="how-static">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="how-static__num">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section ref={ref} className="how" aria-labelledby="how-title">
      <div className="how__sticky">
        <h2 id="how-title" className="section-title">How it works</h2>
        <div className="how__track">
          <div className="how__line">
            <motion.div className="how__line-fill" style={{ scaleY: scrollYProgress }} />
          </div>
          <ol className="how__steps">
            {steps.map((s, i) => (
              <StepItem
                key={s.n}
                step={s}
                progress={scrollYProgress}
                start={i / steps.length}
                end={(i + 0.6) / steps.length}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
```

- [ ] **Step 2: Wire into `src/pages/Landing.tsx`**

Add import after the `featureData` import:

```tsx
import HowItWorks from "../components/landing/HowItWorks";
```

Add `<HowItWorks />` immediately after the closing `</section>` of `.features`, still inside `<main className="landing-sections">`:

```tsx
        <HowItWorks />
```

- [ ] **Step 3: Append "how it works" styles to `src/styles/Landing.css`**

```css
/* How it works (sticky progress line) */
.how { position: relative; height: 220vh; }
.how__sticky {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 1.5rem;
}
.how__track { position: relative; padding-left: 2.75rem; }
.how__line {
  position: absolute;
  left: 0.6rem;
  top: 0.5rem;
  bottom: 0.5rem;
  width: 3px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  overflow: hidden;
}
.how__line-fill {
  position: absolute;
  inset: 0;
  transform-origin: top;
  background: linear-gradient(#ecb256, #ff69b4);
  box-shadow: 0 0 14px rgba(236, 178, 86, 0.6);
}
.how__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3rem;
}
.how__step { position: relative; }
.how__dot {
  position: absolute;
  left: -2.75rem;
  top: 0.45rem;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ecb256;
  box-shadow: 0 0 14px rgba(236, 178, 86, 0.8);
  transform-origin: center;
}
.how__step-content h3 {
  font-family: 'Rajdhani', sans-serif;
  font-size: 1.6rem;
  color: #fff;
  margin: 0 0 0.4rem;
}
.how__step-content p {
  font-family: 'Poppins', sans-serif;
  color: #d8d2e6;
  margin: 0;
}

/* Static fallback (reduced motion) */
.how--static { padding: 5rem 1.5rem; }
.how-static {
  list-style: none;
  max-width: 640px;
  margin: 0 auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.how-static li { display: flex; gap: 1rem; align-items: flex-start; }
.how-static__num {
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #ecb256;
  color: #0b0a12;
  font-weight: 700;
  font-family: 'Rajdhani', sans-serif;
}
.how-static h3 {
  font-family: 'Rajdhani', sans-serif;
  color: #fff;
  margin: 0 0 0.25rem;
}
.how-static p { font-family: 'Poppins', sans-serif; color: #d8d2e6; margin: 0; }

@media (max-width: 768px) {
  .how { height: auto; }
  .how__sticky { position: static; height: auto; padding: 4rem 1.5rem; }
}
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/HowItWorks.tsx src/pages/Landing.tsx src/styles/Landing.css
git commit -m "Add sticky How it works section to landing page"
```

---

### Task 4: FAQ accordion section

**Files:**
- Create: `src/components/landing/FaqSection.tsx`
- Modify: `src/pages/Landing.tsx`
- Modify: `src/styles/Landing.css`

**Interfaces:**
- Produces: `FaqSection` default export (no props). Accessible accordion (`aria-expanded`/`aria-controls`); first item open by default.
- Content MUST match the JSON-LD FAQ in `index.html` (questions 1-3) plus a 4th "Is BarHop free?".

- [ ] **Step 1: Create `src/components/landing/FaqSection.tsx`**

```tsx
// src/components/landing/FaqSection.tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Faq {
  q: string;
  a: string;
}

const faqs: Faq[] = [
  {
    q: "What is the best free app to plan a bar crawl?",
    a: "BarHop is a free bar crawl planner that lets you find bars on an interactive map, build an optimized route between them, save your crawl, and share it with friends — no cost and no download required.",
  },
  {
    q: "How do I plan a bar crawl route?",
    a: "Open BarHop, search your area on the map, add the bars you want to visit, and BarHop builds a walkable route in order. You can reorder stops, save the crawl, and send it to your group.",
  },
  {
    q: "Can I plan a night out with friends in real time?",
    a: "Yes. BarHop’s Live Crawl lets a group follow the same bar crawl together, so everyone sees the current stop and the route for the night out as it happens.",
  },
  {
    q: "Is BarHop free?",
    a: "Yes — BarHop is completely free to use.",
  },
];

const FaqSection: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="faq" aria-labelledby="faq-title">
      <h2 id="faq-title" className="section-title">Frequently asked questions</h2>
      <div className="faq__list">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div className="faq__item" key={f.q}>
              <button
                type="button"
                className="faq__q"
                id={`faq-q-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{f.q}</span>
                <span className={`faq__chev${isOpen ? " faq__chev--open" : ""}`}>&#8964;</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-a-${i}`}
                    role="region"
                    aria-labelledby={`faq-q-${i}`}
                    className="faq__a"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <p>{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default FaqSection;
```

- [ ] **Step 2: Wire into `src/pages/Landing.tsx`**

Add import after the `HowItWorks` import:

```tsx
import FaqSection from "../components/landing/FaqSection";
```

Add `<FaqSection />` after `<HowItWorks />` inside `<main className="landing-sections">`:

```tsx
        <FaqSection />
```

- [ ] **Step 3: Append FAQ styles to `src/styles/Landing.css`**

```css
/* FAQ accordion */
.faq { max-width: 760px; margin: 0 auto; padding: 5rem 1.5rem; }
.faq__list { display: flex; flex-direction: column; gap: 0.75rem; }
.faq__item {
  background: rgba(11, 10, 18, 0.55);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}
.faq__q {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 1.1rem 1.25rem;
  color: #fff;
  font-family: 'Poppins', sans-serif;
  font-size: 1.05rem;
  font-weight: 600;
}
.faq__chev { color: #ecb256; transition: transform 0.3s ease; }
.faq__chev--open { transform: rotate(180deg); }
.faq__a { overflow: hidden; }
.faq__a p {
  margin: 0;
  padding: 0 1.25rem 1.25rem;
  color: #cfc7e0;
  font-family: 'Poppins', sans-serif;
  line-height: 1.6;
}
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/FaqSection.tsx src/pages/Landing.tsx src/styles/Landing.css
git commit -m "Add FAQ accordion to landing page"
```

---

### Task 5: Final CTA banner

**Files:**
- Create: `src/components/landing/FinalCta.tsx`
- Modify: `src/pages/Landing.tsx`
- Modify: `src/styles/Landing.css`

**Interfaces:**
- Produces: `FinalCta` default export (no props). Reuses the existing `.btn.btn-primary-landing` button style and links to `/signup`.

- [ ] **Step 1: Create `src/components/landing/FinalCta.tsx`**

```tsx
// src/components/landing/FinalCta.tsx
import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

/** Closing call-to-action at the end of the landing scroll. */
const FinalCta: React.FC = () => (
  <motion.section
    className="final-cta"
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.5 }}
    transition={{ duration: 0.6, ease: "easeOut" }}
  >
    <h2 className="final-cta__title">Your night&rsquo;s not going to plan itself.</h2>
    <Link to="/signup" className="btn btn-primary-landing">
      Get Started for Free
    </Link>
  </motion.section>
);

export default FinalCta;
```

- [ ] **Step 2: Wire into `src/pages/Landing.tsx`**

Add import after the `FaqSection` import:

```tsx
import FinalCta from "../components/landing/FinalCta";
```

Add `<FinalCta />` after `<FaqSection />`, as the last child inside `<main className="landing-sections">`:

```tsx
        <FinalCta />
```

- [ ] **Step 3: Append final-CTA styles to `src/styles/Landing.css`**

```css
/* Final CTA */
.final-cta {
  text-align: center;
  padding: 6rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.75rem;
}
.final-cta__title {
  font-family: 'Rajdhani', sans-serif;
  font-size: 2.6rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
  max-width: 600px;
  text-shadow: 0 0 20px rgba(236, 178, 86, 0.3);
}

@media (max-width: 768px) {
  .final-cta__title { font-size: 2rem; }
}
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/FinalCta.tsx src/pages/Landing.tsx src/styles/Landing.css
git commit -m "Add final call-to-action to landing page"
```

---

### Task 6: SEO polish + full visual verification

**Files:**
- Modify: `index.html` (add the "vote" feature to the JSON-LD `featureList`)

**Interfaces:**
- Consumes: the finished landing page from Tasks 1-5.

- [ ] **Step 1: Add the group-vote feature to the JSON-LD `featureList` in `index.html`**

In the `WebApplication` `featureList` array, add this entry after the "Save and revisit your favorite crawls" line so the structured data reflects the voting feature now shown on the page:

```html
            "Vote on the bar lineup with friends before you go",
```

- [ ] **Step 2: Full production build**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors; `dist/` regenerated.

- [ ] **Step 3: Start the preview server**

Run (background): `npm run preview`
Expected: serves at `http://localhost:4173`.

- [ ] **Step 4: Visual verification — desktop**

Open `http://localhost:4173/` and confirm:
- Hero is unchanged ("Your Night, Your Route." + both CTA buttons) with the animated scroll cue.
- Scrolling reveals 5 feature rows alternating left/right, each with its screenshot wiping in.
- "How it works" pins while the gold line fills and steps light up in sequence.
- FAQ items expand/collapse on click.
- Final CTA fades in; legal footer sits at the very bottom.
- No console errors.

- [ ] **Step 5: Visual verification — mobile + reduced motion**

- Resize to ~390px wide: feature rows stack single-column; "How it works" is a normal stacked list (not pinned); tap targets are comfortable.
- With OS "reduce motion" enabled (or emulated), reload: sections appear without transforms/parallax, "How it works" shows the static numbered list, and the FAQ still toggles.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Add group-vote feature to landing structured data"
```

---

## Notes for the implementer

- The fixed `SwirlBackground` shows through every section; the dark/glass panel backgrounds on FAQ items and the text shadows keep copy readable over it. If any section's text is hard to read during verification, that's a real defect — add a semi-transparent dark backdrop to that section rather than changing the swirl.
- `Landing.css` already contains the original hero rules (`.landing-container`, `.landing-brand`, `.landing-title`, etc.). Do not delete them — `.landing-brand`, `.landing-content`, `.landing-title`, `.landing-subtitle`, `.landing-cta`, and the button styles are still used by the refactored hero. `.landing-container` becomes unused but harmless.
