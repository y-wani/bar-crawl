// src/components/MapContainer.tsx

import React, { useEffect, useRef } from "react";
import type { AppBat } from "../pages/Home";
import { circle as turfCircle } from "@turf/turf";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "../styles/Home.css"; // Make sure you have :root { --primary: #3bb2d0; } or use the hard-coded color below
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
// import MapboxDirections from "@mapbox/mapbox-gl-directions";
// import "@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css";

import type { Feature, Geometry, GeoJsonProperties } from "geojson";

// Constants
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const RADIUS_SOURCE_ID = "radius-circle";
const RADIUS_FILL_LAYER = "radius-fill";
const RADIUS_OUTLINE_LAYER = "radius-outline";
const BARS_SOURCE_ID = "bars-source";
const BARS_LAYER_ID = "bars-layer";

// Props & types
export type MapBounds = [number, number, number, number];

// Type for Mapbox Point geometry
interface MapboxPointGeometry {
  type: "Point";
  coordinates: [number, number];
}

interface MapContainerProps {
  center: [number, number];
  radius: number; // in miles
  bars: AppBat[];
  selectedBarIds: Set<string>;
  hoveredBarId: string | null;
  onToggleBar: (id: string) => void;
  onHoverBar: (id: string | null) => void;
  onMapViewChange: (bounds: MapBounds) => void;
  onDrawComplete: (feature: Feature | null) => void;
  route?: GeoJSON.Feature<GeoJSON.LineString> | null;
  startCoordinates?: [number, number] | null;
  // selectedBars: AppBat[]; // Temporarily removed until directions are re-implemented
}

