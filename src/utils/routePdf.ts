// src/utils/routePdf.ts
//
// Builds the printable crawl sheet as a real PDF, styled to match the app's
// "refined nightlife" language: deep ink, one whiskey-amber accent.
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
// THEME NOTE: the header band is ink, the body stays light. A fully dark sheet
// looks right on a screen and terrible on paper — this is a thing people
// print — so the brand lives in the header, the accent and the rail, and the
// stop list stays legible in one ink cartridge.
//
// TYPE NOTE: Rajdhani/Poppins are not embedded. jsPDF ships 14 standard fonts
// and embedding a subset would add hundreds of KB to a lazily-loaded chunk for
// a document that is mostly addresses. Helvetica carries it; the brand comes
// from colour, weight and layout.
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

// --- Header band ---------------------------------------------------------
// Height is driven by the QR card, the tallest thing in the band. Sizing the
// header to the title is what made the QR hang below its own divider.
const QR = 24; // qr image
const QR_PAD = 4; // white card padding around it
const QR_CARD = QR + QR_PAD * 2; // 32
const BAND_TOP = 0;
const BAND_PAD = 14;
// Card + its caption, so the caption can never spill out of the band the way
// the old header let the QR spill past its own divider.
const BAND_H = BAND_PAD + QR_CARD + 7 + 7; // 60
const QR_CARD_X = PAGE_W - MARGIN - QR_CARD;
const QR_CARD_Y = BAND_TOP + BAND_PAD;

const FIRST_STOP_Y = BAND_H + 20;

// Reserved strip so a stop can never collide with the footer.
const FOOTER_H = 26;
const CONTENT_BOTTOM = PAGE_H - MARGIN - FOOTER_H;

const DISC_R = 5.2;
const DISC_X = MARGIN + DISC_R;
const TEXT_X = MARGIN + 16;
const TEXT_W = PAGE_W - MARGIN - TEXT_X;

// Brand tokens, lifted from src/styles/tokens.css.
const INK = [11, 10, 18] as const; // --bg-base  #0b0a12
const INK_SOFT = [36, 33, 52] as const; // a lift off the band for the hairline
const AMBER = [236, 178, 86] as const; // --accent   #ecb256
const AMBER_SOFT = [246, 224, 190] as const; // the connector rail
const ON_ACCENT = [26, 18, 8] as const; // --text-on-accent
const BODY = [32, 30, 44] as const; // stop names on white
const MUTED = [122, 120, 136] as const;
const RULE = [228, 226, 234] as const;
const WHITE = [255, 255, 255] as const;

/**
 * Draw the crawl sheet into a jsPDF document.
 *
 * Exported separately from the download so it can be unit-tested and reused
 * (e.g. a future "email me the sheet") without touching the DOM.
 */
export const buildRoutePdf = (doc: JsPdfType, input: RoutePdfInput): JsPdfType => {
  const { stops, mapsUrl, qrDataUrl, title = "Your Bar Crawl" } = input;

  // ---- Header band --------------------------------------------------------
  doc.setFillColor(...INK);
  doc.rect(0, BAND_TOP, PAGE_W, BAND_H, "F");

  // Amber hairline along the bottom of the band — the app's single accent.
  doc.setFillColor(...AMBER);
  doc.rect(0, BAND_H - 1.2, PAGE_W, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...WHITE);
  doc.text(title, MARGIN, BAND_TOP + 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...AMBER);
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(
    `${stops.length} ${stops.length === 1 ? "stop" : "stops"}  ·  ${dateLine}`,
    MARGIN,
    BAND_TOP + 39
  );

  // QR on a white card: scanners want dark-on-light, and the card keeps it
  // readable against the ink band.
  if (qrDataUrl) {
    try {
      doc.setFillColor(...WHITE);
      doc.roundedRect(QR_CARD_X, QR_CARD_Y, QR_CARD, QR_CARD, 2.5, 2.5, "F");
      doc.addImage(qrDataUrl, "PNG", QR_CARD_X + QR_PAD, QR_CARD_Y + QR_PAD, QR, QR);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...AMBER);
      // Sits inside the ink band, under the card — the band is tall enough for
      // both, which is the whole reason its height comes from the QR.
      doc.text(
        "Scan to open on your phone",
        QR_CARD_X + QR_CARD / 2,
        QR_CARD_Y + QR_CARD + 5,
        { align: "center" }
      );
    } catch {
      /* a broken QR must never cost the whole sheet */
    }
  }

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
    const blockH = 9 + addressLines.length * 4.8 + 8;

    if (discY + blockH > CONTENT_BOTTOM) {
      doc.addPage();
      // Thin ink strip on continuation pages so they still read as the sheet.
      doc.setFillColor(...INK);
      doc.rect(0, 0, PAGE_W, 8, "F");
      doc.setFillColor(...AMBER);
      doc.rect(0, 8 - 0.9, PAGE_W, 0.9, "F");
      discY = 8 + 14;
      prevDiscY = null; // never draw a rail across a page break
    }

    // The rail between discs reads as the route itself running down the page.
    if (prevDiscY !== null) {
      doc.setDrawColor(...AMBER_SOFT);
      doc.setLineWidth(1.1);
      doc.line(DISC_X, prevDiscY + DISC_R + 1.5, DISC_X, discY - DISC_R - 1.5);
    }

    doc.setFillColor(...AMBER);
    doc.circle(DISC_X, discY, DISC_R, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ON_ACCENT);
    doc.text(String(i + 1), DISC_X, discY + 1.8, { align: "center" });

    doc.setFontSize(14);
    doc.setTextColor(...BODY);
    doc.text(stop.name, TEXT_X, discY + 1.8);

    let lineY = discY + 8.5;
    if (addressLines.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...MUTED);
      addressLines.forEach((line) => {
        doc.text(line, TEXT_X, lineY);
        lineY += 4.8;
      });
    }

    // Space to scribble. Indented to the text column so it reads as belonging
    // to the stop rather than dividing one stop from the next.
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(TEXT_X, lineY + 2, PAGE_W - MARGIN, lineY + 2);

    prevDiscY = discY;
    discY = lineY + 14;
  });

  // ---- Footer -------------------------------------------------------------
  const footerY = PAGE_H - MARGIN;
  doc.setDrawColor(...INK_SOFT);
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BODY);
  doc.text("BarHop", MARGIN, footerY - 3);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text("gobarhop.app", MARGIN + 11, footerY - 3);

  if (mapsUrl) {
    const label = "Open in Google Maps";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
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
