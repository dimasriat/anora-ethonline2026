/**
 * ANO-24's policy-driven structuring and pricing, as the workspace needs to
 * show it: how a requested face becomes a Senior and a Junior cap, and how
 * bounded spread components become two discounted quotes.
 *
 * This is deterministic policy pricing. It is not market clearing, not
 * underwriting, not a rating, and not a promise that Senior is protected —
 * it derives a *proposal* from approved evidence and a versioned policy, and
 * the proposal is worth nothing until someone authorised approves it and the
 * controller locks it. The screens must say so, which is why `Proposal`
 * carries its inputs and its reasons rather than just its outputs.
 *
 * An infeasible structure is a result, not an error: §2 is explicit that a
 * breach must be reported and never clamped away.
 */
import { B, eligibleCollateral, faceCeiling, purchase, reconcile } from "./tranche-math";

const floorDiv = (n: bigint, d: bigint): bigint => n / d;
const ceilDiv = (n: bigint, d: bigint): bigint => n / d + (n % d === 0n ? 0n : 1n);
const max = (a: bigint, b: bigint): bigint => (a > b ? a : b);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/**
 * One underwriting assumption, not an asserted probability.
 *
 * The three retentions and the haircut do different work and must not be read
 * as one number: quantity retention is stock that is not there, price
 * retention is a worse market, and the stress haircut is the discount applied
 * to what remains. Recovery is then what enforcement actually returns, and
 * recovery costs come off that. Collapsing any two of them counts the same
 * loss twice.
 */
export type Scenario = {
  id: string;
  quantityRetentionBp: bigint;
  priceRetentionBp: bigint;
  stressHaircutBp: bigint;
  recoveryBp: bigint;
  recoveryCostIdr: bigint;
  /** What this assumption rests on. Shown with the number, never separately. */
  evidenceRef: string;
};

/** The immutable, versioned rules a proposal is derived under. */
export type Policy = {
  modelVersion: string;
  policyHash: string;
  validUntil: string;
  /** λ: the LTV ceiling on eligible collateral. */
  maxLtvBp: bigint;
  /**
   * The LTV a facility actually issues at, at or below λ.
   *
   * Two different jobs: λ is the line a facility may never cross, this is where
   * it is written. Holding them apart is what leaves headroom between the
   * collateral ceiling and the issued face — unused authority, not funded cash.
   */
  targetLtvBp: bigint;
  /** ε: registry-versus-warehouse reconciliation tolerance. */
  reconciliationToleranceBp: bigint;
  /** ρ: sponsor retention on the Junior cap. */
  sponsorRetentionBp: bigint;
  /** How stale a collateral observation may be, in seconds. */
  maxObservationAgeSeconds: bigint;
  faceLimitIdr: bigint;
  minJuniorBp: bigint;
  maxJuniorBp: bigint;
  structuralBufferIdr: bigint;
  scenarios: Scenario[];
  pricing: PricingPolicy;
};

export type PricingPolicy = {
  baseRateBp: bigint;
  tenorSpreadBp: bigint;
  illiquiditySpreadBp: bigint;
  seniorRiskSpreadBp: bigint;
  juniorSubordinationSpreadBp: bigint;
  juniorConcentrationSpreadBp: bigint;
  minSeniorYieldBp: bigint;
  maxSeniorYieldBp: bigint;
  minJuniorYieldBp: bigint;
  maxJuniorYieldBp: bigint;
};

/** An authorised, reconciled observation of the collateral. */
export type CollateralReport = {
  registryGrams: bigint;
  warehouseGrams: bigint;
  priceIdrPerKg: bigint;
  haircutBp: bigint;
  observedAt: string;
  nonce: bigint;
  reportHash: string;
};

export type StructuringInput = {
  policy: Policy;
  report: CollateralReport;
  /** A face request. A cash need is not a face request and §1 refuses to guess. */
  requestedFaceIdr: bigint;
  authorizedFaceCeilingIdr: bigint;
  termDays: bigint;
  upfrontCostsIdr: bigint;
  borrowerMinimumNetProceedsIdr?: bigint;
};

