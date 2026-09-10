/**
 * Data seed. Angka teh mengikuti storyboard Gama 3 September 2026 supaya demo,
 * naskah, dan wiki menyebut angka yang sama persis.
 *
 * SEMUANYA SINTETIS. Tidak ada e-SRG sungguhan yang bisa dipakai — Sistem Resi
 * Gudang berlaku untuk teh sejak 2006 tapi praktis belum jalan di lapangan.
 * Itu justru sebagian dari alasan proyek ini ada.
 *
 * Teh tetap contoh utamanya: dua resi teh di bawah punya angka yang dipakai di
 * seluruh naskah, dan alur pembiayaan berjalan di atasnya. Sisa portofolio ada
 * supaya layar peminjam memperlihatkan hal yang sebenarnya diatur regulasi —
 * 27 komoditas, 11 gudang — bukan satu komoditas saja.
 */
import type { ESrg, Intake, Investor } from "@anora/core";
import { SRG_WAREHOUSES } from "../../srg";

export const KOPERASI = "Koperasi Anora Sejahtera";
export const GUDANG = "Gudang SRG Bandung 02";

/**
 * Satu baris per komoditas SRG selain teh.
 *
 * `idrPerKg` adalah nilai yang dicatat resi, bukan harga pasar hari ini, dan
 * `rawRatio` hanya diisi kalau memang ada penyusutan olah yang nyata: pucuk ke
 * made tea 4,5:1, ceri kopi ke green bean 5:1, gabah ke beras 1,6:1, daging
 * kelapa segar ke kopra 4:1. Sisanya masuk gudang dalam satuan yang sama
 * dengan yang ditimbang saat setoran, jadi rasionya 1.
 */
type Row = {
  code: string; commodity: string; quantityKg: number; idrPerKg: number;
  warehouse: number; issuedAt: string; expiresAt: string;
  lots: number; farmgateIdrPerKg: number; rawRatio?: number;
  encumbrance?: "pledged";
};

