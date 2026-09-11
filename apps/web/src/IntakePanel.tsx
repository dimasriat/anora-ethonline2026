import type { ESrg, IntakeAction, IntakeState } from "./api";

export default function IntakePanel({ state, receipts, role, proposeIds, onAction, onProposeIds, onSelect }: {
  state: IntakeState; receipts: ESrg[]; role: string; onAction: (action: IntakeAction) => void;
  /** The workspace owns the draft rows, so opening a receipt elsewhere fills one. */
  proposeIds: string[]; onProposeIds: (update: (rows: string[]) => string[]) => void;
  onSelect: (receipt: ESrg) => void;
}) {
  const borrower = role === "Borrower";
  const proposable = receipts.filter(receipt => !state.receipts[receipt.id] && receipt.encumbrance === "none");
  /* A receipt chosen before it was proposed can be accepted by the time this
     renders; falling back to empty keeps each select and its options agreed. */
  const chosen = proposeIds.map(id => proposable.some(receipt => receipt.id === id) ? id : "");
  const setRow = (index: number, id: string) => onProposeIds(rows => rows.map((row, i) => i === index ? id : row));
  /* Dropping the last row would take the form away, so it empties instead. */
  const dropRow = (index: number) => onProposeIds(rows => rows.length > 1 ? rows.filter((_, i) => i !== index) : [""]);
  const proposed = receipts.filter(receipt => state.receipts[receipt.id]);
  const latest = proposed.at(-1);
  const eligibility = state.borrower.status === "confirmed" ? "Confirmed" : state.borrower.status === "approved" ? "Confirmation pending" : state.borrower.status === "submitted" ? "Review pending" : "Registration pending";
  return <section className="analytics-panel intake-panel" aria-label="Receipt intake">
    <header><div><span className="section-kicker">Before financing</span><h2>Receipt proposals and acceptance</h2></div></header>
    <div className="intake-body">
      {!borrower && <div className="status-strip eligibility-status"><span>Borrower eligibility</span><strong>{eligibility}</strong></div>}
      {!borrower && state.borrower.status !== "draft" && <section className="borrower-review" aria-label="Borrower application review"><h3>Borrower application</h3><dl>{[["Entity", state.borrower.profile.entityName], ["Entity type", state.borrower.profile.entityType], ["Registration / NIB", state.borrower.profile.registrationRef], ["Tax reference", state.borrower.profile.taxRef], ["Representative", state.borrower.profile.representativeRole], ["Authority reference", state.borrower.profile.authorityRef], ["Intended goods", `${latest?.commodity ?? state.borrower.profile.commodity} · ${latest?.quantityKg ?? state.borrower.profile.quantityKg} kg`], ["Warehouse", latest?.warehouse ?? state.borrower.profile.warehouse]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{state.borrower.status === "submitted" && <button type="button" onClick={() => onAction({ kind: "approve-borrower" })}>Approve borrower</button>}{state.borrower.status === "approved" && <p className="access-note">Approved. Waiting for the borrower to confirm their eligibility.</p>}</section>}
      {borrower && state.borrower.status === "confirmed" && chosen.map((selected, index) => <form className="intake-proposal" key={index} onSubmit={event => { event.preventDefault(); onAction({ kind: "propose", receiptId: selected }); dropRow(index); }}>
        <label htmlFor={`intake-receipt-${index}`}>{index ? `Propose another receipt` : "Propose a receipt"}</label>
        {!index && <p>Choose an e-SRG for receipt review. Compliance must accept it before you can select it for financing. Add a row for each commodity you want reviewed.</p>}
        <div>
          {/* A receipt already drafted in another row is not offered twice. */}
          <select id={`intake-receipt-${index}`} value={selected} onChange={event => setRow(index, event.target.value)} required>
            <option value="">Select a receipt</option>
            {proposable.filter(receipt => receipt.id === selected || !chosen.includes(receipt.id)).map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.id} · {receipt.commodity}</option>)}
          </select>
          <button type="submit" disabled={!selected}>Propose receipt</button>
          {chosen.length > 1 && <button type="button" className="secondary-button" onClick={() => dropRow(index)}>Remove</button>}
        </div>
      </form>)}
      {!proposed.length && !borrower && <p className="supporting-copy">No receipt proposals yet. The borrower can propose receipts after confirming their registration.</p>}
      {proposed.map(receipt => <article className="intake-receipt" key={receipt.id}>
        <div><strong>{receipt.id} · {receipt.commodity}</strong><p>{receipt.warehouse} · {receipt.holder}</p></div>
        <span className={`state-pill ${state.receipts[receipt.id] === "accepted" ? "teal" : "amber"}`}>{state.receipts[receipt.id] === "accepted" ? "Accepted for financing application" : "Awaiting receipt review"}</span>
        {state.receipts[receipt.id] === "proposed" && !borrower && <button type="button" onClick={() => onAction({ kind: "accept", receiptId: receipt.id })}>Accept receipt</button>}
        {state.receipts[receipt.id] === "accepted" && borrower && <button type="button" onClick={() => onSelect(receipt)}>Select for financing</button>}
      </article>)}
    </div>
  </section>;
}
