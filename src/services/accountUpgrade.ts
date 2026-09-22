// src/services/accountUpgrade.ts
//
// Turning a guest into an account. linkWithCredential preserves the uid, so
// the crawl they built is already theirs — no migration, no copying.
//
// The collision path is not an edge case. A returning visitor who already has
// an account, browses as a guest and then signs up will hit it every time, at
// the single highest-intent moment in the funnel. It gets a real path, not a
// red error message.

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type User as FirebaseUser,
  type UserCredential,
} from "firebase/auth";
import { auth } from "../firebase/config";

/** Firebase codes meaning "this identity already belongs to another account". */
export const LINK_COLLISION_CODES = [
  "auth/email-already-in-use",
  "auth/credential-already-in-use",
  "auth/provider-already-linked",
] as const;

export const errorCodeOf = (error: unknown): string | null => {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
};

export const isLinkCollision = (code: unknown): boolean =>
  typeof code === "string" &&
  (LINK_COLLISION_CODES as readonly string[]).includes(code);

/** True when there is an anonymous session to upgrade rather than replace. */
const guestToUpgrade = (): FirebaseUser | null => {
  const current = auth.currentUser;
  return current?.isAnonymous ? current : null;
};

export interface UpgradeResult {
  credential: UserCredential;
  /** The session started as a guest — the metric that decides whether guest
   *  mode beat the cold wall (spec §10). */
  wasGuest: boolean;
  /** Linking failed because the identity already had an account, so they were
   *  signed into it instead and the anonymous uid was abandoned. */
  collided: boolean;
}

/**
 * Email/password signup. Upgrades the guest in place when one exists, and
 * falls back to a normal sign-in when the email already has an account — the
 * orphaned anonymous user is simply abandoned (it owns nothing; the crawl
 * lives in localStorage and is replayed by the caller).
 */
export const upgradeOrCreateWithEmail = async (
  email: string,
  password: string,
  displayName?: string
): Promise<UpgradeResult> => {
  const guest = guestToUpgrade();
  if (!guest) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(credential.user, { displayName });
    return { credential, wasGuest: false, collided: false };
  }

  try {
    const credential = await linkWithCredential(
      guest,
      EmailAuthProvider.credential(email, password)
    );
    if (displayName) await updateProfile(credential.user, { displayName });
    return { credential, wasGuest: true, collided: false };
  } catch (error) {
    if (!isLinkCollision(errorCodeOf(error))) throw error;
    // They already have an account. Sign them into it; the guest uid is
    // discarded and the stored crawl is replayed under the real one.
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { credential, wasGuest: true, collided: true };
  }
};

/** Google signup/sign-in, with the same upgrade-then-fallback shape. */
export const upgradeOrCreateWithGoogle = async (): Promise<UpgradeResult> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const guest = guestToUpgrade();
  if (!guest) {
    return {
      credential: await signInWithPopup(auth, provider),
      wasGuest: false,
      collided: false,
    };
  }

  try {
    return {
      credential: await linkWithPopup(guest, provider),
      wasGuest: true,
      collided: false,
    };
  } catch (error) {
    if (!isLinkCollision(errorCodeOf(error))) throw error;
    return {
      credential: await signInWithPopup(auth, provider),
      wasGuest: true,
      collided: true,
    };
  }
};
