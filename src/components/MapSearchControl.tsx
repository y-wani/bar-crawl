import React, { useState, useEffect, useRef, useCallback } from "react";
import { debounce } from "lodash";
import { FiSearch, FiMapPin, FiCrosshair } from "react-icons/fi";
import "../styles/Home.css";

interface AutocompleteSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  place_type: string[];
  text: string;
}

interface MapSearchControlProps {
  onSearch: (location: string) => void;
  onRadiusChange: (radius: number) => void;
  onRadiusFilterToggle: (showOnlyInRadius: boolean) => void;
  onUseLocation?: () => void;
  isLoading: boolean;
  initialLocation?: string;
  initialRadius?: number;
  showOnlyInRadius?: boolean;
  barsInRadius?: number;
  totalBars?: number;
  showLocationButton?: boolean;
}

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export const MapSearchControl: React.FC<MapSearchControlProps> = ({
  onSearch,
  onRadiusChange,
  onRadiusFilterToggle,
  onUseLocation,
  isLoading,
  initialLocation = "Columbus, Ohio",
  initialRadius = 1,
  showOnlyInRadius = false,
  barsInRadius = 0,
  totalBars = 0,
  showLocationButton = true,
}) => {
  const [location, setLocation] = useState(initialLocation);
  const [radius, setRadius] = useState(initialRadius);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced function to fetch suggestions
  const debouncedFetchSuggestions = useCallback(
    debounce(async (query: string) => {
      if (query.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setIsLoadingSuggestions(true);
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            query
          )}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=5&types=place,locality,neighborhood,address`
        );
        const data = await response.json();

        if (data.features) {
          setSuggestions(data.features);
          setShowSuggestions(true);
          setSelectedIndex(-1);
        }
      } catch (error) {
        console.error("Error fetching suggestions:", error);
        setSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300),
    []
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocation(value);
    debouncedFetchSuggestions(value);
  };

  // Handle form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (location && !isLoading) {
      onSearch(location);
      setShowSuggestions(false);
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: AutocompleteSuggestion) => {
    setLocation(suggestion.place_name);
    setShowSuggestions(false);
    onSearch(suggestion.place_name);
    inputRef.current?.blur();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSuggestionSelect(suggestions[selectedIndex]);
        } else {
          handleSearch(e);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle radius change
  const handleRadiusChange = (newRadius: number) => {
    setRadius(newRadius);
    onRadiusChange(newRadius);
  };

  // Calculate progress percentage for slider
  const progressPercentage = ((radius - 0.5) / (5 - 0.5)) * 100;

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionRefs.current[selectedIndex]) {
      suggestionRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get place type icon
  const getPlaceIcon = (placeTypes: string[]) => {
    if (placeTypes.includes("place")) return <FiMapPin size={14} />;
    if (placeTypes.includes("locality")) return <FiMapPin size={14} />;
    if (placeTypes.includes("neighborhood")) return <FiMapPin size={14} />;
    if (placeTypes.includes("address")) return <FiCrosshair size={14} />;
    return <FiMapPin size={14} />;
  };

  return (
    <div className="map-controls-overlay">
      <div className="search-container" ref={dropdownRef}>
        <form onSubmit={handleSearch} className="map-search-bar">
          <div className="search-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={location}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() =>
                location.length >= 2 &&
                suggestions.length > 0 &&
                setShowSuggestions(true)
              }
              placeholder="Search for a city..."
              disabled={isLoading}
              className="search-input"
              autoComplete="off"
            />
            <div className="search-input-icons">
              {showLocationButton && onUseLocation && (
                <button
                  type="button"
                  className="inline-location-btn"
                  onClick={onUseLocation}
                  disabled={isLoading}
                  title="Use my current location"
                  aria-label="Use my current location"
                >
                  <FiCrosshair size={14} />
                </button>
              )}
              {isLoadingSuggestions && (
                <div className="loading-spinner">
                  <div className="spinner"></div>
                </div>
              )}
            </div>
          </div>
          <button type="submit" disabled={isLoading} className="search-button">
            {isLoading ? (
              <div className="button-spinner">
                <div className="spinner"></div>
              </div>
            ) : (
              <FiSearch size={18} />
            )}
          </button>
        </form>

        {showSuggestions && suggestions.length > 0 && (
          <div className="suggestions-dropdown">
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.id}
                ref={(el) => {
                  suggestionRefs.current[index] = el;
                }}
                className={`suggestion-item ${
                  index === selectedIndex ? "selected" : ""
                }`}
                onClick={() => handleSuggestionSelect(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="suggestion-icon">
                  {getPlaceIcon(suggestion.place_type)}
                </div>
                <div className="suggestion-content">
                  <div className="suggestion-title">{suggestion.text}</div>
                  <div className="suggestion-subtitle">
                    {suggestion.place_name}
                  </div>
                </div>
                <div className="suggestion-action">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M7 17L17 7"></path>
                    <path d="M7 7h10v10"></path>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="map-radius-control"
        style={{ "--val": radius } as React.CSSProperties}
      >
        <div className="radius-header">
          <div className="radius-label">
            <span>Radius</span>
            <span className="radius-value">{radius.toFixed(1)} mi</span>
          </div>
          <div className="radius-slider-wrapper">
            <input
              id="radius-slider"
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={radius}
              onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
              disabled={isLoading}
              className="radius-slider"
              style={{
                background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${progressPercentage}%, rgba(255, 255, 255, 0.1) ${progressPercentage}%, rgba(255, 255, 255, 0.1) 100%)`,
              }}
            />
          </div>
        </div>
        <div className="radius-footer">
          <div className="radius-marks">
            <span>0.5</span>
            <span>5.0</span>
          </div>
          <div className="radius-filter-toggle">
            <label className="radius-toggle-container">
              <input
                type="checkbox"
                checked={showOnlyInRadius}
                onChange={(e) => onRadiusFilterToggle(e.target.checked)}
                className="radius-checkbox-input" // Renamed class for clarity
              />
              <div className="radius-toggle-switch"></div>
              <span className="radius-toggle-label">
                Show only in radius ({barsInRadius}/{totalBars})
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
