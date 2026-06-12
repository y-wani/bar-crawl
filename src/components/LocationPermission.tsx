// src/components/LocationPermission.tsx

import React, { useState } from "react";
import { FiMapPin, FiNavigation, FiX } from "react-icons/fi";
import { AnimatePresence, motion } from "framer-motion";
import { modalOverlay, modalPanel } from "./motion/variants";
import "../styles/LocationPermission.css";

interface LocationPermissionProps {
  onLocationGranted: (coords: [number, number]) => void;
  onLocationDenied: () => void;
  onSkip: () => void;
  isVisible: boolean;
  getUserLocation?: () => Promise<[number, number] | null>;
}

const LocationPermission: React.FC<LocationPermissionProps> = ({
  onLocationGranted,
  onLocationDenied,
  onSkip,
  isVisible,
  getUserLocation,
}) => {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestLocation = async () => {
    setIsRequesting(true);
    setError(null);

    try {
      // Use the provided getUserLocation function if available, otherwise fall back to direct geolocation
      if (getUserLocation) {
        const coords = await getUserLocation();
        if (coords) {
          console.log("📍 User location granted:", coords);
          onLocationGranted(coords);
        } else {
          throw new Error("Failed to get user location");
        }
      } else {
        // Fallback to direct geolocation
        if (!navigator.geolocation) {
          throw new Error("Geolocation is not supported by your browser");
        }

        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000, // 5 minutes
          });
        });

        const { longitude, latitude } = position.coords;
        console.log("📍 User location granted:", { longitude, latitude });
        onLocationGranted([longitude, latitude]);
      }
    } catch (err) {
      console.error("❌ Location permission error:", err);
      
      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError("Location access was denied. You can still use the app by searching for a location.");
            onLocationDenied();
            break;
          case err.POSITION_UNAVAILABLE:
            setError("Location information is unavailable. Please try again or search for a location.");
            break;
          case err.TIMEOUT:
            setError("Location request timed out. Please try again or search for a location.");
            break;
          default:
            setError("An error occurred while getting your location. Please try again or search for a location.");
        }
      } else {
        setError("Unable to get your location. Please try again or search for a location.");
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  return (
    <AnimatePresence>
      {isVisible && (
    <motion.div
      className="modal-overlay"
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="modal-panel location-permission-card"
        variants={modalPanel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-permission-title"
      >
        <div className="location-permission-header">
          <div className="location-icon">
            <FiMapPin />
          </div>
          <h2 className="location-title" id="location-permission-title">
            Enable Location Access
          </h2>
          <button className="btn btn--icon modal-close" onClick={handleSkip} aria-label="Close">
            <FiX />
          </button>
        </div>

        <div className="location-permission-content">
          <p className="location-description">
            Get the best bar recommendations near you! We'll use your location to:
          </p>
          
          <div className="location-benefits">
            <div className="benefit-item">
              <FiNavigation className="benefit-icon" />
              <span>Find bars closest to your current location</span>
            </div>
            <div className="benefit-item">
              <FiMapPin className="benefit-icon" />
              <span>Set your starting point for the perfect bar crawl</span>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">⚡</span>
              <span>Cache nearby bars for faster loading</span>
            </div>
          </div>

          {error && (
            <div className="location-error">
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="location-permission-footer">
          <button
            className="btn btn--primary btn--full"
            onClick={handleRequestLocation}
            disabled={isRequesting}
          >
            {isRequesting ? (
              <>
                <div className="spinner"></div>
                Getting Location...
              </>
            ) : (
              <>
                <FiMapPin />
                Use My Location
              </>
            )}
          </button>

          <button
            className="btn btn--secondary btn--full"
            onClick={handleSkip}
            disabled={isRequesting}
          >
            Search for Location Instead
          </button>
        </div>

        <div className="location-privacy-note">
          🔒 Your location is only used to find nearby bars and is never shared with third parties
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LocationPermission; 