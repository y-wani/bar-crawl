import { describe, it, expect } from "vitest";
import { isLinkCollision, errorCodeOf } from "../accountUpgrade";

describe("errorCodeOf", () => {
  it("pulls the code off a Firebase error", () => {
    expect(errorCodeOf({ code: "auth/email-already-in-use" })).toBe(
      "auth/email-already-in-use"
    );
  });

  it("returns null for anything else", () => {
    expect(errorCodeOf(new Error("boom"))).toBeNull();
    expect(errorCodeOf(null)).toBeNull();
    expect(errorCodeOf("auth/email-already-in-use")).toBeNull();
  });
});

describe("isLinkCollision", () => {
  it("is true when the email already has an account", () => {
    expect(isLinkCollision("auth/email-already-in-use")).toBe(true);
  });

  it("is true when the Google credential already has an account", () => {
    expect(isLinkCollision("auth/credential-already-in-use")).toBe(true);
  });

  it("is true when the provider is already linked", () => {
    expect(isLinkCollision("auth/provider-already-linked")).toBe(true);
  });

  it("is false for a weak password", () => {
    expect(isLinkCollision("auth/weak-password")).toBe(false);
  });

  it("is false for junk", () => {
    expect(isLinkCollision(null)).toBe(false);
    expect(isLinkCollision(undefined)).toBe(false);
  });
});
