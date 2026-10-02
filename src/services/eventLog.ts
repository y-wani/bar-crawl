// src/services/eventLog.ts
//
// A first-party copy of every analytics event, written to Firestore `events`.
//
// Why not just Vercel Web Analytics: on the Hobby plan custom events are not
// collected at all, history is one month, and even Pro caps an event at two
// properties. More fundamentally, Vercel events are anonymous aggregates — they
// can count `crawl_joined`, but they can never say "this person joined a crawl
// in October and planned their own in November", which is the attendee →
// planner conversion the whole organizer strategy rests on. That needs a uid
// on every row and a history longer than 90 days.
//
// Each row carries the Firebase uid (anonymous or real — the same uid survives
// a guest upgrading to an account) and the device's first-touch `ref`.
// scripts/metrics.mjs reads this collection; nothing in the client does.
//
// Shared-link pages (/c) never mint a user for rendering. If an event fires
// with nobody signed in, an anonymous user is minted HERE, in the background,
// after auth has finished restoring — so the attendee who opened a link and
// the planner they later become are the same uid. The page never waits on it.
//
// Best-effort by design: every failure is swallowed. Analytics must never
// break the app.

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { ensureAnonymousUser } from "./anonAuth";
import { getRef } from "../utils/attribution";

export type EventProps = Record<string, string | number | boolean | null>;

const EVENTS_COLLECTION = "events";

const currentUid = async (): Promise<{ uid: string; guest: boolean } | null> => {
  // Never mint while a session is still being restored from IndexedDB — that
  // would sign a returning user out of their own account (see anonAuth.ts).
  await auth.authStateReady();
  const user = auth.currentUser ?? (await ensureAnonymousUser());
  return user ? { uid: user.uid, guest: user.isAnonymous } : null;
};

export const logEvent = (name: string, props: EventProps = {}): void => {
  // Captured synchronously: by the time auth resolves the user may have
  // navigated, and the row should record where the event actually happened.
  const path = window.location.pathname.slice(0, 100);
  const ref = getRef();
  void (async () => {
    try {
      const who = await currentUid();
      if (!who) return;
      await addDoc(collection(db, EVENTS_COLLECTION), {
        name,
        props,
        uid: who.uid,
        guest: who.guest,
        ref,
        path,
        at: serverTimestamp(),
      });
    } catch {
      /* offline, App Check, rules — none of it may surface to the user */
    }
  })();
};
