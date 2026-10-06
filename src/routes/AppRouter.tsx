import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route as RouterRoute, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import ProtectedRoute from './ProtectedRoute';
import InviteRoute from './InviteRoute';
import PublicRoute from './PublicRoute';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { captureRef } from '../utils/attribution';

// Lazy load page components
const Landing = React.lazy(() => import('../pages/Landing'));
const Home = React.lazy(() => import('../pages/Home'));
const Route = React.lazy(() => import('../pages/Route'));
const LiveCrawl = React.lazy(() => import('../pages/LiveCrawl'));
const PlanLobby = React.lazy(() => import('../pages/PlanLobby'));
const CrawlList = React.lazy(() => import('../pages/CrawlList'));
const VenueMap = React.lazy(() => import('../pages/VenueMap'));
const OrgPage = React.lazy(() => import('../pages/OrgPage'));
const SavedCrawls = React.lazy(() => import('../pages/SavedCrawls'));
const SignIn = React.lazy(() => import('../pages/SignIn'));
const SignUp = React.lazy(() => import('../pages/SignUp'));
const VerifyEmail = React.lazy(() => import('../pages/VerifyEmail'));
const ForgotPassword = React.lazy(() => import('../pages/ForgotPassword'));
const PrivacyPolicy = React.lazy(() => import('../pages/PrivacyPolicy'));
const Terms = React.lazy(() => import('../pages/Terms'));

// Inner component so useLocation is called within BrowserRouter.
// AnimatePresence + keyed Routes drive the page enter/exit transitions
// (each page opts in by wrapping its root in <PageTransition>).
const AnimatedRoutes: React.FC = () => {
  const location = useLocation();

  // First-touch attribution. Runs on every navigation but only ever records
  // the first source a device arrived from (see utils/attribution.ts).
  useEffect(() => {
    captureRef(location.pathname, location.search);
  }, [location.pathname, location.search]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <RouterRoute path="/" element={<Landing />} />
        {/* Open to guests (spec §4.2). An anonymous Firebase user is minted
            on /home so the billed proxy still gets a token and per-uid limits
            still bind; save, live, plan and saved-crawls stay gated below. */}
        <RouterRoute path="/home" element={<Home />} />
        <RouterRoute path="/route" element={<Route />} />
        {/* A shared crawl. Ungated on purpose and deliberately NOT wrapped in
            any guard: the whole crawl travels in the URL fragment, so this
            renders with no account, no anonymous mint and no Firestore read.
            It is the only page a shared link lands on, which makes it the
            product's growth loop — a wall here would close the loop. */}
        <RouterRoute path="/c" element={<CrawlList />} />
        {/* Short form: the payload is published at /events/<slug>.json. */}
        <RouterRoute path="/c/:slug" element={<CrawlList />} />
        {/* An event's venue map: every participating bar, unordered. Same
            no-account, fragment-only rules as /c. */}
        <RouterRoute path="/v" element={<VenueMap />} />
        <RouterRoute path="/v/:slug" element={<VenueMap />} />
        {/* An organizer's branded page. Open to guests: a group leader starts
            their group's crawl with no account (OrgPage mints an anonymous
            user and asks only for a name). */}
        <RouterRoute
          path="/o/:slug"
          element={
            <ErrorBoundary>
              <OrgPage />
            </ErrorBoundary>
          }
        />
        {/* Attendee surfaces: an invite link works with no account (an
            anonymous user is minted). Starting a crawl or a plan still needs
            a real account — Route.tsx gates that, not these routes. */}
        <RouterRoute
          path="/live"
          element={
            <InviteRoute inviteParam="join">
              <ErrorBoundary>
                <LiveCrawl />
              </ErrorBoundary>
            </InviteRoute>
          }
        />
        <RouterRoute
          path="/plan"
          element={
            <InviteRoute inviteParam="id">
              <ErrorBoundary>
                <PlanLobby />
              </ErrorBoundary>
            </InviteRoute>
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
        {/* Email-verification gate — manages its own redirects (no user →
            signin, verified → home), so it isn't wrapped in a route guard. */}
        <RouterRoute path="/verify-email" element={<VerifyEmail />} />
        <RouterRoute
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          }
        />
        {/* Public legal pages — no auth gate so anyone (and Google's OAuth
            verification) can reach them. */}
        <RouterRoute path="/privacy" element={<PrivacyPolicy />} />
        <RouterRoute path="/terms" element={<Terms />} />
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
