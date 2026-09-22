// src/services/guestCrawlDoc.ts
//
// Server-side durability for a guest's crawl. This exists because of a
// platform constraint, not a product preference: Safari's ITP evicts
// localStorage after 7 days without site interaction and iOS is 48% of
// traffic, so a crawl planned three weeks ahead of the night would silently
// vanish on the majority platform — precisely the use case the product is for.
//
// 30 days, and it is NOT a sharing surface — spec §14.2 rules out a
// pre-signup share link in Phase 1. One doc per anonymous uid, readable and
// writable only by that uid.

import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { isValidGuestCrawl, type GuestCrawl } from "./guestCrawlStorage";

export const GUEST_CRAWL_TTL_DAYS = 30;
const COLLECTION = "guestCrawls";

export const isGuestDocExpired = (expiresAt: number, now = Date.now()): boolean =>
  !Number.isFinite(expiresAt) || expiresAt <= 0 || expiresAt < now;

/** Write the guest's crawl under their anonymous uid. Best-effort. */
export const saveGuestCrawlDoc = async (
  uid: string,
  crawl: GuestCrawl
): Promise<void> => {
  try {
    const expiresMs = Date.now() + GUEST_CRAWL_TTL_DAYS * 24 * 60 * 60 * 1000;
    // Firestore rejects an explicit `undefined` outright ("Unsupported field
    // value"), and the optional fields (crawlName, start/end coordinates) are
    // undefined for most crawls — so drop the keys rather than sending them.
    const defined = Object.fromEntries(
      Object.entries(crawl).filter(([, v]) => v !== undefined)
    );
    await setDoc(doc(db, COLLECTION, uid), {
      ...defined,
      expiresAt: expiresMs,
      // Firestore TTL policies only accept a timestamp field. Kept alongside
      // the epoch-ms copy that isGuestDocExpired reads, so the client and the
      // platform expire the doc on exactly the same instant. Deleting the
      // anonymous Auth user does NOT cascade to Firestore, so without the TTL
      // policy this collection would grow without bound.
      expiresAtTs: Timestamp.fromMillis(expiresMs),
    });
  } catch (error) {
    // Durability is a backstop; localStorage is the primary layer and the
    // crawl on screen is unaffected.
    console.error("guest crawl save failed:", error);
  }
};

/** Read it back — used when localStorage has been evicted. */
export const loadGuestCrawlDoc = async (uid: string): Promise<GuestCrawl | null> => {
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<GuestCrawl> & { expiresAt?: number };
    // TTL deletion is best-effort and can lag by up to 24 hours, so the read
    // path checks rather than trusting the policy.
    if (isGuestDocExpired(Number(data.expiresAt))) return null;
    return isValidGuestCrawl(data) ? data : null;
  } catch (error) {
    console.error("guest crawl load failed:", error);
    return null;
  }
};
