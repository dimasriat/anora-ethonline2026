import { describe, expect, test } from "bun:test";
import { facilityFrom, remainingCapacityIdr, screenSubscription } from "./facility";
import { DEMONSTRATION_POLICY } from "./policy-input";
import type { ESrg, Investor, Subscription } from "./domain";

/** 8.000 kg at Rp 75.000/kg — the worked example, stated as a receipt. */
const receipt = (quantityKg: number, valueIdr: number): ESrg => ({
  id: "SRG-TEST",
  holder: "Koperasi Test",
  warehouse: "Gudang Test",
  commodity: "Tea",
  quantityKg,
  valueIdr,
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  documentHash: "0xtest",
  encumbrance: "none",
});

const derive = (quantityKg: number, valueIdr: number) =>
  facilityFrom(receipt(quantityKg, valueIdr), DEMONSTRATION_POLICY, 90n, 3_000_000n);

const derived = derive(8_000, 600_000_000);
if (!derived.ok) throw new Error("the worked example must be feasible");
const facility = derived.facility;
const senior = facility.tranches.find((t) => t.name === "SENIOR")!;
const junior = facility.tranches.find((t) => t.name === "JUNIOR")!;

const investor = (over: Partial<Investor> = {}): Investor => ({
  id: "INV-TEST",
  name: "Test Capital",
  address: "0x0000000000000000000000000000000000000001",
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
    const smaller = derive(3_024, 226_800_000);
    if (!smaller.ok) throw new Error("expected a feasible structure");
    expect(smaller.facility.ceilingIdr).toBe(158_760_000);
  });

  test("writes the face below the ceiling, leaving authority unissued", () => {
    expect(facility.faceIdr).toBe(390_000_000);
    expect(facility.ceilingIdr - facility.faceIdr).toBe(30_000_000);
    expect(senior.capacityIdr + junior.capacityIdr).toBe(facility.faceIdr);
  });

  test("sizes Junior from the worst scenario, not a fixed share", () => {
    expect(junior.capacityIdr).toBe(88_960_000);
    expect(senior.capacityIdr).toBe(301_040_000);
  });

  test("prices both tranches off the policy's spread schedule", () => {
    expect(senior.returnBp).toBe(850);
    expect(junior.returnBp).toBe(1_400);
  });

  test("stores loss bands rather than implying them from the name", () => {
    expect(junior.attachmentIdr).toBe(0);
    expect(junior.detachmentIdr).toBe(88_960_000);
    expect(senior.attachmentIdr).toBe(88_960_000);
    expect(senior.detachmentIdr).toBe(390_000_000);
  });

  test("refuses rather than sizing a structure the policy will not carry", () => {
    const tiny = derive(1, 1);
    expect(tiny.ok).toBe(false);
    if (tiny.ok) throw new Error("expected a refusal");
    expect(tiny.reasons.length).toBeGreaterThan(0);
  });
});

describe("remainingCapacityIdr", () => {
  test("counts only subscriptions in the same tranche", () => {
    const subs = [subscription("SENIOR", 100_000_000), subscription("JUNIOR", 20_000_000)];
    expect(remainingCapacityIdr(senior, subs)).toBe(201_040_000);
    expect(remainingCapacityIdr(junior, subs)).toBe(68_960_000);
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
    const r = screenSubscription(investor(), junior, 40_000_000, [subscription("JUNIOR", 60_000_000)]);
    if (r.ok) throw new Error("expected refusal");
    expect(r.refusal.code).toBe("exceeds_remaining_capacity");
    if (r.refusal.code !== "exceeds_remaining_capacity") throw new Error("narrowing");
    expect(r.refusal.remainingIdr).toBe(28_960_000);
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
