// scripts/demo-play.mjs
//
// Auto-plays a full BarHop demo in a real browser with smooth, human-paced
// movements and records it to demo-output/. You just watch (or screen-record
// for narration). Run after seeding:
//
//   npm run demo:seed && npm run demo:play
//
// Env knobs:
//   DEMO_URL      target site (default https://www.gobarhop.app)
//   HEADLESS=true run without a visible window (still records the video)
//   DEMO_SPEED    pacing multiplier (default 1; 1.4 = slower/calmer)

import fs from "fs";
import { chromium } from "playwright";
import { DEMO_URL, DEMO_EMAIL, DEMO_PASSWORD, DEMO_GEO } from "./demo-config.mjs";

const ids = JSON.parse(fs.readFileSync(new URL("./.demo-ids.json", import.meta.url)));
const SPEED = Number(process.env.DEMO_SPEED || 1);
const pause = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));

// A visible cursor overlay so the recording reads as an intentional demo.
const CURSOR_JS = `(() => {
  if (window.__cur) return; window.__cur = 1;
  const add = () => {
    const c = document.createElement('div');
    c.id = '__democursor';
    c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(236,178,86,.35);border:2px solid #ECB256;box-shadow:0 0 14px rgba(236,178,86,.7);pointer-events:none;transform:translate(-50%,-50%);left:-100px;top:-100px;transition:width .12s,height .12s';
    document.body.appendChild(c);
    addEventListener('mousemove', e => { c.style.left=e.clientX+'px'; c.style.top=e.clientY+'px'; }, true);
    addEventListener('mousedown', () => { c.style.width='13px'; c.style.height='13px'; }, true);
    addEventListener('mouseup', () => { c.style.width='22px'; c.style.height='22px'; }, true);
  };
  document.body ? add() : addEventListener('DOMContentLoaded', add);
})();`;

const browser = await chromium.launch({
  headless: process.env.HEADLESS === "true",
  args: [
    "--start-maximized",
    "--disable-blink-features=AutomationControlled",
    // Mapbox GL needs WebGL. Chromium gates software WebGL (SwiftShader) off
    // by default in automation, which leaves the map a blank canvas — force it
    // on so the map + pins render everywhere (headed or headless, GPU or not).
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: "demo-output", size: { width: 1440, height: 900 } },
  geolocation: DEMO_GEO,
  permissions: ["geolocation"],
  locale: "en-US",
});
await context.addInitScript(CURSOR_JS);
// Pre-seed the location/tutorial flags so a fresh browser skips the
// first-visit permission dialog + tutorial and lands straight on a populated
// map (geolocation is granted at the context level above).
await context.addInitScript(({ lng, lat }) => {
  try {
    localStorage.setItem("locationPermission", "granted");
    localStorage.setItem("locationUserConsent", "true");
    localStorage.setItem("barCrawlTutorialSeen", "true");
    localStorage.setItem("locationTimestamp", String(Date.now()));
    localStorage.setItem("userLocation", JSON.stringify([lng, lat]));
  } catch { /* first run before origin set */ }
}, { lng: DEMO_GEO.longitude, lat: DEMO_GEO.latitude });
const page = await context.newPage();
page.setDefaultTimeout(20000);

let mouse = { x: 720, y: 450 };
const glideTo = async (loc) => {
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 4000 });
    const b = await loc.boundingBox();
    if (b) {
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await page.mouse.move(x, y, { steps: 28 });
      mouse = { x, y };
      await pause(350);
    }
  } catch { /* best effort */ }
};
const click = async (loc) => { await glideTo(loc); await loc.click({ timeout: 8000 }); };
const type = async (loc, text) => { await glideTo(loc); await loc.click(); await loc.pressSequentially(text, { delay: 70 }); };

const step = async (label, fn) => {
  console.log("▶", label);
  try { await fn(); } catch (e) { console.warn("   ⚠", e.message.split("\n")[0]); }
};

// ---------------------------------------------------------------------------
await step("Landing page", async () => {
  await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
  await pause(2800);
});

