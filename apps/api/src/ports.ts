import type { Ports } from "@anora/core";
import { mockPorts } from "./adapters/mock/index";
import { liveProofEngine } from "./adapters/live/proof";
import { makePrivy } from "./adapters/live/privy";
import { liveTokenIssuer } from "./adapters/live/token";
import { unavailableChecker, worldChecker, type EligibilityChecker } from "./adapters/live/world";
import deployed from "../../../contracts/deployed.json";

const RPC_URL = process.env.HEDERA_RPC ?? "https://testnet.hashio.io/api";

export function resolveChecker(): { checker: EligibilityChecker; live: boolean } {
  const appId = process.env.WORLD_APP_ID;
  const rpId = process.env.WORLD_RP_ID;
  const signingKey = process.env.WORLD_RP_SIGNING_KEY;
  if (!appId || !rpId || !signingKey) return { checker: unavailableChecker(), live: false };

  return {
    live: true,
    checker: worldChecker({
      appId: appId as `app_${string}`,
      rpId,
      signingKey,
      action: process.env.WORLD_ACTION ?? "anora-eligibility",
      environment: (process.env.WORLD_ENVIRONMENT ?? "sandbox") as "sandbox",
      returnTo: process.env.PUBLIC_URL ?? "https://anora.dimsky.xyz",
    }),
  };
}

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

  const chainKey = process.env.HEDERA_PRIVATE_KEY;
  if (process.env.ADAPTER_TOKEN === "live" && chainKey) {
    ports.token = liveTokenIssuer({
      rpcUrl: RPC_URL,
      privateKey: chainKey,
      explorer: "https://hashscan.io/testnet",
    });
    rewrite.set("token", {
      mode: "testnet",
      because: "A permissioned note is deployed per facility; allocation and activation are on-chain",
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
