export const rp = (n: number) => "Rp " + n.toLocaleString("id-ID");

async function call(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Request failed. Please try again.");
  return d;
}

export type ESrg = {
  id: string; commodity: string; quantityKg: number; valueIdr: number;
  warehouse: string; issuedAt: string; expiresAt: string;
  documentHash: string; encumbrance: string; holder: string;
};
export type TrancheName = "SENIOR" | "JUNIOR";
export type Investor = {
  id: string; name: string; capitalType: string; riskProfile: string;
  mandate: TrancheName[]; ticketIdr: { min: number; max: number };
  allowlisted: boolean; standing: string;
};
export type Band = { name: TrancheName; capacityIdr: number; subscribedIdr: number; returnBp: number; purchasePriceIdr: number };
export type Position = { investorId: string; tranche: TrancheName; unitsIdr: number };
export type Subscription = {
  id: string; investorId: string; tranche: TrancheName; unitsIdr: number; at: string;
  purchasePriceIdr: number;
  /** Committed by a standing credit line at tokenisation, not subscribed live. */
  standingLine?: boolean;
};
export type NoteTransfer = {
  id: string; fromInvestorId: string; toInvestorId: string;
  tranche: TrancheName; unitsIdr: number; at: string;
};
export type Flow = {
  request: { id: string; esrgId: string; requestedIdr: number; maturityDays: number; maxLtvBp: number; epoch: number };
  step: string;
  /** Present when this step can still be rewound; the server owns the rule. */
  reversibleTo?: string;
  proof?: { nullifier: string; checks: { label: string; pass: boolean }[] };
  onchain?: { ok: boolean; gasUsed?: number };
  note?: { series: string; underlying: string; ceilingIdr: number; transferRule: string; state: string };
  subscriptions: Subscription[];
  transfers: NoteTransfer[];
  controls: { paused: boolean; frozenInvestorIds: string[] };
  settlement?: { cashReceivedIdr: number; costsIdr: number; availableIdr: number; seniorPaidIdr: number; juniorPaidIdr: number; seniorLossIdr: number; juniorLossIdr: number };
  registryRef?: string;
  history: { at: string; step: string; by: string; note: string }[];
};

export type Chain = {
  chainId: number; contract: string; registryRoot: string;
  policy: { maxLtvBp: number; maxMaturityDays: number };
  currentRound: number; roundsDone: number; nullifierSpent?: boolean; explorer: string;
};

export type Note = {
  address: string; standard: string; name: string; symbol: string;
  totalSupply: number; maxSupply: number; held: number;
  multiPartition: boolean; tranches: Tranche[]; juniorSharePct: number;
  explorer: string;
};

export type Tranche = { name: string; units: number; share: number; paid: string; risk: string; returnBp: number };
export type Prospectus = {
  commodityBand: string; warehouse: string; coverageBand: string;
  financingCeilingIdr: number; maxTenorDays: number; verificationStatus: string;
  withheld: string[]; publicProofInputs: string[]; note: string;
};
/* Mirrors apps/api/src/intake.ts, the way every other type here mirrors the
   server. The rules and the state live there; this is the shape on the wire. */
export type BorrowerProfile = {
  entityName: string; entityType: string; registrationRef: string; taxRef: string;
  representativeRole: string; authorityRef: string; commodity: string;
  quantityKg: number; warehouse: string;
};
export type IntakeState = {
  borrower: { status: "draft" | "submitted" | "approved" | "confirmed"; profile: BorrowerProfile };
  humanCheck: boolean;
  receipts: Record<string, "proposed" | "accepted">;
};
export type IntakeAction =
  | { kind: "submit-borrower"; profile: BorrowerProfile }
  | { kind: "approve-borrower" } | { kind: "confirm-borrower" }
  | { kind: "revise-borrower" } | { kind: "human" }
  | { kind: "propose" | "accept"; receiptId: string };
/** The closed lists the form may offer, served with the state that enforces them. */
export type IntakeOptions = { entityTypes: string[]; representativeRoles: string[]; commodities: string[]; warehouses: string[] };
export type IntakeView = { state: IntakeState; options: IntakeOptions };

export type Mode = {
  adapters: { capability: string; mode: "live" | "simulated" }[];
};

export const api = {
  mode: () => call("/mode") as Promise<Mode>,
  prospectus: (id: string) => call(`/requests/${id}/prospectus`) as Promise<Prospectus>,
  note: () => call("/note") as Promise<Note>,
  chain: (esrgId: string) => call(`/chain/${esrgId}`) as Promise<Chain>,
  esrgs: () => call("/esrg") as Promise<ESrg[]>,
  requests: () => call("/requests") as Promise<Flow[]>,
  create: (esrgId: string) => call("/requests", "POST", { esrgId }) as Promise<Flow>,
  step: (id: string, s: string) => call(`/requests/${id}/${s}`, "POST") as Promise<Flow>,
  reset: () => call("/reset", "POST") as Promise<{ ok: true }>,
  intake: () => call("/intake") as Promise<IntakeView>,
  intakeAct: (role: string, action: IntakeAction) => call("/intake", "POST", { role, action }) as Promise<IntakeView>,
  investors: () => call("/investors") as Promise<Investor[]>,
  tranches: (id: string) => call(`/requests/${id}/tranches`) as Promise<Band[]>,
  positions: (id: string) => call(`/requests/${id}/positions`) as Promise<Position[]>,
  subscribe: (id: string, body: { investorId: string; tranche: TrancheName; unitsIdr: number }) =>
    call(`/requests/${id}/subscribe`, "POST", body) as Promise<Flow>,
  transfer: (id: string, body: {
    fromInvestorId: string; toInvestorId: string; tranche: TrancheName; unitsIdr: number;
  }) => call(`/requests/${id}/transfer`, "POST", body) as Promise<Flow>,
  pause: (id: string, paused: boolean) => call(`/requests/${id}/pause`, "POST", { paused }) as Promise<Flow>,
  freeze: (id: string, investorId: string, frozen: boolean) => call(`/requests/${id}/freeze`, "POST", { investorId, frozen }) as Promise<Flow>,
};
