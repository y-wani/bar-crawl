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
    return <Navigate to={from || redirectTo} replace />;
  }

  // If user is not authenticated, render the public content
  return <>{children}</>;
};

export default PublicRoute; 