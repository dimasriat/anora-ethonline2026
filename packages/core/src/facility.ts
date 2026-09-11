import type { Investor, Subscription, TrancheName, TrancheTerms } from "./domain";

export type Fraction = { numerator: number; denominator: number };

export type FacilityPolicy = {
  maxLtvBp: number;
  issued: Fraction;
  juniorShare: Fraction;
  seniorReturnBp: number;
  juniorReturnBp: number;
};

export const ANORA_POLICY: FacilityPolicy = {
  maxLtvBp: 7_000,
  issued: { numerator: 13, denominator: 14 },
  juniorShare: { numerator: 4, denominator: 13 },
  seniorReturnBp: 200,
  juniorReturnBp: 450,
};

export type Facility = {
  ceilingIdr: number;
  tranches: TrancheTerms[];
};

export type Refusal =
  | { code: "not_allowlisted"; investorId: string; standing: string }
  | { code: "mandate_excludes_tranche"; investorId: string; tranche: TrancheName }
  | { code: "below_minimum_ticket"; minimumIdr: number }
  | { code: "above_maximum_ticket"; maximumIdr: number }
  | { code: "exceeds_remaining_capacity"; remainingIdr: number };

export type Screening = { ok: true } | { ok: false; refusal: Refusal };

export function facilityFrom(collateralValueIdr: number, policy: FacilityPolicy): Facility {
  const ceilingIdr = Math.floor((collateralValueIdr * policy.maxLtvBp) / 10_000);
  const issuedIdr = Math.floor((ceilingIdr * policy.issued.numerator) / policy.issued.denominator);
  const juniorIdr = Math.ceil((issuedIdr * policy.juniorShare.numerator) / policy.juniorShare.denominator);

  const bands: { name: TrancheName; capacityIdr: number; returnBp: number }[] = [
    { name: "JUNIOR", capacityIdr: juniorIdr, returnBp: policy.juniorReturnBp },
    { name: "SENIOR", capacityIdr: issuedIdr - juniorIdr, returnBp: policy.seniorReturnBp },
  ];

  let attachmentIdr = 0;
  const tranches: TrancheTerms[] = [];
  for (const { name, capacityIdr, returnBp } of bands) {
    tranches.unshift({
      name,
      capacityIdr,
      returnBp,
      attachmentIdr,
      detachmentIdr: attachmentIdr + capacityIdr,
    });
    attachmentIdr += capacityIdr;
  }
  return { ceilingIdr, tranches };
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
