/**
 * Chosen commercial inputs for the demonstration facility.
 *
 * ANO-24 §0 draws a hard line between immutable accounting constants (B,
 * ACT/365, grams per kilogram and the rounding rules, which live in
 * `tranche-math`) and commercial values, which are supplied. Everything in
 * this file is on the commercial side: a policy someone chose, not a rule the
 * product enforces. It sits in its own file so nothing in the calculation
 * path can reach for it as a default.
 *
 * This is replaced by a policy the controller serves and hashes, and the
 * workspace marks every figure it derives from it.
 */
import type { Policy } from "./structuring";

export const DEMONSTRATION_POLICY: Policy = {
  modelVersion: "anora-structuring-1",
  policyHash: "0x997fe5d1d9ebf0998958c5d94f50a6219a4933cc",
  validUntil: "2026-12-31",
  maxLtvBp: 7_000n,
  reconciliationToleranceBp: 50n,
  sponsorRetentionBp: 2_500n,
  maxObservationAgeSeconds: 86_400n,
  faceLimitIdr: 5_000_000_000n,
  minJuniorBp: 1_000n,
  maxJuniorBp: 4_000n,
  structuralBufferIdr: 5_000_000n,
  scenarios: [
    {
      id: "base",
      quantityRetentionBp: 10_000n, priceRetentionBp: 10_000n, stressHaircutBp: 0n,
      recoveryBp: 10_000n, recoveryCostIdr: 0n,
      evidenceRef: "Reconciled registry and warehouse count, current appraisal",
    },
    {
      id: "mild",
      quantityRetentionBp: 9_500n, priceRetentionBp: 9_000n, stressHaircutBp: 500n,
      recoveryBp: 9_000n, recoveryCostIdr: 2_000_000n,
      evidenceRef: "Seasonal price band, routine shrinkage allowance",
    },
    {
      id: "severe",
      quantityRetentionBp: 9_000n, priceRetentionBp: 8_000n, stressHaircutBp: 1_000n,
      recoveryBp: 8_000n, recoveryCostIdr: 5_000_000n,
      evidenceRef: "Enforced sale under a distressed market, with recovery costs",
    },
  ],
  pricing: {
    baseRateBp: 400n,
    tenorSpreadBp: 150n,
    illiquiditySpreadBp: 200n,
    seniorRiskSpreadBp: 100n,
    juniorSubordinationSpreadBp: 400n,
    juniorConcentrationSpreadBp: 150n,
    minSeniorYieldBp: 200n,
    maxSeniorYieldBp: 1_200n,
    minJuniorYieldBp: 400n,
    maxJuniorYieldBp: 2_000n,
  },
};

/** Fee policy is Compliance-controlled and snapshotted per order. */
export const DEMONSTRATION_FEES = { transferFeeBp: 10n, servicingFeeBp: 50n };

/** The term the demonstration facility quotes against. */
export const DEMONSTRATION_TERM_DAYS = 90n;

/** Approved upfront costs, identified separately so they are never charged twice. */
export const DEMONSTRATION_UPFRONT_COSTS_IDR = 3_000_000n;
