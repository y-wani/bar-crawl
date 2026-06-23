# Share Button: Mobile Visibility + Tutorial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Route page's Share button visible/usable on mobile and introduce its hidden features (Google Maps, copy link, QR mission sheet) with a one-time coachmark.

**Architecture:** Two scoped changes to the existing self-contained `ShareRouteButton`: a CSS-only mobile repositioning, and an in-component coachmark gated by a `localStorage` flag. No backend, no new dependencies.

**Tech Stack:** React 19 + TypeScript, Vite, plain CSS with design tokens from `src/styles/tokens.css`.

## Global Constraints

- No new dependencies; no backend/Firestore changes.
- Tutorial persistence is `localStorage` only — key `barhop_share_tutorial_seen`, value `"1"`. Once per device; identical on desktop and mobile.
- Wrap all `localStorage` access in try/catch; on failure treat the tutorial as already seen (never nag, never crash).
- Desktop Share-button placement (bottom-left of map) must not change.
- No test framework exists in this repo. Verification per task = `npm run lint` + `npm run build` (tsc typecheck + vite build) + the manual visual checks listed in each task. Do NOT add a test harness.
- Design tokens are confirmed to exist in `src/styles/tokens.css`: `--accent (#ecb256)`, `--accent-soft`, `--font-display`, `--text-sm`, `--text-xs`, `--space-1..4`, `--radius-md`, `--shadow-lg`, `--shadow-md`, `--glass-border`, `--ease-out`, `--duration-fast`.

---

### Task 1: Reposition Share button so it's visible on mobile (CSS only)

**Files:**
- Modify: `src/styles/ShareRouteButton.css` (the `@media (max-width: 768px)` block, currently lines 115–124)

**Interfaces:**
- Consumes: existing markup classes `.share-route-button-container`, `.share-route-button-options`, `.share-route-button-main` (unchanged in this task).
- Produces: a mobile layout where the container floats top-left at `z-index: 26` with options opening downward. Task 2's coachmark CSS relies on the container being the positioned ancestor (`position: absolute` already set in the base rule at line 4–13).

**Background:** On mobile the route drawer becomes a fixed bottom sheet (`.route-drawer.is-sheet`, `position: fixed; bottom: 0; z-index: 25`, up to 82% tall) that covers the button's current bottom-left position (`bottom: 80px; z-index: 18`). The base container rule uses `flex-direction: column-reverse` (options open upward).

- [ ] **Step 1: Replace the mobile media block**

In `src/styles/ShareRouteButton.css`, replace the existing block:

```css
/* Responsive */
@media (max-width: 768px) {
  .share-route-button-container {
    bottom: 80px;
    left: 12px;
  }

  .share-route-button-main {
    padding: 0.5rem 1rem;
  }
}
```

with:

```css
/* Responsive */
@media (max-width: 768px) {
  /* The route drawer becomes a bottom sheet (z-index: 25) that covers the
     map's bottom-left, so move the control into the visible top strip and
     lift it above the sheet. Options open downward toward the map center. */
  .share-route-button-container {
    top: var(--space-3);
    bottom: auto;
    left: 12px;
    flex-direction: column;
    z-index: 26;
  }

  .share-route-button-options {
    flex-direction: column;
  }

  .share-route-button-main {
    padding: 0.5rem 1rem;
  }
}
```

- [ ] **Step 2: Typecheck/build**

Run: `npm run build`
Expected: completes with no TypeScript or Vite errors (CSS-only change).

- [ ] **Step 3: Manual visual check (mobile viewport)**

