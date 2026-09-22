import { describe, it, expect } from "vitest";
import { snapToSeedMetro } from "../useInitialCenter";

describe("snapToSeedMetro", () => {
  it("snaps a west-London IP centre onto the London seed", () => {
    // The exact coordinates that missed the cache in production on 2026-09-22
    const snapped = snapToSeedMetro(-0.3219, 51.4973);
    expect(snapped).not.toBeNull();
    expect(snapped!.label).toBe("London, UK");
    expect(snapped!.center[0]).toBeCloseTo(-0.1276, 3);
    expect(snapped!.center[1]).toBeCloseTo(51.5072, 3);
  });

  it("snaps the second missed London centre too", () => {
    expect(snapToSeedMetro(-0.3708, 51.4669)?.label).toBe("London, UK");
  });

  it("returns null for a centre with no seed metro nearby", () => {
    // Louisville, KY — genuinely unseeded, also seen missing in production
    expect(snapToSeedMetro(-85.7588, 38.2532)).toBeNull();
  });

  it("returns null far out at sea", () => {
    expect(snapToSeedMetro(-30, 0)).toBeNull();
  });

  it("leaves a centre already on a seed point effectively unmoved", () => {
    const snapped = snapToSeedMetro(-0.1276, 51.5072);
    expect(snapped!.center).toEqual([-0.1276, 51.5072]);
  });

  it("picks the nearest metro when two are in range", () => {
    // Just outside Manchester, far from every other UK seed
    expect(snapToSeedMetro(-2.3, 53.45)?.label).toBe("Manchester, UK");
  });
});
