export type Mode = "live" | "testnet" | "simulated" | "planned";
export type TrancheName = "SENIOR" | "JUNIOR";

export type CapabilityStatus = { capability: string; mode: Mode; because: string };

export type ESrg = {
  id: string; holder: string; warehouse: string; commodity: string;
  quantityKg: number; valueIdr: number; issuedAt: string; expiresAt: string;
  documentHash: string; encumbrance: string;
};

export type Investor = {
  id: string; name: string; capitalType: string; riskProfile: string;
  mandate: TrancheName[]; ticketIdr: { min: number; max: number };
  allowlisted: boolean; standing: string;
};

export type TrancheTerms = {
  name: TrancheName; capacityIdr: number; returnBp: number;
  attachmentIdr: number; detachmentIdr: number;
};

export type Subscription = {
  id: string; investorId: string; tranche: TrancheName; unitsIdr: number; at: string;
};

export type FlowState = {
  request: {
    id: string; esrgId: string; requestedIdr: number; maturityDays: number;
    maxLtvBp: number; epoch: number; status: string;
  };
  facility: { ceilingIdr: number; tranches: TrancheTerms[] };
  subscriptions: Subscription[];
  note?: { series: string; underlying: string; ceilingIdr: number; state: string };
  proof?: { publicInputs: string[]; nullifier: string; checks: { label: string; pass: boolean }[] };
  onChain?: { ok: boolean; gasUsed?: number };
  registryRef?: string;
  settlement?: {
    cashReceivedIdr: number;
    paid: {
      seniorReturnIdr: number; seniorPrincipalIdr: number;
      juniorReturnIdr: number; juniorPrincipalIdr: number; residualIdr: number;
    };
    loss: { tranche: TrancheName; lossIdr: number }[];
    conserved: boolean;
  };
  reversibleTo?: string;
  history: { at: string; step: string; by: string; note: string }[];
};

export class ApiError extends Error {
  readonly code: string;
  readonly detail: Record<string, unknown>;
  constructor(code: string, message: string, detail: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) {
    const { code = "unknown", message = "Request failed", ...detail } = payload.error ?? {};
    throw new ApiError(code, message, detail);
  }
  return payload as T;
}

export const api = {
  status: () => call<CapabilityStatus[]>("/status"),
  esrgs: () => call<ESrg[]>("/esrg"),
  investors: () => call<Investor[]>("/investors"),
  requests: () => call<FlowState[]>("/requests"),
  request: (id: string) => call<FlowState>(`/requests/${id}`),
  remaining: (id: string) =>
    call<{ tranche: TrancheName; remainingIdr: number }[]>(`/requests/${id}/remaining`),
  create: (esrgId: string) => call<FlowState>("/requests", "POST", { esrgId }),
  step: (id: string, step: string) => call<FlowState>(`/requests/${id}/${step}`, "POST"),
  subscribe: (id: string, investorId: string, tranche: TrancheName, unitsIdr: number) =>
    call<FlowState>(`/requests/${id}/subscribe`, "POST", { investorId, tranche, unitsIdr }),
};

export const rp = (idr: number): string => `Rp ${idr.toLocaleString("id-ID")}`;
export const pct = (bp: number): string => `${(bp / 100).toFixed(2)}%`;
