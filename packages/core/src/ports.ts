/**
 * Batas antara aplikasi dan dunia luar.
 *
 * Tiap kapabilitas punya port sendiri supaya bisa dipindah dari simulasi ke
 * sungguhan satu per satu — dan supaya aplikasi selalu bisa melaporkan yang
 * mana sedang dipakai. Itu bukan kenyamanan; demo yang tidak bisa menyebut
 * bagian mana yang disimulasikan adalah demo yang mengaku terlalu banyak.
 */
import type {
  ESrg, EligibilityProof, FinancingRequest, Intake, Investor, NoteToken,
  TrancheName, TrancheTerms,
} from "./domain";

export type Mode = "live" | "testnet" | "simulated" | "planned";

export type CapabilityStatus = {
  capability: string;
  mode: Mode;
  /** Kenapa mode-nya begitu. Ditampilkan apa adanya ke pengguna. */
  because: string;
};

export interface EsrgRepository {
  list(): Promise<ESrg[]>;
  get(id: string): Promise<ESrg | null>;
  intakes(esrgId: string): Promise<Intake[]>;
}

/** Pusat Registrasi (Bappebti). Konfirmasinya menggerbangi pencairan. */
export interface RegistryGate {
  confirmSecurity(esrgId: string, reference: string): Promise<{
    confirmed: boolean;
    ref: string;
  }>;
}

export interface TokenIssuer {
  issueDraftNote(req: FinancingRequest, esrg: ESrg, tranches: TrancheTerms[]): Promise<NoteToken>;
  allocate(series: string, tranche: TrancheName, holder: Investor, unitsIdr: number): Promise<void>;
  activate(series: string): Promise<NoteToken>;
  redeem(series: string): Promise<NoteToken>;
}

export interface ProofEngine {
  prove(req: FinancingRequest, esrg: ESrg, intakes: Intake[]): Promise<EligibilityProof>;
  verifyOnChain(proof: EligibilityProof): Promise<{ ok: boolean; gasUsed?: number }>;
}

export type Officer = { id: string; name: string; role: string };

export type OrgWallet = {
  walletId: string;
  address: string;
  quorumId: string;
  threshold: number;
  officers: Officer[];
};

/** A cooperative is not one person. Signing needs a quorum of its officers. */
export interface WalletProvider {
  createOrgWallet(officers: Officer[], threshold: number): Promise<OrgWallet>;
  signAsOrg(wallet: OrgWallet, signerIds: string[], message: string): Promise<string>;
}

export interface Ports {
  esrg: EsrgRepository;
  registry: RegistryGate;
  token: TokenIssuer;
  proof: ProofEngine;
  wallet: WalletProvider;
  status(): CapabilityStatus[];
}
