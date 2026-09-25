// src/utils/crawlLink.ts
//
// A crawl, encoded into a link that needs no account and no database.
//
// Until now the only BarHop share link in the app was built in SavedCrawls
// (`/route?crawlId=…`), which requires a real account AND a saved crawl — so a
// guest, who is most of the traffic, had no way to send anyone a BarHop link at
// all. The prominent "Share Route" button copied a google.com/maps URL instead,
// which meant every share the product has ever produced sent the rest of the
// group to Google rather than back here.
//
// The whole crawl therefore travels inside the URL. No Firestore write, no
// security-rule change, no anonymous writes to a public collection, no TTL to
// administer, and nothing to expire underneath a link somebody pasted into a
// group chat three weeks before the night. The cost is a longer URL (~400-600
// chars for five stops), which pastes into a message perfectly well.
//
// The payload lives in the FRAGMENT, not the query string: fragments are never
// sent to the server, so the crawl stays out of Vercel's request logs and every
// shared link is analytically just "/c".
//
// A link is untrusted input from a stranger. decodeCrawl validates every field
// and returns null rather than throwing — a mangled link must render a friendly
// empty state, never a white screen.

/** Coordinates are [lng, lat] throughout the app; keep that order here too. */
export type LngLat = [number, number];

export interface SharedStop {
  name: string;
  lng: number;
  lat: number;
  address?: string;
}

export interface SharedCrawl {
  name?: string;
  stops: SharedStop[];
  start?: LngLat;
  end?: LngLat;
}

/** Schema version. Bump only for a breaking wire change; old links must keep
 *  working, so a reader that sees an unknown version refuses rather than
 *  guessing. */
const VERSION = 1;

/** ~1.1 m of precision. Full float precision costs ~10 chars per stop and buys
 *  nothing — these are bar doorways, not survey markers. */
const COORD_DECIMALS = 5;

/** Long enough for any real crawl, short enough that a hostile link can't turn
 *  into a thousand-row render. */
export const MAX_SHARED_STOPS = 25;

const MAX_NAME_CHARS = 120;
const MAX_ADDRESS_CHARS = 160;

const round = (n: number): number =>
  Number(n.toFixed(COORD_DECIMALS));

const isLngLat = (value: unknown): value is LngLat =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number" &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]) &&
  Math.abs(value[0]) <= 180 &&
  Math.abs(value[1]) <= 90;

// ---------------------------------------------------------------------------
// base64url over UTF-8
//
// btoa() only accepts Latin-1, so a bar called "Café Bräu" throws an
// InvalidCharacterError. Encode to UTF-8 bytes first and map them into the
// Latin-1 range by hand. The byte loop is deliberate: String.fromCharCode(...)
// with a spread blows the call stack on large inputs.
// ---------------------------------------------------------------------------

const bytesToBinary = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
};

const toBase64Url = (text: string): string =>
  btoa(bytesToBinary(new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (payload: string): string => {
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  // atob tolerates missing padding in some engines and not others; add it back.
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

// ---------------------------------------------------------------------------
// Wire format
//
//   [ version, name|0, start|0, end|0, [ [name, lng, lat, address|0], … ] ]
//
// A positional array rather than an object: the keys would otherwise be a third
// of the payload. `0` stands in for "absent" because it costs one character
// where `null` costs four.
// ---------------------------------------------------------------------------

export const encodeCrawl = (crawl: SharedCrawl): string => {
  const stops = crawl.stops.slice(0, MAX_SHARED_STOPS).map((stop) => [
    stop.name.slice(0, MAX_NAME_CHARS),
    round(stop.lng),
    round(stop.lat),
    stop.address ? stop.address.slice(0, MAX_ADDRESS_CHARS) : 0,
  ]);

  return toBase64Url(
    JSON.stringify([
      VERSION,
      crawl.name ? crawl.name.slice(0, MAX_NAME_CHARS) : 0,
      crawl.start ? [round(crawl.start[0]), round(crawl.start[1])] : 0,
      crawl.end ? [round(crawl.end[0]), round(crawl.end[1])] : 0,
      stops,
    ])
  );
};

export const decodeCrawl = (payload: string): SharedCrawl | null => {
  if (!payload) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(payload));
  } catch {
    // Malformed base64, truncated paste, or not JSON at all.
    return null;
  }

  if (!Array.isArray(parsed) || parsed[0] !== VERSION) return null;

  const [, rawName, rawStart, rawEnd, rawStops] = parsed;
  if (!Array.isArray(rawStops)) return null;

  const stops: SharedStop[] = [];
  for (const entry of rawStops.slice(0, MAX_SHARED_STOPS)) {
    if (!Array.isArray(entry)) return null;
    const [name, lng, lat, address] = entry;
    if (typeof name !== "string") return null;
    if (!isLngLat([lng, lat])) return null;
    stops.push({
      name: name.slice(0, MAX_NAME_CHARS),
      lng,
      lat,
      ...(typeof address === "string" && address
        ? { address: address.slice(0, MAX_ADDRESS_CHARS) }
        : {}),
    });
  }

  // A one-stop crawl isn't a crawl, and /route would bounce it straight back
  // to /home anyway — same floor isValidGuestCrawl applies.
  if (stops.length < 2) return null;

  return {
    ...(typeof rawName === "string" && rawName
      ? { name: rawName.slice(0, MAX_NAME_CHARS) }
      : {}),
    stops,
    // A bad anchor is dropped rather than failing the whole link: the stop
    // order is the thing worth rescuing.
    ...(isLngLat(rawStart) ? { start: rawStart } : {}),
    ...(isLngLat(rawEnd) ? { end: rawEnd } : {}),
  };
};

/** The public path a shared crawl opens at. Ungated on purpose. */
export const CRAWL_LINK_PATH = "/c";

export const buildCrawlShareUrl = (
  crawl: SharedCrawl,
  origin: string = typeof window !== "undefined" ? window.location.origin : ""
): string => `${origin.replace(/\/+$/, "")}${CRAWL_LINK_PATH}#${encodeCrawl(crawl)}`;

/** Read a crawl out of `location.hash` (with or without the leading '#'). */
export const readCrawlFromHash = (hash: string): SharedCrawl | null => {
  const payload = hash.startsWith("#") ? hash.slice(1) : hash;
  return payload ? decodeCrawl(payload) : null;
};

/** A short, stable id for a payload — used to key "which stop are they on"
 *  in localStorage so a refresh mid-crawl doesn't lose their place, without
 *  storing the whole crawl a second time. Not a security primitive. */
export const crawlFingerprint = (payload: string): string => {
  // FNV-1a, 32-bit. Small, dependency-free and good enough to tell two
  // different crawls apart on one device.
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};
