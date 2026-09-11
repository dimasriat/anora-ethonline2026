import { $ } from "bun";
import type { RecoverySplit } from "@anora/core";

export type FacilityReader = {
  address: string;
  read(): Promise<OnChainFacility>;
};

export type OnChainFacility = {
  eligibleValueIdr: number;
  issuedFaceIdr: number;
  active: boolean;
  settled: boolean;
  split: RecoverySplit | null;
};

const SENIOR = 0;
const JUNIOR = 1;

export function liveFacilityReader(address: string, rpcUrl: string): FacilityReader {
  const call = async (signature: string, ...args: string[]): Promise<string> =>
    (await $`cast call ${address} ${signature} ${args} --rpc-url ${rpcUrl}`.text()).trim();

  const number = async (signature: string, ...args: string[]): Promise<number> =>
    Number(BigInt((await call(signature, ...args)).split(" ")[0]!));

  const flag = async (signature: string): Promise<boolean> =>
    (await call(signature)) === "true";

  return {
    address,
    async read(): Promise<OnChainFacility> {
      const [eligibleValueIdr, issuedFaceIdr, active, settled] = await Promise.all([
        number("eligibleValueIdr()(uint256)"),
        number("issuedFace()(uint256)"),
        flag("active()(bool)"),
        flag("settled()(bool)"),
      ]);

      if (!settled) return { eligibleValueIdr, issuedFaceIdr, active, settled, split: null };

      const [seniorIdr, juniorIdr, seniorFaceIdr, juniorFaceIdr, surplusIdr] = await Promise.all([
        number("payout(uint8)(uint256)", String(SENIOR)),
        number("payout(uint8)(uint256)", String(JUNIOR)),
        number("frozenFace(uint8)(uint256)", String(SENIOR)),
        number("frozenFace(uint8)(uint256)", String(JUNIOR)),
        number("surplus()(uint256)"),
      ]);

      return {
        eligibleValueIdr,
        issuedFaceIdr,
        active,
        settled,
        split: {
          costsPaidIdr: 0,
          seniorIdr,
          juniorIdr,
          seniorLossIdr: seniorFaceIdr - seniorIdr,
          juniorLossIdr: juniorFaceIdr - juniorIdr,
          surplusIdr,
        },
      };
    },
  };
}
