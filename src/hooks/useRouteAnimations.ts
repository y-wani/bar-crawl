// src/hooks/useRouteAnimations.ts

import { useEffect, useRef } from "react";
import type { AppBat } from "../pages/Home";
import { createInRouteBarMarker } from "../utils/mapLayers"; // Import the new marker function


interface MapboxPointGeometry {
  type: "Point";
  coordinates: [number, number];
}

interface UseRouteAnimationsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any | null; // mapboxgl.Map
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
  bars: AppBat[];
  selectedBarIds: Set<string>;
  startCoordinates?: [number, number] | null;
  endCoordinates?: [number, number] | null;
  center: [number, number];
}

export const useRouteAnimations = ({
  map,
  route,
  bars,
  selectedBarIds,
  startCoordinates,
  endCoordinates,
  center,
}: UseRouteAnimationsProps) => {
  const animationFrame = useRef<number | null>(null);
  const isAnimating = useRef(false);
  const routeProgress = useRef(0);

  useEffect(() => {
    if (!map) return;

    if (route) {
      console.log("🎬 Starting route animations");

      // Load the custom in-route bar marker
      createInRouteBarMarker(map);

      // Stop any existing animation
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
        isAnimating.current = false;
      }

      // Ensure sources & layers are added only once for better performance
      if (!map.getSource("route-background")) {
        map.addSource("route-background", {
          type: "geojson",
          data: route,
          lineMetrics: true,
        });
      } else {
        (map.getSource("route-background") as mapboxgl.GeoJSONSource).setData(
          route
        );
      }

      if (!map.getSource("route-flow")) {
        map.addSource("route-flow", {
          type: "geojson",
          data: route,
          lineMetrics: true,
        });
      } else {
        (map.getSource("route-flow") as mapboxgl.GeoJSONSource).setData(route);
      }

      if (!map.getSource("route-particles")) {
        map.addSource("route-particles", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      if (!map.getSource("route-arrows")) {
        map.addSource("route-arrows", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      if (!map.getSource("route-bars-highlight")) {
        map.addSource("route-bars-highlight", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      if (!map.getSource("route-start-end")) {
        map.addSource("route-start-end", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      // Add electric neon background route layer
      if (!map.getLayer("route-background")) {
        map.addLayer({
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
      if (!map.getLayer("route-electric-glow")) {
        map.addLayer({
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
      if (!map.getLayer("route-flow")) {
        map.addLayer({
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
      if (!map.getLayer("route-electric-core")) {
        map.addLayer({
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
      if (!map.getLayer("route-particles")) {
        map.addLayer({
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
      if (!map.getLayer("route-sparks")) {
        map.addLayer({
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
      if (!map.getLayer("route-arrows")) {
        // Create electric arrow icon if it doesn't exist
        if (!map.hasImage("direction-arrow")) {
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
              
              <path d="M15 3 L25 13 L20 13 L20 21 L10 21 L10 13 L5 13 Z" 
                    fill="url(#arrowGradient)" 
                    stroke="#ffffff" 
                    stroke-width="2"
                    filter="url(#arrowGlow)"/>
              
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
              if (map && !map.hasImage("direction-arrow")) {
                map.addImage("direction-arrow", {
                  width: 30,
                  height: 30,
                  data: new Uint8Array(imageData.data),
                });
              }
            }
          };
          img.src = "data:image/svg+xml;base64," + btoa(arrowSvg);
        }

        map.addLayer({
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
      if (!map.getLayer("route-bars-highlight")) {
        map.addLayer({
          id: "route-bars-highlight",
          type: "symbol", // Changed to symbol
          source: "route-bars-highlight",
          layout: {
            "icon-image": "in-route-bar-marker", // Use the new custom marker
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.6,
              18,
              1.2,
            ],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-anchor": "bottom",
          },
        });
      }

      // Add electric rings around highlighted bars
      if (!map.getLayer("route-bars-rings")) {
        map.addLayer({
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
      if (!map.hasImage("start-marker")) {
        const startSvg = `
          <svg width="80" height="100" viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
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
            
            <circle cx="40" cy="40" r="38" fill="none" stroke="#00ffff" stroke-width="1" opacity="0.3" filter="url(#cyanGlow)"/>
            <circle cx="40" cy="40" r="35" fill="none" stroke="#ff0080" stroke-width="1" opacity="0.2" filter="url(#pinkGlow)"/>
            
            <path d="M15 45 L65 45 L65 75 L15 75 Z" 
                  fill="none" 
                  stroke="#00ffff" 
                  stroke-width="3" 
                  filter="url(#cyanGlow)"/>
            
            <path d="M10 45 L40 15 L70 45" 
                  fill="none" 
                  stroke="#ff0080" 
                  stroke-width="3" 
                  stroke-linejoin="round"
                  filter="url(#pinkGlow)"/>
            
            <rect x="32" y="55" width="16" height="20" 
                  fill="none" 
                  stroke="#00ff00" 
                  stroke-width="2" 
                  filter="url(#neonGlow)"/>
            
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
            if (map && !map.hasImage("start-marker")) {
              map.addImage("start-marker", {
                width: 80,
                height: 100,
                data: new Uint8Array(startImageData.data),
              });
            }
          }
        };
        startImg.src = "data:image/svg+xml;base64," + btoa(startSvg);
      }

      if (!map.hasImage("end-marker")) {
        const endSvg = `
          <svg width="90" height="110" viewBox="0 0 90 110" xmlns="http://www.w3.org/2000/svg">
            <defs>
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
            
            <circle cx="45" cy="45" r="43" fill="none" stroke="#ff0040" stroke-width="1" opacity="0.4" filter="url(#partyGlow)"/>
            <circle cx="45" cy="45" r="40" fill="none" stroke="#ffff00" stroke-width="1" opacity="0.3" filter="url(#goldGlow)"/>
            <circle cx="45" cy="45" r="37" fill="none" stroke="#8000ff" stroke-width="1" opacity="0.3" filter="url(#purpleGlow)"/>
            
            <path d="M25 25 L65 25 L55 55 L35 55 Z" 
                  fill="none" 
                  stroke="#ff0040" 
                  stroke-width="4" 
                  filter="url(#partyGlow)"/>
            
            <path d="M28 28 L62 28 L54 50 L36 50 Z" 
                  fill="url(#discoGradient)" 
                  opacity="0.7" 
                  filter="url(#goldGlow)"/>
            
            <line x1="45" y1="55" x2="45" y2="70" 
                  stroke="#00ff40" 
                  stroke-width="3" 
                  filter="url(#greenGlow)"/>
            
            <ellipse cx="45" cy="72" rx="12" ry="3" 
                     fill="none" 
                     stroke="#00ff40" 
                     stroke-width="2" 
                     filter="url(#greenGlow)"/>
            
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
            if (map && !map.hasImage("end-marker")) {
              map.addImage("end-marker", {
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
      if (!map.getLayer("route-start-end")) {
        map.addLayer({
          id: "route-start-end",
          type: "symbol",
          source: "route-start-end",
          layout: {
            "icon-image": ["get", "marker-type"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 18, 1],
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

      const barsSource = map.getSource(
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
        const sortedBars = routeBars.sort(
          (a, b) =>
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

        // End marker (at end coordinates if available, otherwise last selected bar)
        const endLocation = endCoordinates
          ? {
              type: "Point" as const,
              coordinates: endCoordinates,
            }
          : sortedBars[sortedBars.length - 1].location;

        const endName = endCoordinates
          ? "End Location"
          : sortedBars[sortedBars.length - 1].name;

        startEndFeatures.push({
          type: "Feature" as const,
          geometry: endLocation,
          properties: {
            "marker-type": "end-marker",
            name: endName,
            type: "end",
          },
        });
      }

      const startEndSource = map.getSource(
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
          if (!map || !isAnimating.current) return;

          const currentTime = performance.now();
          const animationSpeed = 0.0002; // Reduced from 0.0005 to slow down animation
          routeProgress.current = (currentTime * animationSpeed) % 1;

          if (map.getLayer("route-flow")) {
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

            map.setPaintProperty(
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

            if (map.getSource("route-particles")) {
              (
                map.getSource("route-particles") as mapboxgl.GeoJSONSource
              ).setData({
                type: "FeatureCollection",
                features: particles,
              });
            }

            // Update sparks layer with offset particles for more electric effect
            if (map.getLayer("route-sparks")) {
              const offsetParticles = particles.map((particle) => ({
                ...particle,
                geometry: {
                  ...particle.geometry,
                  coordinates: [
                    particle.geometry.coordinates[0] +
                      (Math.random() - 0.5) * 0.0001,
                    particle.geometry.coordinates[1] +
                      (Math.random() - 0.5) * 0.0001,
                  ],
                },
              }));

              (
                map.getSource("route-particles") as mapboxgl.GeoJSONSource
              ).setData({
                type: "FeatureCollection",
                features: [...particles, ...offsetParticles],
              });
            }

            if (map.getSource("route-arrows")) {
              (map.getSource("route-arrows") as mapboxgl.GeoJSONSource).setData(
                {
                  type: "FeatureCollection",
                  features: arrows,
                }
              );
            }
          }

          animationFrame.current = requestAnimationFrame(animate);
        };

        animationFrame.current = requestAnimationFrame(animate);
      }
    } else {
      // Clean up route layers when no route
      console.log("🧹 Cleaning up route animations");

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
        if (map && map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
      });

      sourcesToRemove.forEach((sourceId) => {
        if (map && map.getSource(sourceId)) {
          map.removeSource(sourceId);
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
  }, [
    map,
    route,
    bars,
    selectedBarIds,
    startCoordinates,
    endCoordinates,
    center,
  ]);

  return {
    cleanup: () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
        isAnimating.current = false;
      }
    },
  };
};
