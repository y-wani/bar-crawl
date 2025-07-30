import React, { useState, useMemo } from 'react';
import type { User } from '../context/types';
import { SidebarHeader } from './SidebarHeader';
import { SearchBar } from './SearchBar';
import { FilterGroup } from './FilterGroup';
import { BarList } from './BarList';
import type { Bar } from './BarListItem';
import '../styles/Home.css';

interface SidebarProps {
  user: User | null;
  onSignOut: () => void;
  bars: Bar[];
  selectedBarIds: Set<string>;
  hoveredBarId: string | null;
  onToggleBar: (barId: string) => void;
  onHoverBar: (barId: string | null) => void; // Function to set hovered bar
  searchedLocation: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  onSignOut,
  bars,
  selectedBarIds,
  hoveredBarId,
  onToggleBar,
  onHoverBar,
  searchedLocation,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'Distance' | 'Popularity'>('Distance');

  const filteredAndSortedBars = useMemo(() => {
    return bars
      .filter((bar) => bar.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (activeFilter === 'Popularity') {
          return (b.rating || 0) - (a.rating || 0);
        }
        // Add distance sorting logic if/when available
        return (a.distance || 0) - (b.distance || 0);
      });
  }, [bars, searchTerm, activeFilter]);

  return (
    <div className="planner-sidebar">
      <SidebarHeader user={user} onSignOut={onSignOut} />

      <div className="search-context">
        <span className="context-label">Showing results for</span>
        <h2 className="context-location">{searchedLocation || '...'}</h2>
      </div>

      <div className="search-and-filters">
        <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        <FilterGroup activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      </div>

      <BarList
        bars={filteredAndSortedBars}
        selectedBarIds={selectedBarIds}
        hoveredBarId={hoveredBarId}
        onToggleBar={onToggleBar}
        onHoverBar={onHoverBar}
      />

      <button
        className="btn-generate-route"
        disabled={selectedBarIds.size < 2}
      >
        Generate My Route ({selectedBarIds.size})
      </button>
    </div>
  );
};