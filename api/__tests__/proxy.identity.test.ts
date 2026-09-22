import { describe, it, expect } from "vitest";
import { isAnonymousProvider } from "../proxy";

describe("isAnonymousProvider", () => {
  it("is true for an anonymous sign-in", () => {
    expect(
      isAnonymousProvider({ firebase: { sign_in_provider: "anonymous" } })
    ).toBe(true);
  });

  it("is false for a password account", () => {
    expect(
      isAnonymousProvider({ firebase: { sign_in_provider: "password" } })
    ).toBe(false);
  });

  it("is false for a Google account", () => {
    expect(
      isAnonymousProvider({ firebase: { sign_in_provider: "google.com" } })
    ).toBe(false);
  });

  it("treats a missing claim as a real account", () => {
    expect(isAnonymousProvider({})).toBe(false);
    expect(isAnonymousProvider({ firebase: {} })).toBe(false);
  });
});
