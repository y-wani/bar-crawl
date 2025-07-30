// src/components/BarListItem.tsx
import React from 'react';
import '../styles/Home.css'; // Assuming styles are in Home.css

export interface Bar {
  id: string;
  name: string;
  rating: number;
  distance: number;
}

interface BarListItemProps {
  bar: Bar;
  isSelected: boolean;
  isHovered: boolean;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
}

export const BarListItem: React.FC<BarListItemProps> = ({
  bar,
  isSelected,
  isHovered,
  onToggle,
  onHover,
}) => {
  const itemClasses = `bar-list-item ${isSelected ? 'selected' : ''} ${
    isHovered ? 'hovered' : ''
  }`;

  return (
    <div
      className={itemClasses}
      onMouseEnter={() => onHover(bar.id)}
    >
      <div className="bar-item-icon">🍻</div>
      <div className="bar-item-details">
        <span className="bar-item-name">{bar.name}</span>
        <span className="bar-item-meta">
          ⭐ {bar.rating.toFixed(1)}
        </span>
      </div>
      <div className="checkbox-container">
        <input
          type="checkbox"
          className="bar-item-checkbox"
          checked={isSelected}
          onChange={() => onToggle(bar.id)}
          aria-label={`Select ${bar.name}`}
        />
      </div>
    </div>
  );
};