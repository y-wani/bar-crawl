// src/components/landing/ScrollCue.tsx
import React from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Animated "there's more below" cue at the bottom of the hero. */
const ScrollCue: React.FC = () => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="scroll-cue"
      aria-hidden="true"
      animate={reduce ? {} : { y: [0, 10, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <span>See how it works</span>
      <span className="scroll-cue__chev">&#8964;</span>
    </motion.div>
  );
};

export default ScrollCue;
