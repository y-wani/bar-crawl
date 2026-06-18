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
  const { user, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  // If user is authenticated, send them on — back to wherever a ProtectedRoute
  // bounced them from (e.g. a shared join link), else the default home page.
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    // Unverified email/password users still need to verify first; carry the
    // intended destination through so they land there once verified.
    if (!user.emailVerified) {
      return <Navigate to="/verify-email" replace state={from ? { from } : undefined} />;
    }
    return <Navigate to={from || redirectTo} replace />;
  }

  // If user is not authenticated, render the public content
  return <>{children}</>;
};

export default PublicRoute; 