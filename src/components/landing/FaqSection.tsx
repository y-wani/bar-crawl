// src/components/landing/FaqSection.tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Faq {
  q: string;
  a: string;
}

const faqs: Faq[] = [
  {
    q: "What is the best free app to plan a bar crawl?",
    a: "BarHop is a free bar crawl planner that lets you find bars on an interactive map, build an optimized route between them, save your crawl, and share it with friends — no cost and no download required.",
  },
  {
    q: "How do I plan a bar crawl route?",
    a: "Open BarHop, search your area on the map, add the bars you want to visit, and BarHop builds a walkable route in order. You can reorder stops, save the crawl, and send it to your group.",
  },
  {
    q: "Can I plan a night out with friends in real time?",
    a: "Yes. BarHop's Live Crawl lets a group follow the same bar crawl together, so everyone sees the current stop and the route for the night out as it happens.",
  },
  {
    q: "Is BarHop free?",
    a: "Yes — BarHop is completely free to use.",
  },
];

const FaqSection: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="faq" aria-labelledby="faq-title">
      <h2 id="faq-title" className="section-title">Frequently asked questions</h2>
      <div className="faq__list">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div className="faq__item" key={f.q}>
              <button
                type="button"
                className="faq__q"
                id={`faq-q-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{f.q}</span>
                <span className={`faq__chev${isOpen ? " faq__chev--open" : ""}`}>&#8964;</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-a-${i}`}
                    role="region"
                    aria-labelledby={`faq-q-${i}`}
                    className="faq__a"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <p>{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default FaqSection;
