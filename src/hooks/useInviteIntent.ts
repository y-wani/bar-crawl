// src/hooks/useInviteIntent.ts
//
// Detects when a logged-out visitor landed on an auth page because they
// followed a crawl join link (/live?join=...). ProtectedRoute stashes the
// intended path in location.state.from; we surface it so the auth pages can
// show "you've been invited" context and convert the cold visitor.

import { useLocation } from "react-router-dom";

export interface InviteIntent {
  isInvite: boolean;
  /** The path to return to after auth (carry it across signin↔signup links) */
  from: string | undefined;
}

export const useInviteIntent = (): InviteIntent => {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return { isInvite: !!from && /[?&]join=/.test(from), from };
};
