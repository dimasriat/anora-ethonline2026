/**
 * ANO-24's normative integer arithmetic, in BigInt.
 *
 * Every number the workspace shows about a facility is derived here rather
 * than in a component, for two reasons. The spec is explicit that these are
 * exact integer rules — `Math.round(face / (1 + y * t))` agrees with §4 on
 * most inputs and disagrees at the ties, and a screen that disagrees with the
 * controller by one rupiah is worse than a screen that shows nothing. And the
 * controller does not exist yet, so until it does this module is the only
 * thing standing between the interface and invented numbers.
 *
 * Fixture values live in tests, never here: §0 is emphatic that the worked
 * examples are regression cases, not defaults. Nothing in this file knows
 * what 270,000,000 means.
 */

/** Basis points. */
export const B = 10_000n;
/** ACT/365. */
const YEAR_DAYS = 365n;
/** Quantity is grams; price is rupiah per kilogram. */
const GRAMS_PER_KG = 1_000n;

const floorDiv = (n: bigint, d: bigint): bigint => n / d;
const ceilDiv = (n: bigint, d: bigint): bigint => n / d + (n % d === 0n ? 0n : 1n);
const max = (a: bigint, b: bigint): bigint => (a > b ? a : b);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const clamp = (value: bigint, low: bigint, high: bigint): bigint => min(max(value, low), high);

/* ── §4 Discounted issue price ─────────────────────────────────────────── */

/**
 * Nearest rupiah, ties upward. The tie rule is normative and is the whole
 * reason this is not a division: `2 × remainder ≥ divisor` rounds a half up
 * where an unqualified floor would silently favour the issuer every time.
 */
export function purchase(faceIdr: bigint, yieldBp: bigint, termDays: bigint): bigint {
  if (faceIdr < 0n || yieldBp < 0n || termDays <= 0n) {
    throw new RangeError("purchase needs a non-negative face, non-negative yield and a positive term");
  }
  const n = faceIdr * B * YEAR_DAYS;
  const d = B * YEAR_DAYS + yieldBp * termDays;
  const quotient = n / d;
  return 2n * (n % d) >= d ? quotient + 1n : quotient;
}

export const discount = (faceIdr: bigint, yieldBp: bigint, termDays: bigint): bigint =>
  faceIdr - purchase(faceIdr, yieldBp, termDays);

/**
 * What a new commitment of `addedFace` costs on top of what this tranche has
 * already sold. Charging `purchase(added)` on its own would let a buyer split
 * one ticket into many and keep the rounding; telescoping the cumulative price
 * makes the sum of the charges equal `purchase(total)` exactly.
 */
export function chargeFor(
  cumulativeFaceIdr: bigint,
  addedFaceIdr: bigint,
  yieldBp: bigint,
  termDays: bigint,
): bigint {
  return purchase(cumulativeFaceIdr + addedFaceIdr, yieldBp, termDays)
    - purchase(cumulativeFaceIdr, yieldBp, termDays);
}

/* ── §2 Collateral reconciliation, headroom, impairment ────────────────── */

export type Reconciliation = {
  /** The lower of the two quantities, in grams. The higher one is a claim. */
  effectiveGrams: bigint;
  differenceGrams: bigint;
  toleranceBp: bigint;
  accepted: boolean;
};

/** Compared as a cross-product, so the tolerance test never rounds. */
export function reconcile(registryGrams: bigint, warehouseGrams: bigint, toleranceBp: bigint): Reconciliation {
  const high = max(registryGrams, warehouseGrams);
  const low = min(registryGrams, warehouseGrams);
  return {
    effectiveGrams: low,
    differenceGrams: high - low,
    toleranceBp,
    accepted: B * (high - low) <= toleranceBp * high,
  };
}

/** C = ⌊Q × P × (B − h) / (W × B)⌋ */
export function eligibleCollateral(quantityGrams: bigint, priceIdrPerKg: bigint, haircutBp: bigint): bigint {
  return floorDiv(quantityGrams * priceIdrPerKg * (B - haircutBp), GRAMS_PER_KG * B);
}

/** Fmax = ⌊C × λ / B⌋ */
export const faceCeiling = (collateralIdr: bigint, maxLtvBp: bigint): bigint =>
  floorDiv(collateralIdr * maxLtvBp, B);

export const headroom = (approvedIdr: bigint, ceilingIdr: bigint, issuedIdr: bigint): bigint =>
  max(min(approvedIdr, ceilingIdr) - issuedIdr, 0n);

export const coverageShortfall = (issuedIdr: bigint, ceilingIdr: bigint): bigint =>
  max(issuedIdr - ceilingIdr, 0n);

/** Undefined rather than divided by zero: worthless collateral has no ratio. */
export const issuedLtvBp = (issuedIdr: bigint, collateralIdr: bigint): bigint | null =>
  collateralIdr > 0n ? ceilDiv(issuedIdr * B, collateralIdr) : null;

/** The least collateral that still satisfies the LTV covenant on issued face. */
export const covenantCollateral = (issuedIdr: bigint, maxLtvBp: bigint): bigint | null =>
  maxLtvBp > 0n ? ceilDiv(issuedIdr * B, maxLtvBp) : null;

/* ── §3 Funding gate and sponsor retention ─────────────────────────────── */

/**
 * Senior capacity released by funded Junior. Junior goes first and Senior
 * follows it proportionally — Senior liquidity is never auto-filled.
 */
export function unlockedSenior(juniorFundedIdr: bigint, seniorCapIdr: bigint, juniorCapIdr: bigint): bigint {
  if (juniorCapIdr <= 0n) return 0n;
  return min(seniorCapIdr, floorDiv(seniorCapIdr * clamp(juniorFundedIdr, 0n, juniorCapIdr), juniorCapIdr));
}

