// Wraps a page's root JSX to give it the shared enter/exit transition.
// Used inside each page component (Landing intentionally does not use it).
import React from "react";
import { motion } from "framer-motion";
import { pageVariants } from "./variants";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

const PageTransition: React.FC<PageTransitionProps> = ({ children, className }) => (
  <motion.div
    className={className}
    variants={pageVariants}
    initial="hidden"
    animate="visible"
    exit="exit"
    style={{ minHeight: "100%", display: "flex", flexDirection: "column", flex: 1 }}
  >
    {children}
  </motion.div>
);

export default PageTransition;
