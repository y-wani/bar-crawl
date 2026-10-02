// src/pages/VenueMap.tsx
//
// An event's venue map: every participating bar as an unordered pin, plus an
// A–Z list. Built for events like a 37-bar charity crawl with shuttles, where
// attendees go anywhere in any order — so unlike /c there is no "stop 1 of N",
// no route and no optimizing. It answers one question: where are the bars?
//
// Same guarantees as /c: no account, no anonymous mint, no database read. The
// venue list arrives either in the URL fragment (/v#…) or, for a short link
// (/v/<slug>), from a static file the batch tool publishes at
// /events/<slug>.json — same payload, same validation. A short link fits in an
// Instagram DM and can be updated in place when an event's lineup is final.
// The list is the page's core and renders even when the map can't (no signal,
// blocked token); the map is a layer on top of it.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { FiMapPin, FiNavigation } from "react-icons/fi";
import {
  readCrawlFromHash,
  MAX_VENUE_STOPS,
  type SharedStop,
} from "../utils/crawlLink";
import { analytics } from "../utils/analytics";
import { useEventPayload } from "../hooks/useEventPayload";
import "../styles/VenueMap.css";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const directionsUrl = (lng: number, lat: number): string =>
  `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${lat},${lng}`;

const byName = (a: SharedStop, b: SharedStop) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

