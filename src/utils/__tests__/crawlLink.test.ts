import { describe, it, expect } from "vitest";
import {
  encodeCrawl,
  decodeCrawl,
  buildCrawlShareUrl,
  readCrawlFromHash,
  crawlFingerprint,
  MAX_SHARED_STOPS,
  type SharedCrawl,
} from "../crawlLink";

const crawl: SharedCrawl = {
  name: "Friday in Short North",
  stops: [
    { name: "The Bottle Shop", lng: -83.0007, lat: 39.9612, address: "12 W 8th St" },
    { name: "Little Rock Bar", lng: -83.0031, lat: 39.9688, address: "944 N High St" },
    { name: "Bar 23", lng: -83.0052, lat: 39.9721 },
  ],
  start: [-83.0, 39.96],
  end: [-83.01, 39.98],
};

describe("encodeCrawl / decodeCrawl", () => {
  it("round-trips a crawl", () => {
    const decoded = decodeCrawl(encodeCrawl(crawl));
    expect(decoded).toEqual(crawl);
  });

  it("round-trips a minimal crawl with no name, anchors or addresses", () => {
    const minimal: SharedCrawl = {
      stops: [
        { name: "A", lng: -1, lat: 2 },
        { name: "B", lng: -3, lat: 4 },
      ],
    };
    expect(decodeCrawl(encodeCrawl(minimal))).toEqual(minimal);
  });

  it("round-trips non-ASCII names (btoa alone would throw)", () => {
    const accented: SharedCrawl = {
      stops: [
        { name: "Café Bräu 🍻", lng: -0.1276, lat: 51.5072 },
        { name: "Señor Tequila", lng: -0.13, lat: 51.51 },
      ],
    };
    expect(decodeCrawl(encodeCrawl(accented))).toEqual(accented);
  });

  it("produces a URL-safe payload with no padding", () => {
    const payload = encodeCrawl(crawl);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("keeps a five-stop link short enough to paste into a chat", () => {
    const five: SharedCrawl = {
      stops: Array.from({ length: 5 }, (_, i) => ({
        name: `Some Bar Name ${i}`,
        lng: -83.00071 - i / 1000,
        lat: 39.96124 + i / 1000,
        address: `${100 + i} North High Street`,
      })),
    };
    expect(buildCrawlShareUrl(five, "https://www.gobarhop.app").length).toBeLessThan(700);
  });

  it("rounds coordinates to five decimals rather than carrying full precision", () => {
    const precise: SharedCrawl = {
      stops: [
        { name: "A", lng: -86.06725520323452, lat: 42.75807031222903 },
        { name: "B", lng: -86.1, lat: 42.8 },
      ],
    };
    const decoded = decodeCrawl(encodeCrawl(precise));
    expect(decoded?.stops[0].lng).toBe(-86.06726);
    expect(decoded?.stops[0].lat).toBe(42.75807);
  });
});

describe("decodeCrawl rejects bad input", () => {
  it.each([
    ["empty string", ""],
    ["not base64", "!!!!"],
    ["base64 of non-JSON", btoa("hello there")],
    ["base64 of a non-array", btoa("{}")],
    ["wrong version", btoa(JSON.stringify([9, 0, 0, 0, [["A", 1, 2, 0]]]))],
    ["no stops", btoa(JSON.stringify([1, 0, 0, 0, []]))],
    ["one stop", btoa(JSON.stringify([1, 0, 0, 0, [["A", 1, 2, 0]]]))],
    ["non-finite coordinate", btoa(JSON.stringify([1, 0, 0, 0, [["A", 1, 2, 0], ["B", "x", 2, 0]]]))],
    ["out-of-range latitude", btoa(JSON.stringify([1, 0, 0, 0, [["A", 1, 2, 0], ["B", 1, 999, 0]]]))],
    ["out-of-range longitude", btoa(JSON.stringify([1, 0, 0, 0, [["A", 1, 2, 0], ["B", 999, 2, 0]]]))],
  ])("returns null for %s", (_label, payload) => {
    expect(decodeCrawl(payload)).toBeNull();
  });

  it("returns null rather than throwing on a hostile payload", () => {
    expect(() => decodeCrawl("\u0000￿".repeat(100))).not.toThrow();
  });

  it("caps the number of stops a link can carry", () => {
    const huge: SharedCrawl = {
      stops: Array.from({ length: MAX_SHARED_STOPS + 5 }, (_, i) => ({
        name: `Bar ${i}`,
        lng: -83,
        lat: 39,
      })),
    };
    const decoded = decodeCrawl(encodeCrawl(huge));
    expect(decoded?.stops).toHaveLength(MAX_SHARED_STOPS);
  });

  it("truncates an absurdly long stop name instead of trusting it", () => {
    const shouty: SharedCrawl = {
      stops: [
        { name: "x".repeat(500), lng: -83, lat: 39 },
        { name: "B", lng: -83.1, lat: 39.1 },
      ],
    };
    const decoded = decodeCrawl(encodeCrawl(shouty));
    expect(decoded!.stops[0].name.length).toBeLessThanOrEqual(120);
  });

  it("drops an anchor that isn't a valid coordinate pair", () => {
    const payload = btoa(
      JSON.stringify([1, 0, ["nope", 2], 0, [["A", 1, 2, 0], ["B", 3, 4, 0]]])
    );
    const decoded = decodeCrawl(payload);
    expect(decoded).not.toBeNull();
    expect(decoded!.start).toBeUndefined();
  });
});

describe("buildCrawlShareUrl", () => {
  it("puts the payload in the fragment so it never reaches the server", () => {
    const url = buildCrawlShareUrl(crawl, "https://www.gobarhop.app");
    expect(url.startsWith("https://www.gobarhop.app/c#")).toBe(true);
    expect(new URL(url).search).toBe("");
  });

  it("does not double up slashes when the origin has a trailing one", () => {
    const url = buildCrawlShareUrl(crawl, "https://www.gobarhop.app/");
    expect(url).not.toContain("app//c");
  });

  it("round-trips through readCrawlFromHash", () => {
    const url = buildCrawlShareUrl(crawl, "https://www.gobarhop.app");
    expect(readCrawlFromHash(new URL(url).hash)).toEqual(crawl);
  });

  it("readCrawlFromHash tolerates a missing or bare hash", () => {
    expect(readCrawlFromHash("")).toBeNull();
    expect(readCrawlFromHash("#")).toBeNull();
  });
});

describe("crawlFingerprint", () => {
  it("is stable for the same payload", () => {
    expect(crawlFingerprint("abc")).toBe(crawlFingerprint("abc"));
  });

  it("differs for different payloads", () => {
    expect(crawlFingerprint("abc")).not.toBe(crawlFingerprint("abd"));
  });

  it("is short enough for a storage key", () => {
    expect(crawlFingerprint("x".repeat(600)).length).toBeLessThanOrEqual(12);
  });
});
