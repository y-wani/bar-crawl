// src/services/orgService.ts
//
// Organization mode. An org is a pub-crawl company or charity event that runs
// the same crawl for many separate groups ("self-guided": no one big session,
// each group goes at its own pace). The org gets a branded page, /o/<slug>,
// listing its crawls; a group leader taps "Start our group's crawl" and gets
// a live session of their own plus an invite link for the group.
//
// One doc per org, named by its slug:
//
//   orgs/{slug} {
//     name, tagline?, website?, logoUrl?, accent ("#rrggbb"),
//     crawlIds: string[]     — barCrawls docs, in display order
//     memberUids: string[]   — org staff (reserved: editing comes later)
//   }
//
// Clients can only read it (firestore.rules); scripts/org.mjs writes it with
// the Admin credentials. The crawls themselves stay ordinary barCrawls docs,
// so the admin builds them in the app like any other crawl.

import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getCrawlById, type SavedBarCrawl } from "./crawlService";

export interface Org {
  slug: string;
  name: string;
  tagline?: string;
  website?: string;
  /** Only set once the org has said we may use their logo. */
  logoUrl?: string | null;
  accent?: string;
  crawlIds: string[];
  memberUids: string[];
}

const ORGS_COLLECTION = "orgs";

/** The org doc, or null when there is no such org. Throws on a network or
 *  permission failure so the page can tell "not found" from "offline". */
export const getOrg = async (slug: string): Promise<Org | null> => {
  const snap = await getDoc(doc(db, ORGS_COLLECTION, slug));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    slug,
    name: typeof data.name === "string" ? data.name : slug,
    tagline: typeof data.tagline === "string" ? data.tagline : undefined,
    website: typeof data.website === "string" ? data.website : undefined,
    logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
    accent: typeof data.accent === "string" ? data.accent : undefined,
    crawlIds: Array.isArray(data.crawlIds) ? data.crawlIds.filter((id) => typeof id === "string") : [],
    memberUids: Array.isArray(data.memberUids) ? data.memberUids : [],
  };
};

/** The org's crawls in its chosen order. A crawl that was deleted or fails to
 *  load is left out rather than failing the whole page. */
export const getOrgCrawls = async (org: Org): Promise<SavedBarCrawl[]> => {
  const results = await Promise.all(
    org.crawlIds.map((id) => getCrawlById(id).catch(() => null))
  );
  return results.filter(
    (crawl): crawl is SavedBarCrawl => !!crawl && Array.isArray(crawl.bars) && crawl.bars.length >= 2
  );
};
