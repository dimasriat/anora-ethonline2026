import { useEffect, useState } from "react";
import { useAuthorizationSignature, useLogout } from "@privy-io/react-auth";
import { api } from "./api";
import type { AuthorizationRequest, BoardView } from "./api";

export default function BoardPanel({ facilityId }: { facilityId: string }) {
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const { logout } = useLogout();
  const [board, setBoard] = useState<BoardView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.board().then(setBoard).catch(() => setBoard(null)); }, []);

  const guard = async (work: () => Promise<BoardView>) => {
    setBusy(true);
    setError(null);
    try { setBoard(await work()); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const enrol = () => guard(() => api.enrolOfficer());

  const approve = () => guard(async () => {
    const payload = await api.boardPayload(facilityId);
    const { signature } = await generateAuthorizationSignature(payload as AuthorizationRequest as never);
    return api.approveMandateAsOfficer(facilityId, signature);
  });

  if (!board) return null;

  const seatsFilled = board.members.every((m) => m.enrolled);

  return (
    <div className="analytics-panel board-panel">
      <h3>Cooperative board</h3>
      <p className="supporting-copy">
        The mandate is signed by the board's own Privy wallet. {board.quorum} of {board.members.length} officers
        must approve, and each signs from their own account; nothing on this server can reach the threshold.
      </p>

      <dl className="wide">
        <div><dt>Organisation wallet</dt><dd>{board.walletAddress ?? "opens once both seats are filled"}</dd></div>
        <div><dt>Quorum</dt><dd>{board.approvals.length} of {board.quorum} signed</dd></div>
      </dl>

      <div className="order-book">
        {board.members.map((m) => (
          <div className="order-row" key={m.officerId}>
            <span><strong>{m.name}</strong><small>{m.role}</small></span>
            <strong>{board.approvals.includes(m.officerId) ? "Signed" : m.enrolled ? "Enrolled" : "Seat open"}</strong>
          </div>
        ))}
      </div>

      {board.signature && (
        <p className="supporting-copy" role="status">
          Quorum reached. The board wallet signed the mandate: <code>{board.signature.slice(0, 26)}…</code>
        </p>
      )}

      {error && <p className="world-id-note" role="alert">{error}</p>}

      <div className="actions">
        {!seatsFilled && !board.you && (
          <button type="button" disabled={busy} onClick={enrol}>Take a seat as this account</button>
        )}
        {!seatsFilled && board.you && (
          <>
            <p className="supporting-copy">
              This account holds the {board.members.find((m) => m.officerId === board.you)?.role} seat.
              The second officer signs in with their own account.
            </p>
            <button type="button" className="secondary-button" onClick={() => logout()}>
              Sign out to switch officer
            </button>
          </>
        )}
        {seatsFilled && !board.signature && board.you && !board.approvals.includes(board.you) && (
          <button type="button" disabled={busy} onClick={approve}>Approve as this account</button>
        )}
        {seatsFilled && !board.signature && board.you && board.approvals.includes(board.you) && (
          <>
            <p className="supporting-copy">Approved. Waiting for the other officer.</p>
            <button type="button" className="secondary-button" onClick={() => logout()}>
              Sign out to switch officer
            </button>
          </>
        )}
        {seatsFilled && !board.signature && !board.you && (
          <p className="supporting-copy">Both seats are taken. Sign in as one of the officers to approve.</p>
        )}
      </div>
    </div>
  );
}
