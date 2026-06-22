// src/pages/Landing.tsx

import React from "react";
import { Link } from "react-router-dom";
import SwirlBackground from "../components/SwirlBackground";
import ScrollCue from "../components/landing/ScrollCue";
import FeatureRow from "../components/landing/FeatureRow";
import { features } from "../components/landing/featureData";
import "../styles/Landing.css";

const Landing: React.FC = () => {
  return (
    <>
      <SwirlBackground />
      <section className="landing-hero">
        <div className="landing-brand">BarHop</div>
        <div className="landing-content">
          <h1 className="landing-title">Your Night, Your Route.</h1>
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
        <ScrollCue />
      </section>

      <main className="landing-sections">
        <section className="features" aria-label="What you can do with BarHop">
          {features.map((f, i) => (
            <FeatureRow
              key={f.headline}
              headline={f.headline}
              body={f.body}
              imgSrc={f.imgSrc}
              imgAlt={f.imgAlt}
              reverse={i % 2 === 1}
            />
          ))}
        </section>
      </main>

      <footer className="landing-footer landing-footer--bottom">
        <Link to="/privacy">Privacy Policy</Link>
        <span>&middot;</span>
        <Link to="/terms">Terms &amp; Conditions</Link>
      </footer>
    </>
  );
};

export default Landing;
