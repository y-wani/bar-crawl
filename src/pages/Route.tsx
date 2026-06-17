// src/pages/Route.tsx

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion, Reorder, useDragControls } from "framer-motion";
import { MapContainer } from "../components/MapContainer";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import PageTransition from "../components/motion/PageTransition";
import { springPanel } from "../components/motion/variants";
import type { AppBat } from "./Home";
import { FaBars, FaTimes, FaGripVertical, FaArrowLeft } from "react-icons/fa";
import {
  FiNavigation,
  FiZap,
  FiCompass,
  FiPlay,
  FiSave,
  FiFolder,
  FiUsers,
} from "react-icons/fi";
import "../styles/Route.css";
import {
  SaveCrawlModal,
  type ExistingCrawlInfo,
} from "../components/SaveCrawlModal";
import { toast } from "../components/Toaster";
import { getCrawlById, convertSavedBarsToAppBars } from "../services/crawlService";
import { useAuth } from "../context/useAuth";
import { useIsMobile } from "../hooks/useIsMobile";
import { useBottomSheet } from "../hooks/useBottomSheet";
import {
  createSession,
  getActiveSessionForUser,
} from "../services/sessionService";
import { createPlan } from "../services/planService";
import { analytics } from "../utils/analytics";

// Mapbox API constants and types
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

interface RoutePageState {
  selectedBars: AppBat[];
  mapCenter: [number, number];
  searchRadius: number;
  loadedFromSaved?: boolean;
  crawlName?: string;
  startCoordinates?: [number, number];
  endCoordinates?: [number, number];
  existingCrawl?: ExistingCrawlInfo;
}

interface DraggableBarItem extends AppBat {
  order: number;
}

interface AddressSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  relevance: number;
  type: string;
}

// A single draggable stop. Separate component so each item gets its own
// drag controls — only the grip handle initiates dragging (keeps text
// selection and touch scrolling working on the rest of the card).
interface RouteStopItemProps {
  bar: DraggableBarItem;
  index: number;
  disabled: boolean;
  optimizing: boolean;
}

const RouteStopItem: React.FC<RouteStopItemProps> = ({
  bar,
  index,
  disabled,
  optimizing,
}) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={bar}
      as="div"
      className={`draggable-bar-item ${optimizing ? "optimizing" : ""}`}
      dragListener={false}
      dragControls={controls}
      layout
      whileDrag={{
        scale: 1.03,
        boxShadow: "0 20px 48px rgba(0, 0, 0, 0.55)",
        borderColor: "rgba(236, 178, 86, 0.5)",
      }}
    >
      <div
        className={`drag-handle ${disabled ? "disabled" : ""}`}
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (!disabled) controls.start(e);
        }}
      >
        <FaGripVertical />
      </div>
      <div className="bar-order-number">{index + 1}</div>
      <div className="bar-details">
        <h4 className="bar-name">{bar.name}</h4>
        {/* Imported stops carry no rating/distance — hide the empty meta */}
        {(bar.rating > 0 || bar.distance > 0) && (
          <div className="bar-meta">
            {bar.rating > 0 && <span>⭐ {bar.rating.toFixed(1)}</span>}
            {bar.distance > 0 && <span>📍 {bar.distance.toFixed(2)} mi</span>}
          </div>
        )}
      </div>
    </Reorder.Item>
  );
};

