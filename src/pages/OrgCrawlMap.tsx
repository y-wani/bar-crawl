// src/pages/OrgCrawlMap.tsx
//
// "See the map" for an org's crawl: /o/<slug>/map/<crawlId>. View only — the
// route line and numbered stops in the org's order, and nothing to edit,
// save or start. It used to open the full planner (/route), which let a
// curious attendee reorder the organizer's crawl, re-optimize it or start a
// crawl from it; starting belongs to the org page, where it is one button.

import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { MapContainer } from "../components/MapContainer";
import PageTransition from "../components/motion/PageTransition";
import { useAuth } from "../context/useAuth";
import { auth } from "../firebase/config";
import { getOrg, type Org } from "../services/orgService";
import {
  convertSavedBarsToAppBars,
  getCrawlById,
  type SavedBarCrawl,
} from "../services/crawlService";
import { brandStyle, isValidOrgSlug } from "../utils/orgBranding";
import { fetchWalkingRoute, walkingRouteCoords } from "../utils/walkingRoute";
import "../styles/OrgCrawlMap.css";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; org: Org; crawl: SavedBarCrawl };

const OrgCrawlMap: React.FC = () => {
  const { slug, crawlId } = useParams();
  const { user, loading: authLoading, ensureGuest } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [route, setRoute] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);

  const valid = isValidOrgSlug(slug) && !!crawlId;

  // Saved crawls are a signed-in read (firestore.rules); a guest is enough.
  useEffect(() => {
    if (authLoading || user || !valid) return;
    // ensureGuest swallows its own errors; no user afterwards means the mint
    // failed (e.g. Firebase's per-IP sign-up limit, which a crowd on one bar's
    // Wi-Fi can hit). Say so rather than sit on "Loading…" forever.
    let cancelled = false;
    void ensureGuest().then(() => {
      if (!cancelled && !auth.currentUser) setState({ status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, valid, ensureGuest]);

  useEffect(() => {
    if (!valid) {
      setState({ status: "missing" });
      return;
    }
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const org = await getOrg(slug);
        // Only a crawl the org lists: this page is the org's, not a viewer
        // for any saved crawl id someone pastes in.
        if (!org || !org.crawlIds.includes(crawlId)) {
          if (!cancelled) setState({ status: "missing" });
          return;
        }
        const crawl = await getCrawlById(crawlId);
        if (cancelled) return;
        setState(
          crawl && crawl.bars?.length >= 2
            ? { status: "ready", org, crawl }
            : { status: "missing" }
        );
      } catch (error) {
        console.error("❌ Error loading org crawl map:", error);
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [valid, slug, crawlId, user]);

  const crawl = state.status === "ready" ? state.crawl : null;
  // convertSavedBarsToAppBars sorts in place; never let it touch the doc.
  const bars = useMemo(
    () => (crawl ? convertSavedBarsToAppBars([...crawl.bars]) : []),
    [crawl]
  );
  const stopIds = useMemo(() => new Set(bars.map((b) => b.id)), [bars]);
  // Memoized: MapContainer re-frames the map whenever these change identity.
  const start = useMemo<[number, number] | null>(
    () =>
      crawl?.route?.startLocation
        ? [crawl.route.startLocation.lng, crawl.route.startLocation.lat]
        : null,
    [crawl]
  );
  const end = useMemo<[number, number] | null>(
    () =>
      crawl?.route?.endLocation
        ? [crawl.route.endLocation.lng, crawl.route.endLocation.lat]
        : null,
    [crawl]
  );

  useEffect(() => {
    if (bars.length < 2) return;
    let cancelled = false;
    void fetchWalkingRoute(
      walkingRouteCoords(bars.map((b) => b.location.coordinates), start, end)
    ).then((line) => {
      if (!cancelled) setRoute(line);
    });
    return () => {
      cancelled = true;
    };
  }, [bars, start, end]);

  if (state.status !== "ready") {
    return (
      <div className="org-map-page org-map-page--center">
        <p>
          {state.status === "loading"
            ? "Loading the map…"
            : state.status === "missing"
              ? "We couldn't find this crawl."
              : "The map didn't load. Check your connection and try again."}
        </p>
        {state.status !== "loading" && isValidOrgSlug(slug) && (
          <Link to={`/o/${slug}`} className="btn btn--secondary">
            Back
          </Link>
        )}
      </div>
    );
  }

  const { org } = state;
  const miles = state.crawl.route?.totalDistance;

  return (
    <PageTransition>
      <div className="org-map-page" style={brandStyle(org.accent)}>
        <header className="org-map-header">
          <Link to={`/o/${org.slug}`} className="org-map-back">
            <FiArrowLeft aria-hidden="true" />
            <span>{org.name}</span>
          </Link>
          <h1 className="org-map-title">{state.crawl.name}</h1>
        </header>

        <div className="org-map-map">
          <MapContainer
            center={bars[0].location.coordinates}
            radius={0}
            bars={bars}
            selectedBarIds={stopIds}
            hoveredBarId={hoveredBarId}
            onToggleBar={() => {}}
            onHoverBar={setHoveredBarId}
            onMapViewChange={() => {}}
            onDrawComplete={() => {}}
            route={route}
            startCoordinates={start}
            endCoordinates={end}
            showShareRoute={false}
            fitToStops
          />
        </div>

        <section className="org-map-panel" aria-label="Stops in order">
          <p className="org-map-meta">
            {bars.length} bars
            {typeof miles === "number" && miles > 0 ? ` · ${miles.toFixed(1)} mi walk` : ""}
          </p>
          <ol className="org-map-stops">
            {bars.map((bar, i) => (
              <li
                key={bar.id}
                className={hoveredBarId === bar.id ? "is-hovered" : ""}
                onPointerEnter={() => setHoveredBarId(bar.id)}
                onPointerLeave={() => setHoveredBarId(null)}
              >
                <span className="org-map-stop-num">{i + 1}</span>
                <span className="org-map-stop-name">{bar.name}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </PageTransition>
  );
};

export default OrgCrawlMap;
