import { useEffect, useRef, useState } from "react";
import { syncWorkspace } from "./workspace-sync";
import { flushSync } from "react-dom";
import Dashboard from "./Dashboard";
import IntakePanel from "./IntakePanel";
import BorrowerOnboarding from "./BorrowerOnboarding";
import InstitutionOnboarding from "./InstitutionOnboarding";
import {
  api, rp,
  type Band, type Chain, type ESrg, type Flow, type IntakeAction, type IntakeOptions, type IntakeState, type Investor, type Mode,
  type Note, type Position, type TrancheName,
} from "./api";

type Role = "Borrower" | "Capital Provider" | "Compliance";
type Screen = "pick" | "mandate" | "review" | "proof" | "note" | "fund" | "done";
type View = "landing" | "how" | "access" | "workspace";
type DistributionKind = "Coupon" | "Dividend" | "Royalty";

const SCREEN: Record<Screen, { actor: Role; eyebrow: string; title: string; summary?: string }> = {
  pick: {
    actor: "Borrower",
    eyebrow: "New financing request",
    title: "Choose a receipt",
  },
  mandate: {
    actor: "Borrower",
    eyebrow: "Documents",
    title: "Sign the mandate",
  },
  review: {
    actor: "Compliance",
    eyebrow: "Facility review",
    title: "Review the request",
  },
  proof: {
    actor: "Compliance",
    eyebrow: "Private verification",
    title: "Verify eligibility",
  },
  note: {
    actor: "Capital Provider",
    eyebrow: "Open for subscription",
    title: "Subscribe to a tranche",
  },
  fund: {
    actor: "Compliance",
    eyebrow: "Registry and release",
    title: "Confirm and allocate positions",
  },
  done: {
    actor: "Capital Provider",
    eyebrow: "Active note lifecycle",
    title: "Manage allocated notes",
  },
};

const ROLES: Role[] = ["Borrower", "Capital Provider", "Compliance"];
const WORKSPACE_KEY = "anora-workspace";
const INSTITUTION_KEY = "anora-institution-onboarding";
const ROLE_ICONS: Record<Role, string> = {
  Borrower: "M3 21V8l9-5 9 5v13H3Zm4 0V11h10v10M7 15h10M7 18h10",
  "Capital Provider": "M3 21h18M3 7l9-5 9 5H3Zm3 3v7m6-7v7m6-7v7M3 17h18",
  "Compliance": "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6",
};

/** Which workspace can advance the facility from a given server step. This is
 *  the real ownership: SCREEN[].actor only describes whose concern the copy is. */
const STEP_OWNER: Record<string, Role> = {
  draft: "Borrower",
  mandate_signed: "Compliance",
  approved: "Compliance",
  proven: "Compliance",
  tokenized: "Capital Provider",
  subscribed: "Compliance",
  funded: "Capital Provider",
  repaid: "Capital Provider",
};

/** The screen a server step puts every workspace on. State lives on the server,
 *  so two browser windows on different roles stay on the same step. */
const STEP_SCREEN: Record<string, Screen> = {
  draft: "mandate",
  mandate_signed: "review",
  approved: "proof",
  proven: "proof",
  tokenized: "note",
  subscribed: "fund",
  funded: "done",
  repaid: "done",
};
const ROLE_COPY: Record<Role, { summary: string; detail: string }> = {
  Borrower: {
    summary: "Raise working capital against stored inventory.",
    detail: "For cooperatives and enterprises holding an eligible warehouse receipt.",
  },
  "Capital Provider": {
    summary: "Fund Senior or Junior positions in approved facilities.",
    detail: "For banks and qualified investors allocating to structured credit.",
  },
  "Compliance": {
    summary: "Verify eligibility, registry control, and settlement.",
    detail: "For authorized operators, reviewers, and auditors running a facility.",
  },
};

const WORKSPACE_NAV: Record<Role, string[]> = {
  Borrower: ["Overview", "My e-SRGs", "Financing requests", "Documents", "Repayments"],
  "Capital Provider": ["Overview", "Opportunities", "My notes", "Transfers", "Cashflows"],
  "Compliance": ["Overview", "Review queue", "Registry controls", "Funding & settlement", "Audit trail"],
};

const NAV_ICONS: Record<string, string> = {
  Overview: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  "My e-SRGs": "M3 7h18v14H3V7Zm2-4h14v4M8 12h8",
  "Financing requests": "M14 2H5v20h14V7l-5-5Zm0 0v5h5M8 12h8m-8 4h5",
  Documents: "M8 3h13v14H8V3ZM3 7v14h13",
  Repayments: "M3 7h18v14H3V7Zm4-4v7m10-7v7M3 12h18m-10 4h2",
  Opportunities: "M3 17l6-6 4 4 8-10m-6 0h6v6",
  "My notes": "M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 5h8m-8 4h8",
  Transfers: "M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4",
  Cashflows: "M3 3v18h18M7 16v-4m5 4V7m5 9v-6",
  "Review queue": "M8 4H4v18h16V4h-4M8 2h8v4H8V2Zm0 9h8m-8 5h5",
  "Registry controls": "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6",
  "Funding & settlement": "M3 21h18M3 7l9-5 9 5H3Zm3 3v7m6-7v7m6-7v7M3 17h18",
  "Audit trail": "M9 3H4v18h16v-5M14 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm3 7 4 4M8 15h5m-5 3h8",
};

/** The section where each workspace meets the shared facility. One per role, so a
 *  hand-off moves the user between workspaces rather than out of the product. */
/** Where a borrower proposes a receipt for intake review. */
const INTAKE_SECTION = "My e-SRGs";

const FLOW_SECTION: Record<Role, string> = {
  Borrower: "Financing requests",
  "Capital Provider": "Opportunities",
  "Compliance": "Review queue",
};

/**
 * Crossfades the outgoing and incoming view.
 *
 * The View Transitions API animates snapshots rather than live boxes, which
 * matters here: a transform on .public-page would become the containing block
 * for the fixed backdrop behind it and drag the pattern out of place mid-fade.
 * Where the API is missing, or the viewer asked for less motion, the swap is
 * instant — the old behaviour, not a broken one.
 */
const withViewTransition = (update: () => void) => {
  const start = (document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  }).startViewTransition;
  if (!start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  start.call(document, () => flushSync(update));
};

const VIEW_BY_HASH: Record<string, View> = {
  "#home": "landing",
  "#how-it-works": "how",
  "#access": "access",
  "#workspace": "workspace",
};

const viewFromHash = (): View => VIEW_BY_HASH[window.location.hash] ?? "landing";

const WORKSPACE_META: Record<Role, {
  eyebrow: string;
  title: string;
  summary: string;
  action: string;
  /** Static copy for the workspaces whose own panels have not landed yet. */
  metrics?: { label: string; value: string; note: string }[];
  rows: { title: string; meta: string; status: string }[];
}> = {
  Borrower: {
    eyebrow: "Borrower workspace",
    title: "Finance eligible inventory",
    summary: "Finance a receipt, then track it to release.",
    action: "New financing request",
    rows: [
      { title: "SRG-TEH-024 · Black Tea BOP", meta: "Mandate ready · Rp 420.000.000 facility", status: "In review" },
      { title: "SRG-TEH-018 · Green Tea", meta: "Security right released", status: "Repaid" },
    ],
  },
  "Capital Provider": {
    eyebrow: "Capital provider workspace",
    title: "Allocate into approved note positions",
    summary: "Compare tranches and hold permissioned positions.",
    action: "Browse opportunities",
    metrics: [
      { label: "Open opportunities", value: "1", note: "Two tranche positions" },
      { label: "Committed capital", value: "Rp 270m", note: "Senior allocation" },
      { label: "Next cashflow", value: "4 Dec 2026", note: "Facility ANR-SRG-024" },
    ],
    rows: [
      { title: "ANR-SRG-024 · Senior note", meta: "Paid first · 90 days · target 2.0% p.a.", status: "Open" },
      { title: "ANR-SRG-024 · Junior note", meta: "First-loss · 90 days · target 4.5% p.a.", status: "Open" },
    ],
  },
  "Compliance": {
    eyebrow: "Compliance workspace",
    title: "Move approved facilities through each control",
    summary: "Check evidence and gate funding and settlement.",
    action: "Open review queue",
    metrics: [
      { label: "Review queue", value: "2", note: "One mandate signed" },
      { label: "Registry actions", value: "1", note: "Confirmation pending" },
      { label: "Settlement holds", value: "0", note: "No blocked releases" },
    ],
    rows: [
      { title: "SRG-TEH-024 · PT Kebun Nusantara", meta: "Mandate signed · evidence package complete", status: "Review" },
      { title: "ANR-SRG-018 · Release request", meta: "Repayment confirmed · registry release pending", status: "Action" },
    ],
  },
};

const SECTION_ROWS: Record<string, { title: string; meta: string; status: string }[]> = {
  "My e-SRGs": [
    { title: "SRG-TEH-024 · Black Tea BOP", meta: "8,000 kg · Gudang SRG Bandung 02", status: "Eligible" },
    { title: "SRG-TEH-018 · Green Tea", meta: "4,200 kg · Gudang SRG Bandung 02", status: "Clear" },
  ],
  "Financing requests": [
    { title: "ANR-SRG-024", meta: "Rp 420.000.000 ceiling · mandate ready", status: "In review" },
    { title: "ANR-SRG-018", meta: "Rp 310.000.000 · security right released", status: "Repaid" },
  ],
  Documents: [
    { title: "Financing mandate · SRG-TEH-024", meta: "DocuSeal envelope · borrower signature required", status: "Ready" },
    { title: "Registry inquiry consent", meta: "Included in the financing evidence package", status: "Signed" },
  ],
  Repayments: [{ title: "ANR-SRG-024", meta: "Rp 432.600.000 due · 4 Dec 2026", status: "62 days" }],
  Opportunities: [
    { title: "ANR-SRG-024 · Senior note", meta: "Rp 270m · paid first · target 2.0% p.a.", status: "Open" },
    { title: "ANR-SRG-024 · Junior note", meta: "Rp 120m · first-loss · target 4.5% p.a.", status: "Open" },
  ],
  Cashflows: [{ title: "ANR-SRG-024 · Expected repayment", meta: "Senior principal and return · 4 Dec 2026", status: "Upcoming" }],
  "Review queue": [{ title: "SRG-TEH-024 · PT Kebun Nusantara", meta: "Mandate signed · valuation and registry checks ready", status: "Review" }],
  "Registry controls": [{ title: "Hak Jaminan confirmation · SRG-TEH-024", meta: "Required before note activation and disbursement", status: "Pending" }],
  "Funding & settlement": [{ title: "ANR-SRG-024 · Funding gate", meta: "Investor allocation ready · registry confirmation required", status: "On hold" }],
  "Audit trail": [{ title: "Eligibility proof recorded", meta: "Policy result and nullifier · private source files withheld", status: "Verified" }],
};
/** The shared lifecycle, in order. Everything below is positioned against it. */
const STEP_ORDER = [
  "none", "draft", "mandate_signed", "approved", "proven",
  "tokenized", "subscribed", "funded", "repaid",
] as const;

const stepAt = (step: string) => Math.max(0, STEP_ORDER.indexOf(step as typeof STEP_ORDER[number]));

/** Each workspace tracks its own steps, not the whole facility lifecycle.
 *  `from` is the shared step at which that stage becomes the role's focus, so
 *  every window derives its own rail from the same server state. */
const JOURNEY: Record<Role, { label: string; hint: string; from: string }[]> = {
  Borrower: [
    { label: "Receipt", hint: "Select a receipt for review", from: "none" },
    { label: "Mandate", hint: "Review and sign", from: "draft" },
    { label: "Compliance review", hint: "Documents, lien and eligibility checks", from: "mandate_signed" },
    { label: "Note", hint: "Eligibility passed; Compliance issues note", from: "proven" },
    { label: "Funded", hint: "Capital committed against your note", from: "tokenized" },
    { label: "Repayment", hint: "Track and release", from: "funded" },
  ],
  "Capital Provider": [
    { label: "Opportunity", hint: "Facility under review", from: "none" },
    { label: "Structure", hint: "Compare Senior and Junior", from: "proven" },
    { label: "Subscription", hint: "Commit capital to a tranche", from: "tokenized" },
    { label: "Position", hint: "Receive allocated note units", from: "funded" },
    { label: "Transfer", hint: "Move units under compliance", from: "funded" },
    { label: "Cashflow", hint: "Track maturity proceeds", from: "funded" },
    { label: "Redemption", hint: "Return paid and units retired", from: "repaid" },
  ],
  "Compliance": [
    { label: "Submission", hint: "Await borrower mandate", from: "none" },
    { label: "Review", hint: "Check documents and lien", from: "mandate_signed" },
    { label: "Eligibility", hint: "Run the private proof", from: "approved" },
    { label: "Note", hint: "Create the draft", from: "proven" },
    { label: "Settlement", hint: "Registry and release", from: "subscribed" },
  ],
};

const PROOF_COPY: Record<string, string> = {
  "resi sah dan pemegang berwenang": "Receipt is valid and the holder is authorized",
  "komposisi lot cocok dengan kuantitas gudang": "Lot total matches the warehouse quantity",
  "LTV di dalam kebijakan": "LTV is within policy",
  "tenor di dalam kebijakan": "Term is within policy",
  "hash mandate cocok": "Mandate hash matches",
  "belum ada nullifier pembiayaan di ronde ini": "Receipt has not been financed in this round",
};

/** The gates refuse in Indonesian and carry interpolated names and amounts, so
 *  these are patterns rather than the plain lookups above. Anything unmatched
 *  falls back to the generic sentence — a raw server string never reaches a user. */
const GATE_COPY: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^receipt intake incomplete$/, () => "Complete the human check and obtain compliance receipt acceptance before starting financing."],
  [/^(.+) belum lolos allowlist: (.+)$/, (m) => `${m[1]} is not allowlisted — ${m[2]}.`],
  [/^mandat (.+) tidak mencakup tranche (.+)$/, (m) => `${m[1]}'s mandate does not cover the ${m[2] === "SENIOR" ? "Senior" : "Junior"} tranche.`],
  [/^di bawah tiket minimum (.+)$/, (m) => `That amount is below ${m[1]}'s minimum ticket.`],
  [/^di atas tiket maksimum (.+)$/, (m) => `That amount is above ${m[1]}'s maximum ticket.`],
  [/^sisa kapasitas tranche (\S+) hanya (\d+)$/, (m) => `Only ${rp(Number(m[2]))} is left in the ${m[1] === "SENIOR" ? "Senior" : "Junior"} tranche.`],
  [/^fasilitas belum dibuka untuk pemesanan$/, () => "This facility is not open for subscription yet."],
  [/^pemesanan belum penuh$/, () => "Both books must be full before the facility can be funded."],
  [/^transfer ditolak: (.+) belum lolos allowlist \((.+)\)$/, (m) => `Transfer refused — ${m[1]} is not allowlisted (${m[2]}).`],
  [/^transfer ditolak: mandat (.+) tidak mencakup tranche (.+)$/, (m) => `Transfer refused — ${m[1]}'s mandate does not cover the ${m[2] === "SENIOR" ? "Senior" : "Junior"} tranche.`],
  [/^transfer ditolak: note sedang dihentikan sementara$/, () => "Transfer refused — all note transfers are paused."],
  [/^transfer ditolak: wallet dibekukan$/, () => "Transfer refused — the sender or recipient wallet is frozen."],
  [/^posisi (.+) hanya (\d+)$/, (m) => `${m[1]} only holds ${rp(Number(m[2]))} in that tranche.`],
  [/^penerima sama dengan pengirim$/, () => "The recipient is the same as the sender."],
  [/^lien tidak bersih: (.+)$/, (m) => `The registry lien is not clear — ${m[1]}.`],
  [/^registri menolak$/, () => "The registry did not confirm the security right."],
  [/^langkah (.+) tidak bisa dimundurkan$/, (m) => m[1] === "draft"
    ? "This is the first step — there is nothing to go back to."
    : "This step can't be undone: the note has been issued and the trail is on chain."],
  [/^bukti gagal: (.+)$/, (m) => `Eligibility proof failed: ${m[1]!.split(", ").map((label) => PROOF_COPY[label] ?? label).join("; ")}.`],
];

const gateMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : "";
  for (const [pattern, say] of GATE_COPY) {
    const hit = raw.match(pattern);
    if (hit) return say(hit);
  }
  return "We couldn't complete that step. Please try again.";
};

/**
 * Which workspace an entry belongs to.
 *
 * `by` names the actor the server recorded, which is enough for the three human
 * roles but not for the steps it books as the system or the registry — those
 * still happened because a role asked for them. So fall back to the role whose
 * action produces that step. Note this is not STEP_OWNER: that points at whoever
 * acts next, this at whoever just acted.
 */
const ACTOR_ROLE: Record<string, Role> = {
  koperasi: "Borrower",
  pemodal: "Capital Provider",
  operator: "Compliance",
};

const STEP_ACTOR: Record<string, Role> = {
  draft: "Borrower",
  mandate_signed: "Borrower",
  approved: "Compliance",
  proven: "Compliance",
  tokenized: "Compliance",
  subscribed: "Capital Provider",
  funded: "Compliance",
  repaid: "Capital Provider",
};

const eventRole = (item: { by: string; step: string }): Role | null =>
  ACTOR_ROLE[item.by] ?? STEP_ACTOR[item.step] ?? null;

/* Tranching is fixed at tokenisation; funding only flips the note from reserved
   to active. That flip is the whole answer to "can this be traded yet". */
const NOTE_STATE: Record<string, string> = {
  reserved: "Reserved · not transferable",
  active: "Active · transferable",
  redeemed: "Redeemed",
};

const tokenUnits = (value: number) => `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)} units`;

/** Enough to show the recent shape of the work without crowding the card. */
const ACTIVITY_PREVIEW = 5;

const ACTIVITY_COPY: Record<string, string> = {
  draft: "Financing request created",
  mandate_signed: "Financing mandate signed",
  approved: "Facility review approved",
  proven: "Eligibility check completed",
  tokenized: "Note draft created",
  subscribed: "Facility fully subscribed",
  funded: "Funds released",
  repaid: "Repayment and release completed",
};

const ACTOR_COPY: Record<string, string> = {
  koperasi: "Borrower",
  pemodal: "Capital Provider",
  operator: "Compliance",
  sistem: "System",
  registri: "Registry",
};

const SEQ_STEP_MS = 260;

const REVIEW_CHECKS = [
  "Receipt signature and document hash",
  "Holder and warehouse authorization",
  "Existing security rights",
  "Valuation, insurance, and goods condition",
  "Signed financing mandate and registry consent",
];

const MANDATE_DOCS = [
  "Tokenization application",
  "Financing mandate",
  "Registry inquiry consent",
  "Data and privacy consent",
];

const MANDATE_FOLLOWS = "Financing agreement follows once an investor is selected.";

/**
 * Walks a cursor down a list so rows settle one at a time.
 *
 * This is pacing, not evidence: it never decides an outcome. Rows below the
 * cursor show that they are still queued, and a row only renders a verdict
 * once the server has actually supplied one.
 */
function useSequence(count: number, resetKey: string, stepMs = SEQ_STEP_MS) {
  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor(0); }, [resetKey, count]);
  useEffect(() => {
    if (cursor >= count) return;
    const timer = setTimeout(() => setCursor((current) => current + 1), stepMs);
    return () => clearTimeout(timer);
  }, [cursor, count, stepMs]);
  return cursor;
}

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timestamp = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});
const formatDate = (value: string) => day.format(new Date(`${value}T00:00:00Z`));

/** What a facility owes back: the capital actually committed to each tranche
 *  plus that tranche's stated target return over the agreed term. This is not an
 *  amortisation schedule (the demo has no lender calendar) but it is the note's
 *  own arithmetic, so the borrower, the capital provider, and Compliance all
 *  read one number and all three change together when it is repaid. */
const issuePrice = (faceValueIdr: number, returnBp: number, termDays: number) =>
  Math.round(faceValueIdr / (1 + (returnBp / 10_000) * (termDays / 365)));
const targetReturn = (faceValueIdr: number, returnBp: number, termDays: number) =>
  faceValueIdr - issuePrice(faceValueIdr, returnBp, termDays);

function repaymentOf(flow: Flow | null, bands: Band[]) {
  if (!flow || !bands.length) return null;
  const term = flow.request.maturityDays;
  const faceValueIdr = bands.reduce((total, band) => total + band.subscribedIdr, 0);
  const principalIdr = bands.reduce((total, band) => total + band.purchasePriceIdr, 0);
  const returnIdr = faceValueIdr - principalIdr;
  const fundedAt = flow.history.find((item) => item.step === "funded")?.at ?? null;
  return {
    term, principalIdr, faceValueIdr, returnIdr, totalIdr: faceValueIdr,
    /* What the borrower asked for on the request, and the part of it the note
       never issued. Without these the repayment figure looked unrelated to the
       amount they typed in. */
    ceilingIdr: flow.request.requestedIdr,
    undrawnIdr: Math.max(0, flow.request.requestedIdr - faceValueIdr),
    dueAt: fundedAt ? new Date(new Date(fundedAt).getTime() + term * 86_400_000) : null,
    settled: flow.step === "repaid",
    payable: flow.step === "funded",
  };
}

/** Facilities this cooperative has already settled. A demo fixture, but built on
 *  receipts that are in the seeded register and priced with `targetReturn`, so
 *  the ledger and the live facility never disagree about either. */
const SETTLED_FACILITIES = [
  { note: "ANR-RML-038", receipt: "SRG-RML-038", commodity: "Seaweed", principalIdr: 148_000_000, returnBp: 295, term: 60, settledOn: "2026-08-28" },
  { note: "ANR-KOP-034", receipt: "SRG-KOP-034", commodity: "Coffee", principalIdr: 520_000_000, returnBp: 310, term: 60, settledOn: "2026-08-12" },
  { note: "ANR-GBR-041", receipt: "SRG-GBR-041", commodity: "Gambier", principalIdr: 118_000_000, returnBp: 265, term: 90, settledOn: "2026-07-01" },
  { note: "ANR-JGG-033", receipt: "SRG-JGG-033", commodity: "Maize", principalIdr: 195_000_000, returnBp: 245, term: 60, settledOn: "2026-05-19" },
].map((item) => ({ ...item, returnIdr: targetReturn(item.principalIdr, item.returnBp, item.term) }));

const INVESTOR_DEMOS: Record<string, {
  capital: number; returnIdr: number; due: string; growth: number;
  notes: [string, string, number, string][];
  transfers: [string, string, number][];
}> = {
  "INV-BRS": { capital: 270_000_000, returnIdr: 8_600_000, due: "4 Dec 2026", growth: 50, notes: [["ANR-SRG-018", "Senior", 180_000_000, "2.4% p.a. · matures 18 Nov 2026"], ["ANR-SRG-011", "Senior", 90_000_000, "2.8% p.a. · matures 4 Dec 2026"]], transfers: [["ANR-SRG-018 · Senior", "Received from Nusantara Credit Fund · 21 Aug 2026", 40_000_000], ["ANR-SRG-007 · Senior", "Settled with Merdeka Income Fund · 17 Jul 2026", 32_500_000]] },
  "INV-DPN": { capital: 240_000_000, returnIdr: 6_200_000, due: "18 Nov 2026", growth: 31, notes: [["ANR-SRG-018", "Senior", 150_000_000, "2.4% p.a. · matures 18 Nov 2026"], ["ANR-SRG-009", "Senior", 90_000_000, "2.2% p.a. · matures 12 Jan 2027"]], transfers: [["ANR-SRG-009 · Senior", "Received from Bank Rakyat Sejahtera · 03 Sep 2026", 25_000_000]] },
  "INV-MVA": { capital: 120_000_000, returnIdr: 5_400_000, due: "15 Jan 2027", growth: 44, notes: [["ANR-SRG-024", "Junior", 70_000_000, "4.5% p.a. · matures 15 Jan 2027"], ["ANR-SRG-014", "Senior", 50_000_000, "3.1% p.a. · matures 22 Dec 2026"]], transfers: [["ANR-SRG-024 · Junior", "Received from Koperasi Induk Tani · 09 Sep 2026", 20_000_000], ["ANR-SRG-014 · Senior", "Transferred to Dana Pensiun Nusantara · 28 Aug 2026", 10_000_000]] },
  "INV-KIT": { capital: 95_000_000, returnIdr: 4_800_000, due: "28 Feb 2027", growth: 24, notes: [["ANR-SRG-024", "Junior", 65_000_000, "4.5% p.a. · matures 28 Feb 2027"], ["ANR-SRG-012", "Junior", 30_000_000, "5.0% p.a. · matures 30 Nov 2026"]], transfers: [["ANR-SRG-024 · Junior", "Transferred to Mandiri Ventura Agri · 09 Sep 2026", 20_000_000]] },
  "INV-YMS": { capital: 60_000_000, returnIdr: 2_700_000, due: "20 Dec 2026", growth: 18, notes: [["ANR-SRG-016", "Junior", 35_000_000, "4.2% p.a. · matures 20 Dec 2026"], ["ANR-SRG-010", "Junior", 25_000_000, "3.8% p.a. · matures 08 Feb 2027"]], transfers: [["ANR-SRG-016 · Junior", "Received from Mandiri Ventura Agri · 11 Aug 2026", 12_000_000]] },
  "INV-MFC": { capital: 0, returnIdr: 0, due: "—", growth: 0, notes: [], transfers: [] },
  "INV-NFO": { capital: 145_000_000, returnIdr: 5_900_000, due: "12 Mar 2027", growth: 29, notes: [["ANR-KKO-035", "Junior", 55_000_000, "4.4% p.a. · matures 12 Mar 2027"], ["ANR-BRS-032", "Senior", 90_000_000, "2.6% p.a. · matures 17 Dec 2026"]], transfers: [["ANR-KKO-035 · Junior", "Received from Banyan Commodity Traders · 02 Sep 2026", 15_000_000]] },
  "INV-JFS": { capital: 180_000_000, returnIdr: 4_900_000, due: "24 Jan 2027", growth: 22, notes: [["ANR-GBH-031", "Senior", 110_000_000, "2.3% p.a. · matures 24 Jan 2027"], ["ANR-GKP-048", "Senior", 70_000_000, "2.5% p.a. · matures 15 Mar 2027"]], transfers: [] },
  "INV-STF": { capital: 72_000_000, returnIdr: 3_500_000, due: "15 Apr 2027", growth: 38, notes: [["ANR-AGR-052", "Junior", 32_000_000, "4.8% p.a. · matures 15 Apr 2027"], ["ANR-KDL-049", "Senior", 40_000_000, "2.7% p.a. · matures 10 Dec 2026"]], transfers: [["ANR-AGR-052 · Junior", "Transferred to Raka Pranoto · 06 Sep 2026", 8_000_000]] },
  "INV-BCT": { capital: 105_000_000, returnIdr: 4_600_000, due: "05 Feb 2027", growth: 33, notes: [["ANR-PNG-055", "Junior", 45_000_000, "4.6% p.a. · matures 05 Feb 2027"], ["ANR-TPK-056", "Senior", 60_000_000, "2.9% p.a. · matures 28 Dec 2026"]], transfers: [["ANR-PNG-055 · Junior", "Transferred to Nusantara Family Office · 02 Sep 2026", 15_000_000]] },
  "INV-RPR": { capital: 28_000_000, returnIdr: 1_500_000, due: "15 Apr 2027", growth: 41, notes: [["ANR-AGR-052", "Junior", 28_000_000, "4.8% p.a. · matures 15 Apr 2027"]], transfers: [["ANR-AGR-052 · Junior", "Received from Sahabat Tani Funding · 06 Sep 2026", 8_000_000]] },
  "INV-RKN": { capital: 0, returnIdr: 0, due: "—", growth: 0, notes: [], transfers: [] },
};

