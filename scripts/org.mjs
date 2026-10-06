#!/usr/bin/env node
//
// scripts/org.mjs — create and edit organizations (orgs/{slug}) and see how
// many groups ran their crawls. Clients can only READ an org (firestore.rules),
// so until org staff editing exists, this is the admin tool.
//
//   npm run org -- show   <slug>
//   npm run org -- set    <slug> [--name "Denver Pub Crawl"] [--tagline "..."]
//                                [--accent "#c8102e"] [--website https://...]
//                                [--logo https://... | --logo none]
//                                [--crawls id1,id2]     (replaces the list)
//                                [--add-crawl id] [--remove-crawl id]
//   npm run org -- groups <slug> [--days 30]
//
// The crawls are ordinary saved crawls (barCrawls docs): build one in the app,
// save it, and copy the id from its /route?crawlId=<id> link.
//
// Only use an org's logo once they have said we may (see memory notes).
//
// Auth: FIREBASE_SERVICE_ACCOUNT from .env, the same way as metrics.mjs.

import { SignJWT, importPKCS8 } from "jose";

const PROJECT_ID = "bar-crawl-planner-5985f";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DAY_MS = 24 * 60 * 60 * 1000;
// Keep in step with src/utils/orgBranding.ts.
const VALID_ORG_SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const usage = () => {
  console.error(
    "Usage:\n" +
      "  npm run org -- show <slug>\n" +
      "  npm run org -- set <slug> [--name N] [--tagline T] [--accent #hex] [--website URL]\n" +
      "                            [--logo URL|none] [--crawls id1,id2] [--add-crawl id] [--remove-crawl id]\n" +
      "  npm run org -- groups <slug> [--days N]"
  );
  process.exit(1);
};

// --- argv ----------------------------------------------------------------
const [command, slug, ...rest] = process.argv.slice(2);
if (!["show", "set", "groups"].includes(command) || !slug) usage();
if (!VALID_ORG_SLUG.test(slug)) {
  console.error(`Bad slug "${slug}": lowercase letters, digits and dashes, 2–40 chars.`);
  process.exit(1);
}
const opts = {};
for (let i = 0; i < rest.length; i += 1) {
  const key = rest[i];
  const value = rest[i + 1];
  if (!key.startsWith("--") || value === undefined) usage();
  opts[key.slice(2)] = value;
  i += 1;
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not set (expected in .env).");
  process.exit(1);
}

// --- Firestore REST --------------------------------------------------------
const getAccessToken = async () => {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
};

const fromValue = (v) => {
  if (!v || "nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields ?? {});
  return null;
};
const fromFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, fromValue(x)]));

/** Plain JS → Firestore REST typed value (only the shapes an org doc uses). */
const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  throw new Error(`Unsupported value: ${JSON.stringify(v)}`);
};

const token = await getAccessToken();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const getDoc = async (path) => {
  const r = await fetch(`${FS_BASE}/${path}`, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return fromFields((await r.json()).fields ?? {});
};

const patchDoc = async (path, data) => {
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)]));
  const r = await fetch(`${FS_BASE}/${path}?${mask}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`PATCH ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
};

const queryEqual = async (collection, field, value) => {
  const r = await fetch(`${FS_BASE}:runQuery`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toValue(value) } },
      },
    }),
  });
  if (!r.ok) throw new Error(`${collection} query ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json())
    .filter((row) => row.document)
    .map((row) => ({ id: row.document.name.split("/").pop(), ...fromFields(row.document.fields ?? {}) }));
};

// --- commands --------------------------------------------------------------
const printOrg = async (org) => {
  console.log(`\norgs/${slug}`);
  console.log(`  name      ${org.name ?? "—"}`);
  console.log(`  tagline   ${org.tagline ?? "—"}`);
  console.log(`  accent    ${org.accent ?? "— (BarHop amber)"}`);
  console.log(`  website   ${org.website ?? "—"}`);
  console.log(`  logo      ${org.logoUrl ?? "— (name shown instead)"}`);
  console.log(`  crawls`);
  for (const id of org.crawlIds ?? []) {
    const crawl = await getDoc(`barCrawls/${id}`);
    console.log(
      crawl
        ? `    ${id}  ${crawl.name} (${crawl.bars?.length ?? 0} bars)`
        : `    ${id}  MISSING — not shown on the page`
    );
  }
  if (!org.crawlIds?.length) console.log("    (none)");
  console.log(`\n  Page: https://www.gobarhop.app/o/${slug}\n`);
};