const PORTFOLIO: Row[] = [
  { code: "GBH", commodity: "Unhulled rice", quantityKg: 45_000, idrPerKg: 6_500, warehouse: 5, issuedAt: "2026-04-18", expiresAt: "2026-10-31", lots: 8, farmgateIdrPerKg: 4_400, rawRatio: 1.6, encumbrance: "pledged" },
  { code: "BRS", commodity: "Rice", quantityKg: 30_000, idrPerKg: 13_000, warehouse: 4, issuedAt: "2026-05-22", expiresAt: "2026-11-30", lots: 6, farmgateIdrPerKg: 9_100 },
  { code: "JGG", commodity: "Maize", quantityKg: 52_000, idrPerKg: 5_500, warehouse: 7, issuedAt: "2026-03-14", expiresAt: "2026-10-15", lots: 7, farmgateIdrPerKg: 3_700 },
  { code: "KOP", commodity: "Coffee", quantityKg: 12_000, idrPerKg: 65_000, warehouse: 8, issuedAt: "2026-06-09", expiresAt: "2027-03-31", lots: 6, farmgateIdrPerKg: 8_800, rawRatio: 5 },
  { code: "KKO", commodity: "Cocoa", quantityKg: 9_000, idrPerKg: 88_000, warehouse: 10, issuedAt: "2026-07-03", expiresAt: "2027-04-30", lots: 5, farmgateIdrPerKg: 61_000 },
  { code: "LAD", commodity: "Pepper", quantityKg: 6_500, idrPerKg: 78_000, warehouse: 8, issuedAt: "2026-05-28", expiresAt: "2027-02-28", lots: 4, farmgateIdrPerKg: 54_000 },
  { code: "KRT", commodity: "Rubber", quantityKg: 24_000, idrPerKg: 21_500, warehouse: 6, issuedAt: "2026-04-02", expiresAt: "2026-12-31", lots: 6, farmgateIdrPerKg: 14_500, encumbrance: "pledged" },
  { code: "RML", commodity: "Seaweed", quantityKg: 18_000, idrPerKg: 12_500, warehouse: 9, issuedAt: "2026-06-25", expiresAt: "2027-01-31", lots: 7, farmgateIdrPerKg: 8_300 },
  { code: "RTN", commodity: "Rattan", quantityKg: 14_000, idrPerKg: 15_500, warehouse: 10, issuedAt: "2026-02-19", expiresAt: "2026-11-15", lots: 5, farmgateIdrPerKg: 10_200 },
  { code: "GRM", commodity: "Salt", quantityKg: 80_000, idrPerKg: 2_400, warehouse: 2, issuedAt: "2026-08-07", expiresAt: "2027-05-31", lots: 8, farmgateIdrPerKg: 1_500 },
  { code: "GBR", commodity: "Gambier", quantityKg: 5_200, idrPerKg: 34_000, warehouse: 8, issuedAt: "2026-03-26", expiresAt: "2026-12-15", lots: 4, farmgateIdrPerKg: 23_000 },
  { code: "KPR", commodity: "Copra", quantityKg: 26_000, idrPerKg: 11_000, warehouse: 9, issuedAt: "2026-05-11", expiresAt: "2026-12-20", lots: 6, farmgateIdrPerKg: 1_900, rawRatio: 4 },
  { code: "TMH", commodity: "Tin", quantityKg: 900, idrPerKg: 465_000, warehouse: 7, issuedAt: "2026-07-21", expiresAt: "2027-06-30", lots: 3, farmgateIdrPerKg: 355_000 },
  { code: "BWM", commodity: "Shallot", quantityKg: 11_000, idrPerKg: 27_500, warehouse: 1, issuedAt: "2026-08-15", expiresAt: "2026-11-20", lots: 6, farmgateIdrPerKg: 18_500 },
  { code: "IKN", commodity: "Fish", quantityKg: 15_000, idrPerKg: 34_000, warehouse: 9, issuedAt: "2026-07-30", expiresAt: "2027-01-15", lots: 5, farmgateIdrPerKg: 23_500, encumbrance: "pledged" },
  { code: "PAL", commodity: "Nutmeg", quantityKg: 4_800, idrPerKg: 96_000, warehouse: 10, issuedAt: "2026-04-24", expiresAt: "2027-02-15", lots: 4, farmgateIdrPerKg: 66_000 },
  { code: "KAB", commodity: "Frozen chicken carcass", quantityKg: 20_000, idrPerKg: 37_000, warehouse: 3, issuedAt: "2026-08-20", expiresAt: "2026-12-05", lots: 4, farmgateIdrPerKg: 27_000 },
  { code: "GKP", commodity: "White crystal sugar", quantityKg: 35_000, idrPerKg: 15_500, warehouse: 4, issuedAt: "2026-06-16", expiresAt: "2027-03-15", lots: 5, farmgateIdrPerKg: 11_200 },
  { code: "KDL", commodity: "Soybean", quantityKg: 28_000, idrPerKg: 11_500, warehouse: 5, issuedAt: "2026-05-06", expiresAt: "2026-12-10", lots: 6, farmgateIdrPerKg: 7_800 },
  { code: "TBK", commodity: "Tobacco", quantityKg: 8_500, idrPerKg: 56_000, warehouse: 6, issuedAt: "2026-08-28", expiresAt: "2027-05-15", lots: 5, farmgateIdrPerKg: 38_000 },
  { code: "KYM", commodity: "Cinnamon", quantityKg: 7_200, idrPerKg: 43_000, warehouse: 10, issuedAt: "2026-03-05", expiresAt: "2027-01-20", lots: 4, farmgateIdrPerKg: 29_000, encumbrance: "pledged" },
  { code: "AGR", commodity: "Agar", quantityKg: 3_400, idrPerKg: 118_000, warehouse: 9, issuedAt: "2026-06-30", expiresAt: "2027-04-15", lots: 3, farmgateIdrPerKg: 82_000 },
  { code: "KGN", commodity: "Carrageenan", quantityKg: 3_100, idrPerKg: 132_000, warehouse: 9, issuedAt: "2026-07-14", expiresAt: "2027-06-15", lots: 3, farmgateIdrPerKg: 93_000 },
  { code: "MCF", commodity: "Modified cassava flour", quantityKg: 22_000, idrPerKg: 14_000, warehouse: 7, issuedAt: "2026-04-09", expiresAt: "2026-11-05", lots: 5, farmgateIdrPerKg: 9_400, encumbrance: "pledged" },
  { code: "PNG", commodity: "Areca nut", quantityKg: 16_000, idrPerKg: 17_500, warehouse: 8, issuedAt: "2026-05-19", expiresAt: "2027-02-05", lots: 6, farmgateIdrPerKg: 11_800 },
  { code: "TPK", commodity: "Tapioca", quantityKg: 31_000, idrPerKg: 12_500, warehouse: 2, issuedAt: "2026-06-02", expiresAt: "2026-12-28", lots: 5, farmgateIdrPerKg: 8_600 },
];

