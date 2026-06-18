# BarHop — Automated Demo

A hands-free product tour you can record. One command seeds a great-looking
account and drives a real browser through every major feature with smooth,
human-paced movements (and a visible cursor), recording the whole thing to a
video file. You just watch — or screen-record for narration.

It runs against the **live site** (`https://www.gobarhop.app`) so the map,
bar discovery, live tracking, and emails all work for real.

---

## Quick start

```bash
# 1. one-time: create the shareable demo account (needs .env with
#    FIREBASE_SERVICE_ACCOUNT). Creates demo@gobarhop.app, email pre-verified.
npm run demo:bootstrap

# 2. before each recording: reset the demo data to a clean, full state
npm run demo:seed

# 3. play the demo (opens a browser, auto-plays, records to demo-output/)
npm run demo:play

# …or do steps 2 + 3 together:
npm run demo
```

The recording lands in **`demo-output/<id>.webm`**. To get an MP4:

```bash
ffmpeg -i demo-output/<id>.webm -c:v libx264 -pix_fmt yuv420p demo.mp4
```

> **Tip:** seed right before you record — the "friend" in the live crawl has a
> live GPS position that goes stale after ~10 minutes, which is what powers the
> squad tracker, the friend dot on the map, and "Jordan is at the bar."

---

## What the tour covers (scene by scene)

1. **Landing page** — brand intro
2. **Sign in** — types into the real auth form (email/password)
3. **Discover bars** — live Google-Places results on the Mapbox map; selects a
   few stops
4. **Generate route** — builds the optimized walking route
5. **Optimize** — reorders stops for the shortest walk
6. **Plan it together** — the RSVP + vote lobby (pre-seeded with a friend and
   votes)
7. **Live crawl** — the night-out companion: stop timeline, **squad tracker**
   (live ETAs, "at the bar", lagging), a **friend dot** on the map, and group
   **pings**
8. **Check in** — confetti check-in at a stop
9. **Recap** — the shareable recap card with the real route map + stats
10. **Get home safe** — ride links + "I'm home safe" group status
11. **Saved crawls** — the library of saved routes

---

## Knobs

Set as environment variables before `demo:play`:

| Var | Default | What it does |
|-----|---------|--------------|
| `HEADLESS` | `false` | `true` runs with no visible window (still records the video) |
| `DEMO_SPEED` | `1` | pacing multiplier — `1.4` is slower/calmer, `0.7` snappier |
| `DEMO_URL` | `https://www.gobarhop.app` | target site (e.g. a preview deploy) |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | demo account | override the login |

Example: `DEMO_SPEED=1.3 npm run demo:play`

---

## Let people try it themselves

Share the live site + the demo login:

- **URL:** https://www.gobarhop.app
- **Email:** `demo@gobarhop.app`
- **Password:** `BarHopDemo2026`

Re-run `npm run demo:seed` any time to reset the account to a clean state.

---

## Notes

- The demo **writes to real Firebase** under the demo account only; `demo:seed`
  wipes and recreates that account's data each run.
- Finishing the crawl in the tour **ends** the seeded live session — just
  `demo:seed` again to replay.
- For the cleanest capture: full-screen the browser window, close other tabs,
  and let it run start to finish without touching the mouse.
