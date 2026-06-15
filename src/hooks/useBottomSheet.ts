// src/hooks/useBottomSheet.ts
//
// Draggable bottom-sheet behaviour for the mobile planner. The sheet is
// anchored to the bottom of the viewport and its *height* is animated, so
// the content (a flex column) always fills from the drag line down to the
// screen bottom — the Generate CTA stays pinned and nothing clips.
//
// Two snap points: HALF (default) and FULL. Drag the handle up/down; on
// release it springs to the nearest snap.

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, useMotionValue } from "framer-motion";

interface Snaps {
  half: number;
  full: number;
}

export type SheetSnap = "half" | "full";

interface BottomSheetOptions {
  initial?: SheetSnap;
  /** Resting (collapsed) height as a fraction of the viewport height */
  halfFraction?: number;
  /** Expanded height as a fraction of the viewport height */
  fullFraction?: number;
}

export const useBottomSheet = (
  enabled: boolean,
  { initial = "half", halfFraction = 0.5, fullFraction = 0.9 }: BottomSheetOptions = {}
) => {
  const fractions = useRef({ half: halfFraction, full: fullFraction });
  fractions.current = { half: halfFraction, full: fullFraction };

  const computeSnaps = (): Snaps => {
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      half: Math.round(h * fractions.current.half),
      full: Math.round(h * fractions.current.full),
    };
  };

  const initialSnap = initial;
  const snapsRef = useRef<Snaps>(computeSnaps());
  const height = useMotionValue(snapsRef.current[initialSnap]);
  const [snap, setSnap] = useState<SheetSnap>(initialSnap);
  const dragState = useRef<{ startY: number; startH: number } | null>(null);

  const snapTo = useCallback(
    (target: SheetSnap) => {
      const value = snapsRef.current[target];
      setSnap(target);
      animate(height, value, {
        type: "spring",
        stiffness: 420,
        damping: 40,
      });
    },
    [height]
  );

  // Keep snap heights correct across rotation / resize.
  useEffect(() => {
    if (!enabled) return;
    const onResize = () => {
      snapsRef.current = computeSnaps();
      height.set(snapsRef.current[snap]);
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [enabled, snap, height]);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragState.current = { startY: e.clientY, startH: height.get() };

      // Track the most recent motion so a quick flick can decide the snap by
      // velocity (not just final position) — one flick opens/closes the sheet
      // without having to drag it all the way to the other snap.
      let lastY = e.clientY;
      let lastT = performance.now();
      let velocity = 0; // px/ms, positive = flicking up (open)

      const onMove = (ev: PointerEvent) => {
        if (!dragState.current) return;
        const { startY, startH } = dragState.current;
        const dy = startY - ev.clientY; // drag up => taller
        const { half, full } = snapsRef.current;
        const next = Math.min(full + 24, Math.max(half - 80, startH + dy));
        height.set(next);

        const now = performance.now();
        const dt = now - lastT;
        if (dt > 0) velocity = (lastY - ev.clientY) / dt; // up => positive
        lastY = ev.clientY;
        lastT = now;
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        dragState.current = null;
        const { half, full } = snapsRef.current;
        const cur = height.get();
        // A decisive flick wins over position; otherwise fall back to the
        // nearest snap by midpoint.
        const FLICK = 0.45; // px/ms
        if (velocity > FLICK) snapTo("full");
        else if (velocity < -FLICK) snapTo("half");
        else snapTo(cur > (half + full) / 2 ? "full" : "half");
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [enabled, height, snapTo]
  );

  return { height, snap, snapTo, onHandlePointerDown };
};
