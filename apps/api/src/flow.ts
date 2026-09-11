import {
  facilityFrom, isReversible, previousStep, splitRecovery,
  remainingCapacityIdr, requireStep, screenSubscription,
} from "@anora/core";
import type {
  ESrg, EligibilityProof, Facility, FinancingRequest, NoteToken, RecoverySplit,
  OrgWallet, Ports, RequestStatus, Subscription, TrancheName, TrancheTerms,
} from "@anora/core";
import { FlowError } from "./errors";
import { investorById } from "./adapters/mock/investors";
import { OFFICERS, QUORUM_THRESHOLD } from "./adapters/mock/wallet";
import type { DocuSealSubmission } from "./docuseal";

export type HistoryEntry = {
  at: string;
  step: RequestStatus;
  by: string;
  note: string;
};

export type NoteTransfer = {
  id: string;
  fromInvestorId: string;
  toInvestorId: string;
  tranche: TrancheName;
  unitsIdr: number;
  at: string;
};

export type FlowState = {
  ownerId: string;
  request: FinancingRequest;
  facility: Facility;
  subscriptions: Subscription[];
  transfers: NoteTransfer[];
  controls: { paused: boolean; frozenInvestorIds: string[] };
  orgWallet?: OrgWallet;
  mandateApprovals: string[];
  mandateSignature?: string;
  documentSigning?: {
    status: "awaiting_signature" | "signed" | "declined" | "expired";
    submissionId: number;
    submitterId: number;
    slug: string;
    url: string;
    completedAt?: string;
    documentUrl?: string;
    auditLogUrl?: string;
  };
  note?: NoteToken;
  proof?: Omit<EligibilityProof, "proofHex">;
  onChain?: { ok: boolean; gasUsed?: number };
  registryRef?: string;
  settlement?: Settlement;
  reversibleTo?: RequestStatus;
  history: HistoryEntry[];
};

const MAX_LTV_BP = 7_000;
const MATURITY_DAYS = 90;

/* Each facility deploys a contract and creates a Privy wallet. Unbounded
   creation drains testnet gas, so a caller gets a fixed allowance. */
export const FACILITIES_PER_OWNER = 5;

export type Settlement = {
  cashReceivedIdr: number;
  paid: RecoverySplit;
  loss: { tranche: TrancheName; lossIdr: number }[];
  conserved: boolean;
};

function facesOf(state: FlowState) {
  const of = (name: TrancheName) => state.facility.tranches.find((t) => t.name === name)!;
  return {
    seniorFaceIdr: of("SENIOR").capacityIdr,
    juniorFaceIdr: of("JUNIOR").capacityIdr,
  };
}

export function settle(state: FlowState, cashReceivedIdr: number, costsIdr = 0): Settlement {
  const { seniorFaceIdr, juniorFaceIdr } = facesOf(state);
  const paid = splitRecovery(cashReceivedIdr, costsIdr, seniorFaceIdr, juniorFaceIdr);

  const loss: { tranche: TrancheName; lossIdr: number }[] = [
    { tranche: "SENIOR", lossIdr: paid.seniorLossIdr },
    { tranche: "JUNIOR", lossIdr: paid.juniorLossIdr },
  ];

  const out = paid.costsPaidIdr + paid.seniorIdr + paid.juniorIdr + paid.surplusIdr;

  return { cashReceivedIdr, paid, loss, conserved: out === cashReceivedIdr };
}