/**
 * Dua resi teh, angka storyboard, tidak boleh berubah: seluruh naskah demo
 * menyebut Rp 600.000.000 atas 8.000 kg dan plafon Rp 420.000.000 di atasnya.
 */
const TEA: ESrg[] = [
  {
    id: "SRG-TEH-024",
    holder: KOPERASI,
    warehouse: GUDANG,
    commodity: "Black Tea BOP",
    quantityKg: 8_000,
    valueIdr: 600_000_000,
    issuedAt: "2026-11-20",
    expiresAt: "2027-02-28",
    documentHash: "0x83a1f0c47b2e9d5a8c3f6b1e40d92a7c5e8b0f3d6a9c2e5b8d1f4a7c0e3b6d91",
    encumbrance: "none",
  },
  {
    id: "SRG-TEH-018",
    holder: KOPERASI,
    warehouse: GUDANG,
    commodity: "Green Tea",
    quantityKg: 4_200,
    valueIdr: 310_000_000,
    issuedAt: "2026-10-02",
    expiresAt: "2027-01-15",
    documentHash: "0x4e7b1a9c2f5d8e0b3a6c9f2e5b8d1a4c7e0b3f6a9d2c5e8b1f4a7d0c3e6b9f22",
    encumbrance: "none",
  },
];

const receiptId = (code: string, index: number) => `SRG-${code}-${String(31 + index).padStart(3, "0")}`;

