import React, { useState } from "react";
import {
  FiShare2,
  FiDownload,
  FiMapPin,
  FiCopy,
  FiCheck,
} from "react-icons/fi";
import "../styles/ShareRouteButton.css";

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

  if (!isVisible || !route) {
    return null;
  }

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
    const url = generateGoogleMapsUrl();
    if (url) {
      window.open(url, "_blank");
    }
  };

  const handleCopyRoute = async () => {
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

  const handleDownloadRoute = () => {
    const googleMapsUrl = generateGoogleMapsUrl();
    // Use a QR code generator API to create a QR code for the Google Maps URL
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
      googleMapsUrl
    )}`;

    const stopsList =
      bars.length > 0
        ? bars
            .map(
              (bar, index) => `
          <div class="bar-stop">
            <div class="stop-header">
              <span class="stop-number">${index + 1}</span>
              <div class="stop-info">
                <h2>${bar.name}</h2>
                ${bar.address ? `<p class="address">${bar.address}</p>` : ""}
              </div>
            </div>
            <div class="stop-content">
               <div class="challenge">
                <strong>⭐ Mission:</strong> Try the house special or ask the bartender for their recommendation!
               </div>
               <div class="ratings">
                <strong>Your Rating:</strong>
                <span class="stars">☆ ☆ ☆ ☆ ☆</span>
               </div>
               <div class="notes">
                <strong>Notes & Memories:</strong>
                <div class="notes-box"></div>
               </div>
            </div>
          </div>
        `
            )
            .join("")
        : "<div>No stops added to route.</div>";

    const printableContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Your Epic Bar Crawl Mission</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&family=Poppins:wght@400;600&display=swap');
          body { font-family: 'Poppins', sans-serif; margin: 0; padding: 25px; background-color: #f4f7f6; color: #333; }
          .container { max-width: 800px; margin: auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px dashed #ddd; padding-bottom: 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 20px; }
          .header-text h1 { font-family: 'Rajdhani', sans-serif; color: #1a1a2e; margin: 0; font-size: 2.5em; }
          .header-text p { margin: 5px 0 0 0; color: #666; }
          .qr-code img { border-radius: 5px; }
          .bar-stop { margin-bottom: 20px; }
          .stop-header { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; }
          .stop-number { font-size: 1.5em; font-weight: bold; color: #fff; background-color: #8A2BE2; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .stop-info h2 { margin: 0; font-size: 1.4em; color: #1a1a2e; }
          .address { margin: 2px 0 0 0; color: #555; font-size: 0.9em; }
          .stop-content { border-left: 3px solid #8A2BE2; padding-left: 20px; margin-left: 20px; }
          .challenge, .ratings, .notes { margin-bottom: 10px; }
          .stars { letter-spacing: 3px; cursor: pointer; color: #ddd; font-size: 1.5em; }
          .notes-box { border: 1px solid #ddd; border-radius: 5px; height: 60px; margin-top: 5px; }
          .safety, .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px dashed #ddd; }
          h3 { font-family: 'Rajdhani', sans-serif; color: #1a1a2e; }
          .safety ul { list-style: none; padding: 0; text-align: left; max-width: 400px; margin: 10px auto; }
          .safety li { margin-bottom: 8px; }
          .footer { font-size: 0.8em; color: #aaa; }
          @media print {
            body { margin: 0; padding: 0; background-color: #fff; }
            .container { box-shadow: none; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
             <div class="qr-code">
              <img src="${qrCodeUrl}" alt="Google Maps Route QR Code">
            </div>
            <div class="header-text">
              <h1>Your Bar Crawl Mission</h1>
              <p>Scan the QR code for live navigation!</p>
            </div>
          </div>
          <div class="stops-list">${stopsList}</div>
          <div class="safety">
            <h3>🛡️ Safety Briefing 🛡️</h3>
            <ul>
              <li><strong>Pace Yourself:</strong> It's a marathon, not a sprint. Drink water!</li>
              <li><strong>Buddy System:</strong> Never leave a friend behind.</li>
              <li><strong>Plan Your Ride:</strong> Have a designated driver or rideshare app ready.</li>
              <li><strong>Know Your Limits:</strong> Drink responsibly and have fun.</li>
            </ul>
          </div>
          <div class="footer">
            <p>Generated by BarHop - Your Ultimate Nightlife Planner</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([printableContent], { type: "text/html" });
    const url_blob = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url_blob;
    a.download = "bar-crawl-mission.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url_blob);
  };

  return (
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
            title="Download route as a printable file"
          >
            <FiDownload size={16} />
            <span>Download</span>
          </button>
        </div>
      )}
    </div>
  );
};
