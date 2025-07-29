import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/useTheme';
import { ThemeToggle } from '../components/ThemeToggle';

const Landing: React.FC = () => {
  const { theme } = useTheme();

  return (
    <div style={{ padding: '2rem', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Bar Crawl Route App</h1>
        <ThemeToggle />
      </div>
      
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h2>Plan Your Perfect Night Out</h2>
        <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
          Discover the best bars, plan optimal routes, and make every night unforgettable.
        </p>
        <p>Current theme: <strong>{theme}</strong></p>
      </div>
      
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto', marginBottom: '2rem' }}>
        <h3>Why Choose Bar Crawl Route?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
          <div>
            <h4>🎯 Smart Route Planning</h4>
            <p>Our algorithm finds the most efficient path between bars, saving you time and energy.</p>
          </div>
          <div>
            <h4>⭐ Curated Recommendations</h4>
            <p>Discover hidden gems and popular hotspots based on real user reviews and ratings.</p>
          </div>
          <div>
            <h4>📱 Easy to Use</h4>
            <p>Simple, intuitive interface that works perfectly on mobile and desktop.</p>
          </div>
          <div>
            <h4>👥 Social Features</h4>
            <p>Share your favorite routes with friends and discover new places together.</p>
          </div>
        </div>
      </div>
      
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '2rem' }}>
          <Link to="/home" className="btn" style={{ marginRight: '1rem' }}>
            Get Started
          </Link>
          <Link to="/signin" className="btn btn-secondary">
            Sign In
          </Link>
        </div>
        
        <div>
          <p style={{ marginBottom: '1rem' }}>
            New to Bar Crawl Route?{' '}
            <Link to="/signup" className="link">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Landing; 