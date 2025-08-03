import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route as RouterRoute } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute from './PublicRoute';

// Lazy load page components
const Landing = React.lazy(() => import('../pages/Landing'));
const Home = React.lazy(() => import('../pages/Home'));
const Route = React.lazy(() => import('../pages/Route'));
const SignIn = React.lazy(() => import('../pages/SignIn'));
const SignUp = React.lazy(() => import('../pages/SignUp'));

const AppRouter: React.FC = () => {
  const { loading } = useAuth();

  // Show loading spinner while checking authentication status
  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
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
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default AppRouter; 