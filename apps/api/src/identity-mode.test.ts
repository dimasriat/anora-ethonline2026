import { describe, expect, it } from "bun:test";
import { identityIsSimulated } from "./identity-mode";

describe("identityIsSimulated", () => {
  it("simulates when the flag asks for it, even with Privy configured", () => {
    expect(identityIsSimulated({ ADAPTER_IDENTITY: "demo", PRIVY_APP_ID: "app-1" })).toBe(true);
  });

  it("simulates when no Privy app is configured at all", () => {
    expect(identityIsSimulated({})).toBe(true);
    expect(identityIsSimulated({ PRIVY_APP_ID: "" })).toBe(true);
  });

  it("stays live when Privy is configured and the flag is absent", () => {
    expect(identityIsSimulated({ PRIVY_APP_ID: "app-1" })).toBe(false);
  });

  it("stays live when the flag names anything other than demo", () => {
    expect(identityIsSimulated({ ADAPTER_IDENTITY: "live", PRIVY_APP_ID: "app-1" })).toBe(false);
  });
});