export type ScenarioResult = {
  scenario: Scenario;
  stressedQuantityGrams: bigint;
  stressedPriceIdrPerKg: bigint;
  stressedCollateralIdr: bigint;
  grossRecoveryIdr: bigint;
  /** Cash this scenario leaves for noteholders, after recovery costs. */
  availableIdr: bigint;
  worst: boolean;
};

export type ReasonCode =
  | "reconciliation_breached"
  | "no_eligible_collateral"
  | "face_request_not_positive"
  | "approved_ceiling_not_positive"
  | "junior_bounds_invalid"
  | "junior_requirement_exceeds_target"
  | "junior_requirement_above_maximum"
  | "senior_not_covered_by_stress"
  | "senior_yield_out_of_bounds"
  | "junior_yield_out_of_bounds"
  | "upfront_costs_exceed_subscription"
  | "below_minimum_net_proceeds";

export type Reason = { code: ReasonCode; detail: string };

export type Structure = {
  effectiveQuantityGrams: bigint;
  reconciliation: ReturnType<typeof reconcile>;
  collateralIdr: bigint;
  faceCeilingIdr: bigint;
  approvedFaceIdr: bigint;
  targetFaceIdr: bigint;
  scenarios: ScenarioResult[];
  stressAvailableIdr: bigint;
  stressLossIdr: bigint;
  juniorFloorIdr: bigint;
  juniorRequiredIdr: bigint;
  juniorMaximumIdr: bigint;
  juniorCapIdr: bigint;
  seniorCapIdr: bigint;
};

export type Pricing = {
  seniorYieldBp: bigint;
  juniorYieldBp: bigint;
  components: { label: string; bp: bigint; tranche: "senior" | "junior" }[];
  seniorCashIdr: bigint;
  juniorCashIdr: bigint;
  grossSubscriptionCashIdr: bigint;
  upfrontCostsIdr: bigint;
  netBorrowerProceedsIdr: bigint;
  termDays: bigint;
};

export type Proposal = {
  feasible: boolean;
  reasons: Reason[];
  structure: Structure | null;
  pricing: Pricing | null;
  input: StructuringInput;
};


/** Worst case across the policy's scenarios. Never an average. */
function runScenarios(
  scenarios: Scenario[],
  quantityGrams: bigint,
  priceIdrPerKg: bigint,
  targetFaceIdr: bigint,
): ScenarioResult[] {
  const results = scenarios.map((scenario) => {
    const stressedQuantityGrams = floorDiv(quantityGrams * scenario.quantityRetentionBp, B);
    const stressedPriceIdrPerKg = floorDiv(priceIdrPerKg * scenario.priceRetentionBp, B);
    const stressedCollateralIdr = eligibleCollateral(
      stressedQuantityGrams,
      stressedPriceIdrPerKg,
      scenario.stressHaircutBp,
    );
    const grossRecoveryIdr = floorDiv(stressedCollateralIdr * scenario.recoveryBp, B);
    const availableIdr = max(min(targetFaceIdr, grossRecoveryIdr) - scenario.recoveryCostIdr, 0n);
    return {
      scenario,
      stressedQuantityGrams,
      stressedPriceIdrPerKg,
      stressedCollateralIdr,
      grossRecoveryIdr,
      availableIdr,
      worst: false,
    };
  });

  const worstIndex = results.reduce(
    (lowest, item, index) => (item.availableIdr < results[lowest]!.availableIdr ? index : lowest),
    0,
  );
  if (results[worstIndex]) results[worstIndex].worst = true;
  return results;
}

