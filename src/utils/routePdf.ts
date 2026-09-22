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

// The header has to be tall enough for its TALLEST element, which is the QR
// plus its caption — not the title. Sizing it to the title is what pushed the
// QR down across the divider and into the first stop.
const QR_SIZE = 26;
const QR_X = PAGE_W - MARGIN - QR_SIZE;
const QR_TOP = MARGIN;
const QR_CAPTION_Y = QR_TOP + QR_SIZE + 4; // 48
const HEADER_RULE_Y = QR_CAPTION_Y + 7; // clears the caption with room to breathe
const FIRST_STOP_Y = HEADER_RULE_Y + 14;

// Reserved strip at the bottom so a stop can never collide with the footer.
const FOOTER_H = 26;
const CONTENT_BOTTOM = PAGE_H - MARGIN - FOOTER_H;

const DISC_R = 5;
const DISC_X = MARGIN + DISC_R;
const TEXT_X = MARGIN + 15;
const TEXT_W = PAGE_W - MARGIN - TEXT_X;

const INK = [26, 26, 46] as const; // deep ink, matches the app's display colour
const AMBER = [236, 178, 86] as const; // the whiskey-amber accent
const AMBER_SOFT = [244, 214, 165] as const; // the connector rail
const MUTED = [110, 110, 120] as const;
const RULE = [224, 224, 232] as const;

/**
 * Draw the crawl sheet into a jsPDF document.
 *
 * Exported separately from the download so it can be unit-tested and reused
 * (e.g. a future "email me the sheet") without touching the DOM.
 */
export const buildRoutePdf = (doc: JsPdfType, input: RoutePdfInput): JsPdfType => {
  const { stops, mapsUrl, qrDataUrl, title = "Your Bar Crawl" } = input;

  // ---- Header -------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, MARGIN + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`${stops.length} stops · ${dateLine}`, MARGIN, MARGIN + 16);

  // Short accent bar under the title — picks up the app's amber without
  // needing the brand font, which isn't embedded.
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(1.4);
  doc.line(MARGIN, MARGIN + 21, MARGIN + 24, MARGIN + 21);

  // QR sits top-right so it survives the sheet being folded in half.
  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, "PNG", QR_X, QR_TOP, QR_SIZE, QR_SIZE);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text("Scan for directions", QR_X + QR_SIZE / 2, QR_CAPTION_Y, {
        align: "center",
      });
    } catch {
      /* a broken QR must never cost the whole sheet */
    }
  }

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, HEADER_RULE_Y, PAGE_W - MARGIN, HEADER_RULE_Y);

  // ---- Stops --------------------------------------------------------------
  // The point of the sheet: the order, big enough to read in bad light.
  let discY = FIRST_STOP_Y;
  let prevDiscY: number | null = null;

  stops.forEach((stop, i) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const addressLines: string[] = stop.address
      ? doc.splitTextToSize(stop.address, TEXT_W)
      : [];
    // disc + name, then each address line, then the scribble rule.
    const blockH = 9 + addressLines.length * 4.8 + 7;

    if (discY + blockH > CONTENT_BOTTOM) {
      doc.addPage();
      discY = MARGIN + DISC_R;
      prevDiscY = null; // never draw a rail across a page break
    }

    // The rail between discs reads as the route itself running down the page.
    if (prevDiscY !== null) {
      doc.setDrawColor(...AMBER_SOFT);
      doc.setLineWidth(1);
      doc.line(DISC_X, prevDiscY + DISC_R + 1.5, DISC_X, discY - DISC_R - 1.5);
    }

    doc.setFillColor(...AMBER);
    doc.circle(DISC_X, discY, DISC_R, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(String(i + 1), DISC_X, discY + 1.7, { align: "center" });

    doc.setFontSize(13.5);
    doc.setTextColor(...INK);
    doc.text(stop.name, TEXT_X, discY + 1.6);

    let lineY = discY + 8;
    if (addressLines.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...MUTED);
      addressLines.forEach((line) => {
        doc.text(line, TEXT_X, lineY);
        lineY += 4.8;
      });
    }

    // Space to scribble — the paper version of the old notes box. Indented to
    // the text column so it reads as belonging to the stop, not dividing them.
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(TEXT_X, lineY + 1.5, PAGE_W - MARGIN, lineY + 1.5);

    prevDiscY = discY;
    discY = lineY + 13;
  });

  // ---- Footer -------------------------------------------------------------
  const footerY = PAGE_H - MARGIN;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
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
    const label = "Open in Google Maps";
    doc.setTextColor(...AMBER);
    // Right-align by measuring, so the link can't drift off the page edge.
    const w = doc.getTextWidth(label);
    doc.textWithLink(label, PAGE_W - MARGIN - w, footerY - 3, { url: mapsUrl });
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
