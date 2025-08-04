// src/components/MapLoadingIndicator.tsx

import React from "react";

interface MapLoadingIndicatorProps {
  message?: string;
}

const MapLoadingIndicator: React.FC<MapLoadingIndicatorProps> = ({ 
  message = "Finding the perfect bars..." 
}) => {
  return (
    <div className="map-loading-overlay">
      <div className="map-loading-content">
        {/* Neon loading animation */}
        <div className="neon-loading-container">
          <div className="neon-loading-ring">
            <div className="neon-loading-dot" style={{ '--delay': '0s' } as React.CSSProperties}></div>
            <div className="neon-loading-dot" style={{ '--delay': '0.2s' } as React.CSSProperties}></div>
            <div className="neon-loading-dot" style={{ '--delay': '0.4s' } as React.CSSProperties}></div>
            <div className="neon-loading-dot" style={{ '--delay': '0.6s' } as React.CSSProperties}></div>
            <div className="neon-loading-dot" style={{ '--delay': '0.8s' } as React.CSSProperties}></div>
            <div className="neon-loading-dot" style={{ '--delay': '1s' } as React.CSSProperties}></div>
          </div>
          
          {/* Center bar icon */}
          <div className="neon-loading-icon">🍸</div>
        </div>
        
        {/* Loading message */}
        <div className="neon-loading-message">
          {message}
        </div>
        
        {/* Subtitle */}
        <div className="neon-loading-subtitle">
          Scanning for legendary spots...
        </div>
      </div>
      
      <style>{`
        .map-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, 
            rgba(22, 21, 43, 0.95) 0%, 
            rgba(12, 11, 22, 0.9) 100%);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.3s ease-out;
        }

        .map-loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          text-align: center;
        }

        .neon-loading-container {
          position: relative;
          width: 120px;
          height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .neon-loading-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
        }

        .neon-loading-dot {
          position: absolute;
          width: 12px;
          height: 12px;
          background: linear-gradient(135deg, #3bb2d0 0%, #00ffff 100%);
          border-radius: 50%;
          box-shadow: 
            0 0 10px rgba(59, 178, 208, 0.8),
            0 0 20px rgba(0, 255, 255, 0.6),
            0 0 30px rgba(59, 178, 208, 0.4);
          animation: neonPulseRotate 2s linear infinite;
          animation-delay: var(--delay);
        }

        .neon-loading-dot:nth-child(1) { top: 0; left: 50%; transform: translateX(-50%); }
        .neon-loading-dot:nth-child(2) { top: 25%; right: 0; transform: translateY(-50%); }
        .neon-loading-dot:nth-child(3) { bottom: 25%; right: 0; transform: translateY(50%); }
        .neon-loading-dot:nth-child(4) { bottom: 0; left: 50%; transform: translateX(-50%); }
        .neon-loading-dot:nth-child(5) { bottom: 25%; left: 0; transform: translateY(50%); }
        .neon-loading-dot:nth-child(6) { top: 25%; left: 0; transform: translateY(-50%); }

        .neon-loading-icon {
          font-size: 3rem;
          filter: drop-shadow(0 0 10px rgba(59, 178, 208, 0.8));
          animation: iconBounce 1.5s ease-in-out infinite;
        }

        .neon-loading-message {
          font-family: "Rajdhani", sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, #3bb2d0 0%, #00ffff 50%, #ff00ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-align: center;
          letter-spacing: 1px;
          animation: textGlow 2s ease-in-out infinite alternate;
        }

        .neon-loading-subtitle {
          font-family: "Poppins", sans-serif;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
          animation: fadeInOut 3s ease-in-out infinite;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes neonPulseRotate {
          0% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
          100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
        }

        @keyframes iconBounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes textGlow {
          0% {
            filter: drop-shadow(0 0 5px rgba(59, 178, 208, 0.5));
          }
          100% {
            filter: drop-shadow(0 0 15px rgba(0, 255, 255, 0.8));
          }
        }

        @keyframes fadeInOut {
          0%, 100% {
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default MapLoadingIndicator;