import { describe, expect, it } from "bun:test";
import { propose, type Policy, type Scenario, type StructuringInput } from "./structuring";

/* Every input is declared here. The module under test holds no commercial
   defaults, so a fixture that forgot one would fail rather than inherit one. */

const scenario = (id: string, over: Partial<Scenario> = {}): Scenario => ({
  id,
  quantityRetentionBp: 10_000n,
  priceRetentionBp: 10_000n,
  stressHaircutBp: 0n,
  recoveryBp: 10_000n,
  recoveryCostIdr: 0n,
  evidenceRef: `appraisal/${id}`,
  ...over,
});

const POLICY: Policy = {
  modelVersion: "structuring-1",
  policyHash: "0xpolicy-one",
  validUntil: "2026-12-31",
  maxLtvBp: 7_000n,
  targetLtvBp: 6_500n,
  reconciliationToleranceBp: 50n,
  sponsorRetentionBp: 2_500n,
  maxObservationAgeSeconds: 86_400n,
  faceLimitIdr: 500_000_000n,
  minJuniorBp: 1_000n,
  maxJuniorBp: 4_000n,
  structuralBufferIdr: 5_000_000n,
  scenarios: [
    scenario("base"),
    scenario("mild", {
      quantityRetentionBp: 9_500n, priceRetentionBp: 9_000n, stressHaircutBp: 500n,
      recoveryBp: 9_000n, recoveryCostIdr: 2_000_000n,
    }),
    scenario("severe", {
      quantityRetentionBp: 9_000n, priceRetentionBp: 8_000n, stressHaircutBp: 1_000n,
      recoveryBp: 8_000n, recoveryCostIdr: 5_000_000n,
    }),
  ],
  pricing: {
    baseRateBp: 400n, tenorSpreadBp: 150n, illiquiditySpreadBp: 200n, seniorRiskSpreadBp: 100n,
    juniorSubordinationSpreadBp: 400n, juniorConcentrationSpreadBp: 150n,
    minSeniorYieldBp: 200n, maxSeniorYieldBp: 1_200n,
    minJuniorYieldBp: 400n, maxJuniorYieldBp: 2_000n,
  },
};

const INPUT: StructuringInput = {
  policy: POLICY,
  report: {
    registryGrams: 8_000_000n,
    warehouseGrams: 8_000_000n,
    priceIdrPerKg: 75_000n,
    haircutBp: 0n,
    observedAt: "2026-09-10T08:00:00Z",
    nonce: 7n,
    reportHash: "0xreport-one",
  },
  requestedFaceIdr: 390_000_000n,
  authorizedFaceCeilingIdr: 420_000_000n,
  termDays: 90n,
  upfrontCostsIdr: 3_000_000n,
};

const on = (over: Partial<StructuringInput>): StructuringInput => ({ ...INPUT, ...over });
const withPolicy = (over: Partial<Policy>): StructuringInput => ({ ...INPUT, policy: { ...POLICY, ...over } });

describe("structuring", () => {
  it("sizes Junior from the worst scenario, not the average", () => {
    const { structure, feasible } = propose(INPUT);
    expect(feasible).toBe(true);
    expect(structure!.targetFaceIdr).toBe(390_000_000n);
    expect(structure!.scenarios.find((s) => s.worst)!.scenario.id).toBe("severe");
    expect(structure!.stressAvailableIdr).toBe(306_040_000n);
    expect(structure!.stressLossIdr).toBe(83_960_000n);
    // max(floor of 39,000,000, stress loss + 5,000,000 buffer)
    expect(structure!.juniorRequiredIdr).toBe(88_960_000n);
    expect(structure!.juniorCapIdr + structure!.seniorCapIdr).toBe(structure!.targetFaceIdr);
  });

  it("holds Senior cover at exactly the structural buffer", () => {
    const { structure } = propose(INPUT);
    expect(structure!.stressAvailableIdr)
      .toBe(structure!.seniorCapIdr + POLICY.structuralBufferIdr);
  });

  it("lets the ratio floor bind when the stress does not", () => {
    const safe = withPolicy({ scenarios: [scenario("base")], structuralBufferIdr: 0n });
    const { structure } = propose(safe);
    expect(structure!.stressLossIdr).toBe(0n);
    expect(structure!.juniorCapIdr).toBe(structure!.juniorFloorIdr);
    expect(structure!.juniorCapIdr).toBe(39_000_000n);
  });

  it("never lowers required Junior when recovery worsens", () => {
    const base = propose(INPUT).structure!.juniorRequiredIdr;
    const worse = propose(withPolicy({
      scenarios: [...POLICY.scenarios.slice(0, 2), scenario("severe", {
        quantityRetentionBp: 9_000n, priceRetentionBp: 8_000n, stressHaircutBp: 1_000n,
        recoveryBp: 7_000n, recoveryCostIdr: 5_000_000n,
      })],
    })).structure!.juniorRequiredIdr;
    expect(worse).toBeGreaterThanOrEqual(base);
  });

  it("never lowers required Junior when recovery costs rise", () => {
    const base = propose(INPUT).structure!.juniorRequiredIdr;
    const costly = propose(withPolicy({
      scenarios: POLICY.scenarios.map((s) => ({ ...s, recoveryCostIdr: s.recoveryCostIdr + 1_000_000n })),
    })).structure!.juniorRequiredIdr;
    expect(costly).toBeGreaterThanOrEqual(base);
  });

  it("keeps approved headroom out of the funded target", () => {
    const { structure } = propose(on({ requestedFaceIdr: 100_000_000n }));
    expect(structure!.approvedFaceIdr).toBe(420_000_000n);
    expect(structure!.targetFaceIdr).toBe(100_000_000n);
  });

  it("caps the target at the collateral ceiling, not at the request", () => {
    const { structure } = propose(on({ requestedFaceIdr: 900_000_000n }));
    expect(structure!.faceCeilingIdr).toBe(420_000_000n);
    expect(structure!.targetFaceIdr).toBe(420_000_000n);
  });
});

