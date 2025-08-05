// src/hooks/useLocationPermission.ts

import { useState, useEffect, useCallback } from "react";

interface LocationState {
  coords: [number, number] | null;
  permission: "granted" | "denied" | "prompt" | "unknown";
  isLoading: boolean;
  error: string | null;
  hasUserConsent: boolean; // Track if user has made a choice
}

export const useLocationPermission = () => {
  const [locationState, setLocationState] = useState<LocationState>({
    coords: null,
    permission: "unknown",
    isLoading: false,
    error: null,
    hasUserConsent: false,
  });

  // Check if geolocation is supported
  const isGeolocationSupported = typeof navigator !== "undefined" && "geolocation" in navigator;

  // Check permission status
  const checkPermissionStatus = useCallback(async (): Promise<"granted" | "denied" | "prompt"> => {
    if (!isGeolocationSupported) {
      return "denied";
    }

    // For browsers that support the Permissions API
    if ("permissions" in navigator) {
      try {
        const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        return permission.state as "granted" | "denied" | "prompt";
      } catch (error) {
        console.warn("Permissions API not supported, falling back to manual check");
      }
    }

    // Fallback: try to get current position to check permission
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve("granted"),
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            resolve("denied");
          } else {
            resolve("prompt");
          }
        },
        { timeout: 1000, maximumAge: 300000 }
      );
    });
  }, [isGeolocationSupported]);

  // Get user location
  const getUserLocation = useCallback(async (): Promise<[number, number] | null> => {
    if (!isGeolocationSupported) {
      throw new Error("Geolocation is not supported by your browser");
    }

    setLocationState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        });
      });

      const { longitude, latitude } = position.coords;
      const coords: [number, number] = [longitude, latitude];
      
      setLocationState({
        coords,
        permission: "granted",
        isLoading: false,
        error: null,
        hasUserConsent: true,
      });

      // Store location and user consent in localStorage for persistence
      localStorage.setItem("userLocation", JSON.stringify(coords));
      localStorage.setItem("locationPermission", "granted");
      localStorage.setItem("locationUserConsent", "true");
      localStorage.setItem("locationTimestamp", Date.now().toString());

      return coords;
    } catch (error) {
      console.error("Error getting user location:", error);
      
      let errorMessage = "Unable to get your location";
      let permission: "granted" | "denied" | "prompt" = "prompt";

      if (error instanceof GeolocationPositionError) {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location access was denied";
            permission = "denied";
            localStorage.setItem("locationPermission", "denied");
            localStorage.setItem("locationUserConsent", "true");
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out";
            break;
        }
      }

      setLocationState({
        coords: null,
        permission,
        isLoading: false,
        error: errorMessage,
        hasUserConsent: permission === "denied",
      });

      return null;
    }
  }, [isGeolocationSupported]);

  // Initialize location state from localStorage and check permissions
  useEffect(() => {
    const initializeLocation = async () => {
      // Check if we have stored location data and user consent
      const storedLocation = localStorage.getItem("userLocation");
      const storedPermission = localStorage.getItem("locationPermission") as "granted" | "denied" | "prompt" | null;
      const hasUserConsent = localStorage.getItem("locationUserConsent") === "true";
      const locationTimestamp = localStorage.getItem("locationTimestamp");

      // Check if stored location is still valid (less than 1 hour old)
      const isLocationValid = locationTimestamp && 
        (Date.now() - parseInt(locationTimestamp)) < 3600000; // 1 hour

      if (storedLocation && storedPermission === "granted" && hasUserConsent && isLocationValid) {
        try {
          const coords: [number, number] = JSON.parse(storedLocation);
          setLocationState({
            coords,
            permission: "granted",
            isLoading: false,
            error: null,
            hasUserConsent: true,
          });
          console.log("📍 Loaded stored location:", coords);
        } catch (error) {
          console.error("Error parsing stored location:", error);
          localStorage.removeItem("userLocation");
          localStorage.removeItem("locationTimestamp");
        }
      } else if (hasUserConsent && storedPermission === "denied") {
        // User has explicitly denied location access
        setLocationState({
          coords: null,
          permission: "denied",
          isLoading: false,
          error: null,
          hasUserConsent: true,
        });
        console.log("📍 User has denied location access");
      } else {
        // Check current permission status
        const currentPermission = await checkPermissionStatus();
        setLocationState(prev => ({
          ...prev,
          permission: currentPermission,
          hasUserConsent: false, // User hasn't made a choice yet
        }));
      }
    };

    initializeLocation();
  }, [checkPermissionStatus]);

  // Clear stored location data
  const clearStoredLocation = useCallback(() => {
    localStorage.removeItem("userLocation");
    localStorage.removeItem("locationPermission");
    localStorage.removeItem("locationUserConsent");
    localStorage.removeItem("locationTimestamp");
    setLocationState({
      coords: null,
      permission: "prompt",
      isLoading: false,
      error: null,
      hasUserConsent: false,
    });
  }, []);

  // Mark user consent (when they explicitly choose to allow/deny)
  const markUserConsent = useCallback((permission: "granted" | "denied") => {
    localStorage.setItem("locationPermission", permission);
    localStorage.setItem("locationUserConsent", "true");
    setLocationState(prev => ({
      ...prev,
      permission,
      hasUserConsent: true,
    }));
  }, []);

  // Reset location state (for testing or manual reset)
  const resetLocation = useCallback(() => {
    setLocationState({
      coords: null,
      permission: "prompt",
      isLoading: false,
      error: null,
      hasUserConsent: false,
    });
  }, []);

  return {
    ...locationState,
    isGeolocationSupported,
    getUserLocation,
    clearStoredLocation,
    resetLocation,
    checkPermissionStatus,
    markUserConsent,
  };
}; 