import { useEffect, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { setAccessToken } from "./session";
import { needsSession } from "./session-gate";
import { IdentityContext, privyStanding } from "./identity";

export function PrivySession({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [carrying, setCarrying] = useState(false);
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setAccessToken(null);
      setCarrying(false);
      return;
    }
    let alive = true;
    getAccessToken().then((token) => {
      if (!alive) return;
      setAccessToken(token);
      setCarrying(true);
    });
    return () => { alive = false; };
  }, [ready, authenticated, getAccessToken]);

  const standing = { ...privyStanding({ simulated: false, ready, authenticated, carrying }), login };

  if (!needsSession(hash) || (ready && authenticated && carrying)) {
    return <IdentityContext.Provider value={standing}>{children}</IdentityContext.Provider>;
  }

  return (
    <div className="public-page access-page">
      <header className="public-header compact-header">
        <span className="wordmark-button" aria-label="Anora">Anora</span>
      </header>
      <main className="access-main">
        <div className="access-card">
          <header className="access-intro">
            <span className="eyebrow">Secure access</span>
            <h1>Sign in to continue.</h1>
            <img
              className="access-figure"
              src="/anora-tea-warehouse.jpg"
              width="900"
              height="618"
              alt="Made tea stored in a licensed warehouse — the inventory an e-SRG is issued against."
            />
          </header>
          <div className="access-panel signin-panel">
            <p className="supporting-copy">
              {ready
                ? "Anora uses Privy for sign-in. Your workspace, its organisation wallet and its signing quorum are attached to the account you use here."
                : "Starting the session…"}
            </p>
            {ready ? (
              <button type="button" className="access-submit" onClick={login}>Sign in with Privy</button>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
