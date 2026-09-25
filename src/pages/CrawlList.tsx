// src/pages/CrawlList.tsx
//
// "map is good for planning but when im drunk i dont want to look at map i
// just want name of next bar in order."  — r/sideproject, 2026-09-22
//
// One stop at a time, no map, no account, no network. Everything this page
// renders arrives in the URL fragment, so it works for a guest, for a friend
// who has never heard of BarHop, and on a phone with one bar of signal.
//
// It is also the only page a shared link can land on, which makes it the
// product's growth loop: the planner sends it, five other people open it, and
// some of them become the next planner. That is why it is deliberately NOT
// behind ProtectedRoute and does not require the anonymous-user mint either.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiArrowLeft, FiCheck, FiMapPin, FiNavigation, FiRotateCcw } from "react-icons/fi";
import { readCrawlFromHash, crawlFingerprint } from "../utils/crawlLink";
import { analytics } from "../utils/analytics";
import "../styles/CrawlList.css";

/** Where they got to, per crawl, on this device. localStorage throws in
 *  private-mode Safari and iOS is the majority platform here, so every access
 *  is wrapped and a failure just means the page opens at stop one. */
const progressKey = (fingerprint: string) => `bh_crawl_progress_${fingerprint}`;

const readProgress = (fingerprint: string): number => {
  try {
    const raw = localStorage.getItem(progressKey(fingerprint));
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

const writeProgress = (fingerprint: string, index: number): void => {
  try {
    localStorage.setItem(progressKey(fingerprint), String(index));
  } catch {
    /* nothing else we can do — the crawl on screen is unaffected */
  }
};

const directionsUrl = (lng: number, lat: number): string =>
  `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${lat},${lng}`;

const CrawlList: React.FC = () => {
  const location = useLocation();

  // The payload lives in the fragment, which react-router does not parse, so
  // read it off the hash directly. Recomputed only when the hash changes.
  const { crawl, fingerprint } = useMemo(() => {
    const hash = location.hash || window.location.hash;
    const payload = hash.startsWith("#") ? hash.slice(1) : hash;
    return {
      crawl: readCrawlFromHash(hash),
      fingerprint: payload ? crawlFingerprint(payload) : "",
    };
  }, [location.hash]);

  const [index, setIndex] = useState(0);

  // Restore their place when the crawl resolves. Clamped: a link that was
  // re-shared with fewer stops must not leave the page pointing past the end.
  useEffect(() => {
    if (!crawl || !fingerprint) return;
    setIndex(Math.min(readProgress(fingerprint), crawl.stops.length - 1));
  }, [crawl, fingerprint]);

  // The loop measurement. Fires for a broken link too — a link that arrives
  // mangled is a real failure and needs to be visible, not silently absent.
  useEffect(() => {
    analytics.sharedLinkOpened(crawl?.stops.length ?? 0, !!crawl);
  }, [crawl]);

  const total = crawl?.stops.length ?? 0;
  const isLast = index >= total - 1;

  const goTo = useCallback(
    (next: number) => {
      if (!crawl) return;
      const clamped = Math.max(0, Math.min(next, crawl.stops.length - 1));
      setIndex(clamped);
      writeProgress(fingerprint, clamped);
      analytics.listAdvanced(clamped, crawl.stops.length);
      if (clamped === crawl.stops.length - 1) {
        analytics.listCompleted(crawl.stops.length);
      }
      // A thumb on "Next" should not leave the previous stop on screen.
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [crawl, fingerprint]
  );

  const restart = useCallback(() => {
    setIndex(0);
    writeProgress(fingerprint, 0);
  }, [fingerprint]);

  if (!crawl) return <BrokenLink />;

  const stop = crawl.stops[index];

  return (
    <div className="crawl-list">
      <header className="crawl-list-header">
        <Link to="/" className="crawl-list-brand" aria-label="BarHop home">
          BarHop
        </Link>
        {crawl.name && <p className="crawl-list-name">{crawl.name}</p>}
      </header>

      <div
        className="crawl-list-progress"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Stop ${index + 1} of ${total}`}
      >
        {crawl.stops.map((s, i) => (
          <span
            key={`${s.name}-${i}`}
            className={`crawl-list-pip ${i < index ? "is-done" : ""} ${
              i === index ? "is-current" : ""
            }`}
          />
        ))}
      </div>

      <main className="crawl-list-current">
        <p className="crawl-list-eyebrow">
          Stop {index + 1} of {total}
        </p>
        {/* The whole point of the page: the name, as big as it will go. */}
        <h1 className="crawl-list-stop-name">{stop.name}</h1>
        {stop.address && (
          <p className="crawl-list-address">
            <FiMapPin size={15} aria-hidden="true" />
            {stop.address}
          </p>
        )}

        <div className="crawl-list-actions">
          <a
            className="btn btn--secondary btn--lg"
            href={directionsUrl(stop.lng, stop.lat)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FiNavigation size={17} aria-hidden="true" />
            Directions
          </a>
          {isLast ? (
            <button type="button" className="btn btn--ghost btn--lg" onClick={restart}>
              <FiRotateCcw size={17} aria-hidden="true" />
              Start over
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => goTo(index + 1)}
            >
              Next bar
            </button>
          )}
        </div>

        {isLast && (
          <p className="crawl-list-finished">
            <FiCheck size={16} aria-hidden="true" />
            That’s the last stop. Get home safe 🍻
          </p>
        )}
      </main>

      <section className="crawl-list-rest" aria-label="All stops">
        <h2 className="crawl-list-rest-title">The whole night</h2>
        <ol className="crawl-list-all">
          {crawl.stops.map((s, i) => (
            <li
              key={`${s.name}-all-${i}`}
              className={`crawl-list-row ${i < index ? "is-done" : ""} ${
                i === index ? "is-current" : ""
              }`}
            >
              <button type="button" onClick={() => goTo(i)}>
                <span className="crawl-list-row-num">
                  {i < index ? <FiCheck size={14} aria-hidden="true" /> : i + 1}
                </span>
                <span className="crawl-list-row-text">
                  <span className="crawl-list-row-name">{s.name}</span>
                  {s.address && (
                    <span className="crawl-list-row-address">{s.address}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* The loop's return path: a recipient with no account gets an obvious,
          low-pressure way to become the next planner. */}
      <footer className="crawl-list-footer">
        <p>Someone planned this with BarHop.</p>
        <Link to="/home" className="btn btn--secondary">
          Plan your own crawl
        </Link>
      </footer>
    </div>
  );
};

const BrokenLink: React.FC = () => (
  <div className="crawl-list crawl-list--empty">
    <header className="crawl-list-header">
      <Link to="/" className="crawl-list-brand">
        BarHop
      </Link>
    </header>
    <main className="crawl-list-current">
      <h1 className="crawl-list-stop-name">This link didn’t open</h1>
      <p className="crawl-list-address">
        It may have been cut short when it was copied — links are long, and some
        apps trim them. Ask whoever sent it to share it again.
      </p>
      <div className="crawl-list-actions">
        <Link to="/home" className="btn btn--primary btn--lg">
          <FiArrowLeft size={17} aria-hidden="true" />
          Plan a crawl instead
        </Link>
      </div>
    </main>
  </div>
);

export default CrawlList;
