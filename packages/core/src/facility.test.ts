import { describe, expect, test } from "bun:test";
import { facilityFrom, remainingCapacityIdr, screenSubscription } from "./facility";
import type { Investor, Subscription } from "./domain";

const facility = facilityFrom(600_000_000, 7_000);
const senior = facility.tranches.find((t) => t.name === "SENIOR")!;
const junior = facility.tranches.find((t) => t.name === "JUNIOR")!;

const investor = (over: Partial<Investor> = {}): Investor => ({
  id: "INV-TEST",
  name: "Test Capital",
  capitalType: "Test",
  riskProfile: "Test",
  mandate: ["SENIOR", "JUNIOR"],
  ticketIdr: { min: 10_000_000, max: 270_000_000 },
  allowlisted: true,
  standing: "KYB verified",
  ...over,
});

const subscription = (tranche: "SENIOR" | "JUNIOR", unitsIdr: number): Subscription => ({
  id: "SUB-1",
  investorId: "INV-TEST",
  tranche,
  unitsIdr,
  at: "2026-09-06T00:00:00.000Z",
});

describe("facilityFrom", () => {
  test("derives the ceiling from the receipt, not a fixed number", () => {
    expect(facility.ceilingIdr).toBe(420_000_000);
    expect(facilityFrom(226_800_000, 7_000).ceilingIdr).toBe(158_760_000);
  });

  test("issues Senior and Junior, leaving capacity unissued", () => {
    expect(senior.capacityIdr).toBe(270_000_000);
    expect(junior.capacityIdr).toBe(120_000_000);
    expect(facility.ceilingIdr - senior.capacityIdr - junior.capacityIdr).toBe(30_000_000);
  });

  test("stores loss bands rather than implying them from the name", () => {
    expect(junior.attachmentIdr).toBe(0);
    expect(junior.detachmentIdr).toBe(120_000_000);
    expect(senior.attachmentIdr).toBe(120_000_000);
    expect(senior.detachmentIdr).toBe(390_000_000);
  });
});

describe("remainingCapacityIdr", () => {
  test("counts only subscriptions in the same tranche", () => {
    const subs = [subscription("SENIOR", 100_000_000), subscription("JUNIOR", 20_000_000)];
    expect(remainingCapacityIdr(senior, subs)).toBe(170_000_000);
    expect(remainingCapacityIdr(junior, subs)).toBe(100_000_000);
  });
});

describe("screenSubscription", () => {
  test("accepts an eligible investor within capacity", () => {
    const r = screenSubscription(investor(), senior, 50_000_000, []);
    expect(r.ok).toBe(true);
  });

  test("refuses an investor who is not allowlisted, and says why", () => {
    const r = screenSubscription(
      investor({ allowlisted: false, standing: "KYB incomplete" }),
      senior, 50_000_000, [],
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected refusal");
    expect(r.refusal.code).toBe("not_allowlisted");
  });

  test("refuses a tranche outside the investor's mandate", () => {
    const r = screenSubscription(investor({ mandate: ["SENIOR"] }), junior, 50_000_000, []);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected refusal");
    expect(r.refusal.code).toBe("mandate_excludes_tranche");
  });

  test("refuses below the minimum ticket", () => {
    const r = screenSubscription(investor(), senior, 9_999_999, []);
    if (r.ok) throw new Error("expected refusal");
    expect(r.refusal.code).toBe("below_minimum_ticket");
  });

  test("refuses above the maximum ticket", () => {
    const r = screenSubscription(investor({ ticketIdr: { min: 1, max: 40_000_000 } }), senior, 41_000_000, []);
    if (r.ok) throw new Error("expected refusal");
    expect(r.refusal.code).toBe("above_maximum_ticket");
  });

  test("refuses more than the tranche has left", () => {
    const r = screenSubscription(investor(), junior, 40_000_000, [subscription("JUNIOR", 100_000_000)]);
    if (r.ok) throw new Error("expected refusal");
    expect(r.refusal.code).toBe("exceeds_remaining_capacity");
    if (r.refusal.code !== "exceeds_remaining_capacity") throw new Error("narrowing");
    expect(r.refusal.remainingIdr).toBe(20_000_000);
  });

  test("checks the allowlist before the mandate", () => {
    const r = screenSubscription(
      investor({ allowlisted: false, mandate: ["SENIOR"] }),
      junior, 50_000_000, [],
    );
    if (r.ok) throw new Error("expected refusal");
    expect(r.refusal.code).toBe("not_allowlisted");
  });
});
