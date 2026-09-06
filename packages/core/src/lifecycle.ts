import type { RequestStatus } from "./domain";

export const STEP_ORDER: RequestStatus[] = [
  "draft",
  "mandate_signed",
  "approved",
  "proven",
  "tokenized",
  "subscribed",
  "funded",
  "repaid",
];

const LAST_REVERSIBLE_STEP: RequestStatus = "proven";

export type StepRefusal = {
  code: "step_out_of_order";
  action: string;
  requires: RequestStatus;
  current: RequestStatus;
};

export const stepIndex = (step: RequestStatus): number => STEP_ORDER.indexOf(step);

export function requireStep(
  current: RequestStatus,
  requires: RequestStatus,
  action: string,
): StepRefusal | null {
  if (stepIndex(current) >= stepIndex(requires)) return null;
  return { code: "step_out_of_order", action, requires, current };
}

export function isReversible(step: RequestStatus): boolean {
  return stepIndex(step) > 0 && stepIndex(step) <= stepIndex(LAST_REVERSIBLE_STEP);
}

export function previousStep(step: RequestStatus): RequestStatus | null {
  return isReversible(step) ? STEP_ORDER[stepIndex(step) - 1]! : null;
}
