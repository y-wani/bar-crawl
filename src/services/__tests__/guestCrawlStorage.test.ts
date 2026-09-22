import { describe, it, expect, beforeEach } from "vitest";
import {
  GUEST_CRAWL_KEY,
  readGuestCrawl,
  writeGuestCrawl,
  clearGuestCrawl,
  isValidGuestCrawl,
} from "../guestCrawlStorage";
import type { AppBat } from "../../pages/Home";

const makeBar = (id: string): AppBat =>
  ({
    id,
    name: `Bar ${id}`,
    address: "1 Test St",
    location: { type: "Point", coordinates: [-83.0007, 39.9612] },
    rating: 4.2,
  }) as unknown as AppBat;

const validCrawl = {
  selectedBars: [makeBar("a"), makeBar("b")],
  mapCenter: [-83.0007, 39.9612] as [number, number],
  searchRadius: 1,
};

beforeEach(() => {
  localStorage.clear();
});

describe("writeGuestCrawl / readGuestCrawl", () => {
  it("round-trips a crawl", () => {
    writeGuestCrawl(validCrawl);
    const read = readGuestCrawl();
    expect(read?.selectedBars.map((b) => b.id)).toEqual(["a", "b"]);
    expect(read?.mapCenter).toEqual([-83.0007, 39.9612]);
    expect(read?.searchRadius).toBe(1);
  });

  it("stamps updatedAt on write", () => {
    const before = Date.now();
    writeGuestCrawl(validCrawl);
    expect(readGuestCrawl()!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("preserves an optional crawl name", () => {
    writeGuestCrawl({ ...validCrawl, crawlName: "Bachelor party" });
    expect(readGuestCrawl()?.crawlName).toBe("Bachelor party");
  });

  it("preserves the order the bars were selected in", () => {
    writeGuestCrawl({
      ...validCrawl,
      selectedBars: [makeBar("c"), makeBar("a"), makeBar("b")],
    });
    expect(readGuestCrawl()?.selectedBars.map((b) => b.id)).toEqual(["c", "a", "b"]);
  });

  it("never expires a stored crawl, however old", () => {
    const ancient = {
      ...validCrawl,
      updatedAt: Date.now() - 400 * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(GUEST_CRAWL_KEY, JSON.stringify(ancient));
    expect(readGuestCrawl()?.selectedBars).toHaveLength(2);
  });
});

describe("readGuestCrawl resilience", () => {
  it("returns null when nothing is stored", () => {
    expect(readGuestCrawl()).toBeNull();
  });

  it("returns null on unparseable JSON rather than throwing", () => {
    localStorage.setItem(GUEST_CRAWL_KEY, "{not json");
    expect(readGuestCrawl()).toBeNull();
  });

  it("returns null on a structurally wrong payload", () => {
    localStorage.setItem(GUEST_CRAWL_KEY, JSON.stringify({ selectedBars: "nope" }));
    expect(readGuestCrawl()).toBeNull();
  });

  it("rejects a crawl with fewer than two bars", () => {
    localStorage.setItem(
      GUEST_CRAWL_KEY,
      JSON.stringify({ ...validCrawl, selectedBars: [makeBar("a")], updatedAt: Date.now() })
    );
    expect(readGuestCrawl()).toBeNull();
  });
});

describe("clearGuestCrawl", () => {
  it("removes the stored crawl", () => {
    writeGuestCrawl(validCrawl);
    clearGuestCrawl();
    expect(readGuestCrawl()).toBeNull();
  });
});

describe("isValidGuestCrawl", () => {
  it("accepts a well-formed crawl", () => {
    expect(isValidGuestCrawl({ ...validCrawl, updatedAt: Date.now() })).toBe(true);
  });

  it("rejects a malformed mapCenter", () => {
    expect(
      isValidGuestCrawl({ ...validCrawl, mapCenter: [1], updatedAt: Date.now() })
    ).toBe(false);
  });
});
