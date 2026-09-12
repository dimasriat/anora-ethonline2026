/**
 * The facility panels ANO-24 asks for and the workspace did not have: how a
 * facility gets structured and priced before funding opens, what the
 * collateral is actually doing while it is open, and how cash reaches holders
 * when it closes.
 *
 * Each panel shows its inputs beside its outputs. That is not decoration —
 * §5 of the structuring addition requires the proposal, the policy and the
 * scenario set be legible enough to verify, and a derived number with its
 * inputs hidden is indistinguishable from one that was invented.
 */
import { useMemo, useState } from "react";
import type { Band, Investor, Position, TrancheName } from "./api";
import { Badge, Card, NumberField, PendingAction, Source } from "./ui";
import {
  COLLATERAL_STATE_COPY, distributionView, gateView, saleQuote, settlementView,
  type CollateralView, type FacilityProposal, type Provenance, type SettlementView,
} from "./facility-view";
import type { CollateralReport, Policy } from "./structuring";

const idr = new Intl.NumberFormat("id-ID");
/** Rupiah from an exact integer. Never via Number — face values overflow it. */
const rp = (value: bigint) => `Rp ${idr.format(value)}`;
/** For callers outside this module: `rp` in api.ts takes a number. */
export const rpExact = rp;
export const pct = (bp: bigint | null) => (bp === null ? "—" : `${(Number(bp) / 100).toFixed(2)}%`);
export const kg = (grams: bigint) => `${idr.format(grams / 1_000n)} kg`;

/* ── Collateral ────────────────────────────────────────────────────────── */

export function CollateralPanel({ view, policy, onObserve, editable }: {
  view: CollateralView;
  policy: Policy;
  onObserve: (report: CollateralReport) => void;
  editable: boolean;
}) {
  const state = COLLATERAL_STATE_COPY[view.state];
  const { report, reconciliation } = view;

  const set = (patch: Partial<CollateralReport>) => onObserve({ ...report, ...patch, nonce: report.nonce + 1n });
  const field = (value: bigint) => (value === 0n ? "" : String(value));
  const parse = (raw: string): bigint => {
    const digits = raw.replace(/[^0-9]/g, "");
    return digits ? BigInt(digits) : 0n;
  };

  return (
    <Card title="Collateral observation">
      <div className="status-strip">
        <span>Coverage</span>
        <Badge tone={state.tone}>{state.label}</Badge>
        <small>{state.detail}</small>
      </div>

      {editable && (
        <div className="subscribe-fields observation-fields">
          <label>
            <span>Registry quantity (g)</span>
            <NumberField value={field(report.registryGrams)} onValue={(digits) => set({ registryGrams: parse(digits) })} />
          </label>
          <label>
            <span>Warehouse quantity (g)</span>
            <NumberField value={field(report.warehouseGrams)} onValue={(digits) => set({ warehouseGrams: parse(digits) })} />
          </label>
          <label>
            <span>Unit price (IDR/kg)</span>
            <NumberField value={field(report.priceIdrPerKg)} onValue={(digits) => set({ priceIdrPerKg: parse(digits) })} />
          </label>
          <label>
            <span>Haircut (bp)</span>
            <NumberField value={field(report.haircutBp)} onValue={(digits) => set({ haircutBp: parse(digits) })} />
          </label>
        </div>
      )}

      <div className="finance-metrics">
        <div>
          <span>Registry quantity</span><strong>{kg(report.registryGrams)}</strong>
          <small>Official receipt record</small>
        </div>
        <div>
          <span>Warehouse quantity</span><strong>{kg(report.warehouseGrams)}</strong>
          <small>Latest signed observation</small>
        </div>
        <div>
          <span>Effective quantity</span><strong>{kg(reconciliation.effectiveGrams)}</strong>
          <small>The lower of the two. The higher one is a claim, not stock</small>
        </div>
        <div>
          <span>Difference</span>
          <strong>{kg(reconciliation.differenceGrams)}</strong>
          <small>
            {reconciliation.accepted ? "Within" : "Outside"} the {pct(policy.reconciliationToleranceBp)} tolerance
          </small>
        </div>
        <div>
          <span>Eligible collateral</span><strong>{rp(view.collateralIdr)}</strong>
          <small>After a {pct(report.haircutBp)} haircut</small>
        </div>
        <div>
          <span>Collateral ceiling</span><strong>{rp(view.faceCeilingIdr)}</strong>
          <small>At the {pct(policy.maxLtvBp)} policy LTV</small>
        </div>
      </div>

      <div className="order-book">
        <div className="order-row">
          <span><strong>Approved face</strong><small>Authorised exposure. Unused headroom is not funded cash</small></span>
          <strong>{rp(view.approvedFaceIdr)}</strong>
        </div>
        <div className="order-row">
          <span><strong>Issued face</strong><small>What holders actually have a claim on</small></span>
          <strong>{rp(view.issuedFaceIdr)}</strong>
        </div>
        <div className="order-row">
          <span><strong>Remaining headroom</strong><small>max(min(approved, ceiling) − issued, 0)</small></span>
          <strong>{rp(view.headroomIdr)}</strong>
        </div>
        {view.coverageShortfallIdr > 0n && (
          <div className="order-row breach">
            <span><strong>Coverage shortfall</strong><small>Issued face above the ceiling. Issuance stops; transfers restrict</small></span>
            <strong>{rp(view.coverageShortfallIdr)}</strong>
          </div>
        )}
        <div className="order-row">
          <span><strong>Issued LTV</strong><small>{view.issuedLtvBp === null ? "Undefined: eligible collateral is zero" : "Ceiling of issued face over eligible collateral"}</small></span>
          <strong>{pct(view.issuedLtvBp)}</strong>
        </div>
        {view.covenantCollateralIdr !== null && view.issuedFaceIdr > 0n && (
          <div className="order-row">
            <span><strong>Covenant floor</strong><small>Least collateral that still satisfies the LTV covenant</small></span>
            <strong>{rp(view.covenantCollateralIdr)}</strong>
          </div>
        )}
      </div>

      <p className="supporting-copy">
        An observation changes collateral state only. It never resizes a cap, reprices a note or
        mints debt — and a report that reveals deterioration is recorded rather than refused.
      </p>
      <Source provenance={view.provenance} />
    </Card>
  );
}

