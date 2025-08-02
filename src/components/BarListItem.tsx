// src/components/BarListItem.tsx

import React from "react";
import { FaMapMarkerAlt, FaStar } from "react-icons/fa";
import "../styles/Home.css";

export interface Bar {
  id: string;
  name: string;
  rating: number;
  distance: number;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
}

interface BarListItemProps {
  bar: Bar;
  isSelected: boolean;
  isHovered: boolean;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
  actualDistance?: number;
  isWithinRadius?: boolean;
  radius?: number;
}

export const BarListItem: React.FC<BarListItemProps> = ({
  bar,
  isSelected,
  isHovered,
  onHover,
  onToggle,
  actualDistance,
  isWithinRadius,
  radius,
}) => {
  const itemClasses = `bar-list-item ${isSelected ? "selected" : ""} ${
    isHovered ? "hovered" : ""
  } ${isWithinRadius === false ? "outside-radius" : ""} ${
    isWithinRadius === true ? "within-radius" : ""
  }`;

  // This handler prevents the main div's onClick from firing when the checkbox is clicked,
  // avoiding a double toggle.
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation(); // Stop the click from bubbling up to the parent div
    onToggle(bar.id);
  };

  return (
    <div
      className={itemClasses}
      onMouseEnter={() => onHover(bar.id)}
      onClick={() => onToggle(bar.id)} // The whole item is clickable
    >
      <div className="bar-item-details">
        <h3 className="bar-item-name">
          {bar.name}
          {isWithinRadius === false && (
            <span
              className="radius-indicator outside"
              title={`Outside ${radius?.toFixed(1)}mi radius`}
            >
              🚫
            </span>
          )}
          {isWithinRadius === true && (
            <span
              className="radius-indicator within"
              title={`Within ${radius?.toFixed(1)}mi radius`}
            >
              ✅
            </span>
          )}
        </h3>
        <div className="bar-item-meta">
          <span>
            <FaStar /> {bar.rating.toFixed(1)}
          </span>
          <span>
            <FaMapMarkerAlt /> {(actualDistance ?? bar.distance).toFixed(2)} mi
            {isWithinRadius === false && (
              <span className="distance-warning"> (outside radius)</span>
            )}
          </span>
        </div>
      </div>
      <label
        className="custom-checkbox-container"
        // Prevent clicking the label from triggering the parent div's onClick
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange} // Use the new handler
          aria-label={`Select ${bar.name}`}
        />
        <span className="checkmark"></span>
      </label>
    </div>
  );
};