function quote(policy: PricingPolicy, structure: Structure, termDays: bigint, upfrontCostsIdr: bigint): Pricing {
  const seniorYieldBp = policy.baseRateBp + policy.tenorSpreadBp
    + policy.illiquiditySpreadBp + policy.seniorRiskSpreadBp;
  const juniorYieldBp = seniorYieldBp
    + policy.juniorSubordinationSpreadBp + policy.juniorConcentrationSpreadBp;

  const seniorCashIdr = structure.seniorCapIdr > 0n
    ? purchase(structure.seniorCapIdr, seniorYieldBp, termDays) : 0n;
  const juniorCashIdr = structure.juniorCapIdr > 0n
    ? purchase(structure.juniorCapIdr, juniorYieldBp, termDays) : 0n;
  const grossSubscriptionCashIdr = seniorCashIdr + juniorCashIdr;

  return {
    seniorYieldBp,
    juniorYieldBp,
    components: [
      { label: "Base rate", bp: policy.baseRateBp, tranche: "senior" },
      { label: "Tenor spread", bp: policy.tenorSpreadBp, tranche: "senior" },
      { label: "Illiquidity spread", bp: policy.illiquiditySpreadBp, tranche: "senior" },
      { label: "Senior risk spread", bp: policy.seniorRiskSpreadBp, tranche: "senior" },
      { label: "Subordination spread", bp: policy.juniorSubordinationSpreadBp, tranche: "junior" },
      { label: "Concentration spread", bp: policy.juniorConcentrationSpreadBp, tranche: "junior" },
    ],
    seniorCashIdr,
    juniorCashIdr,
    grossSubscriptionCashIdr,
    upfrontCostsIdr,
    netBorrowerProceedsIdr: grossSubscriptionCashIdr - upfrontCostsIdr,
    termDays,
  };
}

/**
 * Derive a proposal. Returns `feasible: false` with reasons rather than
 * throwing, and never widens a cap or weakens the policy to make a breach
 * go away.
 */
