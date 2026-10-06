// src/pages/OrgPage.tsx
//
// An organizer's branded page: /o/<slug>. Built for self-guided crawls like
// Denver Pub Crawl's, where many separate groups do the same route on their
// own schedule rather than one big group moving together.
//
// The page has one job: get a group leader from "the organizer sent me this"
// to a live crawl with an invite link for their friends, in as few taps as
// possible. So a group leader does NOT need an account: an anonymous user is
// minted on arrival (the crawls are Firestore reads, and starting a session
// needs a uid), and all they are asked for is a name for the squad list. The
// group's attendees then join through the usual /live?join= invite.
//
// Starting from here gives each group its OWN session, tagged with the org's
// slug, so twenty groups on the same night never share one document.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FiExternalLink, FiMap, FiPlay } from "react-icons/fi";
import { useAuth } from "../context/useAuth";
import { useGuestName } from "../hooks/useGuestName";
import GuestNameForm from "../components/GuestNameForm";
import PageTransition from "../components/motion/PageTransition";
import { toast } from "../components/Toaster";
import { getOrg, getOrgCrawls, type Org } from "../services/orgService";
import { createSession, getActiveSessionForUser } from "../services/sessionService";
import type { SavedBarCrawl } from "../services/crawlService";
import { brandStyle, isValidOrgSlug } from "../utils/orgBranding";
import { orgSessionInput } from "../utils/orgCrawl";
import { analytics } from "../utils/analytics";
import "../styles/OrgPage.css";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; org: Org; crawls: SavedBarCrawl[] };

const orderedBars = (crawl: SavedBarCrawl) =>
  [...crawl.bars].sort((a, b) => a.order - b.order);

const crawlMeta = (crawl: SavedBarCrawl): string => {
  const parts = [`${crawl.bars.length} bars`];
  const miles = crawl.route?.totalDistance;
  if (typeof miles === "number" && miles > 0) {
    parts.push(`${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi walk`);
  }
  return parts.join(" · ");
};

/** Only http(s) links from the org doc ever become an href. */
const safeUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

