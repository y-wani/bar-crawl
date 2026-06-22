// src/components/landing/HowItWorks.tsx
import React, { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";

interface Step {
  n: number;
  title: string;
  body: string;
}

const steps: Step[] = [
  { n: 1, title: "Drop your bars", body: "Find them on the map and build your shortlist." },
  { n: 2, title: "Get your route", body: "BarHop builds the perfect walkable order." },
  { n: 3, title: "Share & go", body: "Send it to your group and head out." },
];

const StepItem: React.FC<{
  step: Step;
  progress: MotionValue<number>;
  start: number;
  end: number;
}> = ({ step, progress, start, end }) => {
  const opacity = useTransform(progress, [start, end], [0.35, 1]);
  const x = useTransform(progress, [start, end], [20, 0]);
  const dotScale = useTransform(progress, [start, end], [0.8, 1.15]);
  return (
    <motion.li className="how__step" style={{ opacity }}>
      <motion.span className="how__dot" style={{ scale: dotScale }} />
      <motion.div className="how__step-content" style={{ x }}>
        <h3>
          {step.n}. {step.title}
        </h3>
        <p>{step.body}</p>
      </motion.div>
    </motion.li>
  );
};

/** Sticky-pinned 3-step section with a gold progress line that fills on scroll. */
const HowItWorks: React.FC = () => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  if (reduce) {
    return (
      <section className="how how--static" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">How it works</h2>
        <ol className="how-static">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="how-static__num">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section ref={ref} className="how" aria-labelledby="how-title">
      <div className="how__sticky">
        <h2 id="how-title" className="section-title">How it works</h2>
        <div className="how__track">
          <div className="how__line">
            <motion.div className="how__line-fill" style={{ scaleY: scrollYProgress }} />
          </div>
          <ol className="how__steps">
            {steps.map((s, i) => (
              <StepItem
                key={s.n}
                step={s}
                progress={scrollYProgress}
                start={i / steps.length}
                end={(i + 0.6) / steps.length}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
