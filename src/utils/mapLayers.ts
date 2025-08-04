// src/utils/mapLayers.ts

export const BARS_SOURCE_ID = "bars-source";
export const BARS_LAYER_ID = "bars-layer";

// Create highlight layers for bars
export const createHighlightLayers = (
  map: any, // mapboxgl.Map
  barsLayerId: string
) => {
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 25, 18, 45],
      "circle-color": "#00ffff",
      "circle-opacity": 0.4,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ff00ff",
      "circle-stroke-opacity": 0.8,
      "circle-blur": 0.8,
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 20, 18, 35],
      "circle-color": "#ffff00",
      "circle-opacity": 0.5,
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ff00ff",
      "circle-stroke-opacity": 0.9,
      "circle-blur": 0.3,
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 12, 18, 22],
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

// Create pulsing indicator layer
export const createPulsingIndicatorLayer = (
  map: any, // mapboxgl.Map
  center: [number, number]
) => {
  // Add source for pulsing indicators
  map.addSource("pulsing-indicators", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Single pulsing circle layer (neon magenta) - highly visible
  map.addLayer({
    id: "bars-pulse",
    type: "circle",
    source: "pulsing-indicators",
    paint: {
      "circle-radius": ["get", "radius"],
      "circle-color": "#ff00ff",
      "circle-opacity": ["get", "opacity"],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#00ffff",
      "circle-stroke-opacity": 1.0,
      "circle-blur": 0.5,
    },
    layout: {
      visibility: "visible",
    },
  });
  console.log("✅ Pulsing layer 'bars-pulse' added to map");

  // Add a test feature immediately to verify the layer works
  const testPulsingSource = map.getSource(
    "pulsing-indicators"
  ) as mapboxgl.GeoJSONSource;
  if (testPulsingSource) {
    testPulsingSource.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: center },
          properties: { radius: 30, opacity: 0.8 },
        },
      ],
    });
    console.log("🧪 Test pulsing indicator added at center:", center);
  }
};

// Create neon dot marker
export const createNeonDotMarker = (map: any): Promise<void> => { // mapboxgl.Map
  return new Promise((resolve, reject) => {
    if (map.hasImage("neon-dot")) {
      console.log("🟣 Neon dot marker already loaded");
      resolve();
      return;
    }

    console.log("🎨 Creating neon dot marker...");
    const neonDotSvg = `
  <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Soft radial gradient center→edge -->
      <radialGradient id="dotGradient" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ff00ff" stop-opacity="0.9"/>
        <stop offset="70%" stop-color="#ff00ff" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#ff00ff" stop-opacity="0"/>
      </radialGradient>
      <!-- Outer halo glow filter -->
      <filter id="haloGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <!-- Outer pulsing halo -->
    <circle cx="24" cy="24" r="16" fill="none" stroke="#ff00ff" stroke-width="2" filter="url(#haloGlow)">
      <animate attributeName="r" values="14;20;14" dur="2.5s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.5s" repeatCount="indefinite"/>
    </circle>

    <!-- Core dot with gradient -->
    <circle cx="24" cy="24" r="8" fill="url(#dotGradient)">
      <!-- slight “pop” on each pulse -->
      <animateTransform attributeName="transform" type="scale"
        values="1;1.15;1" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite"/>
      <!-- synchronized opacity pulse -->
      <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>
`;

    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      console.error("❌ Failed to get canvas context for neon dot marker");
      reject(new Error("Failed to get canvas context"));
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, 40, 40);
        const imageData = ctx.getImageData(0, 0, 40, 40);

        if (map && !map.hasImage("neon-dot")) {
          map.addImage("neon-dot", {
            width: 40,
            height: 40,
            data: new Uint8Array(imageData.data),
          });
          console.log("✅ Neon dot marker loaded successfully!");
        }
        resolve();
      } catch (error) {
        console.error("❌ Error loading neon dot marker:", error);
        reject(error);
      }
    };

    img.onerror = () => {
      const error = new Error("Failed to load neon dot SVG");
      console.error("❌", error.message);
      reject(error);
    };

    img.src = "data:image/svg+xml;base64," + btoa(neonDotSvg);
  });
};

// Create a new, stylish bar marker icon
export const createBarMarker = (map: any): Promise<void> => { // mapboxgl.Map
  return new Promise((resolve, reject) => {
    const markerId = "neon-pin-marker";
    if (map.hasImage(markerId)) {
      console.log("🟣 Neon pin marker already loaded");
      resolve();
      return;
    }

    console.log("🎨 Creating neon pin marker...");
    // A more stylish, futuristic pin
    const neonPinSvg = `
  <svg width="56" height="72" viewBox="0 0 56 72" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Electric outline gradient -->
      <linearGradient id="pinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"  stop-color="#00ffff"/>
        <stop offset="50%" stop-color="#ff00ff"/>
        <stop offset="100%" stop-color="#00ffff"/>
      </linearGradient>
      <!-- Heavy glow filter -->
      <filter id="pinGlow" x="-75%" y="-75%" width="250%" height="250%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#ff00ff" flood-opacity="0.8"/>
        <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#00ffff" flood-opacity="0.5"/>
      </filter>
    </defs>

    <!-- Pin shape -->
    <path
      d="M28 0 C14 0 4 14 4 28 C4 48 28 72 28 72 S52 48 52 28 C52 14 42 0 28 0 Z"
      fill="#16152B"
      stroke="url(#pinGradient)"
      stroke-width="3"
      filter="url(#pinGlow)"
    />

    <!-- Inner circle with disco-flicker -->
    <circle cx="28" cy="28" r="10" fill="#00ffff" filter="url(#pinGlow)">
      <!-- random flicker -->
      <set attributeName="opacity" to="0.6" begin="0s" dur="0.1s"/>
      <set attributeName="opacity" to="1"   begin="0.1s" dur="0.05s"/>
      <set attributeName="opacity" to="0.8" begin="0.2s" dur="0.1s"/>
      <animate attributeName="opacity" values="1;0.8;1" dur="1.8s" repeatCount="indefinite"/>
    </circle>

    <!-- Core dot for precision -->
    <circle cx="28" cy="28" r="4" fill="#16152B"/>
  </svg>
`;

    const img = new Image(48, 60);
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
// Update createBarLayers to use the new marker
export const createBarLayers = (map: any) => { // mapboxgl.Map
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
        // Scale the icon with zoom for a better UX
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.4,
        18,
        0.8,
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
