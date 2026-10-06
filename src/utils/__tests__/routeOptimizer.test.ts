import { describe, it, expect } from "vitest";
import {
  pathMiles,
  journeyMiles,
  optimizeStopOrder,
  optimizeOpenPath,
  type Coord,
} from "../routeOptimizer";

/** A stop on a straight east-west line, one "unit" apart, so the optimal
 *  ordering is obvious by eye and the tests stay readable. */
const stop = (name: string, lng: number, lat = 40) => ({
  name,
  location: { coordinates: [lng, lat] as Coord },
});

const names = (stops: { name: string }[]) => stops.map((s) => s.name);

describe("pathMiles", () => {
  it("is zero for fewer than two stops", () => {
    expect(pathMiles([])).toBe(0);
    expect(pathMiles([stop("A", 0)])).toBe(0);
  });

  it("sums consecutive legs and ignores the endpoints", () => {
    const a = pathMiles([stop("A", 0), stop("B", 0.1)]);
    const b = pathMiles([stop("A", 0), stop("B", 0.1), stop("C", 0.2)]);
    expect(b).toBeCloseTo(a * 2, 5);
  });
});

describe("journeyMiles", () => {
  it("includes the legs out from the start and back to the end", () => {
    const stops = [stop("A", 0.1)];
    const start: Coord = [0, 40];
    const end: Coord = [0.2, 40];
    expect(journeyMiles(stops, start, end)).toBeGreaterThan(pathMiles(stops));
  });

  it("treats a missing end as a loop back to the start", () => {
    const stops = [stop("A", 0.1)];
    const start: Coord = [0, 40];
    expect(journeyMiles(stops, start)).toBeCloseTo(
      journeyMiles(stops, start, start),
      9
    );
  });
});

describe("optimizeStopOrder (anchored)", () => {
  it("returns short inputs untouched", () => {
    expect(optimizeStopOrder([], [0, 40])).toEqual([]);
    const one = [stop("A", 0)];
    expect(optimizeStopOrder(one, [0, 40])).toEqual(one);
  });

  it("puts a scrambled line back in order when walking out and back", () => {
    const scrambled = [stop("C", 0.3), stop("A", 0.1), stop("D", 0.4), stop("B", 0.2)];
    const ordered = optimizeStopOrder(scrambled, [0, 40], [0.5, 40]);
    expect(names(ordered)).toEqual(["A", "B", "C", "D"]);
  });

  it("never returns a longer journey than it was given", () => {
    const scrambled = [stop("C", 0.3), stop("A", 0.1), stop("D", 0.4), stop("B", 0.2)];
    const start: Coord = [0, 40];
    const before = journeyMiles(scrambled, start);
    const after = journeyMiles(optimizeStopOrder(scrambled, start), start);
    expect(after).toBeLessThanOrEqual(before + 1e-9);
  });

  it("keeps every stop exactly once", () => {
    const stops = Array.from({ length: 7 }, (_, i) => stop(`S${i}`, i * 0.05));
    const out = optimizeStopOrder([...stops].reverse(), [0, 40]);
    expect(names(out).sort()).toEqual(names(stops).sort());
  });

  it("handles a lineup past the exact-search limit via the heuristics", () => {
    const stops = Array.from({ length: 14 }, (_, i) => stop(`S${i}`, i * 0.02));
    const start: Coord = [0, 40];
    const scrambled = [...stops].sort(() => -1);
    const out = optimizeStopOrder(scrambled, start);
    expect(out).toHaveLength(14);
    expect(journeyMiles(out, start)).toBeLessThanOrEqual(
      journeyMiles(scrambled, start) + 1e-9
    );
  });
});

describe("optimizeOpenPath (free endpoints)", () => {
  it("returns two-or-fewer stops untouched", () => {
    const two = [stop("B", 0.2), stop("A", 0.1)];
    expect(optimizeOpenPath(two)).toEqual(two);
  });

  it("walks a scrambled line end to end", () => {
    const scrambled = [stop("C", 0.3), stop("A", 0.1), stop("D", 0.4), stop("B", 0.2)];
    const out = names(optimizeOpenPath(scrambled));
    // Either direction is optimal on an open path; both are the same walk.
    expect([out.join(""), [...out].reverse().join("")]).toContain("ABCD");
  });

  it("beats the anchored optimizer's total walking on a lineup with no home", () => {
    const stops = [stop("C", 0.3), stop("A", 0.1), stop("D", 0.4), stop("B", 0.2)];
    // Anchoring at the first listed bar forces a return leg the open path
    // is free to skip — this is exactly why lineups use the open variant.
    const anchored = optimizeStopOrder(stops, stops[0].location.coordinates);
    expect(pathMiles(optimizeOpenPath(stops))).toBeLessThanOrEqual(
      pathMiles(anchored) + 1e-9
    );
  });

  it("never returns a longer path than it was given", () => {
    const scrambled = [
      stop("E", 0.9), stop("A", 0.1), stop("C", 0.5),
      stop("B", 0.3), stop("D", 0.7),
    ];
    expect(pathMiles(optimizeOpenPath(scrambled))).toBeLessThanOrEqual(
      pathMiles(scrambled) + 1e-9
    );
  });

  it("keeps every stop exactly once past the exact-search limit", () => {
    const stops = Array.from({ length: 15 }, (_, i) =>
      stop(`S${i}`, ((i * 7) % 15) * 0.02)
    );
    const out = optimizeOpenPath(stops);
    expect(out).toHaveLength(15);
    expect(names(out).sort()).toEqual(names(stops).sort());
    expect(pathMiles(out)).toBeLessThanOrEqual(pathMiles(stops) + 1e-9);
  });

  it("does not mutate the input array", () => {
    const stops = [stop("C", 0.3), stop("A", 0.1), stop("B", 0.2)];
    const snapshot = names(stops);
    optimizeOpenPath(stops);
    expect(names(stops)).toEqual(snapshot);
  });
});
