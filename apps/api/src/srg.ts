/**
 * Apa yang boleh masuk gudang SRG, dan gudang mana yang terdaftar.
 *
 * Ini regulasi, bukan pilihan kami: Permendag 33/2020 sampai perubahan
 * Permendag 1/2025 memuat 27 komoditas. Dua pemakainya berbeda urusan —
 * validasi formulir peminjam (`intake.ts`) dan portofolio demo
 * (`adapters/mock/seed.ts`) — jadi daftarnya tinggal di sini, satu definisi,
 * bukan disalin ke dua tempat.
 */
export const SRG_COMMODITIES = [
  "Unhulled rice", "Rice", "Maize", "Coffee", "Cocoa", "Pepper", "Rubber",
  "Seaweed", "Rattan", "Salt", "Gambier", "Tea", "Copra", "Tin", "Shallot",
  "Fish", "Nutmeg", "Frozen chicken carcass", "White crystal sugar", "Soybean",
  "Tobacco", "Cinnamon", "Agar", "Carrageenan", "Modified cassava flour",
  "Areca nut", "Tapioca",
];

export const SRG_WAREHOUSES = [
  "Gudang SRG Bandung 02", "Gudang SRG Cianjur 01", "Gudang SRG Indramayu 03",
  "Gudang SRG Subang 01", "Gudang SRG Grobogan 02", "Gudang SRG Ngawi 01",
  "Gudang SRG Jombang 02", "Gudang SRG Tuban 01", "Gudang SRG Lampung Tengah 04",
  "Gudang SRG Sidrap 01", "Gudang SRG Bantaeng 02",
];
