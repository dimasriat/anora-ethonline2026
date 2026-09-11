export type CheckSessionView = {
  id: string;
  state: "pending" | "verified" | "failed";
  connectorURI: string;
  qrSvg: string | null;
  because?: string;
};

export type Scannable = { uri: string; svg: string };

export type CheckReading =
  | { phase: "verified"; scannable: null }
  | { phase: "waiting"; scannable: Scannable | null }
  | { phase: "failed"; scannable: null; because?: string };

export function readCheck(session: CheckSessionView): CheckReading {
  if (session.state === "verified") return { phase: "verified", scannable: null };
  if (session.state === "failed") return { phase: "failed", scannable: null, because: session.because };
  const scannable = session.connectorURI && session.qrSvg
    ? { uri: session.connectorURI, svg: session.qrSvg }
    : null;
  return { phase: "waiting", scannable };
}
