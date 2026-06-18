// scripts/demo-seed.mjs
//
// Resets the demo account's data to a clean, great-looking state. Run before
// each demo recording:  npm run demo:seed
//
// Seeds: 3 saved crawls, one ACTIVE group live-crawl (with a "friend" already
// at the first bar so the squad tracker / friend dot / pings light up solo),
// and a populated "Plan it together" vote lobby. Writes the new ids to
// scripts/.demo-ids.json for the player script.
//
// NOTE: the friend's live position goes stale after ~10 min (FRIEND_STALE_MS),
// so seed shortly before recording.

import fs from "fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, getDocs, query, where,
  serverTimestamp,
} from "firebase/firestore";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME, FIREBASE_WEB_CONFIG, DEMO_GEO } from "./demo-config.mjs";

const app = initializeApp(FIREBASE_WEB_CONFIG, "demo-seed");
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(getAuth(app), DEMO_EMAIL, DEMO_PASSWORD);
const uid = user.uid;
console.log("✓ signed in as", DEMO_EMAIL);

// ---- wipe previous demo data ----
const wipe = async (coll, field) => {
  const snap = await getDocs(query(collection(db, coll), where(field, "==", uid)));
  await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, coll, d.id))));
  if (snap.size) console.log(`  cleared ${snap.size} ${coll}`);
};
await wipe("barCrawls", "createdBy");
await wipe("crawlSessions", "hostUid");
await wipe("crawlPlans", "hostUid");

const bar = (id, name, rating, lng, lat, order) => ({
  id, name, rating, distance: 0,
  location: { type: "Point", coordinates: [lng, lat] },
  order, estimatedTime: 30,
});

