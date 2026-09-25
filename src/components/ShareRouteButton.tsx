import React, { useEffect, useState } from "react";
import {
  FiShare2,
  FiDownload,
  FiMapPin,
  FiCopy,
  FiCheck,
  FiSend,
} from "react-icons/fi";
import "../styles/ShareRouteButton.css";
import { toast } from "./Toaster";
import { buildRoutePdf, routePdfFilename } from "../utils/routePdf";
import { buildCrawlShareUrl, type SharedCrawl } from "../utils/crawlLink";
import { analytics } from "../utils/analytics";

// Once-per-device flag introducing the share options. localStorage can throw
// in private mode, so any failure is treated as "already seen": never nag,
// never crash the page.
const TUTORIAL_KEY = "barhop_share_tutorial_seen";

// Read once: Mobile Safari is the top browser here, so the native share sheet
// is the primary path and the button label depends on whether it exists.
const canNativeShare = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

const hasSeenTutorial = (): boolean => {
  try {
    return localStorage.getItem(TUTORIAL_KEY) !== null;
  } catch {
    return true;
  }
};

const markTutorialSeen = (): void => {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    // ignore — nothing else we can do
  }
};

interface ShareRouteButtonProps {
  route?: GeoJSON.Feature<GeoJSON.LineString> | null;
  bars: Array<{
    id: string;
    name: string;
    location: {
      coordinates: [number, number];
    };
    address?: string;
    rating?: number; // Added rating to the interface
  }>;
  startCoordinates?: [number, number] | null;
  endCoordinates?: [number, number] | null;
  isVisible?: boolean;
}

