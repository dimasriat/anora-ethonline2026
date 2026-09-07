import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  ApiError, api, pct, rp, setAccessToken,
  type CapabilityStatus, type ESrg, type FlowState, type Investor, type TrancheName,
} from "./api";
import { ROLES, STEPS, TRANCHE_COPY, type Role } from "./roles";

export function App() {
  const privy = usePrivyOrNull();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>("Borrower");
  const [receipts, setReceipts] = useState<ESrg[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityStatus[]>([]);
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [facilities, setFacilities] = useState<FlowState[]>([]);
  const [allowance, setAllowance] = useState<{ held: number; limit: number; remaining: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => {
    if (!privy) { setReady(true); return; }
    if (!privy.ready) return;
    if (!privy.authenticated) { setAccessToken(null); setReady(true); return; }
    privy.getAccessToken().then((token) => {
      setAccessToken(token);
      setReady(true);
    });
  }, [privy?.ready, privy?.authenticated]);

  useEffect(() => {
    if (!ready) return;
    api.esrgs().then(setReceipts).catch(() => setReceipts([]));
    api.investors().then(setInvestors).catch(() => setInvestors([]));
    api.status().then(setCapabilities).catch(() => setCapabilities([]));
    refreshFacilities();
  }, [ready]);

  const refreshFacilities = () => {
    api.requests().then(setFacilities).catch(() => setFacilities([]));
    api.me().then((me) => setAllowance(me.facilities)).catch(() => setAllowance(null));
  };

  const run = async (fn: () => Promise<FlowState>) => {
    setBusy(true);
    setRefusal(null);
    try {
      setFlow(await fn());
      refreshFacilities();
    } catch (error) {
      setRefusal(
        error instanceof ApiError
          ? { code: error.code, message: error.message }
          : { code: "unreachable", message: "The API could not be reached" },
      );
    } finally {
      setBusy(false);
    }
  };

  const step = STEPS[flow?.request.status ?? "none"]!;
  const mine = step.owner === role;

  return (
    <div className="shell">
      <header>
        <div className="brand">Anora</div>
        <nav>
          {ROLES.map((r) => (
            <button key={r} className={r === role ? "on" : ""} onClick={() => setRole(r)}>
              {r}
              {STEPS[flow?.request.status ?? "none"]!.owner === r && <span className="dot" />}
            </button>
          ))}
          {privy?.authenticated ? (
            <button className="signout" onClick={() => { setAccessToken(null); privy.logout(); }}>
              Sign out
            </button>
          ) : privy ? (
            <button className="signin" onClick={() => privy.login()}>Sign in</button>
          ) : null}
        </nav>
      </header>

      <main>
        <section className="stage">
          {privy && privy.ready && !privy.authenticated && (
            <div className="gate">
              <h1>Sign in to open a facility</h1>
              <p className="supporting">
                Email or Google. A wallet is created for you — no seed phrase, and no
                gas to fund. The platform settles on-chain as the facility operator.
              </p>
              <button className="primary" onClick={() => privy.login()}>Sign in</button>
            </div>
          )}

          {(!privy || privy.authenticated) && (<>
          <p className="eyebrow">{mine ? "Your turn" : `With the ${step.owner}`}</p>
          <h1>{step.title}</h1>

          {refusal && (
            <div className="refusal" role="alert">
              <code>{refusal.code}</code>
              <span>{refusal.message}</span>
            </div>
          )}

          {!flow && (
            <ul className="receipts">
              {receipts.map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>{r.id}</strong>
                    <small>{r.commodity} · {r.quantityKg.toLocaleString("id-ID")} kg · {rp(r.valueIdr)}</small>
                  </div>
                  <button disabled={busy || role !== "Borrower"} onClick={() => run(() => api.create(r.id))}>
                    Choose
                  </button>
                </li>
              ))}
            </ul>
          )}

          {flow && step.action && (
            <button className="primary" disabled={busy || !mine}
              onClick={() => run(() => api.step(flow.request.id, step.action!.step))}>
              {busy ? "Working…" : step.action.label}
            </button>
          )}

          {flow && flow.request.status === "draft" && flow.orgWallet && (
            <Quorum flow={flow} busy={busy} enabled={mine}
              onApprove={(officerId) => run(() => api.approveMandate(flow.request.id, officerId))} />
          )}

          {flow && !step.action && flow.request.status === "tokenized" && (
            <Subscribe flow={flow} investors={investors} busy={busy} enabled={mine}
              onSubscribe={(i, t, u) => run(() => api.subscribe(flow.request.id, i, t, u))} />
          )}

          {!mine && flow && (
            <p className="handoff">Switch to the {step.owner} workspace to continue.</p>
          )}
          </>)}
        </section>

        <aside>
          {flow && <Facility flow={flow} />}
          <Capabilities rows={capabilities} />
        </aside>
      </main>
    </div>
  );
}

