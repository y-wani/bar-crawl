// src/hooks/useRouteAnimations.ts
//
// Renders the walking route as a clean two-layer line (dark casing + a
// cyan→magenta gradient core) plus start/end pins. No per-frame animation —
// the gradient encodes direction (cyan = start, magenta = end).

import { useEffect } from "react";
import type { AppBat } from "../pages/Home";
import {
  createStartEndMarkers,
  createRouteChevron,
  BARS_SELECTED_CIRCLE_ID,
} from "../utils/mapLayers";

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

const ROUTE_LAYERS = [
  "route-casing",
  "route-line",
  "route-direction",
  "route-start-end",
];
const ROUTE_SOURCES = ["route-line", "route-start-end"];

const removeRouteLayers = (map: UseRouteAnimationsProps["map"]) => {
  if (!map) return;
  ROUTE_LAYERS.forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  ROUTE_SOURCES.forEach((id) => {
    if (map.getSource(id)) map.removeSource(id);
  });
};

export const useRouteAnimations = ({
  map,
  route,
  startCoordinates,
  endCoordinates,
  center,
}: UseRouteAnimationsProps) => {
  useEffect(() => {
    if (!map) return;

    if (!route) {
      removeRouteLayers(map);
      return;
    }

    const render = async () => {
      try {
        await Promise.all([createStartEndMarkers(map), createRouteChevron(map)]);
      } catch {
        // Markers failing to load shouldn't block the route line
      }
      if (!map.getStyle()) return; // map was removed while awaiting

      // Route line goes underneath the numbered stop circles when they exist
      const beforeId = map.getLayer(BARS_SELECTED_CIRCLE_ID)
        ? BARS_SELECTED_CIRCLE_ID
        : undefined;

      if (!map.getSource("route-line")) {
        map.addSource("route-line", {
          type: "geojson",
          data: route,
          lineMetrics: true,
        });
      } else {
        map.getSource("route-line").setData(route);
      }

      if (!map.getLayer("route-casing")) {
        map.addLayer(
          {
            id: "route-casing",
            type: "line",
            source: "route-line",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#0b0c18",
              "line-width": 9,
              "line-opacity": 0.85,
            },
          },
          beforeId
        );
      }

      if (!map.getLayer("route-line")) {
        map.addLayer(
          {
            id: "route-line",
            type: "line",
            source: "route-line",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-width": 4.5,
              "line-gradient": [
                "interpolate",
                ["linear"],
                ["line-progress"],
                0,
                "#ecb256",
                1,
                "#ffffff",
              ],
            },
          },
          beforeId
        );
      }

      // Direction chevrons along the line (white arrows pointing from
      // start toward end — the gradient also encodes this: amber = start,
      // white = end, matching the start/end pin colors)
      if (!map.getLayer("route-direction")) {
        map.addLayer(
          {
            id: "route-direction",
            type: "symbol",
            source: "route-line",
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": 90,
              "icon-image": "route-chevron",
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10,
                0.45,
                14,
                0.6,
                18,
                0.8,
              ],
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            },
          },
          beforeId
        );
      }

      // Start/end pins
      if (!map.getSource("route-start-end")) {
        map.addSource("route-start-end", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("route-start-end")) {
        map.addLayer({
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
              0.55,
              14,
              0.75,
              18,
              1,
            ],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }

      const startCoords = startCoordinates || center;
      const features = [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: startCoords },
          properties: { "marker-type": "start-pin" },
        },
      ];
      if (
        endCoordinates &&
        (endCoordinates[0] !== startCoords[0] ||
          endCoordinates[1] !== startCoords[1])
      ) {
        features.push({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: endCoordinates },
          properties: { "marker-type": "end-pin" },
        });
      }
      map
        .getSource("route-start-end")
        .setData({ type: "FeatureCollection", features });
    };

    render();
  }, [map, route, startCoordinates, endCoordinates, center]);

  return {
    cleanup: () => removeRouteLayers(map),
  };
};
