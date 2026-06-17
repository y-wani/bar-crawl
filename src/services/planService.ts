// src/services/planService.ts
//
// "Plan it together": a crawl PLAN is the lobby phase before a live crawl.
// The host gathers candidate bars, shares a link, friends RSVP + vote, and
// the host locks it — which creates a live crawlSession (via sessionService)
// and points the plan at it. Plans are a separate collection from
// crawlSessions so the well-tested live-crawl model stays untouched.
//
// Firestore rules to pair with this collection (see firestore.rules):
//   - read: open plans are link-readable (a friend must read to RSVP/vote;
//     plans hold no live GPS). Locked/cancelled → attendee/host only.
//   - update: attendees/host freely; a non-attendee may self-RSVP (add only
//     themselves to an OPEN plan — isSelfRsvp guard).
//   - create: host only; delete: host only.

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { db } from "../firebase/config";
import { createSession, type SessionStop } from "./sessionService";

export type PlanStatus = "open" | "locked" | "cancelled";

export interface PlanCandidate {
  barId: string;
  name: string;
  rating: number;
  coordinates: [number, number]; // [lng, lat]
}

export interface PlanAttendee {
  displayName: string | null;
  joinedAt: Timestamp | Date;
  rsvp: "in";
}

export interface CrawlPlan {
  id?: string;
  hostUid: string;
  hostName: string | null;
  title: string;
  status: PlanStatus;
  /** Flat mirror of attendees keys — for rules + array-contains queries */
  attendeeUids: string[];
  attendees: { [uid: string]: PlanAttendee };
  candidates: PlanCandidate[];
  /** votes[barId][uid] === true. Tally = number of keys. Atomic dot-path. */
  votes: { [barId: string]: { [uid: string]: boolean } };
  route: {
    startCoordinates: [number, number];
    endCoordinates: [number, number];
  };
  sessionId?: string | null;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

const PLANS_COLLECTION = "crawlPlans";

export interface CreatePlanInput {
  hostUid: string;
  hostName: string | null;
  title: string;
  candidates: PlanCandidate[];
  route: CrawlPlan["route"];
}

/** Create a plan (host is the first attendee). Returns the new plan id. */
export const createPlan = async (input: CreatePlanInput): Promise<string> => {
  try {
    const plan = {
      hostUid: input.hostUid,
      hostName: input.hostName,
      title: input.title || "Bar Crawl",
      status: "open" as PlanStatus,
      attendeeUids: [input.hostUid],
      attendees: {
        [input.hostUid]: {
          displayName: input.hostName,
          joinedAt: serverTimestamp(),
          rsvp: "in" as const,
        },
      },
      candidates: input.candidates,
      votes: {},
      route: input.route,
      sessionId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, PLANS_COLLECTION), plan);
    return ref.id;
  } catch (error) {
    console.error("❌ Error creating plan:", error);
    if (error instanceof FirebaseError) console.error("🔥", error.code);
    throw new Error("Couldn't create the plan. Please try again.");
  }
};

/** Realtime subscription to a plan doc. */
export const subscribeToPlan = (
  planId: string,
  onData: (plan: CrawlPlan | null) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  return onSnapshot(
    doc(db, PLANS_COLLECTION, planId),
    (snap) => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as CrawlPlan) : null),
    (error) => {
      console.error("❌ Plan subscription error:", error);
      onError?.(error);
    }
  );
};

/**
 * RSVP to a plan (blind self-add, like joinSession). A non-attendee can only
 * add themselves to an OPEN plan; the rule is the gatekeeper. Idempotent —
 * an existing attendee's write passes via the attendee branch.
 */
export const rsvpToPlan = async (
  planId: string,
  uid: string,
  displayName: string | null
): Promise<void> => {
  try {
    await updateDoc(doc(db, PLANS_COLLECTION, planId), {
      attendeeUids: arrayUnion(uid),
      [`attendees.${uid}`]: {
        displayName,
        joinedAt: serverTimestamp(),
        rsvp: "in",
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("❌ Error RSVPing:", error);
    if (
      error instanceof FirebaseError &&
      error.code === "permission-denied"
    ) {
      throw new Error("That plan link is no longer open.");
    }
    throw new Error("Couldn't RSVP. Please try again.");
  }
};

/** Toggle the caller's thumbs-up on a candidate bar (atomic dot-path). */
export const toggleVote = async (
  planId: string,
  barId: string,
  uid: string,
  voted: boolean
): Promise<void> => {
  try {
    await updateDoc(doc(db, PLANS_COLLECTION, planId), {
      // Setting to true adds the vote; null clears it (Firestore deletes the key
      // when given a sentinel, but a plain false is simplest + tally ignores it)
      [`votes.${barId}.${uid}`]: voted ? true : false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("⚠️ Vote failed:", error);
    throw new Error("Couldn't record your vote.");
  }
};

/** Count thumbs-up for a candidate from the votes map. */
export const tallyVotes = (
  votes: CrawlPlan["votes"],
  barId: string
): number =>
  Object.values(votes?.[barId] ?? {}).filter(Boolean).length;

/**
 * Lock the plan: order candidates by votes (desc, stable), create a live
 * crawlSession, and point the plan at it. Host-only. Returns the sessionId.
 * Attendees' lobbies observe plan.sessionId and route into /live to join.
 */
export const lockPlan = async (
  plan: CrawlPlan,
  hostDisplayName: string | null
): Promise<string> => {
  try {
    const ordered = [...plan.candidates].sort(
      (a, b) => tallyVotes(plan.votes, b.barId) - tallyVotes(plan.votes, a.barId)
    );
    const stops: SessionStop[] = ordered.map((c, i) => ({
      barId: c.barId,
      name: c.name,
      rating: c.rating,
      order: i,
      coordinates: c.coordinates,
    }));

    const sessionId = await createSession({
      hostUid: plan.hostUid,
      displayName: hostDisplayName,
      stops,
      crawlName: plan.title,
      route: {
        startCoordinates: plan.route.startCoordinates,
        endCoordinates: plan.route.endCoordinates,
        plannedDistanceMiles: null,
        plannedDurationMin: null,
      },
    });

    await updateDoc(doc(db, PLANS_COLLECTION, plan.id!), {
      status: "locked" as PlanStatus,
      sessionId,
      updatedAt: serverTimestamp(),
    });
    return sessionId;
  } catch (error) {
    console.error("❌ Error locking plan:", error);
    throw new Error("Couldn't lock the plan. Please try again.");
  }
};
