// src/hooks/usePulsingIndicators.ts

import { useEffect, useRef } from "react";
import type { AppBat } from "../pages/Home";

interface UsePulsingIndicatorsProps {
  map: any | null; // mapboxgl.Map
  bars: AppBat[];
  isMapReady: boolean;
}

export const usePulsingIndicators = ({
  map,
  bars,
  isMapReady,
}: UsePulsingIndicatorsProps) => {
  const pulsingFrame = useRef<number | undefined>(undefined);
  const startTime = useRef<number>(0);

  useEffect(() => {
    console.log(
      "🔄 Pulsing effect triggered - Map loaded:",
      !!map,
      "Map ready:",
      isMapReady,
      "Bars count:",
      bars.length
    );

    if (!map) {
      console.log("⏳ No map instance yet, waiting...");
      return;
    }

    const setupPulsing = () => {
      console.log("🎯 Setting up pulsing indicators...");

      const pulsingSource = map.getSource(
        "pulsing-indicators"
      ) as mapboxgl.GeoJSONSource;
      if (!pulsingSource) {
        console.log("❌ Pulsing source not found, retrying in 100ms...");
        setTimeout(setupPulsing, 100);
        return;
      }

      if (pulsingFrame.current) {
        cancelAnimationFrame(pulsingFrame.current);
        pulsingFrame.current = undefined;
      }

      if (bars.length === 0) {
        console.log("📍 No bars to display, clearing pulsing indicators");
        pulsingSource.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      console.log(`🎯 Setting up pulsing for ${bars.length} bars`);
      console.log("📍 Sample bar:", bars[0]);

      const initFeatures = bars.map((bar, idx) => ({
        type: "Feature" as const,
        geometry: bar.location,
        properties: { id: bar.id, phase: idx * 0.5, radius: 20, opacity: 1.0 },
      }));

      pulsingSource.setData({
        type: "FeatureCollection",
        features: initFeatures,
      });
      console.log(
        "✅ Initial pulsing data set:",
        initFeatures.length,
        "features"
      );

      startTime.current = Date.now();
      const animatePulse = () => {
        const elapsed = (Date.now() - startTime.current) / 1000;
        const source = map.getSource(
          "pulsing-indicators"
        ) as mapboxgl.GeoJSONSource;

        if (source && bars.length > 0) {
          const updated = initFeatures.map((feat) => {
            const phase = feat.properties.phase;

            // More dynamic and complex animations
            const shockwaveRadius = (elapsed * 50 + phase) % 60;
            const shockwaveOpacity = Math.max(0, 1 - shockwaveRadius / 60);

            return {
              ...feat,
              properties: {
                ...feat.properties,
                // Inner pulse
                radius: (Math.sin(elapsed * 2 + phase) * 0.5 + 1) * 15,
                opacity: Math.sin(elapsed * 1.5 + phase) * 0.4 + 0.6,
                // Shockwave effect
                shockwave_radius: shockwaveRadius,
                shockwave_opacity: shockwaveOpacity,
              },
            };
          });
          source.setData({ type: "FeatureCollection", features: updated });
        }

        pulsingFrame.current = requestAnimationFrame(animatePulse);
      };

      console.log("▶️ Starting pulsing animation");
      animatePulse();
    };

    if (map.isStyleLoaded()) {
      setupPulsing();
    } else {
      console.log("⏳ Waiting for style to load...");
      map.on("styledata", setupPulsing);
    }

    return () => {
      if (pulsingFrame.current) {
        cancelAnimationFrame(pulsingFrame.current);
        pulsingFrame.current = undefined;
      }
    };
  }, [map, bars, isMapReady]);

  return {
    cleanup: () => {
      if (pulsingFrame.current) {
        cancelAnimationFrame(pulsingFrame.current);
        pulsingFrame.current = undefined;
      }
    },
  };
};