// Helper function to calculate distance between two coordinates
const calculateDistance = (
  coord1: [number, number],
  coord2: [number, number]
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const dLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1[1] * Math.PI) / 180) *
      Math.cos((coord2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Optimize bar order for the full journey: start → bars → end.
// Exact (branch-and-bound) for crawl-sized routes (≤ 8 stops), which is
// the common case; nearest-neighbor + 2-opt + relocation for larger ones.
const optimizeBarOrder = (
  bars: AppBat[],
  startLocation: [number, number],
  endLocation?: [number, number] | null
): AppBat[] => {
  if (bars.length <= 1) return bars;

  const end = endLocation ?? startLocation;
  const coord = (bar: AppBat) => bar.location.coordinates as [number, number];

  const totalLength = (order: AppBat[]): number => {
    let d = calculateDistance(startLocation, coord(order[0]));
    for (let i = 0; i < order.length - 1; i++) {
      d += calculateDistance(coord(order[i]), coord(order[i + 1]));
    }
    d += calculateDistance(coord(order[order.length - 1]), end);
    return d;
  };

  // --- Exact search with pruning: guaranteed shortest for n ≤ 8 ---
  if (bars.length <= 8) {
    let bestOrder = bars;
    let bestLen = totalLength(bars);

    const search = (
      remaining: AppBat[],
      path: AppBat[],
      from: [number, number],
      lenSoFar: number
    ) => {
      if (lenSoFar >= bestLen) return; // prune
      if (remaining.length === 0) {
        const full = lenSoFar + calculateDistance(from, end);
        if (full < bestLen) {
          bestLen = full;
          bestOrder = path;
        }
        return;
      }
      for (let i = 0; i < remaining.length; i++) {
        const next = remaining[i];
        search(
          [...remaining.slice(0, i), ...remaining.slice(i + 1)],
          [...path, next],
          coord(next),
          lenSoFar + calculateDistance(from, coord(next))
        );
      }
    };

    search(bars, [], startLocation, 0);
    return bestOrder;
  }

  // --- Heuristic for larger routes: NN seed + 2-opt + single relocation ---
  const unvisited = [...bars];
  let route: AppBat[] = [];
  let current = startLocation;
  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let shortest = Infinity;
    unvisited.forEach((bar, index) => {
      const d = calculateDistance(current, coord(bar));
      if (d < shortest) {
        shortest = d;
        nearestIndex = index;
      }
    });
    const nearest = unvisited.splice(nearestIndex, 1)[0];
    route.push(nearest);
    current = coord(nearest);
  }

  let best = totalLength(route);
  let improved = true;
  while (improved) {
    improved = false;
    // 2-opt: reverse segments
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ];
        const length = totalLength(candidate);
        if (length < best - 1e-9) {
          route = candidate;
          best = length;
          improved = true;
        }
      }
    }
    // Or-opt: relocate single stops (escapes 2-opt local optima)
    for (let i = 0; i < route.length; i++) {
      for (let j = 0; j < route.length; j++) {
        if (i === j) continue;
        const without = [...route.slice(0, i), ...route.slice(i + 1)];
        const candidate = [
          ...without.slice(0, j),
          route[i],
          ...without.slice(j),
        ];
        const length = totalLength(candidate);
        if (length < best - 1e-9) {
          route = candidate;
          best = length;
          improved = true;
        }
      }
    }
  }

  return route;
};

// Geocode coordinates to address
const reverseGeocode = async (
  coordinates: [number, number]
): Promise<string> => {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates[0]},${coordinates[1]}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
    );
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name;
    }
    return `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
  } catch (error) {
    console.error("Reverse geocoding failed:", error);
    return `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
  }
};



