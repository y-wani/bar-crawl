// src/components/Sidebar.tsx

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { User } from '../context/types';
import { SidebarHeader } from './SidebarHeader';
import { SearchBar } from './SearchBar';
import { FilterGroup } from './FilterGroup';
import { BarList } from './BarList';
import type { Bar } from './BarListItem';
import { FiNavigation, FiDownload, FiSearch } from 'react-icons/fi';
import { useIsMobile } from '../hooks/useIsMobile';
import { useBottomSheet } from '../hooks/useBottomSheet';
import { ImportBarsModal } from './ImportBarsModal';
import type { AppBat } from '../pages/Home';
import { searchPlaceByText } from '../services/placesService';
import { ApiError } from '../services/apiClient';
import { haversineMiles } from '../utils/geo';
import { toast } from './Toaster';
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
  /** Add a bar found by name (not among the loaded ones) and select it. */
  onAddBar?: (bar: AppBat) => void;
}

/** A name match further than this from the map is a same-named bar elsewhere. */
const FIND_MAX_MILES = 25;

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
  onAddBar,
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [finding, setFinding] = useState(false);

  // The search box filters the bars already loaded for this area. A specific
  // bar can still be missing from those (the area load is the top ~70 by
  // popularity), so when nothing matches, look it up by name — in this area
  // only. One billed Places text search, through the proxy's per-user limits.
  const handleFindBar = async () => {
    const term = searchTerm.trim();
    if (term.length < 2 || finding || !onAddBar) return;
    setFinding(true);
    try {
      const bar = await searchPlaceByText(term, { lat: mapCenter[1], lng: mapCenter[0] });
      if (!bar) {
        toast.error(`Couldn't find “${term}” near here`);
        return;
      }
      const miles = haversineMiles(mapCenter, bar.location.coordinates as [number, number]);
      if (miles > FIND_MAX_MILES) {
        toast.error(`The only “${term}” found is ${Math.round(miles)} mi away — not in this area`);
        return;
      }
      onAddBar(bar);
      setSearchTerm(bar.name);
      toast.success(`Added ${bar.name}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'GUEST_QUOTA') {
        toast.error('Guest searches are used up for today — sign up to keep searching');
      } else {
        toast.error('Search failed — try again');
      }
    } finally {
      setFinding(false);
    }
  };
  const [activeFilter, setActiveFilter] = useState<'Distance' | 'Popularity'>('Distance');
  const isMobile = useIsMobile();
  // Short resting height so most of the map stays visible; drag up to browse.
  const { height, snap, snapTo, onHandlePointerDown } = useBottomSheet(isMobile, {
    initial: 'half',
    halfFraction: 0.3,
    fullFraction: 0.9,
  });
  const [showImport, setShowImport] = useState(false);

  // Bring an imported event lineup straight to the route planner
  const handleImport = (importedBars: AppBat[]) => {
    setShowImport(false);
    const n = importedBars.length;
    const centroid: [number, number] = [
      importedBars.reduce((s, b) => s + b.location.coordinates[0], 0) / n,
      importedBars.reduce((s, b) => s + b.location.coordinates[1], 0) / n,
    ];
    navigate('/route', {
      state: {
        selectedBars: importedBars,
        mapCenter: centroid,
        searchRadius: radius,
      },
    });
  };

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
    <motion.div
      className={`planner-sidebar ${isMobile ? `is-sheet snap-${snap}` : ''}`}
      // On desktop, height is "auto" so the absolute top/bottom stretch the
      // panel; on mobile the sheet height comes from the motion value. The
      // explicit "auto" matters — it clears the imperatively-set sheet height
      // when the viewport grows back past the mobile breakpoint.
      style={{ height: isMobile ? height : 'auto' }}
    >
      {isMobile && (
        <button
          type="button"
          className="sheet-handle"
          aria-label={snap === 'full' ? 'Collapse list' : 'Expand list'}
          onPointerDown={onHandlePointerDown}
          onClick={() => snapTo(snap === 'full' ? 'half' : 'full')}
        >
          <span className="sheet-handle-grip" />
        </button>
      )}

      <SidebarHeader user={user} onSignOut={onSignOut} />

      

      <div className="search-and-filters">
        <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        {onAddBar && searchTerm.trim().length >= 2 && filteredAndSortedBars.length === 0 && (
          <button
            type="button"
            className="btn-import-list"
            onClick={handleFindBar}
            disabled={finding}
          >
            <FiSearch size={15} />{' '}
            {finding ? 'Searching…' : `Find “${searchTerm.trim()}” near here`}
          </button>
        )}
        <FilterGroup activeFilter={activeFilter} onFilterChange={setActiveFilter} />
        <button
          className="btn-import-list"
          onClick={() => setShowImport(true)}
          title="Paste an event's bar lineup to build the crawl"
        >
          <FiDownload size={15} /> Import a bar list
        </button>
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
            // Preserve the order the user clicked the bars in (Set keeps
            // insertion order) — the Route page treats it as "my order"
            const barById = new Map(bars.map((bar) => [bar.id, bar]));
            const selectedBars = Array.from(selectedBarIds)
              .map((id) => barById.get(id))
              .filter((bar): bar is (typeof bars)[number] => Boolean(bar));
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

      <ImportBarsModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        mapCenter={mapCenter}
        onImport={handleImport}
      />
    </motion.div>
  );
};