import { $ } from "bun";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ESrg, EligibilityProof, FinancingRequest, Intake, ProofEngine } from "@anora/core";
import { registryEntry } from "./registry";

const CIRCUIT_DIR = join(import.meta.dir, "../../../../../circuits/eligibility");
const SUPPLIER_SLOTS = 8;

const hex = (buffer: Buffer): string => `0x${buffer.toString("hex")}`;

const fields = (buffer: Buffer): string[] => {
  const out: string[] = [];
  for (let i = 0; i < buffer.length; i += 32) out.push(hex(buffer.subarray(i, i + 32)));
  return out;
};

const proverToml = (
  req: FinancingRequest,
  esrg: ESrg,
  intakes: Intake[],
  entry: NonNullable<ReturnType<typeof registryEntry>>,
): string => {
  const padded = Array.from({ length: SUPPLIER_SLOTS }, (_, i) => String(intakes[i]?.madeTeaKg ?? 0));
  return [
    `registry_root = "${entry.registryRoot}"`,
    `receipt_key = "${entry.receiptKey}"`,
    `mandate_hash = "${entry.mandateHash}"`,
    `epoch = "${req.epoch}"`,
    `collateral_value_idr = "${esrg.valueIdr}"`,
    `requested_principal_idr = "${req.requestedIdr}"`,
    `policy_ltv_bp = "${req.maxLtvBp}"`,
    `policy_max_tenor_days = "90"`,
    `requested_tenor_days = "${req.maturityDays}"`,
    `secret = "${entry.secret}"`,
    `nullifier_key = "${entry.nullifierKey}"`,
    `receipt_id = "${entry.receiptId}"`,
    `quantity_kg = "${esrg.quantityKg}"`,
    `intakes = [${padded.map((k) => `"${k}"`).join(", ")}]`,
    `path = [${entry.path.map((p) => `"${p}"`).join(", ")}]`,
    `index = "${entry.index}"`,
    `mandate_preimage = "${entry.mandatePreimage}"`,
  ].join("\n");
};

export function liveProofEngine(verifierAddress: string, rpcUrl: string): ProofEngine {
  return {
    async prove(req: FinancingRequest, esrg: ESrg, intakes: Intake[]): Promise<EligibilityProof> {
      const entry = registryEntry(esrg.id);
      if (!entry) throw new Error(`${esrg.id} has no registry commitment`);

      const work = await mkdtemp(join(tmpdir(), "anora-proof-"));
      await cp(join(CIRCUIT_DIR, "Nargo.toml"), join(work, "Nargo.toml"));
      await cp(join(CIRCUIT_DIR, "src"), join(work, "src"), { recursive: true });
      await writeFile(join(work, "Prover.toml"), proverToml(req, esrg, intakes, entry));

      await $`nargo execute`.cwd(work).quiet();
      await $`bb write_vk -b target/eligibility.json -o . --oracle_hash keccak`.cwd(work).quiet();
      await $`bb prove -b target/eligibility.json -w target/eligibility.gz -k vk -o . --oracle_hash keccak`
        .cwd(work).quiet();

      const proof = await readFile(join(work, "proof"));
      const publicInputs = fields(await readFile(join(work, "public_inputs")));

      return {
        proofHex: hex(proof),
        publicInputs,
        nullifier: publicInputs[publicInputs.length - 1]!,
        checks: [
          { label: "Intakes sum to the receipt quantity", pass: true },
          { label: "Principal within policy LTV", pass: true },
          { label: "Tenor within policy", pass: true },
          { label: "Receipt is in the registry root", pass: true },
          { label: "Proof bound to this receipt key", pass: true },
          { label: "Mandate hash matches", pass: true },
        ],
      };
    },

    async verifyOnChain(proof: EligibilityProof): Promise<{ ok: boolean; gasUsed?: number }> {
      const selector = "0xea50d0e4";
      const encoded = encodeVerify(proof);
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: verifierAddress, data: selector + encoded }, "latest"],
        }),
      });
      const body = await response.json() as { result?: string; error?: { message: string } };
      if (body.error) throw new Error(body.error.message);
      return { ok: BigInt(body.result ?? "0x0") === 1n };
    },
  };
}

function encodeVerify(proof: EligibilityProof): string {
  const proofBytes = proof.proofHex.slice(2);
  const word = (n: number | bigint) => n.toString(16).padStart(64, "0");
  const inputs = proof.publicInputs.map((i) => i.slice(2).padStart(64, "0")).join("");
  const proofOffset = 64;
  const inputsOffset = 96 + Math.ceil(proofBytes.length / 64) * 32;
  return [
    word(proofOffset),
    word(inputsOffset),
    word(proofBytes.length / 2),
    proofBytes.padEnd(Math.ceil(proofBytes.length / 64) * 64, "0"),
    word(proof.publicInputs.length),
    inputs,
  ].join("");
}
