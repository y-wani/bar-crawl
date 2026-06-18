// scripts/demo-bootstrap.mjs
//
// ONE-TIME setup of the shareable demo account. Creates demo@gobarhop.app
// (if missing) and marks its email verified via the Identity Toolkit admin
// API so it skips the verification gate. Needs FIREBASE_SERVICE_ACCOUNT in
// .env (server creds, gitignored). Run once:  npm run demo:bootstrap
//
// The demo account is intentionally a shared, public login for showcasing —
// the seed script resets its data, so it's fine if viewers poke at it.

import fs from "fs";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { SignJWT, importPKCS8 } from "jose";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME, FIREBASE_WEB_CONFIG, PROJECT_ID } from "./demo-config.mjs";

const loadServiceAccount = () => {
  const env = fs.readFileSync(".env", "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT="));
  if (!line) throw new Error("FIREBASE_SERVICE_ACCOUNT not found in .env");
  let raw = line.slice("FIREBASE_SERVICE_ACCOUNT=".length).trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"')))
    raw = raw.slice(1, -1);
  const sa = JSON.parse(raw);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
};

const adminToken = async (sa) => {
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/cloud-platform" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  }).then((x) => x.json());
  if (!r.access_token) throw new Error("admin token exchange failed");
  return r.access_token;
};

const app = initializeApp(FIREBASE_WEB_CONFIG, "demo-bootstrap");
const auth = getAuth(app);

let uid;
try {
  const cred = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
  uid = cred.user.uid;
  await updateProfile(cred.user, { displayName: DEMO_NAME });
  console.log("✓ created demo account", DEMO_EMAIL);
} catch (e) {
  if (e.code === "auth/email-already-in-use") {
    const cred = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
    uid = cred.user.uid;
    if (cred.user.displayName !== DEMO_NAME) await updateProfile(cred.user, { displayName: DEMO_NAME });
    console.log("• demo account already exists, reusing", DEMO_EMAIL);
  } else {
    throw e;
  }
}

// Mark email verified so the demo login skips the verification gate.
const token = await adminToken(loadServiceAccount());
const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: uid, emailVerified: true }),
  }
).then((r) => r.json());
console.log("✓ emailVerified:", res.emailVerified, "| uid:", res.localId);
console.log("\nDemo login:", DEMO_EMAIL, "/", DEMO_PASSWORD);
console.log("Next: npm run demo:seed");
process.exit(0);
