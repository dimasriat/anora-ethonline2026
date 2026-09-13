import type {
  CapabilityStatus, ESrg, EligibilityProof, FinancingRequest, Intake, Investor,
  NoteToken, Ports, TrancheName, TrancheTerms,
} from "@anora/core";
import { ESRGS, INTAKES } from "./seed";
import { mockWallet } from "./wallet";

const seriesFor = (esrgId: string): string => `ANR-${esrgId.replace("SRG-TEH-", "SRG-")}`;

export function mockPorts(): Ports {
  const notes = new Map<string, NoteToken>();

  const noteAt = (series: string, state: NoteToken["state"]): NoteToken => {
    const note = notes.get(series);
    if (!note) throw new Error(`unknown note series: ${series}`);
    const next = { ...note, state };
    notes.set(series, next);
    return next;
  };

  return {
    esrg: {
      async list(): Promise<ESrg[]> {
        return [...ESRGS];
      },
      async get(id: string): Promise<ESrg | null> {
        return ESRGS.find((e) => e.id === id) ?? null;
      },
      async intakes(esrgId: string): Promise<Intake[]> {
        return INTAKES[esrgId] ?? [];
      },
    },

    registry: {
      async confirmSecurity(esrgId: string, reference: string) {
        return { confirmed: true, ref: `HJ/${esrgId}/${reference}` };
      },
    },

    token: {
      async issueDraftNote(
        req: FinancingRequest,
        esrg: ESrg,
        _tranches: TrancheTerms[],
      ): Promise<NoteToken> {
        const note: NoteToken = {
          series: seriesFor(esrg.id),
          underlying: esrg.id,
          ceilingIdr: req.requestedIdr,
          transferRule: "allowlisted",
          state: "reserved",
        };
        notes.set(note.series, note);
        return note;
      },
      async allocate(
        _series: string,
        _tranche: TrancheName,
        _holder: Investor,
        _unitsIdr: number,
      ): Promise<void> {},

      async activate(series: string): Promise<NoteToken> {
        return noteAt(series, "active");
      },
      async redeem(series: string): Promise<NoteToken> {
        return noteAt(series, "redeemed");
      },
    },

    proof: {
      async prove(): Promise<EligibilityProof> {
        throw new Error("eligibility circuit is not built yet");
      },
      async verifyOnChain() {
        throw new Error("on-chain verification is not wired yet");
      },
    },

    wallet: mockWallet(),

    status(): CapabilityStatus[] {
      return [
        { capability: "esrg", mode: "simulated", because: "No real tea e-SRG exists to use" },
        { capability: "registry", mode: "simulated", because: "Pusat Registrasi exposes no public API" },
        { capability: "token", mode: "simulated", because: "No Hedera credentials configured; the note and its partitions are held in memory" },
        { capability: "proof", mode: "simulated", because: "No proving toolchain configured; the circuit's checks are answered deterministically" },
        { capability: "settlement", mode: "simulated", because: "Rupiah settlement requires a licensed payment partner" },
        { capability: "wallet", mode: "simulated", because: "No Privy credentials configured; the quorum is enforced in memory" },
      ];
    },
  };
}
