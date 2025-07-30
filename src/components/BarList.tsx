// src/components/BarList.tsx
import React from "react";
import { BarListItem, type Bar } from "./BarListItem";
import "../styles/Home.css";

interface BarListProps {
  bars: Bar[];
  selectedBarIds: Set<string>;
  hoveredBarId: string | null;
  onToggleBar: (barId: string) => void;
  onHoverBar: (barId: string | null) => void;
}

export const BarList: React.FC<BarListProps> = ({
  bars,
  selectedBarIds,
  hoveredBarId,
  onToggleBar,
  onHoverBar,
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
      {bars.map((bar) => (
        <BarListItem
          key={bar.id}
          bar={bar}
          isSelected={selectedBarIds.has(bar.id)}
          isHovered={hoveredBarId === bar.id}
          onToggle={onToggleBar}
          onHover={onHoverBar}
        />
      ))}
    </div>
  );
};
