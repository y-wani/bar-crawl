import React from "react";
import { FiSearch, FiX } from "react-icons/fi";
import "../styles/AddressAutocomplete.css";
import "../styles/Home.css";

interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

// Filters the bars already loaded for the area on the map — and only those.
//
// This used to be an address autocomplete, so typing a bar name opened a
// dropdown of places from anywhere in the world (ranked toward Columbus, Ohio
// for everyone) and picking one did nothing. Searching "Ginn Mill" while
// planning in Denver should only ever mean the Denver bars on screen; moving
// to another city is the map's location search, not this box.
export const SearchBar: React.FC<SearchBarProps> = ({ searchTerm, onSearchChange }) => (
  <div className="search-bar-sidebar">
    <div className="address-autocomplete">
      <div className="address-autocomplete-input-container">
        <div className="address-autocomplete-icon">
          <FiSearch />
        </div>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search bars in this area..."
          className="address-autocomplete-input"
          aria-label="Search bars in this area"
          autoComplete="off"
          enterKeyHint="search"
        />
        {searchTerm && (
          <button
            type="button"
            className="address-autocomplete-icon"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            style={{ background: "none", border: 0, cursor: "pointer" }}
          >
            <FiX />
          </button>
        )}
      </div>
    </div>
  </div>
);
