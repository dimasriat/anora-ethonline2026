import { describe, expect, test } from "vitest";
import { privyStanding } from "./identity";

describe("what the onboarding strip may claim about Privy", () => {
  test("says simulated when identity runs behind the demo adapter", () => {
    expect(privyStanding({ simulated: true, ready: false, authenticated: false, carrying: false }))
      .toEqual({ label: "Simulated", tone: "pending" });
  });

  test("claims a connection only once a token is actually carried", () => {
    expect(privyStanding({ simulated: false, ready: true, authenticated: true, carrying: true }))
      .toEqual({ label: "Connected", tone: "ready" });
  });

  test("does not claim a connection while the session is still arriving", () => {
    expect(privyStanding({ simulated: false, ready: true, authenticated: true, carrying: false }).label)
      .toBe("Signing in…");
    expect(privyStanding({ simulated: false, ready: false, authenticated: false, carrying: false }).label)
      .toBe("Signing in…");
  });

  test("reports a signed-out visitor as not connected", () => {
    expect(privyStanding({ simulated: false, ready: true, authenticated: false, carrying: false }))
      .toEqual({ label: "Not connected", tone: "absent" });
  });
});
