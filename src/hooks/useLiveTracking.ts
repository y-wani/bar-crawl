// src/hooks/useLiveTracking.ts
//
// Continuous position tracking for Live Crawl Mode. Wraps
// navigator.geolocation.watchPosition and provides:
//   - distance/ETA to the current target stop (pure haversine, no API calls)
//   - a geofence "arrival" trigger, fired at most once per target
//   - a walked-distance feed (GPS-noise-filtered deltas between fixes)
//
// Watching runs only while `enabled` is true (session active + tab open).

import { useEffect, useRef, useState, useCallback } from "react";
import {
  haversineMiles,
  walkingEtaMinutes,
  GEOFENCE_MILES,
} from "../utils/geo";

/** A fix must be at least this accurate (meters) to count toward arrival */
const ARRIVAL_MAX_ACCURACY_M = 100;
/** Consecutive qualifying fixes required before firing onArrive */
const ARRIVAL_FIXES_REQUIRED = 2;
/** Walked-delta noise gates */
const WALK_MAX_ACCURACY_M = 50;
const WALK_MAX_DELTA_MILES = 0.15; // GPS teleport
const WALK_MIN_DELTA_MILES = 0.006; // jitter (~10 m)

interface UseLiveTrackingOptions {
  /** Track only while true (session active and page mounted) */
  enabled: boolean;
  /** Current stop coordinates [lng, lat], or null when no target */
  target: [number, number] | null;
  /** Current stop id — changing it resets the arrival latch */
  targetKey: string | null;
  /** Fired at most once per targetKey when the geofence is satisfied */
  onArrive: (method: "auto") => void;
  /** Noise-filtered miles walked since the previous fix */
  onDistanceWalked?: (deltaMiles: number) => void;
}

interface LiveTrackingState {
  coords: [number, number] | null;
  accuracy: number | null;
  distanceToTargetMiles: number | null;
  etaMinutes: number | null;
  permissionDenied: boolean;
  isWatching: boolean;
}

export const useLiveTracking = ({
  enabled,
  target,
  targetKey,
  onArrive,
  onDistanceWalked,
}: UseLiveTrackingOptions): LiveTrackingState => {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isWatching, setIsWatching] = useState(false);

  // Latch state lives in refs — none of it should retrigger renders
  const arrivalCountRef = useRef(0);
  const arrivedKeysRef = useRef<Set<string>>(new Set());
  const lastFixRef = useRef<[number, number] | null>(null);

  // Keep the latest target/callbacks visible to the watch callback
  // without restarting the watcher on every render
  const targetRef = useRef(target);
  const targetKeyRef = useRef(targetKey);
  const onArriveRef = useRef(onArrive);
  const onDistanceWalkedRef = useRef(onDistanceWalked);
  targetRef.current = target;
  onArriveRef.current = onArrive;
  onDistanceWalkedRef.current = onDistanceWalked;

  // Reset the arrival counter whenever the target stop changes
  if (targetKeyRef.current !== targetKey) {
    targetKeyRef.current = targetKey;
    arrivalCountRef.current = 0;
  }

  const handleFix = useCallback((position: GeolocationPosition) => {
    const { longitude, latitude, accuracy: fixAccuracy } = position.coords;
    const fix: [number, number] = [longitude, latitude];

    setCoords(fix);
    setAccuracy(fixAccuracy);

    // --- Walked-distance feed (noise-filtered) ---
    const prev = lastFixRef.current;
    if (prev && fixAccuracy <= WALK_MAX_ACCURACY_M) {
      const delta = haversineMiles(prev, fix);
      if (delta >= WALK_MIN_DELTA_MILES && delta <= WALK_MAX_DELTA_MILES) {
        onDistanceWalkedRef.current?.(delta);
        lastFixRef.current = fix;
      } else if (delta > WALK_MAX_DELTA_MILES) {
        // Teleport: don't count it, but accept the new position as baseline
        lastFixRef.current = fix;
      }
      // Below jitter threshold: keep the old baseline so tiny moves accumulate
    } else if (!prev) {
      lastFixRef.current = fix;
    }

    // --- Arrival geofence ---
    const currentTarget = targetRef.current;
    const currentKey = targetKeyRef.current;
    if (!currentTarget || !currentKey) return;
    if (arrivedKeysRef.current.has(currentKey)) return;

    const distance = haversineMiles(fix, currentTarget);
    const qualifies =
      fixAccuracy <= ARRIVAL_MAX_ACCURACY_M && distance <= GEOFENCE_MILES;

    if (qualifies) {
      arrivalCountRef.current += 1;
      if (arrivalCountRef.current >= ARRIVAL_FIXES_REQUIRED) {
        arrivedKeysRef.current.add(currentKey);
        arrivalCountRef.current = 0;
        onArriveRef.current("auto");
      }
    } else {
      arrivalCountRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) {
      setIsWatching(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      handleFix,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionDenied(true);
          setIsWatching(false);
        }
        // POSITION_UNAVAILABLE / TIMEOUT: keep watching, fixes may recover
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    setIsWatching(true);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setIsWatching(false);
    };
  }, [enabled, handleFix]);

  const distanceToTargetMiles =
    coords && target ? haversineMiles(coords, target) : null;
  const etaMinutes =
    distanceToTargetMiles !== null
      ? walkingEtaMinutes(distanceToTargetMiles)
      : null;

  return {
    coords,
    accuracy,
    distanceToTargetMiles,
    etaMinutes,
    permissionDenied,
    isWatching: isWatching && !permissionDenied,
  };
};