export function propose(input: StructuringInput): Proposal {
  const { policy, report } = input;
  const reasons: Reason[] = [];

  const reconciliation = reconcile(
    report.registryGrams,
    report.warehouseGrams,
    policy.reconciliationToleranceBp,
  );
  const collateralIdr = eligibleCollateral(
    reconciliation.effectiveGrams,
    report.priceIdrPerKg,
    report.haircutBp,
  );
  const faceCeilingIdr = faceCeiling(collateralIdr, policy.maxLtvBp);

  if (!reconciliation.accepted) {
    reasons.push({
      code: "reconciliation_breached",
      detail: `Registry and warehouse differ by ${reconciliation.differenceGrams} g, outside the ${Number(policy.reconciliationToleranceBp) / 100}% tolerance.`,
    });
  }
  if (collateralIdr <= 0n) {
    reasons.push({ code: "no_eligible_collateral", detail: "Eligible collateral is zero after the haircut." });
  }
  if (input.requestedFaceIdr <= 0n) {
    reasons.push({ code: "face_request_not_positive", detail: "A facility needs an explicit positive face request." });
  }
  if (input.authorizedFaceCeilingIdr <= 0n || policy.faceLimitIdr <= 0n) {
    reasons.push({ code: "approved_ceiling_not_positive", detail: "No authorised exposure limit is in force." });
  }
  if (!(policy.minJuniorBp > 0n && policy.minJuniorBp <= policy.maxJuniorBp && policy.maxJuniorBp < B)) {
    reasons.push({
      code: "junior_bounds_invalid",
      detail: "Policy requires 0 < minimum Junior ≤ maximum Junior < 100%.",
    });
  }
  if (reasons.length > 0) {
    return { feasible: false, reasons, structure: null, pricing: null, input };
  }

  const approvedFaceIdr = min(min(input.authorizedFaceCeilingIdr, policy.faceLimitIdr), faceCeilingIdr);
  const targetFaceIdr = min(input.requestedFaceIdr, approvedFaceIdr);

  const scenarios = runScenarios(
    policy.scenarios,
    reconciliation.effectiveGrams,
    report.priceIdrPerKg,
    targetFaceIdr,
  );
  const stressAvailableIdr = scenarios.reduce(
    (lowest, item) => min(lowest, item.availableIdr),
    scenarios[0]?.availableIdr ?? 0n,
  );
  const stressLossIdr = targetFaceIdr - stressAvailableIdr;

  const juniorFloorIdr = ceilDiv(targetFaceIdr * policy.minJuniorBp, B);
  const juniorRequiredIdr = max(juniorFloorIdr, stressLossIdr + policy.structuralBufferIdr);
  const juniorMaximumIdr = floorDiv(targetFaceIdr * policy.maxJuniorBp, B);
  const juniorCapIdr = juniorRequiredIdr;
  const seniorCapIdr = targetFaceIdr - juniorCapIdr;

  const structure: Structure = {
    effectiveQuantityGrams: reconciliation.effectiveGrams,
    reconciliation,
    collateralIdr,
    faceCeilingIdr,
    approvedFaceIdr,
    targetFaceIdr,
    scenarios,
    stressAvailableIdr,
    stressLossIdr,
    juniorFloorIdr,
    juniorRequiredIdr,
    juniorMaximumIdr,
    juniorCapIdr,
    seniorCapIdr,
  };

  if (!(juniorRequiredIdr > 0n && juniorRequiredIdr < targetFaceIdr)) {
    reasons.push({
      code: "junior_requirement_exceeds_target",
      detail: `Required Junior of ${juniorRequiredIdr} leaves no viable two-tranche structure against a ${targetFaceIdr} target.`,
    });
  }
  if (juniorRequiredIdr > juniorMaximumIdr) {
    reasons.push({
      code: "junior_requirement_above_maximum",
      detail: `Required Junior of ${juniorRequiredIdr} exceeds the policy maximum of ${juniorMaximumIdr}.`,
    });
  }
  /* Redundant by construction: when the buffer branch binds, Senior cover is
     exactly Astress − buffer, and when the ratio floor binds it is larger. §2
     requires the check regardless, and it is cheap insurance against a future
     change to how Jrequired is chosen. */
  if (stressAvailableIdr < seniorCapIdr + policy.structuralBufferIdr) {
    reasons.push({
      code: "senior_not_covered_by_stress",
      detail: `Worst-case cash of ${stressAvailableIdr} does not cover Senior of ${seniorCapIdr} plus the structural buffer.`,
    });
  }
  if (reasons.length > 0) {
    return { feasible: false, reasons, structure, pricing: null, input };
  }

  const pricing = quote(policy.pricing, structure, input.termDays, input.upfrontCostsIdr);
  const bounds = policy.pricing;

  if (pricing.seniorYieldBp < bounds.minSeniorYieldBp || pricing.seniorYieldBp > bounds.maxSeniorYieldBp) {
    reasons.push({
      code: "senior_yield_out_of_bounds",
      detail: `Senior quote of ${Number(pricing.seniorYieldBp) / 100}% falls outside its permitted band.`,
    });
  }
  if (pricing.juniorYieldBp < bounds.minJuniorYieldBp || pricing.juniorYieldBp > bounds.maxJuniorYieldBp) {
    reasons.push({
      code: "junior_yield_out_of_bounds",
      detail: `Junior quote of ${Number(pricing.juniorYieldBp) / 100}% falls outside its permitted band.`,
    });
  }
  if (input.upfrontCostsIdr > pricing.grossSubscriptionCashIdr) {
    reasons.push({
      code: "upfront_costs_exceed_subscription",
      detail: "Approved upfront costs exceed the cash the two tranches raise.",
    });
  }
  if (
    input.borrowerMinimumNetProceedsIdr !== undefined
    && pricing.netBorrowerProceedsIdr < input.borrowerMinimumNetProceedsIdr
  ) {
    reasons.push({
      code: "below_minimum_net_proceeds",
      detail: `Net proceeds of ${pricing.netBorrowerProceedsIdr} fall short of the borrower's stated minimum. Caps are not raised to close the gap.`,
    });
  }

  return { feasible: reasons.length === 0, reasons, structure, pricing, input };
}
