// src/services/pendingAction.ts
//
// Remembers that someone was part-way through an action when we interrupted
// them to ask for an account, so the action can be resumed rather than
// silently dropped.
//
// Why this exists: in the two days after guest mode shipped, 6 people created
// accounts and 0 saved a crawl. The likely mechanism is that they pressed
// Save, got sent to signup, came back to /route — and had to find and press
// Save a second time. Most didn't.
//
// This is deliberately NOT auto-save. Nothing is written without the person
// asking; we just put them back where they were, with the save dialog they
// already opened still open. Creating a record nobody asked for would be a
// different (and worse) decision.
//
// sessionStorage, not localStorage: the intent belongs to this tab and this
// sitting. A pending save resurfacing days later would be baffling.

const KEY = "bh_pending_action";

export type PendingAction = "save";

export const setPendingAction = (action: PendingAction): void => {
  try {
    sessionStorage.setItem(KEY, action);
  } catch {
    /* private mode — the resume is a nicety, not a requirement */
  }
};

/** Read and clear in one step, so a resumed action can't fire twice. */
export const consumePendingAction = (): PendingAction | null => {
  try {
    const v = sessionStorage.getItem(KEY);
    if (!v) return null;
    sessionStorage.removeItem(KEY);
    return v === "save" ? "save" : null;
  } catch {
    return null;
  }
};

export const clearPendingAction = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
};
