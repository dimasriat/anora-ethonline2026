export type FacilityClaims = {
  seniorPrincipalIdr: number;
  juniorPrincipalIdr: number;
  seniorReturnIdr: number;
  juniorReturnIdr: number;
};

export type Distribution = {
  seniorReturnIdr: number;
  seniorPrincipalIdr: number;
  juniorReturnIdr: number;
  juniorPrincipalIdr: number;
  residualIdr: number;
};

export type LossBand = {
  attachmentIdr: number;
  detachmentIdr: number;
};

const take = (available: number, due: number): number => Math.min(Math.max(available, 0), due);

export function distribute(cashIdr: number, claims: FacilityClaims): Distribution {
  if (cashIdr < 0) throw new Error("cash cannot be negative");

  const seniorReturnIdr = take(cashIdr, claims.seniorReturnIdr);
  let left = cashIdr - seniorReturnIdr;

  const seniorPrincipalIdr = take(left, claims.seniorPrincipalIdr);
  left -= seniorPrincipalIdr;

  const juniorReturnIdr = take(left, claims.juniorReturnIdr);
  left -= juniorReturnIdr;

  const juniorPrincipalIdr = take(left, claims.juniorPrincipalIdr);
  left -= juniorPrincipalIdr;

  return {
    seniorReturnIdr,
    seniorPrincipalIdr,
    juniorReturnIdr,
    juniorPrincipalIdr,
    residualIdr: left,
  };
}

export function allocateLoss(totalLossIdr: number, band: LossBand): number {
  const above = Math.max(totalLossIdr - band.attachmentIdr, 0);
  return Math.min(above, band.detachmentIdr - band.attachmentIdr);
}
