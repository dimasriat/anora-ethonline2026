import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { readCheck, type CheckReading, type CheckSessionView } from "./world-check";

export default function WorldIdCheck({ verified, onVerified }: {
  verified: boolean;
  onVerified: () => void;
}) {
  const [reading, setReading] = useState<CheckReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (polling.current) clearInterval(polling.current); }, []);

  const settle = (session: CheckSessionView) => {
    const next = readCheck(session);
    /* A poll may answer without the code; the code never changes, so keep it
       rather than letting the QR blink out from under whoever is scanning. */
    setReading((held) =>
      next.phase === "waiting" && !next.scannable && held?.phase === "waiting" && held.scannable
        ? { ...next, scannable: held.scannable }
        : next);
    if (next.phase !== "waiting" && polling.current) {
      clearInterval(polling.current);
      polling.current = null;
    }
    if (next.phase === "verified") onVerified();
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await api.openCheck();
      settle(session);
      if (readCheck(session).phase !== "waiting") return;
      polling.current = setInterval(async () => {
        try {
          settle(await api.readCheckSession(session.id));
        } catch {
          /* A dropped poll is not a failed check; the next tick retries. */
        }
      }, 2000);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (verified || reading?.phase === "verified") {
    return <button type="button" className="secondary-button world-id-button" disabled>World ID verified</button>;
  }

  return (
    <>
      <button type="button" className="secondary-button world-id-button" disabled={busy || reading?.phase === "waiting"} onClick={start}>
        {busy ? "Opening the check…" : reading?.phase === "waiting" ? "Waiting for the scan…" : "Verify with World ID"}
      </button>
      {error && <p className="world-id-note" role="alert">{error}</p>}
      {reading?.phase === "failed" && (
        <p className="world-id-note" role="alert">The check was refused{reading.because ? `: ${reading.because}` : ""}. Try again.</p>
      )}
      {reading?.phase === "waiting" && reading.scannable && (
        <div className="world-id-qr-slot">
          <div className="world-id-qr" aria-label="World ID Selfie Check code" dangerouslySetInnerHTML={{ __html: reading.scannable.svg }} />
          <a className="secondary-button" href={reading.scannable.uri}>Open in World App</a>
          <small>Scan with the World ID Sandbox app. The check finishes on the server, so this page can be left open.</small>
        </div>
      )}
      {reading?.phase === "waiting" && !reading.scannable && (
        <p className="world-id-note">Opening a check with World…</p>
      )}
    </>
  );
}