const Route: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  // Opens fairly tall (arranging stops is the main task) but leaves a strip
  // of map visible; drag up for the full list.
  const sheet = useBottomSheet(isMobile, {
    initial: "full",
    halfFraction: 0.34,
    fullFraction: 0.82,
  });

  const routeState = location.state as RoutePageState | null;

  // Guard redirect only if no state and no crawlId param
  useEffect(() => {
    const crawlId = searchParams.get("crawlId");
    if (
      (!routeState || !routeState.selectedBars || routeState.selectedBars.length < 2) &&
      !crawlId
    ) {
      navigate("/home");
    }
  }, [routeState, navigate, searchParams]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [draggableBars, setDraggableBars] = useState<DraggableBarItem[]>([]);
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [startCoordinates, setStartCoordinates] = useState<
    [number, number] | null
  >(null);
  const [endCoordinates, setEndCoordinates] = useState<[number, number] | null>(
    null
  );
  const [userCoordinates, setUserCoordinates] = useState<
    [number, number] | null
  >(null);
  const [mapCenter] = useState<[number, number]>(
    routeState?.mapCenter || [-83.0007, 39.9612]
  );
  const [searchRadius] = useState<number>(routeState?.searchRadius ?? 1);

  // Route metrics
  const [totalDistanceMiles, setTotalDistanceMiles] = useState<number | null>(null);
  const [estimatedDurationMin, setEstimatedDurationMin] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState({
    location: true,
    optimizing: true,
    generating: true,
  });

  const [routeData, setRouteData] =
    useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const isInitialLoad = useRef(true);
  // The order the user originally picked their bars in (before any
  // auto/manual optimization) — lets them restore it with one click
  const originalOrderIds = useRef<string[] | null>(null);

  const getCurrentLocation = useCallback(async (): Promise<
    [number, number]
  > => {
    setIsLoading((prev) => ({ ...prev, location: true }));
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000,
          });
        }
      );
      const coords: [number, number] = [
        position.coords.longitude,
        position.coords.latitude,
      ];
      setUserCoordinates(coords);
      setStartCoordinates(coords);
      setEndCoordinates(coords);
      const address = await reverseGeocode(coords);
      setStartLocation(address);
      setEndLocation(address);
      return coords;
    } catch (error) {
      console.error("Error getting location:", error);
      const fallbackCoords: [number, number] = [mapCenter[0], mapCenter[1]];
      setUserCoordinates(fallbackCoords);
      setStartCoordinates(fallbackCoords);
      setEndCoordinates(fallbackCoords);
      const address = await reverseGeocode(fallbackCoords);
      setStartLocation(address);
      setEndLocation(address);
      return fallbackCoords;
    } finally {
      setIsLoading((prev) => ({ ...prev, location: false }));
    }
  }, [mapCenter]);

  const handleGenerateRoute = useCallback(
    async (
      barsToUse: DraggableBarItem[],
      start: [number, number] | null,
      end: [number, number] | null
    ) => {
      if (barsToUse.length < 2) return;
      setIsLoading((prev) => ({ ...prev, generating: true }));

      try {
        const coordinatesArray: string[] = [];
        if (start) {
          coordinatesArray.push(start.join(","));
        }
        barsToUse.forEach((bar) => {
          coordinatesArray.push(bar.location.coordinates.join(","));
        });
        if (end && (start?.[0] !== end?.[0] || start?.[1] !== end?.[1])) {
          coordinatesArray.push(end.join(","));
        }

        const coordinates = coordinatesArray.join(";");
        const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          setRouteData(
            data.routes[0].geometry as GeoJSON.Feature<GeoJSON.LineString>
          );
          // Update metrics
          if (typeof data.routes[0].distance === "number") {
            setTotalDistanceMiles(data.routes[0].distance / 1609.344);
          }
          if (typeof data.routes[0].duration === "number") {
            setEstimatedDurationMin(Math.round(data.routes[0].duration / 60));
          }
        }
      } catch (error) {
        console.error("Error fetching route:", error);
      } finally {
        setIsLoading((prev) => ({ ...prev, generating: false }));
      }
    },
    []
  );

  const throttledRouteGeneration = useRef<NodeJS.Timeout | null>(null);

  const throttledGenerateRoute = useCallback(
    (
      barsToUse: DraggableBarItem[],
      start: [number, number] | null,
      end: [number, number] | null
    ) => {
      if (throttledRouteGeneration.current) {
        clearTimeout(throttledRouteGeneration.current);
      }

      throttledRouteGeneration.current = setTimeout(() => {
        handleGenerateRoute(barsToUse, start, end);
      }, 300);
    },
    [handleGenerateRoute]
  );

  useEffect(() => {
    const crawlId = searchParams.get("crawlId");
    const initializeFromState = async () => {
      if (
        routeState?.selectedBars &&
        routeState.selectedBars.length >= 2 &&
        isInitialLoad.current
      ) {
        isInitialLoad.current = false;
        originalOrderIds.current = routeState.selectedBars.map((b) => b.id);
        setIsLoading({ location: true, optimizing: true, generating: true });

        let startCoords: [number, number];
        let endCoords: [number, number];

        if (routeState.startCoordinates) {
          // Restoring a saved crawl: use its saved start/end, not geolocation
          startCoords = routeState.startCoordinates;
          endCoords = routeState.endCoordinates ?? startCoords;
          setUserCoordinates(startCoords);
          setStartCoordinates(startCoords);
          setEndCoordinates(endCoords);
          const [startAddr, endAddr] = await Promise.all([
            reverseGeocode(startCoords),
            reverseGeocode(endCoords),
          ]);
          setStartLocation(startAddr);
          setEndLocation(endAddr);
          setIsLoading((prev) => ({ ...prev, location: false }));
        } else {
          startCoords = await getCurrentLocation();
          // If the user's real location is far from the searched area,
          // anchor the route to the search center instead of routing
          // across states (IP-based geolocation can be way off)
          if (calculateDistance(startCoords, routeState.mapCenter) > 25) {
            startCoords = routeState.mapCenter;
            setUserCoordinates(startCoords);
            setStartCoordinates(startCoords);
            setEndCoordinates(startCoords);
            const addr = await reverseGeocode(startCoords);
            setStartLocation(addr);
            setEndLocation(addr);
          }
          endCoords = startCoords;
        }

        // Saved crawls already carry their stop order; only optimize new routes
        const orderedBars = routeState.loadedFromSaved
          ? routeState.selectedBars
          : optimizeBarOrder(routeState.selectedBars, startCoords, endCoords);
        const initialBars = orderedBars.map((bar, index) => ({
          ...bar,
          order: index,
        }));
        setDraggableBars(initialBars);
        setIsLoading((prev) => ({ ...prev, optimizing: false }));
        await throttledGenerateRoute(initialBars, startCoords, endCoords);
      }
    };

    const initializeFromCrawlId = async () => {
      if (!crawlId || !isInitialLoad.current) return;
      try {
        isInitialLoad.current = false;
        setIsLoading({ location: true, optimizing: true, generating: true });
        const crawl = await getCrawlById(crawlId);
        if (!crawl) {
          navigate("/home");
          return;
        }
        const bars = convertSavedBarsToAppBars(crawl.bars);
        originalOrderIds.current = bars.map((b) => b.id);
        const currentCoords = [crawl.route.startLocation.lng, crawl.route.startLocation.lat] as [number, number];
        const endCoords: [number, number] = [
          crawl.route.endLocation?.lng ?? currentCoords[0],
          crawl.route.endLocation?.lat ?? currentCoords[1],
        ];
        setUserCoordinates(currentCoords);
        setStartCoordinates(currentCoords);
        setEndCoordinates(endCoords);
        const [startAddr, endAddr] = await Promise.all([
          reverseGeocode(currentCoords),
          reverseGeocode(endCoords),
        ]);
        setStartLocation(startAddr);
        setEndLocation(endAddr);
        setIsLoading((prev) => ({ ...prev, location: false }));
        // Saved crawls already carry their stop order
        const initialBars = bars.map((bar, index) => ({
          ...bar,
          order: index,
        }));
        setDraggableBars(initialBars);
        setIsLoading((prev) => ({ ...prev, optimizing: false }));
        await throttledGenerateRoute(initialBars, currentCoords, endCoords);
      } catch (e) {
        console.error("Failed to load crawl by id", e);
        navigate("/home");
      }
    };

    if (routeState?.selectedBars?.length) {
      initializeFromState();
    } else if (crawlId) {
      initializeFromCrawlId();
    }
  }, [routeState, getCurrentLocation, throttledGenerateRoute, navigate, searchParams]);

  const handleOptimizeRoute = useCallback(async () => {
    const optimizeStart = startCoordinates ?? userCoordinates;
    if (!optimizeStart || draggableBars.length < 2) return;
    setIsLoading((prev) => ({ ...prev, optimizing: true, generating: true }));

    await new Promise((res) => setTimeout(res, 50));

    // Optimize against the actual route anchors, not just the user position
    const optimized = optimizeBarOrder(
      draggableBars,
      optimizeStart,
      endCoordinates
    );
    const reorderedBars = optimized.map((bar, index) => ({
      ...bar,
      order: index,
    }));
    setDraggableBars(reorderedBars);

    setIsLoading((prev) => ({ ...prev, optimizing: false }));

    // Make the reorder explicit — and the restore button offers the way back
    const orderChanged = reorderedBars.some(
      (bar, i) => bar.id !== draggableBars[i]?.id
    );
    toast.success(
      orderChanged
        ? "Stops reordered for the shortest walk"
        : "Your order is already the shortest walk"
    );

    await throttledGenerateRoute(
      reorderedBars,
      startCoordinates,
      endCoordinates
    );
  }, [
    userCoordinates,
    draggableBars,
    startCoordinates,
    endCoordinates,
    throttledGenerateRoute,
  ]);

  // True when the current stop order differs from the user's original pick
  const orderDiffersFromOriginal = useMemo(() => {
    const original = originalOrderIds.current;
    if (!original || draggableBars.length === 0) return false;
    const presentOriginal = original.filter((id) =>
      draggableBars.some((bar) => bar.id === id)
    );
    if (presentOriginal.length !== draggableBars.length) return true;
    return draggableBars.some((bar, i) => bar.id !== presentOriginal[i]);
  }, [draggableBars]);

  // Put the stops back in the order the user originally selected them
  const handleRestoreOriginalOrder = useCallback(() => {
    const original = originalOrderIds.current;
    if (!original) return;
    const byId = new Map(draggableBars.map((bar) => [bar.id, bar]));
    const restored = original
      .map((id) => byId.get(id))
      .filter((bar): bar is DraggableBarItem => Boolean(bar))
      .map((bar, index) => ({ ...bar, order: index }));
    if (restored.length < 2) return;
    setDraggableBars(restored);
    toast.success("Restored your original order");
    throttledGenerateRoute(restored, startCoordinates, endCoordinates);
  }, [draggableBars, startCoordinates, endCoordinates, throttledGenerateRoute]);

  // Framer Motion Reorder gives us the new order directly; the debounced
  // effect watching `draggableBars` regenerates the route.
  const handleReorder = (newOrder: DraggableBarItem[]) => {
    setDraggableBars(newOrder.map((bar, index) => ({ ...bar, order: index })));
  };

  const handleStartLocationSelect = (suggestion: AddressSuggestion) => {
    console.log('Start location selected:', suggestion.place_name);
    setStartCoordinates(suggestion.center);
    setStartLocation(suggestion.place_name);
  };

  const handleEndLocationSelect = (suggestion: AddressSuggestion) => {
    console.log('End location selected:', suggestion.place_name);
    setEndCoordinates(suggestion.center);
    setEndLocation(suggestion.place_name);
  };

  const handleFinalGenerateClick = () => {
    throttledGenerateRoute(draggableBars, startCoordinates, endCoordinates);
  };

  const handleSaveCrawl = () => {
    setShowSaveModal(true);
  };

  // ----- Live Crawl Mode entry -----
  const [startingCrawl, setStartingCrawl] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);

  // "Plan it together": create a plan lobby (RSVP + vote) from the current
  // selection, then send the host there to share the link with friends.
  const handlePlanWithFriends = async () => {
    if (!user || draggableBars.length < 2 || !startCoordinates) return;
    setCreatingPlan(true);
    try {
      const planId = await createPlan({
        hostUid: user.uid,
        hostName: user.displayName ?? user.email?.split("@")[0] ?? null,
        title: routeState?.crawlName || "Bar Crawl",
        candidates: draggableBars.map((bar) => ({
          barId: bar.id,
          name: bar.name,
          rating: bar.rating,
          coordinates: bar.location.coordinates,
        })),
        route: {
          startCoordinates,
          endCoordinates: endCoordinates ?? startCoordinates,
        },
      });
      analytics.planCreated(draggableBars.length);
      navigate("/plan", { state: { planId } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't create the plan"
      );
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleStartCrawl = async () => {
    if (!user || draggableBars.length < 2 || !startCoordinates) return;
    setStartingCrawl(true);
    try {
      // One active crawl at a time — resume if it exists
      const existing = await getActiveSessionForUser(user.uid);
      if (existing?.id) {
        toast.success("Resuming your active crawl");
        navigate("/live", { state: { sessionId: existing.id } });
        return;
      }

      const sessionId = await createSession({
        hostUid: user.uid,
        displayName: user.displayName ?? user.email?.split("@")[0] ?? null,
        stops: draggableBars.map((bar) => ({
          barId: bar.id,
          name: bar.name,
          rating: bar.rating,
          order: bar.order,
          coordinates: bar.location.coordinates,
        })),
        crawlId:
          routeState?.existingCrawl?.id ?? searchParams.get("crawlId") ?? null,
        crawlName: routeState?.crawlName ?? "",
        route: {
          startCoordinates,
          endCoordinates: endCoordinates ?? startCoordinates,
          plannedDistanceMiles: totalDistanceMiles,
          plannedDurationMin: estimatedDurationMin,
        },
      });
      analytics.crawlStarted(draggableBars.length);
      navigate("/live", { state: { sessionId } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't start the crawl"
      );
    } finally {
      setStartingCrawl(false);
    }
  };

  const handleSaveSuccess = () => {
    toast.success("Crawl saved successfully!");
  };

  const handleCloseSaveModal = () => {
    setShowSaveModal(false);
  };

  const handleToggleBar = useCallback(
    (barId: string) => {
      // On the route page, clicking a bar on the map will remove it from the crawl
      const newBars = draggableBars.filter((bar) => bar.id !== barId);
      const reorderedBars = newBars.map((bar, index) => ({
        ...bar,
        order: index,
      }));
      setDraggableBars(reorderedBars);
    },
    [draggableBars]
  );

  const selectedBarIds = useMemo(
    () => new Set(draggableBars.map((bar) => bar.id)),
    [draggableBars]
  );

  useEffect(() => {
    if (
      draggableBars.length >= 2 &&
      startCoordinates &&
      endCoordinates &&
      !isInitialLoad.current
    ) {
      const timeoutId = setTimeout(() => {
        if (!isLoading.optimizing) {
          throttledGenerateRoute(
            draggableBars,
            startCoordinates,
            endCoordinates
          );
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [
    draggableBars,
    startCoordinates,
    endCoordinates,
    throttledGenerateRoute,
    isLoading.optimizing,
  ]);

  if (!routeState && !searchParams.get("crawlId")) return null;

  const isBusy = isLoading.generating || isLoading.optimizing;

  return (
    <PageTransition>
    <div className="route-page">
      <div className="route-header">
        <button className="back-button" onClick={() => navigate("/home")}>
          <FaArrowLeft /> Back to Planning
        </button>
        <h1 className="route-title">Create Your Route</h1>
        <div className="route-header-actions">
          <span className="selected-count">{draggableBars.length} stops</span>
          <button
            className="drawer-toggle"
            onClick={() => navigate("/saved-crawls")}
            title="Open Saved Crawls"
          >
            <FiFolder />
          </button>
          <button
            className="drawer-toggle"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          >
            {isDrawerOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </div>

      <div className="route-content">
        <div className="route-map-container">
          <MapContainer
            center={mapCenter}
            radius={searchRadius}
            bars={draggableBars}
            selectedBarIds={selectedBarIds}
            hoveredBarId={hoveredBarId}
            onToggleBar={handleToggleBar}
            onHoverBar={setHoveredBarId}
            onMapViewChange={() => {}}
            onDrawComplete={() => {}}
            route={routeData}
            startCoordinates={startCoordinates}
            endCoordinates={endCoordinates}
          />
          {(totalDistanceMiles !== null || estimatedDurationMin !== null) && (
            <motion.div
              className="eta-summary-bar"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springPanel}
            >
              {totalDistanceMiles !== null && (
                <span className="eta-segment">{totalDistanceMiles.toFixed(1)} mi</span>
              )}
              {estimatedDurationMin !== null && (
                <span className="eta-separator">•</span>
              )}
              {estimatedDurationMin !== null && (
                <span className="eta-segment">
                  ~{estimatedDurationMin} min walk
                </span>
              )}
            </motion.div>
          )}
        </div>

        <motion.div
          className={`route-drawer ${isDrawerOpen ? "open" : "closed"} ${
            isMobile ? `is-sheet snap-${sheet.snap}` : ""
          }`}
          animate={isMobile ? undefined : { x: isDrawerOpen ? 0 : "calc(100% + 32px)" }}
          transition={springPanel}
          // "auto" on desktop lets the absolute top/bottom stretch the drawer
          // and clears any stale sheet height when crossing the breakpoint.
          style={{ height: isMobile ? sheet.height : "auto" }}
        >
          {isMobile && (
            <button
              type="button"
              className="sheet-handle"
              aria-label={sheet.snap === "full" ? "Collapse panel" : "Expand panel"}
              onPointerDown={sheet.onHandlePointerDown}
              onClick={() => sheet.snapTo(sheet.snap === "full" ? "half" : "full")}
            >
              <span className="sheet-handle-grip" />
            </button>
          )}

          <div className="drawer-header">
            <div className="smart-controls">
              <button
                className={`btn-optimize-route ${
                  isLoading.optimizing ? "loading" : ""
                }`}
                onClick={handleOptimizeRoute}
                disabled={isBusy}
              >
                {isLoading.optimizing ? (
                  <>
                    <div className="spinner"></div> Optimizing...
                  </>
                ) : (
                  <>
                    <FiZap size={16} /> Optimize Route
                  </>
                )}
              </button>
              <button
                className={`btn-current-location ${
                  isLoading.location ? "loading" : ""
                }`}
                onClick={getCurrentLocation}
                disabled={isLoading.location}
              >
                {isLoading.location ? (
                  <>
                    <div className="spinner"></div> Finding...
                  </>
                ) : (
                  <>
                    <FiNavigation size={16} /> Use My Location
                  </>
                )}
              </button>
            </div>
            <div className="location-section">
              <AddressAutocomplete
                value={startLocation}
                onChange={setStartLocation}
                onSelect={handleStartLocationSelect}
                placeholder="Enter starting point..."
                label="Start Location"
                icon={null}
              />
            </div>
          </div>

          <div className="drawer-content">
            <div className="bars-section">
              <h3 className="section-title">Your Bar Crawl Route</h3>
              <div className="section-subtitle-row">
                <p className="section-subtitle">
                  {isBusy ? "Updating route..." : "Drag to reorder stops"}
                </p>
                {orderDiffersFromOriginal && !isBusy && (
                  <button
                    className="btn-restore-order"
                    onClick={handleRestoreOriginalOrder}
                    title="Put the stops back in the order you selected them"
                  >
                    ↩ Restore my order
                  </button>
                )}
              </div>
              <Reorder.Group
                axis="y"
                values={draggableBars}
                onReorder={handleReorder}
                as="div"
                className="draggable-bars-list"
              >
                {draggableBars.map((bar, index) => (
                  <RouteStopItem
                    key={bar.id}
                    bar={bar}
                    index={index}
                    disabled={isBusy}
                    optimizing={isLoading.optimizing}
                  />
                ))}
              </Reorder.Group>
            </div>
          </div>

          <div className="drawer-footer">
            <div className="location-section">
              <AddressAutocomplete
                value={endLocation}
                onChange={setEndLocation}
                onSelect={handleEndLocationSelect}
                placeholder="Enter ending point..."
                label="End Location"
                icon={null}
                dropdownDirection="up"
              />
            </div>
            <div className="route-actions">
              <div className="route-buttons">
                <button
                  className="btn-save-crawl"
                  onClick={handleSaveCrawl}
                  disabled={draggableBars.length < 2}
                  title={
                    draggableBars.length < 2
                      ? "Need at least 2 bars to save"
                      : "Save this crawl"
                  }
                >
                  <FiSave size={16} />
                  Save Crawl
                </button>

                <button
                  className={`btn-generate-final-route ${
                    isLoading.generating ? "loading" : ""
                  }`}
                  onClick={handleFinalGenerateClick}
                  disabled={isBusy}
                >
                  {isLoading.generating ? (
                    <>
                      <div className="spinner"></div> Generating...
                    </>
                  ) : (
                    <>
                      <FiCompass size={18} /> Generate Route
                    </>
                  )}
                </button>
              </div>

              <div className="route-cta-row">
              <button
                className="btn-start-crawl"
                onClick={handleStartCrawl}
                disabled={
                  draggableBars.length < 2 ||
                  isBusy ||
                  !startCoordinates ||
                  startingCrawl
                }
                title={
                  draggableBars.length < 2
                    ? "Need at least 2 stops to start"
                    : "Start the night — live check-ins at every stop"
                }
              >
                {startingCrawl ? (
                  <>
                    <div className="spinner"></div> Starting…
                  </>
                ) : (
                  <>
                    <FiPlay size={18} /> Start Crawl
                  </>
                )}
              </button>

              <button
                className="btn-plan-friends"
                onClick={handlePlanWithFriends}
                disabled={
                  draggableBars.length < 2 ||
                  isBusy ||
                  !startCoordinates ||
                  creatingPlan
                }
                title={
                  draggableBars.length < 2
                    ? "Need at least 2 stops to plan"
                    : "Invite friends to RSVP & vote before you go"
                }
              >
                {creatingPlan ? (
                  <>
                    <div className="spinner"></div> Creating…
                  </>
                ) : (
                  <>
                    <FiUsers size={18} /> Plan with friends
                  </>
                )}
              </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <SaveCrawlModal
        isOpen={showSaveModal}
        onClose={handleCloseSaveModal}
        bars={draggableBars}
        mapCenter={mapCenter}
        searchRadius={searchRadius}
        startCoordinates={startCoordinates}
        endCoordinates={endCoordinates}
        onSaveSuccess={handleSaveSuccess}
        existingCrawl={routeState?.existingCrawl ?? null}
      />
    </div>
    </PageTransition>
  );
};

export default Route;
