/**
 * Data contoh. Deterministik, dan jujur menyatakan diri simulasi.
 *
 * Angkanya bukan karangan. Harga made tea curah di gudang ada di kisaran
 * Rp 11.000–30.000/kg menurut price list dagang di deck Dewan Teh Indonesia
 * (slide 55). Storyboard awal memakai Rp 75.000/kg — 2,5 sampai 5 kali harga
 * pasar — sehingga seluruh valuasi demo ikut salah. Di sini dipakai
 * Rp 25.000/kg: dalam band, agak di atas tengah, wajar untuk BOP mutu baik.
 *
 * Sistem Resi Gudang berlaku untuk teh sejak 2006 tapi praktis belum jalan di
 * lapangan. Itu justru sebagian dari alasan proyek ini ada.
 */
import type { ESrg, Intake } from "@anora/core";

export const KOPERASI = "Koperasi Anora Sejahtera";
export const GUDANG = "Gudang SRG Bandung 02";

/** Pucuk menyusut sekitar 4,5:1 jadi made tea. */
const RASIO_PUCUK_KE_MADE_TEA = 4.5;

export const ESRGS: ESrg[] = [
  {
    id: "SRG-TEH-024",
    holder: KOPERASI,
    warehouse: GUDANG,
    commodity: "Black Tea BOP",
    quantityKg: 24_000,
    /* 24.000 kg x Rp 25.000 */
    valueIdr: 600_000_000,
    issuedAt: "2026-08-18",
    expiresAt: "2026-12-18",
    documentHash: "0x9f2c41a7e5b83d06c1f47a920e6b5d3841c07ae9b26f5d8130c4a7e91b5f2d68",
    encumbrance: "none",
  },
  {
    /* Resi kedua ada supaya uji LTV punya kasus yang gagal, bukan cuma lolos. */
    id: "SRG-TEH-031",
    holder: KOPERASI,
    warehouse: GUDANG,
    commodity: "Black Tea Dust I",
    quantityKg: 12_600,
    /* 12.600 kg x Rp 18.000 — mutu lebih rendah, harga lebih rendah */
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
  greenLeafKg: Math.round(madeTeaKg * RASIO_PUCUK_KE_MADE_TEA),
  pricePerKgIdr,
});

/**
 * Setoran per petani. Yang dijumlahkan sirkuit cuma made tea-nya; harga beli
 * per pemasok justru rahasia yang tidak boleh keluar.
 *
 * Harga pucuk Rp 1.850–2.400/kg mengikuti kisaran lapangan yang tercatat, dan
 * memang di bawah biaya kelola Rp 3.200/kg. Selisih itu masalah sektornya,
 * bukan salah ketik.
 */
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
