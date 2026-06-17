// src/pages/LiveCrawl.tsx
//
// Live Crawl Mode — the night-out companion. Subscribes to the active
// crawl session (single source of truth: Firestore snapshot), tracks the
// user's position, auto checks in at stops via geofence, and renders the
// recap when the session completes.

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import party from "party-js";
import {
  FaArrowLeft,
  FaCheck,
  FaMapMarkerAlt,
  FaFlagCheckered,
} from "react-icons/fa";
import {
  FiClock,
  FiFastForward,
  FiCheckCircle,
  FiUserPlus,
} from "react-icons/fi";
import { MapContainer } from "../components/MapContainer";
import { CrawlRecap } from "../components/CrawlRecap";
import PageTransition from "../components/motion/PageTransition";
import {
  springPanel,
  modalOverlay,
  modalPanel,
  staggerContainer,
  staggerItem,
} from "../components/motion/variants";
import { useAuth } from "../context/useAuth";
import { useLiveTracking } from "../hooks/useLiveTracking";
import { toast } from "../components/Toaster";
import {
  getActiveSessionForMember,
  subscribeToSession,
  joinSession,
  updateMemberPosition,
  checkInStop,
  skipStop,
  updateWalkedMiles,
  finishSession,
  abandonSession,
  type CrawlSession,
  type SessionStop,
  type CheckInMethod,
  type SessionStats,
} from "../services/sessionService";
import type { FriendPosition } from "../components/MapContainer";
import { analytics } from "../utils/analytics";
import type { AppBat } from "./Home";
import "../styles/LiveCrawl.css";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

/** Friend dots older than this are treated as stale and hidden */
const FRIEND_STALE_MS = 10 * 60 * 1000;
/** Throttle for publishing the user's own position */
const POSITION_PUBLISH_MS = 12000;

// Convert a Firestore Timestamp | Date to epoch ms (null while a
// serverTimestamp() is pending in a latency-compensated snapshot).
const tsToMillis = (at: unknown): number | null => {
  if (!at) return null;
  if (at instanceof Date) return at.getTime();
  const toDate = (at as { toDate?: () => Date }).toDate;
  return typeof toDate === "function" ? toDate.call(at).getTime() : null;
};

// First initial for a friend avatar.
const initialOf = (name: string | null): string =>
  (name?.trim()?.[0] ?? "?").toUpperCase();