/** Small lock, used wherever an action is closed off rather than merely idle. */
const lockIcon = (
  <svg className="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="4" y="10.5" width="16" height="10.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  /* Claimed synchronously so the hashchange that follows a navigate() does not
     start a second transition for a view we are already moving to. */
  const viewRef = useRef(view);
  const [selectedRole, setSelectedRole] = useState<Role>("Borrower");
  const [activeRole, setActiveRole] = useState<Role | null>(() => {
    const saved = sessionStorage.getItem(WORKSPACE_KEY);
    return ROLES.includes(saved as Role) ? saved as Role : null;
  });
  const [workspaceSection, setWorkspaceSection] = useState("Overview");
  const [institutionReady, setInstitutionReady] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(sessionStorage.getItem(INSTITUTION_KEY) ?? "{}"); }
    catch { return {}; }
  });
  /* One draft row per receipt the borrower means to propose. Several can be
     open at once because a borrower holds several commodities, and each row is
     still proposed on its own — intake reviews receipts, not batches. */
  const [proposeIds, setProposeIds] = useState<string[]>([""]);
  const [investorId, setInvestorId] = useState("");
  /** Once a human picks an investor, stop steering it for them. */
  const investorPicked = useRef(false);
  const [tranche, setTranche] = useState<TrancheName>("SENIOR");
  const [amount, setAmount] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [startingNew, setStartingNew] = useState(false);
  const [esrgs, setEsrgs] = useState<ESrg[]>([]);
  const [receiptId, setReceiptId] = useState("");
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [intakeOptions, setIntakeOptions] = useState<IntakeOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const acceptedReceipts = esrgs.filter(receipt => intake?.receipts[receipt.id] === "accepted");

  const [flow, setFlow] = useState<Flow | null>(null);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [chain, setChain] = useState<Chain | null>(null);
  const [atsNote, setAtsNote] = useState<Note | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastCommitment, setLastCommitment] = useState<{ investorId: string; tranche: TrancheName; unitsIdr: number } | null>(null);
  const [listing, setListing] = useState<{ sellerId: string; buyerId: string; tranche: TrancheName; unitsIdr: number; priceIdr: number } | null>(null);
  const [askPrice, setAskPrice] = useState("");
  const [controlInvestorId, setControlInvestorId] = useState("");
  const [kycOverrides, setKycOverrides] = useState<Record<string, boolean>>({});
  const [mandateOverrides, setMandateOverrides] = useState<Record<string, TrancheName[]>>({});
  const [distributionKind, setDistributionKind] = useState<DistributionKind>("Coupon");
  const [distributionAmount, setDistributionAmount] = useState("4500000");
  const [distributions, setDistributions] = useState<{ id: number; kind: DistributionKind; amountIdr: number; feeIdr: number; status: "Scheduled" | "Distributed" }[]>([
    { id: 1, kind: "Coupon", amountIdr: 4_500_000, feeIdr: 22_500, status: "Scheduled" },
    { id: 2, kind: "Dividend", amountIdr: 3_000_000, feeIdr: 15_000, status: "Distributed" },
    { id: 3, kind: "Royalty", amountIdr: 1_250_000, feeIdr: 6_250, status: "Distributed" },
  ]);
  const [sequence, setSequence] = useState<{ id: string; count: number } | null>(null);
  const [activityAll, setActivityAll] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    api.esrgs()
      .then(setEsrgs)
      .catch(() => setErr("We couldn't load the available warehouse receipts. Please try again."))
      .finally(() => setLoading(false));
    api.note().then(setAtsNote).catch(() => {});
    api.mode().then(setMode).catch(() => {});
    api.investors().then((list) => {
      setInvestors(list);
      setControlInvestorId((current) => current || list[0]?.id || "");
      /* Default to an investor who can actually act, not the blocked one. */
      setInvestorId((current) => current || list.find((x) => x.allowlisted)?.id || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const syncView = () => applyView(viewFromHash());
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  /** Every window polls the same server state, so three browsers on three roles
   *  stay in step without any of them driving the others. */
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      if (busyRef.current) return;
      const result = await syncWorkspace(api);
      if (!alive) return;
      if (result.intake) {
        setFlow(result.flow);
        setIntake(result.intake.state);
        setIntakeOptions(result.intake.options);
        setLoadError(null);
        return;
      }
      setLoadError((current) => current ?? result.error);
    };
    sync();
    const timer = setInterval(sync, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const selectedReceipt = esrgs.find((esrg) => esrg.id === receiptId) ?? null;
  const flowReceipt = flow ? esrgs.find((esrg) => esrg.id === flow.request.esrgId) ?? null : null;
  /* What this workspace is working on, most committed first. Falling back to
     the first seeded receipt named a facility that nobody had chosen, so an
     untouched workspace read as if it were financing tea. Intake keys are in
     the order they were added, so the last one is the most recent. */
  const intakeIds = Object.keys(intake?.receipts ?? {});
  const latestIntakeId = [...intakeIds].reverse().find(id => intake?.receipts[id] === "accepted") ?? intakeIds[intakeIds.length - 1];
  const facility = flowReceipt ?? selectedReceipt ?? esrgs.find(esrg => esrg.id === latestIntakeId) ?? null;
  const stepOwner: Role = flow && !startingNew ? STEP_OWNER[flow.step] ?? "Borrower" : Object.values(intake?.receipts ?? {}).includes("proposed") && !acceptedReceipts.length ? "Compliance" : "Borrower";
  const screen: Screen = !flow || startingNew
    ? "pick"
    : STEP_SCREEN[flow.step] ?? "pick";

  useEffect(() => { headingRef.current?.focus(); }, [screen, activeRole]);

  /** The order book belongs to the facility, not to the window that filled it. */
  useEffect(() => {
    if (!flow || !["tokenized", "subscribed", "funded", "repaid"].includes(flow.step)) {
      setBands([]);
      setPositions([]);
      return;
    }
    const requestId = flow.request.id;
    api.tranches(requestId).then(setBands).catch(() => {});
    api.positions(requestId).then(setPositions).catch(() => {});
  }, [flow?.request.id, flow?.step, flow?.subscriptions.length, flow?.transfers.length]);

  /** Contract state is keyed by receipt hash, so it has to follow the selection. */
  useEffect(() => {
    if (!facility) return;
    setChain(null);
    api.chain(facility.id).then(setChain).catch(() => setChain(null));
  }, [facility?.id]);

  const seqCursor = useSequence(sequence?.count ?? 0, sequence?.id ?? "");
  const investorName = (id: string) => investors.find((x) => x.id === id)?.name ?? id;
  const bandOf = (name: TrancheName) => bands.find((b) => b.name === name) ?? null;
  const me = investors.find((x) => x.id === investorId) ?? null;
  const investorDemo = (INVESTOR_DEMOS[investorId] ?? INVESTOR_DEMOS["INV-BRS"])!;
  const myPositions = positions.filter((x) => x.investorId === investorId);
  const open = bandOf(tranche);
  const room = open ? open.capacityIdr - open.subscribedIdr : 0;
  /* Ownership only leaves the capital provider once every tranche is full, so
     the panel has to show the whole book — a filled Senior book alone looks
     like nothing happened. */
  const bookShortfall = bands.reduce((left, band) => left + Math.max(0, band.capacityIdr - band.subscribedIdr), 0);
  /* The tranche book of THIS request. `atsNote` is the reference contract on
     Hedera and always reports its own fixed facility, so it cannot answer
     "how much has this borrower raised". */
  const issuedIdr = bands.reduce((total, band) => total + band.capacityIdr, 0);
  const subscribedIdr = bands.reduce((total, band) => total + band.subscribedIdr, 0);
  const purchasePriceIdr = bands.reduce((total, band) => total + band.purchasePriceIdr, 0);
  const juniorBand = bands.find((band) => band.name === "JUNIOR")?.capacityIdr ?? 0;
  const seniorBand = bands.find((band) => band.name === "SENIOR")?.capacityIdr ?? 0;
  const juniorCommitted = bandOf("JUNIOR")?.subscribedIdr ?? 0;
  const seniorUnlocked = juniorBand ? Math.min(seniorBand, Math.floor(juniorCommitted * seniorBand / juniorBand)) : 0;
  /* Capacity-weighted, so the borrower reads one cost rather than averaging two
     tranche rates that carry different weight. */
  const blendedBp = issuedIdr ? bands.reduce((n, b) => n + b.capacityIdr * b.returnBp, 0) / issuedIdr : 0;
  const repayment = repaymentOf(flow, bands);
  /** Largest ticket this investor could write into what is left of the tranche. */
  const suggested = me ? Math.min(room, me.ticketIdr.max) : 0;
  const suggestedPrice = open ? issuePrice(Number(amount) || 0, open.returnBp, flow?.request.maturityDays ?? 90) : 0;
  const eligibleRecipients = investors.filter((item) => item.id !== investorId
    && (kycOverrides[item.id] ?? item.allowlisted)
    && (mandateOverrides[item.id] ?? item.mandate).includes(tranche)
    && !flow?.controls.frozenInvestorIds.includes(item.id));
  const controlledInvestor = investors.find((item) => item.id === controlInvestorId) ?? investors[0] ?? null;
  const controlledKyc = controlledInvestor ? kycOverrides[controlledInvestor.id] ?? controlledInvestor.allowlisted : false;
  const controlledMandates = controlledInvestor ? mandateOverrides[controlledInvestor.id] ?? controlledInvestor.mandate : [];

  /* The API still enforces every transfer gate. The demo form only offers
     recipients who can accept the selected partition, so its default path is
     a successful trade rather than a deliberately mismatched mandate. */
  useEffect(() => {
    if (flow?.step !== "funded" || myPositions.length === 0) return;
    if (!myPositions.some((item) => item.tranche === tranche)) {
      setTranche(myPositions[0]!.tranche);
      return;
    }
    if (!eligibleRecipients.some((item) => item.id === recipientId)) setRecipientId(eligibleRecipients[0]?.id ?? "");
  }, [flow?.step, flow?.controls.frozenInvestorIds, investorId, tranche, recipientId, myPositions.length, investors]);

  /* Senior arrives already covered by the standing line, so a form defaulting to
     it opens with nothing to commit — and the default investor holds a senior-only
     mandate, so it could not commit there anyway. Point both at the tranche that
     is actually open. The investor is only corrected until someone picks one, so
     deliberately choosing a mismatched investor still demonstrates the refusal. */
  useEffect(() => {
    if (bands.length === 0) return;
    const here = bands.find((band) => band.name === tranche);
    const openBand = here && here.capacityIdr - here.subscribedIdr > 0
      ? here
      : bands.find((band) => band.capacityIdr - band.subscribedIdr > 0);
    if (!openBand) return;
    if (openBand.name !== tranche) setTranche(openBand.name);
    if (investorPicked.current) return;
    const acting = investors.find((x) => x.id === investorId);
    if (acting?.allowlisted && acting.mandate.includes(openBand.name)) return;
    const fit = investors.find((x) => x.allowlisted && x.mandate.includes(openBand.name));
    if (fit) setInvestorId(fit.id);
  }, [bands, investors, tranche, investorId]);

  /* Propose the amount rather than hint it. A placeholder of "50000000" is
     indistinguishable from a filled field, which left the form looking ready
     while the value was still empty and Subscribe stayed disabled. */
  /* activeRole is a dependency because entering a workspace clears the amount,
     and by then the tranches have usually already loaded — without it the
     proposal is computed once, wiped on entry, and never offered again. */
  useEffect(() => {
    if (!me || !open) return;
    setAmount(suggested >= me.ticketIdr.min ? String(suggested) : "");
  }, [investorId, tranche, activeRole, open?.subscribedIdr, open?.capacityIdr]);

  /* Replays whenever a different proof lands; the nullifier is stable across polls. */
  const proofChecks = flow?.proof?.checks ?? [];
  const proofCursor = useSequence(proofChecks.length, flow?.proof?.nullifier ?? "");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (error) { setErr(gateMessage(error)); } finally { setBusy(false); }
  };

  const start = (esrg: ESrg) => run(async () => {
    if (activeRole !== "Borrower" || intake?.borrower.status !== "confirmed" || !intake.humanCheck || intake.receipts[esrg.id] !== "accepted") throw new Error("receipt intake incomplete");
    const created = await api.create(esrg.id);
    setStartingNew(false);
    setAmount("");
    setFlow(created);
  });

  const advance = (step: string) => run(async () => {
    setFlow(await api.step(flow!.request.id, step));
  });

  const beginDocumentSigning = () => {
    const signingWindow = window.open("about:blank", "_blank");
    run(async () => {
      try {
        const next = await api.signing(flow!.request.id);
        setFlow(next);
        if (next.documentSigning?.url && signingWindow) signingWindow.location.href = next.documentSigning.url;
        else signingWindow?.close();
      } catch (error) {
        signingWindow?.close();
        throw error;
      }
    });
  };

  /** Runs the step and the row-by-row sweep together, settling on the slower of
   *  the two. The sweep is presentation; the outcome is whatever the API returns. */
  const advanceSequenced = (step: string, count: number) => run(async () => {
    setSequence({ id: `${step}-${Date.now()}`, count });
    try {
      const [next] = await Promise.all([
        api.step(flow!.request.id, step),
        new Promise((resolve) => setTimeout(resolve, count * SEQ_STEP_MS + 240)),
      ]);
      setFlow(next);
    } finally {
      setSequence(null);
    }
  });

  const subscribe = () => run(async () => {
    const commitment = { investorId, tranche, unitsIdr: Number(amount) };
    const next = await api.subscribe(flow!.request.id, {
      ...commitment,
    });
    setFlow(next);
    setLastCommitment(commitment);
    setAmount("");
    setWorkspaceSection("My notes");
  });

  const transfer = (units: number) => run(async () => {
    setFlow(await api.transfer(flow!.request.id, {
      fromInvestorId: investorId, toInvestorId: recipientId, tranche, unitsIdr: units,
    }));
  });

  const settleListing = () => run(async () => {
    if (!listing) return;
    setFlow(await api.transfer(flow!.request.id, {
      fromInvestorId: listing.sellerId, toInvestorId: listing.buyerId, tranche: listing.tranche, unitsIdr: listing.unitsIdr,
    }));
    setListing(null);
  });

  const pauseTransfers = (paused: boolean) => run(async () => {
    setFlow(await api.pause(flow!.request.id, paused));
  });

  const freezeInvestor = (id: string, frozen: boolean) => run(async () => {
    setFlow(await api.freeze(flow!.request.id, id, frozen));
  });

  const scheduleDistribution = () => {
    const amountIdr = Number(distributionAmount);
    if (amountIdr <= 0) return;
    setDistributions((items) => [...items, { id: Date.now(), kind: distributionKind, amountIdr, feeIdr: Math.floor(amountIdr * 0.005), status: "Scheduled" }]);
    setDistributionAmount("");
  };

  /** Only clears this window's view; the facility itself stays on the server
   *  until a new request replaces it as the most recent one. */
  const reset = () => {
    setStartingNew(true);
    setAmount("");
    setErr(null);
  };

  const applyView = (next: View) => {
    if (viewRef.current === next) return;
    viewRef.current = next;
    withViewTransition(() => setView(next));
  };

  const navigate = (next: View) => {
    const hash = next === "landing" ? "#home" : next === "how" ? "#how-it-works" : `#${next}`;
    applyView(next);
    if (window.location.hash !== hash) window.location.hash = hash;
    /* Instant, not smooth: a 400ms scroll would still be running under a 200ms
       crossfade and the new page would slide while it faded in. */
    window.scrollTo({ top: 0 });
  };

  const openAccess = (role?: Role) => {
    if (role) setSelectedRole(role);
    navigate("access");
  };

  const enterWorkspace = () => {
    setActiveRole(selectedRole);
    sessionStorage.setItem(WORKSPACE_KEY, selectedRole);
    setWorkspaceSection("Overview");
    /* View-only flags belong to the previous workspace, not the facility. */
    setStartingNew(false);
    setAmount("");
    setActivityAll(false);
    setErr(null);
    navigate("workspace");
  };

  /* One control instead of an undo per role: clearing this browser's demo
     records and the shared server flow, then reloading, puts every workspace
     back where a first-time visitor finds it. */
  const resetDemo = async () => {
    try {
      sessionStorage.removeItem(WORKSPACE_KEY);
      sessionStorage.removeItem(INSTITUTION_KEY);
    } catch { /* a browser refusing storage has nothing to forget */ }
    /* The demo's records are the server's: one call clears them for every role. */
    await api.reset().catch(() => {});
    /* Drop the hash, then reload: the app reopens on the front page with every
       value at its own default, rather than at whatever this function
       remembered to clear. */
    window.history.replaceState(null, "", window.location.pathname);
    window.location.reload();
  };

  /* Once the note exists the borrower's side is done: senior is covered by a
     standing line at tokenisation, and subscription and registry release are
     settled between Compliance and the capital providers. So the borrower is
     shown a confirmation for those two steps rather than someone else's desk. */
  const borrowerAwaitingRelease = activeRole === "Borrower" && !!flow && !startingNew
    && (flow.step === "tokenized" || flow.step === "subscribed");

  /* From that same point the request itself is finished, and what is left is
     the repayment — outstanding until the facility settles. */
  const borrowerNoteIssued = activeRole === "Borrower" && !!flow && !startingNew
    && ["tokenized", "subscribed", "funded", "repaid"].includes(flow.step);
  const borrowerRepayment = borrowerNoteIssued && flow!.step !== "repaid";
  const page = SCREEN[screen];
  const pageTitle = screen === "note" && facility
    ? `${facility.id} · ${facility.commodity}`
    : screen === "done" && activeRole !== "Capital Provider" ? "Track repayment" : page.title;
  const pageEyebrow = borrowerAwaitingRelease
    ? "Funding secured"
    : screen === "done" && activeRole !== "Capital Provider" ? "Facility servicing" : page.eyebrow;
  const adapterMode = (capability: string) => mode?.adapters.find((item) => item.capability === capability)?.mode ?? "simulated";
  const status = screen === "done" && flow?.step === "repaid" ? "Repaid" : ({
    pick: "Not started", mandate: "Signature pending", review: "Under review", proof: "Verification",
    note: "Open for subscription", fund: "Ready to fund", done: "Active",
  } satisfies Record<Screen, string>)[screen];

  const actOnIntake = async (action: IntakeAction) => {
    try {
      const view = await api.intakeAct(activeRole ?? selectedRole, action);
      setIntake(view.state);
      setIntakeOptions(view.options);
      setErr(null);
    } catch (error) { setErr(error instanceof Error ? error.message : "Could not record that step."); }
  };
  const registerDemoBorrower = async (profile: import("./api").BorrowerProfile) => {
    try {
      await api.intakeAct("Borrower", { kind: "submit-borrower", profile });
      await api.intakeAct("Compliance", { kind: "approve-borrower" });
      const next = await api.intakeAct("Borrower", { kind: "confirm-borrower" });
      setIntake(next.state); setIntakeOptions(next.options); setErr(null);
    } catch (error) { setErr(error instanceof Error ? error.message : "Could not complete registration."); }
  };
  if (view === "landing") {
    return <LandingPage onNavigate={navigate} onAccess={openAccess} />;
  }

  if (view === "how") {
    return <HowItWorksPage onNavigate={navigate} onAccess={openAccess} />;
  }

  if (view === "access" || !activeRole) {
    return <AccessPage selectedRole={selectedRole} onSelectRole={setSelectedRole} onContinue={enterWorkspace} onNavigate={navigate} />;
  }

  if (!intake || !intakeOptions) {
    return <div className="public-page"><main className="landing-main">
      <p className="supporting-copy">{loadError ?? "Loading the shared record…"}</p>
      {loadError ? <button className="access-submit" onClick={() => window.location.reload()}>Try again</button> : null}
    </main></div>;
  }

  if (activeRole === "Borrower" && intake.borrower.status !== "confirmed") {
    return <BorrowerOnboarding state={intake} options={intakeOptions} error={err} onAction={actOnIntake} onComplete={registerDemoBorrower} onSwitch={() => openAccess()} onReset={resetDemo} onHome={() => navigate("landing")} />;
  }

  if ((activeRole === "Capital Provider" || activeRole === "Compliance") && !institutionReady[activeRole]) {
    return <InstitutionOnboarding role={activeRole} onComplete={() => {
      const ready = { ...institutionReady, [activeRole]: true };
      setInstitutionReady(ready);
      sessionStorage.setItem(INSTITUTION_KEY, JSON.stringify(ready));
    }} onSwitch={() => openAccess()} onReset={resetDemo} onHome={() => navigate("landing")} />;
  }

  const ownsStep = activeRole === stepOwner;

  /* Where this workspace owes something, and where it is only waiting. With no
     switch buttons left, the sidebar is the whole hand-off signal: a live dot
     on the section that needs this role, a still one where the facility sits
     with someone else. */
  const navMarks: Record<string, "action" | "waiting"> = {};
  if (flow && flow.step !== "repaid" && !startingNew && !borrowerNoteIssued && activeRole !== "Capital Provider") navMarks[FLOW_SECTION[activeRole]] = ownsStep ? "action" : "waiting";
  if (flow && !startingNew && activeRole === "Capital Provider" && flow.step !== "repaid") {
    const next = flow.step === "funded"
      ? ({ Overview: "Opportunities", Opportunities: "My notes", "My notes": "Transfers", Transfers: "Cashflows", Cashflows: "Cashflows" }[workspaceSection] ?? "Opportunities")
      : flow.step === "subscribed" ? "My notes" : "Opportunities";
    navMarks[next] = ownsStep ? "action" : "waiting";
  }
  /* Once the money is committed the mark leaves the finished request and
     follows the obligation to Repayments. A settled facility marks nothing. */
  if (borrowerRepayment) navMarks["Repayments"] = repayment?.payable ? "action" : "waiting";
  if (activeRole === "Compliance" && (intake.borrower.status === "submitted" || Object.values(intake.receipts).includes("proposed"))) {
    navMarks["Review queue"] = "action";
  }
  if (activeRole === "Borrower" && intake.borrower.status === "confirmed"
      && (!Object.keys(intake.receipts).length || (acceptedReceipts.length > 0 && !flow))) {
    navMarks[acceptedReceipts.length > 0 && receiptId ? FLOW_SECTION.Borrower : INTAKE_SECTION] = "action";
  }

  /* Scoped to this workspace and newest first: the sidebar already reports
     where the facility is, so repeating every role's events here said the same
     thing twice. */
  const myActivity = (flow?.history ?? [])
    .filter((item) => eventRole(item) === activeRole)
    .slice()
    .reverse();


  /** Who this window is acting as. Two windows on two investors can trade. */
  const investorPicker = (
    <label className="investor-picker">
      <span>Acting as</span>
      <select
        value={investorId}
        onChange={(event) => { investorPicked.current = true; setInvestorId(event.target.value); }}
      >
        {investors.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}{item.allowlisted ? "" : " · not allowlisted"}
          </option>
        ))}
      </select>
    </label>
  );

  const subscriptionForm = (
    <form className="subscribe-form" onSubmit={(event) => { event.preventDefault(); subscribe(); }}>
      <div className="section-heading">
        <h3>Commit capital</h3>
      </div>
      {me && (
        <div className="investor-standing">
          <div>
            <strong>{me.name}</strong>
            <span>{me.capitalType} · {me.riskProfile}</span>
          </div>
          <Badge tone={me.allowlisted ? "success" : "danger"}>{me.allowlisted ? "Allowlisted" : "Not allowlisted"}</Badge>
        </div>
      )}
      {me && !me.allowlisted && <p className="supporting-copy">{me.standing}</p>}
      {bands.length > 0 && (
        <div className="book-state">
          {bands.map((band) => {
            const left = band.capacityIdr - band.subscribedIdr;
            const name = band.name === "SENIOR" ? "Senior" : "Junior";
            return (
              <div className="book-line" key={band.name}>
                <div className="book-head">
                  <strong>{name} book</strong>
                  <span>{rp(band.subscribedIdr)} of {rp(band.capacityIdr)}</span>
                </div>
                <progress max={band.capacityIdr} value={band.subscribedIdr} aria-label={`${name} subscription`} />
                <span className="book-room">{left <= 0 ? "Full" : `${rp(left)} still open`}</span>
              </div>
            );
          })}
          <p className="book-close">
            <strong>{rp(juniorCommitted)} Junior committed → {rp(seniorUnlocked)} Senior capacity unlocked.</strong>{" "}
            {bookShortfall > 0
              ? <>{rp(bookShortfall)} of approved commitments remain before allocation.</>
              : <>Both books are full. Compliance can now record the security right and release funds.</>}
          </p>
        </div>
      )}
      <div className="subscribe-fields">
        <label>
          <span>Tranche</span>
          <select value={tranche} onChange={(event) => setTranche(event.target.value as TrancheName)}>
            <option value="SENIOR">Senior · paid first</option>
            <option value="JUNIOR">Junior · absorbs first loss</option>
          </select>
        </label>
        <label>
          <span>Maturity face value (IDR)</span>
          <input
            type="text" inputMode="numeric" value={amount ? Number(amount).toLocaleString("id-ID") : ""}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
          />
        </label>
      </div>
      {open && Number(amount) > 0 && <section className="commitment-comparison" aria-label="Commitment comparison">
        <div><span>Pay today</span><strong>{rp(suggestedPrice)}</strong></div>
        <div><span>Receive at maturity</span><strong>{rp(Number(amount))}</strong></div>
        <p>{rp(Number(amount) - suggestedPrice)} discount return · {(open.returnBp / 100).toFixed(1)}% annualized target</p>
      </section>}
      <p className="ticket-range">
        {me && room < me.ticketIdr.min
          ? `Only ${rp(room)} is left in this tranche, below ${me.name}'s minimum ticket of ${rp(me.ticketIdr.min)}. Switch tranche or act as another investor.`
          : `Ticket range ${rp(me?.ticketIdr.min ?? 0)} to ${rp(Math.min(room, me?.ticketIdr.max ?? 0))} for ${me?.name ?? "this investor"} in this tranche.`}
      </p>
      <div className="actions">
        <button type="submit" disabled={busy || !amount || !investorId}>Subscribe</button>
      </div>
    </form>
  );

  /** The whole book, biggest first, so the note reads as a held instrument
   *  rather than one line about yourself. */
  const bookTotal = positions.reduce((sum, item) => sum + item.unitsIdr, 0);
  const holderBook = [...positions].sort((a, b) => b.unitsIdr - a.unitsIdr);
  const noteState = NOTE_STATE[flow?.note?.state ?? ""] ?? "Not issued";

  const opportunitiesPanel = (
    <>
      <Card title="Token lifecycle">
        <div className="order-book">
          <div className="order-row"><span><strong>1 · Reserved note</strong><small>Compliance issues the draft series and fixes its Senior and Junior partitions.</small></span><Badge tone={flow?.note?.state === "reserved" ? "warning" : "success"}>{flow?.note ? "Issued" : "Preview"}</Badge></div>
          <div className="order-row"><span><strong>2 · Subscription commitment</strong><small>Capital is committed to a partition; this is not yet a wallet balance.</small></span><Badge tone={flow?.step === "tokenized" || flow?.step === "subscribed" ? "warning" : flow?.step === "funded" || flow?.step === "repaid" ? "success" : "neutral"}>{flow?.step === "funded" || flow?.step === "repaid" ? "Complete" : "Open"}</Badge></div>
          <div className="order-row"><span><strong>3 · Active and allocated</strong><small>Registry confirmation activates the note and allocates permissioned units to holders.</small></span><Badge tone={flow?.note?.state === "active" || flow?.note?.state === "redeemed" ? "success" : "neutral"}>{flow?.note?.state === "active" || flow?.note?.state === "redeemed" ? "Allocated" : "Pending"}</Badge></div>
          <div className="order-row"><span><strong>4 · Transferable or redeemed</strong><small>Active units may move between allowlisted holders; repayment redeems them.</small></span><Badge tone={flow?.note?.state === "redeemed" ? "success" : "neutral"}>{flow?.note?.state === "redeemed" ? "Redeemed" : "Permissioned"}</Badge></div>
        </div>
      </Card>
      <Card title="Open token partitions">
        <div className="order-book">
          {bands.map((band) => {
            const face = band.capacityIdr - band.subscribedIdr;
            const price = issuePrice(face, band.returnBp, flow?.request.maturityDays ?? 90);
            return <div className="order-row" key={band.name}><span><strong>{flow?.note?.series ?? "Pending series"} · {band.name === "SENIOR" ? "Senior" : "Junior"}</strong><small>{noteState} · {band.name === "SENIOR" ? "paid first" : "first-loss"} · {(band.returnBp / 100).toFixed(1)}% p.a.</small></span><strong>{tokenUnits(face)}<small>Pay {rp(price)} for {rp(face)} at maturity</small></strong></div>;
          })}
        </div>
        <p className="supporting-copy">1 unit represents Rp 1 of note face value. Holdings appear in My notes only after registry confirmation and activation.</p>
      </Card>
    </>
  );

  const positionsPanel = (
    <Card title="My notes">
      {flow?.step === "funded" && myPositions.length > 0 && (
        <div className="subscription-success" role="status">
          <Badge tone="success">Subscription complete</Badge>
          <span><strong>Your position is active</strong><small>Your allocated note units are shown below.</small></span>
        </div>
      )}
      {lastCommitment?.investorId === investorId && flow?.step !== "funded" && (
        <div className="subscription-success" role="status">
          <Badge tone="success">Commitment recorded</Badge>
          <span><strong>{rp(lastCommitment.unitsIdr)} in {lastCommitment.tranche === "SENIOR" ? "Senior" : "Junior"}</strong><small>Your commitment is reserved. Units activate after the books close and Compliance records the security right.</small></span>
        </div>
      )}
      {myPositions.length === 0 ? (
        <div className="position-list">
          {flow?.note ? <p className="empty-state">You hold no units in {flow.note.series}. Select the investor that subscribed to view its allocated position.</p> : <><p className="supporting-copy">Current holdings for the selected investor.</p>
          {investorDemo.notes.length ? investorDemo.notes.map(([series, trancheName, value, detail]) => <details className="position" key={series}>
            <summary><span><strong>{series} · {trancheName} partition</strong><small>{detail}</small></span><strong>{tokenUnits(value)}<small>{rp(value)} face value</small></strong></summary>
            <div className="position-detail"><Row label="Token state" value="Active · allocated" /><Row label="Token standard" value="ERC-1400 / ERC-3643" /><Row label="Allocation event" value="Registry confirmed and facility activated" /><Row label="Transfer rule" value="Allowlisted participants with a matching mandate" /></div>
          </details>) : <p className="empty-state">No positions: this investor is not allowlisted.</p>}</>}
        </div>
      ) : (
        <div className="position-list">
          {myPositions.map((item) => {
            const senior = item.tranche === "SENIOR";
            const band = bandOf(item.tranche);
            return (
              <details className="position" key={`${item.investorId}-${item.tranche}`}>
                <summary>
                  <span>
                    <strong>{senior ? "Senior" : "Junior"}</strong>
                    <small>{senior ? "Paid first" : "Absorbs first loss"} · {noteState}</small>
                  </span>
                  <strong>{tokenUnits(item.unitsIdr)}<small>{rp(item.unitsIdr)} face value</small></strong>
                </summary>
                <div className="position-detail">
                  <Row label="Issue price paid" value={band ? rp(issuePrice(item.unitsIdr, band.returnBp, flow?.request.maturityDays ?? 90)) : "—"} />
                  <Row label="Maturity face value" value={rp(item.unitsIdr)} />
                  <Row label="Discount return" value={band ? rp(targetReturn(item.unitsIdr, band.returnBp, flow?.request.maturityDays ?? 90)) : "—"} />
                  <Row label="Annualized target" value={band ? `${(band.returnBp / 100).toFixed(1)}%` : "—"} />
                  <Row label="Share of the note" value={bookTotal ? `${((item.unitsIdr / bookTotal) * 100).toFixed(1)}%` : "—"} />
                  <Row label="Tranche size" value={band ? rp(band.capacityIdr) : "—"} />
                  <Row label="Note series" value={flow?.note?.series ?? "—"} mono />
                  <Row label="Token standard" value="ERC-1400 / ERC-3643" />
                  <Row label="Partition" value={senior ? "Senior" : "Junior"} />
                  <Row label="Linked receipt" value={flow?.note?.underlying ?? "—"} mono />
                  <Row label="Allocation event" value="Registry confirmed and facility activated" />
                  <Row label="Transfer rule" value="Allowlisted holders whose mandate covers the tranche" />
                  {atsNote && <Row label="Token contract" value={atsNote.address} mono />}
                </div>
              </details>
            );
          })}
          <div className="actions secondary"><button type="button" className="secondary-button" onClick={() => setWorkspaceSection("Transfers")}>Open secondary market</button><button type="button" className="secondary-button" onClick={() => setWorkspaceSection("Cashflows")}>View cashflows</button></div>
        </div>
      )}
    </Card>
  );

  const transferPanel = (
    <Card title="Secondary market">
      {err && <div className="error-banner" role="alert">{err}</div>}
      {flow?.step === "funded" && <>
        <div className="status-strip">
          <span>Transfer policy</span>
          <Badge tone={flow.controls.paused ? "danger" : "success"}>{flow.controls.paused ? "Paused" : "Active"}</Badge>
          <small>Restrictions are enforced before settlement.</small>
        </div>
        <p className="supporting-copy">Compliance manages pause, freeze, allowlist, and mandate controls. This workspace can submit permitted transfers only.</p>
      </>}
      {!flow?.note && <><p className="supporting-copy">Token transfers open after registry confirmation activates and allocates the note.</p>{investorDemo.transfers.length ? <div className="order-book">{investorDemo.transfers.map(([series, detail, value]) => <div className="order-row" key={`${series}-${detail}`}><span><strong>{series}</strong><small>{detail}</small></span><strong>{tokenUnits(value)}<small>{rp(value)} face value</small></strong></div>)}</div> : <p className="empty-state">Transfers are restricted until KYB and allowlisting are complete.</p>}</>}
      {(flow?.step === "funded" || flow?.step === "repaid") && holderBook.length > 0 && (
        <>
          <div className="section-heading"><h3>Holder book</h3></div>
          <div className="order-book">
            {holderBook.map((item) => (
              <div
                className={`order-row${item.investorId === investorId ? " mine" : ""}`}
                key={`${item.investorId}-${item.tranche}`}
              >
                <span>
                  <strong>{investorName(item.investorId)}</strong>
                  <small>
                    {item.tranche === "SENIOR" ? "Senior" : "Junior"} · {((item.unitsIdr / bookTotal) * 100).toFixed(1)}% of the note
                    {item.investorId === investorId ? " · you" : ""}
                  </small>
                </span>
                <strong>{tokenUnits(item.unitsIdr)}<small>{rp(item.unitsIdr)} face value</small></strong>
              </div>
            ))}
          </div>
          {flow.step === "funded" && <div className="section-heading"><h3>Move units</h3></div>}
        </>
      )}
      {flow?.step === "repaid" ? (
        <p className="empty-state">All units were redeemed at maturity. The settled transfer history remains available.</p>
      ) : flow?.step !== "funded" ? (
        <p className="empty-state">Transfers open once the facility is funded and units are allocated.</p>
      ) : myPositions.length === 0 ? (
        <p className="empty-state">You hold no units in this facility.</p>
      ) : (
        <form onSubmit={(event) => {
          event.preventDefault();
          const held = myPositions.find((x) => x.tranche === tranche)?.unitsIdr ?? 0;
          const unitsIdr = Math.min(Number(amount) || 0, held);
          setListing({ sellerId: investorId, buyerId: recipientId, tranche, unitsIdr, priceIdr: Number(askPrice) || unitsIdr });
        }}>
          <div className="subscribe-fields">
            <label>
              <span>From your position</span>
              <select value={tranche} onChange={(event) => setTranche(event.target.value as TrancheName)}>
                {myPositions.map((item) => (
                  <option key={item.tranche} value={item.tranche}>
                    {item.tranche === "SENIOR" ? "Senior" : "Junior"} · {tokenUnits(item.unitsIdr)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Recipient</span>
              <select value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
                <option value="">Select an investor</option>
                {eligibleRecipients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · eligible for {tranche === "SENIOR" ? "Senior" : "Junior"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Token units</span>
              <input type="number" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label>
              <span>Sale price (IDR)</span>
              <input type="number" inputMode="numeric" value={askPrice} placeholder={amount || "0"} onChange={(event) => setAskPrice(event.target.value)} />
            </label>
          </div>
          <p className="supporting-copy">
            Recipient eligibility was verified at registration and is enforced automatically at settlement. 1 unit represents Rp 1 of face value.
          </p>
          <div className="actions">
            <button type="submit" disabled={busy || !recipientId || !amount || flow.controls.paused}>Create sale order</button>
          </div>
        </form>
      )}
      {listing && (
        <div className="transaction-review" role="status">
          <div><span className="section-kicker">Sale order ready</span><h3>{tokenUnits(listing.unitsIdr)} · {listing.tranche === "SENIOR" ? "Senior" : "Junior"} position</h3><p>{investorName(listing.sellerId)} → {investorName(listing.buyerId)}</p></div>
          <dl><div><dt>Face value</dt><dd>{rp(listing.unitsIdr)}</dd></div><div><dt>Sale price</dt><dd>{rp(listing.priceIdr)}</dd></div><div><dt>Automatic checks</dt><dd>Passed</dd></div></dl>
          <div className="actions"><button type="button" disabled={busy || flow?.controls.paused} onClick={settleListing}>Accept and settle</button><button type="button" className="secondary-button" onClick={() => setListing(null)}>Cancel order</button></div>
        </div>
      )}
      {flow && flow.transfers.length > 0 && (
        <>
          <div className="section-heading"><h3>Settled</h3></div>
        <div className="order-book">
          {flow.transfers.map((item) => (
            <div className="order-row" key={item.id}>
              <span><strong>{investorName(item.fromInvestorId)} → {investorName(item.toInvestorId)}</strong><small>{item.tranche === "SENIOR" ? "Senior" : "Junior"} · settled</small></span>
              <strong>{tokenUnits(item.unitsIdr)}<small>{rp(item.unitsIdr)} face value</small></strong>
            </div>
          ))}
        </div>
        </>
      )}
    </Card>
  );

  /** Put a receipt in the first empty row, or open one for it. */
  const chooseInRow = (id: string) => (rows: string[]) =>
    rows.includes(id) ? rows : rows.some(row => !row) ? rows.map((row, i) => i === rows.indexOf("") ? id : row) : [...rows, id];

  const intakePanel = <IntakePanel state={intake} receipts={esrgs} role={activeRole} onAction={actOnIntake} proposeIds={proposeIds} onProposeIds={setProposeIds} onSelect={receipt => {
    setReceiptId(receipt.id); setStartingNew(true); setWorkspaceSection(FLOW_SECTION.Borrower);
  }} />;

  /* Repaying is the borrower's last action, so it sits in the section the
     sidebar points at rather than back inside a financing request they have
     already finished. */
  const repaymentPanel = repayment && flow && (
    <>
      {err && <div className="error-banner" role="alert">{err}</div>}
      <Card title={repayment.settled ? "Facility settled" : "Repayment"}>
        <div className="funded-note">
          <Badge tone={repayment.settled ? "success" : repayment.payable ? "warning" : "neutral"}>
            {repayment.settled ? "Security right released" : repayment.payable ? "Outstanding" : "Awaiting disbursement"}
          </Badge>
          <strong>{rp(repayment.totalIdr)}</strong>
          <p>{rp(repayment.principalIdr)} of committed capital and {rp(repayment.returnIdr)} of target return on note {flow.note?.series ?? flow.request.id}, secured on {flow.request.esrgId}.</p>
          <p className="supporting-copy">{repayment.settled
            ? `The security right over ${flow.request.esrgId} is released and the receipt is free to back a new facility. It is now in round ${flow.request.epoch}.`
            : `${repayment.undrawnIdr > 0
                ? `You asked for a ${rp(repayment.ceilingIdr)} ceiling and drew ${rp(repayment.principalIdr)} of it; the remaining ${rp(repayment.undrawnIdr)} was never issued and is not repayable. `
                : `The full ${rp(repayment.ceilingIdr)} ceiling was drawn. `}${repayment.payable
                ? "Settling returns capital to both tranches in the agreed order, senior first, and releases the security right over the receipt."
                : "The amount is fixed by the note at issuance and becomes payable once Compliance records the security right and releases the funds."}`}</p>
          <dl className="wide">
            <div><dt>Requested ceiling</dt><dd>{rp(repayment.ceilingIdr)}</dd></div>
            <div><dt>Drawn</dt><dd>{rp(repayment.principalIdr)}</dd></div>
            <div><dt>Term</dt><dd>{repayment.term} days</dd></div>
            <div><dt>Due</dt><dd>{repayment.dueAt ? day.format(repayment.dueAt) : "On disbursement"}</dd></div>
          </dl>
          {!repayment.settled && (
            <div className="actions">
              <button type="button" className={repayment.payable ? "" : "locked-action"} disabled={busy || !repayment.payable} onClick={() => advance("repay")}>
                {repayment.payable ? `Repay ${rp(repayment.totalIdr)}` : <>{lockIcon}Awaiting disbursement</>}
              </button>
            </div>
          )}
        </div>
      </Card>
      <Card title="Settled facilities">
        <p className="supporting-copy ledger-intro">Every facility this cooperative has repaid. Each release returned the receipt to the register, which is why several of these receipts are available to pledge again.</p>
        <div className="order-book">
          {SETTLED_FACILITIES.map((item) => (
            <div className="order-row" key={item.note}>
              <span>
                <strong>{item.note} · {item.commodity}</strong>
                <small>{item.receipt} · {item.term} days at {(item.returnBp / 100).toFixed(2)}% p.a. · settled {formatDate(item.settledOn)}</small>
              </span>
              <strong>{rp(item.principalIdr + item.returnIdr)}</strong>
            </div>
          ))}
        </div>
        <dl className="ledger-total">
          <div><dt>Facilities settled</dt><dd>{SETTLED_FACILITIES.length}</dd></div>
          <div><dt>Capital repaid</dt><dd>{rp(SETTLED_FACILITIES.reduce((total, item) => total + item.principalIdr, 0))}</dd></div>
          <div><dt>Return paid</dt><dd>{rp(SETTLED_FACILITIES.reduce((total, item) => total + item.returnIdr, 0))}</dd></div>
          <div><dt>On time</dt><dd>{SETTLED_FACILITIES.length} of {SETTLED_FACILITIES.length}</dd></div>
        </dl>
      </Card>
    </>
  );

  const liveInvestorPosition = activeRole === "Capital Provider" && !!flow && ["funded", "repaid"].includes(flow.step);
  const liveSenior = myPositions.filter((item) => item.tranche === "SENIOR").reduce((sum, item) => sum + item.unitsIdr, 0);
  const liveJunior = myPositions.filter((item) => item.tranche === "JUNIOR").reduce((sum, item) => sum + item.unitsIdr, 0);
  const liveInvestorFace = liveSenior + liveJunior;
  const liveInvestorPrice = myPositions.reduce((sum, item) => sum + issuePrice(item.unitsIdr, bandOf(item.tranche)?.returnBp ?? 0, flow?.request.maturityDays ?? 90), 0);
  const servicingPrincipal = liveInvestorPosition
    ? liveInvestorPrice
    : repayment?.principalIdr ?? (activeRole === "Capital Provider" ? investorDemo.capital : 270_000_000);
  const servicingReturn = liveInvestorPosition
    ? liveInvestorFace - liveInvestorPrice
    : repayment?.returnIdr ?? (activeRole === "Capital Provider" ? investorDemo.returnIdr : 8_600_000);
  const servicingDue = repayment?.dueAt ? day.format(repayment.dueAt) : activeRole === "Capital Provider" ? investorDemo.due : "4 Dec 2026";
  const servicingStatus = !me?.allowlisted ? "Restricted" : repayment?.settled ? "Distributed" : repayment?.payable ? "Payment due" : "Performing";
  const demoSenior = liveInvestorPosition ? liveSenior : investorDemo.notes.filter(([, trancheName]) => trancheName === "Senior").reduce((sum, note) => sum + note[2], 0);
  const demoJunior = liveInvestorPosition ? liveJunior : investorDemo.notes.filter(([, trancheName]) => trancheName === "Junior").reduce((sum, note) => sum + note[2], 0);
  const servicingFace = servicingPrincipal + servicingReturn;
  const seniorFace = bandOf("SENIOR")?.subscribedIdr ?? demoSenior;
  const juniorFace = bandOf("JUNIOR")?.subscribedIdr ?? demoJunior;
  const capitalCashflowsPanel = <>
    <Card title="Repayment waterfall">
      <div className="funded-note">
        <Badge tone={repayment?.settled ? "success" : "neutral"}>{servicingStatus}</Badge>
        <strong>{rp(servicingFace)}</strong>
        <p>Your maturity claim from discounted note units. Distribution and unit redemption are automatic; capital providers do not approve or route funds.</p>
        <dl className="wide">
          <div><dt>Purchase price paid</dt><dd>{rp(servicingPrincipal)}</dd></div>
          <div><dt>Discount return</dt><dd>{rp(servicingReturn)}</dd></div>
          <div><dt>Maturity face value</dt><dd>{rp(servicingFace)}</dd></div>
          <div><dt>Due</dt><dd>{servicingDue}</dd></div>
          <div><dt>Your action</dt><dd>{repayment?.settled ? "Complete" : "Observe automatic redemption"}</dd></div>
        </dl>
        {flow?.step === "funded" && <div className="actions"><button type="button" disabled={busy} onClick={() => advance("repay")}>Process maturity</button></div>}
      </div>
      {servicingPrincipal ? <div className="order-book">
        {seniorFace > 0 && <div className="order-row"><span><strong>1 · Senior maturity claims</strong><small>Paid first, pro rata to Senior token holders</small></span><strong>{rp(flow?.settlement?.seniorPaidIdr ?? seniorFace)}<small>of {rp(seniorFace)} face value</small></strong></div>}
        {juniorFace > 0 && <div className="order-row"><span><strong>2 · Junior maturity claims</strong><small>Paid only after Senior is satisfied; absorbs first loss</small></span><strong>{rp(flow?.settlement?.juniorPaidIdr ?? juniorFace)}<small>of {rp(juniorFace)} face value</small></strong></div>}
      </div> : <p className="empty-state">No distributions: this investor is not allowlisted.</p>}
    </Card>
    <Card title="Distribution ledger">
      <div className="fee-summary"><div><span>Servicing fee</span><strong>0.50%</strong><small>Deducted from each distribution</small></div><div><span>Transfer fee</span><strong>0.10%</strong><small>Charged on secondary sales</small></div><div><span>Net settlement</span><strong>Automatic</strong><small>Paid pro rata by units held</small></div></div>
      <div className="order-book">
        {distributions.map((item) => <div className="order-row" key={item.id}><span><strong>{item.kind} distribution</strong><small>{rp(item.feeIdr)} fee · net {rp(item.amountIdr - item.feeIdr)}</small></span><span><Badge tone={item.status === "Distributed" ? "success" : "neutral"}>{item.status}</Badge><strong>{rp(item.amountIdr)}</strong></span></div>)}
      </div>
      <p className="supporting-copy">Coupon is the default note return. Dividend and royalty use the same pro-rata distribution rail when an issued asset enables them.</p>
    </Card>
    <Card title="Shortfall protection">
      <p className="supporting-copy">Available cash equals recovered cash less permitted costs. Junior maturity claims absorb loss before Senior claims. Notes and cashflows update automatically from the servicing record.</p>
      <div className="info-panel"><strong>No intervention required</strong><span>Compliance manages overdue review, cure, recovery, and enforcement evidence.</span></div>
    </Card>
  </>;

  const complianceServicingPanel = <>
    <Card title="Collateral reconciliation">
      <div className="finance-metrics">
        <div><span>Registry quantity</span><strong>{facility ? `${facility.quantityKg.toLocaleString("en-US")} kg` : "—"}</strong><small>Official receipt record</small></div>
        <div><span>Warehouse quantity</span><strong>{facility ? `${facility.quantityKg.toLocaleString("en-US")} kg` : "—"}</strong><small>Latest signed observation</small></div>
        <div><span>Effective quantity</span><strong>{facility ? `${facility.quantityKg.toLocaleString("en-US")} kg` : "—"}</strong><small>Lower reconciled value</small></div>
        <div><span>Eligible collateral</span><strong>{facility ? rp(facility.valueIdr) : "—"}</strong><small>Before the facility LTV limit</small></div>
        <div><span>Difference</span><strong>0.00%</strong><small>Within the 0.50% tolerance</small></div>
        <div><span>Observation</span><strong>Current</strong><small>Ready for the demo lifecycle</small></div>
      </div>
    </Card>
    <Card title="Facility servicing">
      <div className="funded-note">
        <Badge tone={repayment?.payable ? "warning" : repayment?.settled ? "success" : "neutral"}>{repayment?.settled ? "Closed" : repayment?.payable ? "Repayment due" : "Monitoring"}</Badge>
        <strong>{flow?.note?.series ?? "ANR-SRG-024"}</strong>
        <p>Compliance owns payment verification and exceptions. Distribution itself follows the approved waterfall automatically.</p>
        <dl className="wide">
          <div><dt>Amount due</dt><dd>{rp(servicingPrincipal + servicingReturn)}</dd></div>
          <div><dt>Due</dt><dd>{servicingDue}</dd></div>
          <div><dt>Security right</dt><dd>{repayment?.settled ? "Released" : "Held"}</dd></div>
          <div><dt>Current state</dt><dd>{servicingStatus}</dd></div>
        </dl>
      </div>
    </Card>
    <Card title="Distribution scheduler">
      <div className="fee-summary"><div><span>Servicing fee</span><strong>0.50%</strong><small>Applied at execution</small></div><div><span>Transfer fee</span><strong>0.10%</strong><small>Applied to secondary settlement</small></div><div><span>Recipient rule</span><strong>Record date</strong><small>Pro rata to eligible unit holders</small></div></div>
      <div className="subscribe-fields">
        <label><span>Distribution</span><select value={distributionKind} onChange={(event) => setDistributionKind(event.target.value as DistributionKind)}><option>Coupon</option><option>Dividend</option><option>Royalty</option></select></label>
        <label><span>Gross amount (IDR)</span><input type="number" inputMode="numeric" value={distributionAmount} onChange={(event) => setDistributionAmount(event.target.value)} /></label>
      </div>
      <div className="actions"><button type="button" disabled={!distributionAmount} onClick={scheduleDistribution}>Schedule distribution</button></div>
      <div className="order-book">
        {distributions.map((item) => <div className="order-row" key={item.id}><span><strong>{item.kind}</strong><small>{rp(item.feeIdr)} fee · {rp(item.amountIdr - item.feeIdr)} net to holders</small></span><span><Badge tone={item.status === "Distributed" ? "success" : "neutral"}>{item.status}</Badge>{item.status === "Scheduled" && <button type="button" className="text-button" onClick={() => setDistributions((items) => items.map((row) => row.id === item.id ? { ...row, status: "Distributed" } : row))}>Execute</button>}</span></div>)}
      </div>
    </Card>
    <Card title="Transfer controls">
      <div className="status-strip">
        <span>Policy state</span>
        <Badge tone={flow?.controls.paused ? "danger" : "success"}>{flow?.controls.paused ? "Paused" : "Active"}</Badge>
        <small>Capital providers own their allocated units. Compliance controls who may receive them.</small>
      </div>
      {controlledInvestor && (
        <section className="control-console" aria-label="Participant controls">
          <label><span>Participant</span><select value={controlledInvestor.id} onChange={(event) => setControlInvestorId(event.target.value)}>{investors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.capitalType}</option>)}</select></label>
          <div className="control-summary"><div><span>KYC grant</span><Badge tone={controlledKyc ? "success" : "danger"}>{controlledKyc ? "Granted" : "Revoked"}</Badge></div><div><span>Account</span><Badge tone={flow?.controls.frozenInvestorIds.includes(controlledInvestor.id) ? "danger" : "success"}>{flow?.controls.frozenInvestorIds.includes(controlledInvestor.id) ? "Frozen" : "Active"}</Badge></div></div>
          <div className="partition-controls"><span>Transfer permissions</span>{(["SENIOR", "JUNIOR"] as TrancheName[]).map((name) => { const enabled = controlledMandates.includes(name); return <button type="button" key={name} className={enabled ? "active" : ""} aria-pressed={enabled} onClick={() => setMandateOverrides((current) => ({ ...current, [controlledInvestor.id]: enabled ? controlledMandates.filter((item) => item !== name) : [...controlledMandates, name] }))}>{name === "SENIOR" ? "Senior" : "Junior"}</button>; })}</div>
          <div className="actions secondary"><button type="button" className="secondary-button" onClick={() => setKycOverrides((current) => ({ ...current, [controlledInvestor.id]: !controlledKyc }))}>{controlledKyc ? "Revoke KYC" : "Grant KYC"}</button>{flow?.step === "funded" && <button type="button" className="secondary-button" disabled={busy} onClick={() => freezeInvestor(controlledInvestor.id, !flow.controls.frozenInvestorIds.includes(controlledInvestor.id))}>{flow.controls.frozenInvestorIds.includes(controlledInvestor.id) ? "Unfreeze account" : "Freeze account"}</button>}</div>
        </section>
      )}
      <div className="policy-holder-list">
        {investors.map((item) => {
          const frozen = flow?.controls.frozenInvestorIds.includes(item.id) ?? false;
          const granted = kycOverrides[item.id] ?? item.allowlisted;
          const mandates = mandateOverrides[item.id] ?? item.mandate;
          return <div key={item.id}><span><strong>{item.name}</strong><small>{item.capitalType} · {mandates.map((name) => name === "SENIOR" ? "Senior" : "Junior").join(" + ") || "No partition access"}</small></span><Badge tone={!granted || frozen ? "danger" : "success"}>{frozen ? "Frozen" : granted ? "KYC granted" : "KYC revoked"}</Badge><button type="button" className="text-button" onClick={() => setControlInvestorId(item.id)}>Manage</button></div>;
        })}
      </div>
      {flow?.step === "funded" && <div className="actions secondary"><button type="button" className="secondary-button" disabled={busy} onClick={() => pauseTransfers(!flow.controls.paused)}>{flow.controls.paused ? "Resume transfers" : "Pause transfers"}</button></div>}
    </Card>
    <Card title="Exception path">
      <div className="order-book">
        <div className="order-row"><span><strong>1 · Payment monitoring</strong><small>System watches the contractual due date</small></span><Badge tone="success">Active</Badge></div>
        <div className="order-row"><span><strong>2 · Overdue review</strong><small>Confirm non-payment and open the cure period</small></span><Badge tone="neutral">Standby</Badge></div>
        <div className="order-row"><span><strong>3 · Cure or default</strong><small>Record payment, restructuring, or authorized default</small></span><Badge tone="neutral">Standby</Badge></div>
        <div className="order-row"><span><strong>4 · Recovery and closure</strong><small>Apply proceeds Junior-first for losses; release only after closure</small></span><Badge tone="neutral">Standby</Badge></div>
      </div>
      <p className="supporting-copy">Design preview: overdue, default, and recovery actions remain unavailable until the backend exposes those states.</p>
    </Card>
  </>;

  /* One fact, three desks. Left as fixtures, the capital provider's cashflow
     and Compliance's settlement row went on promising money that had already
     been repaid, so they read the facility instead. */
  const liveRows: Record<string, { title: string; meta: string; status: string }[]> = {};
  if (repayment && flow) {
    const note = flow.note?.series ?? flow.request.id;
    const due = repayment.dueAt ? day.format(repayment.dueAt) : "on disbursement";
    const status = repayment.settled ? "Repaid" : repayment.payable ? "Outstanding" : "Awaiting disbursement";
    liveRows["Cashflows"] = [{
      title: `${note} · ${repayment.settled ? "Repayment received" : "Expected repayment"}`,
      meta: `${rp(repayment.principalIdr)} capital and ${rp(repayment.returnIdr)} return · due ${due}`,
      status,
    }];
    liveRows["Funding & settlement"] = [{
      title: `${note} · ${flow.request.esrgId}`,
      meta: repayment.settled
        ? `Repaid in full; funds returned to both tranches, senior first`
        : `${rp(repayment.totalIdr)} outstanding · due ${due}`,
      status,
    }];
    liveRows["Registry controls"] = [{
      title: `Hak Jaminan · ${flow.request.esrgId}`,
      meta: repayment.settled
        ? "Released after repayment; the receipt can be financed again"
        : flow.registryRef ? `Recorded as ${flow.registryRef}` : "Required before funds are released",
      status: repayment.settled ? "Released" : flow.registryRef ? "Held" : "Pending",
    }];
  }

  /* One facility at a time: the workspace shows the most recent request, so
     opening a second would quietly hide the one still owed. */
  const actionLock = activeRole === "Borrower" && flow && !startingNew && flow.step !== "repaid"
    ? `Settle ${flow.note?.series ?? flow.request.id} before starting another financing request.`
    : null;

  const capitalPanels: Record<string, React.ReactNode> =
    activeRole === "Capital Provider"
      ? { Opportunities: opportunitiesPanel, "My notes": positionsPanel, Transfers: transferPanel, Cashflows: capitalCashflowsPanel }
      : activeRole === "Compliance"
        ? { "Funding & settlement": complianceServicingPanel }
      : activeRole === "Borrower" ? {
          [INTAKE_SECTION]: <>{err && <div className="error-banner" role="alert">{err}</div>}{intakePanel}</>,
          ...(repaymentPanel ? { Repayments: repaymentPanel } : {}),
        } : {};
  const stages = JOURNEY[activeRole];
  const here = stepAt(startingNew ? "none" : flow?.step ?? "none");
  /* Last stage the shared step has reached. A repaid facility leaves none active. */
  const capitalStage = activeRole === "Capital Provider" && flow?.note
    ? ({ Opportunities: 2, "My notes": 3, Transfers: 4, Cashflows: 5 }[workspaceSection] ?? 2)
    : null;
  const stage = capitalStage ?? (!startingNew && flow?.step === "repaid" && activeRole === "Capital Provider"
    ? 6
    : !startingNew && flow?.step === "repaid"
    ? stages.length
    : stages.reduce((found, item, index) => (stepAt(item.from) <= here ? index : found), 0));

  /* "Choose a receipt" and "Select an accepted receipt" are two steps, not one
     page: until a receipt is picked the borrower is still proposing, and once
     picked the proposal list is behind them. */
  const choosingReceipt = screen === "pick" && !receiptId;

  const stepCard = (
    <>
        {screen === "pick" && !choosingReceipt && (
          <div className="step-back-row">
            <button type="button" className="step-back" onClick={() => setReceiptId("")}>Back to receipt proposals</button>
            <span>Propose another receipt, or pick a different accepted one.</span>
          </div>
        )}
        {screen === "pick" && !choosingReceipt && (
          <Card title="Select an accepted receipt">
            {loading && <p className="empty-state">Loading available receipts…</p>}
            {!loading && acceptedReceipts.length === 0 && <p className="empty-state">No receipts have been accepted yet. Complete intake above, then ask Compliance to review your proposal.</p>}
            {acceptedReceipts.length > 0 && (
              <form onSubmit={(event) => { event.preventDefault(); if (selectedReceipt) start(selectedReceipt); }}>
                <p className="supporting-copy">Select an accepted receipt to prepare the financing mandate. Compliance reviews the signed request and runs policy checks next.</p>
                <div className="choice-list">
                  {acceptedReceipts.map((esrg) => (
                    <label className="receipt-card" key={esrg.id}>
                      <input type="radio" name="receipt" value={esrg.id} checked={receiptId === esrg.id} onChange={() => setReceiptId(esrg.id)} />
                      <span className="receipt-content">
                        <span className="receipt-head">
                          <strong>{esrg.id}</strong>
                          <Badge tone={esrg.encumbrance === "none" ? "success" : "danger"}>
                            {esrg.encumbrance === "none" ? "Accepted · intake reviewed" : "Already pledged"}
                          </Badge>
                        </span>
                        <span className="receipt-value">{esrg.commodity} · {esrg.quantityKg.toLocaleString("en-US")} kg · {rp(esrg.valueIdr)}</span>
                        <span className="muted">{esrg.warehouse} · Expires {formatDate(esrg.expiresAt)}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="actions"><button type="submit" disabled={busy || !selectedReceipt || intake.receipts[selectedReceipt.id] !== "accepted"}>Prepare mandate</button></div>
              </form>
            )}
          </Card>
        )}

        {screen === "mandate" && facility && (
          <Card title="Receipt and mandate">
            <div className="status-strip"><span>Signature</span><Badge tone={flow?.documentSigning?.status === "signed" ? "success" : "neutral"}>{flow?.documentSigning?.status === "awaiting_signature" ? "Awaiting signature" : "DocuSeal"}</Badge></div>
            <div className="two-column">
              <section>
                <h3>Receipt details</h3>
                <Row label="Receipt ID" value={facility.id} />
                <Row label="Issuer / warehouse" value={facility.warehouse} />
                <Row label="Commodity" value={facility.commodity} />
                <Row label="Quantity" value={`${facility.quantityKg.toLocaleString("en-US")} kg`} />
                <Row label="Issued" value={formatDate(facility.issuedAt)} />
                <Row label="Expires" value={formatDate(facility.expiresAt)} />
                <Row label="Document hash" value={`${facility.documentHash.slice(0, 18)}…`} mono />
              </section>
              <section>
                <h3>Documents to sign</h3>
                <CheckList items={MANDATE_DOCS} cursor={seqCursor} running={Boolean(sequence)} />
                <p className="supporting-copy">{MANDATE_FOLLOWS}</p>
              </section>
            </div>
            <div className="actions">
              <button disabled={busy} onClick={beginDocumentSigning}>
                {busy ? "Preparing…" : flow?.documentSigning ? "Open signing form" : "Sign now"}
              </button>
            </div>
          </Card>
        )}

        {screen === "review" && (
          <Card title="Review documents and lien">
            <p className="supporting-copy">Review the receipt and signed mandate, then check the registry lien. Approval moves this request to eligibility verification; it does not authorize funding.</p>
            <CheckList items={REVIEW_CHECKS} cursor={seqCursor} running={Boolean(sequence)} spacious />
            <div className="actions">
              <button disabled={busy} onClick={() => advanceSequenced("approve", REVIEW_CHECKS.length)}>
                {sequence ? "Reviewing…" : "Approve review and continue"}
              </button>
            </div>
          </Card>
        )}

        {screen === "proof" && (
          <Card title={flow?.proof ? "Eligibility confirmed" : "Private eligibility check"}>
            {!flow?.proof ? (
              <>
                <div className="actions"><button disabled={busy} onClick={() => advance("prove")}>{busy ? "Verifying…" : "Verify"}</button></div>
              </>
            ) : (
              <>
                <div className="result-list" aria-label="Public eligibility results" aria-busy={proofCursor < proofChecks.length}>
                  {flow.proof.checks.map((check, index) => {
                    const settled = index < proofCursor;
                    return (
                      <div className="result-row" key={check.label} data-state={settled ? "done" : index === proofCursor ? "running" : "queued"}>
                        <span>{PROOF_COPY[check.label] ?? "Eligibility policy check"}</span>
                        {settled ? (
                          <Badge tone={check.pass ? "success" : "danger"}>{check.pass ? "Passed" : "Failed"}</Badge>
                        ) : (
                          <span className="seq-status">
                            <span className="seq-mark" aria-hidden="true" />
                            {index === proofCursor ? "Checking" : "Queued"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {activeRole === "Compliance" && flow && facility && (
                  <section className="issuance-review" aria-label="Issuance review">
                    <header><div><span className="section-kicker">Issuance review</span><h3>Ready to tokenize</h3></div><Badge tone="success">Within policy</Badge></header>
                    <div className="finance-metrics">
                      <div><span>Eligible collateral</span><strong>{rp(facility.valueIdr)}</strong><small>{facility.quantityKg.toLocaleString("en-US")} kg reconciled</small></div>
                      <div><span>Facility ceiling</span><strong>{rp(flow.request.requestedIdr)}</strong><small>{(flow.request.maxLtvBp / 100).toFixed(0)}% maximum LTV</small></div>
                      <div><span>Planned issued face</span><strong>{rp(Math.floor(flow.request.requestedIdr * 390 / 420))}</strong><small>Senior and Junior combined</small></div>
                      <div><span>Senior partition</span><strong>{rp(Math.floor(flow.request.requestedIdr * 270 / 420))}</strong><small>Paid first</small></div>
                      <div><span>Junior partition</span><strong>{rp(Math.floor(flow.request.requestedIdr * 120 / 420))}</strong><small>First loss layer</small></div>
                      <div><span>Junior share</span><strong>30.8%</strong><small>Of the issued note</small></div>
                    </div>
                  </section>
                )}
                {activeRole === "Compliance" && <div className="actions"><button disabled={busy} onClick={() => advance("tokenize")}>Tokenize Notes</button></div>}
              </>
            )}
          </Card>
        )}

        {/* Driven by THIS request's tranche book. It used to render `atsNote`,
            the fixed reference contract, so every facility showed the same
            Rp 390m of Rp 420m — and an investor read a capacity the subscribe
            form below did not agree with. The reference token is real and
            stays, as the labelled aside it always was. */}
        {screen === "note" && flow?.note && !borrowerAwaitingRelease && bands.length > 0 && (
          <Card title="Funding structure" className="feature-card">
            <div className="funding-progress">
              <div>
                <p><strong>{rp(subscribedIdr)}</strong> face value allocated of a {rp(issuedIdr)} note</p>
                <progress max={issuedIdr} value={subscribedIdr} aria-label="Capital committed" />
              </div>
              <div className="reserve"><span>Still to raise</span><strong>{rp(bookShortfall)}</strong></div>
            </div>
            <div className="section-heading">
              <h3>Capital structure</h3>
            </div>
            <div className="tranche-grid">
              {bands.map((band) => {
                const senior = band.name === "SENIOR";
                return (
                  <article className={`tranche-card ${senior ? "senior" : ""}`} key={band.name}>
                    <header><h4>{senior ? "Senior" : "Junior"}</h4><Badge tone={senior ? "accent" : "neutral"}>{senior ? "Paid first" : "Absorbs first loss"}</Badge></header>
                    <Row label="Tranche capacity" value={rp(band.capacityIdr)} />
                    <Row label="Issue price" value={rp(issuePrice(band.capacityIdr, band.returnBp, flow.request.maturityDays))} />
                    <Row label="Discount return" value={rp(targetReturn(band.capacityIdr, band.returnBp, flow.request.maturityDays))} />
                    <Row label="Still available" value={rp(Math.max(0, band.capacityIdr - band.subscribedIdr))} />
                    <Row label="Target annual return" value={`${(band.returnBp / 100).toFixed(1)}%`} />
                    <Row label="Share of issued note" value={`${issuedIdr ? (band.capacityIdr / issuedIdr * 100).toFixed(1) : "0.0"}%`} />
                    <p>{senior ? "Paid before junior capital and protected by its first-loss layer." : "Paid after senior capital and absorbs losses before the senior layer."}</p>
                  </article>
                );
              })}
            </div>
            <div className="structure-summary">
              <h3>Financing summary</h3>
              <div><span>Eligible collateral</span><strong>{facility ? rp(facility.valueIdr) : "—"}</strong><p>{facility ? `${facility.quantityKg.toLocaleString("en-US")} kg reconciled at the warehouse` : "Awaiting collateral"}</p></div>
              <div><span>Issued face</span><strong>{rp(issuedIdr)}</strong><p>{facility?.valueIdr ? `${(issuedIdr / facility.valueIdr * 100).toFixed(1)}% issued LTV` : "Set at issuance"}</p></div>
              <div><span>Junior loss buffer</span><strong>{issuedIdr ? (juniorBand / issuedIdr * 100).toFixed(1) : "0.0"}%</strong><p>{rp(juniorBand)} absorbs losses before Senior.</p></div>
              <div><span>Senior attachment</span><strong>{issuedIdr ? (juniorBand / issuedIdr * 100).toFixed(1) : "0.0"}%</strong><p>Senior is exposed only after the Junior layer is exhausted.</p></div>
              <div><span>Junior commitment</span><strong>{rp(juniorCommitted)}</strong><p>First loss capital committed to this facility.</p></div>
              <div><span>Senior capacity unlocked</span><strong>{rp(seniorUnlocked)}</strong><p>Unlocked at {seniorBand && juniorBand ? (seniorBand / juniorBand).toFixed(2) : "0.00"}× Junior commitment.</p></div>
            </div>
            {subscriptionForm}
          </Card>
        )}

        {screen === "note" && flow?.note && !borrowerAwaitingRelease && bands.length === 0 && (
          <Card title="Note">
            <Row label="Token series" value={flow.note.series} mono />
            <Row label="Linked receipt" value={flow.note.underlying} mono />
            <Row label="Issuance cap" value={rp(flow.note.ceilingIdr)} />
            <Row label="Transfer restrictions" value="Allowlisted holders only" />
            <Row label="State" value={noteState} />
            <p className="supporting-copy">The token represents an investor claim linked to the receipt; it does not transfer ownership of the e-SRG.</p>
            {subscriptionForm}
          </Card>
        )}

        {screen === "fund" && flow && !borrowerAwaitingRelease && (
          <Card title="Closing checklist">
            <div className="summary-grid compact">
              <Row label="Subscriptions" value={`${flow.subscriptions.length} investors`} />
              <Row label="Senior raised" value={rp(bandOf("SENIOR")?.subscribedIdr ?? 0)} />
              <Row label="Junior raised" value={rp(bandOf("JUNIOR")?.subscribedIdr ?? 0)} />
            </div>
            <div className="order-book">
              {flow.subscriptions.map((item) => (
                <div className="order-row" key={item.id}>
                  <span>
                    <strong>{investorName(item.investorId)}</strong>
                    <small>{item.tranche === "SENIOR" ? "Senior" : "Junior"} · {item.standingLine ? "standing line" : "fresh capital"}</small>
                  </span>
                  <strong>{rp(item.unitsIdr)}</strong>
                </div>
              ))}
            </div>
            <ol className="gate-list">
              <li>Financing agreement signed by the cooperative and subscribing investors</li>
              <li>Security-rights notice sent to the registry and warehouse</li>
              <li><strong>Registry confirmation required before funds are released</strong></li>
              <li>After confirmation: funds released, note activated, units allocated</li>
            </ol>
            <div className="actions"><button disabled={busy} onClick={() => advance("register")}>Confirm registry and release funds</button></div>
          </Card>
        )}

        {screen === "done" && flow && (
          <Card title="Facility status">
            <div className="truth-labels"><Badge tone={flow.step === "repaid" ? "neutral" : "success"}>{flow.step === "repaid" ? "Repaid" : "Active"}</Badge></div>
            <div className="summary-grid compact">
              <Row label="Status" value={flow.step === "repaid" ? "Repaid" : "Active"} />
              <Row label="Note" value={flow.note?.series ?? "—"} mono />
              <Row label="Note state" value={noteState} />
              <Row label="Registry reference" value={flow.registryRef ?? "—"} mono />
              <Row label="Financing round" value={String(flow.request.epoch)} />
            </div>
            {flow.step === "repaid" ? (
              <div className="info-panel">Security right released. The receipt can be financed again.</div>
            ) : activeRole === "Borrower" ? (
              /* The repayment has its own section; two Repay buttons in two
                 places would be two chances to disagree about the amount. */
              <div className="actions"><button type="button" onClick={() => setWorkspaceSection("Repayments")}>Go to repayment</button></div>
            ) : (
              <div className="actions"><button disabled={busy} onClick={() => advance("repay")}>Repay</button></div>
            )}
            <div className="actions secondary"><button type="button" className={`secondary-button${actionLock ? " locked-action" : ""}`} disabled={!!actionLock} title={actionLock ?? undefined} onClick={reset}>{actionLock && lockIcon}New request</button></div>
          </Card>
        )}
    </>
  );

  const technicalDetails = (flow?.proof || chain || atsNote) && (
    <details className="technical-details">
      <summary>Technical details</summary>
      <div className="technical-details-body">
        {flow?.proof && <Row label="Financing nullifier" value={`${flow.proof.nullifier.slice(0, 22)}…`} mono />}
        {flow?.onchain && <Row label="Verification cost" value={`${flow.onchain.gasUsed?.toLocaleString("en-US") ?? "—"} gas · Hedera testnet`} />}
        {chain && <>
          <Row label="Contract" value={`${chain.contract.slice(0, 10)}…${chain.contract.slice(-6)}`} mono />
          <Row label="Policy" value={`${chain.policy.maxLtvBp / 100}% max LTV · ${chain.policy.maxMaturityDays} days`} />
          <Row label="Current round" value={String(chain.currentRound)} />
          <a className="text-link" href={chain.explorer} target="_blank" rel="noreferrer">Verify on HashScan</a>
        </>}
        {atsNote && <>
          <Row label="Reference token" value={atsNote.address} mono />
          <Row label="Reference supply" value={`${rp(atsNote.totalSupply)} of ${rp(atsNote.maxSupply)}`} />
        </>}
        {flow?.proof && <div className="proof-disclosure">
          <div><strong>Published by the proof</strong><span>Appraisal value · Requested principal · Policy LTV and term · Registry root · Mandate hash · Financing round · Nullifier</span></div>
          <div><strong>Kept private</strong><span>Supplier identities · Exact purchase prices · Exact lot quantity · Source documents · Internal batch data</span></div>
        </div>}
      </div>
    </details>
  );

  const issuanceStatus = activeRole !== "Compliance" && flow && stepAt(flow.step) >= stepAt("mandate_signed") && (
    <div className="status-strip issuance-status" role="status">
      <span>Note issuance</span>
      {stepAt(flow.step) >= stepAt("tokenized") ? <>
        <Badge tone="success">Tokenized</Badge>
        <small>Compliance issued {flow.note?.series ?? "the note"}; capital providers can own and transfer its allocated units.</small>
      </> : <>
        <Badge tone="warning">Awaiting Compliance</Badge>
        <small>Compliance completes eligibility checks and issues the note before subscription opens.</small>
      </>}
    </div>
  );


  const facilitySummary = (
    <section className="facility-summary" aria-label="Facility summary">
      <section>
        <h2>Facility identity</h2>
        <RailRow label="Receipt">{facility?.id ?? "Not selected"}</RailRow>
        <RailRow label="Commodity">{facility?.commodity ?? "—"}</RailRow>
        <RailRow label="Warehouse">{facility?.warehouse ?? "—"}</RailRow>
        <RailRow label="Valid until">{facility ? formatDate(facility.expiresAt) : "—"}</RailRow>
      </section>

      <section>
        <h2>Funding</h2>
        <RailRow label="Status"><Badge tone={status === "Approved" || status === "Active" ? "success" : "neutral"}>{status}</Badge></RailRow>
        {flow && !startingNew ? <>
          <RailRow label="Requested">{rp(flow.request.requestedIdr)}</RailRow>
          <RailRow label="Issued">{issuedIdr ? rp(issuedIdr) : "Set at issuance"}</RailRow>
          <RailRow label="Subscribed">{issuedIdr ? rp(subscribedIdr) : "—"}</RailRow>
          {/* What the book still needs, not requested minus issued: tranche
              capacity comes off the collateral, so it can exceed the ask and
              a "reserve" row would sit at zero saying nothing. */}
          <RailRow label="Still to raise">{issuedIdr ? rp(bookShortfall) : "—"}</RailRow>
        </> : <RailRow label="Requested">No active request</RailRow>}
      </section>
    </section>
  );

  const fundedCard = borrowerAwaitingRelease && flow?.note && (
    <Card title="Capital committed">
      <div className="funded-note">
        <Badge tone="success">Your side is complete</Badge>
        <strong>{rp(subscribedIdr)}</strong>
        <p>committed against note {flow.note.series} of a {rp(issuedIdr)} issue.</p>
        <p className="supporting-copy">
          Senior capital is covered by a standing credit line the moment the note is issued, so there is nothing further to confirm here.
          Compliance records the security right and releases the funds; the facility moves to repayment on its own.
        </p>
        <dl>
          <div><dt>Facility ceiling</dt><dd>{rp(flow.request.requestedIdr)}</dd></div>
          <div><dt>Term</dt><dd>{flow.request.maturityDays} days</dd></div>
          <div><dt>Blended target return</dt><dd>{(blendedBp / 100).toFixed(2)}% p.a.</dd></div>
        </dl>
        <div className="actions"><button type="button" onClick={() => setWorkspaceSection("Repayments")}>Track repayment</button></div>
      </div>
    </Card>
  );

  const flowPanel = (
    <div className="flow-layout">
      {/* Spans both columns. Inside the left one it pushed that card down while
          the rail still started at the top, so the two never lined up. */}
      <header className="flow-heading">
        <span className="eyebrow">{pageEyebrow}</span>
        <h2 ref={headingRef} tabIndex={-1}>{pageTitle}</h2>
        {page.summary && <p>{page.summary}</p>}
        {facility && screen !== "pick" && (
          <p className="facility-line">{facility.warehouse} · Valid until {formatDate(facility.expiresAt)}</p>
        )}
      </header>

      <div className="flow-main" aria-busy={busy}>
        {err && <div className="error-banner" role="alert">{err}</div>}

        {activeRole === "Capital Provider" && opportunitiesPanel}

        {(activeRole === "Borrower" && choosingReceipt || activeRole === "Compliance") && intakePanel}
        {!ownsStep && !borrowerAwaitingRelease && <div className="handoff-banner"><div><strong>Waiting on {stepOwner.toLowerCase()}</strong><span>You can review this record. The next action belongs to the {stepOwner.toLowerCase()}.</span></div></div>}
        {fundedCard}
        {issuanceStatus}
        <fieldset className="flow-fieldset" disabled={!ownsStep}>
          {stepCard}
        {activeRole !== "Capital Provider" && facilitySummary}
        </fieldset>
        {technicalDetails}

        {/* Outside the fieldset on purpose: reading the record is not acting on
            the facility, so it stays available to whoever is looking. */}
        {screen === "done" && flow && (
          <Card title="Activity">
            {myActivity.length === 0 ? (
              <p className="empty-state">Nothing from this workspace yet.</p>
            ) : (
              <section className="activity">
                {(activityAll ? myActivity : myActivity.slice(0, ACTIVITY_PREVIEW)).map((item, index) => (
                  <div className="activity-row" key={`${item.at}-${index}`}>
                    <span><strong>{ACTIVITY_COPY[item.step] ?? "Facility updated"}</strong><small>{ACTOR_COPY[item.by] ?? item.by}</small></span>
                    <time>{timestamp.format(new Date(item.at))}</time>
                  </div>
                ))}
                {myActivity.length > ACTIVITY_PREVIEW && (
                  <button type="button" className="activity-more" onClick={() => setActivityAll((open) => !open)}>
                    {activityAll ? "Show less" : `Show all ${myActivity.length}`}
                  </button>
                )}
              </section>
            )}
          </Card>
        )}

      </div>

      <aside className="flow-side" aria-label={`${activeRole} progress`}>
        <nav className="side-section journey" aria-labelledby="funding-journey">
          <h2 id="funding-journey">Your steps</h2>
          <ol>
            {stages.map((item, index) => (
              <li key={item.label} className={screen === "pick" && activeRole === "Borrower" && !acceptedReceipts.length ? "" : index === stage ? "active" : index < stage ? "past" : ""} aria-current={index === stage && !(screen === "pick" && activeRole === "Borrower" && !acceptedReceipts.length) ? "step" : undefined}>
                <span className="step-number">{index + 1}</span>
                <span><strong>{item.label}</strong><small>{item.hint}</small></span>
              </li>
            ))}
          </ol>
        </nav>

        <section className="rail-section">
          <h2>Step ownership</h2>
          <RailRow label="This step"><Badge tone={ownsStep ? "accent" : borrowerAwaitingRelease ? "neutral" : "warning"}>{stepOwner}</Badge></RailRow>
          <RailRow label="Your workspace">{activeRole}</RailRow>
        </section>

      </aside>
    </div>
  );

  return (
    <WorkspacePage
      role={activeRole}
      section={workspaceSection}
      onSection={setWorkspaceSection}
      onAction={() => {
        if (activeRole === "Borrower" && workspaceSection === INTAKE_SECTION) { const select = document.getElementById("intake-receipt-0") as HTMLSelectElement | null; select?.focus(); select?.showPicker?.(); return; }
        setWorkspaceSection(FLOW_SECTION[activeRole]);
      }}
      onSwitchRole={() => { setSelectedRole(activeRole); navigate("access"); }}
      onReset={resetDemo}
      onNavigate={navigate}
      flowPanel={flowPanel}
      stepOwner={stepOwner}
      lock={actionLock}
      navMarks={navMarks}
      panels={capitalPanels}
      identity={activeRole === "Capital Provider" ? investorPicker : null}
      analytics={<Dashboard receipts={esrgs} flow={flow} bands={bands} role={activeRole} section={workspaceSection} summary={activeRole === "Capital Provider" ? [
        { label: "Open opportunities", value: me?.allowlisted ? String(me.mandate.length) : "0", note: me?.allowlisted ? `${me.mandate.join(" + ")} mandate` : "Allowlisting required" },
        { label: "Committed capital", value: `Rp ${investorDemo.capital / 1_000_000}m`, note: `${investorDemo.notes.length} positions` },
        { label: "Next cashflow", value: investorDemo.due, note: investorDemo.notes[0]?.[0] ?? "No eligible facilities" },
      ] : WORKSPACE_META[activeRole].metrics ?? []} portfolio={activeRole === "Capital Provider" ? { valueIdr: investorDemo.capital, growthPct: investorDemo.growth, restricted: !me?.allowlisted } : undefined} maxLtvBp={chain?.policy.maxLtvBp} acceptedIds={acceptedReceipts.map(receipt => receipt.id)} priorities={workspaceSection === "Overview" && activeRole === "Capital Provider" ? investorDemo.notes.map(([series, trancheName, value, detail]) => ({ title: `${series} · ${trancheName}`, meta: `${rp(value)} · ${detail}`, status: "Funded" })) : workspaceSection === "Overview" ? WORKSPACE_META[activeRole].rows : liveRows[workspaceSection] ?? SECTION_ROWS[workspaceSection] ?? []} loading={loading} error={err} onSection={setWorkspaceSection} onOpen={(receipt) => {
        if (receipt && activeRole === "Borrower" && receipt.id !== flow?.request.esrgId) {
          /* A receipt has to clear intake before it can be financed, so one that
             has not been accepted goes to the intake form already chosen —
             leaving the borrower a single button to press. */
          if (intake?.receipts[receipt.id] !== "accepted") {
            setProposeIds(chooseInRow(receipt.id));
            setWorkspaceSection(INTAKE_SECTION);
            return;
          }
          setReceiptId(receipt.id);
          setStartingNew(true);
        } else setStartingNew(false);
        setWorkspaceSection(FLOW_SECTION[activeRole]);
      }} />}
    />
  );
}

const BOUNDARIES = [
  { title: "Registry-authoritative collateral", copy: "The official e-SRG remains in the Bappebti registry; Anora records a linked financing claim." },
  { title: "Permissioned financing notes", copy: "Senior and Junior positions are limited to verified participants, with allowlist and tranche rules enforced at subscription and transfer." },
  { title: "Onchain settlement", copy: "Issuance, eligible transfers, and facility events are recorded for auditability." },
];

function LandingPage({ onNavigate, onAccess }: { onNavigate: (view: View) => void; onAccess: (role?: Role) => void }) {
  return (
    <div className="public-page landing-page">
      <div className="page-backdrop" aria-hidden="true">
        <img src="/parcel-11-3x2-loop.svg" alt="" />
      </div>
      <main className="landing-main">
        <section className="hero-grid" aria-labelledby="landing-title">
          {/* One panel: the pitch on the left, the boundaries filling the room
              its headline leaves on the right. */}
          <div className="hero-panel">
            <div className="hero-copy">
              <div className="hero-wordmark">Anora</div>
              <h1 id="landing-title">Turn verified inventory<br />into investable credit.</h1>
              <p>Anora connects holders of Indonesian electronic warehouse receipts (e-SRG) with capital providers through structured, permissioned notes.</p>
              <div className="hero-actions">
                <button type="button" onClick={() => onAccess()}>Get started</button>
                <button type="button" className="secondary-button" onClick={() => onNavigate("how")}>How it works</button>
              </div>
            </div>
            <ul className="hero-boundaries" aria-label="Anora product boundaries">
              {BOUNDARIES.map((item) => (
                <li className="boundary" key={item.title}>
                  <h2>{item.title}</h2>
                  <p>{item.copy}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

/* Every capability enters through a port in packages/core, so the same flow runs
   against a simulated or a live adapter. Two are genuinely on Hedera today; the
   rest are simulated for reasons worth stating rather than hiding. */
/* SVG text does not wrap: `backend` and `detail` must fit 168px, which is
   about 26 characters at their sizes. Longer strings run outside the box. */
const STACK_PORTS = [
  { port: "e-SRG", backend: "Synthetic documents", detail: "Not running in practice", mode: "simulated" },
  { port: "Identity", backend: "Privy sign-in", detail: "World ID pending", mode: "simulated" },
  { port: "Registry", backend: "Bappebti registry", detail: "No public API", mode: "simulated" },
  { port: "Proof", backend: "Noir · nargo → bb", detail: "HonkVerifier 0xc90C…3115", mode: "live" },
  { port: "Token", backend: "ATS v4.x factory", detail: "AnoraNote 0xA44C…4F22", mode: "live" },
] as const;

const SD = { x0: 40, w: 196, gap: 15 };
const sdX = (i: number) => SD.x0 + i * (SD.w + SD.gap);
const sdMid = (i: number) => sdX(i) + SD.w / 2;

function StackDiagram() {
  const live = STACK_PORTS.map((p, i) => ({ ...p, i })).filter((p) => p.mode === "live");
  const chainX = sdX(live[0]!.i);
  const chainW = sdX(live.at(-1)!.i) + SD.w - chainX;
  return (
    <figure className="stack-figure">
      <div className="stack-scroll">
        <svg
          viewBox="0 0 1120 524"
          role="img"
          aria-label="Anora runs a React workspace over a Bun and Hono API. Five capabilities — receipts, identity, registry, proof and token — each pass through a port, so a simulated adapter can be swapped for a live one. Proof and token are live on Hedera testnet through the HonkVerifier and the AnoraNote issued by the ATS factory; receipts, identity and registry are simulated."
        >
          <defs>
            <marker id="sd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>

          <rect className="sd-box sd-shell" x="40" y="40" width="1040" height="62" rx="10" />
          <text className="sd-title" x="60" y="68">Workspaces · React 18 + Vite</text>
          <text className="sd-sub" x="60" y="87">Borrower · Compliance · Capital Provider — three windows, one facility</text>

          <line className="sd-flow" x1="560" y1="102" x2="560" y2="142" markerEnd="url(#sd-arrow)" />
          <text className="sd-edge" x="572" y="127">/api</text>

          <rect className="sd-box sd-shell" x="40" y="148" width="1040" height="58" rx="10" />
          <text className="sd-title" x="60" y="174">API · Bun + Hono</text>
          <text className="sd-sub" x="60" y="192">Holds the facility state machine; every role polls the same record</text>

          {STACK_PORTS.map((item, i) => (
            <g key={item.port}>
              <line className="sd-flow" x1={sdMid(i)} y1="206" x2={sdMid(i)} y2="244" markerEnd="url(#sd-arrow)" />
              <rect className="sd-box sd-port" x={sdX(i)} y="250" width={SD.w} height="44" rx="8" />
              <text className="sd-port-label" x={sdMid(i)} y="277" textAnchor="middle">{item.port}</text>
              <line className="sd-flow" x1={sdMid(i)} y1="294" x2={sdMid(i)} y2="330" markerEnd="url(#sd-arrow)" />
              <rect
                className={`sd-box ${item.mode === "live" ? "sd-live" : "sd-sim"}`}
                x={sdX(i)} y="336" width={SD.w} height="92" rx="8"
              />
              <text className={`sd-tag ${item.mode === "live" ? "sd-tag-live" : ""}`} x={sdX(i) + 14} y="360">
                {item.mode === "live" ? "LIVE" : "SIMULATED"}
              </text>
              <text className="sd-backend" x={sdX(i) + 14} y="386">{item.backend}</text>
              <text className="sd-sub" x={sdX(i) + 14} y="406">{item.detail}</text>
            </g>
          ))}

          {live.map((item) => (
            <line
              key={item.port}
              className="sd-flow" x1={sdMid(item.i)} y1="428" x2={sdMid(item.i)} y2="462"
              markerEnd="url(#sd-arrow)"
            />
          ))}
          <rect className="sd-box sd-chain" x={chainX} y="468" width={chainW} height="38" rx="8" />
          <text className="sd-chain-label" x={chainX + chainW / 2} y="492" textAnchor="middle">
            Hedera testnet · chainId 296
          </text>

          <rect className="sd-box sd-live" x="40" y="468" width="16" height="16" rx="4" />
          <text className="sd-sub" x="64" y="481">Live on chain</text>
          <rect className="sd-box sd-sim" x="180" y="468" width="16" height="16" rx="4" />
          <text className="sd-sub" x="204" y="481">Simulated, and labelled as such in the product</text>
        </svg>
      </div>
      <figcaption>
        Each capability enters through a port, so a simulated adapter can be replaced by a live one without touching the flow. Two are live on Hedera today — the proof verifier and the note itself.
      </figcaption>
    </figure>
  );
}

function HowItWorksPage({ onNavigate, onAccess }: { onNavigate: (view: View) => void; onAccess: (role?: Role) => void }) {
  /* The bar's Back button exists only while the page's own is out of sight, so
     ask the closing actions directly rather than measuring scroll offsets. */
  const closingActions = useRef<HTMLDivElement>(null);
  const [closingInView, setClosingInView] = useState(false);
  useEffect(() => {
    const node = closingActions.current;
    if (!node) return;
    const watch = new IntersectionObserver(([entry]) => entry && setClosingInView(entry.isIntersecting));
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  const steps = [
    { icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 15l3 3 5-6", title: "Verify the official e-SRG", copy: "The borrower connects an eligible receipt. Compliance checks the registry record, warehouse, ownership, expiry, insurance, and existing security rights.", owner: "Borrower + Compliance" },
    { icon: "M12 20H4V4h10M16 3l5 5-10 10-6 1 1-6L16 3Zm-2 2 5 5", title: "Complete evidence and signatures", copy: "The borrower reviews, fills, and signs the financing mandate and registry consent through DocuSeal. Production access also requires KYB and an organizational authorization.", owner: "Borrower" },
    { icon: "M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6", title: "Approve and structure the facility", copy: "Compliance approves one set of terms. Anora links the approved facility to permissioned Senior and Junior financing-note positions; the tea title stays off-chain.", owner: "Compliance" },
    { icon: "M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4", title: "Subscribe and settle", copy: "Capital providers choose a tranche position. Registry confirmation gates note activation and disbursement, so funding cannot precede the required collateral control.", owner: "Capital Provider + Compliance" },
    { icon: "M4 10a8 8 0 1 1 1 8M4 4v6h6m-2 3 3 3 5-6", title: "Repay, release, or enforce", copy: "Repayment follows the agreed waterfall before the security right is released. On default, the authorized party follows the signed and regulated enforcement process.", owner: "Compliance" },
  ];

  return (
    <div className="public-page how-page">
      <header className="public-header compact-header">
        <button type="button" className="wordmark-button" onClick={() => onNavigate("landing")}>Anora</button>
        {!closingInView && <button type="button" className="sign-in-button" onClick={() => onNavigate("landing")}>Back</button>}
      </header>
      <main className="how-main">
        <header className="how-intro">
          <span className="eyebrow">How Anora works</span>
          <h1>From a verified receipt to accountable financing.</h1>
          <p>The registry remains the source of truth. Anora coordinates the evidence, note structure, permissions, and settlement around it.</p>
        </header>

        <section className="process-ledger" aria-label="Financing process">
          {steps.map((step) => (
            <article key={step.title}>
              <span className="process-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d={step.icon} /></svg></span>
              <div><h2>{step.title}</h2><p>{step.copy}</p></div>
              <aside><span>Primary owner</span><strong>{step.owner}</strong></aside>
            </article>
          ))}
        </section>

        <section className="stack-section" aria-label="What Anora runs on">
          <h2>What it runs on</h2>
          <StackDiagram />
        </section>

        <section className="boundary-note">
          <div><span className="eyebrow">Product boundary</span><h2>Anora tokenizes<br />the financing claim.</h2></div>
          <p>The e-SRG and its registered security control remain authoritative in the regulated registry. Senior and Junior note holders receive contractual economic rights subject to eligibility and transfer restrictions.</p>
        </section>

        <div className="page-actions" ref={closingActions}>
          <button type="button" onClick={() => onAccess()}>Get started</button>
          <button type="button" className="secondary-button" onClick={() => onNavigate("landing")}>Back to overview</button>
        </div>
      </main>
    </div>
  );
}

function AccessPage({
  selectedRole,
  onSelectRole,
  onContinue,
  onNavigate,
}: {
  selectedRole: Role;
  onSelectRole: (role: Role) => void;
  onContinue: () => void;
  onNavigate: (view: View) => void;
}) {
  return (
    <div className="public-page access-page">
      <header className="public-header compact-header">
        <button type="button" className="wordmark-button" onClick={() => onNavigate("landing")}>Anora</button>
        <button type="button" className="sign-in-button" onClick={() => onNavigate("landing")}>Back to overview</button>
      </header>
      <main className="access-main">
        {/* One card: the explanation and the choice it sets up, side by side. */}
        <div className="access-card">
          <header className="access-intro">
            <span className="eyebrow">Secure access</span>
            <h1>Sign in to continue.</h1>
            <img
              className="access-figure"
              src="/anora-tea-warehouse.jpg"
              width="900"
              height="618"
              alt="Made tea stored in a licensed warehouse — the inventory an e-SRG is issued against."
            />
          </header>
          <form className="access-panel" onSubmit={(event) => { event.preventDefault(); onContinue(); }}>
            <fieldset>
              <legend>Choose your workspace</legend>
              <div className="role-options">
                {ROLES.map((role) => (
                  <label className="role-option" key={role}>
                    <input className="sr-only" type="radio" name="role" value={role} checked={selectedRole === role} onChange={() => onSelectRole(role)} />
                    <svg className="role-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={ROLE_ICONS[role]} /></svg>
                    <span><strong>{role}</strong><span>{ROLE_COPY[role].summary}</span><small>{ROLE_COPY[role].detail}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="access-submit">Continue</button>
            <p className="access-note"><strong>Signing in proves identity, not authority.</strong> Production access also requires KYB plus a director mandate, power of attorney, or cooperative resolution.</p>
          </form>
        </div>
      </main>
    </div>
  );
}

function WorkspacePage({ role, section, onSection, onAction, onSwitchRole, onReset, onNavigate, flowPanel, stepOwner, lock, navMarks, panels, identity, analytics }: {
  role: Role;
  section: string;
  onSection: (section: string) => void;
  /** What the heading button does here — the workspace decides, not the shell. */
  onAction: () => void;
  onSwitchRole: () => void;
  onReset: () => void;
  onNavigate: (view: View) => void;
  flowPanel: React.ReactNode;
  stepOwner: Role;
  lock: string | null;
  navMarks: Record<string, "action" | "waiting">;
  panels: Record<string, React.ReactNode>;
  identity: React.ReactNode;
  analytics: React.ReactNode;
}) {
  const meta = WORKSPACE_META[role];
  const inFlow = section === FLOW_SECTION[role];
  /* The heading action is the page's primary control, so when it scrolls out
     the sticky bar carries it instead of the reader scrolling back for it. */
  const headingAction = useRef<HTMLButtonElement>(null);
  const [actionOffscreen, setActionOffscreen] = useState(false);
  useEffect(() => {
    const button = headingAction.current;
    if (!button) { setActionOffscreen(false); return; }
    const observer = new IntersectionObserver(([entry]) => entry && setActionOffscreen(!entry.isIntersecting));
    observer.observe(button);
    return () => observer.disconnect();
  }, [inFlow, section]);

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar" aria-label={`${role} navigation`}>
        <button type="button" className="workspace-brand" onClick={() => onNavigate("landing")}>Anora<span>Warehouse-receipt financing</span></button>
        <div className="workspace-role"><span>Workspace</span><strong>{role}</strong></div>
        <nav className="workspace-nav">
          {WORKSPACE_NAV[role].map((item) => (
            <button type="button" key={item} className={item === section ? "active" : ""} aria-current={item === section ? "page" : undefined} onClick={() => onSection(item)}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={NAV_ICONS[item]} /></svg><span>{item}</span>
              {navMarks[item] && <span className={`nav-dot${navMarks[item] === "waiting" ? " waiting" : ""}`} aria-label={navMarks[item] === "waiting" ? `Waiting on the ${stepOwner}` : "Needs your action"} />}
            </button>
          ))}
        </nav>
        <div className="workspace-links"><button type="button" onClick={() => onNavigate("how")}>How it works</button><button type="button" onClick={onSwitchRole}>Switch workspace</button></div>
      </aside>
      <main className="workspace-main">
        <div className="workspace-topbar"><div className="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{section}</strong></div><div className="topbar-identity">{!inFlow && <button type="button" className={`topbar-action${actionOffscreen ? " visible" : ""}${lock ? " locked-action" : ""}`} onClick={onAction} disabled={!!lock} title={lock ?? undefined} tabIndex={actionOffscreen && !lock ? undefined : -1} aria-hidden={!actionOffscreen}>{lock && lockIcon}{meta.action}</button>}{identity ?? <strong>{role}</strong>}<button type="button" className="reset-demo" onClick={onReset}>Reset</button></div></div>
        {/* The flow states its own step and receipt directly below, and the
            breadcrumb and sidebar already say which section this is — so in the
            flow the page heading was the section name twice over. */}
        {!inFlow && <header className="workspace-heading"><div><span className="eyebrow">{section === "Overview" ? meta.eyebrow : role}</span><h1>{section === "Overview" ? meta.title : section}</h1><p>{section === "Overview" ? meta.summary : `Review ${section.toLowerCase()} available to this workspace.`}</p>{lock && <p className="lock-note">{lockIcon}{lock}</p>}</div><button type="button" ref={headingAction} className={lock ? "locked-action" : undefined} disabled={!!lock} title={lock ?? undefined} onClick={onAction}>{lock && lockIcon}{meta.action}</button></header>}
        {inFlow ? flowPanel : panels[section] ?? analytics}
      </main>
    </div>
  );
}

/** One markup shape for every checklist, swept or not. */
function CheckList({ items, cursor, running, spacious }: {
  items: string[];
  cursor: number;
  running: boolean;
  spacious?: boolean;
}) {
  return (
    <ul className={`check-list${spacious ? " spacious" : ""}`} aria-busy={running && cursor < items.length}>
      {items.map((item, index) => {
        const state = !running ? "idle" : index < cursor ? "done" : index === cursor ? "running" : "queued";
        return (
          <li key={item} data-state={state}>
            <span className="seq-mark" aria-hidden="true" />
            <span>{item}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Card({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return <section className={`card ${className}`}><h2>{title}</h2>{children}</section>;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="data-row"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>;
}

function RailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rail-row"><span>{label}</span><strong>{children}</strong></div>;
}

function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "accent" | "neutral"; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
