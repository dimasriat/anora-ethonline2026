import {
  facilityFrom, isReversible, previousStep, remainingCapacityIdr,
  requireStep, screenSubscription,
} from "@anora/core";
import type {
  ESrg, Facility, FinancingRequest, NoteToken, Ports, RequestStatus,
  Subscription, TrancheName, TrancheTerms,
} from "@anora/core";
import { FlowError } from "./errors";
import { investorById } from "./adapters/mock/investors";

export type HistoryEntry = {
  at: string;
  step: RequestStatus;
  by: string;
  note: string;
};

export type FlowState = {
  request: FinancingRequest;
  facility: Facility;
  subscriptions: Subscription[];
  note?: NoteToken;
  registryRef?: string;
  reversibleTo?: RequestStatus;
  history: HistoryEntry[];
};

const MAX_LTV_BP = 7_000;
const MATURITY_DAYS = 90;

export function makeFlow(ports: Ports) {
  const states = new Map<string, FlowState>();
  let sequence = 0;

  const must = (id: string): FlowState => {
    const state = states.get(id);
    if (!state) throw new FlowError("unknown_request", `unknown request: ${id}`, { id });
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
    all: (): FlowState[] => [...states.values()],
    get: (id: string): FlowState | null => states.get(id) ?? null,

    async create(esrgId: string): Promise<FlowState> {
      const esrg: ESrg | null = await ports.esrg.get(esrgId);
      if (!esrg) throw new FlowError("unknown_receipt", `unknown receipt: ${esrgId}`, { esrgId });
      if (esrg.encumbrance !== "none") {
        throw new FlowError("receipt_encumbered", `${esrgId} is already pledged`, { esrgId });
      }

      const facility = facilityFrom(esrg.valueIdr, MAX_LTV_BP);
      const id = `REQ-${++sequence}`;
      const state: FlowState = {
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
        history: [],
      };
      states.set(id, state);
      stamp(state, "draft", "cooperative", `Request opened against ${esrgId}`);
      return state;
    },

    async signMandate(id: string): Promise<FlowState> {
      const state = must(id);
      gate(state, "draft", "Signing the mandate");
      stamp(state, "mandate_signed", "cooperative", "Financing mandate signed");
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
      try {
        await ports.proof.prove(state.request, esrg, intakes);
      } catch (cause) {
        throw new FlowError(
          "capability_not_available",
          "Eligibility proving is not available yet",
          { capability: "proof", because: (cause as Error).message },
        );
      }
      stamp(state, "proven", "facility agent", "Eligibility proven");
      return state;
    },

    async tokenize(id: string): Promise<FlowState> {
      const state = must(id);
      gate(state, "proven", "Issuing the note");

      const esrg = (await ports.esrg.get(state.request.esrgId))!;
      state.note = await ports.token.issueDraftNote(state.request, esrg);
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

    async repay(id: string): Promise<FlowState> {
      const state = must(id);
      gate(state, "funded", "Repayment");

      if (state.note) state.note = await ports.token.redeem(state.note.series);
      state.request.epoch += 1;
      stamp(state, "repaid", "cooperative", `Repaid; security released; round ${state.request.epoch}`);
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
  };
}
