// src/components/LocationTutorial.tsx

import React from "react";
import { FiMapPin, FiX } from "react-icons/fi";
import { AnimatePresence, motion } from "framer-motion";
import { modalOverlay, modalPanel } from "./motion/variants";
import "../styles/LocationTutorial.css";

interface LocationTutorialProps {
  onClose: () => void;
  isVisible: boolean;
}

const LocationTutorial: React.FC<LocationTutorialProps> = ({
  onClose,
  isVisible,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="modal-overlay"
          variants={modalOverlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="modal-panel tutorial-card"
            variants={modalPanel}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-title"
          >
            <div className="tutorial-header">
              <h2 className="tutorial-title" id="tutorial-title">
                <FiMapPin /> Welcome to BarHop!
              </h2>
              <button
                className="btn btn--icon modal-close"
                onClick={onClose}
                aria-label="Close tutorial"
              >
                <FiX />
              </button>
            </div>

            <div className="tutorial-content">
              <div className="tutorial-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <div className="step-title">Find Your Location</div>
                  <p className="step-description">
                    Use the <span className="search-highlight">search bar</span>{" "}
                    above the map to enter a city, or tap the location icon to use
                    where you are now.
                  </p>
                </div>
              </div>

              <div className="tutorial-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <div className="step-title">Discover Bars</div>
                  <p className="step-description">
                    Browse real bars nearby with Google ratings, reviews, and
                    open-now status — on the map or in the side list.
                  </p>
                </div>
              </div>

              <div className="tutorial-step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <div className="step-title">Build Your Route</div>
                  <p className="step-description">
                    Select bars from the list or tap their pins, then hit
                    "Generate My Route" for an optimized walking path.
                  </p>
                </div>
              </div>
            </div>

            <div className="tutorial-footer">
              💡 Pro tip: draw a shape on the map with the polygon tool to focus
              on one neighborhood
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LocationTutorial;
