import React, { useEffect, useState } from "react";
import {
  FiShare2,
  FiDownload,
  FiMapPin,
  FiCopy,
  FiCheck,
} from "react-icons/fi";
import "../styles/ShareRouteButton.css";
import { toast } from "./Toaster";
import { buildRoutePdf, routePdfFilename } from "../utils/routePdf";

// Once-per-device flag introducing the share options. localStorage can throw
// in private mode, so any failure is treated as "already seen": never nag,
// never crash the page.
const TUTORIAL_KEY = "barhop_share_tutorial_seen";

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

  const handleShareToGoogleMaps = () => {
    if (showTutorial) dismissTutorial(false);
    const url = generateGoogleMapsUrl();
    if (url) {
      window.open(url, "_blank");
    }
  };

  const handleCopyRoute = async () => {
    if (showTutorial) dismissTutorial(false);
    const url = generateGoogleMapsUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
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
    try {
      const googleMapsUrl = generateGoogleMapsUrl();

      // Fetch the QR as a data URL. Best-effort: an offline or slow qrserver
      // must not block the sheet, so a failure just drops the QR.
      let qrDataUrl: string | undefined;
      if (googleMapsUrl) {
        try {
          const res = await fetch(
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
              googleMapsUrl
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
            <button
              className="share-route-option"
              onClick={handleShareToGoogleMaps}
              title="Open in Google Maps"
            >
              <FiMapPin size={16} />
              <span>Google Maps</span>
            </button>

            <button
              className={`share-route-option ${
                copiedToClipboard ? "copied" : ""
              }`}
              onClick={handleCopyRoute}
              title="Copy route to clipboard"
            >
              {copiedToClipboard ? <FiCheck size={16} /> : <FiCopy size={16} />}
              <span>{copiedToClipboard ? "Copied!" : "Copy Link"}</span>
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
              Open it straight in Google Maps, copy a link to send friends, or
              download a PDF of the stop order to keep on your phone.
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
