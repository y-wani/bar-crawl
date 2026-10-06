import { describe, it, expect } from "vitest";
import { walkingRouteCoords } from "../walkingRoute";

describe("walkingRouteCoords", () => {
  const a: [number, number] = [-104.99, 39.75];
  const b: [number, number] = [-104.98, 39.76];
  const start: [number, number] = [-105, 39.7];
  const end: [number, number] = [-104.9, 39.8];

  it("goes start → stops → end", () => {
    expect(walkingRouteCoords([a, b], start, end)).toEqual([start, a, b, end]);
  });

  it("drops an end that is the same point as the start", () => {
    expect(walkingRouteCoords([a, b], start, [...start])).toEqual([start, a, b]);
  });

  it("works with no start or end saved", () => {
    expect(walkingRouteCoords([a, b], null, null)).toEqual([a, b]);
    expect(walkingRouteCoords([a, b], null, end)).toEqual([a, b, end]);
  });
});
