import type { Investor, Subscription, TrancheName, TrancheTerms } from "./domain";

const ISSUED_SHARE: { name: TrancheName; numerator: number; returnBp: number }[] = [
  { name: "SENIOR", numerator: 270, returnBp: 200 },
  { name: "JUNIOR", numerator: 120, returnBp: 450 },
];

const CEILING_DENOMINATOR = 420;

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

export function facilityFrom(collateralValueIdr: number, maxLtvBp: number): Facility {
  const ceilingIdr = Math.floor((collateralValueIdr * maxLtvBp) / 10_000);

  let attachmentIdr = 0;
  const tranches: TrancheTerms[] = [];
  for (const { name, numerator, returnBp } of [...ISSUED_SHARE].reverse()) {
    const capacityIdr = Math.floor((ceilingIdr * numerator) / CEILING_DENOMINATOR);
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
