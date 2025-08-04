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
  <svg width="56" height="70" viewBox="0 0 56 70" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="primaryGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00ffff"/>
        <stop offset="50%" stop-color="#ff00ff"/>
        <stop offset="100%" stop-color="#3bb2d0"/>
      </linearGradient>
      <radialGradient id="coreGradient" cx="50%" cy="45%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#00ffff"/>
      </radialGradient>
      <filter id="neonGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#00ffff" flood-opacity="0.9"/>
        <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#ff00ff" flood-opacity="0.7"/>
      </filter>
      <filter id="innerGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ffffff" flood-opacity="0.8"/>
      </filter>
    </defs>
    <g filter="url(#neonGlow)">
      <path
        d="M28 2 C15.3 2 4 15.3 4 28 C4 45 28 68 28 68 S52 45 52 28 C52 15.3 40.7 2 28 2 Z"
        fill="#12121e"
        stroke="url(#primaryGradient)"
        stroke-width="2.5"
      />
    </g>
    <circle cx="28" cy="28" r="10" fill="url(#coreGradient)" filter="url(#innerGlow)"/>
    <circle cx="28" cy="28" r="4" fill="#12121e"/>
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
