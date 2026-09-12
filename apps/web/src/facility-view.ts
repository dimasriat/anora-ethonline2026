/**
 * What the workspace knows about a facility, in ANO-24's shape.
 *
 * Most of this is derived in the browser from what the API returns. That is a
 * legitimate thing for a screen to do, since the arithmetic is the normative
 * arithmetic, but it is not the same as a number the chain enforces, and a
 * screen that cannot tell the two apart claims more than it has. So every
 * block carries its provenance and the interface prints it.
 *
 * Each `derived` block is replaced by a `controller` one as the controller
 * takes over, and nothing above this file has to change shape.
 */
import type { Band, ESrg, Flow, Position, TrancheName } from "./api";
import {
  attachments, coverageShortfall, covenantCollateral, dust, eligibleCollateral, faceCeiling,
  feeOf, headroom, holderClaim, issuedLtvBp, propose, reconcile, retainedMinimum,
  unlockedSenior, waterfall, DEMONSTRATION_TERM_DAYS, DEMONSTRATION_UPFRONT_COSTS_IDR,
} from "@anora/core";
import type { CollateralReport, Policy, Proposal } from "@anora/core";

/**
 * Where a number came from. The interface renders this next to the number,
 * so nothing on screen is mistaken for enforced state.
 */
export type Provenance =
  /** Read back from the Hedera controller. Enforced. */
  | "controller"
  /** Returned by the Anora API. */
  | "server"
  /** Computed here from server inputs, with ANO-24's integer rules. */
  | "derived"
  /** A value a role supplied in this window, before the controller accepts it. */
  | "local";

export const PROVENANCE_COPY: Record<Provenance, string> = {
  controller: "Enforced on Hedera",
  server: "From the Anora API",
  derived: "Computed in this window from API inputs",
  local: "Entered here; not yet written to the controller",
};

const GRAMS_PER_KG = 1_000n;
const big = (value: number | undefined | null): bigint => BigInt(Math.trunc(value ?? 0));

/* ── Collateral ────────────────────────────────────────────────────────── */

export type CollateralState =
  | "healthy"
  | "reduced_headroom"
  | "coverage_breach"
  | "reconciliation_breach";

export type CollateralView = {
  report: CollateralReport;
  reconciliation: ReturnType<typeof reconcile>;
  collateralIdr: bigint;
  faceCeilingIdr: bigint;
  approvedFaceIdr: bigint;
  issuedFaceIdr: bigint;
  headroomIdr: bigint;
  coverageShortfallIdr: bigint;
  issuedLtvBp: bigint | null;
  covenantCollateralIdr: bigint | null;
  state: CollateralState;
  provenance: Provenance;
};

/**
 * The receipt as an observation. The API carries one quantity and one value,
 * so the registry and warehouse counts start equal and the price divides out
 * exactly; a role can then vary the warehouse count to exercise the
 * reconciliation path the controller owns.
 */
export function observationFrom(esrg: ESrg | null, haircutBp: bigint): CollateralReport {
  const quantityGrams = big(esrg?.quantityKg) * GRAMS_PER_KG;
  const quantityKg = big(esrg?.quantityKg);
  return {
    registryGrams: quantityGrams,
    warehouseGrams: quantityGrams,
    priceIdrPerKg: quantityKg > 0n ? big(esrg?.valueIdr) / quantityKg : 0n,
    haircutBp,
    observedAt: esrg?.issuedAt ?? "",
    nonce: 0n,
    reportHash: esrg?.documentHash ?? "",
  };
}

export function collateralView(
  report: CollateralReport,
  policy: Policy,
  approvedFaceIdr: bigint,
  issuedFaceIdr: bigint,
  provenance: Provenance,
): CollateralView {
  const reconciliation = reconcile(report.registryGrams, report.warehouseGrams, policy.reconciliationToleranceBp);
  const collateralIdr = eligibleCollateral(reconciliation.effectiveGrams, report.priceIdrPerKg, report.haircutBp);
  const faceCeilingIdr = faceCeiling(collateralIdr, policy.maxLtvBp);
  const shortfall = coverageShortfall(issuedFaceIdr, faceCeilingIdr);

  /* A decline that eats headroom is not yet a coverage breach, and a breach
     must persist and restrict rather than be refused for being bad news. */
  const state: CollateralState = !reconciliation.accepted
    ? "reconciliation_breach"
    : shortfall > 0n
      ? "coverage_breach"
      : faceCeilingIdr < approvedFaceIdr
        ? "reduced_headroom"
        : "healthy";

  return {
    report,
    reconciliation,
    collateralIdr,
    faceCeilingIdr,
    approvedFaceIdr,
    issuedFaceIdr,
    headroomIdr: headroom(approvedFaceIdr, faceCeilingIdr, issuedFaceIdr),
    coverageShortfallIdr: shortfall,
    issuedLtvBp: issuedLtvBp(issuedFaceIdr, collateralIdr),
    covenantCollateralIdr: covenantCollateral(issuedFaceIdr, policy.maxLtvBp),
    state,
    provenance,
  };
}

