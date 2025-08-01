declare module "@mapbox/mapbox-gl-directions" {
  import { IControl } from "mapbox-gl";

  class MapboxDirections implements IControl {
    constructor(options: MapboxDirections.Options);
    onAdd(map: mapboxgl.Map): HTMLElement;
    onRemove(map: mapboxgl.Map): void;
    removeRoutes(): void;
    setOrigin(origin: [number, number]): void;
    setDestination(destination: [number, number]): void;
    addWaypoint(index: number, waypoint: [number, number]): void;
  }

  namespace MapboxDirections {
    interface Options {
      accessToken: string;
      unit?: "imperial" | "metric";
      profile?: string;
      alternatives?: boolean;
      flyTo?: boolean;
      congestion?: boolean;
      controls?: {
        inputs?: boolean;
        instructions?: boolean;
        profileSwitcher?: boolean;
      };
    }
  }

  export default MapboxDirections;
} 