/** Hash sintetis, dan sengaja diturunkan dari id: tidak ada dokumen untuk di-hash. */
const syntheticHash = (id: string) => {
  let hex = "";
  for (let i = 0; i < 32; i++) {
    let h = 0x811c9dc5 ^ (i * 0x01000193);
    for (const ch of `${id}#${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    hex += (h & 0xff).toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
};

/**
 * Pembagian lot yang deterministik. Jumlahnya wajib pas dengan kuantitas
 * gudang — itu salah satu yang diperiksa sirkuit — dan sirkuit baru mendukung
 * paling banyak 8 lot per resi.
 */
function splitLots(seed: string, total: number, count: number): number[] {
  const weights = Array.from({ length: count }, (_, i) =>
    80 + ((seed.charCodeAt(i % seed.length) * (i + 7)) % 45));
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.round((total * w) / sum));
  parts[count - 1] = (parts[count - 1] ?? 0) + total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

const PORTFOLIO_ESRGS: ESrg[] = PORTFOLIO.map((row, index) => {
  const id = receiptId(row.code, index);
  return {
    id,
    holder: KOPERASI,
    warehouse: SRG_WAREHOUSES[row.warehouse]!,
    commodity: row.commodity,
    quantityKg: row.quantityKg,
    valueIdr: row.quantityKg * row.idrPerKg,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    documentHash: syntheticHash(id),
    encumbrance: row.encumbrance ?? "none",
  };
});

export const ESRGS: ESrg[] = [...TEA, ...PORTFOLIO_ESRGS];

/**
 * Rahasia dagang: berat setoran dan harga beli per pemasok. Masukan PRIVAT sirkuit.
 *
 * Dua satuan, jangan dicampur. Pada teh, petani dibayar per kg PUCUK sedangkan
 * yang masuk lot adalah MADE TEA, dan penyusutannya ~4,5:1. `pricePerKgIdr`
 * selalu harga per kg bahan yang disetor, bukan per kg yang diakui gudang.
 */
const RASIO_PUCUK_KE_MADE_TEA = 4.5;

const intake = (supplierId: string, lotKg: number, pricePerKgIdr: number, rawRatio: number): Intake => ({
  supplierId,
  madeTeaKg: lotKg,
  greenLeafKg: Math.round(lotKg * rawRatio),
  pricePerKgIdr,
});

const teaIntake = (supplierId: string, lotKg: number, pricePerKgIdr: number) =>
  intake(supplierId, lotKg, pricePerKgIdr, RASIO_PUCUK_KE_MADE_TEA);

export const INTAKES: Record<string, Intake[]> = {
  // 8 intake -> 8.000 kg made tea, dari ~36.000 kg pucuk
  "SRG-TEH-024": [
    teaIntake("TANI-01", 1200, 2250),
    teaIntake("TANI-02", 950, 2180),
    teaIntake("TANI-03", 1100, 2310),
    teaIntake("TANI-04", 800, 2200),
    teaIntake("TANI-05", 1050, 2270),
    teaIntake("TANI-06", 900, 2150),
    teaIntake("TANI-07", 1150, 2290),
    teaIntake("TANI-08", 850, 2240),
  ],
  "SRG-TEH-018": [
    teaIntake("TANI-03", 2100, 2400),
    teaIntake("TANI-09", 2100, 2380),
  ],
  ...Object.fromEntries(PORTFOLIO.map((row, index) => {
    const id = receiptId(row.code, index);
    const ratio = row.rawRatio ?? 1;
    return [id, splitLots(row.code, row.quantityKg, row.lots).map((lotKg, lot) =>
      /* Harga sedikit berbeda tiap pemasok — itu justru yang tidak boleh bocor. */
      intake(`TANI-${row.code}-${String(lot + 1).padStart(2, "0")}`, lotKg,
        row.farmgateIdrPerKg + ((lot * 37) % 9) * 10 - 40, ratio)),
    ];
  })),
};

/**
 * Enam pemodal, bukan tiga penawar. Fasilitasnya satu dengan syarat tetap;
 * yang berbeda adalah siapa yang boleh memegang tranche mana.
 *
 * Dana pensiun dan bank tidak boleh memegang first-loss — itu mandat, bukan
 * selera. Koperasi justru menahan Junior karena kepentingannya sejajar dengan
 * peminjam. Meridian sengaja BELUM lolos allowlist: tanpa satu pihak yang
 * ditolak, kontrol transfer cuma jadi klaim di layar.
 */
export const INVESTORS: Investor[] = [
  {
    id: "INV-BRS", address: "0x00000000000000000000000000000000000000B1", name: "Bank Rakyat Sejahtera",
    capitalType: "Commercial bank balance sheet",
    riskProfile: "Capital-preserving; senior secured only",
    mandate: ["SENIOR"], ticketIdr: { min: 50_000_000, max: 270_000_000 },
    allowlisted: true, standing: "KYB verified · custody agreement on file",
  },
  {
    id: "INV-DPN", address: "0x00000000000000000000000000000000000000D9", name: "Dana Pensiun Nusantara",
    capitalType: "Pension fund",
    riskProfile: "Liability-matched; no first-loss permitted",
    mandate: ["SENIOR"], ticketIdr: { min: 100_000_000, max: 270_000_000 },
    allowlisted: true, standing: "KYB verified · trustee mandate on file",
  },
  {
    id: "INV-MVA", address: "0x00000000000000000000000000000000000000A4", name: "Mandiri Ventura Agri",
    capitalType: "Agricultural credit fund",
    riskProfile: "Yield-seeking; accepts subordinated exposure",
    mandate: ["SENIOR", "JUNIOR"], ticketIdr: { min: 25_000_000, max: 120_000_000 },
    allowlisted: true, standing: "KYB verified · qualified investor",
  },
  {
    id: "INV-KIT", address: "0x00000000000000000000000000000000000000C0", name: "Koperasi Induk Tani",
    capitalType: "Cooperative retained capital",
    riskProfile: "Aligned first-loss; holds junior alongside members",
    mandate: ["JUNIOR"], ticketIdr: { min: 10_000_000, max: 120_000_000 },
    allowlisted: true, standing: "KYB verified · cooperative resolution on file",
  },
  {
    id: "INV-YMS", address: "0x00000000000000000000000000000000000000E5", name: "Yayasan Modal Sosial",
    capitalType: "Blended and concessional capital",
    riskProfile: "Impact-first; subsidises junior to unlock senior",
    mandate: ["JUNIOR"], ticketIdr: { min: 10_000_000, max: 60_000_000 },
    allowlisted: true, standing: "KYB verified · grant mandate on file",
  },
  {
    id: "INV-MFC", address: "0x000000000000000000000000000000000000dEaD", name: "Meridian Frontier Credit",
    capitalType: "Offshore credit fund",
    riskProfile: "Opportunistic; highest yield appetite",
    mandate: ["SENIOR", "JUNIOR"], ticketIdr: { min: 50_000_000, max: 270_000_000 },
    allowlisted: false, standing: "KYB incomplete · beneficial ownership unverified",
  },
  {
    id: "INV-NFO", address: "0x00000000000000000000000000000000000000F1", name: "Nusantara Family Office",
    capitalType: "Family office",
    riskProfile: "Balanced income; accepts measured first-loss exposure",
    mandate: ["SENIOR", "JUNIOR"], ticketIdr: { min: 20_000_000, max: 150_000_000 },
    allowlisted: true, standing: "KYB verified · investment committee mandate on file",
  },
  {
    id: "INV-JFS", address: "0x00000000000000000000000000000000000000F2", name: "Jabar Food Security Fund",
    capitalType: "Regional enterprise treasury",
    riskProfile: "Capital-preserving; food security assets only",
    mandate: ["SENIOR"], ticketIdr: { min: 40_000_000, max: 220_000_000 },
    allowlisted: true, standing: "KYB verified · treasury resolution on file",
  },
  {
    id: "INV-STF", address: "0x00000000000000000000000000000000000000F3", name: "Sahabat Tani Funding",
    capitalType: "Licensed fintech treasury",
    riskProfile: "Diversified yield; accepts capped junior exposure",
    mandate: ["SENIOR", "JUNIOR"], ticketIdr: { min: 5_000_000, max: 80_000_000 },
    allowlisted: true, standing: "KYB verified · lender policy approved",
  },
  {
    id: "INV-BCT", address: "0x00000000000000000000000000000000000000F4", name: "Banyan Commodity Traders",
    capitalType: "Commodity buyer working capital",
    riskProfile: "Strategic inventory exposure; flexible across tranches",
    mandate: ["SENIOR", "JUNIOR"], ticketIdr: { min: 15_000_000, max: 120_000_000 },
    allowlisted: true, standing: "KYB verified · trade mandate on file",
  },
  {
    id: "INV-RPR", address: "0x00000000000000000000000000000000000000F5", name: "Raka Pranoto",
    capitalType: "Qualified individual participant",
    riskProfile: "Growth-oriented; limited first-loss allocation",
    mandate: ["JUNIOR"], ticketIdr: { min: 5_000_000, max: 35_000_000 },
    allowlisted: true, standing: "Identity and source-of-funds checks complete",
  },
  {
    id: "INV-RKN", address: "0x00000000000000000000000000000000000000F6", name: "Ritel Kolektif Nusantara",
    capitalType: "Investment cooperative",
    riskProfile: "Member income strategy; senior exposure only",
    mandate: ["SENIOR"], ticketIdr: { min: 10_000_000, max: 90_000_000 },
    allowlisted: false, standing: "Cooperative resolution awaiting review",
  },
];

/** Bukti sungguhan hasil menjalankan sirkuit di VPS ini, 3 September 2026. */
export const PROOF_FACTS = {
  gates: 28_680,
  proveSeconds: 1.16,
  proofBytes: 8_384,
  publicInputs: 9,
  nullifier: "0x1d8d06371994d27bc32c502bb93fc8833edc5a615fff6d438c549885e10a7b46",
  root: "0x03edeb6f9303fa653095ff1f58110a5f669ca1de49c82ff782ee5302b760f441",
  mandateHash: "0x06ca22ad207a9c28d467c427640e3ad08e832ace33ec05a4fbb31388ff4e6511",
  verifier: "0xa3d38706EBff4D51931437b41e22C6B129B940dB",
  verifyGas: 2_390_842,
};
