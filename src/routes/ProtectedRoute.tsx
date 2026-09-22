import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  redirectTo = '/signup'
}) => {
  const { user, loading, isGuest } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  // A guest IS a signed-in Firebase user, so `!user` alone would wave them
  // straight through to /live. These routes need a real account. Guests go to
  // signup rather than signin — they have nothing to sign in to. The intended
  // destination is remembered either way (e.g. a shared /live?join=… link) so
  // PublicRoute can return them there afterwards.
  if (!user || isGuest) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // Email verification is deliberately NOT a gate here (spec §9). Starting a
  // live crawl is the highest-intent moment in the product — route built,
  // account created, possibly already standing outside the bar — and bouncing
  // someone to an inbox there is the most expensive friction in the funnel.
  // It never protected this surface anyway: the invite link controls who joins
  // a session, not the email address. Verification is retained where it does
  // real work — password reset and account recovery.
  return <>{children}</>;
};

export default ProtectedRoute;
