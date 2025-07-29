// src/pages/Landing.tsx

import React from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../theme/useTheme";
import SwirlBackground from "../components/SwirlBackground";
import '../styles/Landing.css'; // We'll create this file next

const Landing: React.FC = () => {
  const { setTheme } = useTheme();

  // Set the 'party' theme on component mount
  React.useEffect(() => {
    setTheme("party");
  }, [setTheme]);

  return (
    <>
      <SwirlBackground />
      <div className="landing-container">
        <div className="landing-content">
          <h1 className="landing-title">
            Your Night, Your Route.
          </h1>
          <p className="landing-subtitle">
            Discover, plan, and share the ultimate bar crawl.
          </p>
          <div className="landing-cta">
            <Link to="/signup" className="btn btn-primary-landing">
              Get Started for Free
            </Link>
            <Link to="/signin" className="btn btn-secondary-landing">
              I have an account
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Landing;