export const ShareRouteButton: React.FC<ShareRouteButtonProps> = ({
  route,
  bars,
  startCoordinates,
  endCoordinates,
  isVisible = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  // Building the PDF pulls jsPDF over the network on first use, so the button
  // needs a busy state — otherwise it looks dead on a slow connection and gets
  // clicked repeatedly.
  const [downloading, setDownloading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // First time the button appears with a usable route, introduce it: expand
  // the menu so all options are visible and point a coachmark at it.
  useEffect(() => {
    if (isVisible && route && !hasSeenTutorial()) {
      setShowTutorial(true);
      setIsExpanded(true);
    }
  }, [isVisible, route]);

  if (!isVisible || !route) {
    return null;
  }

  const dismissTutorial = (collapse = true) => {
    setShowTutorial(false);
    if (collapse) setIsExpanded(false);
    markTutorialSeen();
  };

  const generateGoogleMapsUrl = () => {
    const hasEnoughPoints =
      (startCoordinates && bars.length > 0) ||
      (!startCoordinates && bars.length >= 2);

    if (!hasEnoughPoints) return "";

    const baseUrl = "https://www.google.com/maps/dir/";
    const params = new URLSearchParams();
    params.append("api", "1");
    params.append("travelmode", "walking");

    const journeyPoints = [];
    if (startCoordinates) journeyPoints.push(startCoordinates);
    bars.forEach((bar) => journeyPoints.push(bar.location.coordinates));
    if (endCoordinates) journeyPoints.push(endCoordinates);

    if (journeyPoints.length < 2) return "";

    const origin = journeyPoints.shift();
    if (origin) params.append("origin", `${origin[1]},${origin[0]}`);

    const destination = journeyPoints.pop();
    if (destination)
      params.append("destination", `${destination[1]},${destination[0]}`);

    if (journeyPoints.length > 0) {
      const waypoints = journeyPoints.map((p) => `${p[1]},${p[0]}`).join("|");
      params.append("waypoints", waypoints);
    }

    return `${baseUrl}?${params.toString()}`;
  };

  // A BarHop link to this exact crawl, with the whole thing encoded in the
  // fragment — no save, no account, no Firestore write. It opens on /c, the
  // no-map "next bar" list, which is the one screen a recipient standing on a
  // pavement actually wants.
  //
  // This is the fix for the product's most expensive defect: "Copy Link" used
  // to copy a google.com/maps URL, so every share BarHop ever produced sent
  // the other five people in the group to Google instead of back here. The
  // app's only growth loop pointed at a competitor.
  const buildBarHopLink = (): string => {
    const crawl: SharedCrawl = {
      stops: bars.map((bar) => ({
        name: bar.name,
        lng: bar.location.coordinates[0],
        lat: bar.location.coordinates[1],
        address: bar.address,
      })),
      ...(startCoordinates ? { start: startCoordinates } : {}),
      ...(endCoordinates ? { end: endCoordinates } : {}),
    };
    return buildCrawlShareUrl(crawl);
  };

  const handleShareToGoogleMaps = () => {
    if (showTutorial) dismissTutorial(false);
    const url = generateGoogleMapsUrl();
    if (url) {
      analytics.shareClicked("maps");
      window.open(url, "_blank");
    }
  };

  // Send the crawl to the group. navigator.share is the real sharing mechanism
  // on a phone and Mobile Safari is the top browser here, so it leads;
  // clipboard is the desktop path and the fallback when the sheet is
  // dismissed or unavailable.
  const handleShareCrawl = async () => {
    if (showTutorial) dismissTutorial(false);
    if (bars.length < 2) return;
    const url = buildBarHopLink();

    if (canNativeShare()) {
      try {
        await navigator.share({
          title: "Our bar crawl",
          text: "Here's the route for tonight — stops in order:",
          url,
        });
        analytics.shareClicked("native");
        return;
      } catch {
        // AbortError just means they closed the sheet; falling through to the
        // clipboard would be confusing, but so would doing nothing on a real
        // failure. Copying is the safe outcome for both.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      analytics.shareClicked("link");
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      toast.error("Couldn't copy the link — try the PDF instead");
    }
  };

  // Export the crawl as a PDF.
  //
  // Was a Blob({ type: 'text/html' }) download, which on iOS landed in Files
  // and opened badly or not at all — and a phone in a bar is where this gets
  // opened. jsPDF is imported here rather than at module scope so it only
  // downloads when somebody actually exports.
  const handleDownloadRoute = async () => {
    if (showTutorial) dismissTutorial(false);
    if (downloading) return;
    setDownloading(true);
    analytics.shareClicked("pdf");
    try {
      const googleMapsUrl = generateGoogleMapsUrl();
      // The QR encodes the BarHop link, not the Google Maps one: a printed
      // sheet passed around a table is a share surface too, and scanning it
      // should land on the stop list rather than hand the group to Google.
      // The Google Maps link stays as the footer text link for walking
      // directions, which is what it's genuinely good at.
      const qrTarget = bars.length >= 2 ? buildBarHopLink() : googleMapsUrl;

      // Fetch the QR as a data URL. Best-effort: an offline or slow qrserver
      // must not block the sheet, so a failure just drops the QR.
      let qrDataUrl: string | undefined;
      if (qrTarget) {
        try {
          const res = await fetch(
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
              qrTarget
            )}`
          );
          if (res.ok) {
            const blob = await res.blob();
            qrDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        } catch {
          /* no QR, still a usable sheet */
        }
      }

      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      buildRoutePdf(doc, {
        stops: bars.map((bar) => ({ name: bar.name, address: bar.address })),
        mapsUrl: googleMapsUrl || undefined,
        qrDataUrl,
      });
      doc.save(routePdfFilename('bar-crawl'));
    } catch (err) {
      console.error('Failed to build the route PDF:', err);
      toast.error("Couldn't build the PDF — try again");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {showTutorial && (
        <div
          className="share-tutorial-backdrop"
          onClick={() => dismissTutorial()}
        />
      )}
      <div
        className={`share-route-button-container ${isExpanded ? "expanded" : ""}`}
      >
        <div
          className="share-route-button-main"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <FiShare2 size={20} />
          <span className="share-route-button-label">Share Route</span>
        </div>

        {isExpanded && (
          <div className="share-route-button-options">
            {/* First, largest, and the only one that brings anybody back. */}
            <button
              className={`share-route-option share-route-option--primary ${
                copiedToClipboard ? "copied" : ""
              }`}
              onClick={handleShareCrawl}
              disabled={bars.length < 2}
              title="Send the stop list to your group"
            >
              {copiedToClipboard ? (
                <FiCheck size={16} />
              ) : canNativeShare() ? (
                <FiSend size={16} />
              ) : (
                <FiCopy size={16} />
              )}
              <span>{copiedToClipboard ? "Link copied!" : "Send to friends"}</span>
            </button>

            <button
              className="share-route-option"
              onClick={handleShareToGoogleMaps}
              title="Open walking directions in Google Maps"
            >
              <FiMapPin size={16} />
              <span>Google Maps</span>
            </button>

            <button
              className="share-route-option"
              onClick={handleDownloadRoute}
              disabled={downloading}
              title="Download the stop order as a PDF"
            >
              <FiDownload size={16} />
              <span>{downloading ? "Building…" : "PDF"}</span>
            </button>
          </div>
        )}

        {showTutorial && (
          <div
            className="share-tutorial-callout"
            role="note"
            aria-label="Share route tip"
          >
            <h4>Share your route 🎉</h4>
            <p>
              Send the stop list to your group — they get the order on their
              phone, no account needed. Or open walking directions in Google
              Maps, or download a PDF to keep.
            </p>
            <button
              type="button"
              className="share-tutorial-got-it"
              onClick={() => dismissTutorial()}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </>
  );
};
