import { $ } from "bun";
import { join } from "node:path";
import type {
  ESrg, FinancingRequest, Investor, NoteToken, TokenIssuer, TrancheName, TrancheTerms,
} from "@anora/core";

const CONTRACTS_DIR = join(import.meta.dir, "../../../../../contracts");

export type ChainConfig = {
  rpcUrl: string;
  privateKey: string;
  explorer: string;
};

type Deployed = { address: string; partitions: Record<TrancheName, string> };

const keccak = async (label: string): Promise<string> =>
  (await $`cast keccak ${label}`.cwd(CONTRACTS_DIR).text()).trim();

export function liveTokenIssuer(config: ChainConfig): TokenIssuer {
  const notes = new Map<string, NoteToken>();
  const deployed = new Map<string, Deployed>();
  const { rpcUrl, privateKey } = config;

  const gasPrice = async (): Promise<string> =>
    (await $`cast gas-price --rpc-url ${rpcUrl}`.text()).trim();

  /* Hedera's mirror node lags consensus, so a submission can bounce on nonce or
     a transient RPC error. A revert is not transient and is never retried. */
  const TRANSIENT = /nonce|timeout|ECONNRESET|502|503|already known/i;

  const send = async (to: string, signature: string, ...args: string[]): Promise<string> => {
    let last = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const price = await gasPrice();
      const result = await $`cast send ${to} ${signature} ${args} --rpc-url ${rpcUrl} --private-key ${privateKey} --legacy --gas-price ${price} --gas-limit 900000`
        .nothrow().quiet();
      const out = result.stdout.toString() + result.stderr.toString();

      if (/^status\s+1/m.test(out)) {
        return /^transactionHash\s+(0x[0-9a-f]+)/m.exec(out)?.[1] ?? "";
      }
      last = out.trim().slice(-300);
      if (/^status\s+0/m.test(out) || !TRANSIENT.test(out)) break;
      await Bun.sleep(3_000 * attempt);
    }
    throw new Error(`${signature} failed: ${last}`);
  };

  const noteAt = (series: string): NoteToken => {
    const note = notes.get(series);
    if (!note) throw new Error(`unknown note series: ${series}`);
    return note;
  };

  return {
    async issueDraftNote(
      req: FinancingRequest,
      esrg: ESrg,
      tranches: TrancheTerms[],
    ): Promise<NoteToken> {
      const partitions: Record<string, string> = {};
      for (const t of tranches) partitions[t.name] = await keccak(t.name);

      const series = `ANR-${esrg.id.replace("SRG-TEH-", "SRG-")}`;
      const price = await gasPrice();
      const names = tranches.map((t) => partitions[t.name]).join(",");
      const caps = tranches.map((t) => String(t.capacityIdr)).join(",");

      const out = await $`forge create src/AnoraNote.sol:AnoraNote --rpc-url ${rpcUrl} --private-key ${privateKey} --broadcast --legacy --gas-price ${price} --gas-limit 6000000 --constructor-args ${series} ${esrg.id} ${`[${names}]`} ${`[${caps}]`}`
        .cwd(CONTRACTS_DIR).text();

      const address = /Deployed to: (0x[0-9a-fA-F]{40})/.exec(out)?.[1];
      if (!address) throw new Error(`deployment produced no address: ${out.slice(-300)}`);

      deployed.set(series, { address, partitions: partitions as Record<TrancheName, string> });
      const note: NoteToken = {
        series,
        underlying: esrg.id,
        ceilingIdr: req.requestedIdr,
        transferRule: "allowlisted",
        state: "reserved",
        address,
      };
      notes.set(series, note);
      return note;
    },

    async allocate(
      series: string,
      tranche: TrancheName,
      holder: Investor,
      unitsIdr: number,
    ): Promise<void> {
      const target = deployed.get(series);
      if (!target) throw new Error(`unknown note series: ${series}`);

      const allowed = `[${target.partitions[tranche]}]`;
      await send(target.address, "allow(address,bytes32[])", holder.address, allowed);
      await send(
        target.address,
        "allocate(bytes32,address,uint256)",
        target.partitions[tranche],
        holder.address,
        String(unitsIdr),
      );
    },

    async activate(series: string): Promise<NoteToken> {
      const target = deployed.get(series);
      if (!target) throw new Error(`unknown note series: ${series}`);
      await send(target.address, "activate()");
      const next: NoteToken = { ...noteAt(series), state: "active" };
      notes.set(series, next);
      return next;
    },

    async redeem(series: string): Promise<NoteToken> {
      const target = deployed.get(series);
      if (!target) throw new Error(`unknown note series: ${series}`);
      await send(target.address, "redeem()");
      const next: NoteToken = { ...noteAt(series), state: "redeemed" };
      notes.set(series, next);
      return next;
    },
  };
}
