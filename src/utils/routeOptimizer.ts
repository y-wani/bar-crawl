// src/utils/routeOptimizer.ts
//
// Stop-ordering for a crawl, shared by the app and by scripts/batch-routes.mjs.
//
// It lives here rather than inside Route.tsx because the batch tool publishes
// the mileage it computes ("14 bars, 4.8 miles as listed, 2.1 in walking
// order"). If the script carried its own copy of the maths, that advertised
// number could drift away from the route the app actually draws when somebody
// opens the link — the one number in the post nobody can check without
// clicking, and therefore the one that must not be wrong.
//
// Node 22 strips TypeScript natively, so the .mjs script imports this file
// directly. Keep it dependency-free and type-only for that reason.

// Explicit .ts extension (allowImportingTsExtensions is on): Node's ESM
// resolver has no bundler-style extension guessing, and batch-routes.mjs
// imports this file directly.
import { haversineMiles } from "./geo.ts";

/** [lng, lat] — the order used everywhere in this codebase. */
export type Coord = [number, number];

/** Anything with a position. Generic so the app can pass AppBat and the batch
 *  script can pass plain resolved-lineup objects. */
export interface Positioned {
  location: { coordinates: Coord };
}

const at = (stop: Positioned): Coord => stop.location.coordinates;

/**
 * Walking distance of an ordered path with free endpoints: stop 1 → 2 → … → n.
 *
 * This is the right measure for a published lineup, which has no home to leave
 * from or return to — it is simply a set of bars somebody has to walk between.
 */
export const pathMiles = (stops: Positioned[]): number => {
  let total = 0;
  for (let i = 0; i < stops.length - 1; i += 1) {
    total += haversineMiles(at(stops[i]), at(stops[i + 1]));
  }
  return total;
};

/** Distance of the full anchored journey: start → stops → end (end defaults to
 *  start, i.e. a loop home). This is what the app's own route measures. */
export const journeyMiles = (
  stops: Positioned[],
  start: Coord,
  end?: Coord | null
): number => {
  if (stops.length === 0) return 0;
  const finish = end ?? start;
  let total = haversineMiles(start, at(stops[0]));
  for (let i = 0; i < stops.length - 1; i += 1) {
    total += haversineMiles(at(stops[i]), at(stops[i + 1]));
  }
  return total + haversineMiles(at(stops[stops.length - 1]), finish);
};

/** Above this, the exact search is too slow and the heuristics take over.
 *  8 stops is 40,320 orderings, which the pruning cuts down to nothing. */
const EXACT_LIMIT = 8;

/**
 * Order stops for an anchored journey: start → stops → end.
 *
 * Exact (branch-and-bound) for crawl-sized routes, which is the common case;
 * nearest-neighbour + 2-opt + relocation for larger ones. Behaviour is
 * unchanged from the original implementation in Route.tsx.
 */
export const optimizeStopOrder = <T extends Positioned>(
  stops: T[],
  start: Coord,
  end?: Coord | null
): T[] => {
  if (stops.length <= 1) return stops;
  const finish = end ?? start;
  const length = (order: T[]) => journeyMiles(order, start, finish);

  // --- Exact search with pruning: guaranteed shortest for small crawls ---
  if (stops.length <= EXACT_LIMIT) {
    let bestOrder = stops;
    let bestLen = length(stops);

    const search = (
      remaining: T[],
      path: T[],
      from: Coord,
      lenSoFar: number
    ): void => {
      if (lenSoFar >= bestLen) return; // prune
      if (remaining.length === 0) {
        const full = lenSoFar + haversineMiles(from, finish);
        if (full < bestLen) {
          bestLen = full;
          bestOrder = path;
        }
        return;
      }
      for (let i = 0; i < remaining.length; i += 1) {
        const next = remaining[i];
        search(
          [...remaining.slice(0, i), ...remaining.slice(i + 1)],
          [...path, next],
          at(next),
          lenSoFar + haversineMiles(from, at(next))
        );
      }
    };

    search(stops, [], start, 0);
    return bestOrder;
  }

  return refine(nearestNeighbour(stops, start), length);
};

