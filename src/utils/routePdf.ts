// src/utils/routePdf.ts
//
// Builds the printable crawl sheet as a real PDF.
//
// This replaced a Blob({ type: "text/html" }) download. The HTML version was
// effectively useless on iOS — it landed in Files, opened awkwardly if at all,
// and @imported Google Fonts so it degraded further with no signal. A phone in
// a bar is the primary place this gets opened, so the artefact has to be a
// format phones actually handle.
//
// Text is DRAWN, not rasterised from the DOM: html2canvas-style capture would
// produce a blurry image of a page, several megabytes, with no selectable text
// and no working links. Drawing keeps it a few hundred KB, sharp at any zoom,
// and the addresses stay copy-pasteable.
//
// jsPDF is imported dynamically by the caller so it never enters the main
// bundle — it downloads only when somebody actually exports a sheet.

import type { jsPDF as JsPdfType } from "jspdf";

export interface PdfStop {
  name: string;
  address?: string;
}

export interface RoutePdfInput {
  stops: PdfStop[];
  /** Google Maps directions link for the whole route, printed as a fallback. */
  mapsUrl?: string;
  /** QR PNG as a data URL. Optional: the sheet is still valid without it. */
  qrDataUrl?: string;
  title?: string;
}

// Page geometry, in mm (jsPDF default unit for a4).
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = [26, 26, 46] as const; // deep ink, matches the app's display colour
const AMBER = [236, 178, 86] as const; // the whiskey-amber accent
const MUTED = [110, 110, 120] as const;
const RULE = [220, 220, 228] as const;

/**
 * Draw the crawl sheet into a jsPDF document.
 *
 * Exported separately from the download so it can be unit-tested and reused
 * (e.g. a future "email me the sheet") without touching the DOM.
 */
export const buildRoutePdf = (doc: JsPdfType, input: RoutePdfInput): JsPdfType => {
  const { stops, mapsUrl, qrDataUrl, title = "Your Bar Crawl" } = input;
  let y = MARGIN;

  // ---- Header -------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`${stops.length} stops · ${dateLine}`, MARGIN, y + 13);

  // QR sits top-right so it survives being folded in half.
  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, "PNG", PAGE_W - MARGIN - 28, y - 2, 28, 28);
      doc.setFontSize(7);
      doc.text("Scan for directions", PAGE_W - MARGIN - 28, y + 30);
    } catch {
      /* a broken QR must never cost the whole sheet */
    }
  }

  y += 22;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // ---- Stops --------------------------------------------------------------
  // The point of the sheet: the order, big enough to read in bad light.
  stops.forEach((stop, i) => {
    // Rough height of this block, so a stop is never split across a page.
    const addressLines = stop.address
      ? doc.splitTextToSize(stop.address, CONTENT_W - 14)
      : [];
    const blockH = 12 + addressLines.length * 5 + 10;
    if (y + blockH > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }

    // Numbered amber disc
    doc.setFillColor(...AMBER);
    doc.circle(MARGIN + 4, y + 1, 4.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(String(i + 1), MARGIN + 4, y + 2.6, { align: "center" });

    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(stop.name, MARGIN + 13, y + 3);
    y += 8;

    if (addressLines.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      addressLines.forEach((line: string) => {
        doc.text(line, MARGIN + 13, y + 2);
        y += 5;
      });
    }

    // Space to scribble — the paper version of the old notes box.
    y += 3;
    doc.setDrawColor(...RULE);
    doc.line(MARGIN + 13, y, PAGE_W - MARGIN, y);
    y += 9;
  });

  // ---- Footer -------------------------------------------------------------
  const footerY = PAGE_H - MARGIN;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, footerY - 14, PAGE_W - MARGIN, footerY - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(
    "Pace yourself, keep the group together, and sort your ride home before you start.",
    MARGIN,
    footerY - 8
  );
  doc.setFontSize(8);
  doc.text("Made with BarHop — gobarhop.app", MARGIN, footerY - 3);

  if (mapsUrl) {
    doc.setTextColor(...AMBER);
    doc.textWithLink("Open in Google Maps", PAGE_W - MARGIN - 38, footerY - 3, {
      url: mapsUrl,
    });
  }

  return doc;
};

/** Filename-safe slug for the download, e.g. "bar-crawl-2026-09-22.pdf". */
export const routePdfFilename = (title = "bar-crawl"): string => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "bar-crawl";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
};