function Facility({ flow }: { flow: FlowState }) {
  const taken = (t: TrancheName) =>
    flow.subscriptions.filter((s) => s.tranche === t).reduce((sum, s) => sum + s.unitsIdr, 0);

  return (
    <div className="panel">
      <h2>{flow.request.id}</h2>
      <Row k="Receipt" v={flow.request.esrgId} />
      <Row k="Ceiling" v={rp(flow.facility.ceilingIdr)} />
      <Row k="Tenor" v={`${flow.request.maturityDays} days`} />
      {flow.note && <Row k="Note" v={`${flow.note.series} · ${flow.note.state}`} />}
      {flow.registryRef && <Row k="Security" v={flow.registryRef} />}
      {flow.mandateSignature && (
        <Row k="Mandate signature" v={`${flow.mandateSignature.slice(0, 18)}…`} />
      )}

      {flow.proof && (
        <div className="proof">
          <h3>Eligibility</h3>
          {flow.proof.checks.map((c) => (
            <div key={c.label} className="check"><span>{c.pass ? "✓" : "✗"}</span>{c.label}</div>
          ))}
          <Row k="Nullifier" v={`${flow.proof.nullifier.slice(0, 18)}…`} />
          <Row k="On-chain" v={flow.onChain?.ok ? "verified" : "not verified"} />
        </div>
      )}

      {flow.settlement && <Settlement settlement={flow.settlement} />}

      <h3>Tranches</h3>
      {flow.facility.tranches.map((t) => (
        <div key={t.name} className="tranche">
          <div className="tranche-head">
            <strong>{t.name}</strong>
            <span>{pct(t.returnBp)}</span>
          </div>
          <small>{TRANCHE_COPY[t.name].priority} · {TRANCHE_COPY[t.name].loss}</small>
          <div className="bar"><i style={{ width: `${(taken(t.name) / t.capacityIdr) * 100}%` }} /></div>
          <small>{rp(taken(t.name))} of {rp(t.capacityIdr)}</small>
        </div>
      ))}
    </div>
  );
}

/** Privy is optional: without an app id the provider is absent and the hook throws. */
function usePrivyOrNull() {
  try {
    return usePrivy();
  } catch {
    return null;
  }
}

function Quorum({ flow, busy, enabled, onApprove }: {
  flow: FlowState;
  busy: boolean;
  enabled: boolean;
  onApprove: (officerId: string) => void;
}) {
  const wallet = flow.orgWallet!;
  return (
    <div className="quorum">
      <p className="supporting">
        A cooperative is not one person. A {rp(flow.request.requestedIdr)} agreement cannot be
        signed by one officer alone — the organisation wallet requires{" "}
        <strong>{wallet.threshold} of {wallet.officers.length}</strong>.
      </p>
      {wallet.officers.map((officer) => {
        const signed = flow.mandateApprovals.includes(officer.id);
        return (
          <div key={officer.id} className="officer">
            <span><strong>{officer.name}</strong><small>{officer.role}</small></span>
            {signed
              ? <span className="badge live">signed</span>
              : <button disabled={busy || !enabled} onClick={() => onApprove(officer.id)}>Sign</button>}
          </div>
        );
      })}
      <Row k="Organisation wallet" v={wallet.address} />
    </div>
  );
}

function Settlement({ settlement }: { settlement: NonNullable<FlowState["settlement"]> }) {
  const { paid, loss } = settlement;
  return (
    <div className="proof">
      <h3>Settlement</h3>
      <Row k="Cash received" v={rp(settlement.cashReceivedIdr)} />
      <Row k="Senior return" v={rp(paid.seniorReturnIdr)} />
      <Row k="Senior principal" v={rp(paid.seniorPrincipalIdr)} />
      <Row k="Junior return" v={rp(paid.juniorReturnIdr)} />
      <Row k="Junior principal" v={rp(paid.juniorPrincipalIdr)} />
      <Row k="Residual to holder" v={rp(paid.residualIdr)} />
      {loss.map((l) => (
        <Row key={l.tranche} k={`${l.tranche} loss`} v={rp(l.lossIdr)} />
      ))}
      <Row k="Cash conserved" v={settlement.conserved ? "yes" : "no"} />
    </div>
  );
}

function Subscribe({ flow, investors, busy, enabled, onSubscribe }: {
  flow: FlowState;
  investors: Investor[];
  busy: boolean;
  enabled: boolean;
  onSubscribe: (investorId: string, tranche: TrancheName, unitsIdr: number) => void;
}) {
  const [investorId, setInvestorId] = useState("");
  const [tranche, setTranche] = useState<TrancheName>("SENIOR");
  const [amount, setAmount] = useState("");

  const remaining = (t: TrancheName) => {
    const terms = flow.facility.tranches.find((x) => x.name === t)!;
    const taken = flow.subscriptions.filter((s) => s.tranche === t).reduce((n, s) => n + s.unitsIdr, 0);
    return terms.capacityIdr - taken;
  };

  return (
    <form className="subscribe" onSubmit={(e) => {
      e.preventDefault();
      onSubscribe(investorId, tranche, Number(amount));
    }}>
      <label>
        Investor
        <select value={investorId} onChange={(e) => setInvestorId(e.target.value)} required>
          <option value="">Select</option>
          {investors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}{i.allowlisted ? "" : " — not allowlisted"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tranche
        <select value={tranche} onChange={(e) => setTranche(e.target.value as TrancheName)}>
          {flow.facility.tranches.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} · {rp(remaining(t.name))} left
            </option>
          ))}
        </select>
      </label>
      <label>
        Amount
        <input inputMode="numeric" value={amount} placeholder="120000000"
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required />
      </label>
      <button className="primary" disabled={busy || !enabled}>Subscribe</button>
    </form>
  );
}

function Capabilities({ rows }: { rows: CapabilityStatus[] }) {
  return (
    <div className="panel">
      <h3>What is real</h3>
      {rows.map((r) => (
        <div key={r.capability} className="capability">
          <span className={`badge ${r.mode}`}>{r.mode}</span>
          <div>
            <strong>{r.capability}</strong>
            <small>{r.because}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="row"><span>{k}</span><strong>{v}</strong></div>;
}
