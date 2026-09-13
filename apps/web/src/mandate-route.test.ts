import { describe, expect, it } from "bun:test";
import { isSigningUnavailable } from "./mandate-route";

describe("isSigningUnavailable", () => {
  it("recognises the refusal the API sends when DocuSeal is absent", () => {
    expect(isSigningUnavailable(new Error("DocuSeal is not configured"))).toBe(true);
  });

  it("recognises the typed capability refusal", () => {
    expect(isSigningUnavailable(new Error("capability_not_available"))).toBe(true);
  });

  it("leaves every other failure alone", () => {
    expect(isSigningUnavailable(new Error("Registry rejected the security"))).toBe(false);
    expect(isSigningUnavailable("not an error")).toBe(false);
  });
});