const OrgPage: React.FC = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isGuest, loading: authLoading, ensureGuest } = useAuth();
  const [guestName, saveGuestName] = useGuestName();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // The crawl a leader asked to start. Also seeded from ?start=<crawlId>, so
  // a link can open straight into starting a given crawl.
  const [pendingStart, setPendingStart] = useState<string | null>(
    () => searchParams.get("start")
  );
  const [starting, setStarting] = useState(false);
  const startInFlight = useRef(false);

  const validSlug = isValidOrgSlug(slug);

  // Reads need a uid (firestore.rules), and so does starting a session.
  // Never mint while auth is still restoring a returning user's session.
  useEffect(() => {
    if (authLoading || user || !validSlug) return;
    void ensureGuest();
  }, [authLoading, user, validSlug, ensureGuest]);

  useEffect(() => {
    if (!validSlug) {
      setState({ status: "missing" });
      return;
    }
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const org = await getOrg(slug);
        if (cancelled) return;
        if (!org) {
          setState({ status: "missing" });
          return;
        }
        const crawls = await getOrgCrawls(org);
        if (cancelled) return;
        setState({ status: "ready", org, crawls });
        analytics.orgPageOpened(org.slug, crawls.length);
      } catch (error) {
        console.error("❌ Error loading org page:", error);
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [validSlug, slug, user]);

  const pendingCrawl = useMemo(
    () =>
      state.status === "ready" && pendingStart
        ? state.crawls.find((c) => c.id === pendingStart) ?? null
        : null,
    [state, pendingStart]
  );

  // A ?start= for a crawl this org doesn't list (removed, mistyped) is dropped
  // rather than left hanging.
  useEffect(() => {
    if (state.status === "ready" && pendingStart && !pendingCrawl) {
      setPendingStart(null);
    }
  }, [state.status, pendingStart, pendingCrawl]);

  const needsName = !!pendingCrawl && isGuest && !guestName;

  const clearStartParam = useCallback(() => {
    if (!searchParams.has("start")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("start");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const startCrawl = useCallback(
    async (crawl: SavedBarCrawl) => {
      if (!user || state.status !== "ready" || startInFlight.current) return;
      startInFlight.current = true;
      setStarting(true);
      try {
        // Re-opening the page mid-crawl resumes the group's session instead of
        // forking a second one their friends aren't in.
        const existing = await getActiveSessionForUser(user.uid);
        if (existing?.id && existing.crawlId === crawl.id) {
          toast.success("Resuming your group's crawl");
          navigate("/live", { state: { sessionId: existing.id } });
          return;
        }
        const displayName =
          user.displayName ??
          (isGuest ? guestName : null) ??
          user.email?.split("@")[0] ??
          null;
        const sessionId = await createSession(
          orgSessionInput(crawl, { uid: user.uid, displayName }, state.org.slug)
        );
        analytics.orgCrawlStarted(state.org.slug, crawl.bars.length, isGuest);
        toast.success("You're live! Tap Invite to bring your group 🍻");
        navigate("/live", { state: { sessionId } });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't start the crawl");
        setPendingStart(null);
        clearStartParam();
      } finally {
        startInFlight.current = false;
        setStarting(false);
      }
    },
    [user, state, isGuest, guestName, navigate, clearStartParam]
  );

  // Once the crawl is known and the leader has a name, go.
  useEffect(() => {
    if (!pendingCrawl || needsName || !user) return;
    void startCrawl(pendingCrawl);
  }, [pendingCrawl, needsName, user, startCrawl]);

  const style = state.status === "ready" ? brandStyle(state.org.accent) : {};

  if (needsName && pendingCrawl) {
    return (
      <PageTransition>
        <div className="guest-name-page org-page-name" style={style}>
          <GuestNameForm
            title="Start your group's crawl"
            subtitle={`${pendingCrawl.name}. You'll get a link to bring your group along.`}
            cta="Start the crawl"
            onSubmit={saveGuestName}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setPendingStart(null);
              clearStartParam();
            }}
          >
            Back
          </button>
        </div>
      </PageTransition>
    );
  }

  if (state.status === "loading" || (pendingCrawl && starting)) {
    return (
      <div className="org-page org-page--center" style={style}>
        <p className="org-page-muted">
          {pendingCrawl ? "Starting your crawl…" : "Loading…"}
        </p>
      </div>
    );
  }

  if (state.status !== "ready") {
    return (
      <div className="org-page org-page--center">
        <h1 className="org-page-title">
          {state.status === "missing" ? "We couldn't find this page" : "This page didn't load"}
        </h1>
        <p className="org-page-muted">
          {state.status === "missing"
            ? "Check the link with whoever sent it to you."
            : "Check your connection and try again."}
        </p>
        <Link to="/home" className="btn btn--secondary">
          Plan your own crawl
        </Link>
      </div>
    );
  }

  const { org, crawls } = state;
  const logo = safeUrl(org.logoUrl);
  const website = safeUrl(org.website);

  return (
    <PageTransition>
      <div className="org-page" style={style}>
        <header className="org-page-header">
          {logo ? (
            <img className="org-page-logo" src={logo} alt={org.name} />
          ) : (
            <h1 className="org-page-title">{org.name}</h1>
          )}
          {org.tagline && <p className="org-page-tagline">{org.tagline}</p>}
        </header>

        <ol className="org-page-steps" aria-label="How it works">
          <li>
            <span className="org-page-step-num">1</span>
            <span>
              Pick your crawl and tap <strong>Start</strong>. No account or app needed.
            </span>
          </li>
          <li>
            <span className="org-page-step-num">2</span>
            <span>Send the invite link to your group.</span>
          </li>
          <li>
            <span className="org-page-step-num">3</span>
            <span>Check in at each bar and see where everyone is.</span>
          </li>
        </ol>

        {crawls.length === 0 ? (
          <p className="org-page-muted">No crawls are posted yet. Check back soon.</p>
        ) : (
          <section className="org-page-crawls">
            {crawls.map((crawl) => (
              <article key={crawl.id} className="org-crawl">
                <h2 className="org-crawl-name">{crawl.name}</h2>
                <p className="org-crawl-meta">{crawlMeta(crawl)}</p>
                {crawl.description && (
                  <p className="org-crawl-description">{crawl.description}</p>
                )}
                <ol className="org-crawl-stops">
                  {orderedBars(crawl).map((bar, i) => (
                    <li key={bar.id}>
                      <span className="org-crawl-stop-num">{i + 1}</span>
                      {bar.name}
                    </li>
                  ))}
                </ol>
                <div className="org-crawl-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={starting}
                    onClick={() => setPendingStart(crawl.id ?? null)}
                  >
                    <FiPlay size={17} aria-hidden="true" />
                    Start our group's crawl
                  </button>
                  <Link
                    to={`/o/${org.slug}/map/${encodeURIComponent(crawl.id ?? "")}`}
                    className="btn btn--ghost btn--lg"
                  >
                    <FiMap size={17} aria-hidden="true" />
                    See the map
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}

        <footer className="org-page-footer">
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer">
              {org.name} <FiExternalLink size={13} aria-hidden="true" />
            </a>
          )}
          <p>
            Crawl app by <Link to="/">BarHop</Link>
          </p>
        </footer>
      </div>
    </PageTransition>
  );
};

export default OrgPage;
