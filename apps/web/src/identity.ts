import { createContext, useContext } from "react";

export type PrivyFacts = {
  simulated: boolean;
  ready: boolean;
  authenticated: boolean;
  carrying: boolean;
};

export type Standing = { label: string; tone: "ready" | "pending" | "absent" };

export const privyStanding = ({ simulated, ready, authenticated, carrying }: PrivyFacts): Standing => {
  if (simulated) return { label: "Simulated", tone: "pending" };
  if (ready && authenticated && carrying) return { label: "Connected", tone: "ready" };
  if (ready && !authenticated) return { label: "Not connected", tone: "absent" };
  return { label: "Signing in…", tone: "pending" };
};

export const IdentityContext = createContext<Standing>({ label: "Simulated", tone: "pending" });

export const useIdentityStanding = () => useContext(IdentityContext);
