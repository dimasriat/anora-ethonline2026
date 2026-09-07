/**
 * Tipe domain. Sengaja tidak tahu apa pun soal rantai, HTTP, maupun basis data.
 */

/** Resi gudang elektronik. Diterbitkan pengelola gudang berizin — bukan oleh kita. */
export type ESrg = {
  id: string;
  /** Pemilik legal, pemegang resi. Dialah yang meminjam. */
  holder: string;
  /** Penguasa fisik barangnya. Bukan pemilik. */
  warehouse: string;
  commodity: string;
  quantityKg: number;
  valueIdr: number;
  issuedAt: string;
  expiresAt: string;
  documentHash: string;
  encumbrance: "none" | "pledged";
};

/**
 * Satu setoran pucuk dari satu petani.
 *
 * Dua satuan yang gampang tertukar: petani menyetor dan dibayar per kg **pucuk
 * basah**, sedangkan yang diakui gudang adalah **made tea**. Pucuk menyusut
 * sekitar 4,5:1 saat diolah, jadi kedua angka ini tidak boleh dicampur.
 *
 * Yang dijumlahkan sirkuit cuma `madeTeaKg`. Dua field lainnya rahasia dagang,
 * dan justru itulah yang tidak boleh keluar.
 */
export type Intake = {
  supplierId: string;
  greenLeafKg: number;
  pricePerKgIdr: number;
  madeTeaKg: number;
};

export type RequestStatus =
  | "draft" | "mandate_signed" | "approved" | "proven"
  | "tokenized" | "subscribed" | "funded" | "repaid";

export type FinancingRequest = {
  id: string;
  esrgId: string;
  /** Pokok yang diminta. Tidak pernah melebihi plafon yang diturunkan dari resi. */
  requestedIdr: number;
  maturityDays: number;
  /** Basis poin; 7000 = 70%, batas LTV kebijakan. */
  maxLtvBp: number;
  /** Ronde. Naik setelah pelunasan, sehingga resi bisa dijaminkan lagi. */
  epoch: number;
  status: RequestStatus;
};

export type TrancheName = "SENIOR" | "JUNIOR";

/**
 * Syarat satu tranche, disimpan sebagai angka — bukan disimpulkan dari namanya.
 *
 * `attachmentIdr` dan `detachmentIdr` adalah batas rugi: tranche ini mulai
 * terluka setelah kerugian melewati attachment, dan habis di detachment.
 * Menyimpannya begini penting karena label "SENIOR" sendiri tidak menjamin
 * apa pun — yang menjamin urutan bayar adalah modul settlement, bukan nama.
 */
export type TrancheTerms = {
  name: TrancheName;
  capacityIdr: number;
  returnBp: number;
  attachmentIdr: number;
  detachmentIdr: number;
};

/** Pemodal yang boleh masuk. Mandat menentukan tranche mana; allowlist
 *  menentukan boleh atau tidak sama sekali. */
export type Investor = {
  id: string;
  name: string;
  /** Where allocated units land when the note is on-chain. */
  address: string;
  capitalType: string;
  riskProfile: string;
  mandate: TrancheName[];
  ticketIdr: { min: number; max: number };
  allowlisted: boolean;
  /** Alasannya, dalam kalimat yang bisa ditampilkan saat pemodal ditolak. */
  standing: string;
};

/** Satu komitmen modal ke satu tranche. */
export type Subscription = {
  id: string;
  investorId: string;
  tranche: TrancheName;
  unitsIdr: number;
  at: string;
};

/** Perpindahan unit antar pemodal setelah alokasi. Digerbangi di sisi penerima. */
export type NoteTransfer = {
  id: string;
  fromInvestorId: string;
  toInvestorId: string;
  tranche: TrancheName;
  unitsIdr: number;
  at: string;
};

export type NoteToken = {
  series: string;
  underlying: string;
  ceilingIdr: number;
  transferRule: "allowlisted";
  state: "reserved" | "active" | "redeemed";
  address?: string;
};

export type EligibilityProof = {
  proofHex: string;
  publicInputs: string[];
  /** Mencegah satu resi dibiayai dua kali dalam ronde yang sama. */
  nullifier: string;
  checks: { label: string; pass: boolean }[];
};