// Format a Firestore Timestamp | Date check-in time as e.g. "9:42 PM".
// serverTimestamp() is briefly null in latency-compensated snapshots.
const formatCheckInTime = (at: unknown): string => {
  if (!at) return "";
  const date =
    at instanceof Date
      ? at
      : typeof (at as { toDate?: () => Date }).toDate === "function"
        ? (at as { toDate: () => Date }).toDate()
        : null;
  if (!date) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const LiveCrawl: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [sessionId, setSessionId] = useState<string | null>(
    (location.state as { sessionId?: string } | null)?.sessionId ?? null
  );
  const [session, setSession] = useState<CrawlSession | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinHandled, setJoinHandled] = useState(false);

  // Friend's "join my crawl" link → /live?join=<sessionId>
  const joinId = useMemo(
    () => new URLSearchParams(location.search).get("join"),
    [location.search]
  );

  const myDisplayName = useMemo(
    () => user?.displayName ?? user?.email?.split("@")[0] ?? null,
    [user]
  );
  const [routeGeometry, setRouteGeometry] =
    useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // Walked-miles accumulator: seeded from the first snapshot, fed by GPS
  // deltas, flushed on a throttle + at check-in/finish
  const walkedTotalRef = useRef<number | null>(null);
  const heroCardRef = useRef<HTMLDivElement | null>(null);
  const deniedToastShown = useRef(false);

  // ----- Join: a shared ?join=<id> link adds the caller as a member -----
  useEffect(() => {
    if (!joinId || !user || joinHandled) return;
    let cancelled = false;
    setJoining(true);
    (async () => {
      try {
        await joinSession(joinId, user.uid, myDisplayName);
        if (cancelled) return;
        setSessionId(joinId);
        analytics.crawlJoined();
        toast.success("You're in! 🎉 Welcome to the crawl");
      } catch (error) {
        if (cancelled) return;
        toast.error(
          error instanceof Error ? error.message : "Couldn't join the crawl"
        );
        navigate("/home");
      } finally {
        if (!cancelled) {
          setJoinHandled(true);
          setJoining(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinId, user, joinHandled, myDisplayName, navigate]);

  // ----- Hydrate: state sessionId → else the user's active session -----
  // Skip while a join is pending (the join effect sets the sessionId).
  useEffect(() => {
    if (sessionId || !user || joinId) return;
    let cancelled = false;
    (async () => {
      const active = await getActiveSessionForMember(user.uid);
      if (cancelled) return;
      if (active?.id) {
        setSessionId(active.id);
      } else {
        toast.error("No active crawl — start one from the Route page");
        navigate("/home");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, user, joinId, navigate]);

  // ----- Subscribe: Firestore snapshot is the single source of truth -----
  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = subscribeToSession(
      sessionId,
      (snapshot) => {
        if (!snapshot) {
          toast.error("Crawl session not found");
          navigate("/home");
          return;
        }
        if (walkedTotalRef.current === null) {
          walkedTotalRef.current = snapshot.walkedMiles ?? 0;
        }
        setSession(snapshot);
        setHydrating(false);
      },
      () => {
        toast.error("Lost connection to the crawl session");
        navigate("/home");
      }
    );
    return unsubscribe;
  }, [sessionId, navigate]);

  // ----- Derived state -----
  const orderedStops = useMemo(
    () =>
      session ? [...session.stops].sort((a, b) => a.order - b.order) : [],
    [session]
  );

  const currentStop: SessionStop | undefined = useMemo(
    () => orderedStops.find((s) => !session?.checkIns?.[s.barId]),
    [orderedStops, session]
  );

  const stopsHit = useMemo(
    () =>
      session
        ? Object.values(session.checkIns ?? {}).filter((c) => !c.skipped)
            .length
        : 0,
    [session]
  );

  const isActive = session?.status === "active";

  // Stops rendered as numbered amber circles on the map. Set insertion
  // order drives the numbering, so build it from the ordered stops.
  const stopsAsBars: AppBat[] = useMemo(
    () =>
      orderedStops.map((s) => ({
        id: s.barId,
        name: s.name,
        rating: s.rating,
        distance: 0,
        location: { type: "Point" as const, coordinates: s.coordinates },
      })),
    [orderedStops]
  );
  const allStopIds = useMemo(
    () => new Set(orderedStops.map((s) => s.barId)),
    [orderedStops]
  );
  // Checked-in (non-skipped) stops render as green circles on the map
  const visitedBarIds = useMemo(
    () =>
      new Set(
        Object.values(session?.checkIns ?? {})
          .filter((c) => !c.skipped)
          .map((c) => c.barId)
      ),
    [session]
  );

  // ----- One Directions call for the planned polyline -----
  useEffect(() => {
    if (!session || routeGeometry || orderedStops.length < 2) return;
    const { startCoordinates, endCoordinates } = session.route;
    const coords: string[] = [startCoordinates.join(",")];
    orderedStops.forEach((s) => coords.push(s.coordinates.join(",")));
    if (
      endCoordinates &&
      (startCoordinates[0] !== endCoordinates[0] ||
        startCoordinates[1] !== endCoordinates[1])
    ) {
      coords.push(endCoordinates.join(","));
    }
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords.join(
      ";"
    )}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;

    (async () => {
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes?.length > 0) {
          setRouteGeometry(
            data.routes[0].geometry as GeoJSON.Feature<GeoJSON.LineString>
          );
        }
      } catch (error) {
        console.error("Error fetching live route line:", error);
      }
    })();
  }, [session, routeGeometry, orderedStops]);

  // ----- Check-in / skip / finish -----
  const nextIndexAfter = useCallback(
    (barId: string): number => {
      const remaining = orderedStops.filter(
        (s) => s.barId !== barId && !session?.checkIns?.[s.barId]
      );
      return remaining.length > 0 ? remaining[0].order : orderedStops.length;
    },
    [orderedStops, session]
  );

  const flushWalkedMiles = useCallback(() => {
    if (sessionId && walkedTotalRef.current !== null) {
      updateWalkedMiles(sessionId, walkedTotalRef.current);
    }
  }, [sessionId]);

  const handleCheckIn = useCallback(
    async (method: CheckInMethod) => {
      if (!session || !sessionId || !currentStop || busy) return;
      if (session.checkIns?.[currentStop.barId]) return; // idempotent
      setBusy(true);
      try {
        await checkInStop(
          sessionId,
          currentStop.barId,
          method,
          nextIndexAfter(currentStop.barId),
          user ? { uid: user.uid, displayName: myDisplayName } : undefined
        );
        flushWalkedMiles();
        toast.success(`Checked in at ${currentStop.name}! 🍻`);
        if (heroCardRef.current) {
          party.confetti(heroCardRef.current, { count: 40 });
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Check-in failed"
        );
      } finally {
        setBusy(false);
      }
    },
    [
      session,
      sessionId,
      currentStop,
      busy,
      nextIndexAfter,
      flushWalkedMiles,
      user,
      myDisplayName,
    ]
  );

  const handleSkip = useCallback(async () => {
    if (!session || !sessionId || !currentStop || busy) return;
    setBusy(true);
    try {
      await skipStop(
        sessionId,
        currentStop.barId,
        nextIndexAfter(currentStop.barId),
        user ? { uid: user.uid, displayName: myDisplayName } : undefined
      );
      toast.success(`Skipped ${currentStop.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Skip failed");
    } finally {
      setBusy(false);
    }
  }, [session, sessionId, currentStop, busy, nextIndexAfter, user, myDisplayName]);

  const computeStats = useCallback((): SessionStats => {
    const total = orderedStops.length;
    let miles = walkedTotalRef.current ?? session?.walkedMiles ?? 0;
    // Tracking denied/empty: approximate from the planned route distance
    if (miles === 0 && stopsHit > 0 && session?.route.plannedDistanceMiles) {
      miles = session.route.plannedDistanceMiles * (stopsHit / total);
    }
    const startedAtMs =
      session?.startedAt instanceof Date
        ? session.startedAt.getTime()
        : ((session?.startedAt as { toDate?: () => Date })?.toDate?.() ??
            new Date()).getTime();
    return {
      stopsHit,
      stopsTotal: total,
      milesWalked: Math.round(miles * 10) / 10,
      durationMin: Math.max(1, Math.round((Date.now() - startedAtMs) / 60000)),
    };
  }, [orderedStops, session, stopsHit]);

  const handleFinish = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await finishSession(sessionId, computeStats());
      analytics.crawlCompleted(stopsHit, orderedStops.length);
      setShowEndModal(false);
      // Snapshot flips status → recap renders
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Finish failed");
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, computeStats, stopsHit, orderedStops]);

  const handleAbandon = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await abandonSession(sessionId);
      navigate("/home");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't end");
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, navigate]);

  // ----- Live tracking -----
  const tracking = useLiveTracking({
    enabled: isActive,
    target: currentStop?.coordinates ?? null,
    targetKey: currentStop?.barId ?? null,
    onArrive: handleCheckIn,
    onDistanceWalked: (delta) => {
      if (walkedTotalRef.current !== null) {
        walkedTotalRef.current += delta;
      }
    },
  });

  useEffect(() => {
    if (tracking.permissionDenied && !deniedToastShown.current) {
      deniedToastShown.current = true;
      toast.error("Location unavailable — use the “I'm here” button to check in");
    }
  }, [tracking.permissionDenied]);

  // Periodic walked-miles flush while active
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(flushWalkedMiles, 60000);
    return () => clearInterval(interval);
  }, [isActive, flushWalkedMiles]);

  // ----- Group presence: publish my position, render friends' dots -----
  const lastPositionPublishRef = useRef(0);
  useEffect(() => {
    if (!isActive || !sessionId || !user || !tracking.coords) return;
    const now = Date.now();
    if (now - lastPositionPublishRef.current < POSITION_PUBLISH_MS) return;
    lastPositionPublishRef.current = now;
    updateMemberPosition(
      sessionId,
      user.uid,
      tracking.coords[0],
      tracking.coords[1]
    );
  }, [tracking.coords, isActive, sessionId, user]);

  // Members of this crawl (host first, me flagged) for the presence row
  const members = useMemo(() => {
    if (!session) return [];
    return Object.entries(session.members ?? {})
      .map(([uid, m]) => ({
        uid,
        displayName: m.displayName,
        isHost: uid === session.hostUid,
        isSelf: uid === user?.uid,
      }))
      .sort((a, b) => (a.isHost ? -1 : 0) - (b.isHost ? -1 : 0));
  }, [session, user]);

  // Friends' live dots (exclude me + stale fixes)
  const friendPositions: FriendPosition[] = useMemo(() => {
    if (!session || !user) return [];
    const now = Date.now();
    return Object.entries(session.members ?? {})
      .filter(([uid, m]) => {
        if (uid === user.uid || !m.lastPosition) return false;
        const at = tsToMillis(m.lastPosition.at);
        return at === null || now - at < FRIEND_STALE_MS;
      })
      .map(([uid, m]) => ({
        uid,
        displayName: m.displayName,
        lng: m.lastPosition!.lng,
        lat: m.lastPosition!.lat,
      }));
  }, [session, user]);

  const handleInvite = useCallback(async () => {
    if (!sessionId) return;
    const url = `${window.location.origin}/live?join=${sessionId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join my BarHop crawl",
          text: "Come crawl with me — tap to join and share your live location:",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Invite link copied — share it with your friends!");
      }
      analytics.inviteSent();
    } catch {
      // Share sheet dismissed or clipboard blocked — non-fatal
    }
  }, [sessionId]);

  // ----- Render -----
  if (hydrating || !session) {
    return (
      <PageTransition>
        <div className="live-page live-page--loading">
          <div className="live-loading-spinner" />
          <p>{joining ? "Joining the crawl…" : "Finding your crawl…"}</p>
        </div>
      </PageTransition>
    );
  }

  if (session.status === "completed") {
    return (
      <CrawlRecap
        session={session}
        onDone={() => navigate("/home")}
      />
    );
  }

  if (session.status === "abandoned") {
    navigate("/home");
    return null;
  }

  const showLiveStats =
    tracking.isWatching && tracking.distanceToTargetMiles !== null;
  const allResolved = !currentStop;

  return (
    <PageTransition>
      <div className="live-page">
        <div className="live-header">
          <button
            className="back-button"
            onClick={() => {
              toast.success("Crawl still running — resume from Home");
              navigate("/home");
            }}
          >
            <FaArrowLeft /> <span>Leave</span>
          </button>
          <h1 className="live-title">
            {session.crawlName || "Live Crawl"}
          </h1>
          <span className="live-count-chip">
            {stopsHit}/{orderedStops.length} stops
          </span>
        </div>

        <div className="live-content">
          <div className="live-map">
            <MapContainer
              center={session.route.startCoordinates}
              radius={0}
              bars={stopsAsBars}
              selectedBarIds={allStopIds}
              hoveredBarId={hoveredBarId}
              onToggleBar={() => {}}
              onHoverBar={setHoveredBarId}
              onMapViewChange={() => {}}
              onDrawComplete={() => {}}
              route={routeGeometry}
              startCoordinates={session.route.startCoordinates}
              endCoordinates={session.route.endCoordinates}
              visitedBarIds={visitedBarIds}
              friendPositions={friendPositions}
            />
          </div>

          <motion.div
            className="live-panel"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springPanel}
          >
            {/* Group presence: who's on the crawl + invite */}
            <div className="live-presence">
              <div className="live-presence-people">
                <div className="live-avatar-stack">
                  {members.slice(0, 5).map((m) => (
                    <span
                      key={m.uid}
                      className={`live-avatar ${m.isSelf ? "is-self" : ""} ${
                        m.isHost ? "is-host" : ""
                      }`}
                      title={
                        (m.displayName || "Friend") +
                        (m.isHost ? " (host)" : "") +
                        (m.isSelf ? " — you" : "")
                      }
                    >
                      {initialOf(m.displayName)}
                    </span>
                  ))}
                  {members.length > 5 && (
                    <span className="live-avatar is-more">
                      +{members.length - 5}
                    </span>
                  )}
                </div>
                <span className="live-presence-label">
                  {members.length > 1
                    ? `${members.length} on this crawl`
                    : "Just you so far"}
                </span>
              </div>
              {isActive && (
                <button
                  className="btn btn--ghost btn--sm live-invite-btn"
                  onClick={handleInvite}
                >
                  <FiUserPlus /> Invite
                </button>
              )}
            </div>

            {/* Hero card: next stop or finish CTA */}
            <div className="live-hero-card" ref={heroCardRef}>
              {allResolved ? (
                <>
                  <span className="live-hero-eyebrow">All stops done</span>
                  <h2 className="live-hero-name">That's the last stop! 🎉</h2>
                  <button
                    className="btn btn--primary btn--full"
                    onClick={handleFinish}
                    disabled={busy}
                  >
                    <FaFlagCheckered /> Finish crawl
                  </button>
                </>
              ) : (
                <>
                  <span className="live-hero-eyebrow">Next stop</span>
                  <h2 className="live-hero-name">{currentStop!.name}</h2>
                  {showLiveStats && (
                    <p className="live-hero-meta">
                      <FaMapMarkerAlt />{" "}
                      {tracking.distanceToTargetMiles!.toFixed(2)} mi
                      <span className="live-hero-dot">•</span>
                      <FiClock /> ~{tracking.etaMinutes} min walk
                    </p>
                  )}
                  <div className="live-hero-actions">
                    <button
                      className="btn btn--primary"
                      onClick={() => handleCheckIn("manual")}
                      disabled={busy}
                    >
                      <FaCheck /> I'm here
                    </button>
                    <button
                      className="btn btn--ghost"
                      onClick={handleSkip}
                      disabled={busy}
                    >
                      <FiFastForward /> Skip stop
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Stop timeline */}
            <motion.div
              className="live-stop-list"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {orderedStops.map((stop, index) => {
                const checkIn = session.checkIns?.[stop.barId];
                const isDone = !!checkIn && !checkIn.skipped;
                const isSkipped = !!checkIn?.skipped;
                const isCurrent = currentStop?.barId === stop.barId;
                return (
                  <motion.div
                    key={stop.barId}
                    variants={staggerItem}
                    className={`live-stop-item ${
                      isDone ? "is-done" : ""
                    } ${isSkipped ? "is-skipped" : ""} ${
                      isCurrent ? "is-current" : ""
                    } ${
                      !checkIn && !isCurrent ? "is-upcoming" : ""
                    }`}
                    onMouseEnter={() => setHoveredBarId(stop.barId)}
                    onMouseLeave={() => setHoveredBarId(null)}
                  >
                    <motion.div
                      className="live-stop-badge"
                      animate={
                        isDone ? { scale: [1, 1.35, 1] } : { scale: 1 }
                      }
                      transition={{ duration: 0.4 }}
                    >
                      {isDone ? (
                        <FiCheckCircle />
                      ) : isSkipped ? (
                        "–"
                      ) : (
                        index + 1
                      )}
                    </motion.div>
                    <div className="live-stop-details">
                      <span className="live-stop-name">{stop.name}</span>
                      {isDone && (
                        <span className="live-stop-time">
                          {formatCheckInTime(checkIn!.at) || "just now"}
                          {members.length > 1 && checkIn!.checkedInByName
                            ? ` · ${checkIn!.checkedInByName}`
                            : ""}
                        </span>
                      )}
                      {isSkipped && (
                        <span className="live-stop-time">skipped</span>
                      )}
                      {isCurrent && (
                        <span className="live-stop-time is-current-label">
                          up next
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            <div className="live-panel-footer">
              <button
                className="btn btn--secondary btn--full"
                onClick={() => setShowEndModal(true)}
              >
                End crawl
              </button>
            </div>
          </motion.div>
        </div>

        {/* End-crawl confirm */}
        <AnimatePresence>
          {showEndModal && (
            <motion.div
              className="modal-overlay"
              variants={modalOverlay}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setShowEndModal(false)}
            >
              <motion.div
                className="modal-panel"
                variants={modalPanel}
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="end-crawl-title"
              >
                <h2 className="modal-title" id="end-crawl-title">
                  End the crawl?
                </h2>
                <p className="modal-subtitle">
                  You've hit {stopsHit} of {orderedStops.length} stops.
                </p>
                <div className="modal-footer">
                  <button
                    className="btn btn--ghost"
                    onClick={() => setShowEndModal(false)}
                  >
                    Keep crawling
                  </button>
                  {stopsHit > 0 ? (
                    <button
                      className="btn btn--primary"
                      onClick={handleFinish}
                      disabled={busy}
                    >
                      End & see recap
                    </button>
                  ) : (
                    <button
                      className="btn btn--danger"
                      onClick={handleAbandon}
                      disabled={busy}
                    >
                      End crawl
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
};

export default LiveCrawl;
