import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { auth } from '../firebase/config';
import LoadingSpinner from '../components/LoadingSpinner';

interface InviteRouteProps {
  children: React.ReactNode;
  /** The query param that makes a URL an invite (`join` for /live, `id` for
   *  /plan). Only an invite link mints a guest for a signed-out visitor. */
  inviteParam: string;
}

// The attendee side of a group crawl: open to guests.
//
// ProtectedRoute used to guard /live and /plan, which sent every invited
// friend to a signup form while they were standing outside the bar. That made
// the group multiplier read ~1.0 no matter what the product was worth, so the
// organizer thesis could only ever look wrong. The policy is now one line:
// organizers need an account to START a crawl (Route.tsx still gates that);
// attendees never need one to JOIN.
//
// - Real account or existing guest → straight through.
// - Signed out, holding an invite → mint an anonymous user, then through.
//   firestore.rules already accept an anonymous uid for self-join and RSVP.
// - Signed out, no invite (or the mint failed) → signup, as before, with the
//   destination remembered.
const InviteRoute: React.FC<InviteRouteProps> = ({ children, inviteParam }) => {
  const { user, loading, ensureGuest } = useAuth();
  const location = useLocation();
  const hasInvite = new URLSearchParams(location.search).has(inviteParam);
  const [mintFailed, setMintFailed] = useState(false);

  useEffect(() => {
    if (loading || user || !hasInvite) return;
    let cancelled = false;
    // ensureGuest swallows its own errors; a missing currentUser afterwards is
    // how a failed mint shows up.
    void ensureGuest().then(() => {
      if (!cancelled && !auth.currentUser) setMintFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user, hasInvite, ensureGuest]);

  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  if (user) return <>{children}</>;

  if (hasInvite && !mintFailed) {
    return <LoadingSpinner message="Opening the crawl..." />;
  }

  return (
    <Navigate
      to="/signup"
      replace
      state={{ from: location.pathname + location.search }}
    />
  );
};

export default InviteRoute;
