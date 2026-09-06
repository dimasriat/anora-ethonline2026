import type { ESrg, Intake } from "@anora/core";

export const KOPERASI = "Koperasi Anora Sejahtera";
export const GUDANG = "Gudang SRG Bandung 02";

const GREEN_LEAF_TO_MADE_TEA = 4.5;

export const ESRGS: ESrg[] = [
  {
    id: "SRG-TEH-024",
    holder: KOPERASI,
    warehouse: GUDANG,
    commodity: "Black Tea BOP",
    quantityKg: 24_000,
    valueIdr: 600_000_000,
    issuedAt: "2026-08-18",
    expiresAt: "2026-12-18",
    documentHash: "0x9f2c41a7e5b83d06c1f47a920e6b5d3841c07ae9b26f5d8130c4a7e91b5f2d68",
    encumbrance: "none",
  },
  {
    id: "SRG-TEH-031",
    holder: KOPERASI,
    warehouse: GUDANG,
    commodity: "Black Tea Dust I",
    quantityKg: 12_600,
    valueIdr: 226_800_000,
    issuedAt: "2026-08-29",
    expiresAt: "2026-12-29",
    documentHash: "0x3d81b60fa74e29c5083b1d7e64a2905fc8b37e14d90a625fb3c81e70d4a96b2f",
    encumbrance: "none",
  },
];

const intake = (supplierId: string, madeTeaKg: number, pricePerKgIdr: number): Intake => ({
  supplierId,
  madeTeaKg,
  greenLeafKg: Math.round(madeTeaKg * GREEN_LEAF_TO_MADE_TEA),
  pricePerKgIdr,
});

export const INTAKES: Record<string, Intake[]> = {
  "SRG-TEH-024": [
    intake("PTN-014", 3_600, 2_400),
    intake("PTN-027", 2_850, 2_150),
    intake("PTN-033", 3_300, 2_300),
    intake("PTN-041", 2_400, 1_950),
    intake("PTN-052", 3_150, 2_250),
    intake("PTN-066", 2_700, 2_050),
    intake("PTN-071", 3_450, 2_350),
    intake("PTN-088", 2_550, 1_850),
  ],
  "SRG-TEH-031": [
    intake("PTN-014", 4_200, 2_100),
    intake("PTN-033", 3_900, 2_000),
    intake("PTN-052", 4_500, 2_200),
  ],
};
