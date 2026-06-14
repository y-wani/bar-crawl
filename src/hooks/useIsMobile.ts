// src/hooks/useIsMobile.ts
//
// Tracks whether the viewport is at/below a breakpoint. Used to switch
// between desktop (floating sidebar) and mobile (draggable bottom sheet)
// layouts for the planner. 899px matches the CSS breakpoint in layout.css.

import { useEffect, useState } from "react";

export const MOBILE_BREAKPOINT = 899;

export const useIsMobile = (breakpoint: number = MOBILE_BREAKPOINT): boolean => {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
};
