import { createHash } from "node:crypto";
import type { Officer, OrgWallet, WalletProvider } from "@anora/core";

export const OFFICERS: Officer[] = [
  { id: "OFF-1", name: "Ketua koperasi", role: "Chair" },
  { id: "OFF-2", name: "Bendahara", role: "Treasurer" },
  { id: "OFF-3", name: "Sekretaris", role: "Secretary" },
];

export const QUORUM_THRESHOLD = 2;

/* The operator is a different organisation from the cooperative, so releasing
   funds answers to its own signers rather than the borrower's board. */
export const COMPLIANCE_OFFICERS: Officer[] = [
  { id: "OPS-1", name: "Petugas kepatuhan", role: "Compliance officer" },
  { id: "OPS-2", name: "Kepala operasi", role: "Head of operations" },
];

export const COMPLIANCE_THRESHOLD = 2;

export function mockWallet(): WalletProvider {
  let issued = 0;

  return {
    async createOrgWallet(officers: Officer[], threshold: number, _displayName?: string): Promise<OrgWallet> {
      issued += 1;
      return {
        walletId: `sim-wallet-${issued}`,
        address: `0x${issued.toString(16).padStart(40, "0")}`,
        quorumId: `sim-quorum-${issued}`,
        threshold,
        officers,
      };
    },

    async signAsOrg(wallet: OrgWallet, signerIds: string[], message: string): Promise<string> {
      if (signerIds.length < wallet.threshold) {
        throw new Error(
          `Number of signatures does not match the wallet's authorization threshold`,
        );
      }
      const digest = createHash("sha256").update(message).digest("hex");
      return `0xsim${digest}`;
    },
  };
}
