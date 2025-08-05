// src/components/Sidebar.tsx

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../context/types';
import { SidebarHeader } from './SidebarHeader';
import { SearchBar } from './SearchBar';
import { FilterGroup } from './FilterGroup';
import { BarList } from './BarList';
import type { Bar } from './BarListItem';
import { FiNavigation } from 'react-icons/fi';
import '../styles/Home.css';

// Utility function to calculate distance between two coordinates in miles
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

interface SidebarProps {
  user: User | null;
  onSignOut: () => void;
  bars: Bar[];
  selectedBarIds: Set<string>;
  hoveredBarId: string | null;
  onToggleBar: (barId: string) => void;
  onHoverBar: (barId: string | null) => void; // Function to set hovered bar
  searchedLocation: string;
  mapCenter: [number, number];
  radius: number;
  showOnlyInRadius: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  onSignOut,
  bars,
  selectedBarIds,
  hoveredBarId,
  onToggleBar,
  onHoverBar,
//   searchedLocation,
  mapCenter,
  radius,
  showOnlyInRadius,
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'Distance' | 'Popularity'>('Distance');

  const filteredAndSortedBars = useMemo(() => {
    let filteredBars = bars.filter((bar) => 
      bar.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter by radius if enabled
    if (showOnlyInRadius) {
      filteredBars = filteredBars.filter((bar) => {
        if (!bar.location?.coordinates) return false;
        const [barLng, barLat] = bar.location.coordinates;
        const [centerLng, centerLat] = mapCenter;
        const distance = calculateDistance(centerLat, centerLng, barLat, barLng);
        return distance <= radius;
      });
    }

    // Sort bars with selected bars at the top
    return filteredBars.sort((a, b) => {
      // First, sort by selection status (selected bars first)
      const aSelected = selectedBarIds.has(a.id);
      const bSelected = selectedBarIds.has(b.id);
      
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      
      // If both have same selection status, sort by the active filter
      if (activeFilter === 'Popularity') {
        return (b.rating || 0) - (a.rating || 0);
      }
      // Calculate distance for sorting
      if (a.location?.coordinates && b.location?.coordinates && mapCenter) {
        const [aLng, aLat] = a.location.coordinates;
        const [bLng, bLat] = b.location.coordinates;
        const [centerLng, centerLat] = mapCenter;
        const distanceA = calculateDistance(centerLat, centerLng, aLat, aLng);
        const distanceB = calculateDistance(centerLat, centerLng, bLat, bLng);
        return distanceA - distanceB;
      }
      return (a.distance || 0) - (b.distance || 0);
    });
  }, [bars, searchTerm, activeFilter, showOnlyInRadius, mapCenter, radius, selectedBarIds]);

  return (
    <div className="planner-sidebar">
      <SidebarHeader user={user} onSignOut={onSignOut} />

      

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
        mapCenter={mapCenter}
        radius={radius}
      />

      <button
        className="btn-generate-route"
        disabled={selectedBarIds.size < 2}
        onClick={() => {
          if (selectedBarIds.size >= 2) {
            const selectedBars = bars.filter(bar => selectedBarIds.has(bar.id));
            navigate('/route', {
              state: {
                selectedBars,
                mapCenter,
                searchRadius: radius
              }
            });
          }
        }}
      >
        <FiNavigation size={18} />
        Generate My Route ({selectedBarIds.size})
      </button>
    </div>
  );
};