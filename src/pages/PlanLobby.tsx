// src/pages/PlanLobby.tsx
//
// "Plan it together" lobby: host gathers candidate bars, friends RSVP + vote,
// host locks it (→ a live crawlSession everyone joins). Firestore snapshot is
// the single source of truth (subscribeToPlan), like LiveCrawl.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { FaArrowLeft, FaLock, FaThumbsUp } from "react-icons/fa";
import { FiUserPlus, FiCheck } from "react-icons/fi";
import { MapContainer } from "../components/MapContainer";
import PageTransition from "../components/motion/PageTransition";
import { springPanel, staggerContainer, staggerItem } from "../components/motion/variants";
import { useAuth } from "../context/useAuth";
import { toast } from "../components/Toaster";
import {
  subscribeToPlan,
  rsvpToPlan,
  toggleVote,
  tallyVotes,
  lockPlan,
  type CrawlPlan,
} from "../services/planService";
import { analytics } from "../utils/analytics";
import type { AppBat } from "./Home";
import "../styles/Plan.css";

const initialOf = (name: string | null): string =>
  (name?.trim()?.[0] ?? "?").toUpperCase();

const PlanLobby: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const planId = useMemo(
    () =>
      new URLSearchParams(location.search).get("id") ??
      (location.state as { planId?: string } | null)?.planId ??
      null,
    [location.search, location.state]
  );

  const [plan, setPlan] = useState<CrawlPlan | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);

  const myDisplayName = useMemo(
    () => user?.displayName ?? user?.email?.split("@")[0] ?? null,
    [user]
  );

  // ----- Subscribe (snapshot is the source of truth) -----
  useEffect(() => {
    if (!planId) {
      toast.error("No plan to show — start one from the Route page");
      navigate("/home");
      return;
    }
    const unsub = subscribeToPlan(
      planId,
      (snap) => {
        if (!snap) {
          toast.error("Plan not found");
          navigate("/home");
          return;
        }
        setPlan(snap);
        setHydrating(false);
      },
      () => {
        toast.error("Lost connection to the plan");
        navigate("/home");
      }
    );
    return unsub;
  }, [planId, navigate]);

  // ----- When the host locks it, everyone hops into the live crawl -----
  useEffect(() => {
    if (plan?.status === "locked" && plan.sessionId) {
      navigate(`/live?join=${plan.sessionId}`);
    }
  }, [plan?.status, plan?.sessionId, navigate]);

  const isAttendee = !!user && !!plan?.attendeeUids?.includes(user.uid);
  const isHost = !!user && plan?.hostUid === user.uid;

  const attendees = useMemo(() => {
    if (!plan) return [];
    return Object.entries(plan.attendees ?? {}).map(([uid, a]) => ({
      uid,
      displayName: a.displayName,
      isHost: uid === plan.hostUid,
      isSelf: uid === user?.uid,
    }));
  }, [plan, user]);

  const candidatesAsBars: AppBat[] = useMemo(
    () =>
      (plan?.candidates ?? []).map((c) => ({
        id: c.barId,
        name: c.name,
        rating: c.rating,
        distance: 0,
        location: { type: "Point" as const, coordinates: c.coordinates },
      })),
    [plan]
  );
  const allCandidateIds = useMemo(
    () => new Set((plan?.candidates ?? []).map((c) => c.barId)),
    [plan]
  );

  // Candidates sorted by current vote tally (desc) for the list display
  const rankedCandidates = useMemo(() => {
    if (!plan) return [];
    return [...plan.candidates]
      .map((c) => ({ ...c, votes: tallyVotes(plan.votes, c.barId) }))
      .sort((a, b) => b.votes - a.votes);
  }, [plan]);

  const handleRsvp = useCallback(async () => {
    if (!plan || !user || busy) return;
    setBusy(true);
    try {
      await rsvpToPlan(plan.id!, user.uid, myDisplayName);
      analytics.planRsvp();
      toast.success("You're in! 🍻 Vote for where to go");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't RSVP");
    } finally {
      setBusy(false);
    }
  }, [plan, user, busy, myDisplayName]);

  const handleVote = useCallback(
    async (barId: string) => {
      if (!plan || !user || !isAttendee) return;
      const voted = plan.votes?.[barId]?.[user.uid] === true;
      try {
        await toggleVote(plan.id!, barId, user.uid, !voted);
        if (!voted) analytics.planVote();
      } catch {
        toast.error("Couldn't record your vote");
      }
    },
    [plan, user, isAttendee]
  );

  const handleInvite = useCallback(async () => {
    if (!plan?.id) return;
    const url = `${window.location.origin}/plan?id=${plan.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join my crawl plan: ${plan.title}`,
          text: "Help pick the bars and come crawl with me:",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Plan link copied — send it to your friends!");
      }
    } catch {
      /* dismissed — non-fatal */
    }
  }, [plan]);

  const handleLock = useCallback(async () => {
    if (!plan || !isHost || busy) return;
    if (plan.candidates.length === 0) {
      toast.error("Add some bars before locking the plan");
      return;
    }
    setBusy(true);
    try {
      analytics.planLocked(plan.attendeeUids.length, plan.candidates.length);
      await lockPlan(plan, myDisplayName);
      // The subscription flips to locked → the effect routes everyone to /live
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't lock");
      setBusy(false);
    }
  }, [plan, isHost, busy, myDisplayName]);

  if (hydrating || !plan) {
    return (
      <PageTransition>
        <div className="plan-page plan-page--loading">
          <div className="plan-loading-spinner" />
          <p>Loading the plan…</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="plan-page">
        <div className="plan-header">
          <button className="back-button" onClick={() => navigate("/home")}>
            <FaArrowLeft /> <span>Home</span>
          </button>
          <h1 className="plan-title">{plan.title}</h1>
          <span className="plan-count-chip">
            {attendees.length} {attendees.length === 1 ? "person" : "people"}
          </span>
        </div>

        <div className="plan-content">
          <div className="plan-map">
            <MapContainer
              center={plan.route.startCoordinates}
              radius={0}
              bars={candidatesAsBars}
              selectedBarIds={allCandidateIds}
              hoveredBarId={hoveredBarId}
              onToggleBar={() => {}}
              onHoverBar={setHoveredBarId}
              onMapViewChange={() => {}}
              onDrawComplete={() => {}}
              startCoordinates={plan.route.startCoordinates}
              endCoordinates={plan.route.endCoordinates}
            />
          </div>

          <motion.div
            className="plan-panel"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springPanel}
          >
            {/* Attendees + invite */}
            <div className="plan-presence">
              <div className="plan-presence-people">
                <div className="plan-avatar-stack">
                  {attendees.slice(0, 6).map((a) => (
                    <span
                      key={a.uid}
                      className={`plan-avatar ${a.isSelf ? "is-self" : ""} ${a.isHost ? "is-host" : ""}`}
                      title={
                        (a.displayName || "Friend") +
                        (a.isHost ? " (host)" : "") +
                        (a.isSelf ? " — you" : "")
                      }
                    >
                      {initialOf(a.displayName)}
                    </span>
                  ))}
                  {attendees.length > 6 && (
                    <span className="plan-avatar is-more">+{attendees.length - 6}</span>
                  )}
                </div>
                <span className="plan-presence-label">
                  {attendees.length > 1 ? "in so far" : "Invite your crew →"}
                </span>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={handleInvite}>
                <FiUserPlus /> Invite
              </button>
            </div>

            {/* RSVP gate for non-attendees */}
            {!isAttendee && (
              <div className="plan-rsvp-card">
                <span className="plan-rsvp-eyebrow">You're invited</span>
                <h2 className="plan-rsvp-name">{plan.hostName || "A friend"} wants you on this crawl</h2>
                <button
                  className="btn btn--primary btn--full"
                  onClick={handleRsvp}
                  disabled={busy}
                >
                  <FaThumbsUp /> I'm in 🍻
                </button>
              </div>
            )}

            {/* Vote list */}
            <span className="plan-section-label">
              {isAttendee ? "Vote for the stops" : "On the shortlist"}
            </span>
            <motion.div
              className="plan-vote-list"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {rankedCandidates.map((c) => {
                const myVote = !!user && plan.votes?.[c.barId]?.[user.uid] === true;
                return (
                  <motion.div
                    key={c.barId}
                    variants={staggerItem}
                    className="plan-vote-item"
                    onMouseEnter={() => setHoveredBarId(c.barId)}
                    onMouseLeave={() => setHoveredBarId(null)}
                  >
                    <div className="plan-vote-details">
                      <span className="plan-vote-name">{c.name}</span>
                      {c.rating > 0 && (
                        <span className="plan-vote-rating">★ {c.rating.toFixed(1)}</span>
                      )}
                    </div>
                    <button
                      className={`plan-vote-btn ${myVote ? "is-voted" : ""}`}
                      onClick={() => handleVote(c.barId)}
                      disabled={!isAttendee}
                      aria-pressed={myVote}
                      aria-label={`Vote for ${c.name}`}
                    >
                      <FaThumbsUp />
                      <span className="plan-vote-count">{c.votes}</span>
                    </button>
                  </motion.div>
                );
              })}
            </motion.div>

            <div className="plan-panel-footer">
              {isHost ? (
                <button
                  className="btn btn--primary btn--full"
                  onClick={handleLock}
                  disabled={busy || plan.candidates.length === 0}
                >
                  <FaLock /> Lock it in & start
                </button>
              ) : isAttendee ? (
                <div className="plan-waiting">
                  <FiCheck /> You're in — waiting for {plan.hostName || "the host"} to start
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
};

export default PlanLobby;