Start `npm run dev`, open the Route page with a generated route, and use browser devtools at a ≤768px width (e.g. 390×844). Confirm:
- The "Share Route" pill is visible in the top-left of the map, not hidden by the bottom sheet.
- Tapping it expands the three options **downward**, and they sit above (overlay) the sheet and are tappable.
- At desktop width (>768px) the button is still bottom-left with options opening upward (unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/styles/ShareRouteButton.css
git commit -m "Fix: make Share button visible above the bottom sheet on mobile"
```

---

### Task 2: One-time share tutorial coachmark

**Files:**
- Modify: `src/components/ShareRouteButton.tsx`
- Modify: `src/styles/ShareRouteButton.css` (append coachmark styles)

**Interfaces:**
- Consumes: existing props `isVisible`, `route`; existing state setter `setIsExpanded`; the option handlers `handleShareToGoogleMaps`, `handleCopyRoute`, `handleDownloadRoute`.
- Produces: module-level helpers `hasSeenTutorial(): boolean` and `markTutorialSeen(): void`; component state `showTutorial`; handler `dismissTutorial(collapse?: boolean): void`. New CSS classes `.share-tutorial-backdrop`, `.share-tutorial-callout`, `.share-tutorial-got-it`.

- [ ] **Step 1: Add `useEffect` import**

In `src/components/ShareRouteButton.tsx` line 1, change:

```tsx
import React, { useState } from "react";
```

to:

```tsx
import React, { useEffect, useState } from "react";
```

- [ ] **Step 2: Add module-level persistence helpers**

Immediately above `interface ShareRouteButtonProps {` (currently line 11), insert:

```tsx
// Once-per-device flag introducing the share options. localStorage can throw
// in private mode, so any failure is treated as "already seen": never nag,
// never crash the page.
const TUTORIAL_KEY = "barhop_share_tutorial_seen";

const hasSeenTutorial = (): boolean => {
  try {
    return localStorage.getItem(TUTORIAL_KEY) !== null;
  } catch {
    return true;
  }
};

const markTutorialSeen = (): void => {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    // ignore — nothing else we can do
  }
};
```

- [ ] **Step 3: Add tutorial state + trigger effect (before the early return)**

In the component body, the current code (lines 34–39) is:

```tsx
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  if (!isVisible || !route) {
    return null;
  }
```

Replace it with (adds state + effect **before** the early return so hooks stay unconditional):

```tsx
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // First time the button appears with a usable route, introduce it: expand
  // the menu so all options are visible and point a coachmark at it.
  useEffect(() => {
    if (isVisible && route && !hasSeenTutorial()) {
      setShowTutorial(true);
      setIsExpanded(true);
    }
  }, [isVisible, route]);

  if (!isVisible || !route) {
    return null;
  }

  const dismissTutorial = (collapse = true) => {
    setShowTutorial(false);
    if (collapse) setIsExpanded(false);
    markTutorialSeen();
  };
```

- [ ] **Step 4: Dismiss the coachmark when an option is used**

Add `if (showTutorial) dismissTutorial(false);` as the first line of each option handler (keep the menu open — `false` — so the "Copied!" feedback still shows).

`handleShareToGoogleMaps` (currently line 75) becomes:

```tsx
  const handleShareToGoogleMaps = () => {
    if (showTutorial) dismissTutorial(false);
    const url = generateGoogleMapsUrl();
    if (url) {
      window.open(url, "_blank");
    }
  };
```

`handleCopyRoute` (currently line 82) becomes:

```tsx
  const handleCopyRoute = async () => {
    if (showTutorial) dismissTutorial(false);
    const url = generateGoogleMapsUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };
```

`handleDownloadRoute` (currently line 94) — add the same first line:

```tsx
  const handleDownloadRoute = () => {
    if (showTutorial) dismissTutorial(false);
    const googleMapsUrl = generateGoogleMapsUrl();
    // ...rest unchanged...
```

- [ ] **Step 5: Render the backdrop + callout**

Replace the component's `return (...)` block (currently lines 207–252, from `return (` through the closing `);`) with the version below. It wraps the existing markup in a fragment, adds a dismissing backdrop as a sibling, and adds the callout inside the container so it is positioned relative to it:

```tsx
  return (
    <>
      {showTutorial && (
        <div
          className="share-tutorial-backdrop"
          onClick={() => dismissTutorial()}
        />
      )}
      <div
        className={`share-route-button-container ${isExpanded ? "expanded" : ""}`}
      >
        <div
          className="share-route-button-main"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <FiShare2 size={20} />
          <span className="share-route-button-label">Share Route</span>
        </div>

        {isExpanded && (
          <div className="share-route-button-options">
            <button
              className="share-route-option"
              onClick={handleShareToGoogleMaps}
              title="Open in Google Maps"
            >
              <FiMapPin size={16} />
              <span>Google Maps</span>
            </button>

            <button
              className={`share-route-option ${
                copiedToClipboard ? "copied" : ""
              }`}
              onClick={handleCopyRoute}
              title="Copy route to clipboard"
            >
              {copiedToClipboard ? <FiCheck size={16} /> : <FiCopy size={16} />}
              <span>{copiedToClipboard ? "Copied!" : "Copy Link"}</span>
            </button>

            <button
              className="share-route-option"
              onClick={handleDownloadRoute}
              title="Download route as a printable file"
            >
              <FiDownload size={16} />
              <span>Download</span>
            </button>
          </div>
        )}

        {showTutorial && (
          <div
            className="share-tutorial-callout"
            role="dialog"
            aria-label="Share route tip"
          >
            <h4>Share your route 🎉</h4>
            <p>
              Open it straight in Google Maps, copy a link to send friends, or
              download a printable QR mission sheet.
            </p>
            <button
              type="button"
              className="share-tutorial-got-it"
              onClick={() => dismissTutorial()}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </>
  );
```

- [ ] **Step 6: Append coachmark styles**

Add to the end of `src/styles/ShareRouteButton.css` (after the existing `@media` block):

```css
/* ---- One-time share tutorial coachmark ---- */

.share-tutorial-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  /* Below the share container (desktop z-index 18 / mobile 26) so the button
     and callout stay bright and clickable above the dim. */
  z-index: 17;
  animation: share-tutorial-fade 0.25s var(--ease-out);
}

/* Desktop: options open upward, so place the callout to the right of the
   control, arrow pointing left at it. */
.share-tutorial-callout {
  position: absolute;
  left: calc(100% + 14px);
  top: 50%;
  transform: translateY(-50%);
  width: 240px;
  padding: var(--space-3) var(--space-4);
  background: rgba(24, 21, 38, 0.98);
  -webkit-backdrop-filter: blur(var(--blur-md));
  backdrop-filter: blur(var(--blur-md));
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  box-shadow: var(--shadow-lg);
  z-index: 1;
  animation: share-options-in 0.25s var(--ease-out);
}

.share-tutorial-callout::before {
  content: "";
  position: absolute;
  left: -7px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-right: 7px solid var(--accent);
}

.share-tutorial-callout h4 {
  margin: 0 0 var(--space-1);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.share-tutorial-callout p {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--text-secondary);
}

.share-tutorial-got-it {
  width: 100%;
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: #1a1208;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-weight: 700;
  font-size: var(--text-xs);
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: filter var(--duration-fast) ease;
}

.share-tutorial-got-it:hover {
  filter: brightness(1.08);
}

@keyframes share-tutorial-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Mobile: options open downward and there's no room to the right, so drop the
   callout below the control with the arrow pointing up. */
@media (max-width: 768px) {
  .share-tutorial-callout {
    left: 0;
    top: calc(100% + 12px);
    transform: none;
    width: min(240px, calc(100vw - 24px));
  }

  .share-tutorial-callout::before {
    left: 24px;
    top: -7px;
    transform: none;
    border-top: none;
    border-right: 7px solid transparent;
    border-left: 7px solid transparent;
    border-bottom: 7px solid var(--accent);
  }
}
```

- [ ] **Step 7: Typecheck/build + lint**

Run: `npm run build`
Expected: no TypeScript/Vite errors.

Run: `npm run lint`
Expected: no new ESLint errors in `ShareRouteButton.tsx` (note: the trigger effect intentionally omits `setIsExpanded`/`setShowTutorial` from deps — they are stable setters; if `react-hooks/exhaustive-deps` flags them, leave as-is since they are guaranteed stable, or add them — they will not change behavior).

- [ ] **Step 8: Manual verification**

Start `npm run dev`. In devtools, clear the flag first: `localStorage.removeItem("barhop_share_tutorial_seen")`, then reload the Route page with a generated route. Confirm:
- The menu auto-expands and the callout appears pointing at the control (right side on desktop, below on mobile ≤768px).
- "Got it" dismisses the callout + backdrop and collapses the menu.
- Reloading does **not** show the coachmark again (flag persisted).
- Clearing the flag again and clicking a share option (e.g. Copy Link) dismisses the coachmark, keeps the menu open, shows "Copied!", and marks it seen.
- Re-generating the route (Optimize / reorder) does not re-trigger the coachmark.

- [ ] **Step 9: Commit**

```bash
git add src/components/ShareRouteButton.tsx src/styles/ShareRouteButton.css
git commit -m "Add one-time coachmark introducing the share route options"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (mobile visibility) → Task 1. Part 2 (coachmark: trigger, render, dismiss, persistence, edge cases) → Task 2. Both spec files changed are touched.
- **Edge cases from spec:** localStorage try/catch (Step 2); button only renders with `isVisible && route` so it never fires on empty map (unchanged early return); re-generate doesn't re-trigger (persisted flag + `hasSeenTutorial` guard in the effect).
- **Type consistency:** `dismissTutorial(collapse = true)` defined in Task 2 Step 3, called with `false` in Step 4 and no-arg in Step 5 — consistent. `hasSeenTutorial`/`markTutorialSeen` defined Step 2, used Steps 2–3.
