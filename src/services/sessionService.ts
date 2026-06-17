// src/services/sessionService.ts
//
// Live crawl sessions: a session is created when the user taps "Start
// Crawl" on the Route page and tracks check-ins through the night.
// The schema is group-ready (members map + memberUids array) so later
// phases (invites, voting, live friend locations) need no migration.
//
// Firestore security rules to pair with this collection:
//
//   match /crawlSessions/{sessionId} {
//     allow create: if request.auth != null
//       && request.resource.data.hostUid == request.auth.uid
//       && request.auth.uid in request.resource.data.memberUids;
//     allow read, update: if request.auth != null
//       && request.auth.uid in resource.data.memberUids;
//     allow delete: if request.auth != null
//       && resource.data.hostUid == request.auth.uid;
//   }

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  limit,
  arrayUnion,
  serverTimestamp,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { db } from "../firebase/config";

// Dev logging stub — swap for console.log when debugging
const debug = (..._args: unknown[]) => {};

export type SessionStatus = "active" | "completed" | "abandoned";
export type CheckInMethod = "auto" | "manual";

export interface SessionStop {
  barId: string;
  name: string;
  rating: number;
  order: number;
  coordinates: [number, number]; // [lng, lat]
}

export interface StopCheckIn {
  barId: string;
  at: Timestamp | Date;
  method: CheckInMethod;
  /** Skips are recorded as check-ins with skipped: true */
  skipped: boolean;
  /** Group mode: which member moved the group to/past this stop */
  checkedInBy?: string;
  checkedInByName?: string | null;
}

export interface MemberPosition {
  lng: number;
  lat: number;
  at: Timestamp | Date;
}

export interface SessionMember {
  displayName: string | null;
  joinedAt: Timestamp | Date;
  /** Group live mode: last published GPS fix, for friend dots on the map */
  lastPosition?: MemberPosition;
  /** Set when the member taps "I'm home safe" on the recap */
  homeSafeAt?: Timestamp | Date;
}

export interface SessionStats {
  stopsHit: number;
  stopsTotal: number;
  milesWalked: number;
  durationMin: number;
}

export interface CrawlSession {
  id?: string;
  hostUid: string;
  /** Flat array mirror of members keys — needed for security rules and
   *  array-contains queries (Firestore can't inspect map keys). */
  memberUids: string[];
  members: { [uid: string]: SessionMember };
  status: SessionStatus;
  /** Link to the saved barCrawls doc, when started from a saved crawl */
  crawlId?: string | null;
  crawlName?: string;
  /** Denormalized, ordered stops — works for never-saved routes too */
  stops: SessionStop[];
  /** Convenience denormalization; the UI re-derives the current stop as
   *  "first ordered stop with no checkIns entry" so refresh is always
   *  consistent. */
  currentStopIndex: number;
  /** Keyed by barId so a check-in is a single atomic dot-path update —
   *  no read-modify-write races once group members exist. */
  checkIns: { [barId: string]: StopCheckIn };
  route: {
    startCoordinates: [number, number];
    endCoordinates: [number, number];
    plannedDistanceMiles: number | null;
    plannedDurationMin: number | null;
  };
  /** Running accumulator fed by watchPosition deltas, flushed periodically */
  walkedMiles: number;
  startedAt: Timestamp | Date;
  endedAt?: Timestamp | Date;
  /** Computed once when the session is finished */
  stats?: SessionStats;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

const SESSIONS_COLLECTION = "crawlSessions";

export interface CreateSessionInput {
  hostUid: string;
  displayName: string | null;
  stops: SessionStop[];
  crawlId?: string | null;
  crawlName?: string;
  route: CrawlSession["route"];
}

/**
 * Create a new active session. Returns the new session id.
 */
export const createSession = async (
  input: CreateSessionInput
): Promise<string> => {
  try {
    debug("🍺 SessionService: creating session...", input);

    const session = {
      hostUid: input.hostUid,
      memberUids: [input.hostUid],
      members: {
        [input.hostUid]: {
          displayName: input.displayName,
          joinedAt: serverTimestamp(),
        },
      },
      status: "active" as SessionStatus,
      crawlId: input.crawlId ?? null,
      crawlName: input.crawlName ?? "",
      stops: input.stops,
      currentStopIndex: 0,
      checkIns: {},
      route: input.route,
      walkedMiles: 0,
      startedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, SESSIONS_COLLECTION), session);
    debug("✅ Session created:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error creating crawl session:", error);
    if (error instanceof FirebaseError) {
      console.error("🔥 Firebase error code:", error.code);
    }
    throw new Error("Failed to start the crawl. Please try again.");
  }
};

/**
 * Find the user's active session that they HOST, if any. Used by the
 * "Start Crawl" guard (one hosted crawl at a time) — joining a friend's
 * crawl should not block you from starting your own.
 */
export const getActiveSessionForUser = async (
  uid: string
): Promise<CrawlSession | null> => {
  try {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where("hostUid", "==", uid),
      where("status", "==", "active"),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as CrawlSession;
  } catch (error) {
    console.error("❌ Error fetching active session:", error);
    if (error instanceof FirebaseError) {
      console.error("🔥 Firebase error code:", error.code);
    }
    return null;
  }
};

/**
 * Find the user's active session that they HOST *or* have JOINED. Used by
 * the Home resume banner and the /live hydrate so joiners can get back into
 * a crawl. Needs the composite index on (memberUids array-contains, status)
 * defined in firestore.indexes.json.
 */
