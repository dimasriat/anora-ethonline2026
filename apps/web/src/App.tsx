import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  ApiError, api, pct, rp, setAccessToken,
  type CheckSession, type Credential,
  type CapabilityStatus, type ESrg, type FlowState, type Investor, type TrancheName,
} from "./api";
import { ROLES, STEPS, TRANCHE_COPY, type Role } from "./roles";

const WORKFLOW = ["none", "draft", "mandate_signed", "approved", "proven", "tokenized", "subscribed", "funded", "repaid"];
const ROLE_ACCESS: Record<Role, { summary: string; detail: string }> = {
  Borrower: { summary: "Finance eligible e-SRG inventory.", detail: "For cooperatives and SRG-eligible enterprises seeking working capital." },
  "Capital Provider": { summary: "Fund approved note positions.", detail: "For banks and qualified investors allocating capital to structured facilities." },
  "Facility Agent": { summary: "Review controls and settlement.", detail: "For authorized operators and reviewers administering each facility." },
};
const WORKSPACE_META: Record<Role, { title: string; summary: string; metrics: [string, string][] }> = {
  Borrower: {
    title: "Finance eligible inventory",
    summary: "Connect an official e-SRG, complete the mandate, and follow every financing control through repayment.",
    metrics: [["Eligible receipts", "2"], ["Active facilities", "1"], ["Next action", "Mandate"]],
  },
  "Capital Provider": {
    title: "Allocate into approved notes",
    summary: "Review verified facilities, compare tranche risk, and track permissioned holdings and cashflows.",
    metrics: [["Open positions", "2"], ["Committed", "Rp 270m"], ["Next cashflow", "4 Dec"]],
  },
  "Facility Agent": {
    title: "Move facilities through each control",
    summary: "Review evidence, coordinate registry actions, and gate funding, settlement, repayment, or enforcement.",
    metrics: [["Review queue", "2"], ["Registry actions", "1"], ["Settlement holds", "0"]],
  },
};

