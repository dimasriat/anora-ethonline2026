import type { ESrg, Investor, Subscription, TrancheName, TrancheTerms } from "./domain";
import { eligibleCollateral, faceCeiling } from "./tranche-math";
import { propose, type CollateralReport, type Policy, type Reason } from "./structuring";

const GRAMS_PER_KG = 1_000n;

export type Facility = {
  ceilingIdr: number;
  /** What is actually issued, at or below the ceiling. The gap is headroom. */
  faceIdr: number;
  tranches: TrancheTerms[];
};

/** Policy refused the structure. It is never widened to make a breach go away. */
export type Derivation =
  | { ok: true; facility: Facility }
  | { ok: false; reasons: Reason[] };

export type Refusal =
  | { code: "not_allowlisted"; investorId: string; standing: string }
  | { code: "mandate_excludes_tranche"; investorId: string; tranche: TrancheName }
  | { code: "below_minimum_ticket"; minimumIdr: number }
  | { code: "above_maximum_ticket"; maximumIdr: number }
  | { code: "exceeds_remaining_capacity"; remainingIdr: number };

export type Screening = { ok: true } | { ok: false; refusal: Refusal };

/**
 * The receipt as an observation. The domain carries one quantity and one value,
 * so the registry and warehouse counts start equal and the price divides out
 * exactly; a role can then vary the warehouse count to exercise the
 * reconciliation path the controller owns.
 */
export function reportFrom(
  esrg: Pick<ESrg, "quantityKg" | "valueIdr" | "issuedAt" | "documentHash">,
  haircutBp: bigint,
): CollateralReport {
  const quantityKg = BigInt(Math.trunc(esrg.quantityKg));
  return {
    registryGrams: quantityKg * GRAMS_PER_KG,
    warehouseGrams: quantityKg * GRAMS_PER_KG,
    priceIdrPerKg: quantityKg > 0n ? BigInt(Math.trunc(esrg.valueIdr)) / quantityKg : 0n,
    haircutBp,
    observedAt: esrg.issuedAt,
    nonce: 0n,
    reportHash: esrg.documentHash,
  };
}

/**
 * Size and price a facility from the receipt and the policy — no fixed split.
 *
 * The ceiling is λ on eligible collateral and is authority, not cash; the face
 * is written at the policy's target LTV, and the gap between them is headroom
 * nobody funds. Junior is then whatever the worst stress scenario plus the
 * structural buffer demands, Senior is what is left, and both yields come off
 * the spread schedule. Every figure is a function of the receipt and the rules.
 *
 * Returns the policy's reasons rather than a facility when the structure is
 * infeasible, so the caller refuses instead of issuing something unsupported.
 */
export function facilityFrom(
  esrg: ESrg,
  policy: Policy,
  termDays: bigint,
  upfrontCostsIdr: bigint,
): Derivation {
  const report = reportFrom(esrg, 0n);
  const collateralIdr = eligibleCollateral(
    report.registryGrams,
    report.priceIdrPerKg,
    report.haircutBp,
  );
  const proposal = propose({
    policy,
    report,
    requestedFaceIdr: faceCeiling(collateralIdr, policy.targetLtvBp),
    authorizedFaceCeilingIdr: faceCeiling(collateralIdr, policy.maxLtvBp),
    termDays,
    upfrontCostsIdr,
  });
  if (!proposal.feasible || !proposal.structure || !proposal.pricing) {
    return { ok: false, reasons: proposal.reasons };
  }
  const { structure, pricing } = proposal;

  /* Junior first so attachment accumulates from the bottom of the stack, then
     unshift to publish Senior first. The order is the loss order. */
  const issued: { name: TrancheName; capacityIdr: bigint; returnBp: bigint }[] = [
    { name: "JUNIOR", capacityIdr: structure.juniorCapIdr, returnBp: pricing.juniorYieldBp },
    { name: "SENIOR", capacityIdr: structure.seniorCapIdr, returnBp: pricing.seniorYieldBp },
  ];
  let attachmentIdr = 0;
  const tranches: TrancheTerms[] = [];
  for (const { name, capacityIdr, returnBp } of issued) {
    const capacity = Number(capacityIdr);
    tranches.unshift({
      name,
      capacityIdr: capacity,
      returnBp: Number(returnBp),
      attachmentIdr,
      detachmentIdr: attachmentIdr + capacity,
    });
    attachmentIdr += capacity;
  }
  return {
    ok: true,
    facility: {
      ceilingIdr: Number(structure.faceCeilingIdr),
      faceIdr: Number(structure.targetFaceIdr),
      tranches,
    },
  };
}

export function remainingCapacityIdr(
  terms: TrancheTerms,
  subscriptions: Subscription[],
): number {
  const taken = subscriptions
    .filter((s) => s.tranche === terms.name)
    .reduce((sum, s) => sum + s.unitsIdr, 0);
  return terms.capacityIdr - taken;
}

export function screenSubscription(
  investor: Investor,
  terms: TrancheTerms,
  unitsIdr: number,
  subscriptions: Subscription[],
): Screening {
  if (!investor.allowlisted) {
    return {
      ok: false,
      refusal: { code: "not_allowlisted", investorId: investor.id, standing: investor.standing },
    };
  }
  if (!investor.mandate.includes(terms.name)) {
    return {
      ok: false,
      refusal: {
        code: "mandate_excludes_tranche",
        investorId: investor.id,
        tranche: terms.name,
      },
    };
  }
  if (unitsIdr < investor.ticketIdr.min) {
    return { ok: false, refusal: { code: "below_minimum_ticket", minimumIdr: investor.ticketIdr.min } };
  }
  if (unitsIdr > investor.ticketIdr.max) {
    return { ok: false, refusal: { code: "above_maximum_ticket", maximumIdr: investor.ticketIdr.max } };
  }

  const remainingIdr = remainingCapacityIdr(terms, subscriptions);
  if (unitsIdr > remainingIdr) {
    return { ok: false, refusal: { code: "exceeds_remaining_capacity", remainingIdr } };
  }
  return { ok: true };
}
