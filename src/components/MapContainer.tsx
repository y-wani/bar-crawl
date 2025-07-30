import React, { useEffect, useRef } from 'react';
import type { AppBat } from '../pages/Home'; // Use the shared type
import { circle as turfCircle } from '@turf/turf';
import mapboxgl, { Marker } from 'mapbox-gl';
import type { LngLatLike } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/Home.css';

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

interface MapContainerProps {
  center: [number, number];
  radius: number | null;
  bars: AppBat[];
  selectedBars: AppBat[];
  selectedBarIds: Set<string>; // For styling markers
  hoveredBarId: string | null; // For styling markers
  onOptimizedRoute: (route: unknown) => void;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  center,
  radius,
  bars = [],
  selectedBars,
  selectedBarIds,
  hoveredBarId,
  onOptimizedRoute,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [id: string]: Marker }>({});

  // Initialize Map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: center,
      zoom: 12,
    });

    map.current.on('load', () => {
      if (!map.current) return;
      // ... (addSource calls for radius-circle and route remain the same)
      map.current.addSource('radius-circle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.current.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius-circle', paint: { 'fill-color': '#8A2BE2', 'fill-opacity': 0.15 } });
      map.current.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.current.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FF1493', 'line-width': 4, 'line-dasharray': [0, 2] } });
    });

    return () => map.current?.remove();
  }, []);

  // Update map view and radius circle
  useEffect(() => {
    if (map.current) {
      map.current.flyTo({ center, zoom: 13, speed: 1.5 });
      const source = map.current.getSource('radius-circle') as mapboxgl.GeoJSONSource;
      if (radius && source) {
        const circle = turfCircle(center, radius, { units: 'miles' });
        source.setData(circle);
      }
    }
  }, [center, radius]);

  // Update markers when bars list, hover, or selection changes
  useEffect(() => {
    if (!map.current) return;

    // Create a Set of current bar IDs for efficient cleanup
    const currentBarIds = new Set(bars.map(b => b.id));

    // Remove markers for bars that are no longer in the list
    Object.keys(markersRef.current).forEach(markerId => {
        if (!currentBarIds.has(markerId)) {
            markersRef.current[markerId].remove();
            delete markersRef.current[markerId];
        }
    });


    bars.forEach(bar => {
      const isSelected = selectedBarIds.has(bar.id);
      const isHovered = hoveredBarId === bar.id;
      
      if (markersRef.current[bar.id]) {
        // Marker exists, just update its style
        const markerElement = markersRef.current[bar.id].getElement();
        markerElement.className = `custom-marker ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`;
      } else {
        // Marker doesn't exist, create it
        const el = document.createElement('div');
        el.className = `custom-marker ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`;
        el.innerText = '🍻';

        const newMarker = new mapboxgl.Marker(el)
          .setLngLat(bar.location.coordinates as LngLatLike)
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<h5>${bar.name}</h5>`))
          .addTo(map.current!);
        markersRef.current[bar.id] = newMarker;
      }
    });
  }, [bars, selectedBarIds, hoveredBarId]);

  // Fetch and draw optimized route
  useEffect(() => {
    // ... (logic for fetching and drawing the route remains the same)
    if (!map.current || selectedBars.length < 2) {
        const source = map.current?.getSource('route') as mapboxgl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features: [] });
        return;
    };
    
    const coordinates = selectedBars.map(bar => bar.location.coordinates.join(',')).join(';');
    const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${coordinates}?roundtrip=false&source=first&destination=last&access_token=${MAPBOX_ACCESS_TOKEN}`;
    
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.code === 'Ok' && data.trips.length > 0) {
          const routeGeoJSON = data.trips[0].geometry;
          const source = map.current!.getSource('route') as mapboxgl.GeoJSONSource;
          source.setData({ type: 'Feature', properties: {}, geometry: routeGeoJSON });
          onOptimizedRoute(data.trips[0]);
        }
      })
      .catch(console.error);
  }, [selectedBars, onOptimizedRoute]);

  return <div ref={mapContainer} className="map-container" />;
};