import type { Ports } from "@anora/core";
import { mockPorts } from "./adapters/mock/index";
import { liveProofEngine } from "./adapters/live/proof";
import deployed from "../../../contracts/deployed.json";

const RPC_URL = process.env.HEDERA_RPC ?? "https://testnet.hashio.io/api";

export function resolvePorts(): Ports {
  const ports = mockPorts();
  if (process.env.ADAPTER_PROOF !== "live") return ports;

  return {
    ...ports,
    proof: liveProofEngine(deployed.HonkVerifier, RPC_URL),
    status: () =>
      ports.status().map((row) =>
        row.capability === "proof"
          ? {
              capability: "proof",
              mode: "testnet" as const,
              because: `Real circuit, verified against ${deployed.HonkVerifier} on Hedera testnet`,
            }
          : row,
      ),
  };
}
