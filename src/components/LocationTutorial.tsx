// src/components/LocationTutorial.tsx

import React, { useState, useEffect } from "react";
import { FiMapPin } from "react-icons/fi";
import "../styles/LocationTutorial.css"; // Import the new stylesheet

interface LocationTutorialProps {
  onClose: () => void;
  isVisible: boolean;
}

const LocationTutorial: React.FC<LocationTutorialProps> = ({
  onClose,
  isVisible,
}) => {
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // This effect will trigger the fade-out animation
  useEffect(() => {
    if (!isVisible) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        setIsAnimatingOut(false);
      }, 400); // Animation duration
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isVisible && !isAnimatingOut) return null;

  return (
    <div
      className={`tutorial-overlay ${isAnimatingOut ? "closing" : ""}`}
      onClick={onClose}
    >
      <div className="tutorial-card" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-header">
          <h2 className="tutorial-title">
            <FiMapPin /> Welcome to Bar Crawl!
          </h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="tutorial-content">
          <div className="tutorial-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <div className="step-title">Find Your Location</div>
              <p className="step-description">
                Click the <span className="search-highlight">search bar</span>{" "}
                at the top to enter your city, neighborhood, or address.
              </p>
            </div>
          </div>

          <div className="tutorial-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <div className="step-title">Discover Bars</div>
              <p className="step-description">
                The map will show you all the best bars in your area with
                ratings, vibes, and distances.
              </p>
            </div>
          </div>

          <div className="tutorial-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <div className="step-title">Build Your Route</div>
              <p className="step-description">
                Click on bars to add them to your crawl route, then plan the
                perfect night out!
              </p>
            </div>
          </div>
        </div>

        <div className="tutorial-footer">
          💡 Pro tip: You can also use your current location or explore popular
          cities
        </div>
      </div>
    </div>
  );
};

export default LocationTutorial;