/**
 * Order stops with FREE endpoints — start wherever is best, end wherever is
 * best, just minimise the total walk.
 *
 * This is what a lineup off an event page needs. The anchored optimizer would
 * have to invent a start, and picking one (city centre, first bar listed)
 * quietly biases the answer toward wherever it was invented.
 */
export const optimizeOpenPath = <T extends Positioned>(stops: T[]): T[] => {
  if (stops.length <= 2) return stops;

  if (stops.length <= EXACT_LIMIT) {
    let bestOrder = stops;
    let bestLen = pathMiles(stops);

    const search = (remaining: T[], path: T[], lenSoFar: number): void => {
      if (lenSoFar >= bestLen) return; // prune
      if (remaining.length === 0) {
        if (lenSoFar < bestLen) {
          bestLen = lenSoFar;
          bestOrder = path;
        }
        return;
      }
      for (let i = 0; i < remaining.length; i += 1) {
        const next = remaining[i];
        // An empty path costs nothing to start from, which is exactly what
        // "free endpoints" means — every stop gets its turn as stop one.
        const step =
          path.length === 0
            ? 0
            : haversineMiles(at(path[path.length - 1]), at(next));
        search(
          [...remaining.slice(0, i), ...remaining.slice(i + 1)],
          [...path, next],
          lenSoFar + step
        );
      }
    };

    search(stops, [], 0);
    return bestOrder;
  }

  // Larger lineups: seed from every possible first stop (cheap, and a single
  // nearest-neighbour seed is badly start-dependent on an open path), then
  // refine the best one.
  let best = stops;
  let bestLen = pathMiles(stops);
  for (const seed of stops) {
    const candidate = nearestNeighbour(stops, at(seed), seed);
    const len = pathMiles(candidate);
    if (len < bestLen) {
      best = candidate;
      bestLen = len;
    }
  }
  return refine(best, pathMiles);
};

/** Greedy nearest-neighbour ordering from a position. `first`, when given, is
 *  forced to the front (used to seed an open path from a chosen stop). */
const nearestNeighbour = <T extends Positioned>(
  stops: T[],
  from: Coord,
  first?: T
): T[] => {
  const remaining = [...stops];
  const order: T[] = [];
  let current = from;

  if (first) {
    const i = remaining.indexOf(first);
    if (i >= 0) {
      order.push(remaining.splice(i, 1)[0]);
      current = at(order[0]);
    }
  }

  while (remaining.length > 0) {
    let nearest = 0;
    let shortest = Infinity;
    remaining.forEach((stop, index) => {
      const d = haversineMiles(current, at(stop));
      if (d < shortest) {
        shortest = d;
        nearest = index;
      }
    });
    const next = remaining.splice(nearest, 1)[0];
    order.push(next);
    current = at(next);
  }
  return order;
};

/** 2-opt (reverse a segment) plus Or-opt (relocate one stop, which escapes
 *  2-opt's local optima), run to a fixed point against whichever length
 *  measure the caller cares about. */
const refine = <T extends Positioned>(
  initial: T[],
  length: (order: T[]) => number
): T[] => {
  let route = initial;
  let best = length(route);
  let improved = true;

  while (improved) {
    improved = false;

    for (let i = 0; i < route.length - 1; i += 1) {
      for (let j = i + 1; j < route.length; j += 1) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ];
        const len = length(candidate);
        if (len < best - 1e-9) {
          route = candidate;
          best = len;
          improved = true;
        }
      }
    }

    for (let i = 0; i < route.length; i += 1) {
      for (let j = 0; j < route.length; j += 1) {
        if (i === j) continue;
        const without = [...route.slice(0, i), ...route.slice(i + 1)];
        const candidate = [
          ...without.slice(0, j),
          route[i],
          ...without.slice(j),
        ];
        const len = length(candidate);
        if (len < best - 1e-9) {
          route = candidate;
          best = len;
          improved = true;
        }
      }
    }
  }

  return route;
};