/* ── Structuring and pricing ───────────────────────────────────────────── */

export function StructuringPanel({ proposal, policy, canApprove }: {
  proposal: FacilityProposal;
  policy: Policy;
  canApprove: boolean;
}) {
  const { structure, pricing, reasons, feasible } = proposal;

  return (
    <>
      <Card title="Proposed structure">
        <div className="status-strip">
          <span>Proposal</span>
          <Badge tone={feasible ? "success" : "danger"}>{feasible ? "Feasible" : "Infeasible"}</Badge>
          <small>
            Derived from the policy and the current report. A preview is not approved, funded or issued.
          </small>
        </div>

        {!feasible && (
          <div className="reason-list" role="status">
            <strong>This structure was refused, not adjusted.</strong>
            <ul>
              {reasons.map((reason) => (
                <li key={reason.code}><code>{reason.code}</code><span>{reason.detail}</span></li>
              ))}
            </ul>
          </div>
        )}

        {structure && (
          <>
            <div className="finance-metrics">
              <div><span>Requested face</span><strong>{rp(proposal.input.requestedFaceIdr)}</strong><small>What the borrower asked for</small></div>
              <div><span>Derived ceiling</span><strong>{rp(structure.approvedFaceIdr)}</strong><small>Lowest of authority, policy limit and collateral ceiling</small></div>
              <div><span>Target face</span><strong>{rp(structure.targetFaceIdr)}</strong><small>What this facility would actually issue</small></div>
            </div>

            <div className="section-heading"><h3>Stress scenarios</h3></div>
            <p className="supporting-copy">
              Underwriting assumptions, not probabilities. Quantity, price, haircut and recovery each
              describe a different loss; the worst outcome sizes Junior.
            </p>
            <div className="scenario-table" role="table" aria-label="Stress scenarios">
              <div className="scenario-head" role="row">
                <span role="columnheader">Scenario</span>
                <span role="columnheader">Quantity</span>
                <span role="columnheader">Price</span>
                <span role="columnheader">Stressed collateral</span>
                <span role="columnheader">Cash to holders</span>
              </div>
              {structure.scenarios.map((result) => (
                <div className={`scenario-row${result.worst ? " worst" : ""}`} role="row" key={result.scenario.id}>
                  <span role="cell">
                    <strong>{result.scenario.id}</strong>
                    <small>{result.scenario.evidenceRef}</small>
                  </span>
                  <span role="cell">{kg(result.stressedQuantityGrams)}</span>
                  <span role="cell">{rp(result.stressedPriceIdrPerKg)}/kg</span>
                  <span role="cell">{rp(result.stressedCollateralIdr)}</span>
                  <span role="cell">
                    <strong>{rp(result.availableIdr)}</strong>
                    {result.worst && <small>Worst case · sizes Junior</small>}
                  </span>
                </div>
              ))}
            </div>

            <div className="section-heading"><h3>Required first loss</h3></div>
            <div className="order-book">
              <div className="order-row">
                <span><strong>Worst-case cash</strong><small>Lowest available across every scenario</small></span>
                <strong>{rp(structure.stressAvailableIdr)}</strong>
              </div>
              <div className="order-row">
                <span><strong>Stress loss</strong><small>Target face less worst-case cash</small></span>
                <strong>{rp(structure.stressLossIdr)}</strong>
              </div>
              <div className="order-row">
                <span><strong>Policy floor</strong><small>{pct(policy.minJuniorBp)} of target face, rounded up</small></span>
                <strong>{rp(structure.juniorFloorIdr)}</strong>
              </div>
              <div className="order-row">
                <span><strong>Structural buffer</strong><small>Held above the stress loss</small></span>
                <strong>{rp(policy.structuralBufferIdr)}</strong>
              </div>
              <div className={`order-row emphasis${structure.juniorRequiredIdr > structure.juniorMaximumIdr ? " breach" : ""}`}>
                <span><strong>Required Junior</strong><small>Greater of the floor and stress loss plus buffer · maximum {rp(structure.juniorMaximumIdr)}</small></span>
                <strong>{rp(structure.juniorRequiredIdr)}</strong>
              </div>
            </div>

            <div className="cap-split" aria-label="Derived tranche caps">
              <div>
                <span>Senior cap</span>
                <strong>{rp(structure.seniorCapIdr)}</strong>
                <small>Target face less required Junior. Paid first</small>
              </div>
              <div>
                <span>Junior cap</span>
                <strong>{rp(structure.juniorCapIdr)}</strong>
                <small>Absorbs first loss. Funded before Senior unlocks</small>
              </div>
            </div>
            <Source provenance={proposal.provenance} />
          </>
        )}
      </Card>

      {pricing && structure && (
        <Card title="Proposed pricing">
          <p className="supporting-copy">
            Rule-based quotes from an explicit spread schedule — not observed market prices. Both
            tranches are zero-coupon: the return is the difference between what is paid now and the
            face repaid at maturity, and there is no coupon on top of it.
          </p>

          <div className="spread-schedule">
            {(["senior", "junior"] as const).map((tranche) => (
              <div key={tranche}>
                <div className="spread-head">
                  <strong>{tranche === "senior" ? "Senior" : "Junior"}</strong>
                  <span>{pct(tranche === "senior" ? pricing.seniorYieldBp : pricing.juniorYieldBp)} p.a.</span>
                </div>
                <ul>
                  {pricing.components
                    .filter((component) => tranche === "junior" || component.tranche === "senior")
                    .map((component) => (
                      <li key={`${tranche}-${component.label}`}>
                        <span>{component.label}</span><span>{pct(component.bp)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="order-book">
            <div className="order-row">
              <span><strong>Senior subscription cash</strong><small>{rp(structure.seniorCapIdr)} face at {pct(pricing.seniorYieldBp)} over {String(pricing.termDays)} days</small></span>
              <strong>{rp(pricing.seniorCashIdr)}</strong>
            </div>
            <div className="order-row">
              <span><strong>Junior subscription cash</strong><small>{rp(structure.juniorCapIdr)} face at {pct(pricing.juniorYieldBp)} over {String(pricing.termDays)} days</small></span>
              <strong>{rp(pricing.juniorCashIdr)}</strong>
            </div>
            <div className="order-row emphasis">
              <span><strong>Gross subscription cash</strong><small>What investors pay in. Face remains {rp(structure.targetFaceIdr)}</small></span>
              <strong>{rp(pricing.grossSubscriptionCashIdr)}</strong>
            </div>
            <div className="order-row">
              <span><strong>Approved upfront costs</strong><small>Identified once, never charged twice</small></span>
              <strong>−{rp(pricing.upfrontCostsIdr)}</strong>
            </div>
            <div className="order-row emphasis">
              <span><strong>Net borrower proceeds</strong><small>What actually reaches the cooperative</small></span>
              <strong>{rp(pricing.netBorrowerProceedsIdr)}</strong>
            </div>
          </div>

          <p className="supporting-copy">
            {String(pricing.termDays)} days is the documented issue-price tenor, not any individual
            subscriber's holding period, and the quoted yield is not a guaranteed realised return.
          </p>
        </Card>
      )}

      <Card title="Approval and lock">
        <div className="order-book">
          <div className="order-row">
            <span><strong>Policy</strong><small>{policy.modelVersion} · valid to {policy.validUntil}</small></span>
            <strong className="mono">{policy.policyHash}</strong>
          </div>
          <div className="order-row">
            <span><strong>Collateral report</strong><small>Authorised observation this proposal rests on</small></span>
            <strong className="mono">{proposal.input.report.reportHash || "—"}</strong>
          </div>
          <div className="order-row">
            <span><strong>Locked terms</strong><small>Caps, yields, term and asset mapping, fixed before any money moves</small></span>
            <Badge tone={proposal.locked ? "success" : "neutral"}>{proposal.locked ? "Locked" : "Not locked"}</Badge>
          </div>
        </div>
        {canApprove
          ? <PendingAction
              label={feasible ? "Approve and lock terms" : "Cannot lock an infeasible structure"}
              because="Locking writes caps, yields and hashes to the Hedera controller. Nothing may be subscribed against a preview." />
          : <p className="supporting-copy">Compliance approves the exact proposal, or asks for revised evidence. There is no override.</p>}
      </Card>
    </>
  );
}

/* ── Funding gate ──────────────────────────────────────────────────────── */

export function FundingGatePanel({ bands, policy }: { bands: Band[]; policy: Policy }) {
  const gate = gateView(bands, policy);
  if (!gate) return null;

  return (
    <Card title="Funding gate">
      <p className="supporting-copy">
        Junior commits first and Senior follows it proportionally. Senior liquidity is never
        auto-filled, so an empty Junior book means no Senior capacity at all.
      </p>
      <div className="gate-meter">
        {/* A zero cap has no meter to draw, and `max={0}` is not a valid range. */}
        <div className="gate-line">
          <div className="gate-head"><strong>Junior funded</strong><span>{rp(gate.juniorFundedIdr)} of {rp(gate.juniorCapIdr)}</span></div>
          {gate.juniorCapIdr > 0n && (
            <progress max={Number(gate.juniorCapIdr)} value={Number(gate.juniorFundedIdr)} aria-label="Junior funded" />
          )}
        </div>
        <div className="gate-line">
          <div className="gate-head"><strong>Senior unlocked</strong><span>{rp(gate.seniorUnlockedIdr)} of {rp(gate.seniorCapIdr)}</span></div>
          {gate.seniorCapIdr > 0n && (
            <progress max={Number(gate.seniorCapIdr)} value={Number(gate.seniorUnlockedIdr)} aria-label="Senior unlocked" />
          )}
        </div>
      </div>
      <div className="order-book">
        <div className="order-row">
          <span><strong>Senior still open</strong><small>Unlocked capacity not yet taken</small></span>
          <strong>{rp(gate.seniorRemainingIdr)}</strong>
        </div>
        <div className="order-row">
          <span><strong>Sponsor retention</strong><small>{pct(policy.sponsorRetentionBp)} of the Junior cap, held until settlement locks</small></span>
          <strong>{rp(gate.sponsorRetentionIdr)}</strong>
        </div>
        {gate.gateBreached && (
          <div className="order-row breach">
            <span><strong>Gate breached</strong><small>Senior taken beyond what funded Junior unlocks</small></span>
            <Badge tone="danger">Refuse</Badge>
          </div>
        )}
      </div>
      <Source provenance={gate.provenance} />
    </Card>
  );
}

/* ── Settlement ────────────────────────────────────────────────────────── */

/* ── Settlement charts ─────────────────────────────────────────────────── */

const mn = (value: bigint) => `${(Number(value) / 1e6).toFixed(1)}M`;
const share = (part: bigint, whole: bigint) => (whole <= 0n ? 0 : Number(part) / Number(whole));

/**
 * The cash bridge. Every bar opens where the running total closed, so the drop
 * across a bar is exactly what that step consumed, and the connector between
 * two bars is flat because the closing balance and the opening one are the
 * same number.
 *
 * Frozen face is deliberately absent here. Junior's face can sit below zero on
 * a cash axis once costs bite, and a bar drawn through the baseline states
 * something untrue; `FaceAgainstPaid` carries that comparison instead.
 */
function CashBridge({ view }: { view: SettlementView }) {
  const { result } = view;
  const totalFace = view.seniorFaceIdr + view.juniorFaceIdr;
  const peak = view.recoveredIdr > totalFace ? view.recoveredIdr : totalFace;
  if (peak <= 0n) return null;

  const LEFT = 82, RIGHT = 864, TOP = 30, BASE = 310;
  const SPAN = (RIGHT - LEFT) / 5, BAR = SPAN * 0.5;
  const y = (value: bigint) => BASE - share(value, peak) * (BASE - TOP);
  const cx = (index: number) => LEFT + SPAN * index + SPAN / 2;
  const afterSenior = result.availableIdr - result.seniorPaidIdr;

  const steps = [
    { name: "RECOVERED", hi: view.recoveredIdr, lo: 0n, to: view.recoveredIdr, tone: "total", cap: mn(view.recoveredIdr) },
    { name: "COSTS", hi: view.recoveredIdr, lo: result.availableIdr, to: result.availableIdr, tone: "deduct", cap: result.costsPaidIdr > 0n ? `less ${mn(result.costsPaidIdr)}` : "none" },
    { name: "AVAILABLE", hi: result.availableIdr, lo: 0n, to: result.availableIdr, tone: "total", cap: mn(result.availableIdr) },
    { name: "SENIOR", hi: result.availableIdr, lo: afterSenior, to: afterSenior, tone: "senior", cap: mn(result.seniorPaidIdr) },
    { name: "JUNIOR", hi: afterSenior, lo: result.surplusIdr, to: result.surplusIdr, tone: "junior", cap: mn(result.juniorPaidIdr) },
  ];

  return (
    <figure className="chart">
      <svg viewBox="0 0 880 376" role="img" aria-label={`Cash bridge. ${rp(view.recoveredIdr)} recovered, ${rp(result.costsPaidIdr)} of costs charged first, leaving ${rp(result.availableIdr)} allocated Senior before Junior.`}>
        {[0, 1, 2, 3, 4].map((tick) => {
          const gy = BASE - (tick / 4) * (BASE - TOP);
          return (
            <g key={tick}>
              <line className="chart-grid" x1={LEFT} y1={gy} x2={RIGHT} y2={gy} />
              <text className="chart-axis" x={LEFT - 10} y={gy + 4} textAnchor="end">{((Number(peak) * tick) / 4 / 1e6).toFixed(1)}M</text>
            </g>
          );
        })}
        <line className="chart-base" x1={LEFT} y1={BASE} x2={RIGHT} y2={BASE} />
        {steps.map((step, index) => {
          const top = y(step.hi);
          const height = Math.max(y(step.lo) - top, step.hi === step.lo ? 0 : 2);
          return (
            <g key={step.name}>
              {height > 0 && <rect className={`chart-bar ${step.tone}`} x={cx(index) - BAR / 2} y={top} width={BAR} height={height} rx="2" />}
              <text className="chart-cap" x={cx(index)} y={top - 9} textAnchor="middle">{step.cap}</text>
              <text className="chart-name" x={cx(index)} y={BASE + 22} textAnchor="middle">{step.name}</text>
              {index < steps.length - 1 && (
                <line className="chart-conn" x1={cx(index) + BAR / 2} y1={y(step.to)} x2={cx(index + 1) - BAR / 2} y2={y(step.to)} />
              )}
            </g>
          );
        })}
        {result.surplusIdr > 0n && (
          <text className="chart-cap" x={RIGHT} y={BASE + 48} textAnchor="end">Surplus above total face {mn(result.surplusIdr)}</text>
        )}
      </svg>
    </figure>
  );
}

/** Frozen face as the track, cash that reached it as the fill. A shortfall is
 *  the part of the track the fill never covers, which is where it reads. */
function FaceAgainstPaid({ view }: { view: SettlementView }) {
  const { result } = view;
  const peak = view.seniorFaceIdr > view.juniorFaceIdr ? view.seniorFaceIdr : view.juniorFaceIdr;
  if (peak <= 0n) return null;

  const LEFT = 82, RIGHT = 640, ROW = 46;
  const width = (value: bigint) => share(value, peak) * (RIGHT - LEFT);
  const rows = [
    { name: "SENIOR", face: view.seniorFaceIdr, paid: result.seniorPaidIdr, loss: result.seniorLossIdr, tone: "senior" },
    { name: "JUNIOR", face: view.juniorFaceIdr, paid: result.juniorPaidIdr, loss: result.juniorLossIdr, tone: "junior" },
  ];

  return (
    <figure className="chart">
      <svg viewBox="0 0 880 118" role="img" aria-label={`Frozen face against cash paid. Senior ${rp(result.seniorPaidIdr)} of ${rp(view.seniorFaceIdr)}. Junior ${rp(result.juniorPaidIdr)} of ${rp(view.juniorFaceIdr)}.`}>
        {rows.map((row, index) => {
          const top = 20 + index * ROW;
          return (
            <g key={row.name}>
              <text className="chart-name" x={LEFT - 10} y={top + 17} textAnchor="end">{row.name}</text>
              <rect className="chart-bar open" x={LEFT} y={top} width={width(row.face)} height="26" rx="2" />
              {row.paid > 0n && <rect className={`chart-bar ${row.tone}`} x={LEFT} y={top} width={width(row.paid)} height="26" rx="2" />}
              {row.loss > 0n && <rect className="chart-bar deduct" x={LEFT + width(row.paid)} y={top} width={width(row.loss)} height="26" />}
              <text className={`chart-cap${row.loss > 0n ? " loss" : ""}`} x="870" y={top + 17} textAnchor="end">
                {mn(row.paid)} of {mn(row.face)}{row.loss > 0n ? `, ${mn(row.loss)} short` : " · whole"}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Percent of frozen face. Loss fills from the bottom because Junior is the
 *  first loss piece, so Senior is touched only once the fill passes its
 *  attachment line. */
function FirstLossStack({ view }: { view: SettlementView }) {
  const { result } = view;
  const totalFace = view.seniorFaceIdr + view.juniorFaceIdr;
  if (!view.attachments || totalFace <= 0n) return null;

  const BX = 96, BW = 140, TOP = 46, BASE = 292, TRACK = BASE - TOP, AX = BX + BW + 18;
  const detach = Number(view.attachments.juniorDetachBp) / 10_000;
  const lossShare = share(result.totalLossIdr, totalFace);
  const yOf = (fraction: number) => BASE - Math.min(Math.max(fraction, 0), 1) * TRACK;
  const yDetach = yOf(detach);
  const yLoss = result.totalLossIdr > 0n ? Math.min(yOf(lossShare), BASE - 5) : BASE;
  const past = result.seniorLossIdr > 0n;
  const seniorRoom = yDetach - TOP, juniorRoom = BASE - yDetach;

  return (
    <figure className="chart">
      <svg viewBox="0 0 470 352" role="img" aria-label={`First loss stack. Junior runs from zero to ${pct(view.attachments.juniorDetachBp)} of frozen face and Senior from there to 100 percent. Realised loss reaches ${(lossShare * 100).toFixed(2)} percent, ${past ? "past attachment, so Senior is impaired" : "leaving Senior untouched"}.`}>
        <text className="chart-axis" x={BX - 10} y={TOP + 4} textAnchor="end">100%</text>
        <text className="chart-axis" x={BX - 10} y={yDetach + 4} textAnchor="end">{pct(view.attachments.juniorDetachBp)}</text>
        <text className="chart-axis" x={BX - 10} y={BASE + 4} textAnchor="end">0%</text>

        <rect className="chart-bar senior" x={BX} y={TOP} width={BW} height={seniorRoom} />
        <rect className="chart-bar junior" x={BX} y={yDetach} width={BW} height={juniorRoom} />
        {result.totalLossIdr > 0n && <rect className="chart-bar deduct" x={BX} y={yLoss} width={BW} height={BASE - yLoss} />}

        {seniorRoom > 34 && (
          <>
            <text className="chart-band" x={BX + BW / 2} y={(TOP + yDetach) / 2 - 2} textAnchor="middle">SENIOR</text>
            <text className="chart-band-sub" x={BX + BW / 2} y={(TOP + yDetach) / 2 + 14} textAnchor="middle">{mn(view.seniorFaceIdr)} · {past ? "impaired" : "untouched"}</text>
          </>
        )}
        {juniorRoom > 34 && (
          <>
            <text className="chart-band" x={BX + BW / 2} y={(yDetach + BASE) / 2 - 2} textAnchor="middle">JUNIOR</text>
            <text className="chart-band-sub" x={BX + BW / 2} y={(yDetach + BASE) / 2 + 14} textAnchor="middle">{mn(view.juniorFaceIdr)} first loss</text>
          </>
        )}

        <line className="chart-attach" x1={BX - 8} y1={yDetach} x2={AX + 180} y2={yDetach} />
        <text className="chart-ann" x={AX} y={yDetach - 9}>Senior attaches</text>
        <text className="chart-ann-sub" x={AX} y={yDetach + 16}>{past ? "Loss has passed this line" : "A loss must climb this far"}</text>
        <text className="chart-ann-sub" x={AX} y={yDetach + 30}>{past ? "and is eating Senior" : "before Senior is touched"}</text>

        <line className="chart-base" x1={BX} y1={BASE} x2={BX + BW} y2={BASE} />
        {result.totalLossIdr > 0n ? (
          <>
            <text className="chart-ann loss" x={BX} y={BASE + 34}>{rp(result.totalLossIdr)} realised</text>
            <text className="chart-ann-sub" x={BX} y={BASE + 50}>{(lossShare * 100).toFixed(2)}% of frozen face</text>
          </>
        ) : (
          <>
            <text className="chart-ann" x={BX} y={BASE + 34}>No loss realised</text>
            <text className="chart-ann-sub" x={BX} y={BASE + 50}>Every tranche paid to face</text>
          </>
        )}
      </svg>
    </figure>
  );
}

export function SettlementPanel({ bands, positions, investors, recoveredIdr, settled, provenance }: {
  bands: Band[];
  positions: Position[];
  investors: Investor[];
  recoveredIdr: bigint;
  /** Once settled these figures are frozen; before it they are an expectation. */
  settled: boolean;
  provenance: Provenance;
}) {
  const [costsText, setCostsText] = useState("0");
  const approvedCostsIdr = useMemo(() => {
    const digits = costsText.replace(/[^0-9]/g, "");
    return digits ? BigInt(digits) : 0n;
  }, [costsText]);

  const view = settlementView(bands, positions, recoveredIdr, approvedCostsIdr, provenance);
  if (!view) return null;
  const { result } = view;
  const nameOf = (id: string) => investors.find((investor) => investor.id === id)?.name ?? id;

  return (
    <>
      <Card title="Settlement waterfall">
        <div className="subscribe-fields">
          <label>
            <span>Approved costs (IDR)</span>
            <NumberField value={costsText} onValue={setCostsText} />
          </label>
        </div>
        <CashBridge view={view} />
        <FaceAgainstPaid view={view} />
        <div className="chart-legend">
          <span><i className="chart-key senior" /> Senior, paid first</span>
          <span><i className="chart-key junior" /> Junior, absorbs loss first</span>
          <span><i className="chart-key deduct" /> Costs and shortfall</span>
          <span><i className="chart-key open" /> Frozen face not reached</span>
        </div>
        <div className="order-book">
          <div className="order-row">
            <span>
              <strong>Cash recovered</strong>
              <small>{settled
                ? "Actually received. An evidence hash does not fund a claim"
                : "Expected at maturity. Nothing is frozen until settlement records real cash"}</small>
            </span>
            <strong>{rp(view.recoveredIdr)}</strong>
          </div>
          <div className="order-row">
            <span><strong>Costs paid</strong><small>Charged once, before any holder is paid</small></span>
            <strong>−{rp(result.costsPaidIdr)}</strong>
          </div>
          {result.costsUnpaidIdr > 0n && (
            <div className="order-row">
              <span><strong>Costs unpaid</strong><small>Not noteholder cash, and not carried into the waterfall</small></span>
              <strong>{rp(result.costsUnpaidIdr)}</strong>
            </div>
          )}
          <div className="order-row emphasis">
            <span><strong>Available to holders</strong></span>
            <strong>{rp(result.availableIdr)}</strong>
          </div>
          <div className="order-row">
            <span><strong>1 · Senior</strong><small>Paid first, up to {rp(view.seniorFaceIdr)} of frozen face</small></span>
            <strong>{rp(result.seniorPaidIdr)}{result.seniorLossIdr > 0n && <small>{rp(result.seniorLossIdr)} loss</small>}</strong>
          </div>
          <div className="order-row">
            <span><strong>2 · Junior</strong><small>Only after Senior is whole. Absorbs loss first, up to {rp(view.juniorFaceIdr)}</small></span>
            <strong>{rp(result.juniorPaidIdr)}{result.juniorLossIdr > 0n && <small>{rp(result.juniorLossIdr)} loss</small>}</strong>
          </div>
          {result.surplusIdr > 0n && (
            <div className="order-row">
              <span><strong>Surplus</strong><small>Above total face. Issuer or treasury, not holders</small></span>
              <strong>{rp(result.surplusIdr)}</strong>
            </div>
          )}
        </div>

        <Source provenance={view.provenance} />
      </Card>

      {view.attachments && (
        <Card title="First loss and attachment">
          <p className="supporting-copy">
            How far a loss has to climb before it reaches Senior. Junior attaches at 0 and detaches
            at {pct(view.attachments.juniorDetachBp)} of frozen face; Senior runs from there to
            100%. These points come from the face actually outstanding, not from a prescribed split.
          </p>
          <div className="loss-stack">
            <FirstLossStack view={view} />
            <dl className="loss-facts">
              <div>
                <dt>Junior detachment</dt>
                <dd>{pct(view.attachments.juniorDetachBp)}<small>{rp(view.juniorFaceIdr)} of {rp(view.seniorFaceIdr + view.juniorFaceIdr)} frozen face</small></dd>
              </div>
              <div>
                <dt>Realised loss</dt>
                <dd className={result.totalLossIdr > 0n ? "warn" : ""}>
                  {rp(result.totalLossIdr)}
                  <small>{result.totalLossIdr > 0n ? `${pct(view.attachments.juniorDetachBp === 0n ? 0n : BigInt(Math.round(share(result.totalLossIdr, view.juniorFaceIdr) * 10_000)))} of the Junior buffer` : "Every tranche paid to face"}</small>
                </dd>
              </div>
              <div>
                <dt>{result.seniorLossIdr > 0n ? "Senior impaired by" : "Headroom before Senior"}</dt>
                <dd className={result.seniorLossIdr > 0n ? "warn" : ""}>
                  {rp(result.seniorLossIdr > 0n ? result.seniorLossIdr : view.juniorFaceIdr - result.juniorLossIdr)}
                  <small>{result.seniorLossIdr > 0n ? "The Junior buffer is exhausted" : "Subordination still standing under the attachment"}</small>
                </dd>
              </div>
            </dl>
          </div>
          <Source provenance={view.provenance} />
        </Card>
      )}

      <Card title="Holder claims">
        <p className="supporting-copy">
          Each entitlement floors once against the record-date supply. One claim per holder per
          partition, with payment and unit redemption together — if either fails, neither happens.
        </p>
        {view.claims.length === 0
          ? <p className="empty-state">No allocated positions to pay.</p>
          : <div className="order-book">
              {view.claims.map((claim) => (
                <div className="order-row" key={`${claim.investorId}-${claim.tranche}`}>
                  <span>
                    <strong>{nameOf(claim.investorId)}</strong>
                    <small>{claim.tranche === "SENIOR" ? "Senior" : "Junior"} · {rp(claim.unitsIdr)} face</small>
                  </span>
                  <strong>{rp(claim.claimIdr)}</strong>
                </div>
              ))}
            </div>}
        <div className="order-book">
          <div className="order-row">
            <span><strong>Entitlements accounted</strong><small>Reserved against holders until claimed. A liability, not dust</small></span>
            <strong>{rp(view.reservedIdr)}</strong>
          </div>
          <div className="order-row">
            <span><strong>Rounding dust</strong><small>Below one rupiah per holder, and independent of claim order</small></span>
            <strong>{rp(view.dustIdr)}</strong>
          </div>
        </div>
        <PendingAction label="Claim and redeem"
          because="Claiming pays the holder and burns their units in one transaction on the controller." />
      </Card>
    </>
  );
}

/* ── Distributions ─────────────────────────────────────────────────────── */

export type ScheduledDistribution = {
  id: string;
  kind: "Coupon" | "Dividend" | "Royalty";
  grossIdr: bigint;
  /** Snapshotted at creation: a later policy change cannot reprice this one. */
  servicingFeeBp: bigint;
  recordDate: string;
  partition: TrancheName;
  executed: boolean;
};

export function DistributionPanel({ scheduled, positions, investors, feeBp, onSchedule, onExecute }: {
  scheduled: ScheduledDistribution[];
  positions: Position[];
  investors: Investor[];
  feeBp: bigint;
  onSchedule: (item: ScheduledDistribution) => void;
  onExecute: (id: string) => void;
}) {
  const [kind, setKind] = useState<ScheduledDistribution["kind"]>("Coupon");
  const [partition, setPartition] = useState<TrancheName>("SENIOR");
  const [grossText, setGrossText] = useState("");
  const nameOf = (id: string) => investors.find((investor) => investor.id === id)?.name ?? id;

  const holdersOf = (tranche: TrancheName) => positions
    .filter((position) => position.tranche === tranche)
    .map((position) => ({ investorId: position.investorId, unitsIdr: BigInt(Math.trunc(position.unitsIdr)) }));

  const grossIdr = (() => {
    const digits = grossText.replace(/[^0-9]/g, "");
    return digits ? BigInt(digits) : 0n;
  })();
  const preview = grossIdr > 0n ? distributionView(grossIdr, feeBp, holdersOf(partition)) : null;

  return (
    <Card title="Distributions">
      <p className="supporting-copy">
        A generic funded-distribution rail. Anora's own note is zero-coupon — its return is the
        discount, already priced in — so a coupon here is separately funded cash and never an extra
        return on the warehouse note.
      </p>

      <div className="subscribe-fields">
        <label>
          <span>Kind</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as ScheduledDistribution["kind"])}>
            <option>Coupon</option><option>Dividend</option><option>Royalty</option>
          </select>
        </label>
        <label>
          <span>Partition</span>
          <select value={partition} onChange={(event) => setPartition(event.target.value as TrancheName)}>
            <option value="SENIOR">Senior</option><option value="JUNIOR">Junior</option>
          </select>
        </label>
        <label>
          <span>Gross amount (IDR)</span>
          <NumberField value={grossText} onValue={setGrossText} />
        </label>
      </div>

      {preview && (
        <div className="order-book">
          <div className="order-row">
            <span><strong>Servicing fee</strong><small>{pct(feeBp)}, snapshotted on this distribution</small></span>
            <strong>−{rp(preview.feeIdr)}</strong>
          </div>
          <div className="order-row emphasis">
            <span><strong>Net to holders</strong><small>Pro rata on the record-date snapshot</small></span>
            <strong>{rp(preview.netIdr)}</strong>
          </div>
          {preview.entitlements.map((entitlement) => (
            <div className="order-row" key={entitlement.investorId}>
              <span><strong>{nameOf(entitlement.investorId)}</strong><small>{rp(entitlement.unitsIdr)} units at record date</small></span>
              <strong>{rp(entitlement.amountIdr)}</strong>
            </div>
          ))}
          <div className="order-row">
            <span><strong>Rounding dust</strong><small>Sweepable only once every entitlement is accounted for</small></span>
            <strong>{rp(preview.dustIdr)}</strong>
          </div>
        </div>
      )}

      <div className="actions">
        <button type="button" disabled={!preview} onClick={() => {
          if (!preview) return;
          onSchedule({
            id: `DST-${Date.now()}`,
            kind,
            grossIdr,
            servicingFeeBp: feeBp,
            recordDate: new Date().toISOString().slice(0, 10),
            partition,
            executed: false,
          });
          setGrossText("");
        }}>Schedule distribution</button>
      </div>

      {scheduled.length > 0 && (
        <>
          <div className="section-heading"><h3>Scheduled</h3></div>
          <div className="order-book">
            {scheduled.map((item) => {
              const result = distributionView(item.grossIdr, item.servicingFeeBp, holdersOf(item.partition));
              return (
                <div className="order-row" key={item.id}>
                  <span>
                    <strong>{item.kind} · {item.partition === "SENIOR" ? "Senior" : "Junior"}</strong>
                    <small>
                      Record date {item.recordDate} · {pct(item.servicingFeeBp)} fee snapshotted ·
                      {" "}{rp(result.feeIdr)} fee, {rp(result.netIdr)} net
                    </small>
                  </span>
                  <span>
                    <Badge tone={item.executed ? "success" : "neutral"}>{item.executed ? "Executed" : "Scheduled"}</Badge>
                    {!item.executed && (
                      <button type="button" className="text-button" onClick={() => onExecute(item.id)}>Execute</button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <Source provenance="local" />
    </Card>
  );
}

/* ── Secondary sale quote ──────────────────────────────────────────────── */

export function SaleQuoteLines({ unitsIdr, grossPriceIdr, feeBp }: {
  unitsIdr: bigint;
  grossPriceIdr: bigint;
  feeBp: bigint;
}) {
  const quote = saleQuote(unitsIdr, grossPriceIdr, feeBp);
  return (
    <dl>
      <div><dt>Face value</dt><dd>{rp(quote.unitsIdr)}</dd></div>
      <div><dt>Sale price</dt><dd>{rp(quote.grossPriceIdr)}</dd></div>
      <div><dt>Transfer fee ({pct(quote.feeBp)})</dt><dd>−{rp(quote.feeIdr)}</dd></div>
      <div><dt>Seller receives</dt><dd>{rp(quote.sellerReceivesIdr)}</dd></div>
      <div><dt>Buyer pays</dt><dd>{rp(quote.buyerDebitIdr)}</dd></div>
    </dl>
  );
}

