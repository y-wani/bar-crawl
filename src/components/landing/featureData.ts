// src/components/landing/featureData.ts

export interface Feature {
  headline: string;
  body: string;
  imgSrc: string;
  imgAlt: string;
}

export const features: Feature[] = [
  {
    headline: "Find every bar on one map",
    body: "Explore bars and pubs around you on a live interactive map and build your shortlist.",
    imgSrc: "/Home_Page.png",
    imgAlt: "BarHop map showing bar pins across a city with a shortlist of bars in the sidebar",
  },
  {
    headline: "The smartest route, instantly",
    body: "Pick your stops and BarHop orders them into the perfect walkable crawl — with distance and walking time.",
    imgSrc: "/Route_Page.png",
    imgAlt: "BarHop optimized walking route connecting four bars with total distance and time",
  },
  {
    headline: "Let the group decide",
    body: "Invite friends to vote on the lineup so everyone's in before you head out.",
    imgSrc: "/Friend_Vote.png",
    imgAlt: "BarHop group voting panel where friends vote on which bars make the crawl",
  },
  {
    headline: "Crawl together, live",
    body: "Start a Live Crawl and your whole group sees the current stop, check-ins, and what's next in real time.",
    imgSrc: "/Live_Crawl.png",
    imgAlt: "BarHop Live Crawl view showing the next stop and real-time progress",
  },
  {
    headline: "Share the recap",
    body: "End the night with an auto-generated recap card you can share or download.",
    imgSrc: "/Crawl_recap.png",
    imgAlt: "BarHop crawl recap card showing stops visited, distance, and share and download buttons",
  },
];