export const COLLATERAL_STATE_COPY: Record<CollateralState, { label: string; tone: "success" | "warning" | "danger"; detail: string }> = {
  healthy: {
    label: "Within policy", tone: "success",
    detail: "Reconciled, and the collateral ceiling still covers the approved face.",
  },
  reduced_headroom: {
    label: "Headroom reduced", tone: "warning",
    detail: "The ceiling has fallen below the approved face. Issued face is still covered; new issuance is limited.",
  },
  coverage_breach: {
    label: "Coverage breach", tone: "danger",
    detail: "Issued face now exceeds the collateral ceiling. The observation stands, new funding stops and transfers are restricted.",
  },
  reconciliation_breach: {
    label: "Reconciliation breach", tone: "danger",
    detail: "Registry and warehouse counts differ by more than the tolerance. Nothing may be issued against this report.",
  },
};

/* ── Structuring ───────────────────────────────────────────────────────── */

export type FacilityProposal = Proposal & {
  provenance: Provenance;
  /** True once the controller has locked these terms. */
  locked: boolean;
};

export function proposalFor(
  report: CollateralReport,
  policy: Policy,
  requestedFaceIdr: bigint,
  authorizedFaceCeilingIdr: bigint,
): FacilityProposal {
  const proposal = propose({
    policy,
    report,
    requestedFaceIdr,
    authorizedFaceCeilingIdr,
    termDays: DEMONSTRATION_TERM_DAYS,
    upfrontCostsIdr: DEMONSTRATION_UPFRONT_COSTS_IDR,
  });
  return { ...proposal, provenance: "derived", locked: false };
}

/* ── Funding gate ──────────────────────────────────────────────────────── */

export type GateView = {
  seniorCapIdr: bigint;
  juniorCapIdr: bigint;
  juniorFundedIdr: bigint;
  seniorFundedIdr: bigint;
  seniorUnlockedIdr: bigint;
  seniorRemainingIdr: bigint;
  sponsorRetentionIdr: bigint;
  /** Senior taken beyond what funded Junior has unlocked. Must never happen. */
  gateBreached: boolean;
  provenance: Provenance;
};

export function gateView(bands: Band[], policy: Policy): GateView | null {
  const senior = bands.find((band) => band.name === "SENIOR");
  const junior = bands.find((band) => band.name === "JUNIOR");
  if (!senior || !junior) return null;

  const seniorCapIdr = big(senior.capacityIdr);
  const juniorCapIdr = big(junior.capacityIdr);
  const juniorFundedIdr = big(junior.subscribedIdr);
  const seniorFundedIdr = big(senior.subscribedIdr);
  const seniorUnlockedIdr = unlockedSenior(juniorFundedIdr, seniorCapIdr, juniorCapIdr);

  return {
    seniorCapIdr,
    juniorCapIdr,
    juniorFundedIdr,
    seniorFundedIdr,
    seniorUnlockedIdr,
    seniorRemainingIdr: seniorUnlockedIdr > seniorFundedIdr ? seniorUnlockedIdr - seniorFundedIdr : 0n,
    sponsorRetentionIdr: retainedMinimum(juniorCapIdr, policy.sponsorRetentionBp),
    /* The cross-product form, so the check never rounds. */
    gateBreached: seniorFundedIdr * juniorCapIdr > seniorCapIdr * juniorFundedIdr,
    provenance: "derived",
  };
}

/* ── Settlement ────────────────────────────────────────────────────────── */

export type HolderClaim = {
  investorId: string;
  tranche: TrancheName;
  unitsIdr: bigint;
  claimIdr: bigint;
};

export type SettlementView = {
  recoveredIdr: bigint;
  approvedCostsIdr: bigint;
  result: ReturnType<typeof waterfall>;
  seniorFaceIdr: bigint;
  juniorFaceIdr: bigint;
  attachments: ReturnType<typeof attachments>;
  claims: HolderClaim[];
  dustIdr: bigint;
  /** Entitlements no holder has claimed yet. A liability, not dust. */
  reservedIdr: bigint;
  provenance: Provenance;
};

