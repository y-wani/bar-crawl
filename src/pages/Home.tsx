import React from 'react';
import { useTheme } from '../theme/useTheme';
import { useAuth } from '../context/useAuth';

const Home: React.FC = () => {
  const { theme } = useTheme();
  const { user, signout } = useAuth();

  const handleSignOut = async () => {
    try {
      await signout();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div style={{ padding: '2rem', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Welcome to Bar Crawl Route App</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {user && (
            <span style={{ color: 'var(--text-secondary)' }}>
              Welcome, {user.displayName || user.email}!
            </span>
          )}
          <button onClick={handleSignOut} className="btn btn-secondary">
            Sign Out
          </button>
        </div>
      </div>
      
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2>Dashboard</h2>
        <p>Current theme: <strong>{theme}</strong></p>
        {user && (
          <p>Logged in as: <strong>{user.email}</strong></p>
        )}
        
        <div style={{ marginTop: '2rem' }}>
          <h2>Plan Your Perfect Bar Crawl</h2>
          <p>
            Discover the best bars in your area and create the perfect route for your next night out.
            Our app helps you find the hottest spots, plan your route, and make the most of your evening.
          </p>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h3>Features Coming Soon:</h3>
          <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
            <li>🎯 Find bars near you</li>
            <li>🗺️ Plan optimal routes</li>
            <li>⭐ Read reviews and ratings</li>
            <li>📱 Save your favorite routes</li>
            <li>👥 Share with friends</li>
            <li>🍺 Filter by drink preferences</li>
          </ul>
        </div>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button className="btn" style={{ marginRight: '1rem' }}>
            Start Planning
          </button>
          <button className="btn btn-secondary">
            Browse Bars
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home; 