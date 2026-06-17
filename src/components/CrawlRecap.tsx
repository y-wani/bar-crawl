// src/components/CrawlRecap.tsx
//
// End-of-crawl recap: stats + a shareable PNG card. The .recap-card node
// is captured with html-to-image, so it must stay fully opaque (no
// backdrop-filter / glass translucency / external images inside it).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import party from "party-js";
import { FiShare2, FiDownload, FiCheck } from "react-icons/fi";
import { toast } from "./Toaster";
import { analytics } from "../utils/analytics";
import { springPanel } from "./motion/variants";
import type { CrawlSession } from "../services/sessionService";
import "../styles/LiveCrawl.css";

interface CrawlRecapProps {
  session: CrawlSession;
  onDone: () => void;
}

const formatTime = (at: unknown): string => {
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

const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// Fetch the real walking path through the waypoints as an encoded polyline
// (follows the streets — curved, not straight lines between bars). `simplified`
// keeps the polyline short enough to fit in the static-image URL.
const fetchRoutePolyline = async (
  waypoints: [number, number][]
): Promise<string | null> => {
  if (!MAPBOX_TOKEN || waypoints.length < 2) return null;
  const coordStr = waypoints.map((c) => `${c[0]},${c[1]}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?geometries=polyline&overview=simplified&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.routes?.[0]?.geometry as string) ?? null;
  } catch {
    return null;
  }
};

// Build a Mapbox Static Images URL. The route is drawn as several stacked
// strokes of decreasing width/increasing brightness — a faux neon glow, since
// static images can't do CSS glow — over the dark style, with numbered amber
// pins. Falls back to straight lines if the walking path couldn't be fetched.
// Fetched as a data URL so html-to-image can embed it (no external image refs).
const buildRouteMapUrl = (
  polyline: string | null,
  straightCoords: [number, number][],
  stops: { coordinates: [number, number] }[]
): string | null => {
  if (!MAPBOX_TOKEN || stops.length === 0) return null;
  const overlays: string[] = [];

  if (polyline) {
    const enc = encodeURIComponent(polyline);
    // outer halo → mid glow → bright core (drawn bottom-to-top)
    overlays.push(`path-13+ecb256-0.12(${enc})`);
    overlays.push(`path-8+f0bf6a-0.3(${enc})`);
    overlays.push(`path-4+ffd98a-0.6(${enc})`);
    overlays.push(`path-2+fff4dc-0.95(${enc})`);
  } else if (straightCoords.length >= 2) {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            stroke: "#ffd98a",
            "stroke-width": 4,
            "stroke-opacity": 0.9,
          },
          geometry: { type: "LineString", coordinates: straightCoords },
        },
      ],
    };
    overlays.push(`geojson(${encodeURIComponent(JSON.stringify(fc))})`);
  }

  // Mapbox pin labels support 0–99; beyond that the pin renders unlabeled.
  stops.forEach((s, i) => {
    overlays.push(
      `pin-s-${i + 1}+ecb256(${s.coordinates[0]},${s.coordinates[1]})`
    );
  });
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlays.join(
    ","
  )}/auto/600x340@2x?padding=50&access_token=${MAPBOX_TOKEN}`;
};

export const CrawlRecap: React.FC<CrawlRecapProps> = ({
  session,
  onDone,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [mapDataUrl, setMapDataUrl] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "failed">(
    MAPBOX_TOKEN ? "loading" : "failed"
  );

  const stats = session.stats ?? {
    stopsHit: 0,
    stopsTotal: session.stops.length,
    milesWalked: session.walkedMiles ?? 0,
    durationMin: 0,
  };

  const orderedStops = useMemo(
    () => [...session.stops].sort((a, b) => a.order - b.order),
    [session.stops]
  );

  useEffect(() => {
    if (overlayRef.current) {
      party.confetti(overlayRef.current, { count: 60, spread: 30 });
    }
  }, []);

  // Render the route as a static map and inline it as a data URL (so the
  // html-to-image capture includes it). Failure is silent — the card still
  // renders without the map.
  useEffect(() => {
    let cancelled = false;
    const routeCoords: [number, number][] = [
      session.route.startCoordinates,
      ...orderedStops.map((s) => s.coordinates),
    ];
    const end = session.route.endCoordinates;
    const last = routeCoords[routeCoords.length - 1];
    if (end && (end[0] !== last[0] || end[1] !== last[1])) {
      routeCoords.push(end);
    }
    (async () => {
      try {
        const polyline = await fetchRoutePolyline(routeCoords);
        if (cancelled) return;
        const url = buildRouteMapUrl(polyline, routeCoords, orderedStops);
        if (!url) {
          if (!cancelled) setMapStatus("failed");
          return;
        }
        const res = await fetch(url);
        if (!res.ok) {
          if (!cancelled) setMapStatus("failed");
          return;
        }
        const dataUrl = await blobToDataUrl(await res.blob());
        if (!cancelled) {
          setMapDataUrl(dataUrl);
          setMapStatus("ready");
        }
      } catch {
        // no map — recap still works without it
        if (!cancelled) setMapStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.route, orderedStops]);

  const renderCardPng = async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      return await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
    } catch (error) {
      // Webfont embedding can fail (CORS); retry without fonts
      console.warn("toPng failed, retrying without fonts:", error);
      try {
        return await toPng(cardRef.current, {
          pixelRatio: 2,
          cacheBust: true,
          skipFonts: true,
        });
      } catch (retryError) {
        console.error("Recap export failed:", retryError);
        return null;
      }
    }
  };

  const downloadPng = (dataUrl: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "barhop-recap.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    setExporting(true);
    try {
      const dataUrl = await renderCardPng();
      if (!dataUrl) {
        toast.error("Couldn't render the recap card");
        return;
      }
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "barhop-recap.png", {
        type: "image/png",
      });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My BarHop crawl" });
      } else {
        downloadPng(dataUrl);
        toast.success("Recap saved — share it anywhere!");
      }
      analytics.recapShared("share");
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        console.error("Share failed:", error);
        toast.error("Sharing failed — try Download instead");
      }
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      const dataUrl = await renderCardPng();
      if (!dataUrl) {
        toast.error("Couldn't render the recap card");
        return;
      }
      downloadPng(dataUrl);
      analytics.recapShared("download");
      toast.success("Recap downloaded");
    } finally {
      setExporting(false);
    }
  };

  const crawlDate = (() => {
    const at = session.startedAt;
    const date =
      at instanceof Date
        ? at
        : typeof (at as { toDate?: () => Date })?.toDate === "function"
          ? (at as { toDate: () => Date }).toDate()
          : new Date();
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  })();

  return (
    <div className="recap-overlay" ref={overlayRef}>
      <h1 className="recap-heading">Crawl complete! 🍻</h1>

      <motion.div
        className="recap-card"
        ref={cardRef}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springPanel}
      >
        <span className="recap-wordmark">BarHop</span>
        <div>
          <h2 className="recap-crawl-name">
            {session.crawlName || "Night Out"}
          </h2>
          <span className="recap-date">{crawlDate}</span>
        </div>

        {mapStatus !== "failed" && (
          <div className="recap-map">
            {mapStatus === "ready" && mapDataUrl ? (
              <img src={mapDataUrl} alt="Your crawl route" />
            ) : (
              <div className="recap-map-skeleton">
                <span className="recap-map-skeleton-label">
                  Tracing your route…
                </span>
              </div>
            )}
          </div>
        )}

        <div className="recap-stats">
          <div className="recap-stat">
            <span className="recap-stat-value">
              {stats.stopsHit}/{stats.stopsTotal}
            </span>
            <span className="recap-stat-label">Stops</span>
          </div>
          <div className="recap-stat">
            <span className="recap-stat-value">{stats.milesWalked}</span>
            <span className="recap-stat-label">Miles</span>
          </div>
          <div className="recap-stat">
            <span className="recap-stat-value">
              {formatDuration(stats.durationMin)}
            </span>
            <span className="recap-stat-label">Out</span>
          </div>
        </div>

        <div className="recap-stop-list">
          {orderedStops.map((stop) => {
            const checkIn = session.checkIns?.[stop.barId];
            const skipped = !!checkIn?.skipped;
            const hit = !!checkIn && !skipped;
            return (
              <div
                key={stop.barId}
                className={`recap-stop-row ${skipped ? "is-skipped" : ""}`}
              >
                <span className="recap-stop-mark">{hit ? "✓" : "–"}</span>
                <span className="recap-stop-row-name">{stop.name}</span>
                {hit && (
                  <span className="recap-stop-row-time">
                    {formatTime(checkIn!.at)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <span className="recap-footer-tag">
          planned with barhop · gobarhop.app
        </span>
      </motion.div>

      <div className="recap-actions">
        <button
          className="btn btn--primary"
          onClick={handleShare}
          disabled={exporting || mapStatus === "loading"}
        >
          <FiShare2 /> Share recap
        </button>
        <button
          className="btn btn--secondary"
          onClick={handleDownload}
          disabled={exporting || mapStatus === "loading"}
        >
          <FiDownload /> Download
        </button>
        <button className="btn btn--ghost" onClick={onDone}>
          <FiCheck /> Done
        </button>
      </div>
    </div>
  );
};
