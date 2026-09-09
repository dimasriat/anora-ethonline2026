// Pendaftaran peminjam dan pengajuan resi: keadaan bersama, sama seperti alur
// pembiayaan.
//
// Sebelumnya ini hidup di localStorage tiap browser, jadi tiga peran hanya
// sinkron kalau dibuka di tab yang sama. Peragaan dijalankan di tiga browser
// terpisah, maka pemiliknya server: satu catatan, semua jendela menariknya.
import type { ESrg } from "@anora/core";
import { SRG_COMMODITIES, SRG_WAREHOUSES } from "./srg";

export type BorrowerProfile = { entityName: string; entityType: string; registrationRef: string; taxRef: string; representativeRole: string; authorityRef: string; commodity: string; quantityKg: number; warehouse: string };

export const ENTITY_TYPES = ["Cooperative", "Corporation", "Other legal entity"];
export const REPRESENTATIVE_ROLES = ["Authorized cooperative representative", "Cooperative chair (Ketua Koperasi)", "Cooperative secretary", "Cooperative treasurer", "Farmer group leader (Ketua Gapoktan)", "Company director", "Authorized company representative", "Attorney-in-fact (power of attorney)"];

export const demoProfile: BorrowerProfile = { entityName: "Koperasi Anora Sejahtera", entityType: "Cooperative", registrationRef: "DEMO-NIB-024", taxRef: "DEMO-NPWP-024", representativeRole: "Authorized cooperative representative", authorityRef: "DEMO-BOARD-MANDATE-024", commodity: "Tea", quantityKg: 8000, warehouse: "Gudang SRG Bandung 02" };

export type BorrowerApplication = { status: "draft" | "submitted" | "approved" | "confirmed"; profile: BorrowerProfile };
export type IntakeState = { borrower: BorrowerApplication; humanCheck: boolean; receipts: Record<string, "proposed" | "accepted"> };
export type IntakeAction = { kind: "submit-borrower"; profile: BorrowerProfile } | { kind: "approve-borrower" } | { kind: "confirm-borrower" } | { kind: "revise-borrower" } | { kind: "human" } | { kind: "propose" | "accept"; receiptId: string };

const emptyIntake = (): IntakeState => ({ borrower: { status: "draft", profile: demoProfile }, humanCheck: false, receipts: {} });

export function validProfile(profile: BorrowerProfile): boolean {
  /* Empat daftar tertutup adalah aturan pengajuannya sendiri: jenis badan,
     kapasitas penanda tangan, komoditas yang layak SRG, dan gudang terdaftar.
     Sisanya teks bebas dari peminjam. */
  return !!profile && ENTITY_TYPES.includes(profile.entityType) && REPRESENTATIVE_ROLES.includes(profile.representativeRole) &&
    SRG_COMMODITIES.includes(profile.commodity) && SRG_WAREHOUSES.includes(profile.warehouse) &&
    Number.isSafeInteger(profile.quantityKg) && profile.quantityKg > 0 &&
    [profile.entityName, profile.registrationRef, profile.taxRef, profile.authorityRef].every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 200);
}

/** Reducer murni: satu tempat untuk aturan siapa boleh melakukan apa, kapan. */
export function updateIntake(state: IntakeState, role: string, action: IntakeAction, receipt: ESrg | null): IntakeState {
  if (action.kind === "human") {
    if (role !== "Borrower") throw new Error("The borrower completes the human check.");
    return { ...state, humanCheck: true };
  }
  if (action.kind === "revise-borrower") {
    if (role !== "Borrower" || state.borrower.status !== "submitted") throw new Error("Only a pending application can be edited.");
    return { ...state, borrower: { ...state.borrower, status: "draft" } };
  }
  if (action.kind === "submit-borrower") {
    if (role !== "Borrower" || state.borrower.status !== "draft") throw new Error("Only the borrower can submit a draft application.");
    if (!state.humanCheck || !validProfile(action.profile)) throw new Error("Complete the human check and all entity, authority, and goods fields.");
    return { ...state, borrower: { status: "submitted", profile: { ...action.profile } } };
  }
  if (action.kind === "approve-borrower") {
    if (role !== "Compliance" || state.borrower.status !== "submitted" || !state.humanCheck || !validProfile(state.borrower.profile)) throw new Error("A complete submitted borrower application is required for compliance review.");
    return { ...state, borrower: { ...state.borrower, status: "approved" } };
  }
  if (action.kind === "confirm-borrower") {
    if (role !== "Borrower" || state.borrower.status !== "approved") throw new Error("Agent approval is required before confirmation.");
    return { ...state, borrower: { ...state.borrower, status: "confirmed" } };
  }
  if (state.borrower.status !== "confirmed") throw new Error("Confirm borrower eligibility before receipt intake.");
  if (!state.humanCheck) throw new Error("Complete the demo human check first.");
  if (!action.receiptId || !receipt) throw new Error("Choose a known demo receipt.");
  if (receipt.holder !== state.borrower.profile.entityName) throw new Error(`The receipt holder must match the registered entity. This receipt belongs to ${receipt.holder}.`);
  /* An encumbered receipt cannot back a second facility, so it is refused at
     proposal rather than at acceptance — otherwise a borrower could file one
     and leave it stuck awaiting a review that can never pass. */
  if (receipt.encumbrance !== "none") throw new Error("This receipt is already pledged and cannot be used for financing.");
  if (action.kind === "propose") {
    if (role !== "Borrower") throw new Error("Only the borrower proposes a receipt.");
    if (state.receipts[action.receiptId]) throw new Error("This receipt has already been proposed.");
    return { ...state, receipts: { ...state.receipts, [action.receiptId]: "proposed" } };
  }
  if (role !== "Compliance") throw new Error("Compliance must accept the receipt.");
  if (state.receipts[action.receiptId] !== "proposed") throw new Error("This receipt is not awaiting review.");
  return { ...state, receipts: { ...state.receipts, [action.receiptId]: "accepted" } };
}

let state = emptyIntake();

/** Keadaan plus daftar pilihan yang boleh dipakai formulir. Satu definisi. */
export const intakeView = () => ({
  state,
  options: { entityTypes: ENTITY_TYPES, representativeRoles: REPRESENTATIVE_ROLES, commodities: SRG_COMMODITIES, warehouses: SRG_WAREHOUSES },
});

export function applyIntake(role: string, action: IntakeAction, receipt: ESrg | null) {
  state = updateIntake(state, role, action, receipt);
  return intakeView();
}

export const resetIntake = () => { state = emptyIntake(); };
