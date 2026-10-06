import { describe, it, expect } from "vitest";
import { boxAround } from "../useAddressAutocomplete";

describe("boxAround", () => {
  it("puts the point at the centre of the box", () => {
    const [minLng, minLat, maxLng, maxLat] = boxAround([-104.99, 39.75], 40)
      .split(",")
      .map(Number);
    expect((minLng + maxLng) / 2).toBeCloseTo(-104.99, 3);
    expect((minLat + maxLat) / 2).toBeCloseTo(39.75, 3);
  });

  it("spans about the requested distance each way", () => {
    const [, minLat, , maxLat] = boxAround([-104.99, 39.75], 40).split(",").map(Number);
    // 40 km ≈ 0.359° of latitude on each side.
    expect(maxLat - minLat).toBeCloseTo(0.719, 2);
  });

  it("widens in longitude away from the equator, so the box stays square on the ground", () => {
    const span = (lat: number) => {
      const [minLng, , maxLng] = boxAround([0, lat], 40).split(",").map(Number);
      return maxLng - minLng;
    };
    expect(span(60)).toBeGreaterThan(span(0) * 1.9);
  });

  it("keeps Denver out of a box around Tanzania and vice versa", () => {
    const [minLng, minLat, maxLng, maxLat] = boxAround([-104.99, 39.75], 40)
      .split(",")
      .map(Number);
    const dar = [39.28, -6.79]; // Dar es Salaam
    const inside =
      dar[0] >= minLng && dar[0] <= maxLng && dar[1] >= minLat && dar[1] <= maxLat;
    expect(inside).toBe(false);
  });
});