export const getActiveSessionForMember = async (
  uid: string
): Promise<CrawlSession | null> => {
  try {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where("memberUids", "array-contains", uid),
      where("status", "==", "active"),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as CrawlSession;
  } catch (error) {
    console.error("❌ Error fetching active member session:", error);
    if (error instanceof FirebaseError) {
      console.error("🔥 Firebase error code:", error.code);
    }
    return null;
  }
};

/**
 * Join an existing crawl via a shared link. Adds the caller to the
 * members map + memberUids array. This is a *blind* write on purpose: a
 * non-member can't read the session first (the read rule is member-gated),
 * so we let the security rule be the gatekeeper. The matching rule allows a
 * non-member to add only *themselves* to an active session and nothing else
 * (host/stops/status/checkIns stay pinned). It's idempotent — an existing
 * member's write passes via the member branch, and arrayUnion is a no-op.
 */
export const joinSession = async (
  sessionId: string,
  uid: string,
  displayName: string | null
): Promise<void> => {
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      memberUids: arrayUnion(uid),
      [`members.${uid}`]: {
        displayName,
        joinedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
    debug("🤝 Joined session:", sessionId, uid);
  } catch (error) {
    console.error("❌ Error joining session:", error);
    if (
      error instanceof FirebaseError &&
      error.code === "permission-denied"
    ) {
      throw new Error("That crawl link is no longer valid or has ended.");
    }
    throw new Error("Couldn't join the crawl. Please try again.");
  }
};

/**
 * Publish the caller's latest GPS fix so other members can see their dot.
 * Best-effort (called on a throttle) — a failure is non-fatal.
 */
export const updateMemberPosition = async (
  sessionId: string,
  uid: string,
  lng: number,
  lat: number
): Promise<void> => {
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      [`members.${uid}.lastPosition`]: {
        lng,
        lat,
        at: serverTimestamp(),
      },
    });
  } catch (error) {
    console.warn("⚠️ Failed to publish member position:", error);
  }
};

/**
 * Realtime subscription to a session doc. Group phases rely on this;
 * for solo it makes refresh/resume free (state always from Firestore).
 */
export const subscribeToSession = (
  sessionId: string,
  onData: (session: CrawlSession | null) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const ref = doc(db, SESSIONS_COLLECTION, sessionId);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData({ id: snapshot.id, ...snapshot.data() } as CrawlSession);
    },
    (error) => {
      console.error("❌ Session subscription error:", error);
      onError?.(error);
    }
  );
};

/**
 * Record a check-in at a stop (atomic dot-path update).
 */
export const checkInStop = async (
  sessionId: string,
  barId: string,
  method: CheckInMethod,
  nextStopIndex: number,
  actor?: { uid: string; displayName: string | null }
): Promise<void> => {
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      [`checkIns.${barId}`]: {
        barId,
        at: serverTimestamp(),
        method,
        skipped: false,
        checkedInBy: actor?.uid ?? null,
        checkedInByName: actor?.displayName ?? null,
      },
      currentStopIndex: nextStopIndex,
      updatedAt: serverTimestamp(),
    });
    debug("✅ Checked in:", barId, method);
  } catch (error) {
    console.error("❌ Error checking in:", error);
    throw new Error("Check-in failed. Please try again.");
  }
};

/**
 * Skip a stop (recorded as a skipped check-in).
 */
export const skipStop = async (
  sessionId: string,
  barId: string,
  nextStopIndex: number,
  actor?: { uid: string; displayName: string | null }
): Promise<void> => {
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      [`checkIns.${barId}`]: {
        barId,
        at: serverTimestamp(),
        method: "manual" as CheckInMethod,
        skipped: true,
        checkedInBy: actor?.uid ?? null,
        checkedInByName: actor?.displayName ?? null,
      },
      currentStopIndex: nextStopIndex,
      updatedAt: serverTimestamp(),
    });
    debug("⏭️ Skipped stop:", barId);
  } catch (error) {
    console.error("❌ Error skipping stop:", error);
    throw new Error("Couldn't skip the stop. Please try again.");
  }
};

/**
 * Mark the caller as home safe (group safety board on the recap). A member
 * write, so no rule change needed; other members see it via their snapshot.
 */
export const markHomeSafe = async (
  sessionId: string,
  uid: string
): Promise<void> => {
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      [`members.${uid}.homeSafeAt`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("❌ Error marking home safe:", error);
    throw new Error("Couldn't update your status. Please try again.");
  }
};

/**
 * Persist the walked-miles accumulator (called on a throttle and at
 * check-in/finish — not per GPS fix).
 */
export const updateWalkedMiles = async (
  sessionId: string,
  miles: number
): Promise<void> => {
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      walkedMiles: Math.round(miles * 100) / 100,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Non-fatal: the accumulator is best-effort
    console.warn("⚠️ Failed to persist walked miles:", error);
  }
};

/**
 * Finish the session. Stats are computed by the caller from live state.
 */
export const finishSession = async (
  sessionId: string,
  stats: SessionStats
): Promise<void> => {
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      status: "completed" as SessionStatus,
      endedAt: serverTimestamp(),
      stats,
      walkedMiles: stats.milesWalked,
      updatedAt: serverTimestamp(),
    });
    debug("🏁 Session finished:", sessionId, stats);
  } catch (error) {
    console.error("❌ Error finishing session:", error);
    throw new Error("Couldn't finish the crawl. Please try again.");
  }
};

/**
 * Abandon the session (ended with zero check-ins — no recap).
 */
export const abandonSession = async (sessionId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      status: "abandoned" as SessionStatus,
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    debug("🛑 Session abandoned:", sessionId);
  } catch (error) {
    console.error("❌ Error abandoning session:", error);
    throw new Error("Couldn't end the crawl. Please try again.");
  }
};