// ---- 3 saved crawls ----
const savedCrawls = [
  {
    name: "Wicker Park Pub Crawl", description: "A laid-back loop through Chicago's best dives and cocktail dens.",
    bars: [bar("wp1","The Gilded Owl",4.7,-87.6770,41.9090,0), bar("wp2","Violet Hour",4.8,-87.6730,41.9075,1), bar("wp3","Emporium Arcade Bar",4.5,-87.6800,41.9100,2), bar("wp4","Map Room",4.4,-87.6815,41.9135,3)],
    mapCenter: [-87.6770, 41.9095], searchRadius: 1.5,
    route: { startLocation: { lat: 41.9090, lng: -87.6770, address: "Wicker Park, Chicago" }, endLocation: { lat: 41.9135, lng: -87.6815, address: "Map Room" }, totalDistance: 1.4, estimatedDuration: 150 },
    tags: ["chicago", "cocktails", "dives"],
  },
  {
    name: "East Village Night Out", description: "Manhattan classics — speakeasies, beer halls, and a rooftop to finish.",
    bars: [bar("ev1","Death & Co",4.8,-73.9840,40.7265,0), bar("ev2","Please Don't Tell",4.7,-73.9845,40.7270,1), bar("ev3","McSorley's Old Ale House",4.5,-73.9900,40.7286,2)],
    mapCenter: [-73.9860, 40.7272], searchRadius: 1.2,
    route: { startLocation: { lat: 40.7265, lng: -73.9840, address: "East Village, NYC" }, endLocation: { lat: 40.7286, lng: -73.9900, address: "McSorley's" }, totalDistance: 0.9, estimatedDuration: 110 },
    tags: ["nyc", "speakeasy"],
  },
  {
    name: "Short North Hop", description: "Columbus' artsy strip — craft beer, patios, and late-night eats.",
    bars: [bar("sn1","Forno Kitchen + Bar",4.4,-83.0010,39.9760,0), bar("sn2","Standard Hall",4.3,-83.0015,39.9745,1), bar("sn3","The Bottle Shop",4.6,-83.0008,39.9775,2)],
    mapCenter: [-83.0011, 39.9760], searchRadius: 1.0,
    route: { startLocation: { lat: 39.9760, lng: -83.0010, address: "Short North, Columbus" }, endLocation: { lat: 39.9775, lng: -83.0008, address: "The Bottle Shop" }, totalDistance: 0.6, estimatedDuration: 95 },
    tags: ["columbus", "craft-beer"],
  },
];
for (const c of savedCrawls) {
  await addDoc(collection(db, "barCrawls"), {
    ...c, createdBy: uid, isPublic: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}
console.log(`✓ seeded ${savedCrawls.length} saved crawls`);

// ---- active group live crawl (friend already at the first stop) ----
const S = (id, name, rating, lng, lat, order) => ({ barId: id, name, rating, order, coordinates: [lng, lat] });
const stops = [
  S("demo-s1", "The Gilded Owl", 4.7, -83.0010, 39.9645, 0),
  S("demo-s2", "Neon Alley", 4.5, -83.0030, 39.9685, 1),
  S("demo-s3", "The Velvet Hour", 4.6, -83.0005, 39.9700, 2),
  S("demo-s4", "Last Call Saloon", 4.3, -82.9975, 39.9660, 3),
];
const sessionRef = await addDoc(collection(db, "crawlSessions"), {
  hostUid: uid,
  memberUids: [uid, "demo-friend-jordan"],
  members: {
    [uid]: { displayName: DEMO_NAME, joinedAt: serverTimestamp() },
    "demo-friend-jordan": {
      displayName: "Jordan", joinedAt: serverTimestamp(),
      lastPosition: { lng: stops[0].coordinates[0], lat: stops[0].coordinates[1], at: serverTimestamp() },
    },
  },
  status: "active", crawlId: null, crawlName: "Saturday Night Crawl",
  stops, currentStopIndex: 0, checkIns: {},
  route: { startCoordinates: [DEMO_GEO.longitude, DEMO_GEO.latitude], endCoordinates: stops[3].coordinates, plannedDistanceMiles: 1.3, plannedDurationMin: 120 },
  walkedMiles: 0,
  startedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});
console.log("✓ seeded active group crawl", sessionRef.id);

// ---- "Plan it together" vote lobby ----
const C = (id, name, rating, lng, lat) => ({ barId: id, name, rating, coordinates: [lng, lat] });
const candidates = [
  C("demo-c1", "Smoke & Rye", 4.6, -83.0020, 39.9630),
  C("demo-c2", "The Hopfather", 4.4, -83.0040, 39.9660),
  C("demo-c3", "Moonlight Tavern", 4.8, -82.9990, 39.9670),
  C("demo-c4", "Crescent Club", 4.2, -82.9970, 39.9625),
];
const planRef = await addDoc(collection(db, "crawlPlans"), {
  hostUid: uid, hostName: DEMO_NAME, title: "Saturday Squad Crawl", status: "open",
  attendeeUids: [uid, "demo-friend-maya"],
  attendees: {
    [uid]: { displayName: DEMO_NAME, joinedAt: serverTimestamp(), rsvp: "in" },
    "demo-friend-maya": { displayName: "Maya", joinedAt: serverTimestamp(), rsvp: "in" },
  },
  candidates,
  votes: {
    "demo-c3": { [uid]: true, "demo-friend-maya": true },
    "demo-c1": { "demo-friend-maya": true },
    "demo-c2": { [uid]: true },
  },
  route: { startCoordinates: [DEMO_GEO.longitude, DEMO_GEO.latitude], endCoordinates: candidates[3].coordinates },
  sessionId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});
console.log("✓ seeded plan lobby", planRef.id);

fs.writeFileSync(
  new URL("./.demo-ids.json", import.meta.url),
  JSON.stringify({ sessionId: sessionRef.id, planId: planRef.id, seededAt: Date.now() }, null, 2)
);
console.log("\n✓ wrote scripts/.demo-ids.json");
console.log("Next: npm run demo:play  (or record while it runs)");
await deleteApp(app);
process.exit(0);