await step("Go to sign in", async () => {
  const link = page.getByRole("link", { name: /have an account|sign in/i }).first();
  if (await link.count()) await click(link);
  else await page.goto(DEMO_URL + "/signin");
  await page.waitForURL("**/signin", { timeout: 10000 }).catch(() => {});
  await pause(1500);
});

await step("Sign in", async () => {
  await type(page.locator("#email"), DEMO_EMAIL);
  await pause(400);
  await type(page.locator("#password"), DEMO_PASSWORD);
  await pause(600);
  await click(page.getByRole("button", { name: /^sign in$/i }));
  await page.waitForURL("**/home", { timeout: 20000 }).catch(() => {});
  await pause(4000); // let the map + bars load
});

await step("Browse bars on the map", async () => {
  // Wait for the live bar list to populate, then pick 3 distinct bars by name
  // (the whole row toggles selection; the checkbox itself is a hidden input).
  await page.locator(".bar-item-name").first().waitFor({ state: "visible", timeout: 30000 });
  await pause(1500);
  const names = (await page.locator(".bar-item-name").allInnerTexts())
    .map((s) => s.trim()).filter(Boolean).slice(0, 3);
  for (const nm of names) {
    await click(page.getByRole("heading", { name: nm, exact: true }).first());
    await pause(1100);
  }
  await pause(1200);
});

await step("Generate the route", async () => {
  const gen = page.getByRole("button", { name: /Generate My Route/i });
  await gen.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await click(gen);
  await page.waitForURL("**/route", { timeout: 15000 }).catch(() => {});
  await pause(3500);
});

await step("Optimize the walking order", async () => {
  const opt = page.getByRole("button", { name: /Optimize/i }).first();
  if (await opt.count()) { await click(opt); await pause(3000); }
});

await step("Plan it together (vote lobby)", async () => {
  await page.goto(DEMO_URL + "/plan?id=" + ids.planId, { waitUntil: "domcontentloaded" });
  await pause(4500);
  // cast a vote on the top candidate
  const vote = page.getByRole("button", { name: /vote|👍/i }).first();
  if (await vote.count()) { await click(vote); await pause(1800); }
});

await step("Jump into the live crawl", async () => {
  await page.goto(DEMO_URL + "/live", { waitUntil: "domcontentloaded" });
  await pause(4500); // map, stop timeline, squad tracker, friend dot
});

await step("Ping the squad", async () => {
  const ping = page.getByRole("button", { name: /Wait up/i }).first();
  if (await ping.count()) { await click(ping); await pause(2500); }
});

await step("Check in at the bar", async () => {
  const here = page.getByRole("button", { name: /I'?m here/i }).first();
  if (await here.count()) { await click(here); await pause(3500); } // confetti
});

await step("Finish the crawl → recap", async () => {
  const end = page.getByRole("button", { name: /^End crawl$/i }).first();
  if (await end.count()) { await click(end); await pause(1400); }
  const recap = page.getByRole("button", { name: /see recap|End & see/i }).first();
  if (await recap.count()) { await click(recap); await pause(5000); } // recap card + route map
});

await step("Get home safe", async () => {
  const gh = page.getByRole("button", { name: /Get home/i }).first();
  if (await gh.count()) { await click(gh); await pause(3000); }
  const close = page.getByRole("button", { name: /^close$/i }).first();
  if (await close.count()) { await click(close); await pause(1200); }
});

await step("Saved crawls library", async () => {
  await page.goto(DEMO_URL + "/saved-crawls", { waitUntil: "domcontentloaded" });
  // Wait for the cards (lazy route + Firestore fetch) so we don't end on the
  // loading spinner.
  await page.getByText(/Wicker Park Pub Crawl/i).first()
    .waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await pause(2500);
  await page.mouse.wheel(0, 320);
  await pause(3000);
});

await pause(1500);
console.log("✓ demo complete — saving video…");
await context.close(); // flushes the recording
await browser.close();
const vid = fs.existsSync("demo-output") ? fs.readdirSync("demo-output").filter((f) => f.endsWith(".webm")) : [];
if (vid.length) console.log("🎬 video: demo-output/" + vid[vid.length - 1]);
process.exit(0);
