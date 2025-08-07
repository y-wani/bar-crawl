import React from "react";
import { AddressAutocomplete } from "./AddressAutocomplete";
import "../styles/Home.css";

interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onLocationSelect: (location: { place_name: string }) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchTerm,
  onSearchChange,
  onLocationSelect,
}) => {
  return (
    <div className="search-bar-sidebar">
      <AddressAutocomplete
        value={searchTerm}
        onChange={onSearchChange}
        onSelect={onLocationSelect}
        placeholder="🔍 Search bars..."
      />
    </div>
  );
};
