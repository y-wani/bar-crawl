import { describe, it, expect, vi } from "vitest";
import { buildRoutePdf, routePdfFilename } from "../routePdf";
import type { jsPDF as JsPdfType } from "jspdf";

// A recording stand-in for jsPDF. The real library is 381KB and only needed at
// runtime; what matters here is WHAT we draw and WHERE, not how it rasterises.
// Coordinates are recorded so layout collisions can be asserted — the QR
// overflowing into the first stop was a real shipped bug.
const makeDoc = () => {
  const text: string[] = [];
  const texts: { s: string; x: number; y: number }[] = [];
  const circles: { x: number; y: number; r: number }[] = [];
  const images: { x: number; y: number; w: number; h: number }[] = [];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const calls: string[] = [];
  const doc = {
    text: vi.fn((t: string | string[], x: number, y: number) => {
      const s = Array.isArray(t) ? t.join(" ") : t;
      text.push(s);
      texts.push({ s, x, y });
      calls.push("text");
      return doc;
    }),
    setFont: vi.fn(() => doc),
    setFontSize: vi.fn(() => doc),
    setTextColor: vi.fn(() => doc),
    setDrawColor: vi.fn(() => doc),
    setFillColor: vi.fn(() => doc),
    setLineWidth: vi.fn(() => doc),
    line: vi.fn(() => doc),
    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      rects.push({ x, y, w, h });
      calls.push("rect");
      return doc;
    }),
    roundedRect: vi.fn((x: number, y: number, w: number, h: number) => {
      rects.push({ x, y, w, h });
      calls.push("roundedRect");
      return doc;
    }),
    circle: vi.fn((x: number, y: number, r: number) => {
      circles.push({ x, y, r });
      calls.push("circle");
      return doc;
    }),
    addPage: vi.fn(() => { calls.push("addPage"); return doc; }),
    addImage: vi.fn((_d: string, _f: string, x: number, y: number, w: number, h: number) => {
      images.push({ x, y, w, h });
      calls.push("addImage");
      return doc;
    }),
    textWithLink: vi.fn((t: string, x: number, y: number) => {
      text.push(t);
      texts.push({ s: t, x, y });
      calls.push("link");
      return doc;
    }),
    getTextWidth: vi.fn((t: string) => t.length * 1.6),
    splitTextToSize: vi.fn((t: string) => [t]),
  };
  return { doc: doc as unknown as JsPdfType, text, texts, circles, images, rects, calls };
};

const stops = [
  { name: "The Crown", address: "12 High St" },
  { name: "Dog & Duck", address: "44 Market Sq" },
  { name: "Late Bar", address: "9 Canal Rd" },
];

const QR = "data:image/png;base64,AAAA";

