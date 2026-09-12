import { useEffect, useRef, useState } from "react";
import { rp, type ESrg, type Flow, type Band } from "./api";
import { ErrorBanner } from "./ui";

const money = (n: number) => `Rp ${new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
const dates = (s: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(s));
export const facilityStatus: Record<string, string> = { draft: "Awaiting mandate", mandate_signed: "Under review", approved: "Awaiting eligibility checks", proven: "Eligible for financing", tokenized: "Subscribing", subscribed: "Ready to fund", funded: "Funded", repaid: "Repaid" };
const events: Record<string, string> = { draft: "Draft record updated", mandate_signed: "Mandate record updated", approved: "Approval record updated", proven: "Verification record updated", tokenized: "Note record updated", subscribed: "Subscription record updated", funded: "Funded facility updated", repaid: "Repayment record updated" };
const metricIcons: Record<string, string> = {
  "Accepted e-SRGs": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 15l3 3 5-6",
  "Active facilities": "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h1m4 0h1m-6 3h1m4 0h1",
  "Next repayment": "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm7 9v6m-3-3 3 3 3-3",
  "Open opportunities": "M3 17l6-6 4 4 8-10m-6 0h6v6",
  "Committed capital": "M20 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v14H5a2 2 0 0 1-2-2V5m17 7h-5v5h5m-3-2.5h.01",
  "Next cashflow": "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 12h6m-3-3 3 3-3 3",
  "Review queue": "M8 4H5v18h14V4h-3M8 2h8v4H8V2Zm0 9h8m-8 4h8m-8 4h4",
  "Registry actions": "M3 21h18M3 7l9-5 9 5H3Zm3 3v7m6-7v7m6-7v7M3 17h18",
  "Settlement holds": "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v12H5V10Zm7 5v3",
  "Collateral coverage": "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6",
  "Collateral value": "M3 21h18M5 21V9l7-5 7 5v12M9 21v-5h6v5M9 12h6",
  "Financing headroom": "M12 20V4m0 0-5 5m5-5 5 5M4 20h16",
  "Accepted for financing": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 15l3 3 5-6",
};

/** Contract policy when we can read it; the request's own cap otherwise. */
const DEFAULT_MAX_LTV_BP = 7_000;

const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** Last instant of the month `offset` months after `from`. */
const monthEnd = (from: Date, offset: number) =>
  new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset + 1, 0));

/**
 * What the borrower could still draw at each month end.
 *
 * A receipt stops being collateral on its expiry date, so capacity is a step
 * function that only falls. Nothing here is forecast: every point is the
 * receipts already on file, filtered by a date.
 */
function capacityRunway(receipts: ESrg[], months: number, maxLtvBp: number) {
  const today = new Date();
  return Array.from({ length: months }, (_, i) => {
    const at = monthEnd(today, i);
    const eligible = receipts
      .filter(r => r.encumbrance === "none" && Date.parse(r.expiresAt) >= at.getTime())
      .reduce((n, r) => n + r.valueIdr, 0);
    return { at, capacity: Math.floor((eligible * maxLtvBp) / 10_000) };
  });
}

/**
 * Round a ceiling up so the four axis steps land on readable numbers without
 * leaving the plot half empty — a 1/2/5 ladder alone sends 6.7bn to 10bn.
 */
function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find(m => magnitude * m >= value) ?? 10;
  return magnitude * step;
}

/** One row per commodity, split by whether it is still free to finance. */
function byCommodity(receipts: ESrg[]) {
  const rows = new Map<string, { commodity: string; total: number; pledged: number; count: number }>();
  for (const r of receipts) {
    const row = rows.get(r.commodity) ?? { commodity: r.commodity, total: 0, pledged: 0, count: 0 };
    row.total += r.valueIdr;
    row.count += 1;
    if (r.encumbrance !== "none") row.pledged += r.valueIdr;
    rows.set(r.commodity, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

const COMMODITY_ROWS = 14;
/** Rows per page in the asset register, so the card stays a card. */
const REGISTER_PAGE = 5;
const INVENTORY_ROWS = 5;

const portfolioHistory = (value: number, growthPct: number) => {
  const start = growthPct ? value / (1 + growthPct / 100) : 0;
  return [0, .07, .13, .11, .24, .34, .42, .54, .66, .77, .9, 1].map((progress, i) => ({
    at: monthEnd(new Date(), i - 11), capacity: Math.round(start + (value - start) * progress),
  }));
};

/**
 * Borrowing capacity as each receipt rolls off.
 *
 * One series, so no legend box — the panel heading names it. Values are also
 * in the asset register below, which is this chart's table view.
 *
 * The month bands are real buttons layered over the plot rather than <rect>s
 * inside it, so keyboard focus, :focus-visible and the accessible name come
 * from the platform. The strip is widened by half a band each side so a
 * button's centre lands on its plotted point rather than half a step off it.
 */
function CapacityChart({ points, format, subject = "capacity" }: { points: { at: Date; capacity: number }[]; format: (n: number) => string; subject?: string }) {
  /* The marker stays where it was last put. Snapping it home on mouse-leave
     threw away the month the reader had just chosen to look at. */
  const [active, setActive] = useState(0);
  const W = 760, H = 196, padL = 62, padR = 18, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const top = niceCeiling(Math.max(...points.map(p => p.capacity), 1));
  const band = plotW / Math.max(1, points.length - 1);
  const x = (i: number) => padL + i * band;
  const y = (v: number) => padT + (1 - v / top) * plotH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.capacity).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  const ticks = [0, 1, 2, 3, 4].map(i => (top * i) / 4);
  const marker = Math.min(active, points.length - 1);
  const first = points[0]!;
  const current = points[marker]!;
  const last = points.at(-1)!;
  const every = points.length > 8 ? 2 : 1;
  const strip = { left: `${((padL - band / 2) / W) * 100}%`, width: `${((plotW + band) / W) * 100}%`, top: `${(padT / H) * 100}%`, height: `${(plotH / H) * 100}%` };
  return (
    <div className="chart-frame">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="capacity-chart" role="img"
          aria-label={`${subject} from ${monthYear.format(first.at)} to ${monthYear.format(last.at)}: ${format(first.capacity)} to ${format(last.capacity)}.`}>
          {ticks.map(t => <g key={t}>
            <line className="chart-grid" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
            <text className="chart-tick" x={padL - 10} y={y(t) + 3.5} textAnchor="end">{format(t)}</text>
          </g>)}
          <path className="chart-area" d={area} />
          <path className="chart-line" d={line} />
          {points.map((p, i) => i % every === 0 && (
            <text key={p.at.toISOString()} className="chart-tick" x={x(i)} y={H - 9} textAnchor="middle">{monthLabel.format(p.at)}</text>
          ))}
          <line className="chart-crosshair" x1={x(marker)} x2={x(marker)} y1={padT} y2={H - padB} />
          <circle className="chart-point" cx={x(marker)} cy={y(current.capacity)} r="4" />
        </svg>
        <div className="chart-bands" style={strip}>
          {points.map((p, i) => (
            /* No aria-pressed: a band is not a toggle, and the global pressed
               style would draw a box around the plot. The moving marker and the
               live readout are what report which month is being read. */
            <button type="button" key={p.at.toISOString()}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}>
              <span className="sr-only">{monthYear.format(p.at)}: {format(p.capacity)} of capacity</span>
            </button>
          ))}
        </div>
      </div>
      <p className="chart-readout" aria-live="polite">
        <strong>{format(current.capacity)}</strong>
        <span>{subject} at {monthYear.format(current.at)}</span>
      </p>
    </div>
  );
}

export default function Dashboard({ receipts, flow, bands, role, section, loading, error, summary, priorities, portfolio, maxLtvBp, acceptedIds = [], onOpen, onSection }: {
  receipts: ESrg[]; flow: Flow | null; bands: Band[]; role: string; section: string;
  loading: boolean; error: string | null; onOpen: (receipt?: ESrg) => void; onSection: (section: string) => void;
  summary: { label: string; value: string; note: string }[];
  priorities?: { title: string; meta: string; status: string }[];
  portfolio?: { valueIdr: number; growthPct: number; restricted?: boolean };
  /** Policy ceiling read from the contract, so capacity is not a guessed number. */
  maxLtvBp?: number;
  /** Receipts that cleared intake review. Intake state lives with the workspace. */
  acceptedIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("value");
  const [selected, setSelected] = useState<ESrg | null>(null);
  const [horizon, setHorizon] = useState(12);
  const [page, setPage] = useState(0);
  const [inventoryPage, setInventoryPage] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (selected) dialog.current?.showModal(); }, [selected]);
  useEffect(() => { setPage(0); }, [query, filter, sort]);
  const total = receipts.reduce((n, r) => n + r.valueIdr, 0);
  const inventoryPageCount = Math.max(1, Math.ceil(receipts.length / INVENTORY_ROWS));
  const inventoryCurrent = Math.min(inventoryPage, inventoryPageCount - 1);
  const inventoryRows = receipts.slice(inventoryCurrent * INVENTORY_ROWS, inventoryCurrent * INVENTORY_ROWS + INVENTORY_ROWS);
  const currentReceipt = receipts.find(r => r.id === flow?.request.esrgId);
  const principal = flow?.request.requestedIdr ?? 0;
  const subscribed = (flow?.subscriptions ?? []).reduce((n, s) => n + s.unitsIdr, 0);
  const issuedCapacity = bands.reduce((n, b) => n + b.capacityIdr, 0);
  const financingBasis = issuedCapacity || principal;
  const coverage = financingBasis && currentReceipt ? `${(currentReceipt.valueIdr / financingBasis).toFixed(2)}×` : "—";
  const ltv = financingBasis && currentReceipt ? financingBasis / currentReceipt.valueIdr * 100 : 0;
  const shown = receipts.filter(r => `${r.id} ${r.commodity} ${r.warehouse} ${r.holder}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || (filter === "clear" ? r.encumbrance === "none" : r.id === flow?.request.esrgId))).sort((a, b) => sort === "value" ? b.valueIdr - a.valueIdr : a.expiresAt.localeCompare(b.expiresAt));
  const pageCount = Math.max(1, Math.ceil(shown.length / REGISTER_PAGE));
  /* Clamped rather than trusted: a filter can shrink the list before the reset
     effect runs, and slicing past the end would blank the table for a frame. */
  const current = Math.min(page, pageCount - 1);
  const paged = shown.slice(current * REGISTER_PAGE, current * REGISTER_PAGE + REGISTER_PAGE);
  const overview = section === "Overview";
  const activitySection = ["Documents", "Repayments", "Cashflows", "Registry controls", "Funding & settlement", "Audit trail"].includes(section);
  const borrower = role === "Borrower";
  const capitalProvider = role === "Capital Provider";
  const compliance = role === "Compliance";
  const capitalHistory = portfolioHistory(portfolio?.valueIdr ?? 327_000_000, portfolio?.growthPct ?? 50);
  const policyLtvBp = maxLtvBp ?? flow?.request.maxLtvBp ?? DEFAULT_MAX_LTV_BP;
  const unpledged = receipts.filter(r => r.encumbrance === "none").reduce((n, r) => n + r.valueIdr, 0);
  const headroom = Math.floor((unpledged * policyLtvBp) / 10_000);
  const commodities = byCommodity(receipts);
  const pledgedIdr = total - unpledged;
  const pledgedCount = receipts.length - receipts.filter(r => r.encumbrance === "none").length;
  /* Capacity-weighted, so it answers "what does this facility cost" rather than
     leaving the reader to average two tranche rates that carry different weight. */
  const blendedBp = issuedCapacity ? bands.reduce((n, b) => n + b.capacityIdr * b.returnBp, 0) / issuedCapacity : 0;
  const runway = capacityRunway(receipts, horizon, policyLtvBp);
  const controlChecks = [
    { label: "Eligibility proof", detail: "Policy result recorded", clear: !!flow && ["proven", "tokenized", "subscribed", "funded", "repaid"].includes(flow.step) },
    { label: "Registry control", detail: flow?.registryRef ?? "Confirmation required before release", clear: !!flow?.registryRef },
    { label: "Settlement release", detail: "Enabled only after funding and registry control", clear: !!flow && ["funded", "repaid"].includes(flow.step) },
  ];
  const clearControls = controlChecks.filter(check => check.clear).length;
  const coverageTile = { label: "Collateral coverage", value: coverage, note: principal ? `${ltv.toFixed(1)}% ${issuedCapacity ? "pool LTV" : "requested LTV"}` : "Available after a financing request", kind: "Current facility" };
  /* The borrower's figures are read off the receipts on screen. The other two
     workspaces still carry static copy from the page until their own panels land. */
  const metrics = borrower ? [
    { label: "Collateral value", value: money(total), note: `${receipts.length} receipts · ${new Set(receipts.map(r => r.warehouse)).size} SRG warehouses`, kind: "Warehouse receipts" },
    { label: "Financing headroom", value: money(headroom), note: `Unpledged collateral at ${policyLtvBp / 100}% policy LTV`, kind: "Available to request" },
    { label: "Accepted for financing", value: String(acceptedIds.length), note: "Cleared intake review · checks still follow", kind: "Receipt intake" },
    coverageTile,
  ] : [...summary.map(m => ({ ...m, kind: "Portfolio" })), coverageTile];
  return <div className="analytics-content">
    {error && <ErrorBanner>{error}</ErrorBanner>}
    {loading ? <p className="empty-state" role="status">Loading collateral records…</p> : <>
      {overview && <>
        <section className="analytics-metrics" aria-label="Portfolio summary">{metrics.map(m => <article key={m.label}><div><span>{m.label}</span><svg className="metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={metricIcons[m.label]} /></svg></div><strong>{m.value}</strong><p>{m.note}</p><small>{m.kind}</small></article>)}</section>
      </>}
      <div className={overview ? "overview-layout" : "section-layout"}><div className="overview-core">
        {overview && borrower && <section className="analytics-panel runway-panel">
          <header>
            <div><span className="section-kicker">Collateral runway</span><h2>Borrowing capacity</h2></div>
            <div className="range-tabs" role="group" aria-label="Capacity horizon">
              {[[6, "6M"], [12, "12M"], [24, "24M"]].map(([value, label]) => (
                <button type="button" key={label as string} aria-pressed={horizon === value} onClick={() => setHorizon(value as number)}>{label}</button>
              ))}
            </div>
          </header>
          <div className="composition-total"><strong>{money(headroom)}</strong><span>Available to request now · {policyLtvBp / 100}% policy LTV on unpledged receipts</span></div>
          <CapacityChart points={runway} format={money} />
          <footer><span>Capacity falls as each receipt reaches expiry. Nothing here is forecast.</span><span>Receipt values, not market prices</span></footer>
        </section>}
        {overview && capitalProvider && <section className="analytics-panel runway-panel portfolio-panel">
          <header><div><span className="section-kicker">Portfolio performance</span><h2>Invested capital growth</h2></div><span className="state-pill neutral">{portfolio?.restricted ? "Restricted" : "Active"}</span></header>
          <div className="composition-total"><strong>{money(capitalHistory.at(-1)!.capacity)}</strong><span>{portfolio?.restricted ? "No portfolio until allowlisting is complete" : `Portfolio value · +${portfolio?.growthPct ?? 50}% over 12 months`}</span></div>
          <CapacityChart points={capitalHistory} format={money} subject="portfolio value" />
          <footer><span>Current positions and target returns.</span><span>Not investment performance</span></footer>
        </section>}
        {overview && <div className="analytics-grid">
          {borrower ? <section className="analytics-panel collateral-panel">
            <header><div><span className="section-kicker">Collateral intelligence</span><h2>By commodity</h2></div><span className="unit-label">Top {Math.min(COMMODITY_ROWS, commodities.length)} of {commodities.length}</span></header>
            <div className="commodity-legend"><span><i className="legend-swatch available" />Free to finance</span><span><i className="legend-swatch pledged" />Already pledged</span></div>
            <div className="commodity-bars">
              {commodities.slice(0, COMMODITY_ROWS).map(row => {
                const widest = commodities[0]!.total || 1;
                const split = row.pledged > 0 && row.pledged < row.total;
                const width = (value: number) => `calc(${((value / widest) * 100).toFixed(2)}%${split ? " - 1px" : ""})`;
                return <button type="button" key={row.commodity} onClick={() => setQuery(row.commodity)} title={`Filter the register to ${row.commodity}`}>
                  <span className="bar-name">{row.commodity}</span>
                  <span className="bar-track">
                    {row.total > row.pledged && <span className="bar-fill available" style={{ width: width(row.total - row.pledged) }} />}
                    {row.pledged > 0 && <span className="bar-fill pledged" style={{ width: width(row.pledged) }} />}
                  </span>
                  <span className="bar-value">{money(row.total)}</span>
                </button>;
              })}
            </div>
            <div className="portfolio-split">
              <div className="split-bar" role="img" aria-label={`Free to finance ${money(unpledged)} of ${money(total)}`}>
                <span className="bar-fill available" style={{ width: `calc(${total ? (unpledged / total) * 100 : 100}% - 1px)` }} />
                {pledgedIdr > 0 && <span className="bar-fill pledged" style={{ width: `calc(${(pledgedIdr / total) * 100}% - 1px)` }} />}
              </div>
              <div><span>Free to finance</span><strong>{money(unpledged)}</strong><small>{receipts.length - pledgedCount} receipts</small></div>
              <div><span>Already pledged</span><strong>{money(pledgedIdr)}</strong><small>{pledgedCount} receipts</small></div>
            </div>
            <footer><span>{commodities.length > COMMODITY_ROWS ? `${commodities.length - COMMODITY_ROWS} further commodities · ${money(commodities.slice(COMMODITY_ROWS).reduce((n, r) => n + r.total, 0))}` : "Every commodity shown"}</span><span>Select a row to filter the register</span></footer>
          </section> : compliance ? <section className="analytics-panel collateral-panel control-panel">
            <header><div><span className="section-kicker">Capital oversight</span><h2>Funding control readiness</h2></div><span className={`state-pill ${clearControls === controlChecks.length ? "teal" : "amber"}`}>{clearControls === controlChecks.length ? "Ready" : "Action required"}</span></header>
            <div className="control-total"><strong>{clearControls}/{controlChecks.length}</strong><span>controls cleared for capital release</span></div>
            <progress max={controlChecks.length} value={clearControls} aria-label={`${clearControls} of ${controlChecks.length} funding controls cleared`} />
            <div className="control-list">{controlChecks.map(check => <div key={check.label}><span className={`control-mark ${check.clear ? "clear" : "pending"}`} aria-hidden="true" /><span><strong>{check.label}</strong><small>{check.detail}</small></span><span className={`state-pill ${check.clear ? "teal" : "amber"}`}>{check.clear ? "Cleared" : "Pending"}</span></div>)}</div>
            <footer><span>{flow?.request.esrgId ?? "No active facility"}</span><span>Release stays blocked until every control clears</span></footer>
          </section> : <section className="analytics-panel collateral-panel">
            <header><div><span className="section-kicker">Collateral intelligence</span><h2>Inventory composition</h2></div><span className="unit-label">IDR · recorded value</span></header>
            <div className="composition-total"><strong>{money(total)}</strong><span>Total collateral in the workspace</span></div>
            <div className="composition-bar" role="img" aria-label={receipts.map(r => `${r.commodity}: ${rp(r.valueIdr)}`).join("; ")}>{receipts.map((r, i) => <span key={r.id} className={`composition-segment segment-${i % 3}`} style={{ flexGrow: r.valueIdr }} title={`${r.commodity}: ${rp(r.valueIdr)}`} />)}</div>
            <div className="composition-legend">{inventoryRows.map((r, i) => <button type="button" key={r.id} onClick={() => setSelected(r)}><span className={`legend-dot segment-${(inventoryCurrent * INVENTORY_ROWS + i) % 3}`} /><span><strong>{r.commodity}</strong><small>{role !== "Capital Provider" && <>{r.quantityKg.toLocaleString("en-GB")} kg · </>}{r.id}</small></span><span><strong>{money(r.valueIdr)}</strong><small>{total ? (r.valueIdr / total * 100).toFixed(1) : 0}% of collateral</small></span></button>)}</div>
            <footer><span>Showing {inventoryCurrent * INVENTORY_ROWS + 1}–{inventoryCurrent * INVENTORY_ROWS + inventoryRows.length} of {receipts.length}</span><div className="table-pager"><span>Page {inventoryCurrent + 1} of {inventoryPageCount}</span><button type="button" aria-label="Previous inventory page" disabled={inventoryCurrent === 0} onClick={() => setInventoryPage(inventoryCurrent - 1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button><button type="button" aria-label="Next inventory page" disabled={inventoryCurrent >= inventoryPageCount - 1} onClick={() => setInventoryPage(inventoryCurrent + 1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button></div></footer>
          </section>}
          <section className="analytics-panel financing-panel">
            <header><div><span className="section-kicker">Financing monitor</span><h2>Current facility</h2></div><span className={`state-pill ${flow ? "teal" : "neutral"}`}>{flow ? facilityStatus[flow.step] ?? flow.step : "Not started"}</span></header>
            <div className="facility-number"><strong>{flow ? money(principal) : "Ready when you are"}</strong><span>{flow ? `${flow.request.esrgId} · facility ceiling · ${flow.request.maturityDays}-day term` : "Start with an unencumbered warehouse receipt."}</span></div>
            <div className="monitor-row"><span>Capital subscribed</span><strong>{money(subscribed)}<small> / {money(financingBasis)}</small></strong></div>
            <progress value={subscribed} max={financingBasis || 1} aria-label="Capital subscribed" />
            {issuedCapacity > 0 && <p className="capacity-note">{money(Math.max(0, principal - issuedCapacity))} unissued capacity · {money(issuedCapacity)} tranche capacity</p>}
            <div className="facility-facts"><div><span>Loan-to-value</span><strong>{principal ? `${ltv.toFixed(1)}%` : "—"}</strong></div><div><span>Next action owner</span><strong>{flow ? ({ draft: "Borrower", tokenized: "Capital provider", funded: "Borrower", repaid: "Complete" }[flow.step] ?? "Compliance") : "Borrower"}</strong></div></div>
            {bands.length > 0 && <div className="tranche-book">
              <span className="section-kicker">Tranche book</span>
              {bands.map(band => <div key={band.name}>
                <span>{band.name === "SENIOR" ? "Senior" : "Junior"}</span>
                <strong>{money(band.subscribedIdr)}<small> of {money(band.capacityIdr)}</small></strong>
                <progress max={band.capacityIdr} value={band.subscribedIdr} aria-label={`${band.name === "SENIOR" ? "Senior" : "Junior"} subscription`} />
              </div>)}
            </div>}
            {bands.length > 0 && <div className="facility-terms">
              <div><span>Blended target return</span><strong>{(blendedBp / 100).toFixed(2)}% p.a.</strong></div>
              <div><span>By tranche</span><strong>{bands.map(b => `${b.name === "SENIOR" ? "Senior" : "Junior"} ${(b.returnBp / 100).toFixed(1)}%`).join(" · ")}</strong></div>
              <p>Capacity-weighted across the issued tranches. A target, not a contracted rate.</p>
            </div>}
            <button type="button" className="monitor-action" onClick={() => onOpen()}>{flow ? "Continue facility review" : role === "Borrower" ? "Create financing request" : "View financing workspace"}</button>
          </section>
          <aside className="analytics-panel activity-rail" aria-label="Recent facility activity">
            <header><div><span className="section-kicker">Live workspace record</span><h2>Recent activity</h2></div><span className="activity-count">{flow?.history.length ?? 0}</span></header>
            {flow?.history.length ? <ol>{[...flow.history].reverse().slice(0, 6).map((e, i) => <li key={`${e.at}-${i}`}><span className="activity-timeline-dot" /><div><strong>{events[e.step] ?? "Facility updated"}</strong><span>{flow.request.esrgId}</span><time dateTime={e.at}>{new Intl.DateTimeFormat("en-GB", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"UTC"}).format(new Date(e.at))} UTC</time></div></li>)}</ol> : <div className="activity-empty"><span>No activity yet</span><p>Your facility events appear here as each step is completed.</p></div>}
            <button type="button" className="activity-record-link" onClick={() => onSection(role === "Compliance" ? "Audit trail" : role === "Borrower" ? "Documents" : "Cashflows")}>View facility record</button>
          </aside>
        </div>}
      {priorities && <section className="analytics-panel priority-panel"><header><div><h2>{overview ? "Priority activity" : section}</h2><p>Only actions owned by the active workspace appear here.</p></div></header><div className="priority-rows">{priorities.length === 0 && <p className="empty-state">Nothing needs attention in this section.</p>}{priorities.map(row => <article key={row.title}><div><strong>{row.title}</strong><span>{row.meta}</span></div><span className="state-pill neutral">{row.status}</span></article>)}</div></section>}
      {activitySection ? <section className="analytics-panel records-panel"><header><div><span className="section-kicker">Facility records</span><h2>{section}</h2></div><span className="state-pill neutral">{flow ? flow.request.esrgId : "No active request"}</span></header>
        {!flow && capitalProvider && section === "Cashflows" ? <><div className="record-summary"><div><span>Invested capital</span><strong>Rp 270m</strong></div><div><span>Expected return</span><strong>Rp 8.6m</strong></div><div><span>Next payment</span><strong>02 Oct 2026</strong></div></div><div className="event-list">
          <div><span className="event-mark" /><div><strong>ANR-SRG-011 · Junior repayment</strong><span>Principal Rp 90m · target return Rp 3.6m</span></div><time>02 Oct 2026</time></div>
          <div><span className="event-mark" /><div><strong>ANR-SRG-018 · Senior repayment</strong><span>Principal Rp 180m · target return Rp 5m</span></div><time>18 Nov 2026</time></div>
          <div><span className="event-mark" /><div><strong>ANR-SRG-007 · Senior distribution</strong><span>Settlement completed</span></div><time>17 Jul 2026</time></div>
        </div></> : !flow ? <div className="dashboard-empty"><h3>No facility records yet</h3><p>Documents, controls and cashflows appear as the financing request progresses.</p><button type="button" onClick={() => onOpen()}>Open financing workspace</button></div> : <>
          {["Repayments", "Cashflows"].includes(section) && <div className="record-summary"><div><span>Requested ceiling</span><strong>{rp(principal)}</strong></div><div><span>Contractual term</span><strong>{flow.request.maturityDays} days</strong></div><div><span>Repayment status</span><strong>{flow.step === "repaid" ? "Repayment recorded" : flow.step === "funded" ? "Outstanding" : "Awaiting disbursement"}</strong></div><p>A payment schedule is not available from the API. No cashflow dates or interest accruals are estimated here.</p></div>}
          {section === "Registry controls" && <div className="record-summary"><div><span>Registry confirmation</span><strong>{flow.registryRef ?? "Pending"}</strong></div><p>Confirmation gates disbursement.</p></div>}
          <div className="event-list">{[...flow.history].reverse().map((e, i) => <div key={`${e.at}-${i}`}><span className="event-mark" /><div><strong>{events[e.step] ?? "Facility record updated"}</strong><span>{flow.request.esrgId} · {facilityStatus[e.step] ?? e.step}</span></div><time dateTime={e.at}>{dates(e.at)}</time></div>)}</div>
          <div className="records-action"><button type="button" onClick={() => onOpen()}>Open current facility</button></div>
        </>}
      </section> : <section className="analytics-panel records-panel">
        <header><div><span className="section-kicker">Asset register</span><h2>{overview ? "Warehouse receipts" : section}</h2></div><span className="count-label">{receipts.length} records</span></header>
        <div className="table-toolbar"><div className="table-tabs" aria-label="Filter receipts">{[["all", "All receipts"], ["clear", "Unencumbered"], ["facility", "In financing"]].map(([value, label]) => <button type="button" key={value!} aria-pressed={filter === value} onClick={() => setFilter(value!)}>{label}</button>)}</div><div className="table-controls"><input type="search" aria-label="Search receipts" placeholder="Search receipt or commodity…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Sort receipts" value={sort} onChange={e => setSort(e.target.value)}><option value="value">Value: high to low</option><option value="expiry">Expiry: earliest first</option></select></div></div>
        <div className="receipt-table-scroll"><table className="receipt-table"><thead><tr><th scope="col">Asset / receipt</th><th scope="col">Warehouse</th><th scope="col" className="numeric">Valuation</th><th scope="col">Receipt expiry</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{paged.map(r => <tr key={r.id}><td><button type="button" className="asset-link" onClick={() => setSelected(r)}>{r.commodity}</button><small>{r.id}{role !== "Capital Provider" && <> · {r.quantityKg.toLocaleString("en-GB")} kg</>}</small></td><td>{r.warehouse.replace("Gudang SRG ", "")}<small>Warehouse receipt</small></td><td className="numeric"><strong>{money(r.valueIdr)}</strong><small>IDR</small></td><td>{dates(r.expiresAt)}</td><td><span className={`state-pill ${r.id === flow?.request.esrgId ? "amber" : r.encumbrance === "none" ? "teal" : "amber"}`}>{r.id === flow?.request.esrgId ? facilityStatus[flow.step] ?? flow.step : r.encumbrance === "none" ? "Unencumbered" : "Pledged"}</span></td><td><button type="button" className="table-open" aria-label={`View ${r.id}`} onClick={() => setSelected(r)}>View</button></td></tr>)}</tbody></table></div>
        {shown.length === 0 && <div className="dashboard-empty"><h3>No matching receipts</h3><p>Try another search or filter.</p><button type="button" className="secondary-button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></div>}
        <footer>
          <span>{shown.length ? `Showing ${current * REGISTER_PAGE + 1}–${current * REGISTER_PAGE + paged.length} of ${shown.length}` : "No"} receipts{shown.length !== receipts.length ? ` · filtered from ${receipts.length}` : ""}</span>
          <span className="unit-label">e-SRG records · IDR</span>
          <div className="table-pager">
            <span>Page {current + 1} of {pageCount}</span>
            <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <button type="button" aria-label="Next page" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        </footer>
      </section>}
      </div>
      </div>
    </>}
    <footer className="analytics-footer"><span>Anora / Institutional credit infrastructure</span><button type="button" onClick={() => onSection(role === "Compliance" ? "Audit trail" : role === "Borrower" ? "Documents" : "Cashflows")}>View facility records</button></footer>
    <dialog ref={dialog} className="receipt-dialog" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} aria-labelledby="receipt-dialog-title">{selected && <><header><span className="section-kicker">Collateral details</span><button type="button" aria-label="Close receipt details" onClick={() => dialog.current?.close()}>×</button></header><span className="state-pill teal">e-SRG record</span><h2 id="receipt-dialog-title">{selected.commodity}</h2><p>{selected.id}</p><strong className="detail-valuation">{rp(selected.valueIdr)}</strong><span className="detail-caption">Recorded collateral valuation</span><dl>{[["Receipt holder", selected.holder], ["Warehouse", selected.warehouse], ["Quantity", role === "Capital Provider" ? "Withheld from investor view" : `${selected.quantityKg.toLocaleString("en-GB")} kg`], ["Issued", dates(selected.issuedAt)], ["Expires", dates(selected.expiresAt)], ["Encumbrance", selected.encumbrance === "none" ? "Unencumbered · registry snapshot" : selected.encumbrance], ["Document hash", selected.documentHash]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="detail-note">The financing note represents a contractual claim. Ownership of the warehouse receipt remains in the official registry.</p>{role === "Borrower" && selected.encumbrance !== "none" && selected.id !== flow?.request.esrgId
      ? <button type="button" className="detail-cta" disabled>Pledged to another facility</button>
      : <button type="button" className="detail-cta" onClick={() => { dialog.current?.close(); onOpen(selected); }}>{role !== "Borrower" || selected.id === flow?.request.esrgId ? "Open financing workspace" : acceptedIds.includes(selected.id) ? "Prepare financing request" : "Propose for intake review"}</button>}</>}</dialog>
  </div>;
}
