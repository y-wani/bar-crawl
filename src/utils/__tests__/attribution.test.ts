import { describe, it, expect, beforeEach } from "vitest";
import {
  refFromLocation,
  shouldStore,
  captureRef,
  getRef,
  REF_TTL_MS,
} from "../attribution";

describe("refFromLocation", () => {
  it("prefers an explicit ref", () => {
    expect(refFromLocation("/home", "?ref=recap")).toBe("recap");
  });

  it("reads the batch-routes source tag on /c", () => {
    expect(refFromLocation("/c", "?s=chi-zombie")).toBe("chi-zombie");
  });

  it("lets ref win over s when both are present", () => {
    expect(refFromLocation("/c", "?s=chi-zombie&ref=recap")).toBe("recap");
  });

  it("lowercases tags", () => {
    expect(refFromLocation("/c", "?s=GR-Meetup")).toBe("gr-meetup");
  });

  it("drops tags that aren't short slugs", () => {
    expect(refFromLocation("/home", "?ref=<script>")).toBeNull();
    expect(refFromLocation("/home", `?ref=${"a".repeat(41)}`)).toBeNull();
    expect(refFromLocation("/home", "?ref=")).toBeNull();
  });

  it("does not fall through to the path default when a tag is invalid", () => {
    // A mangled tag on /c is unknown, not "list" — guessing would mis-credit it.
    expect(refFromLocation("/c", "?s=%%%")).toBeNull();
  });

  it("credits a short venue-map link to its event", () => {
    expect(refFromLocation("/v/12BOC-stl", "")).toBe("12boc-stl");
    expect(refFromLocation("/v", "")).toBe("venue_map");
    expect(refFromLocation("/v/%%%", "")).toBe("venue_map");
  });

  it("credits a short route link to its event", () => {
    expect(refFromLocation("/c/12boc-kc-downtown", "")).toBe("12boc-kc-downtown");
    expect(refFromLocation("/c/%%%", "")).toBe("list");
  });

  it("infers the attendee entry points", () => {
    expect(refFromLocation("/c", "")).toBe("list");
    expect(refFromLocation("/live", "?join=abc")).toBe("invite");
    expect(refFromLocation("/plan", "?id=abc")).toBe("plan_invite");
  });

  it("returns null for ordinary pages", () => {
    expect(refFromLocation("/home", "")).toBeNull();
    expect(refFromLocation("/live", "")).toBeNull();
    expect(refFromLocation("/", "")).toBeNull();
  });
});

describe("shouldStore", () => {
  const now = 1_000_000_000_000;

  it("stores the first touch", () => {
    expect(shouldStore(null, "recap", now)).toBe(true);
  });

  it("never stores a null candidate", () => {
    expect(shouldStore(null, null, now)).toBe(false);
  });

  it("keeps an unexpired first touch", () => {
    expect(shouldStore({ ref: "invite", at: now - 1000 }, "recap", now)).toBe(false);
  });

  it("replaces a first touch older than the window", () => {
    expect(
      shouldStore({ ref: "invite", at: now - REF_TTL_MS - 1 }, "recap", now)
    ).toBe(true);
  });
});

describe("captureRef / getRef", () => {
  beforeEach(() => localStorage.clear());

  it("reports direct when nothing was captured", () => {
    expect(getRef()).toBe("direct");
  });

  it("keeps the first touch across later CTAs", () => {
    captureRef("/live", "?join=abc");
    captureRef("/home", "?ref=recap");
    expect(getRef()).toBe("invite");
  });

  it("survives a corrupt stored value", () => {
    localStorage.setItem("bh_ref", "{not json");
    expect(getRef()).toBe("direct");
    captureRef("/c", "?s=gr-meetup");
    expect(getRef()).toBe("gr-meetup");
  });
});
