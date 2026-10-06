import { describe, it, expect } from "vitest";
import { brandStyle, isValidOrgSlug, parseHexColor } from "../orgBranding";
import { orgSessionInput } from "../orgCrawl";
import type { SavedBarCrawl } from "../../services/crawlService";

const vars = (accent: unknown) => brandStyle(accent) as Record<string, string>;

describe("isValidOrgSlug", () => {
  it("accepts lowercase slugs", () => {
    expect(isValidOrgSlug("crawldenver")).toBe(true);
    expect(isValidOrgSlug("denver-pub-crawl")).toBe(true);
  });

  it("rejects anything that could be a path or another doc", () => {
    expect(isValidOrgSlug(undefined)).toBe(false);
    expect(isValidOrgSlug("")).toBe(false);
    expect(isValidOrgSlug("a")).toBe(false);
    expect(isValidOrgSlug("Denver")).toBe(false);
    expect(isValidOrgSlug("../orgs")).toBe(false);
    expect(isValidOrgSlug("-leading")).toBe(false);
  });
});

describe("parseHexColor", () => {
  it("parses long and short hex", () => {
    expect(parseHexColor("#ff8000")).toEqual([255, 128, 0]);
    expect(parseHexColor("#F80")).toEqual([255, 136, 0]);
  });

  it("rejects anything that isn't a hex colour", () => {
    expect(parseHexColor("red")).toBeNull();
    expect(parseHexColor("#ff800")).toBeNull();
    expect(parseHexColor("url(javascript:1)")).toBeNull();
    expect(parseHexColor(42)).toBeNull();
  });
});

describe("brandStyle", () => {
  it("falls back to the app's own accent for a bad colour", () => {
    expect(brandStyle(undefined)).toEqual({});
    expect(brandStyle("blue; background: red")).toEqual({});
  });

  it("keeps a light brand colour as-is, with dark text on it", () => {
    const v = vars("#ecb256");
    expect(v["--accent"]).toBe("#ecb256");
    expect(v["--text-on-accent"]).toBe("#1a1208");
  });

  it("lightens a colour too dark to read on the page background", () => {
    const v = vars("#0a1f44");
    expect(v["--accent"]).not.toBe("#0a1f44");
    const [r, g, b] = parseHexColor(v["--accent"])!;
    expect(r + g + b).toBeGreaterThan(0x0a + 0x1f + 0x44);
  });

  it("puts white text on a saturated mid-tone", () => {
    expect(vars("#c8102e")["--text-on-accent"]).toBe("#ffffff");
  });
});

describe("orgSessionInput", () => {
  const bar = (id: string, order: number, lng: number) => ({
    id,
    name: `Bar ${id}`,
    rating: 4.5,
    distance: 0,
    location: { type: "Point" as const, coordinates: [lng, 39.75] as [number, number] },
    order,
  });

  const crawl: SavedBarCrawl = {
    id: "crawl1",
    name: "12 Bars of Denver",
    bars: [bar("b", 1, -104.99), bar("a", 0, -104.98), bar("c", 2, -105.0)],
    route: {
      startLocation: { lat: 39.7, lng: -104.9 },
      endLocation: { lat: 39.8, lng: -105.1 },
      totalDistance: 1.4,
      estimatedDuration: 35,
    },
    mapCenter: [-104.99, 39.75],
    searchRadius: 1,
    createdBy: "admin",
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const host = { uid: "guest1", displayName: "Sam" };

  it("keeps the saved stop order and renumbers it from zero", () => {
    const input = orgSessionInput(crawl, host, "crawldenver");
    expect(input.stops.map((s) => s.barId)).toEqual(["a", "b", "c"]);
    expect(input.stops.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it("tags the session with the org and the crawl it came from", () => {
    const input = orgSessionInput(crawl, host, "crawldenver");
    expect(input.orgSlug).toBe("crawldenver");
    expect(input.crawlId).toBe("crawl1");
    expect(input.crawlName).toBe("12 Bars of Denver");
    expect(input.hostUid).toBe("guest1");
    expect(input.displayName).toBe("Sam");
  });

  it("uses the saved start, end and planned distance", () => {
    const { route } = orgSessionInput(crawl, host, "crawldenver");
    expect(route.startCoordinates).toEqual([-104.9, 39.7]);
    expect(route.endCoordinates).toEqual([-105.1, 39.8]);
    expect(route.plannedDistanceMiles).toBe(1.4);
    expect(route.plannedDurationMin).toBe(35);
  });

  it("falls back to the first and last bar when no start/end was saved", () => {
    const bare = { ...crawl, route: undefined } as unknown as SavedBarCrawl;
    const { route } = orgSessionInput(bare, host, "crawldenver");
    expect(route.startCoordinates).toEqual([-104.98, 39.75]);
    expect(route.endCoordinates).toEqual([-105.0, 39.75]);
    expect(route.plannedDistanceMiles).toBeNull();
  });
});
