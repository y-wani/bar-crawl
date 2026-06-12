// src/components/BarListItem.tsx

import React from "react";
import { FaMapMarkerAlt, FaStar } from "react-icons/fa";
import "../styles/Home.css";

export interface Bar {
  id: string;
  name: string;
  rating: number; // 0 = no rating data ("New")
  distance: number;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  userRatingCount?: number;
  address?: string;
  openNow?: boolean;
  priceText?: string; // "$" - "$$$$"
}

// Compact review-count label, e.g. 1234 -> "1.2k"
export const formatReviewCount = (count: number): string =>
  count >= 1000 ? `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${count}`;

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
        <h3
          className="bar-item-name"
          title={
            isWithinRadius === false
              ? `Outside ${radius?.toFixed(1)}mi radius`
              : undefined
          }
        >
          {bar.name}
        </h3>
        <div className="bar-item-meta">
          <span>
            <FaStar />{" "}
            {bar.rating > 0 ? (
              <>
                {bar.rating.toFixed(1)}
                {bar.userRatingCount !== undefined && (
                  <span className="review-count">
                    {" "}
                    ({formatReviewCount(bar.userRatingCount)})
                  </span>
                )}
              </>
            ) : (
              "New"
            )}
          </span>
          <span
            title={
              isWithinRadius === false ? "Outside the search radius" : undefined
            }
          >
            <FaMapMarkerAlt /> {(actualDistance ?? bar.distance).toFixed(2)} mi
          </span>
          {bar.openNow !== undefined && (
            <span className={bar.openNow ? "open-now" : "closed-now"}>
              {bar.openNow ? "Open" : "Closed"}
            </span>
          )}
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
