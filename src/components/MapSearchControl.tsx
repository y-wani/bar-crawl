import React, { useState } from 'react';
import '../styles/Home.css'; // We'll add styles here
// import LoadingSpinner from './LoadingSpinner'; // Assuming a small spinner component

interface MapSearchControlProps {
  onSearch: (location: string, radius: number) => void;
  isLoading: boolean;
  initialLocation?: string;
  initialRadius?: number;
}

export const MapSearchControl: React.FC<MapSearchControlProps> = ({
  onSearch,
  isLoading,
  initialLocation = 'Columbus, Ohio',
  initialRadius = 1,
}) => {
  const [location, setLocation] = useState(initialLocation);
  const [radius, setRadius] = useState(initialRadius);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (location && !isLoading) {
      onSearch(location, radius);
    }
  };

  return (
    <div className="map-controls-overlay">
      <form onSubmit={handleSearch} className="map-search-bar">
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Enter a City or Neighborhood..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? '...' : '🔍'}
        </button>
      </form>
      <div className="map-radius-control">
        <label htmlFor="radius-slider">Radius: {radius.toFixed(1)} mi</label>
        <input
          id="radius-slider"
          type="range"
          min="0.5"
          max="5"
          step="0.1"
          value={radius}
          onChange={(e) => setRadius(parseFloat(e.target.value))}
          onMouseUp={() => onSearch(location, radius)} // Optional: re-search on release
          onTouchEnd={() => onSearch(location, radius)} // Optional: for mobile
        />
      </div>
    </div>
  );
};