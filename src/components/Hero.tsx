import React from 'react';
import SwirlBackground from './SwirlBackground';
import '../styles/Hero.css';

export const Hero: React.FC = () => {
  return (
    <div className="hero-section">
      <SwirlBackground />
      <div className="hero-content">
        <h1 className="hero-headline">Plan Your Perfect Campus Bar Crawl</h1>
        <p className="hero-subhead">Start at home. Hit your favorites. End the night on a high note.</p>
        <div className="hero-input-group">
          <input type="text" placeholder="Enter your starting address" className="hero-input" />
          <button className="btn-location">📍 Use My Location</button>
        </div>
        <button className="btn btn-primary-hero">Start Planning My Crawl</button>
      </div>
    </div>
  );
};
