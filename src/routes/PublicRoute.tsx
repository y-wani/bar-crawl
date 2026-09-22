import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';

interface PublicRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

const PublicRoute: React.FC<PublicRouteProps> = ({
  children,
  redirectTo = '/home'
}) => {
  const { user, loading, isGuest } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  // A guest must be able to REACH the signup form. They are technically signed
  // in, so the old `if (user)` redirect would bounce them back to /home and
  // trap them in guest mode with no way out. Only a real account gets sent on
  // — back to wherever a ProtectedRoute bounced them from (e.g. a shared join
  // link), else the default home page.
  //
  // The unverified-email detour is gone for the same reason as ProtectedRoute
  // (spec §9): verification never protected these surfaces, and bouncing
  // someone to an inbox mid-funnel is the most expensive friction we have.
  if (user && !isGuest) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from || redirectTo} replace />;
  }

  // If user is not authenticated, render the public content
  return <>{children}</>;
};

export default PublicRoute; 