export function App() {
  const [view, setView] = useState<"landing" | "how" | "access" | "product">("landing");
  const privy = usePrivyOrNull();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>("Borrower");
  const [receipts, setReceipts] = useState<ESrg[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityStatus[]>([]);
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [facilities, setFacilities] = useState<FlowState[]>([]);
  const [allowance, setAllowance] = useState<{ held: number; limit: number; remaining: number } | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [check, setCheck] = useState<CheckSession | null>(null);
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
    api.me()
      .then((me) => { setAllowance(me.facilities); setCredential(me.eligibility); })
      .catch(() => setAllowance(null));
  };

  const startCheck = () => run(async () => {
    const opened = await api.openCheck();
    setCheck(opened);
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const latest = await api.readCheck(opened.id);
      setCheck(latest);
      if (latest.state === "verified") { setCredential(latest.credential ?? null); return flow!; }
      if (latest.state === "failed") return flow!;
    }
  });

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
  const workflowIndex = WORKFLOW.indexOf(flow?.request.status ?? "none");

  const openAccess = (nextRole?: Role) => { if (nextRole) setRole(nextRole); setView("access"); };
  if (view === "landing") return <LandingPage onEnter={openAccess} onHow={() => setView("how")} />;
  if (view === "how") return <HowItWorksPage onEnter={openAccess} onBack={() => setView("landing")} />;
  if (view === "access") return <AccessPage role={role} onRole={setRole} onEnter={() => setView("product")} onBack={() => setView("landing")} />;

  return (
    <div className="shell">
      <a className="skip-link" href="#workspace-main">Skip to workspace</a>
      <header>
        <button className="brand product-back" type="button" onClick={() => setView("landing")} aria-label="Return to Anora overview">Anora</button>
        <nav>
          <span className="role-label" title="One account can view every role. In production an account holds one.">
            Viewing as
          </span>
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

      <main id="workspace-main">
        <section className="stage">
          <section className="workspace-summary" aria-label={`${role} workspace summary`}>
            <div>
              <p className="eyebrow">{role} workspace</p>
              <h1>{WORKSPACE_META[role].title}</h1>
              <p>{WORKSPACE_META[role].summary}</p>
            </div>
            <dl>
              {WORKSPACE_META[role].metrics.map(([label, value]) => (
                <div key={label}>
                  <dt>
                    {label}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M4 19V9m8 10V5m8 14v-7M2 19h20" />
                    </svg>
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="workspace-context" aria-label="Workspace environment">
            <span><i aria-hidden="true" /> Demo environment</span>
            <span>Registry controls simulated</span>
            <span>Hedera testnet settlement</span>
          </div>
          <div className="workflow-heading">
            <div><span>Facility lifecycle</span><strong>{step.title}</strong></div>
            <small>Stage {workflowIndex + 1} of {WORKFLOW.length}</small>
          </div>
          <ol className="workflow-progress" aria-label="Facility progress">
            {WORKFLOW.map((status, index) => (
              <li key={status} className={index < workflowIndex ? "complete" : index === workflowIndex ? "current" : ""} aria-current={index === workflowIndex ? "step" : undefined}>
                <span>{index < workflowIndex ? "✓" : index + 1}</span>
                <small>{STEPS[status]!.title}</small>
              </li>
            ))}
          </ol>
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

          {(!privy || privy.authenticated) && !credential && (
            <Eligibility check={check} busy={busy} onStart={startCheck} />
          )}

          {(!privy || privy.authenticated) && credential && (<>
          <p className="eyebrow">{mine ? "Your turn" : `With the ${step.owner}`}</p>
          <h1>{step.title}</h1>

          {refusal && (
            <div className="refusal" role="alert">
              <code>{refusal.code}</code>
              <span>{refusal.message}</span>
            </div>
          )}

          {!flow && facilities.length > 0 && (
            <Facilities
              facilities={facilities}
              onOpen={(f) => { setRefusal(null); setFlow(f); }}
              onStartNew={() => setFlow(null)}
            />
          )}

          {!flow && (
            <>
            <h3 className="pick-heading">
              {facilities.length > 0 ? "Open another facility" : "Choose a receipt to start"}
            </h3>
            <ul className="receipts">
              {receipts.map((r) => (
                <li key={r.id}>
                  <div>
                    <span className="receipt-title">
                      <strong>{r.id}</strong>
                      <span className={`receipt-status ${r.encumbrance === "none" ? "clear" : "held"}`}>
                        {r.encumbrance === "none" ? "Available" : "Encumbered"}
                      </span>
                    </span>
                    <small>{r.commodity} · {r.quantityKg.toLocaleString("id-ID")} kg · {rp(r.valueIdr)}</small>
                  </div>
                  <button
                    disabled={busy || role !== "Borrower" || allowance?.remaining === 0}
                    onClick={() => run(() => api.create(r.id))}
                  >
                    Choose
                  </button>
                </li>
              ))}
            </ul>
            {allowance && (
              <p className="allowance">
                {allowance.remaining > 0
                  ? `${allowance.remaining} of ${allowance.limit} facilities left on this account.`
                  : `You have used all ${allowance.limit} facilities on this account. Each one deploys a contract on Hedera testnet, so the demo caps them.`}
              </p>
            )}
            </>
          )}

          {flow && (
            <button className="back-to-list" onClick={() => { setFlow(null); setRefusal(null); }}>
              ← All facilities
            </button>
          )}

          {flow && step.action && (
            <button className="primary" disabled={busy || !mine}
              onClick={() => run(() => api.step(flow.request.id, step.action!.step))}>
              <span aria-live="polite">{busy ? "Working…" : step.action.label}</span>
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

function PublicHeader({ onEnter, onHow }: { onEnter: (role?: Role) => void; onHow: () => void }) {
  return (
    <header className="public-header">
      <strong className="public-wordmark">Anora</strong>
      <nav className="public-nav" aria-label="Public navigation">
        <button type="button" onClick={onHow}>How it works</button>
        <button type="button" onClick={() => onEnter("Borrower")}>For borrowers</button>
        <button type="button" onClick={() => onEnter("Capital Provider")}>For capital providers</button>
        <button type="button" onClick={() => onEnter("Facility Agent")}>For facility agents</button>
      </nav>
      <button className="public-sign-in" type="button" onClick={() => onEnter()}>Sign in</button>
    </header>
  );
}

function LandingPage({ onEnter, onHow }: { onEnter: (role?: Role) => void; onHow: () => void }) {
  return (
    <div className="public-page">
      <PublicHeader onEnter={onEnter} onHow={onHow} />
      <main className="landing-main">
        <section className="hero-grid" aria-labelledby="landing-title">
          <div className="hero-copy">
            <h1 id="landing-title">Turn verified inventory into investable credit.</h1>
            <p>Anora connects eligible e-SRG holders with capital providers through structured, permissioned notes—without moving the warehouse receipt on-chain.</p>
            <div className="hero-actions">
              <button className="public-primary" type="button" onClick={() => onEnter()}>Open Anora</button>
              <button className="public-secondary" type="button" onClick={onHow}>How it works</button>
            </div>
          </div>
          <figure className="hero-visual"><img src="/anora-tea-warehouse.png" alt="Sealed tea inventory stored inside a licensed warehouse" /><figcaption>Verified inventory. Structured access to capital.</figcaption></figure>
        </section>
        <section className="trust-strip" aria-label="Anora product boundaries">
          <article><span>01</span><div><h2>Registry-authoritative collateral</h2><p>The official e-SRG remains in the Bappebti registry; Anora records a linked financing claim.</p></div></article>
          <article><span>02</span><div><h2>Permissioned financing notes</h2><p>Only verified participants can subscribe to or hold Senior and Junior positions.</p></div></article>
          <article><span>03</span><div><h2>Hedera settlement</h2><p>Issuance, eligible transfers, and facility events are recorded for auditability.</p></div></article>
        </section>
      </main>
    </div>
  );
}

function HowItWorksPage({ onEnter, onBack }: { onEnter: (role?: Role) => void; onBack: () => void }) {
  const steps = [
    ["Verify the official e-SRG", "The borrower connects an eligible receipt. The facility agent checks the registry record, warehouse, ownership, expiry, insurance, and existing security rights.", "Borrower + Facility Agent"],
    ["Complete evidence and signatures", "The borrower reviews, fills, and signs the financing mandate and registry consent through DocuSeal. Production access also requires KYB and organizational authorization.", "Borrower"],
    ["Approve and structure the facility", "The facility agent approves one set of terms. Anora links the facility to permissioned Senior and Junior financing-note positions; the tea title stays off-chain.", "Facility Agent"],
    ["Subscribe and settle", "Capital providers choose a tranche position. Registry confirmation gates note activation and disbursement, so funding cannot precede collateral control.", "Capital Provider + Facility Agent"],
    ["Repay, release, or enforce", "Repayment follows the agreed waterfall before the security right is released. On default, the authorized party follows the signed enforcement process.", "Facility Agent"],
  ];
  return (
    <div className="public-page">
      <PublicHeader onEnter={onEnter} onHow={() => {}} />
      <main className="how-main">
        <header className="how-intro">
          <span>How Anora works</span>
          <h1>From a verified receipt to accountable financing.</h1>
          <p>The registry remains the source of truth. Anora coordinates the evidence, note structure, permissions, and settlement around it.</p>
        </header>
        <section className="process-ledger" aria-label="Financing process">
          {steps.map(([title, copy, owner], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h2>{title}</h2><p>{copy}</p></div>
              <aside><small>Primary owner</small><strong>{owner}</strong></aside>
            </article>
          ))}
        </section>
        <section className="boundary-note">
          <div><span className="access-kicker">Product boundary</span><h2>Anora tokenizes the financing claim—not the tea title.</h2></div>
          <p>The e-SRG and its registered security control remain authoritative in the regulated registry. Note holders receive contractual economic rights subject to eligibility and transfer restrictions.</p>
        </section>
        <div className="hero-actions page-actions">
          <button className="public-primary" type="button" onClick={() => onEnter()}>Open Anora</button>
          <button className="public-secondary" type="button" onClick={onBack}>Back to overview</button>
        </div>
      </main>
    </div>
  );
}

function AccessPage({ role, onRole, onEnter, onBack }: {
  role: Role;
  onRole: (role: Role) => void;
  onEnter: () => void;
  onBack: () => void;
}) {
  return (
    <div className="public-page access-page">
      <header className="public-header compact-header"><strong className="public-wordmark">Anora</strong><button className="public-sign-in" type="button" onClick={onBack}>Back to overview</button></header>
      <main className="access-main">
        <header className="access-intro"><span className="access-kicker">Secure access</span><h1>Choose how you use Anora.</h1><p>Privy verifies your email or wallet identity. Your workspace role determines what you can review and act on.</p><img className="access-figure" src="/anora-tea-warehouse.jpg" width="900" height="618" alt="Made tea stored in a licensed warehouse." /></header>
        <form className="access-panel" onSubmit={(event) => { event.preventDefault(); onEnter(); }}>
          <fieldset><legend>Continue as</legend>
            {ROLES.map((item) => <label className="role-option" key={item}><input type="radio" name="role" checked={role === item} onChange={() => onRole(item)} /><span><strong>{item}</strong><span>{ROLE_ACCESS[item].summary}</span><small>{ROLE_ACCESS[item].detail}</small></span></label>)}
          </fieldset>
          <button className="public-primary access-submit" type="submit">Continue with Privy <small>Demo</small></button>
          <p className="access-note"><strong>Identity is not institutional authorization.</strong> Production access requires KYB plus a director mandate, power of attorney, or cooperative resolution.</p>
        </form>
      </main>
    </div>
  );
}

function Facilities({ facilities, onOpen }: {
  facilities: FlowState[];
  onOpen: (f: FlowState) => void;
  onStartNew: () => void;
}) {
  return (
    <div className="facilities">
      <h3>Your facilities</h3>
      {facilities.map((f) => (
        <button key={f.request.id} className="facility-row" onClick={() => onOpen(f)}>
          <span>
            <strong>{f.request.id}</strong>
            <small>{f.request.esrgId} · {rp(f.request.requestedIdr)}</small>
          </span>
          <span className="facility-row-meta">
            <span className="stage-chip">{STEPS[f.request.status]?.title ?? f.request.status}</span>
            <small>Open →</small>
          </span>
        </button>
      ))}
      <p className="supporting">Or open a new one from a receipt below.</p>
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

function Eligibility({ check, busy, onStart }: {
  check: CheckSession | null;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <div className="gate">
      <h1>Verify you are a live person</h1>
      <p className="supporting">
        Anora gates every action that moves value behind a liveness check. This proves a
        real person is acting — it is <strong>not</strong> a proof of unique identity, and
        it does not tell us who you are.
      </p>

      {!check && (
        <button className="primary" disabled={busy} onClick={onStart}>
          Start the check
        </button>
      )}

      {check && (
        <>
          <img
            className="qr"
            alt="Scan with the World ID Sandbox app"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(check.connectorURI)}`}
          />
          <p className="supporting">
            Scan with the World ID Sandbox app, or{" "}
            <a href={check.connectorURI}>open it on this phone</a>. The check continues on
            the server, so you can leave this page and come back.
          </p>
          {check.state === "failed" && (
            <div className="refusal" role="alert">
              <code>check_failed</code>
              <span>{check.because ?? "The check did not complete"}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
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
      <header className="capability-heading">
        <div><p className="eyebrow">Environment</p><h3>What is real</h3></div>
        <span>{rows.length} capabilities</span>
      </header>
      {rows.map((r) => (
        <div key={r.capability} className="capability">
          <span className={`badge ${r.mode}`}><i aria-hidden="true" />{r.mode}</span>
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
