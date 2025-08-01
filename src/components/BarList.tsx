// src/components/BarList.tsx
import React from "react";
import { BarListItem, type Bar } from "./BarListItem";
import { AnimatePresence, motion } from "framer-motion";
import "../styles/Home.css";

// Utility function to calculate distance between two coordinates in miles
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

interface BarListProps {
  bars: Bar[];
  selectedBarIds: Set<string>;
  hoveredBarId: string | null;
  onToggleBar: (barId: string) => void;
  onHoverBar: (barId: string | null) => void;
  mapCenter?: [number, number];
  radius?: number;
}

export const BarList: React.FC<BarListProps> = ({
  bars,
  selectedBarIds,
  hoveredBarId,
  onToggleBar,
  onHoverBar,
  mapCenter,
  radius,
}) => {
  if (bars.length === 0) {
    return (
      <p className="no-results-message">
        No bars found. Try a different search!
      </p>
    );
  }

  return (
    <div className="bar-list" onMouseLeave={() => onHoverBar(null)}>
      <AnimatePresence>
        {bars.map((bar, index) => {
          // Calculate actual distance and radius status
          let actualDistance: number | undefined;
          let isWithinRadius: boolean | undefined;
          
          if (mapCenter && bar.location?.coordinates) {
            const [barLng, barLat] = bar.location.coordinates;
            const [centerLng, centerLat] = mapCenter;
            actualDistance = calculateDistance(centerLat, centerLng, barLat, barLng);
            
            if (radius !== undefined) {
              isWithinRadius = actualDistance <= radius;
            }
          }

          return (
            <motion.div
              key={bar.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ delay: index * 0.05 }}
            >
              <BarListItem
                bar={bar}
                isSelected={selectedBarIds.has(bar.id)}
                isHovered={hoveredBarId === bar.id}
                onToggle={onToggleBar}
                onHover={onHoverBar}
                actualDistance={actualDistance}
                isWithinRadius={isWithinRadius}
                radius={radius}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
