// src/components/MapContainer.tsx

import React, { useEffect, useRef } from "react";
import type { AppBat } from "../pages/Home";
import { circle as turfCircle } from "@turf/turf";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "../styles/Home.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import MapLoadingIndicator from "./MapLoadingIndicator";

// Import custom hooks and utilities
import { useRouteAnimations } from "../hooks/useRouteAnimations";
import {
  createBarLayers,
  createHighlightLayers,
  BARS_SOURCE_ID,
  BARS_LAYER_ID,
  createBarMarker,
} from "../utils/mapLayers";

// Constants
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const RADIUS_SOURCE_ID = "radius-circle";
const RADIUS_FILL_LAYER = "radius-fill";
const RADIUS_OUTLINE_LAYER = "radius-outline";

// Props & types
export type MapBounds = [number, number, number, number];

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
  endCoordinates?: [number, number] | null;
  isLoadingBars?: boolean;
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
  endCoordinates,
  isLoadingBars = false,
}) => {
  // Debug props on component load
  console.log("🗺️ MapContainer received props:", {
    center,
    radius,
    barsCount: bars.length,
    selectedBarIds: Array.from(selectedBarIds),
    hoveredBarId,
    hasRoute: !!route,
    startCoordinates,
  });

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const hoveredStateId = useRef<string | null>(null);
  const isInitialLoad = useRef(true);
  const isMapReady = useRef(false);
  const popupTimeout = useRef<NodeJS.Timeout | null>(null);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

  // Custom hooks for animations
  useRouteAnimations({
    map: map.current,
    route: route || null,
    bars,
    selectedBarIds,
    startCoordinates,
    endCoordinates,
    center,
  });

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

      // Create and load bar marker, then create bars layer
      createBarMarker(m)
        .then(() => {
          console.log("🏗️ Creating bars layer with neon-pin-marker");
          createBarLayers(m);

          // NOW that bars-layer exists, add highlights in relation to it:
          createHighlightLayers(m, BARS_LAYER_ID);
          console.log("✅ Bars layer + highlight layers created successfully");

          // Finally, mark map as ready
          isMapReady.current = true;
        })
        .catch((error) => {
          console.error("❌ Failed to create bar marker:", error);
          // Fallback: still create bars layer + highlights
          createBarLayers(m);
          createHighlightLayers(m, BARS_LAYER_ID);
          isMapReady.current = true;
        });

      // Initialize with current data if available
      if (bars.length > 0) {
        console.log(`🎯 Initializing map with ${bars.length} bars on map load`);
        console.log(
          "📍 First bar location:",
          bars[0]?.location,
          "Name:",
          bars[0]?.name
        );
        const features = bars.map((bar) => ({
          type: "Feature" as const,
          geometry: bar.location,
          properties: {
            id: bar.id,
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
          // Set cursor immediately for responsiveness
          m.getCanvas().style.cursor = "pointer";

          // Only update hover state, popup creation handled in useEffect
          if (hoverTimeout.current) {
            clearTimeout(hoverTimeout.current);
          }

          hoverTimeout.current = setTimeout(() => {
            if (feat.id) {
              onHoverBar(String(feat.id));
            }
          }, 30); // Minimal debounce for state
        }
      });
      m.on("mouseleave", BARS_LAYER_ID, () => {
        // Clear timeouts to prevent stale hover effects
        if (hoverTimeout.current) {
          clearTimeout(hoverTimeout.current);
        }

        m.getCanvas().style.cursor = "";
        // Clear hover state immediately - popup removal handled in useEffect
        onHoverBar(null);
      });
    });

    return () => {
      // Cleanup timeouts
      if (hoverTimeout.current) {
        clearTimeout(hoverTimeout.current);
      }
      if (popupTimeout.current) {
        clearTimeout(popupTimeout.current);
      }
      map.current?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 4. Update bar markers when bars changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) {
      if (map.current) {
        map.current.once("styledata", () => {
          // Re-run this effect once the style is loaded
        });
      }
      return;
    }

    console.log(
      `🗺️ Updating map with ${bars.length} bars:`,
      bars.map((bar) => ({
        name: bar.name,
        id: bar.id,
        distance: bar.distance,
      }))
    );

    const src = map.current.getSource(BARS_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (!src) {
      console.warn("❌ Bars source not found, cannot update");
      return;
    }

    const features = bars.map((bar) => ({
      type: "Feature" as const,
      geometry: bar.location,
      properties: {
        id: bar.id,
        name: bar.name,
        rating: bar.rating,
        distance: bar.distance,
      },
    }));

    console.log(`✅ Setting ${features.length} bar features on map`);
    console.log("📊 Bars data:", features.slice(0, 2));
    src.setData({ type: "FeatureCollection", features });
  }, [bars]);

  // 5. Sync hover/selected feature states and update highlight sources
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Update enhanced hover highlight layers
    const hoverSource = map.current.getSource(
      "hover-highlight"
    ) as mapboxgl.GeoJSONSource;
    if (hoverSource) {
      if (hoveredBarId) {
        const hoveredBar = bars.find((bar) => bar.id === hoveredBarId);
        if (hoveredBar) {
          const hoverFeature = {
            type: "FeatureCollection" as const,
            features: [
              {
                type: "Feature" as const,
                geometry: hoveredBar.location,
                properties: { id: hoveredBar.id },
              },
            ],
          };
          hoverSource.setData(hoverFeature);
        }
      } else {
        hoverSource.setData({ type: "FeatureCollection", features: [] });
      }
    }

    // Update selected highlights
    const selectedSource = map.current.getSource(
      "selected-highlight"
    ) as mapboxgl.GeoJSONSource;
    if (selectedSource) {
      const selectedBars = bars.filter((bar) => selectedBarIds.has(bar.id));
      selectedSource.setData({
        type: "FeatureCollection",
        features: selectedBars.map((bar) => ({
          type: "Feature" as const,
          geometry: bar.location,
          properties: { id: bar.id },
        })),
      });
    }

    // Update non-selected ambient highlights
    const nonSelectedSource = map.current.getSource(
      "nonselected-highlight"
    ) as mapboxgl.GeoJSONSource;
    if (nonSelectedSource) {
      const nonSelectedBars = bars.filter(
        (bar) => !selectedBarIds.has(bar.id) && bar.id !== hoveredBarId
      );
      nonSelectedSource.setData({
        type: "FeatureCollection",
        features: nonSelectedBars.map((bar) => ({
          type: "Feature" as const,
          geometry: bar.location,
          properties: { id: bar.id },
        })),
      });
    }

    // Update feature states for icon sizing
    if (hoveredStateId.current) {
      map.current.removeFeatureState({
        source: BARS_SOURCE_ID,
        id: hoveredStateId.current,
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

  // 6. Handle popup creation/removal based on hoveredBarId changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Remove existing popup with a fade-out effect
    if (popupRef.current) {
      const popupElement = popupRef.current.getElement();
      if (popupElement) {
        popupElement.classList.add("closing");
        setTimeout(() => {
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }
        }, 300); // Match animation duration
      }
    }

    // Create popup if a bar is hovered
    if (hoveredBarId) {
      const hoveredBar = bars.find((bar) => bar.id === hoveredBarId);
      if (hoveredBar) {
        const rating = hoveredBar.rating || 4.0;
        const vibeData = {
          vibe:
            rating >= 4.5
              ? "LEGENDARY"
              : rating >= 4.0
              ? "EPIC"
              : rating >= 3.5
              ? "GREAT"
              : "DECENT",
          vibeIcon:
            rating >= 4.5
              ? "🌟"
              : rating >= 4.0
              ? "🎉"
              : rating >= 3.5
              ? "✨"
              : "👍",
          vibeColor:
            rating >= 4.5
              ? "#ffff00"
              : rating >= 4.0
              ? "#ff00ff"
              : rating >= 3.5
              ? "#00ffff"
              : "#ffffff",
        };

        popupRef.current = new mapboxgl.Popup({
          closeButton: false,
          offset: [0, -50],
          className: "neon-bar-popup",
          maxWidth: "280px",
          anchor: "bottom",
          focusAfterOpen: false,
        })
          .setLngLat(hoveredBar.location.coordinates)
          .setHTML(
            `
            <div class="neon-popup-container">
              <div class="neon-popup-header">
                <div class="neon-bar-icon">🍸</div>
                <h3 class="neon-bar-name">${
                  hoveredBar.name || "Unknown Bar"
                }</h3>
              </div>
              <div class="neon-popup-content">
                <div class="neon-stat">
                  <span class="neon-stat-icon">⭐</span>
                  <span class="neon-stat-label">Rating:</span>
                  <span class="neon-stat-value">${rating.toFixed(1)}/5</span>
                </div>
                <div class="neon-stat">
                  <span class="neon-stat-icon">📍</span>
                  <span class="neon-stat-label">Distance:</span>
                  <span class="neon-stat-value">${
                    hoveredBar.distance !== undefined &&
                    hoveredBar.distance !== null
                      ? hoveredBar.distance.toFixed(2)
                      : "Calculating..."
                  } mi</span>
                </div>
                <div class="neon-stat">
                  <span class="neon-stat-icon">${vibeData.vibeIcon}</span>
                  <span class="neon-stat-label">Vibe:</span>
                  <span class="neon-stat-value" style="color: ${
                    vibeData.vibeColor
                  }">${vibeData.vibe}</span>
                </div>
                <div class="neon-action-hint">
                  <span class="neon-click-hint">💫 Click to ${
                    selectedBarIds.has(hoveredBar.id) ? "remove from" : "add to"
                  } route</span>
                </div>
              </div>
              <div class="neon-popup-glow"></div>
            </div>
            `
          )
          .addTo(map.current);
      }
    }
  }, [hoveredBarId, bars, selectedBarIds]);

  return (
    <div className="map-container" style={{ position: "relative" }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      {(isLoadingBars || (bars.length === 0 && !isMapReady.current)) && (
        <MapLoadingIndicator
          message={
            isLoadingBars
              ? "Finding the perfect bars..."
              : "Initializing the crawlfamap..."
          }
        />
      )}
    </div>
  );
};
