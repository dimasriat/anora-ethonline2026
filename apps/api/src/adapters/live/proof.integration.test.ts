import { describe, expect, test } from "bun:test";
import { liveProofEngine } from "./proof";
import { mockPorts } from "../mock/index";
import deployed from "../../../../../contracts/deployed.json";

const RPC = "https://testnet.hashio.io/api";
const online = process.env.ANORA_INTEGRATION === "1";

describe.skipIf(!online)("live proof engine", () => {
  test("proves and verifies on Hedera testnet", async () => {
    const ports = mockPorts();
    const esrg = (await ports.esrg.get("SRG-TEH-024"))!;
    const intakes = await ports.esrg.intakes(esrg.id);
    const engine = liveProofEngine(deployed.HonkVerifier, RPC);

    const proof = await engine.prove(
      { id: "REQ-1", esrgId: esrg.id, requestedIdr: 420_000_000, maturityDays: 90, maxLtvBp: 7_000, epoch: 1, status: "approved" },
      esrg,
      intakes,
    );

    expect(proof.publicInputs).toHaveLength(10);
    expect(proof.proofHex.length).toBeGreaterThan(1000);

    const verified = await engine.verifyOnChain(proof);
    expect(verified.ok).toBe(true);
  }, 180_000);
});