/** Ceil: a retention minimum that rounds down is not a minimum. */
export const retainedMinimum = (juniorCapIdr: bigint, retentionBp: bigint): bigint =>
  ceilDiv(juniorCapIdr * retentionBp, B);

/* ── §5 Settlement waterfall ───────────────────────────────────────────── */

export type Waterfall = {
  /** Approved costs actually covered. What is left over is not holder cash. */
  costsPaidIdr: bigint;
  costsUnpaidIdr: bigint;
  availableIdr: bigint;
  seniorPaidIdr: bigint;
  juniorPaidIdr: bigint;
  seniorLossIdr: bigint;
  juniorLossIdr: bigint;
  /** Above total face. Belongs to the issuer, not to the holders. */
  surplusIdr: bigint;
  totalLossIdr: bigint;
};

/**
 * Costs once, Senior before Junior, Junior absorbing first loss. `recovered`
 * is cash actually received — an evidence hash does not fund a claim.
 */
export function waterfall(
  recoveredIdr: bigint,
  approvedCostsIdr: bigint,
  seniorFaceIdr: bigint,
  juniorFaceIdr: bigint,
): Waterfall {
  if (recoveredIdr < 0n || approvedCostsIdr < 0n) throw new RangeError("cash and costs cannot be negative");

  const costsPaidIdr = min(recoveredIdr, approvedCostsIdr);
  const availableIdr = recoveredIdr - costsPaidIdr;
  const totalFace = seniorFaceIdr + juniorFaceIdr;

  const seniorPaidIdr = min(availableIdr, seniorFaceIdr);
  const juniorPaidIdr = min(max(availableIdr - seniorFaceIdr, 0n), juniorFaceIdr);
  const totalLossIdr = max(totalFace - availableIdr, 0n);

  return {
    costsPaidIdr,
    costsUnpaidIdr: approvedCostsIdr - costsPaidIdr,
    availableIdr,
    seniorPaidIdr,
    juniorPaidIdr,
    juniorLossIdr: min(totalLossIdr, juniorFaceIdr),
    seniorLossIdr: min(max(totalLossIdr - juniorFaceIdr, 0n), seniorFaceIdr),
    surplusIdr: max(availableIdr - totalFace, 0n),
    totalLossIdr,
  };
}

/**
 * Loss attachment points, in basis points of frozen face. Derived from the
 * actual outstanding split — never from a prescribed tranche ratio.
 */
export function attachments(seniorFaceIdr: bigint, juniorFaceIdr: bigint) {
  const totalFace = seniorFaceIdr + juniorFaceIdr;
  if (totalFace <= 0n) return null;
  const juniorDetachBp = floorDiv(juniorFaceIdr * B, totalFace);
  return { juniorAttachBp: 0n, juniorDetachBp, seniorAttachBp: juniorDetachBp, seniorDetachBp: B };
}

/* ── §6 Indicative marks ───────────────────────────────────────────────── */

export type Mark = {
  grossRecoveryIdr: bigint;
  availableIdr: bigint;
  seniorNavIdr: bigint;
  juniorNavIdr: bigint;
};

/**
 * Cap before cost: the mark is capped at face *then* costs come off, which is
 * deliberately more conservative than the realised waterfall, where recovery
 * above face can cover costs. §6 requires the difference be disclosed.
 */
export function indicativeMark(
  collateralIdr: bigint,
  recoveryBp: bigint,
  estimatedCostsIdr: bigint,
  seniorFaceIdr: bigint,
  juniorFaceIdr: bigint,
): Mark {
  const grossRecoveryIdr = floorDiv(collateralIdr * recoveryBp, B);
  const totalFace = seniorFaceIdr + juniorFaceIdr;
  const availableIdr = max(min(totalFace, grossRecoveryIdr) - estimatedCostsIdr, 0n);
  return {
    grossRecoveryIdr,
    availableIdr,
    seniorNavIdr: min(seniorFaceIdr, availableIdr),
    juniorNavIdr: min(max(availableIdr - seniorFaceIdr, 0n), juniorFaceIdr),
  };
}

/** Least eligible collateral that still covers all Senior face and its costs. */
export const seniorSafeCollateral = (
  seniorFaceIdr: bigint,
  estimatedCostsIdr: bigint,
  recoveryBp: bigint,
): bigint | null => (recoveryBp > 0n ? ceilDiv((seniorFaceIdr + estimatedCostsIdr) * B, recoveryBp) : null);

/* ── §7 Snapshot claims and dust ───────────────────────────────────────── */

/** One flooring step, against the frozen record-date supply. */
export function holderClaim(trancheePaidIdr: bigint, holderUnits: bigint, supplyAtRecord: bigint): bigint {
  if (supplyAtRecord <= 0n) return 0n;
  return floorDiv(trancheePaidIdr * holderUnits, supplyAtRecord);
}

/**
 * What flooring leaves behind once every eligible holder is accounted for.
 * Strictly below the number of holders with a positive balance, and
 * independent of the order they claim in.
 */
export function dust(trancheePaidIdr: bigint, holderUnits: bigint[], supplyAtRecord: bigint): bigint {
  if (supplyAtRecord <= 0n) return 0n;
  const entitled = holderUnits.reduce(
    (sum, units) => sum + holderClaim(trancheePaidIdr, units, supplyAtRecord),
    0n,
  );
  return trancheePaidIdr - entitled;
}

/* ── §8 Fees ───────────────────────────────────────────────────────────── */

/** Floors, and takes the rate snapshotted on the order — never today's rate. */
export const feeOf = (amountIdr: bigint, feeBp: bigint): bigint => floorDiv(amountIdr * feeBp, B);
