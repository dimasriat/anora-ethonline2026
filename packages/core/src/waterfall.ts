export type RecoverySplit = {
  costsPaidIdr: number;
  seniorIdr: number;
  juniorIdr: number;
  seniorLossIdr: number;
  juniorLossIdr: number;
  surplusIdr: number;
};

export function splitRecovery(
  recoveredIdr: number,
  costsIdr: number,
  seniorFaceIdr: number,
  juniorFaceIdr: number,
): RecoverySplit {
  if (recoveredIdr < 0) throw new Error("recovered cannot be negative");
  if (costsIdr < 0) throw new Error("costs cannot be negative");

  const costsPaidIdr = Math.min(costsIdr, recoveredIdr);
  const available = recoveredIdr - costsPaidIdr;

  const seniorIdr = Math.min(available, seniorFaceIdr);
  const afterSenior = available - seniorIdr;
  const juniorIdr = Math.min(afterSenior, juniorFaceIdr);

  return {
    costsPaidIdr,
    seniorIdr,
    juniorIdr,
    seniorLossIdr: seniorFaceIdr - seniorIdr,
    juniorLossIdr: juniorFaceIdr - juniorIdr,
    surplusIdr: afterSenior - juniorIdr,
  };
}
