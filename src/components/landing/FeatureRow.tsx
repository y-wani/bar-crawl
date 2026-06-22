// src/components/landing/FeatureRow.tsx
import React, { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

export interface FeatureRowProps {
  headline: string;
  body: string;
  imgSrc: string;
  imgAlt: string;
  reverse?: boolean;
}

/** One alternating image/text feature row with a scroll reveal + image wipe. */
const FeatureRow: React.FC<FeatureRowProps> = ({
  headline,
  body,
  imgSrc,
  imgAlt,
  reverse = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, -40]);

  return (
    <div ref={ref} className={`feature-row${reverse ? " feature-row--reverse" : ""}`}>
      <motion.div
        className="feature-row__text"
        initial={reduce ? false : { opacity: 0, y: 30 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h3 className="feature-row__headline">{headline}</h3>
        <p className="feature-row__body">{body}</p>
      </motion.div>

      <motion.div
        className="feature-row__media"
        initial={reduce ? false : { opacity: 0, clipPath: "inset(0 100% 0 0)" }}
        whileInView={reduce ? undefined : { opacity: 1, clipPath: "inset(0 0% 0 0)" }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <motion.img src={imgSrc} alt={imgAlt} loading="lazy" style={{ y }} />
      </motion.div>
    </div>
  );
};

export default FeatureRow;
