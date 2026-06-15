// src/components/CrawlRecap.tsx
//
// End-of-crawl recap: stats + a shareable PNG card. The .recap-card node
// is captured with html-to-image, so it must stay fully opaque (no
// backdrop-filter / glass translucency / external images inside it).

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import party from "party-js";
import { FiShare2, FiDownload, FiCheck } from "react-icons/fi";
import { toast } from "./Toaster";
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

export const CrawlRecap: React.FC<CrawlRecapProps> = ({
  session,
  onDone,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);

  const stats = session.stats ?? {
    stopsHit: 0,
    stopsTotal: session.stops.length,
    milesWalked: session.walkedMiles ?? 0,
    durationMin: 0,
  };

  const orderedStops = [...session.stops].sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (overlayRef.current) {
      party.confetti(overlayRef.current, { count: 60, spread: 30 });
    }
  }, []);

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
          disabled={exporting}
        >
          <FiShare2 /> Share recap
        </button>
        <button
          className="btn btn--secondary"
          onClick={handleDownload}
          disabled={exporting}
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
