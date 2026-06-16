// src/components/LegalLayout.tsx
//
// Shared shell for the Privacy Policy and Terms pages: nightlife-themed glass
// article over the swirl background, with a back link and cross-links. These
// pages are intentionally public (no auth) so Google's OAuth verification and
// anyone with the link can read them.

import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SwirlBackground from "./SwirlBackground";
import PageTransition from "./motion/PageTransition";
import { springPanel } from "./motion/variants";
import "../styles/Legal.css";

interface LegalLayoutProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

const LegalLayout: React.FC<LegalLayoutProps> = ({ title, updated, children }) => (
  <PageTransition>
    <div className="legal-page">
      <SwirlBackground />
      <motion.article
        className="legal-card"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springPanel}
      >
        <Link to="/" className="legal-back">
          &larr; Back to BarHop
        </Link>
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        <div className="legal-content">{children}</div>
        <nav className="legal-nav">
          <Link to="/privacy">Privacy Policy</Link>
          <span>·</span>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <span>·</span>
          <Link to="/">Home</Link>
        </nav>
      </motion.article>
    </div>
  </PageTransition>
);

export default LegalLayout;
