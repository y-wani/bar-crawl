import { describe, it, expect, vi } from "vitest";
import { buildRoutePdf, routePdfFilename } from "../routePdf";
import type { jsPDF as JsPdfType } from "jspdf";

// A recording stand-in for jsPDF. The real library is 381KB and only needed at
// runtime; what matters here is WHAT we draw and in what order, not how it is
// rasterised.
const makeDoc = () => {
  const text: string[] = [];
  const calls: string[] = [];
  const doc = {
    text: vi.fn((t: string | string[]) => {
      text.push(Array.isArray(t) ? t.join(" ") : t);
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
    circle: vi.fn(() => { calls.push("circle"); return doc; }),
    addPage: vi.fn(() => { calls.push("addPage"); return doc; }),
    addImage: vi.fn(() => { calls.push("addImage"); return doc; }),
    textWithLink: vi.fn((t: string) => { text.push(t); calls.push("link"); return doc; }),
    splitTextToSize: vi.fn((t: string) => [t]),
  };
  return { doc: doc as unknown as JsPdfType, text, calls };
};

const stops = [
  { name: "The Crown", address: "12 High St" },
  { name: "Dog & Duck", address: "44 Market Sq" },
  { name: "Late Bar", address: "9 Canal Rd" },
];

describe("buildRoutePdf", () => {
  it("writes every stop name", () => {
    const { doc, text } = makeDoc();
    buildRoutePdf(doc, { stops });
    for (const s of stops) expect(text).toContain(s.name);
  });

  it("numbers the stops in route order", () => {
    const { doc, text } = makeDoc();
    buildRoutePdf(doc, { stops });
    // The order on the page is the whole point of the sheet.
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

  it("draws the QR when one is supplied", () => {
    const { doc, calls } = makeDoc();
    buildRoutePdf(doc, { stops, qrDataUrl: "data:image/png;base64,AAAA" });
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
    expect(() =>
      buildRoutePdf(doc, { stops, qrDataUrl: "data:image/png;base64,broken" })
    ).not.toThrow();
    expect(text).toContain("The Crown");
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

  it("links out to Google Maps when a url is given", () => {
    const { doc, text } = makeDoc();
    buildRoutePdf(doc, { stops, mapsUrl: "https://maps.google.com/?q=x" });
    expect(text).toContain("Open in Google Maps");
  });
});

describe("routePdfFilename", () => {
  it("ends in .pdf and carries the date", () => {
    const name = routePdfFilename("Friday Night");
    expect(name).toMatch(/^friday-night-\d{4}-\d{2}-\d{2}\.pdf$/);
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
