import { describe, it, expect } from "vitest";
import {
  duplicateName,
  nextSaturday,
  parseDateInput,
  toDateInput,
} from "../duplicateCrawl";

describe("parseDateInput", () => {
  it("parses as a local date, not UTC midnight", () => {
    const date = parseDateInput("2026-10-31")!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(31);
  });

  it("rejects anything that isn't YYYY-MM-DD", () => {
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("10/31/2026")).toBeNull();
  });

  it("round-trips with toDateInput", () => {
    expect(toDateInput(parseDateInput("2026-03-07")!)).toBe("2026-03-07");
  });
});

describe("nextSaturday", () => {
  it("moves a weekday forward to Saturday", () => {
    // Thu Oct 1 2026 → Sat Oct 3
    expect(toDateInput(nextSaturday(new Date(2026, 9, 1)))).toBe("2026-10-03");
  });

  it("keeps a Saturday as-is", () => {
    expect(toDateInput(nextSaturday(new Date(2026, 9, 31)))).toBe("2026-10-31");
  });

  it("moves a Sunday to the following Saturday", () => {
    expect(toDateInput(nextSaturday(new Date(2026, 10, 1)))).toBe("2026-11-07");
  });
});

describe("duplicateName", () => {
  const oct31 = new Date(2026, 9, 31);

  it("appends the new date", () => {
    expect(duplicateName("Holland Halloween", oct31)).toBe(
      "Holland Halloween · Sat, Oct 31"
    );
  });

  it("replaces the date of a crawl that was itself a copy", () => {
    expect(duplicateName("Holland Halloween · Sat, Oct 3", oct31)).toBe(
      "Holland Halloween · Sat, Oct 31"
    );
  });

  it("leaves a user's own dot-separated name alone", () => {
    expect(duplicateName("Pubs · Round 2", oct31)).toBe(
      "Pubs · Round 2 · Sat, Oct 31"
    );
  });

  it("falls back when the name is empty", () => {
    expect(duplicateName("", oct31)).toBe("Bar crawl · Sat, Oct 31");
  });
});
