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
      });
      m.addLayer({
        id: BARS_LAYER_ID,
        type: "symbol",
        source: BARS_SOURCE_ID,
        layout: {
          "icon-image": "beer-marker",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 18, 1],
          "icon-allow-overlap": true,
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

      // Initialize with current data if available
      if (bars.length > 0) {
        const features = bars.map((bar) => ({
          type: "Feature" as const,
          geometry: bar.location,
          properties: {
            id: bar.id,
            name: bar.name,
            rating: bar.rating,
          },
        }));
        const src = m.getSource(BARS_SOURCE_ID) as mapboxgl.GeoJSONSource;
        if (src) {
          src.setData({ type: "FeatureCollection", features });
        }
      }

      // Initialize radius circle
      const circleGeojson = turfCircle(center, radius, { units: "miles" });
      const radiusSrc = m.getSource(RADIUS_SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (radiusSrc) {
        radiusSrc.setData(circleGeojson);
      }

      // -- Pulsing Dot for Bar Marker --
      const size = 100;
      const pulsingDot = {
        width: size,
        height: size,
        data: new Uint8Array(size * size * 4),
        context: null as CanvasRenderingContext2D | null,
        onAdd: function () {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          this.context = canvas.getContext("2d");
        },
        render: function () {
          if (!this.context) return false;
          const duration = 1500;
          const t = (performance.now() % duration) / duration;
          const inner = size * 0.1;
          const outer = size * 0.3 * t + inner;
          const ctx = this.context!;
          ctx.clearRect(0, 0, size, size);

          // Outer expanding circle
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, outer, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(138,43,226,${1 - t})`;
          ctx.fill();

          // Inner solid dot
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, inner, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(138,43,226,1)";
          ctx.lineWidth = 2 + 4 * (1 - t);
          ctx.strokeStyle = "#fff";
          ctx.fill();
          ctx.stroke();

          // Copy to image data
          const image = ctx.getImageData(0, 0, size, size);
          this.data = new Uint8Array(image.data);
          map.current!.triggerRepaint();
          return true;
        },
      };
      m.addImage("beer-marker", pulsingDot, { pixelRatio: 2 });

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
          m.getCanvas().style.cursor = "pointer";
          const id = String(feat.properties!.id);
          onHoverBar(id);

          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({
            closeButton: false,
            offset: 25,
            className: "bar-popup",
          })
            .setLngLat((feat.geometry as MapboxPointGeometry).coordinates)
            .setHTML(
              `<h3>${feat.properties!.name}</h3><p>Rating: ${
                feat.properties!.rating
              } ⭐</p>`
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
  }, []);

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
    if (!map.current) return;

    console.log("Updating bars on map:", bars.length);

    const updateBars = () => {
      if (!map.current?.isStyleLoaded()) return;
      const src = map.current.getSource(
        BARS_SOURCE_ID
      ) as mapboxgl.GeoJSONSource;
      if (!src) return;

      const features = bars.map((bar) => ({
        type: "Feature" as const,
        geometry: bar.location,
        properties: {
          id: bar.id,
          name: bar.name,
          rating: bar.rating,
        },
      }));
      console.log("Setting bar features:", features.length);
      src.setData({ type: "FeatureCollection", features });
    };

    if (map.current.isStyleLoaded()) {
      updateBars();
    } else {
      map.current.once("styledata", updateBars);
    }
  }, [bars]);

  // 5. Sync hover/selected feature states
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Clear old hover
    if (hoveredStateId.current) {
      map.current.setFeatureState(
        { source: BARS_SOURCE_ID, id: hoveredStateId.current },
        { hover: false }
      );
    }
    // Set new hover
    if (hoveredBarId) {
      map.current.setFeatureState(
        { source: BARS_SOURCE_ID, id: hoveredBarId },
        { hover: true }
      );
    }
    hoveredStateId.current = hoveredBarId;

    // Mark selected bars
    bars.forEach((bar) => {
      map.current!.setFeatureState(
        { source: BARS_SOURCE_ID, id: bar.id },
        { selected: selectedBarIds.has(bar.id) }
      );
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

      // Add background route layer (solid, semi-transparent)
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
            "line-color": "#8A2BE2",
            "line-width": 12,
            "line-opacity": 0.25,
            "line-blur": 2,
          },
        });
      }

      // Add flowing gradient route layer using line-gradient
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
            "line-color": "#FF6B6B",
            "line-width": 8,
            "line-opacity": 0.9,
            // Use line-gradient for smooth flowing effect
            "line-gradient": [
              "interpolate",
              ["linear"],
              ["line-progress"],
              0,
              "rgba(255, 107, 107, 0)",
              1,
              "rgba(255, 107, 107, 0)",
            ],
          },
        });
      }

      // Add moving particles layer for extra flow effect
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
              4,
              18,
              10,
            ],
            "circle-color": "#FFD700",
            "circle-opacity": 0.9,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#FF6B6B",
            "circle-stroke-opacity": 0.8,
          },
        });
      }

      // Add directional arrows layer
      if (!map.current.getLayer("route-arrows")) {
        // Create arrow icon if it doesn't exist
        if (!map.current.hasImage("direction-arrow")) {
          const arrowSvg = `
            <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 2 L18 10 L14 10 L14 16 L6 16 L6 10 L2 10 Z" 
                    fill="#FF6B6B" 
                    stroke="#FFFFFF" 
                    stroke-width="1"/>
            </svg>
          `;

          const canvas = document.createElement("canvas");
          canvas.width = 20;
          canvas.height = 20;
          const ctx = canvas.getContext("2d");

          const img = new Image();
          img.onload = () => {
            if (ctx) {
              ctx.drawImage(img, 0, 0, 20, 20);
              const imageData = ctx.getImageData(0, 0, 20, 20);
              if (map.current && !map.current.hasImage("direction-arrow")) {
                map.current.addImage("direction-arrow", {
                  width: 20,
                  height: 20,
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

      // Add highlighted bars along route
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
              4,
              18,
              10,
            ],
            "circle-color": "#FFD700",
            "circle-opacity": 0.8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#FF6B6B",
            "circle-stroke-opacity": 1,
          },
        });
      }

      // Create start and end marker icons
      if (!map.current.hasImage("start-marker")) {
        const startSvg = `
          <svg width="60" height="80" viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="startGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#3bb2d0;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#00d4ff;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#0099cc;stop-opacity:1" />
              </linearGradient>
              <linearGradient id="startGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#3bb2d0;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#00d4ff;stop-opacity:0.4" />
              </linearGradient>
              <filter id="startShadow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#3bb2d0" flood-opacity="0.6"/>
                <feDropShadow dx="0" dy="2" stdDeviation="12" flood-color="#00d4ff" flood-opacity="0.3"/>
              </filter>
              <filter id="startInnerGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            <!-- Outer glow ring -->
            <circle cx="30" cy="30" r="32" fill="url(#startGlow)" opacity="0.3" filter="url(#startShadow)"/>
            
            <!-- Main pin shape with modern design -->
            <path d="M30 75 C30 75 55 52 55 30 C55 16.193 43.807 5 30 5 C16.193 5 5 16.193 5 30 C5 52 30 75 30 75 Z" 
                  fill="url(#startGradient)" 
                  stroke="#ffffff" 
                  stroke-width="3"
                  filter="url(#startShadow)"/>
            
            <!-- Inner highlight -->
            <path d="M30 70 C30 70 50 50 50 30 C50 18.954 41.046 10 30 10 C18.954 10 10 18.954 10 30 C10 50 30 70 30 70 Z" 
                  fill="none" 
                  stroke="rgba(255,255,255,0.4)" 
                  stroke-width="1"/>
            
            <!-- Center icon circle -->
            <circle cx="30" cy="30" r="18" fill="rgba(255,255,255,0.95)" filter="url(#startInnerGlow)"/>
            <circle cx="30" cy="30" r="15" fill="#1a1a2e" opacity="0.8"/>
            
            <!-- Start flag icon -->
            <path d="M25 22 L25 38 M25 22 L38 27 L25 32 Z" 
                  fill="#3bb2d0" 
                  stroke="#ffffff" 
                  stroke-width="1.5" 
                  stroke-linejoin="round"/>
            <circle cx="25" cy="22" r="2" fill="#00d4ff"/>
          </svg>
        `;

        const startCanvas = document.createElement("canvas");
        startCanvas.width = 60;
        startCanvas.height = 80;
        const startCtx = startCanvas.getContext("2d");

        const startImg = new Image();
        startImg.onload = () => {
          if (startCtx) {
            startCtx.drawImage(startImg, 0, 0, 60, 80);
            const startImageData = startCtx.getImageData(0, 0, 60, 80);
            if (map.current && !map.current.hasImage("start-marker")) {
              map.current.addImage("start-marker", {
                width: 60,
                height: 80,
                data: new Uint8Array(startImageData.data),
              });
            }
          }
        };
        startImg.src = "data:image/svg+xml;base64," + btoa(startSvg);
      }

      if (!map.current.hasImage("end-marker")) {
        const endSvg = `
          <svg width="60" height="80" viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="endGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FF6B6B;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#ff4757;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ff3742;stop-opacity:1" />
              </linearGradient>
              <linearGradient id="endGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FF6B6B;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#ff4757;stop-opacity:0.4" />
              </linearGradient>
              <linearGradient id="partyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FFD700;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#ffa502;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ff6348;stop-opacity:1" />
              </linearGradient>
              <filter id="endShadow" x="-50%" y="-50%" width="300%" height="300%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#FF6B6B" flood-opacity="0.6"/>
                <feDropShadow dx="0" dy="2" stdDeviation="12" flood-color="#ff4757" flood-opacity="0.3"/>
              </filter>
              <filter id="endInnerGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id="sparkle" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            <!-- Outer glow ring -->
            <circle cx="30" cy="30" r="32" fill="url(#endGlow)" opacity="0.3" filter="url(#endShadow)"/>
            
            <!-- Main pin shape with party vibes -->
            <path d="M30 75 C30 75 55 52 55 30 C55 16.193 43.807 5 30 5 C16.193 5 5 16.193 5 30 C5 52 30 75 30 75 Z" 
                  fill="url(#endGradient)" 
                  stroke="#ffffff" 
                  stroke-width="3"
                  filter="url(#endShadow)"/>
            
            <!-- Inner highlight -->
            <path d="M30 70 C30 70 50 50 50 30 C50 18.954 41.046 10 30 10 C18.954 10 10 18.954 10 30 C10 50 30 70 30 70 Z" 
                  fill="none" 
                  stroke="rgba(255,255,255,0.4)" 
                  stroke-width="1"/>
            
            <!-- Center icon circle -->
            <circle cx="30" cy="30" r="18" fill="rgba(255,255,255,0.95)" filter="url(#endInnerGlow)"/>
            <circle cx="30" cy="30" r="15" fill="#1a1a2e" opacity="0.8"/>
            
            <!-- Party celebration icon - confetti and champagne -->
            <path d="M26 38 L26 25 L28 25 L28 38 M24 28 L30 28" 
                  stroke="#FFD700" 
                  stroke-width="2" 
                  stroke-linecap="round"/>
            <path d="M28 25 Q30 22 32 25 L30 27 Z" 
                  fill="url(#partyGradient)"/>
            
            <!-- Confetti particles -->
            <circle cx="22" cy="24" r="1.5" fill="#FFD700" filter="url(#sparkle)"/>
            <circle cx="38" cy="26" r="1" fill="#ff4757" filter="url(#sparkle)"/>
            <circle cx="35" cy="35" r="1.5" fill="#3bb2d0" filter="url(#sparkle)"/>
            <circle cx="24" cy="36" r="1" fill="#FFD700" filter="url(#sparkle)"/>
            <rect x="36" y="22" width="2" height="2" fill="#ff4757" transform="rotate(45 37 23)" filter="url(#sparkle)"/>
            <rect x="21" y="33" width="2" height="2" fill="#3bb2d0" transform="rotate(45 22 34)" filter="url(#sparkle)"/>
          </svg>
        `;

        const endCanvas = document.createElement("canvas");
        endCanvas.width = 60;
        endCanvas.height = 80;
        const endCtx = endCanvas.getContext("2d");

        const endImg = new Image();
        endImg.onload = () => {
          if (endCtx) {
            endCtx.drawImage(endImg, 0, 0, 60, 80);
            const endImageData = endCtx.getImageData(0, 0, 60, 80);
            if (map.current && !map.current.hasImage("end-marker")) {
              map.current.addImage("end-marker", {
                width: 60,
                height: 80,
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
                c: "rgba(255, 107, 107, 0)",
              },
              {
                p: Math.max(0, flowPosition - 0.1),
                c: "rgba(255, 107, 107, 0.5)",
              },
              { p: flowPosition, c: "rgba(255, 107, 107, 1)" },
              {
                p: Math.min(1, flowPosition + 0.1),
                c: "rgba(255, 107, 107, 0.5)",
              },
              {
                p: Math.min(1, flowPosition + 0.2),
                c: "rgba(255, 107, 107, 0)",
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

            for (let i = 0; i < 6; i++) {
              const particleProgress = (routeProgress.current + i * 0.15) % 1;
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
        "route-flow",
        "route-background",
        "route-particles",
        "route-arrows",
        "route-bars-highlight",
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
        if (map.current!.getLayer(layerId)) {
          map.current!.removeLayer(layerId);
        }
      });

      sourcesToRemove.forEach((sourceId) => {
        if (map.current!.getSource(sourceId)) {
          map.current!.removeSource(sourceId);
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