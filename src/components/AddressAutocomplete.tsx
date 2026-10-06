import React, { useState, useRef, useEffect } from "react";
import {
  useAddressAutocomplete,
  type AddressSuggestion as SearchSuggestion,
} from "../hooks/useAddressAutocomplete";
import { toast } from "./Toaster";
import { FiMapPin, FiSearch, FiLoader } from "react-icons/fi";
import "../styles/AddressAutocomplete.css";

interface AddressSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  relevance: number;
  type: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  dropdownDirection?: "up" | "down";
  /** [lng, lat] of the area being planned — results near it rank first. */
  near?: [number, number] | null;
  /** Drop results outside a box this many km around `near`. */
  restrictKm?: number;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = "Enter address...",
  label,
  icon = <FiMapPin />,
  className = "",
  disabled = false,
  dropdownDirection = "down",
  near = null,
  restrictKm,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search where the user is planning, not a fixed city. This used to be
  // hard-coded to Columbus, Ohio for everyone, so a Denver start point was
  // ranked against Ohio and a weak local match lost to one on another continent.
  const { suggestions, isLoading, error, getSuggestions, clearSuggestions, resolve } =
    useAddressAutocomplete({ near, restrictKm });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (newValue.trim().length >= 2) {
      getSuggestions(newValue);
      setIsOpen(true);
      setFocusedIndex(-1);
    } else {
      clearSuggestions();
      setIsOpen(false);
    }
  };

  // A Search Box suggestion has no coordinates until it's resolved, so the
  // pick fills the box immediately and hands the place on once it has them.
  const handleSuggestionClick = async (suggestion: SearchSuggestion) => {
    onChange(suggestion.place_name);
    setIsOpen(false);
    clearSuggestions();
    setFocusedIndex(-1);
    inputRef.current?.blur();
    const resolved = await resolve(suggestion);
    if (resolved?.center) {
      onSelect({ ...resolved, center: resolved.center });
    } else {
      toast.error("Couldn't locate that place — try another result");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[focusedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        clearSuggestions();
        setFocusedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay closing to allow for clicks on suggestions
    setTimeout(() => {
      setIsOpen(false);
      setFocusedIndex(-1);
    }, 150);
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (
      inputRef.current &&
      !inputRef.current.contains(e.target as Node) &&
      dropdownRef.current &&
      !dropdownRef.current.contains(e.target as Node)
    ) {
      setIsOpen(false);
      clearSuggestions();
      setFocusedIndex(-1);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "poi":
        return "🏢";
      case "address":
        return "📍";
      case "place":
      case "neighborhood":
        return "🏘️";
      default:
        return "📍";
    }
  };

  return (
    <div className={`address-autocomplete ${className}`}>
      {label && <label className="address-autocomplete-label">{label}</label>}

      <div
        className={`address-autocomplete-input-container ${
          !icon && !isLoading ? "no-icon" : ""
        }`}
      >
        {(icon || isLoading) && (
          <div className="address-autocomplete-icon">
            {isLoading ? <FiLoader className="spinner" /> : icon}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="address-autocomplete-input"
          autoComplete="off"
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              clearSuggestions();
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="address-autocomplete-clear"
            aria-label="Clear input"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`address-autocomplete-dropdown ${
            dropdownDirection === "up" ? "dropdown-up" : "dropdown-down"
          }`}
        >
          {error && (
            <div className="address-autocomplete-error">
              <FiSearch />
              <span>{error}</span>
            </div>
          )}

          {isLoading && (
            <div className="address-autocomplete-loading">
              <FiLoader className="spinner" />
              <span>Searching...</span>
            </div>
          )}

          {!isLoading &&
            !error &&
            suggestions.length === 0 &&
            value.trim().length >= 2 && (
              <div className="address-autocomplete-no-results">
                <FiSearch />
                <span>No results found</span>
              </div>
            )}

          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              className={`address-autocomplete-suggestion ${
                index === focusedIndex ? "focused" : ""
              }`}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setFocusedIndex(index)}
            >
              <span className="suggestion-icon">
                {getTypeIcon(suggestion.type)}
              </span>
              <div className="suggestion-content">
                <div className="suggestion-name">
                  {suggestion.place_name.split(",")[0]}
                </div>
                <div className="suggestion-details">
                  {suggestion.place_name.split(",").slice(1).join(",")}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