describe("buildRoutePdf content", () => {
  it("writes every stop name", () => {
    const { doc, text } = makeDoc();
    buildRoutePdf(doc, { stops });
    for (const s of stops) expect(text).toContain(s.name);
  });

  it("numbers the stops in route order", () => {
    const { doc, text } = makeDoc();
    buildRoutePdf(doc, { stops });
    const positions = stops.map((s) => text.indexOf(s.name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(text).toContain("1");
    expect(text).toContain("3");
  });

  it("includes the addresses", () => {
    const { doc, text } = makeDoc();
    buildRoutePdf(doc, { stops });
    expect(text).toContain("12 High St");
  });

  it("survives a stop with no address", () => {
    const { doc, text } = makeDoc();
    expect(() =>
      buildRoutePdf(doc, { stops: [{ name: "Nameless" }, { name: "Other" }] })
    ).not.toThrow();
    expect(text).toContain("Nameless");
  });

  it("links out to Google Maps when a url is given", () => {
    const { doc, text } = makeDoc();
    buildRoutePdf(doc, { stops, mapsUrl: "https://maps.google.com/?q=x" });
    expect(text).toContain("Open in Google Maps");
  });
});

describe("buildRoutePdf layout", () => {
  // The shipped bug: the header was sized to the title, so the QR and its
  // caption ran past the divider and collided with stop 1. The header band is
  // now sized from the QR card, so everything in it stays inside it.
  it("keeps the whole QR block inside the ink band", () => {
    const { doc, images, texts, rects } = makeDoc();
    buildRoutePdf(doc, { stops, qrDataUrl: QR });
    const band = rects[0]; // the ink band is drawn first
    const qr = images[0];
    const caption = texts.find((t) => t.s === "Scan to open on your phone")!;
    expect(band.y).toBe(0);
    expect(qr.y + qr.h).toBeLessThan(band.h);
    expect(caption.y).toBeLessThan(band.h);
  });

  it("keeps the first stop clear of the header band", () => {
    const { doc, circles, rects } = makeDoc();
    buildRoutePdf(doc, { stops, qrDataUrl: QR });
    const band = rects[0];
    const firstDisc = circles[0];
    expect(firstDisc.y - firstDisc.r).toBeGreaterThan(band.h);
  });

  it("centres the caption on the QR card rather than left-aligning it", () => {
    const { doc, images, texts } = makeDoc();
    buildRoutePdf(doc, { stops, qrDataUrl: QR });
    const qr = images[0];
    const caption = texts.find((t) => t.s === "Scan to open on your phone")!;
    expect(caption.x).toBeCloseTo(qr.x + qr.w / 2, 1);
  });

  it("puts the QR on a light card so it stays scannable on the ink band", () => {
    const { doc, images, rects, calls } = makeDoc();
    buildRoutePdf(doc, { stops, qrDataUrl: QR });
    expect(calls).toContain("roundedRect");
    const card = rects.find((r) => r.w > 0 && r.w < 60 && r.h === r.w)!;
    const qr = images[0];
    expect(card).toBeDefined();
    // The QR sits fully inside its card.
    expect(qr.x).toBeGreaterThan(card.x);
    expect(qr.x + qr.w).toBeLessThan(card.x + card.w);
  });

  it("keeps the QR card inside the right margin", () => {
    const { doc, rects } = makeDoc();
    buildRoutePdf(doc, { stops, qrDataUrl: QR });
    const card = rects.find((r) => r.w > 0 && r.w < 60 && r.h === r.w)!;
    expect(card.x + card.w).toBeLessThanOrEqual(210 - 18 + 0.01);
  });

  it("stacks the stop discs down the page in order, evenly", () => {
    const { doc, circles } = makeDoc();
    buildRoutePdf(doc, { stops, qrDataUrl: QR });
    expect(circles).toHaveLength(3);
    const gaps = [circles[1].y - circles[0].y, circles[2].y - circles[1].y];
    expect(gaps[0]).toBeGreaterThan(0);
    // Same-shaped stops should be evenly spaced.
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(0.01);
    expect(circles.every((c) => c.x === circles[0].x)).toBe(true);
  });

  it("never lets a stop run into the footer strip", () => {
    const { doc, circles } = makeDoc();
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `Bar ${i + 1}`,
      address: `${i + 1} Some Street`,
    }));
    buildRoutePdf(doc, { stops: many });
    // 297 page - 18 margin - 26 footer strip
    for (const c of circles) expect(c.y).toBeLessThanOrEqual(297 - 18 - 26);
  });

  it("adds a page rather than running stops off the bottom", () => {
    const { doc, calls } = makeDoc();
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `Bar ${i + 1}`,
      address: `${i + 1} Some Street`,
    }));
    buildRoutePdf(doc, { stops: many });
    expect(calls).toContain("addPage");
  });
});

describe("buildRoutePdf resilience", () => {
  it("draws the QR when one is supplied", () => {
    const { doc, calls } = makeDoc();
    buildRoutePdf(doc, { stops, qrDataUrl: QR });
    expect(calls).toContain("addImage");
  });

  it("still produces a sheet when the QR is missing", () => {
    const { doc, calls, text } = makeDoc();
    buildRoutePdf(doc, { stops });
    expect(calls).not.toContain("addImage");
    expect(text).toContain("The Crown");
  });

  it("does not let a broken QR image take down the whole sheet", () => {
    const { doc, text } = makeDoc();
    (doc.addImage as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("bad image data");
    });
    expect(() => buildRoutePdf(doc, { stops, qrDataUrl: QR })).not.toThrow();
    expect(text).toContain("The Crown");
  });
});

describe("routePdfFilename", () => {
  it("ends in .pdf and carries the date", () => {
    expect(routePdfFilename("Friday Night")).toMatch(
      /^friday-night-\d{4}-\d{2}-\d{2}\.pdf$/
    );
  });

  it("strips characters that break a download", () => {
    expect(routePdfFilename("Dave's Crawl / 2026!")).toMatch(
      /^dave-s-crawl-2026-\d{4}-\d{2}-\d{2}\.pdf$/
    );
  });

  it("falls back when the title reduces to nothing", () => {
    expect(routePdfFilename("!!!")).toMatch(/^bar-crawl-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
