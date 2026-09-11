import deployed from "../../../contracts/deployed.json";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export type StackPort = {
  port: string;
  backend: string;
  detail: string;
  mode: "live" | "simulated";
};

export const STACK_PORTS: StackPort[] = [
  { port: "e-SRG", backend: "Synthetic documents", detail: "Not running in practice", mode: "simulated" },
  { port: "Identity", backend: "Privy sign-in", detail: "World ID pending", mode: "simulated" },
  { port: "Registry", backend: "Bappebti registry", detail: "No public API", mode: "simulated" },
  { port: "Proof", backend: "Noir · nargo → bb", detail: `HonkVerifier ${short(deployed.HonkVerifier)}`, mode: "live" },
  { port: "Token", backend: "ATS v4.x factory", detail: `AnoraNote ${short(deployed.AnoraNote.address)}`, mode: "live" },
];
