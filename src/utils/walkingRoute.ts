// src/utils/walkingRoute.ts
//
// One Mapbox Directions call for the walking line through a crawl's stops,
// shared by the live crawl and the org's view-only map. Start and end are
// optional: the end is skipped when it is the same point as the start.

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

type LngLat = [number, number];

export const walkingRouteCoords = (
  stops: LngLat[],
  start?: LngLat | null,
  end?: LngLat | null
): LngLat[] => {
  const coords: LngLat[] = [];
  if (start) coords.push(start);
  coords.push(...stops);
  if (end && !(start && start[0] === end[0] && start[1] === end[1])) {
    coords.push(end);
  }
  return coords;
};

/** The walking line, or null when there is nothing to draw or the call fails
 *  (a crawl is still usable without its line). */
export const fetchWalkingRoute = async (
  coords: LngLat[]
): Promise<GeoJSON.Feature<GeoJSON.LineString> | null> => {
  if (coords.length < 2 || !MAPBOX_ACCESS_TOKEN) return null;
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords
    .map((c) => c.join(","))
    .join(";")}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.routes?.length > 0
      ? (data.routes[0].geometry as GeoJSON.Feature<GeoJSON.LineString>)
      : null;
  } catch (error) {
    console.error("Error fetching walking route:", error);
    return null;
  }
};