/**
 * Frozen face and record-date supply come from the subscribed book, and every
 * claim floors once against the original supply — never against a supply that
 * earlier redemptions have shrunk.
 */
export function settlementView(
  bands: Band[],
  positions: Position[],
  recoveredIdr: bigint,
  approvedCostsIdr: bigint,
  provenance: Provenance,
): SettlementView | null {
  const senior = bands.find((band) => band.name === "SENIOR");
  const junior = bands.find((band) => band.name === "JUNIOR");
  if (!senior || !junior) return null;

  const seniorFaceIdr = big(senior.subscribedIdr);
  const juniorFaceIdr = big(junior.subscribedIdr);
  const result = waterfall(recoveredIdr, approvedCostsIdr, seniorFaceIdr, juniorFaceIdr);

  const supply = { SENIOR: seniorFaceIdr, JUNIOR: juniorFaceIdr };
  const paid = { SENIOR: result.seniorPaidIdr, JUNIOR: result.juniorPaidIdr };

  const claims = positions.map((position) => ({
    investorId: position.investorId,
    tranche: position.tranche,
    unitsIdr: big(position.unitsIdr),
    claimIdr: holderClaim(paid[position.tranche], big(position.unitsIdr), supply[position.tranche]),
  }));

  const dustIdr = (["SENIOR", "JUNIOR"] as TrancheName[]).reduce((total, name) => total + dust(
    paid[name],
    positions.filter((p) => p.tranche === name).map((p) => big(p.unitsIdr)),
    supply[name],
  ), 0n);

  return {
    recoveredIdr,
    approvedCostsIdr,
    result,
    seniorFaceIdr,
    juniorFaceIdr,
    attachments: attachments(seniorFaceIdr, juniorFaceIdr),
    claims,
    dustIdr,
    reservedIdr: claims.reduce((total, claim) => total + claim.claimIdr, 0n),
    provenance,
  };
}


/* ── Secondary sales and distributions ─────────────────────────────────── */

export type SaleQuote = {
  unitsIdr: bigint;
  grossPriceIdr: bigint;
  feeBp: bigint;
  feeIdr: bigint;
  sellerReceivesIdr: bigint;
  buyerDebitIdr: bigint;
};

/** Fee floors against the rate snapshotted when the order was created. */
export function saleQuote(unitsIdr: bigint, grossPriceIdr: bigint, feeBp: bigint): SaleQuote {
  const feeIdr = feeOf(grossPriceIdr, feeBp);
  return {
    unitsIdr,
    grossPriceIdr,
    feeBp,
    feeIdr,
    sellerReceivesIdr: grossPriceIdr - feeIdr,
    buyerDebitIdr: grossPriceIdr,
  };
}

export type DistributionView = {
  grossIdr: bigint;
  feeBp: bigint;
  feeIdr: bigint;
  netIdr: bigint;
  entitlements: { investorId: string; unitsIdr: bigint; amountIdr: bigint }[];
  dustIdr: bigint;
};

/**
 * Pro rata on the record-date snapshot. The eligibility set and the
 * denominator freeze together: a holder blocked afterwards defers payment,
 * and their entitlement is never reallocated to anyone else.
 */
export function distributionView(
  grossIdr: bigint,
  feeBp: bigint,
  holders: { investorId: string; unitsIdr: bigint }[],
): DistributionView {
  const feeIdr = feeOf(grossIdr, feeBp);
  const netIdr = grossIdr - feeIdr;
  const supply = holders.reduce((total, holder) => total + holder.unitsIdr, 0n);
  const entitlements = holders.map((holder) => ({
    ...holder,
    amountIdr: holderClaim(netIdr, holder.unitsIdr, supply),
  }));
  return {
    grossIdr,
    feeBp,
    feeIdr,
    netIdr,
    entitlements,
    dustIdr: dust(netIdr, holders.map((holder) => holder.unitsIdr), supply),
  };
}


export function flowIssuedFace(bands: Band[]): bigint {
  return bands.reduce((total, band) => total + big(band.subscribedIdr), 0n);
}

export function flowApprovedFace(flow: Flow | null, bands: Band[]): bigint {
  const capped = bands.reduce((total, band) => total + big(band.capacityIdr), 0n);
  return capped > 0n ? capped : big(flow?.request.requestedIdr);
}
