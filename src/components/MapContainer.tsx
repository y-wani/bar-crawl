// src/components/MapContainer.tsx

import React, { useEffect, useRef, useState } from "react";
import type { AppBat } from "../pages/Home";
import { circle as turfCircle } from "@turf/turf";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "../styles/Home.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import MapLoadingIndicator from "./MapLoadingIndicator";
import { ShareRouteButton } from "./ShareRouteButton";

// Import custom hooks and utilities
import { useRouteAnimations } from "../hooks/useRouteAnimations";
import {
  createBarLayers,
  BARS_SOURCE_ID,
  BARS_LAYER_ID,
  BARS_SELECTED_CIRCLE_ID,
  createBarMarker,
} from "../utils/mapLayers";

// Build GeoJSON features for the bars source. Selection is data-driven:
// `selectedOrder` is the 0-based stop number, or -1 when not selected.
const buildBarFeatures = (bars: AppBat[], selectedBarIds: Set<string>) => {
  const selectionOrder = Array.from(selectedBarIds);
  return bars.map((bar) => ({
    type: "Feature" as const,
    geometry: bar.location,
    properties: {
      id: bar.id,
      name: bar.name,
      rating: bar.rating,
      distance: bar.distance,
      selectedOrder: selectionOrder.indexOf(bar.id),
    },
  }));
};

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
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const hoveredStateId = useRef<string | null>(null);
  const isInitialLoad = useRef(true);
  const isMapReady = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  // Latest bars/selection for use inside the one-time load handler closure
  const barsRef = useRef(bars);
  barsRef.current = bars;
  const selectedIdsRef = useRef(selectedBarIds);
  selectedIdsRef.current = selectedBarIds;

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
          "fill-color": "#ecb256",
          "fill-opacity": 0.08,
        },
      });
      m.addLayer({
        id: RADIUS_OUTLINE_LAYER,
        type: "line",
        source: RADIUS_SOURCE_ID,
        paint: {
          "line-color": "#ecb256",
          "line-width": 2,
          "line-opacity": 0.6,
        },
      });

      // Create and load bar marker, then create bars layers.
      // The bars source/layers only exist after this resolves, so initial
      // data is set here and `mapReady` unblocks the bars-update effect.
      const finishSetup = () => {
        createBarLayers(m);

        const initialBars = barsRef.current;
        if (initialBars.length > 0) {
          const src = m.getSource(BARS_SOURCE_ID) as mapboxgl.GeoJSONSource;
          if (src) {
            src.setData({
              type: "FeatureCollection",
              features: buildBarFeatures(initialBars, selectedIdsRef.current),
            });
          }
        }

        isMapReady.current = true;
        setMapReady(true);
      };

      createBarMarker(m)
        .then(finishSetup)
        .catch((error) => {
          console.error("❌ Failed to create bar marker:", error);
          finishSetup();
        });

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

      // -- Click & Hover on Bars (pins + selected stop circles) --
      [BARS_LAYER_ID, BARS_SELECTED_CIRCLE_ID].forEach((layerId) => {
        m.on("click", layerId, (e) => {
          const feat = e.features?.[0];
          if (feat?.properties?.id) {
            onToggleBar(String(feat.properties.id));
          }
        });

        m.on("mousemove", layerId, (e) => {
          const feat = e.features?.[0];
          if (feat?.id != null) {
            m.getCanvas().style.cursor = "pointer";
            onHoverBar(String(feat.id));
          }
        });

        m.on("mouseleave", layerId, () => {
          m.getCanvas().style.cursor = "";
          onHoverBar(null);
        });
      });
    });

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.current?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Fly to new center when it changes (skip no-op flights)
  useEffect(() => {
    if (!map.current) return;
    const current = map.current.getCenter();
    const moved =
      Math.abs(current.lng - center[0]) > 1e-5 ||
      Math.abs(current.lat - center[1]) > 1e-5;
    if (moved) {
      map.current.flyTo({ center, zoom: 13, speed: 1.2 });
    }
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

  // 4. Update bar data when bars or selection change (waits for mapReady).
  // Selection order rides along as the `selectedOrder` property, which
  // drives the numbered stop circles via layer filters.
  useEffect(() => {
    if (!map.current || !mapReady) return;

    const src = map.current.getSource(BARS_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (!src) return;

    src.setData({
      type: "FeatureCollection",
      features: buildBarFeatures(bars, selectedBarIds),
    });
  }, [bars, selectedBarIds, mapReady]);

  // 5. Sync hover feature-state — only touch the two affected features
  useEffect(() => {
    if (!map.current || !mapReady) return;

    if (hoveredStateId.current && hoveredStateId.current !== hoveredBarId) {
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
  }, [hoveredBarId, mapReady]);

  // 6. Show/hide the single persistent hover popup
  useEffect(() => {
    if (!map.current || !mapReady) return;

    if (!hoveredBarId) {
      popupRef.current?.remove();
      return;
    }

    {
      const hoveredBar = bars.find((bar) => bar.id === hoveredBarId);
      if (hoveredBar) {
        // Reuse one popup instance — create lazily, then just move/refill it
        if (!popupRef.current) {
          popupRef.current = new mapboxgl.Popup({
            closeButton: false,
            className: "neon-bar-popup",
            maxWidth: "280px",
            anchor: "bottom",
            focusAfterOpen: false,
          });
        }
        const isSelected = selectedBarIds.has(hoveredBar.id);

        const ratingHtml =
          hoveredBar.rating > 0
            ? `${hoveredBar.rating.toFixed(1)}/5${
                hoveredBar.userRatingCount !== undefined
                  ? ` <span class="review-count">(${hoveredBar.userRatingCount.toLocaleString()})</span>`
                  : ""
              }`
            : "New";

        const openRow =
          hoveredBar.openNow !== undefined
            ? `
                <div class="neon-stat">
                  <span class="neon-stat-icon">🕒</span>
                  <span class="neon-stat-label">Status:</span>
                  <span class="neon-stat-value ${
                    hoveredBar.openNow ? "open-now" : "closed-now"
                  }">${hoveredBar.openNow ? "Open now" : "Closed"}</span>
                </div>`
            : "";

        const addressRow = hoveredBar.address
          ? `
                <div class="neon-stat">
                  <span class="neon-stat-icon">🏠</span>
                  <span class="popup-address">${hoveredBar.address}</span>
                </div>`
          : "";

        popupRef.current
          .setOffset([0, isSelected ? -20 : -38])
          .setLngLat(hoveredBar.location.coordinates)
          .setHTML(
            `
            <div class="neon-popup-container">
              <div class="neon-popup-header">
                <div class="neon-bar-icon">🍸</div>
                <h3 class="neon-bar-name">${
                  hoveredBar.name || "Unknown Bar"
                }${hoveredBar.priceText ? ` <span class="review-count">${hoveredBar.priceText}</span>` : ""}</h3>
              </div>
              <div class="neon-popup-content">
                <div class="neon-stat">
                  <span class="neon-stat-icon">⭐</span>
                  <span class="neon-stat-label">Rating:</span>
                  <span class="neon-stat-value">${ratingHtml}</span>
                </div>
                <div class="neon-stat">
                  <span class="neon-stat-icon">📍</span>
                  <span class="neon-stat-label">Distance:</span>
                  <span class="neon-stat-value">${
                    hoveredBar.distance !== undefined &&
                    hoveredBar.distance !== null
                      ? hoveredBar.distance.toFixed(2)
                      : "—"
                  } mi</span>
                </div>${openRow}${addressRow}
                <div class="neon-action-hint">
                  <span class="neon-click-hint">Click to ${
                    isSelected ? "remove from" : "add to"
                  } route</span>
                </div>
              </div>
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
      {(isLoadingBars || (bars.length === 0 && !mapReady)) && (
        <MapLoadingIndicator
          message={
            isLoadingBars
              ? "Finding the perfect bars..."
              : "Initializing the map..."
          }
        />
      )}
      
      <ShareRouteButton
        route={route}
        bars={bars}
        startCoordinates={startCoordinates}
        endCoordinates={endCoordinates}
        isVisible={!!route && bars.length > 0}
      />
    </div>
  );
};
