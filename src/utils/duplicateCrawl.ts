// src/utils/duplicateCrawl.ts
//
// "Run it again": a repeat organizer's monthly crawl is the same night with a
// new date. These helpers name the copy so a list of re-runs stays readable —
// "Holland Halloween · Sat, Oct 31", never "… · Sat, Oct 3 · Sat, Oct 31".

/** The suffix this module appends, so a copy of a copy replaces it. */
const DATE_SUFFIX = / · (Mon|Tue|Wed|Thu|Fri|Sat|Sun), [A-Z][a-z]{2} \d{1,2}$/;

/** "YYYY-MM-DD" (an <input type="date"> value) as a LOCAL date. `new Date()`
 *  on that string would parse it as UTC midnight, which is the previous
 *  evening everywhere west of Greenwich — the wrong night out. */
export const parseDateInput = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** A Date as an <input type="date"> value, in local time. */
export const toDateInput = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** The coming Saturday — today, if today is one. Crawls happen on Saturdays. */
export const nextSaturday = (from: Date): Date => {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7));
  return date;
};

export const duplicateName = (name: string, date: Date): string => {
  const base = name.replace(DATE_SUFFIX, "").trim() || "Bar crawl";
  const label = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${base} · ${label}`;
};