export const MapContainer: React.FC<MapContainerProps> = ({
  center,
  radius,
  bars,
  selectedBarIds,
  hoveredBarId,
  onToggleBar,
  onHoverBar,
  onMapViewChange,
  onDrawComplete,
  route,
  startCoordinates,
  // selectedBars, // Temporarily removed until directions are re-implemented
}) => {
  // Debug props on component load
  console.log("🗺️ MapContainer received props:", {
    center,
    radius,
    barsCount: bars.length,
    selectedBarIds: Array.from(selectedBarIds),
    hoveredBarId,
    hasRoute: !!route,
    startCoordinates
  });
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const hoveredStateId = useRef<string | null>(null);
  const isInitialLoad = useRef(true);
  // const directionsRef = useRef<MapboxDirections | null>(null);

  // 1. Initialize map and add all sources/layers on load
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center,
      zoom: 13,
    });

    const m = map.current;

    // Add controls
    m.addControl(new mapboxgl.FullscreenControl());
    m.addControl(new mapboxgl.NavigationControl());
    m.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      })
    );
    m.addControl(new mapboxgl.ScaleControl(), "bottom-right");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
    });

    m.addControl(draw, "top-left");

    m.on(
      "draw.create",
      (e: { features: Array<Feature<Geometry, GeoJsonProperties>> }) =>
        onDrawComplete(e.features[0])
    );
    m.on(
      "draw.update",
      (e: { features: Array<Feature<Geometry, GeoJsonProperties>> }) =>
        onDrawComplete(e.features[0])
    );
    m.on("draw.delete", () => onDrawComplete(null));

    // directionsRef.current = new MapboxDirections({
    //   accessToken: MAPBOX_ACCESS_TOKEN,
    //   unit: "metric",
    //   profile: "mapbox/walking",
    //   controls: { instructions: true },
    // });

    // m.addControl(directionsRef.current, "top-left");

    m.on("load", () => {
      // -- Radius Circle Source & Layers --
      m.addSource(RADIUS_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: RADIUS_FILL_LAYER,
        type: "fill",
        source: RADIUS_SOURCE_ID,
        paint: {
          // Hard-coded color; or define --primary in your CSS
          "fill-color": "#3bb2d0",
          "fill-opacity": 0.1,
        },
      });
      m.addLayer({
        id: RADIUS_OUTLINE_LAYER,
        type: "line",
        source: RADIUS_SOURCE_ID,
        paint: {
          "line-color": "#3bb2d0",
          "line-width": 2,
          "line-opacity": 0.7,
        },
      });

      // -- Bars Source & Symbol Layer --
      m.addSource(BARS_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id", // Use the 'id' property from GeoJSON properties as the feature's ID
      });
      console.log("🏗️ Creating bars layer with beer-marker icon");
      m.addLayer({
        id: BARS_LAYER_ID,
        type: "symbol",
        source: BARS_SOURCE_ID,
        layout: {
          "icon-image": "beer-marker",
          "icon-size": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1.4, // Enhanced hover size
            ["boolean", ["feature-state", "selected"], false],
            1.2, // Enhanced selected size
            1.0, // Enhanced default size
          ],
          "icon-allow-overlap": true,
          "icon-rotation-alignment": "map",
        },
        paint: {
          "icon-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            ["boolean", ["feature-state", "hover"], false],
            1,
            0.85,
          ],
        },
      });
      console.log("✅ Bars layer created successfully");

      // Add source for hover highlight circles
      m.addSource("hover-highlight", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Add hover highlight circle layer
      m.addLayer({
        id: "bars-hover-highlight",
        type: "circle",
        source: "hover-highlight",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            25,
            18,
            45,
          ],
          "circle-color": "#00ffff",
          "circle-opacity": 0.3,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ff00ff",
          "circle-stroke-opacity": 0.6,
          "circle-blur": 1,
        },
      });

      // Add source for selected highlight circles
      m.addSource("selected-highlight", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Add selected highlight circle layer
      m.addLayer({
        id: "bars-selected-highlight",
        type: "circle",
        source: "selected-highlight",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            20,
            18,
            35,
          ],
          "circle-color": "#ffff00",
          "circle-opacity": 0.4,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ff00ff",
          "circle-stroke-opacity": 0.8,
          "circle-blur": 0.5,
        },
      });

      // Initialize with current data if available
      if (bars.length > 0) {
        console.log(`🎯 Initializing map with ${bars.length} bars on map load`);
        const features = bars.map((bar) => ({
          type: "Feature" as const,
          geometry: bar.location,
          properties: {
            id: bar.id, // This is now used as the feature's unique ID
            name: bar.name,
            rating: bar.rating,
            distance: bar.distance,
          },
        }));
        const src = m.getSource(BARS_SOURCE_ID) as mapboxgl.GeoJSONSource;
        if (src) {
          src.setData({ type: "FeatureCollection", features });
          console.log("✅ Initial bars data set on map");
        }
      } else {
        console.log("📍 No bars to initialize on map load");
      }

      // Initialize radius circle
      const circleGeojson = turfCircle(center, radius, { units: "miles" });
      const radiusSrc = m.getSource(RADIUS_SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (radiusSrc) {
        radiusSrc.setData(circleGeojson);
      }

      // -- Epic Neon Cocktail Bar Marker --
      const loadBarMarker = () => {
        if (m.hasImage("beer-marker")) {
          console.log("🍸 Bar marker already loaded");
          return;
        }

        console.log("🎨 Creating neon cocktail bar marker...");
        const neonBarSvg = `
          <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <!-- Enhanced neon filters -->
              <filter id="barNeonGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#ff00ff" flood-opacity="0.9"/>
                <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#ff00ff" flood-opacity="0.6"/>
              </filter>
              <filter id="barCyanGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#00ffff" flood-opacity="0.8"/>
                <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#00ffff" flood-opacity="0.4"/>
              </filter>
              <filter id="barYellowGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffff00" flood-opacity="0.9"/>
              </filter>
              <linearGradient id="cocktailGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff00ff;stop-opacity:0.8" />
                <stop offset="50%" style="stop-color:#00ffff;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#ffff00;stop-opacity:0.8" />
              </linearGradient>
              <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#00ffff;stop-opacity:0" />
              </radialGradient>
            </defs>
            
            <!-- Outer energy ring -->
            <circle cx="30" cy="30" r="28" fill="url(#glowGradient)" opacity="0.4"/>
            
            <!-- Pulsing glow ring -->
            <circle cx="30" cy="30" r="25" fill="none" stroke="#ff00ff" stroke-width="1" opacity="0.5" filter="url(#barNeonGlow)">
              <animate attributeName="r" values="23;27;23" dur="3s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite"/>
            </circle>
            
            <!-- Main cocktail glass base -->
            <path d="M18 20 L42 20 L38 38 L22 38 Z" 
                  fill="none" 
                  stroke="#00ffff" 
                  stroke-width="2.5" 
                  filter="url(#barCyanGlow)"/>
            
            <!-- Cocktail liquid with gradient -->
            <path d="M20 22 L40 22 L36 35 L24 35 Z" 
                  fill="url(#cocktailGradient)" 
                  opacity="0.7"/>
            
            <!-- Glass stem -->
            <line x1="30" y1="38" x2="30" y2="46" 
                  stroke="#00ffff" 
                  stroke-width="2" 
                  filter="url(#barCyanGlow)"/>
            
            <!-- Base plate -->
            <ellipse cx="30" cy="47" rx="6" ry="1.5" 
                     fill="none" 
                     stroke="#00ffff" 
                     stroke-width="1.5" 
                     filter="url(#barCyanGlow)"/>
            
            <!-- Magical bubbles -->
            <circle cx="26" cy="28" r="1" fill="#ffff00" filter="url(#barYellowGlow)">
              <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/>
              <animate attributeName="cy" values="28;24;28" dur="2s" repeatCount="indefinite"/>
            </circle>
            <circle cx="34" cy="30" r="0.8" fill="#ff00ff" filter="url(#barNeonGlow)">
              <animate attributeName="opacity" values="1;0;1" dur="2.5s" repeatCount="indefinite"/>
              <animate attributeName="cy" values="30;26;30" dur="2.5s" repeatCount="indefinite"/>
            </circle>
            <circle cx="30" cy="32" r="1.2" fill="#00ffff" filter="url(#barCyanGlow)">
              <animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite"/>
              <animate attributeName="cy" values="32;28;32" dur="1.8s" repeatCount="indefinite"/>
            </circle>
            
            <!-- Cocktail garnish -->
            <circle cx="35" cy="20" r="1.5" fill="#ff00ff" filter="url(#barNeonGlow)"/>
            <path d="M35 18 L37 16" stroke="#00ff00" stroke-width="1" filter="url(#barYellowGlow)"/>
          </svg>
        `;

        const barCanvas = document.createElement("canvas");
        barCanvas.width = 60;
        barCanvas.height = 60;
        const barCtx = barCanvas.getContext("2d");

        if (!barCtx) {
          console.error("❌ Failed to get canvas context for bar marker");
          return;
        }

        const barImg = new Image();
        barImg.onload = () => {
          try {
            barCtx.drawImage(barImg, 0, 0, 60, 60);
            const barImageData = barCtx.getImageData(0, 0, 60, 60);
            
            if (m && !m.hasImage("beer-marker")) {
              m.addImage("beer-marker", {
                width: 60,
                height: 60,
                data: new Uint8Array(barImageData.data),
              });
              console.log("✅ Neon cocktail bar marker loaded successfully!");
            }
          } catch (error) {
            console.error("❌ Error loading bar marker:", error);
          }
        };
        
        barImg.onerror = () => {
          console.error("❌ Failed to load bar marker SVG");
        };
        
        barImg.src = "data:image/svg+xml;base64," + btoa(neonBarSvg);
      };

      loadBarMarker();

      // -- Map Move Event for Bounds Tracking --
      m.on("moveend", () => {
        if (!isInitialLoad.current) {
          const b = m.getBounds();
          if (b) {
            onMapViewChange([
              b.getWest(),
              b.getSouth(),
              b.getEast(),
              b.getNorth(),
            ]);
          }
        }
      });

      // -- Click & Hover on Bars --
      m.on("click", BARS_LAYER_ID, (e) => {
        const feat = e.features?.[0];
        if (feat?.properties?.id) {
          onToggleBar(String(feat.properties.id));
        }
      });
      m.on("mousemove", BARS_LAYER_ID, (e) => {
        const feat = e.features?.[0];
        if (feat) {
          console.log("🎯 Hovering over bar:", feat.properties?.name, "ID:", feat.id);
          m.getCanvas().style.cursor = "pointer";
          if (feat.id) {
            onHoverBar(String(feat.id));
          }

          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({
            closeButton: false,
            offset: 40,
            className: "neon-bar-popup",
            maxWidth: "280px",
          })
            .setLngLat((feat.geometry as MapboxPointGeometry).coordinates)
            .setHTML(
              `
              <div class="neon-popup-container">
                <div class="neon-popup-header">
                  <div class="neon-bar-icon">🍸</div>
                  <h3 class="neon-bar-name">${feat.properties!.name || 'Unknown Bar'}</h3>
                </div>
                <div class="neon-popup-content">
                  <div class="neon-stat">
                    <span class="neon-stat-icon">⭐</span>
                    <span class="neon-stat-label">Rating:</span>
                    <span class="neon-stat-value">${feat.properties!.rating ? feat.properties!.rating.toFixed(1) : '4.0'}/5</span>
                  </div>
                  <div class="neon-stat">
                    <span class="neon-stat-icon">📍</span>
                    <span class="neon-stat-label">Distance:</span>
                    <span class="neon-stat-value">${feat.properties!.distance !== undefined && feat.properties!.distance !== null ? feat.properties!.distance.toFixed(2) : 'Calculating...'} mi</span>
                  </div>
                  <div class="neon-stat">
                    <span class="neon-stat-icon">🎉</span>
                    <span class="neon-stat-label">Vibe:</span>
                    <span class="neon-stat-value">${(feat.properties!.rating || 4.0) >= 4.5 ? 'LEGENDARY' : (feat.properties!.rating || 4.0) >= 4.0 ? 'EPIC' : (feat.properties!.rating || 4.0) >= 3.5 ? 'GREAT' : 'DECENT'}</span>
                  </div>
                  <div class="neon-action-hint">
                    <span class="neon-click-hint">💫 Click to ${selectedBarIds.has(feat.properties!.id) ? 'remove from' : 'add to'} route</span>
                  </div>
                </div>
                <div class="neon-popup-glow"></div>
              </div>
              `
            )
            .addTo(m);
        }
      });
      m.on("mouseleave", BARS_LAYER_ID, () => {
        m.getCanvas().style.cursor = "";
        onHoverBar(null);
        popupRef.current?.remove();
        popupRef.current = null;
      });
    });

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      map.current?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ Only run once on mount - map initialization should not re-run when props change

  // 2. Fly to new center when it changes
  useEffect(() => {
    if (!map.current) return;
    map.current.flyTo({ center, zoom: 13, speed: 1.2 });
    isInitialLoad.current = false;
  }, [center]);

  // 3. Update Turf circle on center/radius change
  useEffect(() => {
    if (!map.current) return;

    const updateCircle = () => {
      if (!map.current?.isStyleLoaded()) return;
      const src = map.current.getSource(
        RADIUS_SOURCE_ID
      ) as mapboxgl.GeoJSONSource;
      if (!src) return;

      const circleGeojson = turfCircle(center, radius, { units: "miles" });
      src.setData(circleGeojson);
    };

    if (map.current.isStyleLoaded()) {
      updateCircle();
    } else {
      map.current.once("styledata", updateCircle);
    }
  }, [center, radius]);

  // 4. Update bar markers when \`bars\` changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) {
      // If map is not ready, wait for it
      if(map.current) {
        map.current.once("styledata", () => {
            // Re-run this effect once the style is loaded
            // A simple way is to manage a state, but this is a quick fix
        });
      }
      return;
    }

    console.log(`🗺️ Updating map with ${bars.length} bars:`, bars.map(bar => ({ name: bar.name, id: bar.id, distance: bar.distance })));

    const src = map.current.getSource(BARS_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (!src) {
        console.warn("❌ Bars source not found, cannot update");
        return;
    }
    
    // **FIX**: Mapbox requires a top-level \`id\` for feature-state to work.
    // The \`promoteId: 'id'\` on the source tells Mapbox to use the \`id\` from the \`properties\` object.
    const features = bars.map((bar) => ({
      type: "Feature" as const,
      geometry: bar.location,
      properties: {
        id: bar.id, // This is now used as the feature's unique ID
        name: bar.name,
        rating: bar.rating,
        distance: bar.distance,
      },
    }));
    
    console.log(`✅ Setting ${features.length} bar features on map`);
    src.setData({ type: "FeatureCollection", features });

  }, [bars]);

  // 5. Sync hover/selected feature states and update highlight sources
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Update hover highlight
    const hoverSource = map.current.getSource("hover-highlight") as mapboxgl.GeoJSONSource;
    if (hoverSource) {
      if (hoveredBarId) {
        const hoveredBar = bars.find(bar => bar.id === hoveredBarId);
        if (hoveredBar) {
          hoverSource.setData({
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              geometry: hoveredBar.location,
              properties: { id: hoveredBar.id }
            }]
          });
        }
      } else {
        hoverSource.setData({ type: "FeatureCollection", features: [] });
      }
    }

    // Update selected highlights
    const selectedSource = map.current.getSource("selected-highlight") as mapboxgl.GeoJSONSource;
    if (selectedSource) {
      const selectedBars = bars.filter(bar => selectedBarIds.has(bar.id));
      selectedSource.setData({
        type: "FeatureCollection",
        features: selectedBars.map(bar => ({
          type: "Feature" as const,
          geometry: bar.location,
          properties: { id: bar.id }
        }))
      });
    }

    // Update feature states for icon sizing
    if (hoveredStateId.current) {
      map.current.removeFeatureState({
        source: BARS_SOURCE_ID,
        id: hoveredStateId.current
      });
    }

    if (hoveredBarId) {
      map.current.setFeatureState(
        { source: BARS_SOURCE_ID, id: hoveredBarId },
        { hover: true }
      );
    }
    hoveredStateId.current = hoveredBarId;

    bars.forEach((bar) => {
        if (map.current) {
            map.current.setFeatureState(
                { source: BARS_SOURCE_ID, id: bar.id },
                { selected: selectedBarIds.has(bar.id) }
            );
        }
    });

  }, [hoveredBarId, selectedBarIds, bars]);

  // Animation frame reference for route animation
  const animationFrame = useRef<number | null>(null);
  const isAnimating = useRef(false);
  const routeProgress = useRef(0);

  // 6. Add/update route visualization with flowing animation, arrows, and bar highlighting
  useEffect(() => {
    if (map.current && route) {
      // Stop any existing animation
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
        isAnimating.current = false;
      }

      // Ensure sources & layers are added only once for better performance
      if (!map.current.getSource("route-background")) {
        map.current.addSource("route-background", {
          type: "geojson",
          data: route,
          lineMetrics: true,
        });
      } else {
        (
          map.current.getSource("route-background") as mapboxgl.GeoJSONSource
        ).setData(route);
      }

      if (!map.current.getSource("route-flow")) {
        map.current.addSource("route-flow", {
          type: "geojson",
          data: route,
          lineMetrics: true,
        });
      } else {
        (map.current.getSource("route-flow") as mapboxgl.GeoJSONSource).setData(
          route
        );
      }

      if (!map.current.getSource("route-particles")) {
        map.current.addSource("route-particles", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      if (!map.current.getSource("route-arrows")) {
        map.current.addSource("route-arrows", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      if (!map.current.getSource("route-bars-highlight")) {
        map.current.addSource("route-bars-highlight", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      if (!map.current.getSource("route-start-end")) {
        map.current.addSource("route-start-end", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      // Add electric neon background route layer
      if (!map.current.getLayer("route-background")) {
        map.current.addLayer({
          id: "route-background",
          type: "line",
          source: "route-background",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ff00ff",
            "line-width": 18,
            "line-opacity": 0.4,
            "line-blur": 6,
          },
        });
      }

      // Add electric outer glow layer
      if (!map.current.getLayer("route-electric-glow")) {
        map.current.addLayer({
          id: "route-electric-glow",
          type: "line",
          source: "route-background",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#00ffff",
            "line-width": 25,
            "line-opacity": 0.2,
            "line-blur": 12,
          },
        });
      }

      // Add electric flowing gradient route layer
      if (!map.current.getLayer("route-flow")) {
        map.current.addLayer({
          id: "route-flow",
          type: "line",
          source: "route-flow",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 10,
            "line-opacity": 1,
            // Electric neon gradient that flows
            "line-gradient": [
              "interpolate",
              ["linear"],
              ["line-progress"],
              0,
              "rgba(255, 0, 255, 0)",
              1,
              "rgba(255, 0, 255, 0)",
            ],
          },
        });
      }

      // Add inner electric core
      if (!map.current.getLayer("route-electric-core")) {
        map.current.addLayer({
          id: "route-electric-core",
          type: "line",
          source: "route-flow",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 4,
            "line-opacity": 0.8,
          },
        });
      }

      // Add electric energy particles layer
      if (!map.current.getLayer("route-particles")) {
        map.current.addLayer({
          id: "route-particles",
          type: "circle",
          source: "route-particles",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              6,
              18,
              14,
            ],
            "circle-color": "#00ffff",
            "circle-opacity": 1,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ff00ff",
            "circle-stroke-opacity": 1,
            "circle-blur": 0.5,
          },
        });
      }

      // Add electric spark particles
      if (!map.current.getLayer("route-sparks")) {
        map.current.addLayer({
          id: "route-sparks",
          type: "circle",
          source: "route-particles",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              2,
              18,
              6,
            ],
            "circle-color": "#ffffff",
            "circle-opacity": 0.8,
            "circle-blur": 1,
          },
        });
      }

      // Add directional arrows layer
      if (!map.current.getLayer("route-arrows")) {
        // Create electric arrow icon if it doesn't exist
        if (!map.current.hasImage("direction-arrow")) {
          const arrowSvg = `
            <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="arrowGlow" x="-50%" y="-50%" width="300%" height="300%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#00ffff" flood-opacity="0.8"/>
                  <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#00ffff" flood-opacity="0.4"/>
                </filter>
                <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#00ffff;stop-opacity:1" />
                  <stop offset="50%" style="stop-color:#ffffff;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#ff00ff;stop-opacity:1" />
                </linearGradient>
              </defs>
              
              <!-- Electric arrow with lightning effect -->
              <path d="M15 3 L25 13 L20 13 L20 21 L10 21 L10 13 L5 13 Z" 
                    fill="url(#arrowGradient)" 
                    stroke="#ffffff" 
                    stroke-width="2"
                    filter="url(#arrowGlow)"/>
              
              <!-- Inner lightning bolt -->
              <path d="M15 8 L18 12 L16 12 L17 16 L14 12 L16 12 Z" 
                    fill="#ffffff" 
                    opacity="0.9"/>
            </svg>
          `;

          const canvas = document.createElement("canvas");
          canvas.width = 30;
          canvas.height = 30;
          const ctx = canvas.getContext("2d");

          const img = new Image();
          img.onload = () => {
            if (ctx) {
              ctx.drawImage(img, 0, 0, 30, 30);
              const imageData = ctx.getImageData(0, 0, 30, 30);
              if (map.current && !map.current.hasImage("direction-arrow")) {
                map.current.addImage("direction-arrow", {
                  width: 30,
                  height: 30,
                  data: new Uint8Array(imageData.data),
                });
              }
            }
          };
          img.src = "data:image/svg+xml;base64," + btoa(arrowSvg);
        }

        map.current.addLayer({
          id: "route-arrows",
          type: "symbol",
          source: "route-arrows",
          layout: {
            "icon-image": "direction-arrow",
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.4,
              18,
              0.8,
            ],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-rotate": ["get", "bearing"],
          },
          paint: {
            "icon-opacity": 0.9,
          },
        });
      }

      // Add electric highlighted bars along route
      if (!map.current.getLayer("route-bars-highlight")) {
        map.current.addLayer({
          id: "route-bars-highlight",
          type: "circle",
          source: "route-bars-highlight",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              8,
              18,
              16,
            ],
            "circle-color": "#ffff00",
            "circle-opacity": 0.9,
            "circle-stroke-width": 4,
            "circle-stroke-color": "#ff00ff",
            "circle-stroke-opacity": 1,
            "circle-blur": 1,
          },
        });
      }

      // Add electric rings around highlighted bars
      if (!map.current.getLayer("route-bars-rings")) {
        map.current.addLayer({
          id: "route-bars-rings",
          type: "circle",
          source: "route-bars-highlight",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              12,
              18,
              24,
            ],
            "circle-color": "transparent",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#00ffff",
            "circle-stroke-opacity": 0.6,
            "circle-blur": 2,
          },
        });
      }

      // Create start and end marker icons
      if (!map.current.hasImage("start-marker")) {
        const startSvg = `
          <svg width="80" height="100" viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <!-- Neon glow filters -->
              <filter id="neonGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id="pinkGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#ff0080" flood-opacity="0.8"/>
                <feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="#ff0080" flood-opacity="0.4"/>
              </filter>
              <filter id="cyanGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#00ffff" flood-opacity="0.9"/>
                <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#00ffff" flood-opacity="0.5"/>
              </filter>
            </defs>
            
            <!-- Outer energy ring -->
            <circle cx="40" cy="40" r="38" fill="none" stroke="#00ffff" stroke-width="1" opacity="0.3" filter="url(#cyanGlow)"/>
            <circle cx="40" cy="40" r="35" fill="none" stroke="#ff0080" stroke-width="1" opacity="0.2" filter="url(#pinkGlow)"/>
            
            <!-- Neon house base -->
            <path d="M15 45 L65 45 L65 75 L15 75 Z" 
                  fill="none" 
                  stroke="#00ffff" 
                  stroke-width="3" 
                  filter="url(#cyanGlow)"/>
            
            <!-- Roof -->
            <path d="M10 45 L40 15 L70 45" 
                  fill="none" 
                  stroke="#ff0080" 
                  stroke-width="3" 
                  stroke-linejoin="round"
                  filter="url(#pinkGlow)"/>
            
            <!-- Door -->
            <rect x="32" y="55" width="16" height="20" 
                  fill="none" 
                  stroke="#00ff00" 
                  stroke-width="2" 
                  filter="url(#neonGlow)"/>
            
            <!-- Windows -->
            <rect x="20" y="50" width="8" height="8" 
                  fill="none" 
                  stroke="#ffff00" 
                  stroke-width="2" 
                  filter="url(#neonGlow)"/>
            <rect x="52" y="50" width="8" height="8" 
                  fill="none" 
                  stroke="#ffff00" 
                  stroke-width="2" 
                  filter="url(#neonGlow)"/>
            
            <!-- START text -->
            <text x="40" y="92" text-anchor="middle" 
                  font-family="Arial, sans-serif" 
                  font-size="12" 
                  font-weight="bold" 
                  fill="#00ffff" 
                  stroke="#00ffff" 
                  stroke-width="0.5"
                  filter="url(#cyanGlow)">START</text>
          </svg>
        `;

        const startCanvas = document.createElement("canvas");
        startCanvas.width = 80;
        startCanvas.height = 100;
        const startCtx = startCanvas.getContext("2d");

        const startImg = new Image();
        startImg.onload = () => {
          if (startCtx) {
            startCtx.drawImage(startImg, 0, 0, 80, 100);
            const startImageData = startCtx.getImageData(0, 0, 80, 100);
            if (map.current && !map.current.hasImage("start-marker")) {
              map.current.addImage("start-marker", {
                width: 80,
                height: 100,
                data: new Uint8Array(startImageData.data),
              });
            }
          }
        };
        startImg.src = "data:image/svg+xml;base64," + btoa(startSvg);
      }

      if (!map.current.hasImage("end-marker")) {
        const endSvg = `
          <svg width="90" height="110" viewBox="0 0 90 110" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <!-- Epic party neon filters -->
              <filter id="partyGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#ff0040" flood-opacity="1"/>
                <feDropShadow dx="0" dy="0" stdDeviation="16" flood-color="#ff0040" flood-opacity="0.6"/>
              </filter>
              <filter id="goldGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#ffff00" flood-opacity="0.9"/>
                <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#ffff00" flood-opacity="0.5"/>
              </filter>
              <filter id="purpleGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#8000ff" flood-opacity="0.8"/>
                <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#8000ff" flood-opacity="0.4"/>
              </filter>
              <filter id="greenGlow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#00ff40" flood-opacity="0.9"/>
              </filter>
              <linearGradient id="discoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff0040;stop-opacity:1" />
                <stop offset="25%" style="stop-color:#ffff00;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#00ff40;stop-opacity:1" />
                <stop offset="75%" style="stop-color:#0080ff;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#8000ff;stop-opacity:1" />
              </linearGradient>
            </defs>
            
            <!-- Outer disco energy rings -->
            <circle cx="45" cy="45" r="43" fill="none" stroke="#ff0040" stroke-width="1" opacity="0.4" filter="url(#partyGlow)"/>
            <circle cx="45" cy="45" r="40" fill="none" stroke="#ffff00" stroke-width="1" opacity="0.3" filter="url(#goldGlow)"/>
            <circle cx="45" cy="45" r="37" fill="none" stroke="#8000ff" stroke-width="1" opacity="0.3" filter="url(#purpleGlow)"/>
            
            <!-- Neon cocktail glass -->
            <path d="M25 25 L65 25 L55 55 L35 55 Z" 
                  fill="none" 
                  stroke="#ff0040" 
                  stroke-width="4" 
                  filter="url(#partyGlow)"/>
            
            <!-- Cocktail liquid with gradient -->
            <path d="M28 28 L62 28 L54 50 L36 50 Z" 
                  fill="url(#discoGradient)" 
                  opacity="0.7" 
                  filter="url(#goldGlow)"/>
            
            <!-- Stem -->
            <line x1="45" y1="55" x2="45" y2="70" 
                  stroke="#00ff40" 
                  stroke-width="3" 
                  filter="url(#greenGlow)"/>
            
            <!-- Base -->
            <ellipse cx="45" cy="72" rx="12" ry="3" 
                     fill="none" 
                     stroke="#00ff40" 
                     stroke-width="2" 
                     filter="url(#greenGlow)"/>
            
            <!-- Disco ball sparkles -->
            <circle cx="20" cy="20" r="2" fill="#ffff00" filter="url(#goldGlow)"/>
            <circle cx="70" cy="25" r="1.5" fill="#ff0040" filter="url(#partyGlow)"/>
            <circle cx="75" cy="45" r="2" fill="#8000ff" filter="url(#purpleGlow)"/>
            <circle cx="15" cy="50" r="1" fill="#00ff40" filter="url(#greenGlow)"/>
            <circle cx="75" cy="65" r="1.5" fill="#ffff00" filter="url(#goldGlow)"/>
            <circle cx="15" cy="70" r="1" fill="#ff0040" filter="url(#partyGlow)"/>
            
            <!-- Dancing stars -->
            <path d="M60 15 L62 20 L67 20 L63 23 L65 28 L60 25 L55 28 L57 23 L53 20 L58 20 Z" 
                  fill="#ffff00" 
                  filter="url(#goldGlow)"/>
            <path d="M30 10 L31 13 L34 13 L32 15 L33 18 L30 16 L27 18 L28 15 L26 13 L29 13 Z" 
                  fill="#ff0040" 
                  filter="url(#partyGlow)"/>
            
            <!-- PARTY text with neon effect -->
            <text x="45" y="95" text-anchor="middle" 
                  font-family="Arial, sans-serif" 
                  font-size="14" 
                  font-weight="bold" 
                  fill="#ff0040" 
                  stroke="#ff0040" 
                  stroke-width="0.5"
                  filter="url(#partyGlow)">PARTY</text>
          </svg>
        `;

        const endCanvas = document.createElement("canvas");
        endCanvas.width = 90;
        endCanvas.height = 110;
        const endCtx = endCanvas.getContext("2d");

        const endImg = new Image();
        endImg.onload = () => {
          if (endCtx) {
            endCtx.drawImage(endImg, 0, 0, 90, 110);
            const endImageData = endCtx.getImageData(0, 0, 90, 110);
            if (map.current && !map.current.hasImage("end-marker")) {
              map.current.addImage("end-marker", {
                width: 90,
                height: 110,
                data: new Uint8Array(endImageData.data),
              });
            }
          }
        };
        endImg.src = "data:image/svg+xml;base64," + btoa(endSvg);
      }

      // Add start/end markers layer
      if (!map.current.getLayer("route-start-end")) {
        map.current.addLayer({
          id: "route-start-end",
          type: "symbol",
          source: "route-start-end",
          layout: {
            "icon-image": ["get", "marker-type"],
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.6,
              18,
              1,
            ],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: {
            "icon-opacity": 1,
          },
        });
      }

      // Create highlighted bars data
      const routeBars = bars.filter((bar) => selectedBarIds.has(bar.id));
      const selectedBarsArray = Array.from(selectedBarIds);
      const barFeatures = routeBars.map((bar) => ({
        type: "Feature" as const,
        geometry: bar.location,
        properties: {
          id: bar.id,
          name: bar.name,
          order: selectedBarsArray.indexOf(bar.id),
        },
      }));

      const barsSource = map.current.getSource(
        "route-bars-highlight"
      ) as mapboxgl.GeoJSONSource;
      if (barsSource) {
        barsSource.setData({
          type: "FeatureCollection",
          features: barFeatures,
        });
      }

      // Create start/end markers data
      const startEndFeatures: Array<{
        type: "Feature";
        geometry: MapboxPointGeometry;
        properties: {
          "marker-type": string;
          name: string;
          type: string;
        };
      }> = [];

      if (routeBars.length >= 1) {
        // Sort bars by their selection order
        const sortedBars = routeBars.sort((a, b) => 
          selectedBarsArray.indexOf(a.id) - selectedBarsArray.indexOf(b.id)
        );

        // Start marker (at the actual start location)
        const actualStartCoords = startCoordinates || center;
        startEndFeatures.push({
          type: "Feature" as const,
          geometry: {
            type: "Point",
            coordinates: actualStartCoords,
          },
          properties: {
            "marker-type": "start-marker",
            name: "Start Location",
            type: "start",
          },
        });

        // End marker (last selected bar)
        startEndFeatures.push({
          type: "Feature" as const,
          geometry: sortedBars[sortedBars.length - 1].location,
          properties: {
            "marker-type": "end-marker",
            name: sortedBars[sortedBars.length - 1].name,
            type: "end",
          },
        });
      }

      const startEndSource = map.current.getSource(
        "route-start-end"
      ) as mapboxgl.GeoJSONSource;
      if (startEndSource) {
        startEndSource.setData({
          type: "FeatureCollection",
          features: startEndFeatures,
        });
      }

      // Start the advanced flowing animation with arrows
      if (!isAnimating.current) {
        isAnimating.current = true;

        const animate = () => {
          if (!map.current || !isAnimating.current) return;

          const currentTime = performance.now();
          const animationSpeed = 0.0005;
          routeProgress.current = (currentTime * animationSpeed) % 1;

          if (map.current.getLayer("route-flow")) {
            const flowPosition = routeProgress.current;

            const stopsData = [
              {
                p: Math.max(0, flowPosition - 0.2),
                c: "rgba(255, 0, 255, 0)",
              },
              {
                p: Math.max(0, flowPosition - 0.1),
                c: "rgba(0, 255, 255, 0.7)",
              },
              { p: flowPosition, c: "rgba(255, 255, 255, 1)" },
              {
                p: Math.min(1, flowPosition + 0.1),
                c: "rgba(255, 0, 255, 0.7)",
              },
              {
                p: Math.min(1, flowPosition + 0.2),
                c: "rgba(255, 0, 255, 0)",
              },
            ];

            const uniqueStops: { p: number; c: string }[] = [];
            const positions = new Set();

            [
              stopsData[2],
              stopsData[1],
              stopsData[3],
              stopsData[0],
              stopsData[4],
            ].forEach((stop) => {
              if (!positions.has(stop.p)) {
                uniqueStops.push(stop);
                positions.add(stop.p);
              }
            });

            uniqueStops.sort((a, b) => a.p - b.p);
            
            const gradientExpression: (string | number | string[])[] = [
              "interpolate",
              ["linear"],
              ["line-progress"],
            ];
            
            uniqueStops.forEach((stop) => {
              gradientExpression.push(stop.p, stop.c);
            });

            map.current.setPaintProperty(
              "route-flow",
              "line-gradient",
              gradientExpression as [string, ...(string | number | string[])[]]
            );
          }

          if (route && route.geometry && route.geometry.type === "LineString") {
            const coordinates = route.geometry.coordinates;
            const particles: Array<{
              type: "Feature";
              geometry: {
                type: "Point";
                coordinates: [number, number];
              };
              properties: {
                progress: number;
              };
            }> = [];
            const arrows: Array<{
              type: "Feature";
              geometry: {
                type: "Point";
                coordinates: [number, number];
              };
              properties: {
                bearing: number;
              };
            }> = [];

            // Create more electric energy particles
            for (let i = 0; i < 12; i++) {
              const particleProgress = (routeProgress.current + i * 0.08) % 1;
              const segmentIndex = Math.floor(
                particleProgress * (coordinates.length - 1)
              );
              const segmentProgress =
                (particleProgress * (coordinates.length - 1)) % 1;

              if (segmentIndex < coordinates.length - 1) {
                const start = coordinates[segmentIndex];
                const end = coordinates[segmentIndex + 1];

                const lng = start[0] + (end[0] - start[0]) * segmentProgress;
                const lat = start[1] + (end[1] - start[1]) * segmentProgress;

                particles.push({
                  type: "Feature" as const,
                  geometry: {
                    type: "Point" as const,
                    coordinates: [lng, lat],
                  },
                  properties: {
                    progress: particleProgress,
                  },
                });
              }
            }

            for (let i = 0; i < coordinates.length - 1; i += 5) {
              const start = coordinates[i];
              const end = coordinates[Math.min(i + 1, coordinates.length - 1)];

              const bearing =
                Math.atan2(end[0] - start[0], end[1] - start[1]) *
                (180 / Math.PI);

              const midLng = (start[0] + end[0]) / 2;
              const midLat = (start[1] + end[1]) / 2;

              arrows.push({
                type: "Feature" as const,
                geometry: {
                  type: "Point" as const,
                  coordinates: [midLng, midLat],
                },
                properties: {
                  bearing: bearing,
                },
              });
            }

            if (map.current.getSource("route-particles")) {
              (
                map.current.getSource(
                  "route-particles"
                ) as mapboxgl.GeoJSONSource
              ).setData({
                type: "FeatureCollection",
                features: particles,
              });
            }

            // Update sparks layer with offset particles for more electric effect
            if (map.current.getLayer("route-sparks")) {
              const offsetParticles = particles.map(particle => ({
                ...particle,
                geometry: {
                  ...particle.geometry,
                  coordinates: [
                    particle.geometry.coordinates[0] + (Math.random() - 0.5) * 0.0001,
                    particle.geometry.coordinates[1] + (Math.random() - 0.5) * 0.0001
                  ]
                }
              }));
              
              (
                map.current.getSource(
                  "route-particles"
                ) as mapboxgl.GeoJSONSource
              ).setData({
                type: "FeatureCollection",
                features: [...particles, ...offsetParticles],
              });
            }

            if (map.current.getSource("route-arrows")) {
              (
                map.current.getSource("route-arrows") as mapboxgl.GeoJSONSource
              ).setData({
                type: "FeatureCollection",
                features: arrows,
              });
            }
          }

          animationFrame.current = requestAnimationFrame(animate);
        };

        animationFrame.current = requestAnimationFrame(animate);
      }
    } else if (map.current) {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
        isAnimating.current = false;
      }

      const layersToRemove = [
        "route-electric-glow",
        "route-flow",
        "route-electric-core",
        "route-background",
        "route-particles",
        "route-sparks",
        "route-arrows",
        "route-bars-highlight",
        "route-bars-rings",
        "route-start-end",
      ];
      const sourcesToRemove = [
        "route-background",
        "route-flow",
        "route-particles",
        "route-arrows",
        "route-bars-highlight",
        "route-start-end",
      ];

      layersToRemove.forEach((layerId) => {
        if (map.current && map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });

      sourcesToRemove.forEach((sourceId) => {
        if (map.current && map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      });
    }

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
        isAnimating.current = false;
      }
    };
  }, [route, bars, selectedBarIds, startCoordinates, center]);

  // Update route when selected bars change
  // TODO: Re-implement with a browser-compatible directions solution
  // useEffect(() => {
  //   if (!directionsRef.current || selectedBars.length < 2) {
  //     directionsRef.current?.removeRoutes();
  //     return;
  //   }

  //   const waypoints = selectedBars.map((bar) => ({
  //     coordinates: bar.location.coordinates,
  //   }));

  //   directionsRef.current.setOrigin(waypoints[0].coordinates);
  //   directionsRef.current.setDestination(
  //     waypoints[waypoints.length - 1].coordinates
  //   );

  //   if (waypoints.length > 2) {
  //     for (let i = 1; i < waypoints.length - 1; i++) {
  //       directionsRef.current.addWaypoint(i - 1, waypoints[i].coordinates);
  //     }
  //   }
  // }, [selectedBars]);

  return <div ref={mapContainer} className="map-container" />;
};