const VenueMap: React.FC = () => {
  const location = useLocation();
  const { slug } = useParams();
  const slugPayload = useEventPayload(slug);

  const loading = !!slug && slugPayload === undefined;
  const crawl = useMemo(() => {
    if (slug) return slugPayload ? readCrawlFromHash(slugPayload, MAX_VENUE_STOPS) : null;
    return readCrawlFromHash(location.hash || window.location.hash, MAX_VENUE_STOPS);
  }, [slug, slugPayload, location.hash]);
  // A–Z: a venue map has no order, and alphabetical is how people scan for
  // "is my bar on it?".
  const venues = useMemo(
    () => (crawl ? [...crawl.stops].sort(byName) : []),
    [crawl]
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [mapFailed, setMapFailed] = useState(!MAPBOX_ACCESS_TOKEN);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (loading) return;
    analytics.venueMapOpened(venues.length, !!crawl);
  }, [loading, crawl, venues.length]);

  // ----- Map: one GeoJSON source, a circle layer and collision-aware labels.
  useEffect(() => {
    if (!mapNode.current || venues.length === 0 || !MAPBOX_ACCESS_TOKEN) return;
    let instance: mapboxgl.Map;
    try {
      mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
      instance = new mapboxgl.Map({
        container: mapNode.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [venues[0].lng, venues[0].lat],
        zoom: 13,
        attributionControl: true,
      });
    } catch {
      setMapFailed(true);
      return;
    }
    map.current = instance;
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("error", (e) => {
      // A style/token failure leaves a blank canvas; fall back to the list.
      if (!instance.isStyleLoaded()) {
        console.warn("Venue map failed to load:", e.error);
        setMapFailed(true);
      }
    });

    const bounds = new mapboxgl.LngLatBounds();
    venues.forEach((v) => bounds.extend([v.lng, v.lat]));

    instance.on("load", () => {
      instance.addSource("venues", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: venues.map((v, i) => ({
            type: "Feature",
            id: i,
            properties: { i, name: v.name },
            geometry: { type: "Point", coordinates: [v.lng, v.lat] },
          })),
        },
      });
      instance.addLayer({
        id: "venue-dots",
        type: "circle",
        source: "venues",
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            10,
            7,
          ],
          "circle-color": "#ECB256",
          "circle-stroke-width": 2,
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#FFF4DC",
            "#0B0A12",
          ],
        },
      });
      instance.addLayer({
        id: "venue-labels",
        type: "symbol",
        source: "venues",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-max-width": 9,
        },
        paint: {
          "text-color": "#F5EBDD",
          "text-halo-color": "#0B0A12",
          "text-halo-width": 1.5,
        },
      });
      instance.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });

      instance.on("click", "venue-dots", (e) => {
        const i = e.features?.[0]?.properties?.i;
        if (typeof i === "number") setSelected(i);
      });
      instance.on("mouseenter", "venue-dots", () => {
        instance.getCanvas().style.cursor = "pointer";
      });
      instance.on("mouseleave", "venue-dots", () => {
        instance.getCanvas().style.cursor = "";
      });
    });

    return () => {
      instance.remove();
      map.current = null;
    };
  }, [venues]);

  // ----- Selection: highlight the pin, centre it, bring its row into view.
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const instance = map.current;
    if (instance?.getSource("venues")) {
      if (previous.current !== null) {
        instance.setFeatureState({ source: "venues", id: previous.current }, { selected: false });
      }
      if (selected !== null) {
        instance.setFeatureState({ source: "venues", id: selected }, { selected: true });
        const v = venues[selected];
        instance.easeTo({ center: [v.lng, v.lat], duration: 400 });
      }
    }
    previous.current = selected;
    if (selected !== null) {
      rowRefs.current[selected]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected, venues]);

  if (loading) {
    return (
      <div className="venue-map venue-map--empty">
        <p className="venue-map-count">Loading the venue map…</p>
      </div>
    );
  }

  if (!crawl) return <BrokenLink />;

  const current = selected !== null ? venues[selected] : null;

  return (
    <div className="venue-map">
      <header className="venue-map-header">
        <Link to="/" className="venue-map-brand" aria-label="BarHop home">
          BarHop
        </Link>
        <h1 className="venue-map-title">{crawl.name || "Participating bars"}</h1>
        <p className="venue-map-count">{venues.length} bars · tap one for directions</p>
      </header>

      {!mapFailed && (
        <div className="venue-map-canvas" ref={mapNode} role="region" aria-label="Map of participating bars" />
      )}

      {current && (
        <section className="venue-map-selected" aria-live="polite">
          <div>
            <p className="venue-map-selected-name">{current.name}</p>
            {current.address && <p className="venue-map-selected-address">{current.address}</p>}
          </div>
          <a
            className="btn btn--primary"
            href={directionsUrl(current.lng, current.lat)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FiNavigation aria-hidden="true" /> Directions
          </a>
        </section>
      )}

      <ol className="venue-map-list" aria-label="All participating bars, A to Z">
        {venues.map((v, i) => (
          <li
            key={`${v.name}-${i}`}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className={`venue-map-row ${selected === i ? "is-selected" : ""}`}
          >
            <button type="button" className="venue-map-row-main" onClick={() => setSelected(i)}>
              <FiMapPin aria-hidden="true" />
              <span className="venue-map-row-text">
                <span className="venue-map-row-name">{v.name}</span>
                {v.address && <span className="venue-map-row-address">{v.address}</span>}
              </span>
            </button>
            <a
              className="venue-map-row-go"
              href={directionsUrl(v.lng, v.lat)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Directions to ${v.name}`}
            >
              <FiNavigation aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>

      <footer className="venue-map-footer">
        <p>Map made with BarHop — free, no account needed.</p>
        <Link to="/home?ref=venue_map" className="btn btn--secondary" onClick={() => analytics.plannerCta("venue_map")}>
          Plan your own crawl
        </Link>
      </footer>
    </div>
  );
};

const BrokenLink: React.FC = () => (
  <div className="venue-map venue-map--empty">
    <header className="venue-map-header">
      <Link to="/" className="venue-map-brand">
        BarHop
      </Link>
    </header>
    <h1 className="venue-map-title">This map link didn’t open</h1>
    <p className="venue-map-count">
      It may have been cut short when it was copied — links are long, and some apps trim them.
      Ask whoever sent it to share it again.
    </p>
  </div>
);

export default VenueMap;
