// src/components/ImportBarsModal.tsx
//
// Bulk-import a bar list (e.g. an event's "St. Patrick's crawl" lineup).
// Paste names/addresses one per line; each line is resolved against Google
// Places. Anything that can't be matched can still be added manually by
// geocoding the raw address (name optional), so no stop gets left behind.

import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiX,
  FiCheckCircle,
  FiAlertCircle,
  FiSearch,
  FiPlus,
  FiLoader,
} from "react-icons/fi";
import { modalOverlay, modalPanel } from "./motion/variants";
import { toast } from "./Toaster";
import { searchPlaceByText } from "../services/placesService";
import { forwardGeocode } from "../utils/geocode";
import type { AppBat } from "../pages/Home";
import "../styles/ImportBarsModal.css";

interface ImportBarsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Soft proximity bias + fallback center for resolving venues */
  mapCenter: [number, number];
  /** Called with the resolved bars when the user confirms the import */
  onImport: (bars: AppBat[]) => void;
}

type EntryStatus = "pending" | "found" | "notfound";

interface ImportEntry {
  id: string;
  query: string;
  status: EntryStatus;
  bar?: AppBat;
  include: boolean;
  manualName: string;
  manualAddress: string;
  geocoding: boolean;
}

// Best-effort split of "Name, 123 Main St, City" into name + address, used to
// pre-fill the manual fields when Places can't match a line.
const splitNameAddress = (line: string): { name: string; address: string } => {
  const m = line.match(/^(.*?)(?:\s*[,\-–|]\s*|\t)(.+)$/);
  if (m) return { name: m[1].trim(), address: m[2].trim() };
  return { name: line.trim(), address: "" };
};

