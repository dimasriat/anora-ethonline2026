export type ErrorCode =
  | "unknown_request"
  | "unknown_receipt"
  | "unknown_investor"
  | "unknown_officer"
  | "receipt_encumbered"
  | "capability_not_available"
  | "step_out_of_order"
  | "not_reversible"
  | "not_allowlisted"
  | "mandate_excludes_tranche"
  | "below_minimum_ticket"
  | "above_maximum_ticket"
  | "exceeds_remaining_capacity";

export class FlowError extends Error {
  readonly code: ErrorCode;
  readonly detail: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = "FlowError";
    this.code = code;
    this.detail = detail;
  }
}

export const STATUS_FOR: Record<ErrorCode, number> = {
  unknown_request: 404,
  unknown_receipt: 404,
  unknown_investor: 404,
  unknown_officer: 404,
  receipt_encumbered: 409,
  capability_not_available: 501,
  step_out_of_order: 409,
  not_reversible: 409,
  not_allowlisted: 403,
  mandate_excludes_tranche: 403,
  below_minimum_ticket: 422,
  above_maximum_ticket: 422,
  exceeds_remaining_capacity: 409,
};
