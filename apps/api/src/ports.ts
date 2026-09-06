import type { Ports } from "@anora/core";
import { mockPorts } from "./adapters/mock/index";
import { liveProofEngine } from "./adapters/live/proof";
import { makePrivy } from "./adapters/live/privy";
import deployed from "../../../contracts/deployed.json";

const RPC_URL = process.env.HEDERA_RPC ?? "https://testnet.hashio.io/api";

export function resolvePorts(): Ports {
  const base = mockPorts();
  const ports = { ...base };
  const rewrite = new Map<string, { mode: "live" | "testnet"; because: string }>();

  if (process.env.ADAPTER_PROOF === "live") {
    ports.proof = liveProofEngine(deployed.HonkVerifier, RPC_URL);
    rewrite.set("proof", {
      mode: "testnet",
      because: `Real circuit, verified against ${deployed.HonkVerifier} on Hedera testnet`,
    });
  }

  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (appId && appSecret) {
    ports.wallet = makePrivy({ appId, appSecret });
    rewrite.set("wallet", {
      mode: "live",
      because: "Privy organisation wallet; the key quorum enforces the threshold, not this server",
    });
  }

  ports.status = () =>
    base.status().map((row) => {
      const over = rewrite.get(row.capability);
      return over ? { capability: row.capability, ...over } : row;
    });

  return ports;
}
