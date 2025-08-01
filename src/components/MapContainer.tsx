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
      style: "mapbox://styles/mapbox/streets-v12",
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

    m.on("draw.create", (e: { features: Array<Feature<Geometry, GeoJsonProperties>> }) => onDrawComplete(e.features[0]));
    m.on("draw.update", (e: { features: Array<Feature<Geometry, GeoJsonProperties>> }) => onDrawComplete(e.features[0]));
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

    return () => map.current?.remove();
  }, []);

  // 2. Fly to new center when it changes
  useEffect(() => {
    if (!map.current) return;
    map.current.flyTo({ center, zoom: 13, speed: 1.2 });
    isInitialLoad.current = false;
  }, [center]);

  // 3. Update Turf circle on center/radius change
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const src = map.current.getSource(
      RADIUS_SOURCE_ID
    ) as mapboxgl.GeoJSONSource;
    if (!src) return;

    const circleGeojson = turfCircle(center, radius, { units: "miles" });
    src.setData(circleGeojson);
  }, [center, radius]);

  // 4. Update bar markers when `bars` changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const src = map.current.getSource(BARS_SOURCE_ID) as mapboxgl.GeoJSONSource;
    const features = bars.map((bar) => ({
      type: "Feature" as const,
      geometry: bar.location,
      properties: {
        id: bar.id,
        name: bar.name,
        rating: bar.rating,
      },
    }));
    src.setData({ type: "FeatureCollection", features });
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