export function makeFlow(ports: Ports) {
  const states = new Map<string, FlowState>();
  let sequence = 0;

  const must = (id: string, ownerId?: string): FlowState => {
    const state = states.get(id);
    if (!state) throw new FlowError("unknown_request", `unknown request: ${id}`, { id });
    /* A facility belongs to whoever opened it. Someone else's id must read as
       absent rather than forbidden — it is not theirs to know about. */
    if (ownerId !== undefined && state.ownerId !== ownerId) {
      throw new FlowError("unknown_request", `unknown request: ${id}`, { id });
    }
    return state;
  };

  const gate = (state: FlowState, requires: RequestStatus, action: string): void => {
    const refusal = requireStep(state.request.status, requires, action);
    if (refusal) {
      throw new FlowError("step_out_of_order", `${action} requires "${requires}"`, {
        action, requires, current: refusal.current,
      });
    }
  };

  const stamp = (state: FlowState, step: RequestStatus, by: string, note: string): void => {
    state.request.status = step;
    state.reversibleTo = previousStep(step) ?? undefined;
    state.history.push({ at: new Date().toISOString(), step, by, note });
  };

  const trancheOf = (state: FlowState, name: TrancheName): TrancheTerms => {
    const terms = state.facility.tranches.find((t) => t.name === name);
    if (!terms) throw new FlowError("unknown_request", `unknown tranche: ${name}`, { tranche: name });
    return terms;
  };

  return {
    all: (ownerId: string): FlowState[] =>
      [...states.values()].filter((s) => s.ownerId === ownerId),

    get: (id: string, ownerId: string): FlowState | null => {
      const state = states.get(id);
      return state && state.ownerId === ownerId ? state : null;
    },

    async create(esrgId: string, ownerId: string): Promise<FlowState> {
      const held = [...states.values()].filter((s) => s.ownerId === ownerId).length;
      if (held >= FACILITIES_PER_OWNER) {
        throw new FlowError(
          "facility_limit_reached",
          `You already have ${held} facilities. Each one deploys a contract, so the demo caps them.`,
          { limit: FACILITIES_PER_OWNER },
        );
      }
      const esrg: ESrg | null = await ports.esrg.get(esrgId);
      if (!esrg) throw new FlowError("unknown_receipt", `unknown receipt: ${esrgId}`, { esrgId });
      if (esrg.encumbrance !== "none") {
        throw new FlowError("receipt_encumbered", `${esrgId} is already pledged`, { esrgId });
      }

      const facility = facilityFrom(esrg.valueIdr, MAX_LTV_BP);
      const id = `REQ-${++sequence}`;
      const state: FlowState = {
        ownerId,
        request: {
          id,
          esrgId,
          requestedIdr: facility.ceilingIdr,
          maturityDays: MATURITY_DAYS,
          maxLtvBp: MAX_LTV_BP,
          epoch: 1,
          status: "draft",
        },
        facility,
        subscriptions: [],
        transfers: [],
        controls: { paused: false, frozenInvestorIds: [] },
        mandateApprovals: [],
        history: [],
      };
      state.orgWallet = await ports.wallet.createOrgWallet(OFFICERS, QUORUM_THRESHOLD);
      states.set(id, state);
      stamp(state, "draft", "cooperative", `Request opened against ${esrgId}`);
      return state;
    },

    /** One officer approves. Whether that is enough is the wallet's call. */
    async approveMandate(id: string, officerId: string): Promise<FlowState> {
      const state = must(id);
      gate(state, "draft", "Signing the mandate");

      const officer = OFFICERS.find((o) => o.id === officerId);
      if (!officer) {
        throw new FlowError("unknown_officer", `unknown officer: ${officerId}`, { officerId });
      }
      if (!state.orgWallet) {
        throw new FlowError("capability_not_available", "No organisation wallet", { id });
      }
      if (!state.mandateApprovals.includes(officerId)) state.mandateApprovals.push(officerId);

      const reached = state.mandateApprovals.length >= state.orgWallet.threshold;
      if (!reached) {
        stamp(state, "draft", officer.name,
          `${officer.role} approved (${state.mandateApprovals.length}/${state.orgWallet.threshold})`);
        return state;
      }

      state.mandateSignature = await ports.wallet.signAsOrg(
        state.orgWallet,
        state.mandateApprovals,
        `Financing mandate ${state.request.esrgId} - ${state.request.requestedIdr} IDR`,
      );
      stamp(state, "mandate_signed", "cooperative",
        `Quorum reached (${state.mandateApprovals.length}/${state.orgWallet.threshold}); mandate signed`);
      return state;
    },

    beginDocumentSigning(id: string, submission: DocuSealSubmission): FlowState {
      const state = must(id);
      gate(state, "draft", "Starting document signing");
      if (state.documentSigning) return state;
      state.documentSigning = { ...submission, status: "awaiting_signature" };
      state.history.push({ at: new Date().toISOString(), step: "draft", by: "borrower", note: `DocuSeal submission ${submission.submissionId} created` });
      return state;
    },

    completeDocumentSigning(submissionId: number, completedAt: string, documentUrl?: string, auditLogUrl?: string): FlowState | null {
      const state = [...states.values()].find((item) => item.documentSigning?.submissionId === submissionId);
      if (!state?.documentSigning) return null;
      if (state.documentSigning.status === "signed") return state;
      gate(state, "draft", "Completing document signing");
      state.documentSigning = { ...state.documentSigning, status: "signed", completedAt, documentUrl, auditLogUrl };
      state.mandateSignature = `docuseal:${submissionId}`;
      stamp(state, "mandate_signed", "borrower", `DocuSeal submission ${submissionId} completed`);
      return state;
    },

    async approve(id: string): Promise<FlowState> {
      const state = must(id);
      gate(state, "mandate_signed", "Approving the facility");
      stamp(state, "approved", "facility agent", "Evidence and authority verified");
      return state;
    },

    async prove(id: string): Promise<FlowState> {
      const state = must(id);
      gate(state, "approved", "Proving eligibility");

      const esrg = (await ports.esrg.get(state.request.esrgId))!;
      const intakes = await ports.esrg.intakes(esrg.id);
      let proof: EligibilityProof;
      try {
        proof = await ports.proof.prove(state.request, esrg, intakes);
        state.onChain = await ports.proof.verifyOnChain(proof);
      } catch (cause) {
        throw new FlowError(
          "capability_not_available",
          "Eligibility proving is not available yet",
          { capability: "proof", because: (cause as Error).message },
        );
      }
      if (!state.onChain.ok) {
        throw new FlowError("capability_not_available", "The proof did not verify on-chain", {
          capability: "proof",
        });
      }

      const { proofHex: _discarded, ...withoutProofBytes } = proof;
      state.proof = withoutProofBytes;
      stamp(state, "proven", "facility agent", `Eligibility proven; nullifier ${proof.nullifier}`);
      return state;
    },

    async tokenize(id: string): Promise<FlowState> {
      const state = must(id);
      gate(state, "proven", "Issuing the note");

      const esrg = (await ports.esrg.get(state.request.esrgId))!;
      state.note = await ports.token.issueDraftNote(state.request, esrg, state.facility.tranches);
      stamp(state, "tokenized", "system", `Draft note ${state.note.series} reserved`);
      return state;
    },

    async subscribe(
      id: string,
      investorId: string,
      tranche: TrancheName,
      unitsIdr: number,
    ): Promise<FlowState> {
      const state = must(id);
      gate(state, "tokenized", "Subscribing");

      const investor = investorById(investorId);
      if (!investor) {
        throw new FlowError("unknown_investor", `unknown investor: ${investorId}`, { investorId });
      }

      const terms = trancheOf(state, tranche);
      const screening = screenSubscription(investor, terms, unitsIdr, state.subscriptions);
      if (!screening.ok) {
        const { code, ...detail } = screening.refusal;
        throw new FlowError(code, `${investor.name} was refused`, { investor: investor.name, ...detail });
      }

      if (state.note) {
        await ports.token.allocate(state.note.series, tranche, investor, unitsIdr);
      }

      state.subscriptions.push({
        id: `SUB-${state.subscriptions.length + 1}`,
        investorId,
        tranche,
        unitsIdr,
        at: new Date().toISOString(),
      });

      const full = state.facility.tranches.every(
        (t) => remainingCapacityIdr(t, state.subscriptions) === 0,
      );
      stamp(
        state,
        full ? "subscribed" : "tokenized",
        "capital provider",
        `${investor.name} subscribed ${unitsIdr} to ${tranche}`,
      );
      return state;
    },

    async registerAndFund(id: string): Promise<FlowState> {
      const state = must(id);
      gate(state, "subscribed", "Funding");
      if (!state.note) {
        throw new FlowError("step_out_of_order", "Funding requires an issued note", { id });
      }

      const confirmation = await ports.registry.confirmSecurity(
        state.request.esrgId,
        state.note.series,
      );
      state.registryRef = confirmation.ref;
      state.note = await ports.token.activate(state.note.series);
      stamp(state, "funded", "registry", `Security recorded (${confirmation.ref}); note active`);
      return state;
    },

    async repay(id: string, cashReceivedIdr?: number): Promise<FlowState> {
      const state = must(id);
      gate(state, "funded", "Repayment");

      const { seniorFaceIdr, juniorFaceIdr } = facesOf(state);
      const dueInFull = seniorFaceIdr + juniorFaceIdr;

      state.settlement = settle(state, cashReceivedIdr ?? dueInFull);
      if (state.note) state.note = await ports.token.redeem(state.note.series);
      state.request.epoch += 1;

      const shortfall = state.settlement.loss.reduce((sum, l) => sum + l.lossIdr, 0);
      stamp(state, "repaid", "cooperative",
        shortfall === 0
          ? `Repaid in full; security released; round ${state.request.epoch}`
          : `Settled with ${shortfall} of loss; security released; round ${state.request.epoch}`);
      return state;
    },

    async back(id: string): Promise<FlowState> {
      const state = must(id);
      const to = previousStep(state.request.status);
      if (!to || !isReversible(state.request.status)) {
        throw new FlowError("not_reversible", `${state.request.status} cannot be rewound`, {
          current: state.request.status,
        });
      }
      if (to === "draft") {
        state.documentSigning = undefined;
        state.mandateSignature = undefined;
        state.mandateApprovals = [];
      }
      stamp(state, to, "system", `Rewound to ${to}`);
      return state;
    },

    tranches(id: string): TrancheTerms[] {
      return must(id).facility.tranches;
    },

    remaining(id: string): { tranche: TrancheName; remainingIdr: number }[] {
      const state = must(id);
      return state.facility.tranches.map((t) => ({
        tranche: t.name,
        remainingIdr: remainingCapacityIdr(t, state.subscriptions),
      }));
    },

    positions(id: string): { investorId: string; tranche: TrancheName; unitsIdr: number }[] {
      const state = must(id);
      const book = new Map<string, { investorId: string; tranche: TrancheName; unitsIdr: number }>();
      const move = (investorId: string, tranche: TrancheName, unitsIdr: number) => {
        const key = `${investorId}:${tranche}`;
        const position = book.get(key) ?? { investorId, tranche, unitsIdr: 0 };
        position.unitsIdr += unitsIdr;
        book.set(key, position);
      };
      for (const item of state.subscriptions) move(item.investorId, item.tranche, item.unitsIdr);
      for (const item of state.transfers) {
        move(item.fromInvestorId, item.tranche, -item.unitsIdr);
        move(item.toInvestorId, item.tranche, item.unitsIdr);
      }
      return [...book.values()].filter((item) => item.unitsIdr > 0);
    },

    transfer(id: string, fromInvestorId: string, toInvestorId: string, tranche: TrancheName, unitsIdr: number): FlowState {
      const state = must(id);
      gate(state, "funded", "Transferring");
      if (state.controls.paused) throw new FlowError("step_out_of_order", "Transfers are paused");
      const from = investorById(fromInvestorId);
      const to = investorById(toInvestorId);
      if (!from || !to) throw new FlowError("unknown_investor", "Unknown transfer participant");
      if (fromInvestorId === toInvestorId) throw new FlowError("unknown_investor", "Sender and recipient must differ");
      if (state.controls.frozenInvestorIds.includes(fromInvestorId) || state.controls.frozenInvestorIds.includes(toInvestorId)) {
        throw new FlowError("not_eligible", "Sender or recipient is frozen");
      }
      if (!to.allowlisted) throw new FlowError("not_eligible", `${to.name} is not allowlisted`);
      if (!to.mandate.includes(tranche)) throw new FlowError("mandate_excludes_tranche", `${to.name} cannot hold ${tranche}`);
      const held = this.positions(id).find((item) => item.investorId === fromInvestorId && item.tranche === tranche)?.unitsIdr ?? 0;
      if (!Number.isFinite(unitsIdr) || unitsIdr <= 0 || unitsIdr > held) {
        throw new FlowError("exceeds_remaining_capacity", `${from.name} holds ${held} ${tranche} units`);
      }
      state.transfers.push({ id: `TRF-${state.transfers.length + 1}`, fromInvestorId, toInvestorId, tranche, unitsIdr, at: new Date().toISOString() });
      state.history.push({ at: new Date().toISOString(), step: state.request.status, by: "capital provider", note: `${unitsIdr} ${tranche} units transferred from ${from.name} to ${to.name}` });
      return state;
    },

    pause(id: string, paused: boolean): FlowState {
      const state = must(id);
      gate(state, "funded", "Changing transfer controls");
      state.controls.paused = paused;
      state.history.push({ at: new Date().toISOString(), step: state.request.status, by: "facility agent", note: paused ? "Transfers paused" : "Transfers resumed" });
      return state;
    },

    freeze(id: string, investorId: string, frozen: boolean): FlowState {
      const state = must(id);
      gate(state, "funded", "Changing holder controls");
      if (!investorById(investorId)) throw new FlowError("unknown_investor", `unknown investor: ${investorId}`);
      state.controls.frozenInvestorIds = frozen
        ? [...new Set([...state.controls.frozenInvestorIds, investorId])]
        : state.controls.frozenInvestorIds.filter((id) => id !== investorId);
      state.history.push({ at: new Date().toISOString(), step: state.request.status, by: "facility agent", note: frozen ? `${investorId} frozen` : `${investorId} unfrozen` });
      return state;
    },

    reset(): void {
      states.clear();
      sequence = 0;
    },
  };
}
