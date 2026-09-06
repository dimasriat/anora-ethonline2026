import type { TrancheName } from "./api";

export type Role = "Borrower" | "Facility Agent" | "Capital Provider";

export const ROLES: Role[] = ["Borrower", "Facility Agent", "Capital Provider"];

export type StepView = {
  title: string;
  owner: Role;
  action?: { label: string; step: string };
};

export const STEPS: Record<string, StepView> = {
  none: { title: "Choose a receipt", owner: "Borrower" },
  draft: { title: "Sign the mandate", owner: "Borrower" },
  mandate_signed: { title: "Review the request", owner: "Facility Agent", action: { label: "Approve", step: "approve" } },
  approved: { title: "Verify eligibility", owner: "Facility Agent", action: { label: "Run the proof", step: "prove" } },
  proven: { title: "Issue the note", owner: "Facility Agent", action: { label: "Tokenise", step: "tokenize" } },
  tokenized: { title: "Subscribe to a tranche", owner: "Capital Provider" },
  subscribed: { title: "Register and fund", owner: "Facility Agent", action: { label: "Confirm registry", step: "register" } },
  funded: { title: "Track repayment", owner: "Borrower", action: { label: "Repay", step: "repay" } },
  repaid: { title: "Settled", owner: "Borrower" },
};

export const TRANCHE_COPY: Record<TrancheName, { priority: string; loss: string }> = {
  SENIOR: { priority: "Paid first", loss: "Impaired only after Junior is exhausted" },
  JUNIOR: { priority: "Paid last", loss: "Absorbs the first loss" },
};
