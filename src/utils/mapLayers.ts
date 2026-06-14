// src/utils/mapLayers.ts

import type { Map as MapboxMap } from "mapbox-gl";

export const BARS_SOURCE_ID = "bars-source";
export const BARS_LAYER_ID = "bars-layer";
export const BARS_SELECTED_CIRCLE_ID = "bars-selected-circle";
export const BARS_SELECTED_NUMBER_ID = "bars-selected-number";

// Loads an SVG string into the map's image registry.
const addSvgImage = (
  map: MapboxMap,
  id: string,
  svg: string,
  width: number,
  height: number
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (map.hasImage(id)) {
      resolve();
      return;
    }
    const img = new Image(width, height);
    img.onload = () => {
      try {
        if (map && !map.hasImage(id)) {
          map.addImage(id, img, { pixelRatio: 2 });
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load SVG image: ${id}`));
    img.src = "data:image/svg+xml;base64," + btoa(svg);
  });
};

// Default bar pin: bold teardrop silhouette with a martini glyph.
// Drawn at 2x (88x112) and registered with pixelRatio 2 for crisp rendering.
// Designed to stay legible at ~22-40px rendered height.
const BAR_PIN_SVG = `
<svg width="88" height="112" viewBox="0 0 44 56" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <path d="M22 2 C11 2 2.5 10.5 2.5 21.5 C2.5 30 8 36.5 22 54 C36 36.5 41.5 30 41.5 21.5 C41.5 10.5 33 2 22 2 Z"
        fill="#14121f" stroke="#ecb256" stroke-width="2.5" filter="url(#pinShadow)"/>
  <path d="M13.5 13.5 L30.5 13.5 L22 23.5 Z" fill="rgba(236,178,86,0.2)" stroke="#ecb256" stroke-width="2" stroke-linejoin="round"/>
  <line x1="22" y1="23.5" x2="22" y2="29.5" stroke="#ecb256" stroke-width="2" stroke-linecap="round"/>
  <line x1="17" y1="30" x2="27" y2="30" stroke="#ecb256" stroke-width="2" stroke-linecap="round"/>
  <circle cx="27" cy="10.5" r="2.2" fill="#f5c77e"/>
</svg>
`;

// Start marker: same pin family, amber fill, play glyph.
const START_PIN_SVG = `
<svg width="88" height="112" viewBox="0 0 44 56" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="startShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <path d="M22 2 C11 2 2.5 10.5 2.5 21.5 C2.5 30 8 36.5 22 54 C36 36.5 41.5 30 41.5 21.5 C41.5 10.5 33 2 22 2 Z"
        fill="#ecb256" stroke="#ffffff" stroke-width="2.5" filter="url(#startShadow)"/>
  <path d="M17.5 13 L30 21.5 L17.5 30 Z" fill="#1a1208"/>
</svg>
`;

// End marker: same pin family, white fill, flag glyph.
const END_PIN_SVG = `
<svg width="88" height="112" viewBox="0 0 44 56" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="endShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <path d="M22 2 C11 2 2.5 10.5 2.5 21.5 C2.5 30 8 36.5 22 54 C36 36.5 41.5 30 41.5 21.5 C41.5 10.5 33 2 22 2 Z"
        fill="#ffffff" stroke="#ecb256" stroke-width="2.5" filter="url(#endShadow)"/>
  <line x1="16" y1="11" x2="16" y2="31" stroke="#1a1208" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M16 12 L30 15.5 L16 19 Z" fill="#1a1208"/>
</svg>
`;

// Direction chevron for the route line. Points along +x — Mapbox aligns
// the icon's x-axis with the line's direction of travel when using
// symbol-placement: "line".
const ROUTE_CHEVRON_SVG = `
<svg width="24" height="24" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
  <path d="M3.5 2 L8.5 6 L3.5 10" fill="none" stroke="#ffffff" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
</svg>
`;

export const createBarMarker = (map: MapboxMap): Promise<void> =>
  addSvgImage(map, "bar-pin", BAR_PIN_SVG, 88, 112);

export const createRouteChevron = (map: MapboxMap): Promise<void> =>
  addSvgImage(map, "route-chevron", ROUTE_CHEVRON_SVG, 24, 24);

export const createStartEndMarkers = (map: MapboxMap): Promise<void[]> =>
  Promise.all([
    addSvgImage(map, "start-pin", START_PIN_SVG, 88, 112),
    addSvgImage(map, "end-pin", END_PIN_SVG, 88, 112),
  ]);

// Bar layers. Selection is data-driven via the `selectedOrder` feature
// property (-1 = not selected, 0-based index = stop order). Hover is the
// only feature-state. Selected bars render as numbered circles (route-stop
// style); unselected bars render as the pin icon.
export const createBarLayers = (map: MapboxMap) => {
  map.addSource(BARS_SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    promoteId: "id",
  });

  map.addLayer({
    id: BARS_LAYER_ID,
    type: "symbol",
    source: BARS_SOURCE_ID,
    filter: ["<", ["get", "selectedOrder"], 0],
    layout: {
      "icon-image": "bar-pin",
      "icon-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.5,
        14,
        0.7,
        18,
        0.95,
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-anchor": "bottom",
    },
    paint: {
      "icon-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        1,
        0.88,
      ],
    },
  });

  map.addLayer({
    id: BARS_SELECTED_CIRCLE_ID,
    type: "circle",
    source: BARS_SOURCE_ID,
    filter: [">=", ["get", "selectedOrder"], 0],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        ["case", ["boolean", ["feature-state", "hover"], false], 12, 10],
        14,
        ["case", ["boolean", ["feature-state", "hover"], false], 15, 13],
        18,
        ["case", ["boolean", ["feature-state", "hover"], false], 19, 16],
      ],
      // Visited stops (Live Crawl check-ins) go green; otherwise amber.
      "circle-color": [
        "case",
        ["boolean", ["get", "visited"], false],
        "#2ecc71",
        "#ecb256",
      ],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.addLayer({
    id: BARS_SELECTED_NUMBER_ID,
    type: "symbol",
    source: BARS_SOURCE_ID,
    filter: [">=", ["get", "selectedOrder"], 0],
    layout: {
      "text-field": ["to-string", ["+", ["get", "selectedOrder"], 1]],
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 14, 13, 18, 16],
      "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#1a1208",
    },
  });

  return { BARS_SOURCE_ID, BARS_LAYER_ID };
};
