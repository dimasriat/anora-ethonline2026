import { useEffect, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { setAccessToken } from "./session";
import { needsSession } from "./session-gate";

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

  if (!needsSession(hash) || (ready && authenticated && carrying)) return <>{children}</>;

  return (
    <div className="public-page">
      <main className="landing-main">
        <p className="supporting-copy">
          {ready ? "Sign in to open a workspace." : "Starting the session…"}
        </p>
        {ready ? <button className="access-submit" onClick={login}>Sign in with Privy</button> : null}
      </main>
    </div>
  );
}