if (command === "show") {
  const org = await getDoc(`orgs/${slug}`);
  if (!org) {
    console.error(`No org "${slug}". Create it with: npm run org -- set ${slug} --name "..."`);
    process.exit(1);
  }
  await printOrg(org);
}

if (command === "set") {
  const existing = await getDoc(`orgs/${slug}`);
  if (!existing && !opts.name) {
    console.error(`orgs/${slug} doesn't exist yet: pass --name to create it.`);
    process.exit(1);
  }
  const update = {};
  if (opts.name !== undefined) update.name = opts.name.trim();
  if (opts.tagline !== undefined) update.tagline = opts.tagline.trim() || null;
  if (opts.accent !== undefined) {
    if (!HEX.test(opts.accent)) {
      console.error(`--accent must be a hex colour like "#c8102e", got "${opts.accent}".`);
      process.exit(1);
    }
    update.accent = opts.accent.toLowerCase();
  }
  for (const [flag, field] of [["website", "website"], ["logo", "logoUrl"]]) {
    if (opts[flag] === undefined) continue;
    if (opts[flag] === "none") {
      update[field] = null;
    } else if (!/^https?:\/\//.test(opts[flag])) {
      console.error(`--${flag} must be an http(s) URL or "none".`);
      process.exit(1);
    } else {
      update[field] = opts[flag];
    }
  }

  let crawlIds = existing?.crawlIds ?? [];
  if (opts.crawls !== undefined) crawlIds = opts.crawls.split(",").map((s) => s.trim()).filter(Boolean);
  if (opts["add-crawl"] && !crawlIds.includes(opts["add-crawl"])) crawlIds = [...crawlIds, opts["add-crawl"]];
  if (opts["remove-crawl"]) crawlIds = crawlIds.filter((id) => id !== opts["remove-crawl"]);
  if (opts.crawls !== undefined || opts["add-crawl"] || opts["remove-crawl"]) {
    for (const id of crawlIds) {
      if (!(await getDoc(`barCrawls/${id}`))) {
        console.error(`barCrawls/${id} doesn't exist. Copy the id from a /route?crawlId=<id> link.`);
        process.exit(1);
      }
    }
    update.crawlIds = crawlIds;
  }
  if (!existing) {
    update.crawlIds = crawlIds;
    update.memberUids = [];
    update.createdAt = new Date();
  }
  update.updatedAt = new Date();

  await patchDoc(`orgs/${slug}`, update);
  console.log(existing ? "Updated." : "Created.");
  await printOrg(await getDoc(`orgs/${slug}`));
}

if (command === "groups") {
  const days = /^\d+$/.test(opts.days ?? "") ? Number(opts.days) : null;
  const since = days ? Date.now() - days * DAY_MS : 0;
  const sessions = (await queryEqual("crawlSessions", "orgSlug", slug))
    .filter((s) => (s.startedAt?.getTime?.() ?? 0) >= since)
    .sort((a, b) => (a.startedAt?.getTime?.() ?? 0) - (b.startedAt?.getTime?.() ?? 0));

  console.log(`\nGroups that started a ${slug} crawl${days ? ` in the last ${days} days` : ""}: ${sessions.length}\n`);
  let people = 0;
  for (const s of sessions) {
    const members = s.memberUids?.length ?? 0;
    people += members;
    const checkIns = Object.values(s.checkIns ?? {}).filter((c) => !c.skipped).length;
    const host = s.members?.[s.hostUid]?.displayName ?? "?";
    console.log(
      `  ${s.startedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "?"}  ` +
        `${String(members).padStart(3)} people  ${checkIns}/${s.stops?.length ?? 0} bars  ` +
        `${s.status.padEnd(9)}  host: ${host}  (${s.crawlName ?? ""})`
    );
  }
  if (sessions.length) {
    console.log(`\n  ${people} people in total, ${(people / sessions.length).toFixed(1)} per group.\n`);
  }
}
