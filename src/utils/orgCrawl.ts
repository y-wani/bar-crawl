// src/utils/orgCrawl.ts
//
// An org's crawl is a saved barCrawls doc; a group running it is a live
// crawlSessions doc of its own. This turns the first into the input for the
// second without going through the Route page, so a group leader taps one
// button on the org page and is on the crawl.
//
// Pure (type imports only) so it is testable without Firebase.

import type { SavedBarCrawl } from "../services/crawlService";
import type { CreateSessionInput } from "../services/sessionService";

export const orgSessionInput = (
  crawl: SavedBarCrawl,
  host: { uid: string; displayName: string | null },
  orgSlug: string
): CreateSessionInput => {
  // The saved order is the crawl. Sort defensively: Firestore keeps array
  // order, but `order` is the field the Route page writes and trusts.
  const bars = [...crawl.bars].sort((a, b) => a.order - b.order);
  const start = crawl.route?.startLocation;
  const end = crawl.route?.endLocation;
  const first = bars[0]?.location.coordinates;
  const last = bars[bars.length - 1]?.location.coordinates;
  const startCoordinates: [number, number] = start
    ? [start.lng, start.lat]
    : first ?? [0, 0];
  const endCoordinates: [number, number] = end
    ? [end.lng, end.lat]
    : last ?? startCoordinates;

  return {
    hostUid: host.uid,
    displayName: host.displayName,
    stops: bars.map((bar, index) => ({
      barId: bar.id,
      name: bar.name,
      rating: bar.rating,
      order: index,
      coordinates: bar.location.coordinates,
    })),
    crawlId: crawl.id ?? null,
    crawlName: crawl.name,
    orgSlug,
    route: {
      startCoordinates,
      endCoordinates,
      plannedDistanceMiles: crawl.route?.totalDistance ?? null,
      plannedDurationMin: crawl.route?.estimatedDuration ?? null,
    },
  };
};