export const ImportBarsModal: React.FC<ImportBarsModalProps> = ({
  isOpen,
  onClose,
  mapCenter,
  onImport,
}) => {
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [rawText, setRawText] = useState("");
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [resolving, setResolving] = useState(false);

  const reset = useCallback(() => {
    setStep("paste");
    setRawText("");
    setEntries([]);
    setResolving(false);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    // Let the exit animation play before clearing
    setTimeout(reset, 250);
  }, [onClose, reset]);

  const updateEntry = useCallback(
    (id: string, patch: Partial<ImportEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
      );
    },
    []
  );

  const handleFind = useCallback(async () => {
    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.error("Paste a list first — one bar per line");
      return;
    }

    const initial: ImportEntry[] = lines.map((line, i) => {
      const { name, address } = splitNameAddress(line);
      return {
        id: `row-${i}-${Date.now()}`,
        query: line,
        status: "pending",
        include: true,
        manualName: name,
        manualAddress: address,
        geocoding: false,
      };
    });

    setEntries(initial);
    setStep("review");
    setResolving(true);

    const bias = { lat: mapCenter[1], lng: mapCenter[0] };

    await Promise.all(
      initial.map(async (entry) => {
        // 1) Google Places — rich match (rating, canonical name/address)
        try {
          const bar = await searchPlaceByText(entry.query, bias);
          if (bar) {
            updateEntry(entry.id, { status: "found", bar, include: true });
            return;
          }
        } catch (error) {
          console.warn("Places text search failed, trying geocode:", error);
        }

        // 2) Fallback to Mapbox geocoding — but ONLY when the line carries a
        // real street number. Mapbox force-matches any string to something
        // (a bare bar name can resolve to a random street worldwide), and it's
        // only trustworthy for actual addresses. Name-only lines fall through
        // to manual, where the user supplies the address.
        const hasStreetNumber = /\d{2,}/.test(entry.query);
        if (hasStreetNumber) {
          try {
            const geo = await forwardGeocode(
              entry.query,
              { lng: mapCenter[0], lat: mapCenter[1] },
              ["address"]
            );
            if (geo) {
              const { name } = splitNameAddress(entry.query);
              const bar: AppBat = {
                id: `geo-${entry.id}`,
                name: name || entry.query,
                rating: 0,
                distance: 0,
                location: { type: "Point", coordinates: geo.coordinates },
                address: geo.placeName,
              };
              updateEntry(entry.id, { status: "found", bar, include: true });
              return;
            }
          } catch (error) {
            console.warn("Geocode fallback failed:", error);
          }
        }

        // 3) Truly unresolved — let the user fix it by hand
        updateEntry(entry.id, { status: "notfound", include: false });
      })
    );

    setResolving(false);
  }, [rawText, mapCenter, updateEntry]);

  // Manually geocode a not-found row's address into a stop
  const handleManualAdd = useCallback(
    async (entry: ImportEntry) => {
      const addr = entry.manualAddress.trim();
      const name = entry.manualName.trim();
      const queryStr = addr || name;
      if (!queryStr) {
        toast.error("Add an address (or at least a name) to place this stop");
        return;
      }
      updateEntry(entry.id, { geocoding: true });
      // Geocode the address on its own — prefixing the venue name throws off
      // Mapbox's address matching. The name is only used for display.
      const geo = await forwardGeocode(
        addr || name,
        { lng: mapCenter[0], lat: mapCenter[1] },
        ["address", "poi"]
      );
      if (!geo) {
        updateEntry(entry.id, { geocoding: false });
        toast.error("Couldn't pin that — add a street address (with city)");
        return;
      }
      const bar: AppBat = {
        id: `manual-${entry.id}`,
        name: name || addr || "Custom stop",
        rating: 0,
        distance: 0,
        location: { type: "Point", coordinates: geo.coordinates },
        address: geo.placeName,
      };
      updateEntry(entry.id, {
        status: "found",
        bar,
        include: true,
        geocoding: false,
      });
      toast.success(`Added ${bar.name}`);
    },
    [mapCenter, updateEntry]
  );

  const includedBars = entries.filter((e) => e.include && e.bar);
  const foundCount = entries.filter((e) => e.bar).length;
  const notFoundCount = entries.filter(
    (e) => e.status === "notfound" && !e.bar
  ).length;

  const handleConfirm = useCallback(() => {
    const bars = entries
      .filter((e) => e.include && e.bar)
      .map((e) => e.bar as AppBat);
    if (bars.length < 2) {
      toast.error("A crawl needs at least 2 stops");
      return;
    }
    onImport(bars);
  }, [entries, onImport]);

  // Portal to <body> so the fixed overlay escapes the sidebar's
  // backdrop-filter containing block and covers the whole viewport.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          variants={modalOverlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={handleClose}
        >
          <motion.div
            className="modal-panel import-modal"
            variants={modalPanel}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <button
              className="import-close"
              onClick={handleClose}
              aria-label="Close"
            >
              <FiX />
            </button>

            {step === "paste" ? (
              <>
                <h2 className="modal-title" id="import-title">
                  Import a bar list
                </h2>
                <p className="modal-subtitle">
                  Paste your event's lineup — one bar per line. Names, addresses,
                  or both ("Murphy's, 123 Main St, Chicago"). We'll find each one;
                  anything we can't match you can still add by address.
                </p>

                <textarea
                  className="import-textarea"
                  placeholder={
                    "The Tipsy Crow, 770 5th Ave, San Diego\nThe Field Irish Pub\n201 W Broadway, San Diego"
                  }
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={9}
                  autoFocus
                />

                <div className="import-actions">
                  <button className="btn btn--ghost" onClick={handleClose}>
                    Cancel
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={handleFind}
                    disabled={!rawText.trim()}
                  >
                    <FiSearch /> Find bars
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="modal-title" id="import-title">
                  Review your crawl
                </h2>
                <p className="modal-subtitle">
                  {resolving
                    ? "Finding your bars…"
                    : `${foundCount} found${
                        notFoundCount > 0 ? ` · ${notFoundCount} need a hand` : ""
                      }`}
                </p>

                <div className="import-list">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`import-row is-${entry.status}`}
                    >
                      {entry.status === "pending" && (
                        <div className="import-row-main">
                          <FiLoader className="import-spin" />
                          <span className="import-row-query">{entry.query}</span>
                        </div>
                      )}

                      {entry.status === "found" && entry.bar && (
                        <label className="import-row-main import-row-found">
                          <input
                            type="checkbox"
                            checked={entry.include}
                            onChange={(e) =>
                              updateEntry(entry.id, { include: e.target.checked })
                            }
                          />
                          <FiCheckCircle className="import-ok" />
                          <span className="import-row-text">
                            <span className="import-row-name">
                              {entry.bar.name}
                            </span>
                            {entry.bar.address && (
                              <span className="import-row-addr">
                                {entry.bar.address}
                              </span>
                            )}
                          </span>
                          {entry.bar.rating > 0 && (
                            <span className="import-row-rating">
                              ★ {entry.bar.rating.toFixed(1)}
                            </span>
                          )}
                        </label>
                      )}

                      {entry.status === "notfound" && !entry.bar && (
                        <div className="import-row-manual">
                          <div className="import-row-main">
                            <FiAlertCircle className="import-warn" />
                            <span className="import-row-query">
                              Couldn't find "{entry.query}"
                            </span>
                          </div>
                          <div className="import-manual-fields">
                            <input
                              className="import-manual-input"
                              placeholder="Name (optional)"
                              value={entry.manualName}
                              onChange={(e) =>
                                updateEntry(entry.id, {
                                  manualName: e.target.value,
                                })
                              }
                            />
                            <input
                              className="import-manual-input"
                              placeholder="Address or place + city"
                              value={entry.manualAddress}
                              onChange={(e) =>
                                updateEntry(entry.id, {
                                  manualAddress: e.target.value,
                                })
                              }
                            />
                            <button
                              className="import-manual-add"
                              onClick={() => handleManualAdd(entry)}
                              disabled={entry.geocoding}
                            >
                              {entry.geocoding ? (
                                <FiLoader className="import-spin" />
                              ) : (
                                <FiPlus />
                              )}
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="import-actions">
                  <button
                    className="btn btn--ghost"
                    onClick={() => setStep("paste")}
                  >
                    Back
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={handleConfirm}
                    disabled={resolving || includedBars.length < 2}
                  >
                    Add {includedBars.length || ""} to crawl
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ImportBarsModal;
