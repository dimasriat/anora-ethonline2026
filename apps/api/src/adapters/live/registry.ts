export type RegistryEntry = {
  registryRoot: string;
  receiptKey: string;
  mandateHash: string;
  secret: string;
  nullifierKey: string;
  receiptId: string;
  path: string[];
  index: string;
  mandatePreimage: string;
};

export const REGISTRY: Record<string, RegistryEntry> = {
  "SRG-TEH-024": {
    registryRoot: "0x2ffde7a8f3e6123f413fe00b55b6f02de6cfb319eeb729c9b5acd6e3eec79b72",
    receiptKey: "0x149ed61dfcc44c896864dc5e98a873063199a2a3daf456447bdd66c5275e0d3e",
    mandateHash: "0x1ed9fa2cba5be6b80cdd1a41d8b926e0db92b295d3023fa7edb5ae750bf7d677",
    secret: "0x1a2b3c",
    nullifierKey: "0x4d5e6f",
    receiptId: "0x53524754454824",
    path: ["100", "101", "102", "103", "104", "105", "106", "107"],
    index: "5",
    mandatePreimage: "0x9911aa",
  },
};

export const registryEntry = (esrgId: string): RegistryEntry | undefined => REGISTRY[esrgId];
