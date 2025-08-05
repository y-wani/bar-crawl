// src/utils/mapLayers.ts

import type { Map as MapboxMap } from "mapbox-gl";

export const BARS_SOURCE_ID = "bars-source";
export const BARS_LAYER_ID = "bars-layer";

// Create highlight layers for bars
export const createHighlightLayers = (map: MapboxMap, barsLayerId: string) => {
  // Add source for hover highlight circles
  map.addSource("hover-highlight", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Add hover highlight circle layer
  map.addLayer({
    id: "bars-hover-highlight",
    type: "circle",
    source: "hover-highlight",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 18, 18, 30], // Reduced size
      "circle-color": "#00ffff",
      "circle-opacity": 0.5,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ff00ff",
      "circle-stroke-opacity": 0.8,
      "circle-blur": 0.4,
    },
  });

  // Add source for selected highlight circles
  map.addSource("selected-highlight", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Add selected highlight circle layer
  map.addLayer({
    id: "bars-selected-highlight",
    type: "circle",
    source: "selected-highlight",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 16, 18, 28], // Reduced size
      "circle-color": "#ffff00",
      "circle-opacity": 0.6,
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ff00ff",
      "circle-stroke-opacity": 0.9,
      "circle-blur": 0.2,
    },
  });

  // Add source for non-selected bars subtle highlight
  map.addSource("nonselected-highlight", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Add subtle highlight for non-selected bars
  map.addLayer(
    {
      id: "bars-nonselected-highlight",
      type: "circle",
      source: "nonselected-highlight",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 18, 16], // Reduced size
        "circle-color": "#00ffff",
        "circle-opacity": 0.15,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#00ffff",
        "circle-stroke-opacity": 0.4,
        "circle-blur": 1,
      },
    },
    barsLayerId
  );
};

// Create a new, stylish bar marker icon
export const createBarMarker = (map: MapboxMap): Promise<void> => {
  return new Promise((resolve, reject) => {
    const markerId = "neon-pin-marker";
    if (map.hasImage(markerId)) {
      console.log("🟣 Neon pin marker already loaded");
      resolve();
      return;
    }

    console.log("🎨 Creating premium neon cyberpunk pin marker...");
    // Ultra-modern cyberpunk pin with enhanced neon effects - STATIC for performance
    const neonPinSvg = `
  <svg width="56" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="cyber-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#00ffff"/>
            <stop offset="50%" stop-color="#ff00ff"/>
            <stop offset="100%" stop-color="#3bb2d0"/>
        </linearGradient>

        <radialGradient id="liquid-fill" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stop-color="#F72585" />
            <stop offset="100%" stop-color="#B5179E" />
        </radialGradient>

        <filter id="neon-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="#00ffff" flood-opacity="0.8"/>
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" flood-color="#ff00ff" flood-opacity="0.6"/>
        </filter>
        
        <filter id="garnish-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feDropShadow dx="0" dy="0" stdDeviation="0.8" flood-color="#F72585" flood-opacity="1"/>
        </filter>
    </defs>

    <g filter="url(#neon-glow)">
        <path d="M9 21H15" stroke="url(#cyber-gradient)" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M12 21V17" stroke="url(#cyber-gradient)" stroke-width="1.5" stroke-linecap="round"/>

        <path d="M5 9.28571C5 9.02012 5 8.88733 5.02507 8.77748C5.11055 8.40298 5.40298 8.11055 5.77748 8.02507C5.88733 8 6.02012 8 6.28571 8H17.7143C17.9799 8 18.1127 8 18.2225 8.02507C18.597 8.11055 18.8895 8.40298 18.9749 8.77748C19 8.88733 19 9.02012 19 9.28571V10C19 10.9288 19 11.3933 18.9487 11.7832C18.5942 14.4756 16.4756 16.5942 13.7832 16.9487C13.3933 17 12.9288 17 12 17C11.0712 17 10.6067 17 10.2168 16.9487C7.52444 16.5942 5.40579 14.4756 5.05133 11.7832C5 11.3933 5 10.9288 5 10V9.28571Z" 
              stroke="url(#cyber-gradient)" stroke-width="1.5" fill="#12121e" fill-opacity="0.8"/>
    </g>

    <g filter="url(#garnish-glow)">
         <path d="M11.0385 11.7253C10.8868 12.2563 11.1942 12.8098 11.7253 12.9615C12.2563 13.1132 12.8098 12.8058 12.9615 12.2747L13.7305 5.9432L14.9108 4.63569L14.0845 5.07626L12.9615 12.2747Z" 
               fill="url(#liquid-fill)"/>
    </g>
</svg>
`;

    const img = new Image(56, 70);
    img.onload = () => {
      try {
        if (map && !map.hasImage(markerId)) {
          map.addImage(markerId, img);
          console.log("✅ Neon pin marker loaded successfully!");
        }
        resolve();
      } catch (error) {
        console.error("❌ Error loading neon pin marker:", error);
        reject(error);
      }
    };

    img.onerror = (e) => {
      const error = new Error("Failed to load neon pin SVG");
      console.error("❌", error.message, e);
      reject(error);
    };

    img.src = "data:image/svg+xml;base64," + btoa(neonPinSvg);
  });
};

