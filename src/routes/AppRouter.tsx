import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route as RouterRoute, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute from './PublicRoute';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Lazy load page components
const Landing = React.lazy(() => import('../pages/Landing'));
const Home = React.lazy(() => import('../pages/Home'));
const Route = React.lazy(() => import('../pages/Route'));
const SavedCrawls = React.lazy(() => import('../pages/SavedCrawls'));
const SignIn = React.lazy(() => import('../pages/SignIn'));
const SignUp = React.lazy(() => import('../pages/SignUp'));
const ForgotPassword = React.lazy(() => import('../pages/ForgotPassword'));

// Inner component so useLocation is called within BrowserRouter.
// AnimatePresence + keyed Routes drive the page enter/exit transitions
// (each page opts in by wrapping its root in <PageTransition>).
const AnimatedRoutes: React.FC = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <RouterRoute path="/" element={<Landing />} />
        <RouterRoute
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <RouterRoute
          path="/route"
          element={
            <ProtectedRoute>
              <Route />
            </ProtectedRoute>
          }
        />
        <RouterRoute
          path="/saved-crawls"
          element={
            <ProtectedRoute>
              <ErrorBoundary>
                <SavedCrawls />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />
        <RouterRoute
          path="/signin"
          element={
            <PublicRoute>
              <SignIn />
            </PublicRoute>
          }
        />
        <RouterRoute
          path="/signup"
          element={
            <PublicRoute>
              <SignUp />
            </PublicRoute>
          }
        />
        <RouterRoute
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          }
        />
        {/* Unknown URLs go back to the landing page */}
        <RouterRoute path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

const AppRouter: React.FC = () => {
  const { loading } = useAuth();

  // Show loading spinner while checking authentication status
  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <AnimatedRoutes />
      </Suspense>
    </BrowserRouter>
  );
};

export default AppRouter;