describe("pricing", () => {
  it("sums the spread components exactly", () => {
    const { pricing } = propose(INPUT);
    expect(pricing!.seniorYieldBp).toBe(850n);
    expect(pricing!.juniorYieldBp).toBe(1_400n);
    expect(pricing!.components.filter((c) => c.tranche === "senior").reduce((n, c) => n + c.bp, 0n))
      .toBe(pricing!.seniorYieldBp);
  });

  it("keeps discounted cash separate from face and nets off upfront costs", () => {
    const { structure, pricing } = propose(INPUT);
    expect(pricing!.seniorCashIdr).toBeLessThan(structure!.seniorCapIdr);
    expect(pricing!.juniorCashIdr).toBeLessThan(structure!.juniorCapIdr);
    expect(pricing!.grossSubscriptionCashIdr).toBe(pricing!.seniorCashIdr + pricing!.juniorCashIdr);
    expect(pricing!.netBorrowerProceedsIdr)
      .toBe(pricing!.grossSubscriptionCashIdr - INPUT.upfrontCostsIdr);
  });

  it("derives different caps and yields from a second valid policy, unchanged code", () => {
    const first = propose(INPUT);
    const second = propose({
      ...INPUT,
      requestedFaceIdr: 200_000_000n,
      authorizedFaceCeilingIdr: 220_000_000n,
      termDays: 120n,
      policy: {
        ...POLICY,
        modelVersion: "structuring-1",
        policyHash: "0xpolicy-two",
        maxLtvBp: 6_000n,
        minJuniorBp: 2_000n,
        maxJuniorBp: 6_000n,
        structuralBufferIdr: 1_000_000n,
        scenarios: [scenario("single", { recoveryBp: 9_500n, recoveryCostIdr: 1_000_000n })],
        pricing: { ...POLICY.pricing, baseRateBp: 500n, juniorSubordinationSpreadBp: 600n },
      },
    });
    expect(second.feasible).toBe(true);
    expect(second.structure!.juniorCapIdr).not.toBe(first.structure!.juniorCapIdr);
    expect(second.pricing!.seniorYieldBp).not.toBe(first.pricing!.seniorYieldBp);
  });
});

describe("infeasibility is reported, never clamped", () => {
  const codes = (input: StructuringInput) => propose(input).reasons.map((r) => r.code);

  it("refuses a structure the Junior maximum cannot hold", () => {
    const tight = withPolicy({ maxJuniorBp: 2_000n });
    expect(propose(tight).feasible).toBe(false);
    expect(codes(tight)).toContain("junior_requirement_above_maximum");
    // The caps are still returned, so the screen can show what was rejected.
    expect(propose(tight).structure!.juniorRequiredIdr).toBeGreaterThan(propose(tight).structure!.juniorMaximumIdr);
  });

  it("refuses a target that stress wipes out entirely", () => {
    const ruinous = withPolicy({
      scenarios: [scenario("total", { recoveryBp: 0n })],
      minJuniorBp: 1_000n,
      maxJuniorBp: 9_000n,
    });
    expect(codes(ruinous)).toContain("junior_requirement_exceeds_target");
  });

  it("refuses a breached reconciliation before it sizes anything", () => {
    const drifted = on({ report: { ...INPUT.report, warehouseGrams: 7_000_000n } });
    expect(codes(drifted)).toContain("reconciliation_breached");
    expect(propose(drifted).structure).toBeNull();
  });

  it("refuses a quote outside its permitted band", () => {
    const rich = withPolicy({ pricing: { ...POLICY.pricing, maxSeniorYieldBp: 800n } });
    expect(codes(rich)).toContain("senior_yield_out_of_bounds");
  });

  it("refuses short proceeds instead of raising the caps", () => {
    const short = on({ borrowerMinimumNetProceedsIdr: 500_000_000n });
    const result = propose(short);
    expect(result.feasible).toBe(false);
    expect(result.reasons.map((r) => r.code)).toContain("below_minimum_net_proceeds");
    expect(result.structure!.targetFaceIdr).toBe(propose(INPUT).structure!.targetFaceIdr);
  });

  it("refuses upfront costs the subscription cannot carry", () => {
    expect(codes(on({ upfrontCostsIdr: 900_000_000n }))).toContain("upfront_costs_exceed_subscription");
  });

  it("refuses a policy whose Junior bounds are not ordered", () => {
    expect(codes(withPolicy({ minJuniorBp: 5_000n, maxJuniorBp: 4_000n }))).toContain("junior_bounds_invalid");
  });
});