export const createInRouteBarMarker = (map: MapboxMap): Promise<void> => {
  return new Promise((resolve, reject) => {
    const markerId = "in-route-bar-marker";
    if (map.hasImage(markerId)) {
      resolve();
      return;
    }

    const inRouteSvg = `
      <svg width="56" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cyber-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#00ffff"/>
                <stop offset="50%" stop-color="#ff00ff"/>
                <stop offset="100%" stop-color="#3bb2d0"/>
            </linearGradient>
            <radialGradient id="liquid-fill" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <stop offset="0%" stop-color="#F72585" />
                <stop offset="100%" stop-color="#B5179E" />
            </radialGradient>
            <filter id="neon-glow" x="-150%" y="-150%" width="400%" height="400%">
                <feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="#00ffff" flood-opacity="0.8"/>
                <feDropShadow dx="0" dy="0" stdDeviation="1.5" flood-color="#ff00ff" flood-opacity="0.6"/>
            </filter>
            <filter id="garnish-glow" x="-150%" y="-150%" width="400%" height="400%">
                <feDropShadow dx="0" dy="0" stdDeviation="0.8" flood-color="#F72585" flood-opacity="1"/>
            </filter>
        </defs>
        <g filter="url(#neon-glow)">
            <path d="M9 21H15" stroke="url(#cyber-gradient)" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M12 21V17" stroke="url(#cyber-gradient)" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M5 9.28571C5 9.02012 5 8.88733 5.02507 8.77748C5.11055 8.40298 5.40298 8.11055 5.77748 8.02507C5.88733 8 6.02012 8 6.28571 8H17.7143C17.9799 8 18.1127 8 18.2225 8.02507C18.597 8.11055 18.8895 8.40298 18.9749 8.77748C19 8.88733 19 9.02012 19 9.28571V10C19 10.9288 19 11.3933 18.9487 11.7832C18.5942 14.4756 16.4756 16.5942 13.7832 16.9487C13.3933 17 12.9288 17 12 17C11.0712 17 10.6067 17 10.2168 16.9487C7.52444 16.5942 5.40579 14.4756 5.05133 11.7832C5 11.3933 5 10.9288 5 10V9.28571Z" 
                  stroke="url(#cyber-gradient)" stroke-width="1.5" fill="#12121e" fill-opacity="0.8"/>
        </g>
        <g filter="url(#garnish-glow)">
             <path d="M11.0385 11.7253C10.8868 12.2563 11.1942 12.8098 11.7253 12.9615C12.2563 13.1132 12.8098 12.8058 12.9615 12.2747L13.7305 5.9432L14.9108 4.63569L14.0845 5.07626L12.9615 12.2747Z" 
                   fill="url(#liquid-fill)"/>
        </g>
      </svg>
    `;

    const img = new Image(56, 70);
    img.onload = () => {
      if (map && !map.hasImage(markerId)) {
        map.addImage(markerId, img);
      }
      resolve();
    };
    img.onerror = (e) => reject(e);
    img.src = "data:image/svg+xml;base64," + btoa(inRouteSvg);
  });
};

// Create bar layers
export const createBarLayers = (map: MapboxMap) => {
  // -- Bars Source & Symbol Layer --
  map.addSource(BARS_SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    promoteId: "id", // Use the 'id' property from GeoJSON properties as the feature's ID
  });

  map.addLayer({
    id: BARS_LAYER_ID,
    type: "symbol",
    source: BARS_SOURCE_ID,
    layout: {
      "icon-image": "neon-pin-marker", // Use our new custom marker
      "icon-size": [
        // Reduced scaling for cleaner appearance
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.35,
        14,
        0.5,
        18,
        0.7,
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-anchor": "bottom",
    },
    paint: {
      "icon-opacity": [
        // Make selected/hovered bars more prominent
        "case",
        ["boolean", ["feature-state", "selected"], false],
        1,
        ["boolean", ["feature-state", "hover"], false],
        1,
        0.85, // Slightly fade non-active pins
      ],
    },
  });

  return { BARS_SOURCE_ID, BARS_LAYER_ID };
};
