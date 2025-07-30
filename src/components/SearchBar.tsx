import React from 'react';
import '../styles/Home.css';

interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ searchTerm, onSearchChange }) => {
  return (
    <input
      type="text"
      placeholder="🔍 Search for bars"
      className="search-input"
      value={searchTerm}
      onChange={(e) => onSearchChange(e.target.value)}
    />
  );
};