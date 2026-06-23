# Share Button: Mobile Visibility + One-Time Tutorial

**Date:** 2026-06-23
**Status:** Approved (design)

## Problem

On the Route page, the `ShareRouteButton` exposes three useful but non-obvious
features behind a collapsed "Share Route" control:

1. **Google Maps** — open the full optimized route (origin, waypoints,
   destination, walking mode) directly in Google Maps.
2. **Copy Link** — copy that Google Maps URL to the clipboard.
3. **Download** — generate a printable HTML "mission sheet" with an embedded
   **QR code** to the Google Maps route, plus per-stop notes and a safety brief.

Two issues:

- **Mobile invisibility:** The button floats at the map's bottom-left
  (`bottom: 80px; z-index: 18`). On mobile the route drawer becomes a fixed
  bottom sheet (`position: fixed; bottom: 0; z-index: 25`, opening to 82% of
  viewport height) that covers the button entirely. It is rendered but hidden.
- **Discoverability:** Even on desktop, most users never expand the control, so
  the Google Maps / QR / copy features go unnoticed.

## Goals

- Make the Share button reliably visible and usable on mobile.
- Introduce it once per user with a contextual tutorial that reveals all the
  hidden share options.
- No backend changes, no new dependencies.

## Non-Goals

- Cross-device tutorial sync (localStorage per-device is acceptable).
- Redesigning the share menu's contents or the mission-sheet output.
- Any change to desktop button placement (current bottom-left is fine).

## Design Decisions (confirmed with user)

| Decision | Choice |
|----------|--------|
| Tutorial persistence | `localStorage` flag — once per device, identical behavior desktop & mobile |
| Tutorial style | Coachmark/callout pointing at the button, auto-expanding the menu |
| Mobile button placement | Float at the top of the map (visible strip above the sheet) |

## Part 1 — Mobile Share-button visibility (CSS only)

File: `src/styles/ShareRouteButton.css`, within the existing
`@media (max-width: 768px)` block.

- Anchor the container to the **top-left** instead of the bottom:
  `top: var(--space-3); bottom: auto; left: 12px`. This places it in the
  visible map strip above the sheet, opposite the centered ETA bar (which on
  mobile sits at `top: var(--space-3)` centered), so the two do not collide.
- Flip the options list to open **downward** on mobile
  (`.share-route-button-options { flex-direction: column; }` and reset the
  container's `flex-direction` from `column-reverse` to `column`) so the menu
  expands toward the map center rather than off the top edge.
- Raise the container `z-index` to `26` (above the sheet's `25`) so the expanded
  options overlay the sheet and remain fully visible/tappable.
- Desktop styles (default rules) are unchanged.

## Part 2 — One-time share tutorial (coachmark)

All logic lives inside `src/components/ShareRouteButton.tsx` (self-contained,
co-located with the button). Styles added to `ShareRouteButton.css`.

### State & constants

- `const TUTORIAL_KEY = "barhop_share_tutorial_seen";`
- `const [showTutorial, setShowTutorial] = useState(false);`

### Trigger

A `useEffect` keyed on `isVisible` (and `route`):

- When the button first becomes visible (`isVisible && route`) **and**
  `localStorage.getItem(TUTORIAL_KEY)` is `null`:
  - `setShowTutorial(true)`
  - `setIsExpanded(true)` so all three options are revealed.
- Guard so it only fires once per mount (e.g. an early return if already
  shown/seen).

### Rendering

When `showTutorial` is true, render two extra elements:

1. A light **dimming backdrop** (`.share-tutorial-backdrop`, fixed, low-opacity,
   z-index just under the share container) to focus attention. Clicking it
   dismisses.
2. A **callout bubble** (`.share-tutorial-callout`) anchored near the button with
   a small arrow pointing at it. Content:
   - Heading/emoji line and body copy, e.g.:
     *"Share your route 🎉 — open it straight in Google Maps, copy a link to
     send friends, or download a printable QR mission sheet."*
   - A **"Got it"** button.

The callout is positioned relative to the share container so it tracks the
button on both desktop (button top-left after Part 1 on mobile; bottom-left on
desktop) layouts. On desktop the options open upward, so the callout sits above
/ beside the expanded menu; on mobile they open downward, so the callout sits
below the button. Positioning handled with a modifier class or simple CSS that
works for both — verified visually during implementation.

### Dismiss

A single `dismissTutorial()` handler:

- `setShowTutorial(false)`
- `localStorage.setItem(TUTORIAL_KEY, "1")`
- Collapse the menu back to default (`setIsExpanded(false)`).

Called by: the "Got it" button, a click on the backdrop, and each of the three
share option handlers (so acting on an option also marks the tutorial seen).

### Persistence semantics

`localStorage` → once per device. A user on both a laptop and a phone sees it
once on each. Accepted per the design decision above.

## Files Changed

- `src/components/ShareRouteButton.tsx` — tutorial state, trigger `useEffect`,
  `dismissTutorial`, backdrop + callout JSX, hook dismissal into option
  handlers.
- `src/styles/ShareRouteButton.css` — mobile repositioning (top-left, downward
  options, raised z-index) + backdrop/callout styles.

## Edge Cases

- The button only renders when `isVisible && route`, so the tutorial naturally
  waits until a route exists — never fires on an empty map.
- If `localStorage` is unavailable (private mode throwing), wrap reads/writes in
  try/catch; on failure, default to **not** showing the tutorial repeatedly
  (treat as seen) to avoid nagging.
- Re-generating the route (reorder/optimize) must not re-trigger the tutorial —
  the once-per-mount guard plus the persisted flag prevent this.

## Testing / Verification

- Desktop: with the flag cleared, generating a route shows the coachmark with
  the menu expanded; "Got it" dismisses and it does not reappear on reload.
- Mobile (≤768px): the Share button is visible in the top strip above the sheet;
  expanded options overlay the sheet and are tappable; coachmark points at the
  button and dismisses correctly.
- Clicking a share option while the coachmark is open dismisses it and performs
  the action.
