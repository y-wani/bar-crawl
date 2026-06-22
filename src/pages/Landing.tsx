// src/pages/Landing.tsx

import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import SwirlBackground from "../components/SwirlBackground";
import "../styles/Landing.css";

/**
 * BarHop landing page (ported from the "BarHop Landing" design).
 *
 * The hero keeps the live three.js swirl (contained), fading into the dark,
 * purple-tinted sections below. A single scroll engine (ported from the
 * design's vanilla support.js) drives on-scroll reveals, blob/drift parallax,
 * the pinned "How it works" step sync, and the header backdrop — all gated by
 * prefers-reduced-motion.
 */
const Landing: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const intensity = reduce ? 0 : 1;
    const all = <T extends HTMLElement = HTMLElement>(sel: string): T[] =>
      Array.from(root.querySelectorAll(sel)) as T[];
    const one = <T extends HTMLElement = HTMLElement>(sel: string): T | null =>
      root.querySelector<T>(sel);

    // ---- reveals ----
    const reveals = all("[data-reveal]");
    let io: IntersectionObserver | undefined;
    if (reduce) {
      reveals.forEach((e) => {
        e.style.opacity = "1";
        e.style.transform = "none";
      });
    } else {
      reveals.forEach((e) => {
        e.style.opacity = "0";
        e.style.transform = "translateY(30px)";
        e.style.transition =
          "opacity .85s cubic-bezier(.22,.61,.36,1), transform .85s cubic-bezier(.22,.61,.36,1)";
      });
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              const el = en.target as HTMLElement;
              el.style.transitionDelay = (el.getAttribute("data-delay") || "0") + "ms";
              el.style.opacity = "1";
              el.style.transform = "none";
              io?.unobserve(el);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
      );
      reveals.forEach((e) => io?.observe(e));
    }

    // ---- scroll engine ----
    const header = one("[data-header]");
    const blobs = all("[data-blob]");
    const drifts = all("[data-drift]");
    const pin = one("[data-pinsection]");
    const steps = all("[data-step]");
    const shots = all("[data-shot]");
    const fill = one("[data-progressfill]");

    // preserve translateX(-50%) base on centered blobs
    blobs.forEach((b) => {
      if ((b.getAttribute("style") || "").includes("translateX(-50%)")) {
        b.dataset.bx = "translateX(-50%)";
      }
    });

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        const vh = window.innerHeight;

        if (header) {
          if (y > 30) {
            header.style.background = "rgba(12,9,19,0.82)";
            header.style.borderBottomColor = "rgba(255,255,255,0.07)";
            header.style.backdropFilter = "blur(14px)";
            header.style.setProperty("-webkit-backdrop-filter", "blur(14px)");
          } else {
            header.style.background = "transparent";
            header.style.borderBottomColor = "transparent";
            header.style.backdropFilter = "none";
            header.style.setProperty("-webkit-backdrop-filter", "none");
          }
        }

        if (intensity > 0) {
          blobs.forEach((b, i) => {
            const sp = (i % 2 ? 0.16 : -0.11) * intensity;
            b.style.transform =
              (b.dataset.bx || "") + " translate3d(0," + (y * sp).toFixed(1) + "px,0)";
          });
          drifts.forEach((d) => {
            const sp = parseFloat(d.getAttribute("data-drift") || "0") * intensity;
            const r = d.getBoundingClientRect();
            const center = r.top + r.height / 2 - vh / 2;
            d.style.transform = "translate3d(0," + (center * -sp).toFixed(1) + "px,0)";
          });
        }

        // The pinned step/screenshot sync is a desktop-only affordance; on
        // mobile the section stacks and each step shows its own screenshot.
        if (pin && steps.length && window.innerWidth > 860) {
          const rect = pin.getBoundingClientRect();
          const total = pin.offsetHeight - vh;
          let prog = total > 0 ? -rect.top / total : 0;
          prog = Math.max(0, Math.min(1, prog));
          const active = prog < 0.34 ? 0 : prog < 0.67 ? 1 : 2;
          steps.forEach((s, i) => {
            const on = i === active;
            s.style.opacity = on ? "1" : "0.3";
            const bar = s.querySelector<HTMLElement>("[data-stepbar]");
            if (bar) bar.style.transform = on ? "scaleX(1)" : "scaleX(0.001)";
          });
          shots.forEach((sh, i) => {
            sh.style.opacity = i === active ? "1" : "0";
            sh.style.transform = i === active ? "scale(1)" : "scale(1.04)";
          });
          if (fill) fill.style.width = (prog * 100).toFixed(1) + "%";
        }

        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io?.disconnect();
    };
  }, [reduce]);

  const featureChips: { label: string; icon: React.ReactNode }[] = [
    {
      label: "Smart radius",
      icon: (
        <svg width="24" height="24" viewBox="0 0 34 34" fill="none">
          <circle cx="17" cy="17" r="13" stroke="#e0a94a" strokeWidth="1.6" />
          <circle cx="17" cy="17" r="4.5" fill="#e0a94a" />
          <line x1="17" y1="0" x2="17" y2="6" stroke="#e0a94a" strokeWidth="1.6" />
          <line x1="17" y1="28" x2="17" y2="34" stroke="#e0a94a" strokeWidth="1.6" />
          <line x1="0" y1="17" x2="6" y2="17" stroke="#e0a94a" strokeWidth="1.6" />
          <line x1="28" y1="17" x2="34" y2="17" stroke="#e0a94a" strokeWidth="1.6" />
        </svg>
      ),
    },
    {
      label: "Route optimizer",
      icon: (
        <svg width="24" height="24" viewBox="0 0 34 34" fill="none">
          <circle cx="7" cy="8" r="4" stroke="#e0a94a" strokeWidth="1.6" />
          <circle cx="27" cy="26" r="4" stroke="#e0a94a" strokeWidth="1.6" />
          <path d="M7 12 C7 22, 27 12, 27 22" stroke="#e0a94a" strokeWidth="1.6" strokeDasharray="3 3" />
        </svg>
      ),
    },
    {
      label: "Live open status",
      icon: (
        <svg width="24" height="24" viewBox="0 0 34 34" fill="none">
          <circle cx="17" cy="17" r="13" stroke="#4ade80" strokeWidth="1.6" />
          <path d="M11 17 l4 4 l8 -9" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      label: "Import a bar list",
      icon: (
        <svg width="24" height="24" viewBox="0 0 34 34" fill="none">
          <rect x="5" y="6" width="24" height="18" rx="2.5" stroke="#e0a94a" strokeWidth="1.6" />
          <line x1="5" y1="12" x2="29" y2="12" stroke="#e0a94a" strokeWidth="1.6" />
          <line x1="13" y1="28" x2="21" y2="28" stroke="#e0a94a" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M17 6 v-3 M17 3 l-3 3 M17 3 l3 3" stroke="#e0a94a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      label: "Squad tracking",
      icon: (
        <svg width="24" height="24" viewBox="0 0 34 34" fill="none">
          <circle cx="12" cy="13" r="4.5" stroke="#e0a94a" strokeWidth="1.6" />
          <circle cx="24" cy="15" r="3.5" stroke="#e0a94a" strokeWidth="1.6" />
          <path d="M4 28 c0 -5 4 -8 8 -8 s8 3 8 8" stroke="#e0a94a" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M22 27 c0 -4 3 -6 6 -6" stroke="#e0a94a" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Shareable recap",
      icon: (
        <svg width="24" height="24" viewBox="0 0 34 34" fill="none">
          <circle cx="9" cy="17" r="3.5" stroke="#e0a94a" strokeWidth="1.6" />
          <circle cx="25" cy="9" r="3.5" stroke="#e0a94a" strokeWidth="1.6" />
          <circle cx="25" cy="25" r="3.5" stroke="#e0a94a" strokeWidth="1.6" />
          <line x1="12" y1="15.5" x2="22" y2="10.5" stroke="#e0a94a" strokeWidth="1.6" />
          <line x1="12" y1="18.5" x2="22" y2="23.5" stroke="#e0a94a" strokeWidth="1.6" />
        </svg>
      ),
    },
  ];

  return (
    <div ref={rootRef} className="bh-root">
      {/* ===== header ===== */}
      <header data-header className="bh-header">
        <Link to="/" className="bh-logo">BARHOP</Link>
        <nav className="bh-nav">
          <a href="#how" className="bh-navlink">How it works</a>
          <a href="#features" className="bh-navlink">Features</a>
          <Link to="/signup" className="bh-btn bh-btn--light bh-btn--sm">Get Started</Link>
        </nav>
      </header>

      {/* ===== hero ===== */}
      <section id="top" className="bh-hero">
        <SwirlBackground contained />
        <div className="bh-hero__fade" />
        <div className="bh-hero__content">
          <h1 className="bh-hero__title">Your Night, Your Route.</h1>
          <p className="bh-hero__subtitle">Discover, plan, and share the ultimate bar crawl.</p>
          <div className="bh-cta-row">
            <Link to="/signup" className="bh-btn bh-btn--light bh-btn--lg">Get Started for Free</Link>
            <Link to="/signin" className="bh-btn bh-btn--ghost bh-btn--lg">I have an account</Link>
          </div>
        </div>
        <div className="bh-scrollcue">
          <span className="bh-scrollcue__label">SCROLL</span>
          <span className="bh-scrollcue__arrow">↓</span>
        </div>
      </section>

      {/* ===== hook ===== */}
      <section className="bh-hook">
        <div data-reveal className="bh-hook__inner">
          <p className="bh-hook__line">
            No more <span className="bh-strike">&ldquo;so where are we going?&rdquo;</span> group chats.
          </p>
          <p className="bh-hook__sub">
            One link. Everyone votes. BarHop builds the route and keeps the whole crew moving
            together — all night.
          </p>
        </div>
      </section>

      {/* ===== pinned: how it works ===== */}
      <section id="how" data-pinsection className="bh-how">
        <div className="bh-how__sticky">
          <div
            data-blob
            className="bh-blob"
            style={{
              top: "20%",
              right: "-10%",
              width: "46vw",
              height: "46vw",
              maxWidth: 620,
              maxHeight: 620,
              background: "radial-gradient(circle, rgba(124,47,208,0.28), transparent 64%)",
            }}
          />
          <div className="bh-how__grid">
            <div>
              <p className="bh-eyebrow" style={{ marginBottom: 30 }}>HOW IT WORKS</p>

              <div data-step className="bh-step">
                <div className="bh-step__head">
                  <span className="bh-step__num">01</span>
                  <h3 className="bh-step__title">Discover what&rsquo;s around you</h3>
                </div>
                <div data-stepbar className="bh-step__bar" />
                <p className="bh-step__body">
                  Drop a pin, set your radius. Every bar nearby — ranked by distance or hype, with
                  live open/closed status.
                </p>
                <img className="bh-step__shot" src="/Home_Page.png" alt="Discover bars on the map" loading="lazy" />
              </div>

              <div data-step className="bh-step">
                <div className="bh-step__head">
                  <span className="bh-step__num">02</span>
                  <h3 className="bh-step__title">Plan the perfect route</h3>
                </div>
                <div data-stepbar className="bh-step__bar" />
                <p className="bh-step__body">
                  Pick your stops and let BarHop optimize the walk. Drag to reorder, then lock it in —
                  less walking, more drinking.
                </p>
                <img className="bh-step__shot" src="/Route_Page.png" alt="Optimize your route" loading="lazy" />
              </div>

              <div data-step className="bh-step">
                <div className="bh-step__head">
                  <span className="bh-step__num">03</span>
                  <h3 className="bh-step__title">Crawl together, live</h3>
                </div>
                <div data-stepbar className="bh-step__bar" />
                <p className="bh-step__body">
                  Start the crawl and track the whole squad on one map. &ldquo;Omw,&rdquo; &ldquo;next
                  round&rsquo;s on me&rdquo; — nobody gets left behind.
                </p>
                <img className="bh-step__shot" src="/Live_Crawl.png" alt="Live squad tracking" loading="lazy" />
              </div>

              <div className="bh-progress">
                <div data-progressfill className="bh-progress__fill" />
              </div>
            </div>

            <div className="bh-frame bh-how__media">
              <div className="bh-frame__bar">
                <span className="bh-dot bh-dot--r" />
                <span className="bh-dot bh-dot--y" />
                <span className="bh-dot bh-dot--g" />
                <div className="bh-frame__url">gobarhop.app</div>
              </div>
              <div className="bh-how__stage">
                <img data-shot className="bh-shot" src="/Home_Page.png" alt="Discover bars on the map" style={{ opacity: 1 }} />
                <img data-shot className="bh-shot" src="/Route_Page.png" alt="Optimize your route" style={{ opacity: 0 }} />
                <img data-shot className="bh-shot" src="/Live_Crawl.png" alt="Live squad tracking" style={{ opacity: 0 }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== vote ===== */}
      <section id="features" className="bh-vote bh-section">
        <div className="bh-split">
          <div data-drift="0.05" className="bh-drift">
            <div data-reveal className="bh-frame">
              <div className="bh-frame__bar">
                <span className="bh-dot bh-dot--r" />
                <span className="bh-dot bh-dot--y" />
                <span className="bh-dot bh-dot--g" />
                <div className="bh-frame__url">gobarhop.app/crawl</div>
              </div>
              <img className="bh-frame__img" src="/Friend_Vote.png" alt="Friends voting on stops" />
            </div>
          </div>
          <div data-reveal data-delay="120">
            <p className="bh-eyebrow">DECIDE AS A CREW</p>
            <h2 className="bh-h2">Everybody votes.<br />The bar wins.</h2>
            <p className="bh-split__lead" style={{ marginBottom: 28 }}>
              Share one link and the whole group thumbs-up the stops they want. No more democracy by
              group chat — the route writes itself from real votes.
            </p>
            <ul className="bh-checklist">
              <li><span className="bh-check">✓</span>Live tally as people join</li>
              <li><span className="bh-check">✓</span>No account needed to vote</li>
              <li><span className="bh-check">✓</span>Top picks auto-build the route</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== feature cards ===== */}
      <section className="bh-cards">
        <div className="bh-cards__inner">
          <div data-reveal className="bh-cards__head">
            <p className="bh-eyebrow" style={{ margin: "0 0 16px" }}>EVERYTHING IN ONE TAP</p>
            <h2 className="bh-h2" style={{ margin: 0 }}>Built for the whole night</h2>
          </div>
          <div className="bh-marquee" aria-label="BarHop features">
            <div className="bh-marquee__track">
              {[...featureChips, ...featureChips].map((c, i) => (
                <div className="bh-chip" key={i} aria-hidden={i >= featureChips.length}>
                  {c.icon}
                  <span className="bh-chip__label">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== final CTA ===== */}
      <section className="bh-final">
        <div className="bh-final__bg" />
        <div
          data-blob
          className="bh-blob"
          style={{
            top: "-20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "50vw",
            height: "50vw",
            maxWidth: 640,
            maxHeight: 640,
            background: "radial-gradient(circle, rgba(224,169,74,0.16), transparent 64%)",
            filter: "blur(16px)",
          }}
        />
        <div data-reveal className="bh-final__inner">
          <h2 className="bh-final__title">Round up the squad.</h2>
          <p className="bh-final__sub">
            Your next crawl is four taps away. No app to download, no card to enter.
          </p>
          <div className="bh-cta-row">
            <Link to="/signup" className="bh-btn bh-btn--light bh-btn--xl">Get Started for Free</Link>
            <Link to="/signin" className="bh-btn bh-btn--ghost bh-btn--xl">I have an account</Link>
          </div>
        </div>
      </section>

      {/* ===== footer ===== */}
      <footer className="bh-footer">
        <div className="bh-footer__inner">
          <div className="bh-footer__brand">BARHOP</div>
          <div className="bh-footer__links">
            <Link to="/privacy">Privacy Policy</Link>
            <span className="bh-footer__sep">·</span>
            <Link to="/terms">Terms &amp; Conditions</Link>
          </div>
          <div className="bh-footer__domain">gobarhop.app</div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
