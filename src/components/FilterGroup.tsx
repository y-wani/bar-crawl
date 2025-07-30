import React from 'react';
import '../styles/Home.css';

type FilterOption = 'Distance' | 'Popularity';

interface FilterGroupProps {
  activeFilter: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
}

export const FilterGroup: React.FC<FilterGroupProps> = ({ activeFilter, onFilterChange }) => {
  const filters: FilterOption[] = ['Distance', 'Popularity'];

  return (
    <div className="filters">
      {filters.map((filter) => (
        <button
          key={filter}
          className={`filter-btn ${activeFilter === filter ? 'active' : ''}`}
          onClick={() => onFilterChange(filter)}
        >
          {filter}
        </button>
      ))}
    </div>
  );
};