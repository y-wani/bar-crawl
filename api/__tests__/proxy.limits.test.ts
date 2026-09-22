import { describe, it, expect } from "vitest";
import { limitsFor, ANON_GLOBAL_DAILY_CEILING } from "../proxy";

describe("limitsFor", () => {
  it("leaves real accounts on the existing nearby limits", () => {
    expect(limitsFor("nearby", false)).toEqual({ minute: 10, day: 80 });
  });

  it("caps anonymous nearby search at the spec numbers", () => {
    expect(limitsFor("nearby", true)).toEqual({ minute: 5, day: 15 });
  });

  it("leaves real accounts on the existing text limits", () => {
    expect(limitsFor("text", false)).toEqual({ minute: 60, day: 300 });
  });

  it("caps anonymous text search below a real account", () => {
    expect(limitsFor("text", true).minute).toBeLessThan(limitsFor("text", false).minute);
    expect(limitsFor("text", true).day).toBeLessThan(limitsFor("text", false).day);
  });

  it("leaves real accounts on the existing AI-clean limits", () => {
    expect(limitsFor("clean", false)).toEqual({ minute: 8, day: 40 });
  });

  it("caps anonymous AI cleanup below a real account", () => {
    expect(limitsFor("clean", true).minute).toBeLessThan(limitsFor("clean", false).minute);
    expect(limitsFor("clean", true).day).toBeLessThan(limitsFor("clean", false).day);
  });
});

describe("ANON_GLOBAL_DAILY_CEILING", () => {
  it("is the 500/UTC-day figure from the spec", () => {
    expect(ANON_GLOBAL_DAILY_CEILING).toBe(500);
  });
});
